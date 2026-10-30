<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Pricing;

use App\Domain\Commerce\Support\Money;

/**
 * A shipping option offered for a cart.
 *
 * `freeOver` is an order-value threshold in the cart currency: when the pre-discount
 * subtotal reaches it, the rate becomes zero. `taxable` + `taxRateBp` describe how the
 * freight itself is taxed, which is a separate setting from the goods' tax.
 */
final readonly class ShippingMethod
{
    public function __construct(
        public string $code,
        public string $label,
        public Money $baseRate,
        public ?Money $freeOver = null,
        public bool $taxable = false,
        public int $taxRateBp = 0,
        public int $etaDays = 3,
    ) {}

    public function isFreeAbove(Money $subtotal): bool
    {
        return $this->freeOver !== null && $subtotal->greaterThanOrEqual($this->freeOver);
    }
}
