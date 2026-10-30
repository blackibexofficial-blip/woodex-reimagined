<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Models\ProductVariant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line in a cart.
 *
 * `unit_price_minor` is copied from the catalog when the line is added, not read at render
 * time. That is a deliberate choice with a cost: a price change does not reach a cart that is
 * already open. The alternative — re-pricing an open cart silently — is worse, because the
 * customer can be looking at a number that changes under them. The cart recalculates on
 * quantity change and at checkout, and says so.
 */
class CartItem extends Model
{
    protected $table = 'commerce_cart_items';

    protected $guarded = ['id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'qty' => 'integer',
            'unit_price_minor' => 'integer',
            'line_discount_minor' => 'integer',
            'line_tax_minor' => 'integer',
            'line_total_minor' => 'integer',
            'tax_rate_bp' => 'integer',
            'meta' => 'array',
            'position' => 'integer',
        ];
    }

    /** @return BelongsTo<Cart, $this> */
    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class);
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** The row shape `PricedCart::fromRows()` expects. */
    /** @return array<string, mixed> */
    public function toPricingRow(): array
    {
        return [
            'sku' => $this->sku,
            'name' => $this->name,
            'qty' => $this->qty,
            'unit_price_minor' => $this->unit_price_minor,
            'tax_rate_bp' => $this->tax_rate_bp,
            'product_id' => $this->product_id,
            'position' => $this->position,
        ];
    }
}
