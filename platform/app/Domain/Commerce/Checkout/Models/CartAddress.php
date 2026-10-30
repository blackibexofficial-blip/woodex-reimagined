<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Where a cart would be delivered, while it is still a cart.
 *
 * One row per type (shipping, billing) enforced by a unique index: a cart cannot have two
 * shipping addresses, and "the last one saved" is not a rule anyone can reason about at 9pm
 * on a Friday.
 */
class CartAddress extends Model
{
    public const string SHIPPING = 'shipping';

    public const string BILLING = 'billing';

    protected $table = 'commerce_cart_addresses';

    protected $guarded = ['id'];

    /** @return BelongsTo<Cart, $this> */
    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class);
    }
}
