<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Billing\InvoiceBalance;
use App\Domain\Commerce\Checkout\Models\Invoice;
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
 * Every invoice, and what is still owed on it.
 *
 * The list is filtered on money, not on the status column. `invoice.status` is written once at
 * issue and never moves, so a filter on it answers the wrong question — "which rows say
 * issued" instead of "who owes us money". `InvoiceBalance` derives the truth from the amount,
 * what has been paid and what has been refunded, and the screen's filters run against the same
 * columns that derivation reads.
 *
 * Nothing here edits an invoice. Waiving, voiding and correcting a document a customer has
 * already been sent is a deliberate, permissioned flow with a reason attached, and it belongs
 * on the invoice itself where the line items and the payment history are visible together.
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
     * The money summary, computed in SQL against the same rules as InvoiceBalance.
     *
     * `paid_minor - refunded_minor` is the net received; anything less than the total is
     * outstanding. Rows whose invoice is void are excluded from "outstanding" because a
     * cancelled document is not a claim — but they are still counted, so the numbers reconcile
     * with the list below.
     *
     * @return array{count: int, total: int, paid: int, outstanding: int, overdue: int, overdue_count: int}
     */
    public function summary(): array
    {
        $row = Invoice::query()
            ->join('commerce_orders', 'commerce_orders.id', '=', 'commerce_invoices.order_id')
            ->selectRaw('COUNT(*) as count')
            ->selectRaw('COALESCE(SUM(commerce_invoices.total_minor), 0) as total')
            ->selectRaw('COALESCE(SUM(LEAST(commerce_orders.paid_minor, commerce_invoices.total_minor) - commerce_orders.refunded_minor), 0) as paid')
            ->selectRaw('COALESCE(SUM(GREATEST(0, commerce_invoices.total_minor - (commerce_orders.paid_minor - commerce_orders.refunded_minor))), 0) as outstanding')
            ->selectRaw('COALESCE(SUM(CASE WHEN commerce_invoices.status <> ? AND commerce_invoices.due_at IS NOT NULL AND commerce_invoices.due_at < NOW() AND commerce_orders.paid_minor - commerce_orders.refunded_minor < commerce_invoices.total_minor THEN GREATEST(0, commerce_invoices.total_minor - (commerce_orders.paid_minor - commerce_orders.refunded_minor)) ELSE 0 END), 0) as overdue', [Invoice::VOID])
            ->selectRaw('COALESCE(SUM(CASE WHEN commerce_invoices.status <> ? AND commerce_invoices.due_at IS NOT NULL AND commerce_invoices.due_at < NOW() AND commerce_orders.paid_minor - commerce_orders.refunded_minor < commerce_invoices.total_minor THEN 1 ELSE 0 END), 0) as overdue_count', [Invoice::VOID])
            ->first();

        return [
            'count' => (int) ($row->count ?? 0),
            'total' => (int) ($row->total ?? 0),
            'paid' => max(0, (int) ($row->paid ?? 0)),
            'outstanding' => (int) ($row->outstanding ?? 0),
            'overdue' => (int) ($row->overdue ?? 0),
            'overdue_count' => (int) ($row->overdue_count ?? 0),
        ];
    }

    /** @return \Illuminate\Pagination\LengthAwarePaginator<int, Invoice> */
    public function invoices()
    {
        return Invoice::query()
            ->with(['order.addresses'])
            ->when($this->search !== '', function (Builder $query): void {
                $term = '%'.trim($this->search).'%';

                $query->where(function (Builder $inner) use ($term): void {
                    $inner->where('number', 'like', $term)
                        ->orWhereHas('order', static fn (Builder $order) => $order
                            ->where('number', 'like', $term)
                            ->orWhereHas('addresses', static fn (Builder $address) => $address
                                ->where('name', 'like', $term)
                                ->orWhere('phone', 'like', $term)));
                });
            })
            ->when($this->from !== '', fn (Builder $query) => $query->whereDate('issued_at', '>=', $this->from))
            ->when($this->to !== '', fn (Builder $query) => $query->whereDate('issued_at', '<=', $this->to))
            ->when($this->state === 'void', fn (Builder $query) => $query->where('status', Invoice::VOID))
            ->when($this->state === 'paid', fn (Builder $query) => $query
                ->where('status', '<>', Invoice::VOID)
                ->whereRaw('commerce_orders.paid_minor - commerce_orders.refunded_minor >= commerce_invoices.total_minor'))
            ->when($this->state === 'outstanding', fn (Builder $query) => $query
                ->where('status', '<>', Invoice::VOID)
                ->whereRaw('commerce_orders.paid_minor - commerce_orders.refunded_minor < commerce_invoices.total_minor'))
            ->when($this->state === 'overdue', fn (Builder $query) => $query
                ->where('status', '<>', Invoice::VOID)
                ->whereNotNull('due_at')
                ->where('due_at', '<', now())
                ->whereRaw('commerce_orders.paid_minor - commerce_orders.refunded_minor < commerce_invoices.total_minor'))
            // The joins are done with an explicit subquery-free join so the raw comparisons
            // above read columns from the same row set the summary does.
            ->join('commerce_orders', 'commerce_orders.id', '=', 'commerce_invoices.order_id')
            ->orderByDesc('commerce_invoices.issued_at')
            ->orderByDesc('commerce_invoices.id')
            ->select('commerce_invoices.*')
            ->paginate(20);
    }

    /** Derive what the row shows. The stored status is passed in only to detect a void. */
    public function balance(Invoice $invoice): InvoiceBalance
    {
        $order = $invoice->order;
        $dueAt = $invoice->due_at;

        return new InvoiceBalance(
            totalMinor: (int) $invoice->total_minor,
            paidMinor: (int) ($order->paid_minor ?? 0),
            refundedMinor: (int) ($order->refunded_minor ?? 0),
            isVoid: $invoice->status === Invoice::VOID,
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
