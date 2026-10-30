<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

use App\Domain\Commerce\Pricing\CartInput;
use App\Domain\Commerce\Pricing\CartLine;
use App\Domain\Commerce\Pricing\DiscountRule;
use App\Domain\Commerce\Pricing\ShippingMethod;
use App\Domain\Commerce\Support\Money;
use InvalidArgumentException;

/**
 * The bridge between a cart row in the database and the calculator.
 *
 * Everything the money pipeline needs arrives here as plain arrays, so the step that most
 * often goes wrong — reading stored paisa and turning it into a priced line — is a pure
 * function that can be tested without a database. If a quantity is zero or a price is
 * negative, this throws; the calculator never has to defend itself.
 */
final readonly class PricedCart
{
    /**
     * @param  list<array{
     *     sku: string,
     *     name?: string,
     *     qty: int|string,
     *     unit_price_minor: int|string,
     *     tax_rate_bp?: int|string,
     *     product_id?: int|string,
     *     position?: int|string
     * }>  $rows  as stored in `commerce_cart_items`
     * @param  list<DiscountRule>  $rules
     */
    public static function fromRows(
        array $rows,
        string $currency = 'PKR',
        bool $pricesIncludeTax = false,
        ?ShippingMethod $shipping = null,
        array $rules = [],
    ): CartInput {
        $lines = [];

        foreach (array_values($rows) as $index => $row) {
            if (! isset($row['sku'])) {
                throw new InvalidArgumentException("Cart row {$index} has no SKU.");
            }

            $sku = (string) $row['sku'];
            $quantity = (int) ($row['qty'] ?? 0);

            if ($quantity < 1) {
                throw new InvalidArgumentException("Cart row [{$sku}] has a quantity of {$quantity}. Zero-quantity lines must be removed, not priced.");
            }

            $lines[] = new CartLine(
                sku: $sku,
                name: (string) ($row['name'] ?? $sku),
                quantity: $quantity,
                unitPrice: new Money((int) ($row['unit_price_minor'] ?? 0), $currency),
                taxRateBp: (int) ($row['tax_rate_bp'] ?? 0),
                productId: isset($row['product_id']) ? (string) $row['product_id'] : '',
                position: (int) ($row['position'] ?? $index),
            );
        }

        return new CartInput(
            lines: $lines,
            rules: $rules,
            shipping: $shipping,
            pricesIncludeTax: $pricesIncludeTax,
            currency: $currency,
        );
    }

    /**
     * Turn one line of calculated totals back into the columns `commerce_cart_items` and
     * `commerce_order_items` share, so a cart line and an order line are written the same way.
     *
     * @return array<string, mixed>
     */
    public static function itemColumns(\App\Domain\Commerce\Pricing\LineTotal $total, ?string $name = null): array
    {
        return [
            'sku' => $total->sku,
            'name' => $name ?? $total->name,
            'qty' => $total->quantity,
            'unit_price_minor' => $total->unitPrice->minor,
            'line_discount_minor' => $total->totalDiscount()->minor,
            'line_tax_minor' => $total->tax->minor,
            'line_total_minor' => $total->total->minor,
            'tax_rate_bp' => $total->taxRateBp,
        ];
    }
}
