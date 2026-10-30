<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A cart is mutable and disposable — the opposite of the order it becomes.
 *
 * The totals columns are a cache of the last calculation, written by the same call that returns
 * them to the customer, so the cart page and the checkout page can never show two different
 * numbers because one of them recalculated and the other did not.
 */
class Cart extends Model
{
    public const string ACTIVE = 'active';

    public const string CONVERTED = 'converted';

    public const string ABANDONED = 'abandoned';

    protected $table = 'commerce_carts';

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
            'expires_at' => 'datetime',
        ];
    }

    /** @return HasMany<CartItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(CartItem::class)->orderBy('position');
    }

    /** @return HasMany<CartAddress, $this> */
    public function addresses(): HasMany
    {
        return $this->hasMany(CartAddress::class);
    }

    /** @param  Builder<self>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('status', self::ACTIVE);
    }

    public function totalQty(): int
    {
        return (int) $this->items->sum('qty');
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }
}
