<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Models;

use App\Domain\Commerce\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A sellable combination: price, barcode, weight and stock all belong to this row.
 *
 * `availableQty()` subtracts reservations, because a unit held by someone else's unpaid
 * checkout is not for sale — showing it as available is how overselling starts.
 */
class ProductVariant extends Model
{
    use SoftDeletes;

    protected $table = 'commerce_product_variants';

    protected $guarded = ['id'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'price_minor' => 'integer',
            'compare_at_minor' => 'integer',
            'cost_minor' => 'integer',
            'weight_g' => 'integer',
            'position' => 'integer',
        ];
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** @return HasMany<InventoryItem, $this> */
    public function inventory(): HasMany
    {
        return $this->hasMany(InventoryItem::class, 'variant_id');
    }

    /** @return BelongsToMany<Attribute, $this> */
    public function attributes(): BelongsToMany
    {
        return $this->belongsToMany(
            Attribute::class,
            'commerce_variant_options',
            'variant_id',
            'attribute_id',
        )->withPivot('option_id');
    }

    /**
     * The attribute options this variant represents — "Natural Oak", "Black frame".
     *
     * @return BelongsToMany<AttributeOption, $this>
     */
    public function options(): BelongsToMany
    {
        return $this->belongsToMany(
            AttributeOption::class,
            'commerce_variant_options',
            'variant_id',
            'option_id',
        )->withPivot('attribute_id');
    }

    /** @return HasMany<ProductMedia, $this> */
    public function media(): HasMany
    {
        return $this->hasMany(ProductMedia::class, 'variant_id');
    }

    /** The variant's own price, falling back to the product's — never the other way around. */
    public function price(): ?Money
    {
        $minor = $this->price_minor ?? $this->product?->price_minor;

        return $minor !== null ? Money::ofMinor((int) $minor) : null;
    }

    /** Units a customer can actually buy right now, across every warehouse. */
    public function availableQty(): int
    {
        return (int) $this->inventory
            ->sum(static fn (InventoryItem $item): int => max(0, $item->qty - $item->reserved));
    }

    /** @param  Builder<self>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('status', 'active');
    }
}
