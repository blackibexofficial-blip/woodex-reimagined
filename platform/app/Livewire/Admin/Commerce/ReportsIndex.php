<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Reporting\SalesReport;
use App\Domain\Commerce\Support\Money;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * Sales, over a period, with one definition of revenue.
 *
 * The number at the top is the same one the invoices and the refunds screens would produce for
 * the same orders: what was ordered, minus discounts, minus refunds. Tax is not revenue — it
 * belongs to the government — and delivery is not revenue either; it pays for a van.
 *
 * Days with no trading are absent rather than drawn at zero. A flat line across a week the
 * shop was closed reads as a collapse, and the first thing anyone does with a report is look at
 * the shape of the line before reading a single number.
 */
#[Layout('layouts::admin')]
#[Title('Reports')]
class ReportsIndex extends Component
{
    use InteractsWithAdmin;

    /** 7 | 30 | 90 days back from today. */
    #[Url]
    public string $range = '30';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.reports.view'), 403);
    }

    public function days(): int
    {
        return in_array($this->range, ['7', '30', '90'], true) ? (int) $this->range : 30;
    }

    public function since(): Carbon
    {
        return now()->subDays($this->days())->startOfDay();
    }

    /**
     * One row per order line, because that is the grain the report groups at.
     *
     * The order's own discount stays on the order — the calculator already split it across
     * lines as `line_discount_minor`, so using the line's share keeps the sums equal to the
     * order total instead of allocating it a second time.
     */
    public function report(): SalesReport
    {
        $rows = DB::table('commerce_order_items as i')
            ->join('commerce_orders as o', 'o.id', '=', 'i.order_id')
            ->where('o.status', '<>', 'cancelled')
            ->where('o.placed_at', '>=', $this->since())
            ->selectRaw('o.number as `order`, o.placed_at as date, i.name as product, i.qty as qty, i.line_total_minor as net, i.line_discount_minor as discount')
            ->get()
            ->map(static fn ($row): array => [
                'order' => (string) $row->order,
                'date' => (string) $row->date,
                'product' => (string) $row->product,
                'qty' => (int) $row->qty,
                'net' => (int) $row->net,
                'discount' => (int) $row->discount,
                'refunded' => 0,
            ])
            ->all();

        return new SalesReport($rows);
    }

    /**
     * Refunds are an order-level number and are not allocated across lines.
     *
     * Spreading one refund over four items to make a per-product chart look complete would be
     * inventing data; it is shown on its own line instead.
     */
    public function refundedInPeriod(): int
    {
        return (int) Order::query()
            ->where('status', '<>', 'cancelled')
            ->where('placed_at', '>=', $this->since())
            ->sum('refunded_minor');
    }

    public function money(int $minor): string
    {
        return Money::ofMinor($minor, 'PKR')->format();
    }

    public function render(): View
    {
        $report = $this->report();
        $summary = $report->summary();

        return view('livewire.admin.commerce.reports-index', [
            'summary' => $summary,
            'days' => $report->byDay(),
            'products' => array_slice($report->byProduct(), 0, 10),
            'warnings' => $report->warnings(),
            'refunded' => $this->refundedInPeriod(),
            'peak' => max(1, ...array_map(static fn (array $day): int => $day['revenue'], $report->byDay() ?: [['revenue' => 1]])),
        ]);
    }
}
