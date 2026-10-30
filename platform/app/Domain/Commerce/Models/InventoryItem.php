<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Stock for one variant in one place.
 *
 * `reserved` is held by carts that have not paid yet. Availability is `qty - reserved`,
 * and that subtraction is the whole defence against selling the same chair twice.
 */
class InventoryItem extends Model
{
    protected $table = 'commerce_inventory_items';

    protected $guarded = ['id'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'qty' => 'integer',
            'reserved' => 'integer',
            'low_stock_threshold' => 'integer',
        ];
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    /** @return BelongsTo<InventorySource, $this> */
    public function source(): BelongsTo
    {
        return $this->belongsTo(InventorySource::class, 'source_id');
    }

    public function available(): int
    {
        return max(0, $this->qty - $this->reserved);
    }

    public function isBelowThreshold(): bool
    {
        return $this->available() <= $this->low_stock_threshold;
    }

    /** @param  Builder<self>  $query */
    public function scopeLow(Builder $query): void
    {
        $query->whereColumn('qty', '<=', 'low_stock_threshold');
    }
}
