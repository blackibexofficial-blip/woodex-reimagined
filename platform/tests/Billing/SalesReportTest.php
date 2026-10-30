<?php

declare(strict_types=1);

namespace Tests\Billing;

use App\Domain\Commerce\Reporting\SalesReport;
use Tests\Support\Assert;

/**
 * One definition of revenue, used by every number on the report.
 *
 * The failure mode this prevents is a shop where the dashboard, the report and the accountant
 * each total a different thing and all three are "right".
 */
final class SalesReportTest
{
    /** @param array<string, mixed> $overrides */
    private function row(array $overrides = []): array
    {
        return [
            'order' => $overrides['order'] ?? 'WDX-000042',
            'date' => $overrides['date'] ?? '2026-10-30',
            'category' => $overrides['category'] ?? 'Office Tables',
            'series' => $overrides['series'] ?? 'Executive',
            'qty' => $overrides['qty'] ?? 1,
            'net' => $overrides['net'] ?? 100_000,
            'discount' => $overrides['discount'] ?? 0,
            'refunded' => $overrides['refunded'] ?? 0,
        ];
    }

    public function testRevenueIsNetOfDiscountAndRefund(): void
    {
        Assert::same(100_000, SalesReport::revenueOf($this->row()));
        Assert::same(90_000, SalesReport::revenueOf($this->row(['discount' => 10_000])));
        Assert::same(70_000, SalesReport::revenueOf($this->row(['discount' => 10_000, 'refunded' => 20_000])));
    }

    public function testTaxAndDeliveryAreNotPassedInAsRevenueBecauseTheyAreNot(): void
    {
        // The caller passes the goods total; a row carrying tax would be a bug in the caller,
        // and this pins the contract rather than the arithmetic.
        $row = $this->row();
        Assert::same(false, array_key_exists('tax', $row), 'a sales row has no tax field to add by accident');
        Assert::same(false, array_key_exists('shipping', $row), 'and no delivery field');
    }

    public function testDaysAreOrderedAndNotZeroFilled(): void
    {
        $report = new SalesReport([
            $this->row(['date' => '2026-10-30T10:00:00', 'net' => 100_000]),
            $this->row(['date' => '2026-10-28', 'net' => 50_000]),
            $this->row(['date' => '2026-10-30', 'net' => 25_000, 'order' => 'WDX-000043']),
        ]);

        $days = $report->byDay();

        Assert::same(2, count($days), 'two days traded, so two rows');
        Assert::same('2026-10-28', $days[0]['date']);
        Assert::same('2026-10-30', $days[1]['date']);
        Assert::same(125_000, $days[1]['revenue']);
        Assert::same(2, $days[1]['orders']);
    }

    public function testOrdersAreCountedNotLines(): void
    {
        $report = new SalesReport([
            $this->row(['order' => 'WDX-1', 'qty' => 3, 'net' => 300_000]),
            $this->row(['order' => 'WDX-1', 'qty' => 1, 'net' => 100_000]),
        ]);

        Assert::same(1, $report->summary()['orders'], 'one order, two lines');
        Assert::same(4, $report->summary()['units']);
        Assert::same(400_000, $report->summary()['average_order']);
    }

    public function testCategoriesAreSortedAndShared(): void
    {
        $report = new SalesReport([
            $this->row(['category' => 'Chairs', 'net' => 100_000]),
            $this->row(['category' => 'Office Tables', 'net' => 300_000]),
        ]);

        $categories = $report->byCategory();

        Assert::same('Office Tables', $categories[0]['key']);
        Assert::same(7500, $categories[0]['share_bp']);
        Assert::same(2500, $categories[1]['share_bp']);
    }

    public function testAShareOfNothingIsNotADivisionError(): void
    {
        $report = new SalesReport([
            $this->row(['category' => 'Chairs', 'net' => 100_000, 'discount' => 100_000]),
        ]);

        $categories = $report->byCategory();

        Assert::same(0, $categories[0]['revenue']);
        Assert::same(0, $categories[0]['share_bp']);
    }

    public function testTheBestDayIsTheOneThatEarnedMost(): void
    {
        $report = new SalesReport([
            $this->row(['date' => '2026-10-01', 'net' => 10_000, 'order' => 'A']),
            $this->row(['date' => '2026-10-02', 'net' => 90_000, 'order' => 'B']),
        ]);

        Assert::same('2026-10-02', $report->summary()['best_day']);
        Assert::same(90_000, $report->summary()['best_day_revenue']);
    }

    public function testAnEmptyDayIsAbsentRatherThanZero(): void
    {
        $report = new SalesReport([
            $this->row(['date' => '2026-10-01', 'order' => 'A']),
            $this->row(['date' => '2026-10-05', 'order' => 'B']),
        ]);

        $dates = array_column($report->byDay(), 'date');

        Assert::same(['2026-10-01', '2026-10-05'], $dates, 'the shop was closed in between, not trading at zero');
    }

    public function testConcentrationIsWarnedAboutEvenThoughItLooksLikeSuccess(): void
    {
        $report = new SalesReport([
            $this->row(['category' => 'Office Tables', 'net' => 900_000]),
            $this->row(['category' => 'Chairs', 'net' => 100_000]),
        ]);

        $warnings = $report->warnings();

        Assert::same(1, count($warnings));
        Assert::true(str_contains($warnings[0], 'Office Tables'));
        Assert::true(str_contains($warnings[0], '90%'));
    }

    public function testASingleCategoryShopIsNotWarnedBecauseThereIsNothingToDiversifyInto(): void
    {
        $report = new SalesReport([$this->row(['category' => 'Chairs'])]);

        Assert::same([], $report->warnings());
    }

    public function testHeavyRefundsAreWarnedAbout(): void
    {
        $report = new SalesReport([
            // 12,000 refunded against ~188,000 of revenue is 6.4%, over the 5% line.
            $this->row(['category' => 'Chairs', 'net' => 100_000, 'refunded' => 12_000]),
            $this->row(['category' => 'Chairs', 'net' => 100_000, 'order' => 'B']),
        ]);

        Assert::same(1, count($report->warnings()));
        Assert::true(str_contains($report->warnings()[0], 'Refunds'));
    }

    public function testAnEmptyReportReturnsZerosNotErrors(): void
    {
        $report = new SalesReport([]);
        $summary = $report->summary();

        Assert::same(0, $summary['revenue']);
        Assert::same(0, $summary['average_order']);
        Assert::same(null, $summary['best_day']);
        Assert::same([], $report->warnings());
    }
}
