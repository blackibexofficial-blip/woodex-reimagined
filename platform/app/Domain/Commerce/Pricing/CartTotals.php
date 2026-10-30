<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Pricing;

use App\Domain\Commerce\Support\Money;

/**
 * The result of pricing a cart. One object, one source of truth, serialisable straight
 * into the checkout response, the order, and the invoice.
 *
 * Invariant, asserted by the calculator on every run:
 *
 *     netTotal + taxTotal + shippingTotal == grandTotal
 *
 * where taxTotal includes tax on shipping. If that ever fails, the calculator throws
 * rather than returning a wrong total.
 */
final readonly class CartTotals
{
    /**
     * @param  list<LineTotal>  $lines
     * @param  list<string>  $appliedRules
     */
    public function __construct(
        public Money $subtotal,
        public Money $discountTotal,
        public Money $netTotal,
        public Money $taxTotal,
        public Money $shippingTotal,
        public Money $shippingTax,
        public Money $grandTotal,
        public array $lines,
        public array $appliedRules = [],
        public bool $freeShipping = false,
        public bool $pricesIncludeTax = false,
    ) {}

    public function taxOnGoods(): Money
    {
        return $this->taxTotal->minus($this->shippingTax);
    }

    /** The saving as basis points of the pre-discount subtotal — 1500 means 15 %. */
    public function savingsBasisPoints(): int
    {
        return $this->discountTotal->basisPointsOf($this->subtotal);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'currency' => $this->grandTotal->currency,
            'subtotal' => $this->subtotal->minor,
            'discount_total' => $this->discountTotal->minor,
            'net_total' => $this->netTotal->minor,
            'tax_total' => $this->taxTotal->minor,
            'tax_on_goods' => $this->taxOnGoods()->minor,
            'shipping_total' => $this->shippingTotal->minor,
            'shipping_tax' => $this->shippingTax->minor,
            'grand_total' => $this->grandTotal->minor,
            'free_shipping' => $this->freeShipping,
            'prices_include_tax' => $this->pricesIncludeTax,
            'applied_rules' => $this->appliedRules,
            'lines' => array_map(static fn (LineTotal $line): array => [
                'sku' => $line->sku,
                'quantity' => $line->quantity,
                'unit_price' => $line->unitPrice->minor,
                'subtotal' => $line->subtotal->minor,
                'catalog_discount' => $line->catalogDiscount->minor,
                'cart_discount' => $line->cartDiscount->minor,
                'net' => $line->net->minor,
                'tax' => $line->tax->minor,
                'total' => $line->total->minor,
                'tax_rate_bp' => $line->taxRateBp,
            ], $this->lines),
        ];
    }
}
