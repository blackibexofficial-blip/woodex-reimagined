<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Who moved the order, when, and why.
 *
 * Written in the same transaction as the change it describes. An order with no history is an
 * order somebody edited in the database, which is exactly the thing this table exists to make
 * visible.
 */
class OrderStatusHistory extends Model
{
    protected $table = 'commerce_order_status_history';

    protected $guarded = ['id'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['actor_id' => 'integer'];
    }

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
