<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Billing;

/**
 * Money going back out, and the three ways that goes wrong.
 *
 * There is no refunds table. A refund is two numbers on the order — `refunded_minor` and,
 * usually, a status of `cancelled` — which means the shop's record of giving money back is a
 * single integer with no reason attached and no guarantee it agrees with anything else.
 *
 * Three disagreements are worth catching, and all three are silent:
 *
 * - **Refunded more than was paid.** Money has left that never arrived. Either the refund was
 *   entered twice or the payment was never recorded.
 * - **Refunded but not cancelled.** The money is back with the customer and the order still
 *   says it is going to be delivered.
 * - **Cancelled but not refunded.** The order is dead and the customer's money is still here.
 *   This is the one that ends in a phone call.
 */
final readonly class RefundAudit
{
    /**
     * @param  list<array{order: string, total: int, paid: int, refunded: int, status: string}>  $orders
     */
    public function __construct(public array $orders = []) {}

    /** @return list<array{order: string, paid: int, refunded: int, excess: int}> */
    public function overRefunded(): array
    {
        $rows = [];

        foreach ($this->orders as $order) {
            $refunded = (int) $order['refunded'];
            $paid = (int) $order['paid'];

            if ($refunded > $paid) {
                $rows[] = [
                    'order' => (string) $order['order'],
                    'paid' => $paid,
                    'refunded' => $refunded,
                    'excess' => $refunded - $paid,
                ];
            }
        }

        return $rows;
    }

    /** @return list<array<string, mixed>> money returned, order still live */
    public function refundedNotCancelled(): array
    {
        return array_values(array_filter(
            $this->orders,
            static fn (array $order): bool => (int) $order['refunded'] > 0 && $order['status'] !== 'cancelled',
        ));
    }

    /** @return list<array<string, mixed>> order dead, money still held */
    public function cancelledNotRefunded(): array
    {
        return array_values(array_filter(
            $this->orders,
            static fn (array $order): bool => $order['status'] === 'cancelled'
                && (int) $order['paid'] > 0
                && (int) $order['refunded'] === 0,
        ));
    }

    /** @return list<array<string, mixed>> */
    public function refunded(): array
    {
        return array_values(array_filter(
            $this->orders,
            static fn (array $order): bool => (int) $order['refunded'] > 0,
        ));
    }

    /**
     * Refunded in full: everything that arrived went back.
     *
     * Compared against what was paid, not against the order total — a customer who paid a 25%
     * deposit and then cancelled has been refunded in full even though the total says otherwise.
     */
    public function fullyRefunded(): array
    {
        return array_values(array_filter(
            $this->orders,
            static fn (array $order): bool => (int) $order['refunded'] > 0
                && (int) $order['paid'] > 0
                && (int) $order['refunded'] >= (int) $order['paid'],
        ));
    }

    public function isPartial(array $order): bool
    {
        return (int) $order['refunded'] > 0 && (int) $order['refunded'] < (int) $order['paid'];
    }

    /**
     * @return array{refunded: int, count: int, partial: int, full: int, over: int, cancelled_unpaid: int, rate_bp: int, orders: int}
     */
    public function summary(): array
    {
        $refunded = 0;
        $count = 0;
        $partial = 0;
        $full = 0;
        $paid = 0;

        foreach ($this->orders as $order) {
            $paid += (int) $order['paid'];

            if ((int) $order['refunded'] > 0) {
                $refunded += (int) $order['refunded'];
                $count++;
                $this->isPartial($order) ? $partial++ : $full++;
            }
        }

        return [
            'refunded' => $refunded,
            'count' => $count,
            'partial' => $partial,
            'full' => $full,
            'over' => count($this->overRefunded()),
            'cancelled_unpaid' => count($this->cancelledNotRefunded()),
            // Basis points, because "3% refunded" is a number a shop reasons about and
            // "PKR 41,900 of PKR 1,083,800" is a number it reads once.
            'rate_bp' => $paid === 0 ? 0 : (int) round($refunded * 10000 / $paid),
            'orders' => count($this->orders),
        ];
    }

    /** @return list<string> */
    public function warnings(): array
    {
        $warnings = [];
        $summary = $this->summary();

        if ($summary['over'] > 0) {
            $warnings[] = $summary['over'] === 1
                ? '1 order was refunded more than it was ever paid. Money has left that never arrived.'
                : $summary['over'].' orders were refunded more than they were ever paid.';
        }

        if ($summary['cancelled_unpaid'] > 0) {
            $warnings[] = $summary['cancelled_unpaid'] === 1
                ? '1 cancelled order still holds the customer\'s money.'
                : $summary['cancelled_unpaid'].' cancelled orders still hold the customer\'s money.';
        }

        $notCancelled = count($this->refundedNotCancelled());

        if ($notCancelled > 0) {
            $warnings[] = $notCancelled === 1
                ? '1 refunded order is still marked for delivery.'
                : $notCancelled.' refunded orders are still marked for delivery.';
        }

        return $warnings;
    }
}
