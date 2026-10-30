<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Units held for a cart or an order, at one source.
 *
 * This row is the audit trail of a promise: "two chairs in Lahore are yours until 14:35". When
 * the cart expires, is converted or is cancelled, `released_at` and a reason are stamped — the
 * row is never deleted, because "we held it and let it go" is exactly what support needs to
 * explain to a customer who saw the count change.
 */
class InventoryReservation extends Model
{
    public const string CONVERTED = 'converted';

    public const string EXPIRED = 'expired';

    public const string CANCELLED = 'cancelled';

    protected $table = 'commerce_inventory_reservations';

    protected $guarded = ['id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'qty' => 'integer',
            'expires_at' => 'datetime',
            'released_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Cart, $this> */
    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class);
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @param  Builder<self>  $query */
    public function scopeHeld(Builder $query): void
    {
        $query->whereNull('released_at');
    }

    /** @param  Builder<self>  $query */
    public function scopeExpired(Builder $query): void
    {
        $query->whereNull('released_at')->where('expires_at', '<=', now());
    }

    public function release(string $reason): void
    {
        $this->released_at = now();
        $this->release_reason = $reason;
        $this->save();
    }
}
