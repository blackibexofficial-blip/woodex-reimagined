<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Billing;

/**
 * What an invoice is actually owed, and what to call that state.
 *
 * An invoice row stores a status string, and that string is a liability: it is written once at
 * issue and then never touched again, so a customer who paid in full three weeks ago still
 * reads "issued" until somebody remembers to change it. Meanwhile the money is right there —
 * `total_minor`, the order's `paid_minor`, its `refunded_minor` — and it is the only source
 * that cannot disagree with itself.
 *
 * So the status is *derived*, never trusted. This object is the single place that decides what
 * "paid" means, and it is arithmetic on integers, which means it can be tested without a
 * database and without a browser.
 *
 * Three states, in precedence order:
 *
 *   void      — cancelled paperwork; whatever the money says, it is not a claim any more
 *   paid      — the full amount has been received
 *   part_paid — something, but not all of it
 *   issued    — nothing received yet
 *
 * "Overdue" is a separate axis, not a fourth state: a void invoice cannot be overdue, an
 * unpaid one can, and a paid one no longer has a deadline that means anything.
 */
final readonly class InvoiceBalance
{
    public const string VOID = 'void';

    public const string PAID = 'paid';

    public const string PART_PAID = 'part_paid';

    public const string ISSUED = 'issued';

    public function __construct(
        public int $totalMinor,
        public int $paidMinor,
        public int $refundedMinor = 0,
        public bool $isVoid = false,
        public ?int $daysUntilDue = null,
    ) {}

    /**
     * Money received, net of refunds.
     *
     * A refund is not a payment: refunding ₨5,000 of a paid ₨50,000 invoice leaves ₨5,000
     * outstanding again, which is exactly what should happen and exactly what a naive
     * `paid_minor` column would get wrong.
     */
    public function netPaidMinor(): int
    {
        return max(0, $this->paidMinor - $this->refundedMinor);
    }

    /** What is still owed. Never negative, however odd the rows are. */
    public function outstandingMinor(): int
    {
        return max(0, $this->totalMinor - $this->netPaidMinor());
    }

    public function isSettled(): bool
    {
        return ! $this->isVoid && $this->totalMinor > 0 && $this->outstandingMinor() === 0;
    }

    public function status(): string
    {
        if ($this->isVoid) {
            return self::VOID;
        }

        // A zero-value invoice is settled the moment it is issued; there is nothing to chase.
        if ($this->totalMinor === 0) {
            return self::PAID;
        }

        if ($this->outstandingMinor() === 0) {
            return self::PAID;
        }

        return $this->netPaidMinor() > 0 ? self::PART_PAID : self::ISSUED;
    }

    public function isOverdue(): bool
    {
        return ! $this->isVoid
            && $this->outstandingMinor() > 0
            && $this->daysUntilDue !== null
            && $this->daysUntilDue < 0;
    }

    /** Days past the due date, or zero when it is not overdue. */
    public function daysOverdue(): int
    {
        return $this->isOverdue() ? abs((int) $this->daysUntilDue) : 0;
    }

    public function label(): string
    {
        return match (true) {
            $this->isVoid => 'Void',
            $this->isOverdue() => 'Overdue',
            $this->status() === self::PAID => 'Paid',
            $this->status() === self::PART_PAID => 'Part paid',
            default => 'Issued',
        };
    }

    /** The badge tone the admin shell understands. */
    public function tone(): string
    {
        return match ($this->status()) {
            self::VOID => 'neutral',
            self::PAID => 'success',
            self::PART_PAID => $this->isOverdue() ? 'error' : 'warning',
            default => $this->isOverdue() ? 'error' : 'info',
        };
    }

    /**
     * Which overdue column this invoice belongs in.
     *
     * 0–30, 31–60, 61–90, 90+. An accountant asking "how much is stale" wants buckets, not a
     * list; the screen uses this to summarise without fetching every row into PHP.
     */
    public function bucket(): string
    {
        if (! $this->isOverdue()) {
            return 'current';
        }

        $days = $this->daysOverdue();

        return match (true) {
            $days <= 30 => '0-30',
            $days <= 60 => '31-60',
            $days <= 90 => '61-90',
            default => '90+',
        };
    }

    /**
     * Whether the paperwork should say "paid" out loud.
     *
     * Deliberately stricter than `isSettled()`: a customer who paid by bank transfer is paid,
     * but a cash-on-delivery invoice is only collected after the van has been — and an invoice
     * stamped PAID in advance of that is the kind of document a dispute turns on.
     */
    public function mayStampPaid(bool $isCashOnDelivery): bool
    {
        if ($this->isVoid || $this->totalMinor === 0) {
            return false;
        }

        return ! $isCashOnDelivery && $this->outstandingMinor() === 0;
    }
}
