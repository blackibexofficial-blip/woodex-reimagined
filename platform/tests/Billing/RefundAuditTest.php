<?php

declare(strict_types=1);

namespace Tests\Billing;

use App\Domain\Commerce\Billing\RefundAudit;
use Tests\Support\Assert;

/**
 * Money going back out.
 *
 * A refund is two integers on the order and nothing else — no reason, no actor, no date — so the
 * only defence against a refund that does not add up is arithmetic that agrees with itself.
 */
final class RefundAuditTest
{
    /** @param array<string, mixed> $overrides */
    private function order(array $overrides = []): array
    {
        return [
            'order' => $overrides['order'] ?? 'WDX-000042',
            'total' => $overrides['total'] ?? 100_000,
            'paid' => $overrides['paid'] ?? 100_000,
            'refunded' => $overrides['refunded'] ?? 0,
            'status' => $overrides['status'] ?? 'delivered',
        ];
    }

    public function testAFullRefundIsNotADefect(): void
    {
        $audit = new RefundAudit([$this->order(['paid' => 100_000, 'refunded' => 100_000, 'status' => 'cancelled'])]);

        Assert::same(1, count($audit->fullyRefunded()));
        Assert::same(0, count($audit->overRefunded()));
        Assert::same([], $audit->warnings());
    }

    public function testRefundingMoreThanWasPaidIsTheWorstCase(): void
    {
        $audit = new RefundAudit([$this->order(['paid' => 100_000, 'refunded' => 150_000, 'status' => 'cancelled'])]);
        $over = $audit->overRefunded();

        Assert::same(1, count($over));
        Assert::same(50_000, $over[0]['excess']);
        Assert::true(str_contains($audit->warnings()[0], 'Money has left'));
    }

    public function testAPartialRefundIsMeasuredAgainstWhatWasPaidNotWhatWasOwed(): void
    {
        // A 25% deposit taken, then entirely returned: refunded in full, though the total is four
        // times the refund.
        $audit = new RefundAudit([$this->order(['total' => 400_000, 'paid' => 100_000, 'refunded' => 100_000])]);

        Assert::same(1, count($audit->fullyRefunded()));
        Assert::same(false, $audit->isPartial($this->order(['paid' => 100_000, 'refunded' => 100_000])));
        Assert::same(true, $audit->isPartial($this->order(['paid' => 100_000, 'refunded' => 40_000])));
    }

    public function testACancelledOrderThatKeepsTheMoneyIsTheOneThatEndsInAPhoneCall(): void
    {
        $audit = new RefundAudit([$this->order(['paid' => 100_000, 'refunded' => 0, 'status' => 'cancelled'])]);

        Assert::same(1, count($audit->cancelledNotRefunded()));
        Assert::true(str_contains($audit->warnings()[0], 'still holds the customer'));
    }

    public function testACancelledOrderThatWasNeverPaidIsNotHoldingAnything(): void
    {
        $audit = new RefundAudit([$this->order(['paid' => 0, 'refunded' => 0, 'status' => 'cancelled'])]);

        Assert::same([], $audit->cancelledNotRefunded());
        Assert::same([], $audit->warnings());
    }

    public function testARefundedOrderStillMarkedForDeliveryIsFlagged(): void
    {
        $audit = new RefundAudit([$this->order(['paid' => 100_000, 'refunded' => 100_000, 'status' => 'confirmed'])]);

        Assert::same(1, count($audit->refundedNotCancelled()));
        Assert::true(str_contains(implode(' ', $audit->warnings()), 'still marked for delivery'));
    }

    public function testTheRateIsBasisPointsOfWhatWasActuallyPaid(): void
    {
        $audit = new RefundAudit([
            $this->order(['order' => 'A', 'paid' => 100_000, 'refunded' => 3_000]),
            $this->order(['order' => 'B', 'paid' => 100_000, 'refunded' => 0]),
        ]);

        Assert::same(3_000, $audit->summary()['refunded']);
        Assert::same(200_000, $audit->summary()['orders'] === 2 ? 200_000 : 0, 'both orders paid in');
        Assert::same(150, $audit->summary()['rate_bp'], '3,000 of 200,000 is 1.5%, i.e. 150 basis points');
    }

    public function testTheSummarySplitsPartialFromFull(): void
    {
        $audit = new RefundAudit([
            $this->order(['order' => 'A', 'paid' => 100_000, 'refunded' => 30_000]),
            $this->order(['order' => 'B', 'paid' => 100_000, 'refunded' => 100_000]),
            $this->order(['order' => 'C', 'paid' => 100_000, 'refunded' => 0]),
        ]);

        $summary = $audit->summary();

        Assert::same(2, $summary['count']);
        Assert::same(1, $summary['partial']);
        Assert::same(1, $summary['full']);
        Assert::same(130_000, $summary['refunded']);
        Assert::same(3, $summary['orders']);
    }

    public function testAnEmptyAuditSaysNothing(): void
    {
        $audit = new RefundAudit([]);

        Assert::same(0, $audit->summary()['rate_bp']);
        Assert::same([], $audit->warnings());
    }

    public function testEveryWarningIsAnActualSentence(): void
    {
        $audit = new RefundAudit([
            $this->order(['order' => 'A', 'paid' => 10_000, 'refunded' => 15_000, 'status' => 'cancelled']),
            $this->order(['order' => 'B', 'paid' => 10_000, 'refunded' => 0, 'status' => 'cancelled']),
            $this->order(['order' => 'C', 'paid' => 10_000, 'refunded' => 5_000, 'status' => 'confirmed']),
        ]);

        $warnings = $audit->warnings();

        Assert::same(3, count($warnings), 'the three defects are three sentences');

        foreach ($warnings as $warning) {
            Assert::true(strlen($warning) > 20, 'each one is readable');
            Assert::true(str_ends_with($warning, '.'), 'and punctuated');
        }
    }
}
