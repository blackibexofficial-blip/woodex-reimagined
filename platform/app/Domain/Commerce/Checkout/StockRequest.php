<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

use InvalidArgumentException;

/** One thing a cart wants: this variant, this many of it. */
final readonly class StockRequest
{
    public function __construct(
        public string $variantId,
        public string $sku,
        public int $qty,
    ) {
        if ($qty < 1) {
            throw new InvalidArgumentException("Requested quantity for [{$sku}] must be at least 1.");
        }
    }
}
