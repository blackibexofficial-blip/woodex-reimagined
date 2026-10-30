<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Reporting;

/**
 * The sales report, as arithmetic over rows rather than a query.
 *
 * Reports are where a shop discovers that three different screens disagree about revenue,
 * because each one picks a different sum: gross of tax, net of refunds, including cancelled
 * orders, counting the shipping line as sales. The rule here is stated once and used
 * everywhere, so the number at the top of this screen is the number the invoice screen would
 * produce for the same set of orders:
 *
 *   revenue = what was ordered, minus discounts, minus refunds. Tax and delivery are not
 *             revenue — one belongs to the government and the other pays a van.
 *
 * Cancelled orders are excluded; they are not sales. Everything else counts, including orders
 * still awaiting payment, because the goods were promised at a price and the ledger already
 * treats them as a claim.
 *
 * Days with no orders are absent rather than zero-filled: a report that draws a flat line
 * across a week the shop was closed reads as a collapse.
 */
final readonly class SalesReport
{
    /**
     * @param  list<array{order: string, date: string, category?: ?string, series?: ?string, qty: int, net: int, discount?: int, refunded?: int}>  $rows
     */
    public function __construct(public array $rows = []) {}

    /** Revenue for one row: net of discount and of what came back. */
    public static function revenueOf(array $row): int
    {
        return (int) ($row['net'] ?? 0) - (int) ($row['discount'] ?? 0) - (int) ($row['refunded'] ?? 0);
    }

    /**
     * One row per calendar day, oldest first.
     *
     * @return list<array{date: string, revenue: int, units: int, orders: int}>
     */
    public function byDay(): array
    {
        $days = [];

        foreach ($this->rows as $row) {
            $date = substr((string) $row['date'], 0, 10);

            $days[$date] ??= ['date' => $date, 'revenue' => 0, 'units' => 0, 'orders' => 0];
            $days[$date]['revenue'] += self::revenueOf($row);
            $days[$date]['units'] += (int) $row['qty'];
        }

        // Orders, not lines: one order of four chairs is one order.
        foreach ($this->ordersByDate() as $date => $count) {
            if (isset($days[$date])) {
                $days[$date]['orders'] = $count;
            }
        }

        ksort($days);

        return array_values($days);
    }

    /** @return array<string, int> */
    private function ordersByDate(): array
    {
        $seen = [];

        foreach ($this->rows as $row) {
            $date = substr((string) $row['date'], 0, 10);
            $seen[$date][(string) $row['order']] = true;
        }

        return array_map(static fn (array $orders): int => count($orders), $seen);
    }

    /**
     * Revenue and units per category, largest first.
     *
     * @return list<array{key: string, revenue: int, units: int, share_bp: int}>
     */
    public function byCategory(): array
    {
        return $this->groupBy('category');
    }

    /**
     * What sold, by product name.
     *
     * The field a line already carries. Category needs a pivot join and a translation lookup;
     * this answers the same question without pretending to a taxonomy the line does not have.
     *
     * @return list<array{key: string, revenue: int, units: int, share_bp: int}>
     */
    public function byProduct(): array
    {
        return $this->groupBy('product');
    }

    /**
     * The same by series, which is how the shop actually talks about its own furniture.
     *
     * @return list<array{key: string, revenue: int, units: int, share_bp: int}>
     */
    public function bySeries(): array
    {
        return $this->groupBy('series');
    }

    /**
     * @return list<array{key: string, revenue: int, units: int, share_bp: int}>
     */
    private function groupBy(string $field): array
    {
        $groups = [];

        foreach ($this->rows as $row) {
            $key = trim((string) ($row[$field] ?? ''));

            if ($key === '') {
                $key = 'Uncategorised';
            }

            $groups[$key] ??= ['key' => $key, 'revenue' => 0, 'units' => 0, 'share_bp' => 0];
            $groups[$key]['revenue'] += self::revenueOf($row);
            $groups[$key]['units'] += (int) $row['qty'];
        }

        $total = 0;

        foreach ($groups as $group) {
            $total += $group['revenue'];
        }

        foreach ($groups as $key => $group) {
            // A share of nothing is nothing, not a division error.
            $groups[$key]['share_bp'] = $total <= 0 ? 0 : (int) round($group['revenue'] * 10000 / $total);
        }

        usort($groups, static fn (array $a, array $b): int => [$b['revenue'], $a['key']] <=> [$a['revenue'], $b['key']]);

        return array_values($groups);
    }

    /**
     * @return array{revenue: int, units: int, orders: int, days: int, average_order: int, best_day: ?string, best_day_revenue: int, discount: int, refunded: int}
     */
    public function summary(): array
    {
        $revenue = 0;
        $units = 0;
        $discount = 0;
        $refunded = 0;
        $orders = [];

        foreach ($this->rows as $row) {
            $revenue += self::revenueOf($row);
            $units += (int) $row['qty'];
            $discount += (int) ($row['discount'] ?? 0);
            $refunded += (int) ($row['refunded'] ?? 0);
            $orders[(string) $row['order']] = true;
        }

        $days = $this->byDay();
        $best = null;

        foreach ($days as $day) {
            if ($best === null || $day['revenue'] > $best['revenue']) {
                $best = $day;
            }
        }

        $orderCount = count($orders);

        return [
            'revenue' => $revenue,
            'units' => $units,
            'orders' => $orderCount,
            'days' => count($days),
            'average_order' => $orderCount === 0 ? 0 : intdiv(max(0, $revenue), $orderCount),
            'best_day' => $best['date'] ?? null,
            'best_day_revenue' => $best['revenue'] ?? 0,
            'discount' => $discount,
            'refunded' => $refunded,
        ];
    }

    /**
     * The concentration warning, which is the only one a report needs.
     *
     * When a single category is most of the revenue, the shop is one product line away from a
     * bad quarter — and that is invisible in a list sorted by revenue, because the top row
     * being large looks like success.
     */
    public function warnings(): array
    {
        $warnings = [];
        $categories = $this->byCategory();

        if ($categories === []) {
            return [];
        }

        $top = $categories[0];

        if ($top['share_bp'] >= 5000 && count($categories) > 1) {
            $warnings[] = $top['key'].' is '.number_format($top['share_bp'] / 100, 0).'% of revenue. '
                .'That is a concentration worth knowing about, not a target to hit.';
        }

        $refunded = $this->summary()['refunded'];
        $revenue = $this->summary()['revenue'];

        if ($revenue > 0 && $refunded * 10000 / max(1, $revenue) > 500) {
            $warnings[] = 'Refunds are above 5% of revenue for this period.';
        }

        return $warnings;
    }
}
