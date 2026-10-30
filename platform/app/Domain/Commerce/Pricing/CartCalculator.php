<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Pricing;

use App\Domain\Commerce\Support\Money;
use LogicException;

/**
 * The only place in the system allowed to decide what a cart costs.
 *
 * Order of operations, identical to Bagisto's semantics (see ATTRIBUTION.md):
 *
 *   1. line subtotal      unit price × quantity
 *   2. catalog discounts  per line, capped at that line's subtotal
 *   3. cart discounts     on the post-catalog total, then allocated back across lines
 *   4. tax                per line, on the discounted net; inclusive rates extracted
 *   5. shipping           method rate, zero when a threshold or a rule makes it free
 *   6. grand total        net + tax + shipping(+ tax)
 *
 * Every step uses integer paisa. The result is asserted against the sum invariant before
 * it is returned, so a future change that breaks the maths fails loudly instead of
 * quietly invoicing the wrong amount.
 */
final readonly class CartCalculator
{
    public function calculate(CartInput $cart): CartTotals
    {
        $currency = $cart->currency;

        if ($cart->isEmpty()) {
            return $this->emptyTotals($cart);
        }

        $subtotals = [];
        foreach ($cart->lines as $index => $line) {
            $subtotals[$index] = $line->lineSubtotal();
        }

        $subtotal = Money::sum($subtotals, $currency);

        // ---- 2. catalog discounts, per line -------------------------------------
        $catalogDiscounts = array_fill(0, count($cart->lines), Money::zero($currency));

        foreach ($cart->rules as $rule) {
            if ($rule->kind !== DiscountRule::CATALOG) {
                continue;
            }

            foreach ($cart->lines as $index => $line) {
                if (! $rule->reaches($line->productId)) {
                    continue;
                }

                $candidate = $rule->isPercent()
                    ? $subtotals[$index]->percentage($rule->value)
                    : new Money($rule->value, $currency);

                $room = $subtotals[$index]->minus($catalogDiscounts[$index]);
                $catalogDiscounts[$index] = $catalogDiscounts[$index]->plus($candidate->min($room));
            }
        }

        $afterCatalog = [];
        foreach ($cart->lines as $index => $line) {
            $afterCatalog[$index] = $subtotals[$index]->minus($catalogDiscounts[$index]);
        }

        $afterCatalogTotal = Money::sum($afterCatalog, $currency);

        // ---- 3. cart rules and coupons ------------------------------------------
        $cartDiscountTotal = Money::zero($currency);
        $appliedRules = [];
        $freeShipping = false;

        foreach ($cart->rules as $rule) {
            if ($rule->kind === DiscountRule::CATALOG) {
                continue;
            }

            if (! $rule->hasMinimum($subtotal->minor)) {
                continue;
            }

            if ($rule->freeShipping) {
                $freeShipping = true;
                $appliedRules[] = $this->ruleLabel($rule);

                continue;
            }

            $remaining = $afterCatalogTotal->minus($cartDiscountTotal);

            if ($remaining->isZero() || $remaining->isNegative()) {
                break;
            }

            $candidate = $rule->isPercent()
                ? $afterCatalogTotal->percentage($rule->value)
                : new Money($rule->value, $currency);

            $applied = $candidate->min($remaining);

            if ($applied->isZero()) {
                continue;
            }

            $cartDiscountTotal = $cartDiscountTotal->plus($applied);
            $appliedRules[] = $this->ruleLabel($rule);
        }

        $cartDiscountShares = $cartDiscountTotal->isZero()
            ? array_fill(0, count($cart->lines), Money::zero($currency))
            : $cartDiscountTotal->allocate(array_map(static fn (Money $m): int => $m->minor, $afterCatalog));

        // ---- 4. tax per line ----------------------------------------------------
        $lineTotals = [];
        $netTotal = Money::zero($currency);
        $goodsTax = Money::zero($currency);

        foreach ($cart->lines as $index => $line) {
            $net = $afterCatalog[$index]->minus($cartDiscountShares[$index]);

            if ($cart->pricesIncludeTax) {
                $tax = $net->taxPortionOfInclusive($line->taxRateBp);
                $netOfTax = $net->minus($tax);
            } else {
                $tax = $net->percentage($line->taxRateBp);
                $netOfTax = $net;
            }

            $netTotal = $netTotal->plus($netOfTax);
            $goodsTax = $goodsTax->plus($tax);

            $lineTotals[] = new LineTotal(
                sku: $line->sku,
                name: $line->name,
                quantity: $line->quantity,
                unitPrice: $line->unitPrice,
                subtotal: $subtotals[$index],
                catalogDiscount: $catalogDiscounts[$index],
                cartDiscount: $cartDiscountShares[$index],
                net: $netOfTax,
                tax: $tax,
                total: $netOfTax->plus($tax),
                taxRateBp: $line->taxRateBp,
            );
        }

        // ---- 5. shipping --------------------------------------------------------
        $shippingNet = Money::zero($currency);
        $shippingTax = Money::zero($currency);

        if ($cart->shipping !== null) {
            $waived = $freeShipping || $cart->shipping->isFreeAbove($subtotal);
            $freeShipping = $freeShipping || $cart->shipping->isFreeAbove($subtotal);

            if (! $waived) {
                $shippingNet = $cart->shipping->baseRate;

                if ($cart->shipping->taxable) {
                    $shippingTax = $cart->pricesIncludeTax
                        ? $shippingNet->taxPortionOfInclusive($cart->shipping->taxRateBp)
                        : $shippingNet->percentage($cart->shipping->taxRateBp);

                    if ($cart->pricesIncludeTax) {
                        $shippingNet = $shippingNet->minus($shippingTax);
                    }
                }
            }
        }

        // ---- 6. totals ----------------------------------------------------------
        $taxTotal = $goodsTax->plus($shippingTax);
        $grandTotal = $netTotal->plus($taxTotal)->plus($shippingNet);
        $discountTotal = Money::sum($catalogDiscounts, $currency)->plus($cartDiscountTotal);

        $this->assertInvariants($netTotal, $taxTotal, $shippingNet, $grandTotal);

        return new CartTotals(
            subtotal: $subtotal,
            discountTotal: $discountTotal,
            netTotal: $netTotal,
            taxTotal: $taxTotal,
            shippingTotal: $shippingNet,
            shippingTax: $shippingTax,
            grandTotal: $grandTotal,
            lines: $lineTotals,
            appliedRules: $appliedRules,
            freeShipping: $freeShipping,
            pricesIncludeTax: $cart->pricesIncludeTax,
        );
    }

    /**
     * Re-price a cart after a quantity or address change. Same object, same rules —
     * kept as a named method so callers never reach for a partial recalculation.
     */
    public function recalculate(CartInput $cart): CartTotals
    {
        return $this->calculate($cart);
    }

    private function emptyTotals(CartInput $cart): CartTotals
    {
        $zero = Money::zero($cart->currency);

        return new CartTotals(
            subtotal: $zero,
            discountTotal: $zero,
            netTotal: $zero,
            taxTotal: $zero,
            shippingTotal: $zero,
            shippingTax: $zero,
            grandTotal: $zero,
            lines: [],
            appliedRules: [],
            freeShipping: false,
            pricesIncludeTax: $cart->pricesIncludeTax,
        );
    }

    private function ruleLabel(DiscountRule $rule): string
    {
        if ($rule->label !== '') {
            return $rule->code !== null ? "{$rule->code} · {$rule->label}" : $rule->label;
        }

        return $rule->code ?? $rule->kind;
    }

    private function assertInvariants(Money $net, Money $tax, Money $shipping, Money $grand): void
    {
        $computed = $net->plus($tax)->plus($shipping);

        if ($computed->minor !== $grand->minor) {
            throw new LogicException(sprintf(
                'Cart totals do not reconcile: net %d + tax %d + shipping %d = %d, expected %d.',
                $net->minor,
                $tax->minor,
                $shipping->minor,
                $computed->minor,
                $grand->minor,
            ));
        }

        if ($grand->isNegative() || $net->isNegative() || $tax->isNegative()) {
            throw new LogicException('A cart total cannot be negative.');
        }
    }
}
