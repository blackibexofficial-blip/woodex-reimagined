<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A line of an order — a copy, not a reference.
 *
 * The SKU, the name and every amount are frozen at placement. If the product is renamed or
 * repriced next month, the order still says what the customer bought and what they paid for it.
 * `product_id` is kept for reporting and returns, and is nullable so deleting a product never
 * deletes history.
 */
class OrderItem extends Model
{
    protected $table = 'commerce_order_items';

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

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
