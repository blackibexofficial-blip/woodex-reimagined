<?php

declare(strict_types=1);

namespace Tests\Billing;

use App\Domain\Commerce\Pricing\ChargeAudit;
use Tests\Support\Assert;

/**
 * Shipping and tax, checked against the rule rather than recalculated.
 *
 * The only reason this exists is that an order stores what it was charged, and a charge that
 * disagrees with the rate is either older than the rate — fine — or wrong — not fine. The audit
 * separates the two.
 */
final class ChargeAuditTest
{
    /** @param array<string, mixed> $overrides */
    private function order(array $overrides = []): array
    {
        return [
            'order' => $overrides['order'] ?? 'WDX-000042',
            'net' => $overrides['net'] ?? 100_000,
            'tax' => $overrides['tax'] ?? 18_000,
            'shipping' => $overrides['shipping'] ?? 250_000,
            'placed_at' => $overrides['placed_at'] ?? '2026-10-30',
        ];
    }

    public function testEighteenPercentIsComputedOnIntegerPaisa(): void
    {
        $audit = new ChargeAudit([]);

        Assert::same(18_000, $audit->expectedTax(100_000));
        Assert::same(18, $audit->expectedTax(100), '₨1 of goods carries 18 paisa');
        Assert::same(2, $audit->expectedTax(10), 'and half a paisa rounds');
    }

    public function testTaxInclusivePricesAreNotTaxedTwice(): void
    {
        $audit = new ChargeAudit(pricesIncludeTax: true);

        // ₨1,180 inclusive is ₨1,000 of goods and ₨180 of tax — not ₨212.40.
        Assert::same(18_000, $audit->expectedTax(118_000));
        Assert::same(15_254, $audit->expectedTax(100_000));
    }

    public function testDeliveryIsFreeAtTheThresholdAndNotOneRupeeBelow(): void
    {
        $audit = new ChargeAudit(freeOverMinor: 20_000_000, deliveryMinor: 250_000);

        Assert::same(250_000, $audit->expectedShipping(19_999_999));
        Assert::same(0, $audit->expectedShipping(20_000_000));
        Assert::same(0, $audit->expectedShipping(50_000_000));
    }

    public function testAnOrderThatMatchesTheRulesIsQuiet(): void
    {
        $audit = new ChargeAudit([$this->order(['net' => 100_000, 'tax' => 18_000, 'shipping' => 250_000])]);

        Assert::same([], $audit->taxMismatches());
        Assert::same([], $audit->shippingMismatches());
        Assert::same([], $audit->warnings());
    }

    public function testTaxEditedByHandIsFound(): void
    {
        $audit = new ChargeAudit([$this->order(['tax' => 15_000])]);
        $rows = $audit->taxMismatches();

        Assert::same(1, count($rows));
        Assert::same(18_000, $rows[0]['expected']);
        Assert::same(-3_000, $rows[0]['difference']);
        Assert::same(1, $audit->summary()['tax_errors']);
    }

    public function testDeliveryChargedOnAFreeOrderIsFound(): void
    {
        $audit = new ChargeAudit([$this->order(['net' => 25_000_000, 'tax' => 4_500_000, 'shipping' => 250_000])]);
        $rows = $audit->shippingMismatches();

        Assert::same(1, count($rows));
        Assert::same(0, $rows[0]['expected']);
        Assert::true(str_contains($audit->warnings()[0], 'charged delivery'));
    }

    public function testDeliveryWaivedBelowTheThresholdIsAlsoFound(): void
    {
        // The opposite mistake: somebody comped the delivery without saying so.
        $audit = new ChargeAudit([$this->order(['net' => 100_000, 'tax' => 18_000, 'shipping' => 0])]);

        Assert::same(1, count($audit->shippingMismatches()));
        Assert::same(-250_000, $audit->shippingMismatches()[0]['difference'], 'the shop is 250,000 paisa down');
    }

    public function testTheEffectiveRateIsWhatTheShopActuallyCharged(): void
    {
        $audit = new ChargeAudit([
            $this->order(['order' => 'A', 'net' => 100_000, 'tax' => 18_000, 'shipping' => 250_000]),
            $this->order(['order' => 'B', 'net' => 200_000, 'tax' => 36_000, 'shipping' => 250_000]),
        ]);

        $summary = $audit->summary();

        Assert::same(54_000, $summary['tax']);
        Assert::same(300_000, $summary['net']);
        Assert::same(1800, $summary['effective_bp'], 'the effective rate is exactly the configured one');
    }

    public function testADriftingEffectiveRateIsVisibleEvenWhenNoSingleOrderIsOff(): void
    {
        // Each order rounds within a paisa of the rate, but together they are one rate apart.
        $audit = new ChargeAudit([
            $this->order(['net' => 9_000_000, 'tax' => 1_500_000, 'shipping' => 0]),
        ]);

        Assert::same(1, count($audit->taxMismatches()));
        Assert::same(1667, $audit->summary()['effective_bp'], 'the shop is charging 16.7%, not 18%');
    }

    public function testAnEmptyAuditSaysNothing(): void
    {
        $audit = new ChargeAudit([]);

        Assert::same(0, $audit->summary()['effective_bp']);
        Assert::same([], $audit->warnings());
    }

    public function testFreeOrdersAreCountedBecauseTheyAreTheThresholdWorking(): void
    {
        $audit = new ChargeAudit([
            $this->order(['order' => 'A', 'net' => 25_000_000, 'tax' => 4_500_000, 'shipping' => 0]),
            $this->order(['order' => 'B', 'net' => 100_000, 'tax' => 18_000, 'shipping' => 250_000]),
        ]);

        Assert::same(1, $audit->summary()['free']);
        Assert::same([], $audit->warnings(), 'free delivery above the threshold is not a mismatch');
    }
}
