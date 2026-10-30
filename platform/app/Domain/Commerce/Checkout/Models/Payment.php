<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use App\Domain\Commerce\Checkout\OrderStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One attempt to collect money.
 *
 * A row exists from the moment the order is placed, with `pending`, even for cash on delivery —
 * "there is a payment expected" is a fact worth storing, and it is what the delivery step flips
 * to `paid`. A failed gateway attempt stays as a second row rather than overwriting the first,
 * so the retry history is visible.
 */
class Payment extends Model
{
    protected $table = 'commerce_payments';

    protected $guarded = ['id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'amount_minor' => 'integer',
            'paid_at' => 'datetime',
            'payload' => 'array',
        ];
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<Invoice, $this> */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function markPaid(?string $reference = null): void
    {
        $this->status = OrderStatus::PAYMENT_PAID;
        $this->paid_at = now();

        if ($reference !== null) {
            $this->reference = $reference;
        }

        $this->save();
    }

    public function isCod(): bool
    {
        return OrderStatus::isCashOnDelivery($this->gateway);
    }
}
