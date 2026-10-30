<?php

declare(strict_types=1);

namespace Tests\Commerce;

use App\Domain\Commerce\Support\Money;
use InvalidArgumentException;
use Tests\Support\Assert;

/**
 * The arithmetic the whole system stands on. If a rule here changes, every invoice ever
 * issued becomes suspect — which is why these are the first tests written and the last
 * ones allowed to fail.
 */
final class MoneyTest
{
    public function testItRepresentsMinorUnitsAndFormatsThem(): void
    {
        $m = new Money(4_250_000, 'PKR');

        Assert::same('42500.00', $m->toDecimal(), 'decimal form');
        Assert::same('PKR 42,500.00', $m->format(), 'formatted form');
        Assert::same(4_250_000, Money::fromUnits(42_500)->minor, 'from units');
    }

    public function testAdditionAndSubtractionKeepTheCurrency(): void
    {
        $a = new Money(100_00, 'PKR');
        $b = new Money(250_00, 'PKR');

        Assert::same(350_00, $a->plus($b)->minor, 'sum');
        Assert::same(-150_00, $a->minus($b)->minor, 'difference');
        Assert::same('PKR', $a->plus($b)->currency, 'currency preserved');
    }

    public function testItRefusesToMixCurrencies(): void
    {
        Assert::throws(
            InvalidArgumentException::class,
            static fn () => (new Money(100, 'PKR'))->plus(new Money(100, 'USD')),
            'mixing PKR and USD',
        );
    }

    public function testPercentageRoundsHalfUp(): void
    {
        // 18 % of 3 333.25 = 599.985 → half-up 599.99
        Assert::same(59_999, (new Money(333_325))->percentage(1800)->minor, '18 % half-up up');
        // 18 % of 3 333.24 = 599.9832 → 599.98
        Assert::same(59_998, (new Money(333_324))->percentage(1800)->minor, '18 % rounds down');
        // exactly .5 rounds up
        Assert::same(50, (new Money(100))->percentage(5000)->minor, '5.00 % of 10.00');
    }

    public function testInclusiveTaxIsExtractedNotAdded(): void
    {
        $gross = new Money(1_180_000);

        Assert::same(180_000, $gross->taxPortionOfInclusive(1800)->minor, '18 % inside 11 800');
        Assert::same(180_000, $gross->taxPortionOfInclusive(1800)->minor, 'repeatable');
        Assert::same(
            1_000_000,
            $gross->minus($gross->taxPortionOfInclusive(1800))->minor,
            'net of tax',
        );
    }

    public function testAllocateNeverLosesOrInventsAPaisa(): void
    {
        $parts = (new Money(100_000))->allocate([1, 2, 4]);

        Assert::same([14_286, 28_571, 57_143], array_map(static fn (Money $m): int => $m->minor, $parts), '1:2:4');
        Assert::same(100_000, Money::sum($parts)->minor, 'sum preserved');
    }

    public function testAllocateHandlesEqualWeightsAndOddAmounts(): void
    {
        $parts = (new Money(100))->allocate([1, 1, 1]);

        Assert::same(100, Money::sum($parts)->minor, 'sum preserved with a remainder of 1');
        Assert::same([34, 33, 33], array_map(static fn (Money $m): int => $m->minor, $parts), 'largest remainder wins');
    }

    public function testAllocateWithZeroWeightsPutsEverythingInOneSlot(): void
    {
        $parts = (new Money(500))->allocate([0, 0]);

        Assert::same(500, Money::sum($parts)->minor, 'nothing lost');
    }

    public function testMinCapsAtWhatIsOwed(): void
    {
        $owed = new Money(300_000);
        $wanted = new Money(500_000);

        Assert::same(300_000, $wanted->min($owed)->minor, 'discount capped at the amount owed');
        Assert::same(300_000, $owed->min($wanted)->minor, 'symmetric');
    }

    public function testBasisPointsOfIsIntegerSafe(): void
    {
        Assert::same(1500, (new Money(900_000))->basisPointsOf(new Money(6_000_000)), '900 000 of 6 000 000 is 15 %');
        Assert::same(0, (new Money(5))->basisPointsOf(new Money(0)), 'no division by zero');
        Assert::same(10_000, (new Money(42))->basisPointsOf(new Money(42)), '100 %');
    }

    public function testSumOfManyAmounts(): void
    {
        Assert::same(60_000, Money::sum([new Money(10_000), new Money(20_000), new Money(30_000)])->minor, 'sum');
        Assert::same(0, Money::sum([])->minor, 'empty sum is zero');
    }
}
