<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Pricing;

use App\Domain\Commerce\Support\Money;

/**
 * The full money story of one line, kept so an invoice, a refund or a support agent can
 * explain *why* a number is what it is, months later.
 */
final readonly class LineTotal
{
    public function __construct(
        public string $sku,
        public string $name,
        public int $quantity,
        public Money $unitPrice,
        public Money $subtotal,
        public Money $catalogDiscount,
        public Money $cartDiscount,
        /** Amount before tax (after every discount). */
        public Money $net,
        public Money $tax,
        /** What the customer pays for this line, tax included where applicable. */
        public Money $total,
        public int $taxRateBp = 0,
    ) {}

    public function totalDiscount(): Money
    {
        return $this->catalogDiscount->plus($this->cartDiscount);
    }
}
