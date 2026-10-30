<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Pricing;

use App\Domain\Commerce\Support\Money;
use InvalidArgumentException;

/**
 * One line of a cart as it reaches the calculator.
 *
 * `unitPrice` is already resolved: the caller applies the customer group price or a
 * catalog price override before handing the line over. The calculator's job is totals,
 * not entitlement.
 */
final readonly class CartLine
{
    public function __construct(
        public string $sku,
        public string $name,
        public int $quantity,
        public Money $unitPrice,
        public int $taxRateBp = 0,
        public string $productId = '',
        public int $position = 0,
    ) {
        if ($quantity < 1) {
            throw new InvalidArgumentException("Quantity must be at least 1 for SKU [{$sku}].");
        }

        if ($unitPrice->isNegative()) {
            throw new InvalidArgumentException("Unit price cannot be negative for SKU [{$sku}].");
        }

        if ($taxRateBp < 0) {
            throw new InvalidArgumentException("Tax rate cannot be negative for SKU [{$sku}].");
        }
    }

    public function lineSubtotal(): Money
    {
        return $this->unitPrice->times($this->quantity);
    }
}
