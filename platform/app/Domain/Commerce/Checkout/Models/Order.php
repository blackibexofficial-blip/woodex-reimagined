<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use App\Domain\Commerce\Checkout\OrderStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;
use LogicException;

/**
 * An order is a record of what was agreed, not a view of the catalog.
 *
 * Every amount on this row was written when the order was placed and is never recalculated from
 * today's prices. `status`, `payment_status` and `fulfilment_status` are three separate axes on
 * purpose: a COD order is delivered and only then paid, and a bank transfer is paid while it is
 * still unfulfilled.
 *
 * Transitions go through `moveTo()`, which consults OrderStatus and refuses illegal moves. No
 * screen is allowed to set the column directly — the moment two screens disagree about the
 * graph, one of them is shipping cancelled orders.
 */
class Order extends Model
{
    protected $table = 'commerce_orders';

    protected $guarded = ['id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'subtotal_minor' => 'integer',
            'discount_minor' => 'integer',
            'tax_minor' => 'integer',
            'shipping_minor' => 'integer',
            'grand_total_minor' => 'integer',
            'paid_minor' => 'integer',
            'refunded_minor' => 'integer',
            'applied_rules' => 'array',
            'placed_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    /** @return HasMany<OrderItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class)->orderBy('position');
    }

    /** @return HasMany<OrderAddress, $this> */
    public function addresses(): HasMany
    {
        return $this->hasMany(OrderAddress::class);
    }

    /** @return HasMany<OrderStatusHistory, $this> */
    public function history(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->orderBy('created_at');
    }

    /**
     * The OS invoice raised for this order, or null when this install has no ledger.
     *
     * Deliberately a method and not a relation. The class it reaches lives in Sales, which a
     * bare commerce install does not have — and a relation that names a missing class is a
     * fatal error the moment the model is loaded, on pages that never ask about invoices.
     * A method costs one query, only when something actually wants the document.
     */
    public function ledgerInvoice(): ?\App\Domain\Sales\Models\Invoice
    {
        if (! Schema::hasTable('invoices') || ! Schema::hasColumn('invoices', 'commerce_order_id')) {
            return null;
        }

        return \App\Domain\Sales\Models\Invoice::query()
            ->where('commerce_order_id', $this->id)
            ->first();
    }

    /** @return HasMany<Payment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    /** @param  Builder<self>  $query */
    public function scopePlaced(Builder $query): void
    {
        $query->where('status', OrderStatus::PLACED);
    }

    /** @param  Builder<self>  $query */
    public function scopeAwaitingPayment(Builder $query): void
    {
        $query->where('payment_status', OrderStatus::PAYMENT_PENDING);
    }

    public function shippingAddress(): ?OrderAddress
    {
        return $this->addresses->firstWhere('type', OrderAddress::SHIPPING);
    }

    /**
     * Move the order forward, refusing anything the graph forbids.
     */
    public function moveTo(string $status, ?string $note = null, ?int $actorId = null): void
    {
        if (! OrderStatus::isKnown($status)) {
            throw new LogicException("Unknown order status [{$status}].");
        }

        if (! OrderStatus::canMoveTo($this->status, $status)) {
            throw new LogicException("Order {$this->number} cannot move from {$this->status} to {$status}.");
        }

        $from = $this->status;
        $this->status = $status;
        $this->fulfilment_status = OrderStatus::fulfilmentAfter($status);

        if ($payment = OrderStatus::paymentStatusAfter($status, $this->paymentGateway())) {
            $this->payment_status = $payment;

            // Delivering a COD order is the moment the courier hands over the cash, so the
            // order and its payment row are settled together. Leaving `paid_minor` at zero
            // while the order says `paid` is how a cash order disappears from the takings.
            if ($payment === OrderStatus::PAYMENT_PAID) {
                $this->paid_minor = $this->grand_total_minor;
            }
        }

        if ($status === OrderStatus::CANCELLED) {
            $this->cancelled_at = now();
        }

        $this->save();

        $this->syncPaymentRow();

        $this->history()->create([
            'from_status' => $from,
            'to_status' => $status,
            'note' => $note,
            'actor_id' => $actorId,
        ]);
    }

    /**
     * Keep the payment row in step with the order's payment axis.
     *
     * One direction only: the order decides, the payment row records. A gateway callback that
     * wants to mark money received calls Payment::markPaid() directly, because at that point the
     * money — not the order status — is the source of truth.
     */
    private function syncPaymentRow(): void
    {
        $payment = $this->payments()
            ->where('status', OrderStatus::PAYMENT_PENDING)
            ->first();

        if ($payment === null) {
            return;
        }

        if ($this->payment_status === OrderStatus::PAYMENT_PAID) {
            $payment->markPaid();

            return;
        }

        if ($this->payment_status === OrderStatus::PAYMENT_FAILED) {
            $payment->status = OrderStatus::PAYMENT_FAILED;
            $payment->save();
        }
    }

    /** The gateway of the order's first payment, or `cod` when it has none yet. */
    public function paymentGateway(): string
    {
        return (string) ($this->payments()->value('gateway') ?? 'cod');
    }

    public function amountDueMinor(): int
    {
        return max(0, $this->grand_total_minor - $this->paid_minor);
    }

    public function isCod(): bool
    {
        return OrderStatus::isCashOnDelivery($this->paymentGateway());
    }
}
