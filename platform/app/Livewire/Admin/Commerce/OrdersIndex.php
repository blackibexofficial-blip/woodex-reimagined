<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Checkout\OrderStatus;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

/**
 * The order list: the screen that answers "what happened today", not "what is in the catalog".
 *
 * Read-only. Every action that changes an order lives on the order itself, where the totals,
 * the address and the history are visible at the same time — cancelling from a list is how
 * someone cancels the wrong order.
 *
 * Two independent filters for status and payment, because the useful questions are cross-axis:
 * "which COD orders were delivered but are still marked unpaid" is a payment filter, and it is
 * the one that finds real money.
 */
#[Layout('layouts::admin')]
#[Title('Orders')]
class OrdersIndex extends Component
{
    use InteractsWithAdmin, WithPagination;

    #[Url]
    public string $search = '';

    #[Url]
    public string $status = '';

    #[Url]
    public string $payment = '';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.orders.view'), 403);
    }

    public function updatedSearch(): void
    {
        $this->resetPage();
    }

    public function updatedStatus(): void
    {
        $this->resetPage();
    }

    public function updatedPayment(): void
    {
        $this->resetPage();
    }

    /** @return array<string, string> */
    public function statusOptions(): array
    {
        return OrderStatus::labels();
    }

    /** @return array<string, string> */
    public function paymentOptions(): array
    {
        return [
            OrderStatus::PAYMENT_PENDING => 'Awaiting payment',
            OrderStatus::PAYMENT_PAID => 'Paid',
            OrderStatus::PAYMENT_FAILED => 'Failed',
            OrderStatus::PAYMENT_REFUNDED => 'Refunded',
        ];
    }

    /** @return Builder<Order> */
    private function query(): Builder
    {
        return Order::query()
            ->with(['items', 'addresses', 'payments'])
            ->when($this->search !== '', function (Builder $query): void {
                $term = '%'.$this->search.'%';

                $query->where(function (Builder $inner) use ($term): void {
                    // Order number is what a customer reads out on the phone, so it is the
                    // first thing this search must match.
                    $inner->where('number', 'like', $term)
                        ->orWhereHas('addresses', static fn (Builder $a) => $a->where('name', 'like', $term))
                        ->orWhereHas('items', static fn (Builder $i) => $i->where('name', 'like', $term)->orWhere('sku', 'like', $term));
                });
            })
            ->when($this->status !== '', fn (Builder $query) => $query->where('status', $this->status))
            ->when($this->payment !== '', fn (Builder $query) => $query->where('payment_status', $this->payment))
            ->orderByDesc('id');
    }

    public function render(): View
    {
        return view('livewire.admin.commerce.orders-index', [
            'orders' => $this->query()->paginate(25),
            'statuses' => $this->statusOptions(),
            'payments' => $this->paymentOptions(),
            'canView' => $this->user()->can('commerce.orders.view'),
        ]);
    }
}
