<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Billing\PaymentToLedger;
use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Checkout\OrderStatus;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Locked;
use Livewire\Attributes\Title;
use Livewire\Component;
use LogicException;

/**
 * One order, with everything a person needs to answer a phone call about it.
 *
 * The actions are the graph in OrderStatus and nothing else: move forward one step, or cancel
 * while it is still cancellable. There is no "set status" dropdown, because a dropdown is how
 * an order gets marked delivered before it was shipped, and because the history would then
 * record a decision nobody made.
 *
 * Delivering a COD order is the moment money arrives. That is handled in the model, so this
 * screen cannot forget it.
 */
#[Layout('layouts::admin')]
#[Title('Order')]
class OrderShow extends Component
{
    use InteractsWithAdmin;

    #[Locked]
    public Order $order;

    public string $cancelReason = '';

    /**
     * The invoice raised for this sale, if the install has a ledger.
     *
     * Held as two scalars rather than as a model: the document belongs to Sales, and a Livewire
     * property typed with a class a bare commerce install does not have would break the
     * component's hydration there — for a screen that would otherwise work fine without it.
     */
    public ?int $invoiceId = null;

    public ?string $invoiceNumber = null;

    /** The receipt that settled this order, once money is real. */
    public ?string $receiptNumber = null;

    public string $settleNote = '';

    public function mount(Order $order): void
    {
        abort_unless($this->user()->can('commerce.orders.view'), 403);

        $this->order = $order->load(['items', 'addresses', 'payments', 'history']);

        $invoice = $order->ledgerInvoice();

        $this->invoiceId = $invoice?->id;
        $this->invoiceNumber = $invoice?->number;
        $this->readSettlement();
    }

    /** What the ledger says about this order's money, if it says anything. */
    private function readSettlement(): void
    {
        $this->receiptNumber = app(PaymentToLedger::class)->summaryFor($this->order)['receipt'];
    }

    /** Advance the order one legal step along the fulfilment path. */
    public function advance(): void
    {
        abort_unless($this->user()->can('commerce.orders.manage'), 403);

        $next = $this->nextStatus();

        if ($next === null) {
            $this->addError('advance', 'This order is already complete.');

            return;
        }

        try {
            $this->order->moveTo($next, null, (int) $this->user()->id);
        } catch (LogicException $e) {
            $this->addError('advance', $e->getMessage());

            return;
        }

        $this->order->refresh()->load(['items', 'addresses', 'payments', 'history']);

        // Delivering a cash order is the moment the courier hands over the money, so it is also
        // the moment the ledger is told. Doing this here, rather than in a nightly job, keeps the
        // books from lagging the shop by a day — and a failure rolls nothing back that the
        // operator cannot see, because the settlement reports its own error.
        if ($this->order->payment_status === OrderStatus::PAYMENT_PAID) {
            $this->settle(silent: true);
        }

        $this->toast("Order {$this->order->number} is now {$next}.");
    }

    /**
     * Record the money against the invoice.
     *
     * Separate from advancing the order because the two are separate facts: a bank transfer is
     * paid while the parcel is still on a shelf, and a COD order can be delivered by a courier
     * who has not returned with the cash yet. The screen allows either order of events and the
     * bridge refuses to settle the same attempt twice.
     */
    public function settle(bool $silent = false): void
    {
        abort_unless($this->user()->can('commerce.orders.manage'), 403);

        try {
            $receipt = app(PaymentToLedger::class)->settle($this->order, $this->user());
        } catch (\Throwable $e) {
            $this->addError('settle', $e->getMessage());

            return;
        }

        if ($receipt === null) {
            $this->addError('settle', 'This install has no ledger to settle into.');

            return;
        }

        $this->order->refresh()->load(['items', 'addresses', 'payments', 'history']);
        $this->readSettlement();

        if (! $silent) {
            $this->toast("Receipt {$receipt->receipt_number} recorded against {$this->invoiceNumber}.");
        }
    }

    public function cancel(): void
    {
        abort_unless($this->user()->can('commerce.orders.manage'), 403);

        $reason = trim($this->cancelReason);

        if ($reason === '') {
            // A cancellation without a reason is a cancellation nobody can explain later.
            $this->addError('cancelReason', 'Give a reason — it is written into the order history.');

            return;
        }

        try {
            $this->order->moveTo(OrderStatus::CANCELLED, $reason, (int) $this->user()->id);
        } catch (LogicException $e) {
            $this->addError('cancelReason', $e->getMessage());

            return;
        }

        $this->cancelReason = '';
        $this->order->refresh()->load(['items', 'addresses', 'payments', 'history']);
        $this->toast("Order {$this->order->number} cancelled.");
    }

    public function nextStatus(): ?string
    {
        // Cancelling and refunding are their own buttons; "advance" must never mean "give the
        // money back", which is what a single step button would become after delivery.
        foreach (OrderStatus::nextFrom($this->order->status) as $candidate) {
            if (! in_array($candidate, [OrderStatus::CANCELLED, OrderStatus::REFUNDED], true)) {
                return $candidate;
            }
        }

        return null;
    }

    public function canCancel(): bool
    {
        return OrderStatus::canMoveTo($this->order->status, OrderStatus::CANCELLED);
    }

    public function render(): View
    {
        return view('livewire.admin.commerce.order-show', [
            'order' => $this->order,
            'labels' => OrderStatus::labels(),
            'next' => $this->nextStatus(),
            'canManage' => $this->user()->can('commerce.orders.manage'),
            'canCancel' => $this->canCancel(),
        ]);
    }
}
