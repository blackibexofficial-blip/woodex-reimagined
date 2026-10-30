<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The address as it was at placement.
 *
 * Copied from the cart rather than joined to the customer's address book: people move, and a
 * two-year-old invoice must still show where the furniture actually went.
 */
class OrderAddress extends Model
{
    public const string SHIPPING = 'shipping';

    public const string BILLING = 'billing';

    protected $table = 'commerce_order_addresses';

    protected $guarded = ['id'];

    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function oneLine(): string
    {
        return implode(', ', array_filter([
            $this->line1,
            $this->line2,
            $this->city,
            $this->province,
            $this->postcode,
        ]));
    }
}
