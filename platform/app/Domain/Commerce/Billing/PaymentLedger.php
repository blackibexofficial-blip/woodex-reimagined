<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Billing;

/**
 * One payment against one order, with the two facts the row cannot state about itself.
 *
 * `commerce_payments` records what somebody attempted: a gateway, an amount, a reference and a
 * status. What it cannot record is whether that attempt is *the* payment — whether the same
 * bank reference has been claimed by a second row, or whether the amount matches what the
 * order says was received. Those are comparisons across rows, and they are the whole reason a
 * payments screen exists rather than a payments table.
 *
 * Three states matter to the person doing the checking, and they are not the same question:
 *
 * - **Pending** (bank): money may already be in the account. Somebody has to look.
 * - **Drift**: the order's `paid_minor` disagrees with the sum of its paid payments. One of
 *   the two is wrong, and until it is fixed the invoice screen and this one disagree.
 * - **Duplicate**: two rows claim the same reference. Usually a customer paying twice, or an
 *   operator clicking twice; occasionally one payment entered against two orders.
 */
final readonly class PaymentLedger
{
    /** Money is in the shop's account; a human just has to agree. */
    public const string AWAITING = 'awaiting';

    /** The order counter and the payment rows disagree. */
    public const string DRIFT = 'drift';

    /** The same reference appears on more than one row. */
    public const string DUPLICATE = 'duplicate';

    /** A payment larger than the order it belongs to. */
    public const string OVERPAID = 'overpaid';

    public const string SETTLED = 'settled';

    /**
     * @param  list<array{id: int|string, order: string, gateway: string, reference: ?string, amount: int, status: string, paid_at: ?string}>  $payments
     * @param  array<string, array{total: int, recorded: int}>  $orders  keyed by order number: grand total and `paid_minor`
     */
    public function __construct(
        public array $payments = [],
        public array $orders = [],
    ) {}

    /**
     * Group payments by the order they belong to, and compare against what the order claims.
     *
     * `recorded` is `commerce_orders.paid_minor` — the number the invoice screen reads. The
     * comparison is not pedantry: if a bank transfer is confirmed on the payment row and the
     * order is not updated, the invoice keeps chasing a customer who has already paid.
     *
     * @return list<array{order: string, received: int, recorded: int, difference: int, payments: list<array<string, mixed>>}>
     */
    public function byOrder(): array
    {
        $grouped = [];

        foreach ($this->payments as $payment) {
            $grouped[(string) $payment['order']][] = $payment;
        }

        $rows = [];

        foreach ($grouped as $number => $payments) {
            $received = 0;

            foreach ($payments as $payment) {
                if ($payment['status'] === 'paid') {
                    $received += (int) $payment['amount'];
                }
            }

            $recorded = (int) ($this->orders[$number]['recorded'] ?? 0);

            $rows[] = [
                'order' => (string) $number,
                'received' => $received,
                'recorded' => $recorded,
                'difference' => $received - $recorded,
                'payments' => $payments,
            ];
        }

        usort($rows, static fn (array $a, array $b): int => [$b['difference'], $a['order']] <=> [$a['difference'], $b['order']]);

        return $rows;
    }

    /** @return list<array<string, mixed>> bank transfers nobody has confirmed yet */
    public function awaitingVerification(): array
    {
        return array_values(array_filter(
            $this->payments,
            static fn (array $payment): bool => $payment['status'] === 'pending'
                && $payment['gateway'] !== 'cod',
        ));
    }

    /**
     * References claimed by more than one payment.
     *
     * Cash on delivery has no reference worth comparing — a rider's receipt number is written
     * by hand and reused freely — so only electronic references are compared, and blanks are
     * ignored rather than all colliding with each other.
     *
     * @return array<string, list<array<string, mixed>>>
     */
    public function duplicateReferences(): array
    {
        $seen = [];

        foreach ($this->payments as $payment) {
            $reference = trim((string) ($payment['reference'] ?? ''));

            if ($reference === '' || $payment['gateway'] === 'cod') {
                continue;
            }

            $seen[strtoupper($reference)][] = $payment;
        }

        return array_filter($seen, static fn (array $rows): bool => count($rows) > 1);
    }

    /** @return list<array{order: string, over: int}> */
    public function overpayments(): array
    {
        $over = [];

        foreach ($this->byOrder() as $row) {
            $total = (int) ($this->orders[$row['order']]['total'] ?? 0);

            if ($total > 0 && $row['received'] > $total) {
                $over[] = ['order' => $row['order'], 'over' => $row['received'] - $total];
            }
        }

        return $over;
    }

    /**
     * What one payment row is, for the badge.
     *
     * Precedence again: a duplicate reference outranks drift, because a duplicate is a fact
     * about the money and drift is a fact about the bookkeeping.
     */
    public function stateFor(array $payment): string
    {
        if ($payment['status'] === 'pending' && $payment['gateway'] !== 'cod') {
            return self::AWAITING;
        }

        $reference = strtoupper(trim((string) ($payment['reference'] ?? '')));

        if ($reference !== '' && isset($this->duplicateReferences()[$reference])) {
            return self::DUPLICATE;
        }

        if ($payment['status'] === 'paid' && $this->differenceFor((string) $payment['order']) !== 0) {
            return self::DRIFT;
        }

        if ($payment['status'] === 'paid' && $this->isOverpaid((string) $payment['order'])) {
            return self::OVERPAID;
        }

        return self::SETTLED;
    }

    /**
     * Every payment's state, computed once.
     *
     * `stateFor()` re-scans all the rows to answer about one of them, which is fine for a
     * single lookup and quadratic in a table. The screen asks this instead and hands the
     * result to the view.
     *
     * @return array<int|string, string> keyed by payment id
     */
    public function states(): array
    {
        $duplicates = $this->duplicateReferences();
        $difference = [];
        $over = [];

        foreach ($this->byOrder() as $row) {
            $difference[$row['order']] = $row['difference'];
        }

        foreach ($this->overpayments() as $row) {
            $over[$row['order']] = true;
        }

        $states = [];

        foreach ($this->payments as $payment) {
            $order = (string) $payment['order'];
            $reference = strtoupper(trim((string) ($payment['reference'] ?? '')));

            if ($payment['status'] === 'pending' && $payment['gateway'] !== 'cod') {
                $states[$payment['id']] = self::AWAITING;
            } elseif ($reference !== '' && isset($duplicates[$reference])) {
                $states[$payment['id']] = self::DUPLICATE;
            } elseif ($payment['status'] === 'paid' && ($difference[$order] ?? 0) !== 0) {
                $states[$payment['id']] = self::DRIFT;
            } elseif ($payment['status'] === 'paid' && isset($over[$order])) {
                $states[$payment['id']] = self::OVERPAID;
            } else {
                $states[$payment['id']] = self::SETTLED;
            }
        }

        return $states;
    }

    /** The gap between what the payment rows say and what the order says, for one order. */
    public function differenceFor(string $order): int
    {
        $received = 0;

        foreach ($this->payments as $payment) {
            if ((string) $payment['order'] === $order && $payment['status'] === 'paid') {
                $received += (int) $payment['amount'];
            }
        }

        return $received - (int) ($this->orders[$order]['recorded'] ?? 0);
    }

    private function isOverpaid(string $order): bool
    {
        $total = (int) ($this->orders[$order]['total'] ?? 0);

        if ($total === 0) {
            return false;
        }

        $received = 0;

        foreach ($this->payments as $payment) {
            if ((string) $payment['order'] === $order && $payment['status'] === 'paid') {
                $received += (int) $payment['amount'];
            }
        }

        return $received > $total;
    }

    /**
     * @return array{pending: int, pending_amount: int, received: int, drift: int, duplicates: int, overpaid: int, cod_pending: int, orders: int}
     */
    public function summary(): array
    {
        $awaiting = $this->awaitingVerification();
        $pendingAmount = 0;

        foreach ($awaiting as $payment) {
            $pendingAmount += (int) $payment['amount'];
        }

        $received = 0;
        $codPending = 0;

        foreach ($this->payments as $payment) {
            if ($payment['status'] === 'paid') {
                $received += (int) $payment['amount'];
            } elseif ($payment['status'] === 'pending' && $payment['gateway'] === 'cod') {
                $codPending += (int) $payment['amount'];
            }
        }

        $drift = 0;

        foreach ($this->byOrder() as $row) {
            if ($row['difference'] !== 0) {
                $drift++;
            }
        }

        return [
            'pending' => count($awaiting),
            'pending_amount' => $pendingAmount,
            'received' => $received,
            'drift' => $drift,
            'duplicates' => count($this->duplicateReferences()),
            'overpaid' => count($this->overpayments()),
            'cod_pending' => $codPending,
            'orders' => count($this->orders),
        ];
    }

    /** @return list<string> */
    public function warnings(): array
    {
        $warnings = [];
        $summary = $this->summary();

        if ($summary['pending'] > 0) {
            $warnings[] = $summary['pending'] === 1
                ? '1 bank transfer is waiting to be checked against the account.'
                : $summary['pending'].' bank transfers are waiting to be checked against the account.';
        }

        if ($summary['drift'] > 0) {
            $warnings[] = $summary['drift'] === 1
                ? '1 order has payments and a recorded total that do not agree. The invoice screen is reading the recorded number.'
                : $summary['drift'].' orders have payments and recorded totals that do not agree. The invoice screen is reading the recorded number.';
        }

        if ($summary['duplicates'] > 0) {
            $warnings[] = $summary['duplicates'] === 1
                ? '1 reference is claimed by more than one payment.'
                : $summary['duplicates'].' references are claimed by more than one payment.';
        }

        return $warnings;
    }
}
