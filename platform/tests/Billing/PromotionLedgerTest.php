<?php

declare(strict_types=1);

namespace Tests\Billing;

use App\Domain\Commerce\Pricing\PromotionLedger;
use Tests\Support\Assert;

/**
 * What discounting cost, and which of it nobody can explain.
 *
 * A discount is recorded as an integer on the order plus a code that may or may not be there.
 * Everything this screen knows is derived from those two fields, which is exactly why the
 * missing-code case matters: it is the only one the shop cannot reconstruct later.
 */
final class PromotionLedgerTest
{
    /** @param array<string, mixed> $overrides */
    private function order(array $overrides = []): array
    {
        return [
            'order' => $overrides['order'] ?? 'WDX-000042',
            'code' => array_key_exists('code', $overrides) ? $overrides['code'] : 'EID10',
            'discount' => $overrides['discount'] ?? 10_000,
            'subtotal' => $overrides['subtotal'] ?? 100_000,
        ];
    }

    public function testOneCodeBecomesOneRow(): void
    {
        $ledger = new PromotionLedger([
            $this->order(['order' => 'A', 'code' => 'EID10', 'discount' => 10_000]),
            $this->order(['order' => 'B', 'code' => 'eid10 ', 'discount' => 30_000]),
        ]);

        $rows = $ledger->byCode();

        Assert::same(1, count($rows), 'case and spaces do not make a second code');
        Assert::same('EID10', $rows[0]['code']);
        Assert::same(2, $rows[0]['uses']);
        Assert::same(40_000, $rows[0]['discount']);
        Assert::same(20_000, $rows[0]['average']);
        Assert::same(30_000, $rows[0]['largest']);
    }

    public function testCodesAreOrderedByWhatTheyCost(): void
    {
        $ledger = new PromotionLedger([
            $this->order(['code' => 'CHEAP', 'discount' => 1_000]),
            $this->order(['code' => 'EXPENSIVE', 'discount' => 90_000, 'subtotal' => 900_000]),
        ]);

        Assert::same(['EXPENSIVE', 'CHEAP'], array_column($ledger->byCode(), 'code'));
    }

    public function testADiscountWithNoCodeIsADiscountNobodyCanSwitchOff(): void
    {
        $ledger = new PromotionLedger([
            $this->order(['order' => 'A', 'code' => null, 'discount' => 25_000]),
            $this->order(['order' => 'B', 'code' => '  ', 'discount' => 5_000]),
            $this->order(['order' => 'C', 'code' => 'EID10', 'discount' => 10_000]),
        ]);

        Assert::same(2, count($ledger->unattributed()));
        Assert::same(30_000, $ledger->summary()['unattributed_amount']);
        Assert::true(str_contains($ledger->warnings()[0], 'no code attached'));
    }

    public function testACodeThatDiscountedNothingLiedToTheCustomer(): void
    {
        $ledger = new PromotionLedger([
            $this->order(['code' => 'EXPIRED5', 'discount' => 0, 'subtotal' => 100_000]),
        ]);

        Assert::same(1, count($ledger->inert()));
        Assert::same(1, $ledger->summary()['inert']);
        Assert::true(str_contains(implode(' ', $ledger->warnings()), 'discounted nothing'));
    }

    public function testAFreeOrderIsNotACoupon(): void
    {
        // Zero subtotal and zero discount with a code is a quote converted, not an inert coupon.
        $ledger = new PromotionLedger([$this->order(['code' => 'GIFT', 'discount' => 0, 'subtotal' => 0])]);

        Assert::same(1, count($ledger->inert()), 'it still carries a code that did nothing');
        Assert::same(0, count($ledger->impossible()), 'but it is not impossible, only useless');
    }

    public function testADiscountBiggerThanTheGoodsIsImpossible(): void
    {
        $ledger = new PromotionLedger([$this->order(['code' => 'OOPS', 'discount' => 150_000, 'subtotal' => 100_000])]);

        Assert::same(1, count($ledger->impossible()));
        Assert::true(str_contains(implode(' ', $ledger->warnings()), 'larger than the goods'));
    }

    public function testTheRateIsMeasuredAgainstThePriceBeforeTheDiscount(): void
    {
        // ₨10,000 off ₨100,000 of goods means the gross was ₨110,000 and 9.1% was given away.
        // Dividing by the discounted total would report 10% and overstate the promotion.
        $ledger = new PromotionLedger([$this->order(['discount' => 10_000, 'subtotal' => 100_000])]);

        Assert::same(110_000, $ledger->summary()['gross']);
        Assert::same(909, $ledger->summary()['rate_bp']);
    }

    public function testTheSummaryCountsUsesAndCodesSeparately(): void
    {
        $ledger = new PromotionLedger([
            $this->order(['order' => 'A', 'code' => 'EID10', 'discount' => 10_000]),
            $this->order(['order' => 'B', 'code' => 'EID10', 'discount' => 10_000]),
            $this->order(['order' => 'C', 'code' => 'WINTER', 'discount' => 20_000]),
            $this->order(['order' => 'D', 'code' => null, 'discount' => 0]),
        ]);

        $summary = $ledger->summary();

        Assert::same(3, $summary['uses'], 'three orders carried a code');
        Assert::same(2, $summary['codes'], 'across two codes');
        Assert::same(40_000, $summary['discount']);
        Assert::same(0, $summary['unattributed'], 'an order discounted nothing is not unattributed money');
    }

    public function testAnEmptyLedgerIsNotADivisionByZero(): void
    {
        $ledger = new PromotionLedger([]);

        Assert::same(0, $ledger->summary()['rate_bp']);
        Assert::same([], $ledger->byCode());
        Assert::same([], $ledger->warnings());
    }

    public function testACleanPromotionSaysNothing(): void
    {
        $ledger = new PromotionLedger([
            $this->order(['order' => 'A', 'code' => 'EID10', 'discount' => 10_000]),
            $this->order(['order' => 'B', 'code' => 'EID10', 'discount' => 20_000]),
        ]);

        Assert::same([], $ledger->warnings());
    }
}
