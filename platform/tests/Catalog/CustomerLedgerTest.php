<?php

declare(strict_types=1);

namespace Tests\Catalog;

use App\Domain\Commerce\Customers\CustomerLedger;
use App\Domain\Commerce\Customers\PhoneNumber;
use Tests\Support\Assert;

/**
 * Who the customers are, given that the only identity they have is a phone number.
 *
 * Every case here is a way the same person arrives twice with a different string: a country
 * code, a dash, a trailing space, a landline typed with brackets. A ledger that misses them
 * shows a shop full of one-time buyers who are in fact regulars.
 */
final class CustomerLedgerTest
{
    public function testTheSameNumberTypedThreeWaysIsOneNumber(): void
    {
        $local = PhoneNumber::normalise('0300 1234567');
        $country = PhoneNumber::normalise('+92 300 1234567');
        $zeroZero = PhoneNumber::normalise('0092-300-1234567');

        Assert::same('03001234567', $local);
        Assert::same($local, $country);
        Assert::same($local, $zeroZero);
    }

    public function testBracketsDashesAndSpacesAreNotPartOfTheNumber(): void
    {
        Assert::same('04235771234', PhoneNumber::normalise('(042) 3577-1234'));
        Assert::same('04235771234', PhoneNumber::normalise('+92 (42) 3577 1234'));
        Assert::same('', PhoneNumber::normalise(''));
        Assert::same('', PhoneNumber::normalise('   '));
    }

    /**
     * The landline case, which is the one a naive length check gets wrong.
     *
     * `+92 51 …` leaves eleven digits after the country code is stripped, which is exactly the
     * length of a local mobile — so a `length > 11` guard folds nothing and the same Islamabad
     * number counts as two customers, one of them a business.
     */
    public function testALandlineWrittenWithACountryCodeIsStillTheSameLandline(): void
    {
        Assert::same('0512277889', PhoneNumber::normalise('051 2277889'));
        Assert::same('0512277889', PhoneNumber::normalise('+92 51 227 7889'));
        Assert::same('0512277889', PhoneNumber::normalise('0092-51-2277889'));
        Assert::same(true, PhoneNumber::same('051 2277889', '+92 51 227 7889'));
    }

    public function testTheNumberIsDisplayedTheWayAPersonReadsIt(): void
    {
        Assert::same('0300 1234567', PhoneNumber::format('+923001234567'));
        Assert::same('042 35771234', PhoneNumber::format('04235771234'));
        Assert::same('—', PhoneNumber::format(null));
    }

    public function testPlausibilityIsAboutDiallingNotFormatting(): void
    {
        Assert::same(true, PhoneNumber::isPlausible('+92 300 1234567'));
        Assert::same(true, PhoneNumber::isPlausible('04235771234'));
        Assert::same(false, PhoneNumber::isPlausible('0300'));
        Assert::same(false, PhoneNumber::isPlausible('+92'));
        Assert::same(false, PhoneNumber::isPlausible(''));
    }

    public function testTwoOrdersOnTheSameNumberAreOneCustomer(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Ali Khan', 'phone' => '0300 1234567', 'total' => 100_00, 'paid' => 100_00, 'placed_at' => '2026-09-01'],
            ['name' => 'Ali Khan', 'phone' => '+923001234567', 'total' => 200_00, 'paid' => 0, 'placed_at' => '2026-10-01'],
        ]);

        Assert::same(1, count($ledger->customers()));
        Assert::same(2, $ledger->customers()[0]->orders);
        Assert::same(300_00, $ledger->customers()[0]->lifetimeMinor);
        Assert::same(true, $ledger->customers()[0]->isRepeat());
    }

    public function testTheMostFrequentNameWinsAndTheRestAreKept(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Ali Khan', 'phone' => '03001234567', 'total' => 100],
            ['name' => 'Ali Khan', 'phone' => '03001234567', 'total' => 100],
            ['name' => 'Ahmed Raza', 'phone' => '03001234567', 'total' => 100],
        ]);

        $customer = $ledger->customers()[0];

        Assert::same('Ali Khan', $customer->name);
        Assert::same(['Ahmed Raza'], $customer->aliases);
        Assert::same(true, $customer->hasNameConflict());
    }

    public function testCasingAndSpacingAreNotADisagreement(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Ali  Khan', 'phone' => '03001234567', 'total' => 100],
            ['name' => 'ali khan', 'phone' => '03001234567', 'total' => 100],
        ]);

        $customer = $ledger->customers()[0];

        Assert::same(false, $customer->hasNameConflict(), 'the same person typing badly is not two people');
        Assert::same([], $customer->aliases);
    }

    public function testAnOrderWithoutAPhoneIsCountedRatherThanDropped(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Walk-in', 'phone' => null, 'total' => 500],
            ['name' => 'Ali Khan', 'phone' => '03001234567', 'total' => 900],
        ]);

        Assert::same(1, count($ledger->customers()));
        Assert::same(1, $ledger->summary()['unidentified']);
        Assert::same(2, $ledger->summary()['orders'], 'the total still reconciles with the orders');
    }

    public function testOutstandingIsTheSameArithmeticTheInvoiceScreenUses(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Ali Khan', 'phone' => '03001234567', 'total' => 500_00, 'paid' => 200_00],
        ]);

        Assert::same(300_00, $ledger->customers()[0]->outstandingMinor());
    }

    public function testOverpaymentIsNotNegativeDebt(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Ali Khan', 'phone' => '03001234567', 'total' => 500_00, 'paid' => 500_00, 'refunded' => 0],
            ['name' => 'Ali Khan', 'phone' => '03001234567', 'total' => 100_00, 'paid' => 150_00],
        ]);

        Assert::same(0, $ledger->customers()[0]->outstandingMinor());
    }

    public function testCustomersAreOrderedByWhatTheyAreWorth(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Small', 'phone' => '03001111111', 'total' => 100],
            ['name' => 'Large', 'phone' => '03002222222', 'total' => 900],
            ['name' => 'Middle', 'phone' => '03003333333', 'total' => 500],
        ]);

        Assert::same(
            ['Large', 'Middle', 'Small'],
            array_map(static fn ($customer): string => $customer->name, $ledger->customers()),
        );
    }

    public function testTheFirstAndLastOrderAreTheSpellingsThatSort(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Ali', 'phone' => '03001234567', 'total' => 1, 'placed_at' => '2026-10-01T10:00:00+00:00'],
            ['name' => 'Ali', 'phone' => '03001234567', 'total' => 1, 'placed_at' => '2026-01-05T10:00:00+00:00'],
        ]);

        Assert::same('2026-01-05T10:00:00+00:00', $ledger->customers()[0]->firstAt);
        Assert::same('2026-10-01T10:00:00+00:00', $ledger->customers()[0]->lastAt);
    }

    public function testTheRepeatRateCountsPeopleNotOrders(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Repeat', 'phone' => '03001111111', 'total' => 100],
            ['name' => 'Repeat', 'phone' => '03001111111', 'total' => 100],
            ['name' => 'Repeat', 'phone' => '03001111111', 'total' => 100],
            ['name' => 'Once', 'phone' => '03002222222', 'total' => 100],
            ['name' => 'Twice', 'phone' => '03003333333', 'total' => 100],
            ['name' => 'Twice', 'phone' => '03003333333', 'total' => 100],
        ]);

        $summary = $ledger->summary();

        Assert::same(3, $summary['customers']);
        Assert::same(2, $summary['repeat']);
        Assert::same(67, $summary['repeat_rate']);
        Assert::same(6, $summary['orders']);
    }

    public function testAnEmptyLedgerIsNotADivisionByZero(): void
    {
        $ledger = CustomerLedger::fromOrders([]);
        $summary = $ledger->summary();

        Assert::same(0, $summary['customers']);
        Assert::same(0, $summary['repeat_rate']);
        Assert::same(0, $summary['lifetime']);
        Assert::same([], $ledger->nameConflicts());
    }

    public function testAnUnreachableNumberIsStillACustomer(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Typo', 'phone' => '0300', 'total' => 100],
        ]);

        Assert::same(1, count($ledger->customers()));
        Assert::same(1, count($ledger->unreachable()));
        Assert::same(false, $ledger->customers()[0]->isReachable());
    }

    public function testTheAverageIsWholeRupeesBecauseTheCurrencyIs(): void
    {
        $ledger = CustomerLedger::fromOrders([
            ['name' => 'Ali', 'phone' => '03001234567', 'total' => 300_00],
            ['name' => 'Ali', 'phone' => '03001234567', 'total' => 200_00],
        ]);

        Assert::same(250_00, $ledger->customers()[0]->averageOrderMinor());
    }
}
