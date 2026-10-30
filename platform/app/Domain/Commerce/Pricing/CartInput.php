<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Pricing;

use InvalidArgumentException;

/**
 * Everything the calculator needs to price a cart, with no framework, no database
 * and no HTTP in sight — which is what makes the totals testable to the paisa.
 */
final readonly class CartInput
{
    /** @param  list<CartLine>  $lines  @param  list<DiscountRule>  $rules */
    public function __construct(
        public array $lines,
        public array $rules = [],
        public ?ShippingMethod $shipping = null,
        public bool $pricesIncludeTax = false,
        public string $currency = 'PKR',
    ) {
        foreach ($lines as $line) {
            if (! $line instanceof CartLine) {
                throw new InvalidArgumentException('Every cart line must be a CartLine.');
            }

            if ($line->unitPrice->currency !== $currency) {
                throw new InvalidArgumentException(sprintf(
                    'Line [%s] is in %s but the cart is in %s.',
                    $line->sku,
                    $line->unitPrice->currency,
                    $currency,
                ));
            }
        }
    }

    public function isEmpty(): bool
    {
        return $this->lines === [];
    }

    public function count(): int
    {
        return count($this->lines);
    }

    /** The cart's product ids, in line order. */
    public function productIds(): array
    {
        return array_map(static fn (CartLine $line): string => $line->productId, $this->lines);
    }
}
