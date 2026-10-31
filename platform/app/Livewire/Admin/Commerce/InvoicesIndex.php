<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Billing\InvoiceBalance;
use App\Domain\Sales\Enums\InvoiceStatus;
use App\Domain\Sales\Models\Invoice;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

/**
 * The furniture slice of the studio's receivables.
 *
 * This screen used to list `commerce_invoices` — a table the commerce package wrote itself, with
 * its own `INV-` counter. That was a second set of books: the same sale had an invoice here and
 * a different one in Sales, and only the second was ever posted to the ledger or turned into a
 * PDF. The table is gone; this screen reads the OS invoices that name a commerce order
 * (`commerce_order_id`), so what it lists is exactly what the accountant sees.
 *
 * Nothing here edits an invoice. Voiding, waiving and correcting a document a customer has
 * already been sent is a deliberate, permissioned flow with a reason attached, and it belongs on
 * the invoice itself — `admin.invoices.show` — where the lines and the payment history are
 * visible together. Every row links there.
 */
#[Layout('layouts::admin')]
#[Title('Invoices')]
class InvoicesIndex extends Component
{
    use InteractsWithAdmin, WithPagination;

    #[Url]
    public string $search = '';

    /** all | outstanding | paid | overdue | void */
    #[Url]
    public string $state = 'outstanding';

    #[Url]
    public string $from = '';

    #[Url]
    public string $to = '';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.orders.view'), 403);
    }

    public function updated(string $property): void
    {
        if (in_array($property, ['search', 'state', 'from', 'to'], true)) {
            $this->resetPage();
        }
    }

    /**
     * The money summary.
     *
     * `balance_minor` is written by the ledger when the invoice is raised and by the payment
     * flow when money arrives, so summing it is summing the receivables — not re-deriving them
     * from another table's opinion. A void document carries no claim and is excluded from
     * outstanding, but it is still counted, so the header reconciles with the list below.
     *
     * @return array{count: int, total: int, paid: int, outstanding: int, overdue: int, overdue_count: int}
     */
    public function summary(): array
    {
        $row = $this->base()
            ->selectRaw('COUNT(*) as count')
            ->selectRaw('COALESCE(SUM(invoices.total_minor), 0) as total')
            ->selectRaw('COALESCE(SUM(invoices.total_minor - invoices.balance_minor), 0) as paid')
            ->selectRaw('COALESCE(SUM(CASE WHEN invoices.status <> ? THEN invoices.balance_minor ELSE 0 END), 0) as outstanding', [InvoiceStatus::Void->value])
            ->selectRaw('COALESCE(SUM(CASE WHEN invoices.status <> ? AND invoices.due_date IS NOT NULL AND invoices.due_date < CURRENT_DATE THEN invoices.balance_minor ELSE 0 END), 0) as overdue', [InvoiceStatus::Void->value])
            ->selectRaw('COALESCE(SUM(CASE WHEN invoices.status <> ? AND invoices.due_date IS NOT NULL AND invoices.due_date < CURRENT_DATE AND invoices.balance_minor > 0 THEN 1 ELSE 0 END), 0) as overdue_count', [InvoiceStatus::Void->value])
            ->first();

        return [
            'count' => (int) ($row->count ?? 0),
            'total' => (int) ($row->total ?? 0),
            'paid' => (int) ($row->paid ?? 0),
            'outstanding' => (int) ($row->outstanding ?? 0),
            'overdue' => (int) ($row->overdue ?? 0),
            'overdue_count' => (int) ($row->overdue_count ?? 0),
        ];
    }

    /**
     * The page of invoices.
     *
     * The order and its shipping address are joined rather than loaded through relations: this
     * screen needs two columns from the order, and a join answers "whose invoice is this" in one
     * query instead of one per row on a list that is always read with a paginator.
     *
     * @return \Illuminate\Pagination\LengthAwarePaginator<int, Invoice>
     */
    public function invoices()
    {
        return $this->base()
            ->when($this->search !== '', function (Builder $query): void {
                $term = '%'.trim($this->search).'%';

                $query->where(function (Builder $inner) use ($term): void {
                    $inner->where('invoices.number', 'like', $term)
                        ->orWhere('commerce_orders.number', 'like', $term)
                        ->orWhere('commerce_order_addresses.name', 'like', $term)
                        ->orWhere('commerce_order_addresses.phone', 'like', $term);
                });
            })
            ->when($this->from !== '', fn (Builder $query) => $query->whereDate('invoices.issue_date', '>=', $this->from))
            ->when($this->to !== '', fn (Builder $query) => $query->whereDate('invoices.issue_date', '<=', $this->to))
            ->when($this->state === 'void', fn (Builder $query) => $query->where('invoices.status', InvoiceStatus::Void->value))
            ->when($this->state === 'paid', fn (Builder $query) => $query
                ->where('invoices.status', '<>', InvoiceStatus::Void->value)
                ->where('invoices.balance_minor', '<=', 0))
            ->when($this->state === 'outstanding', fn (Builder $query) => $query
                ->where('invoices.status', '<>', InvoiceStatus::Void->value)
                ->where('invoices.balance_minor', '>', 0))
            ->when($this->state === 'overdue', fn (Builder $query) => $query
                ->where('invoices.status', '<>', InvoiceStatus::Void->value)
                ->where('invoices.balance_minor', '>', 0)
                ->whereNotNull('invoices.due_date')
                ->whereDate('invoices.due_date', '<', now()->toDateString()))
            ->select([
                'invoices.*',
                'commerce_orders.number as order_number',
                'commerce_orders.refunded_minor as order_refunded_minor',
                'commerce_order_addresses.name as customer_name',
                'commerce_order_addresses.phone as customer_phone',
            ])
            ->orderByDesc('invoices.issue_date')
            ->orderByDesc('invoices.id')
            ->paginate(20);
    }

    /**
     * One query shape, so the summary and the rows can never disagree.
     *
     * @return Builder<Invoice>
     */
    private function base(): Builder
    {
        return Invoice::query()
            ->whereNotNull('invoices.commerce_order_id')
            ->join('commerce_orders', 'commerce_orders.id', '=', 'invoices.commerce_order_id')
            ->leftJoin('commerce_order_addresses', function ($join): void {
                $join->on('commerce_order_addresses.order_id', '=', 'commerce_orders.id')
                    ->where('commerce_order_addresses.type', '=', 'shipping');
            });
    }

    /**
     * Derive what the row shows.
     *
     * `InvoiceBalance` is the framework-free derivation, kept because the same rules decide the
     * badge here and the wording of the chase letter. It is fed from the ledger rather than
     * from the order: `paid_minor` on the invoice is what was actually received, and the order's
     * counter is a commerce-side record that may lag it by one confirmation.
     */
    public function balance(Invoice $invoice): InvoiceBalance
    {
        $dueAt = $invoice->due_date;

        return new InvoiceBalance(
            totalMinor: (int) $invoice->total_minor,
            paidMinor: (int) $invoice->paid_minor,
            refundedMinor: (int) ($invoice->order_refunded_minor ?? 0),
            isVoid: $invoice->status === InvoiceStatus::Void,
            daysUntilDue: $dueAt === null ? null : (int) now()->startOfDay()->diffInDays($dueAt->startOfDay(), false),
        );
    }

    /** @return Collection<int, string> */
    public function stateOptions(): Collection
    {
        return collect([
            'outstanding' => 'Outstanding',
            'overdue' => 'Overdue',
            'paid' => 'Paid',
            'void' => 'Void',
            'all' => 'All invoices',
        ]);
    }

    public function render(): View
    {
        return view('livewire.admin.commerce.invoices-index', [
            'invoices' => $this->invoices(),
            'summary' => $this->summary(),
            'states' => $this->stateOptions(),
        ]);
    }
}
