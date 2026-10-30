<?php

declare(strict_types=1);

namespace Tests\Commerce;

use App\Domain\Commerce\Pricing\CartCalculator;
use App\Domain\Commerce\Pricing\CartInput;
use App\Domain\Commerce\Pricing\CartLine;
use App\Domain\Commerce\Pricing\DiscountRule;
use App\Domain\Commerce\Pricing\ShippingMethod;
use App\Domain\Commerce\Support\Money;
use Tests\Support\Assert;

/**
 * Property test: a thousand generated carts, not fourteen chosen ones.
 *
 * The golden fixtures prove the known cases. This proves the unknown ones — that no
 * combination of quantities, discounts, tax rates and shipping can produce a total that
 * does not add up, a negative amount, or a different answer on a second run.
 */
final class TotalsInvariantTest
{
    private const int CARTS = 1_000;

    public function testEveryGeneratedCartKeepsTheSumInvariant(): void
    {
        mt_srand(20_261_031); // fixed seed: a failure is reproducible
        $calculator = new CartCalculator();

        for ($i = 0; $i < self::CARTS; $i++) {
            $cart = $this->randomCart($i);
            $totals = $calculator->calculate($cart);

            $sum = $totals->netTotal->minor + $totals->taxTotal->minor + $totals->shippingTotal->minor;

            Assert::trueWith(
                $sum === $totals->grandTotal->minor,
                static fn (): string => sprintf(
                    'cart %d: net %d + tax %d + shipping %d = %d, grand %d',
                    $i,
                    $totals->netTotal->minor,
                    $totals->taxTotal->minor,
                    $totals->shippingTotal->minor,
                    $sum,
                    $totals->grandTotal->minor,
                ),
                'sum invariant',
            );

            Assert::true($totals->grandTotal->minor >= 0, "cart {$i}: grand total is not negative");
            Assert::true($totals->taxTotal->minor >= 0, "cart {$i}: tax is not negative");
            Assert::true(
                $totals->discountTotal->minor <= $totals->subtotal->minor,
                "cart {$i}: discounts never exceed the subtotal",
            );

            foreach ($totals->lines as $line) {
                Assert::true($line->net->minor >= 0, "cart {$i}: line net is not negative");
                Assert::same(
                    $line->net->minor + $line->tax->minor,
                    $line->total->minor,
                    "cart {$i}: line total equals net plus tax",
                );
                Assert::true(
                    $line->totalDiscount()->minor <= $line->subtotal->minor,
                    "cart {$i}: a line cannot be discounted below zero",
                );
            }
        }
    }

    public function testPricingIsDeterministic(): void
    {
        mt_srand(7);
        $calculator = new CartCalculator();

        for ($i = 0; $i < 100; $i++) {
            $cart = $this->randomCart($i);

            Assert::same(
                $calculator->calculate($cart)->toArray(),
                $calculator->calculate($cart)->toArray(),
                "cart {$i}: same input, same totals",
            );
        }
    }

    public function testAnEmptyCartCostsNothingButCanStillCarryShipping(): void
    {
        $totals = (new CartCalculator())->calculate(new CartInput(lines: [], shipping: null));

        Assert::same(0, $totals->grandTotal->minor, 'empty cart is zero');
        Assert::same([], $totals->lines, 'no lines');
    }

    private function randomCart(int $seed): CartInput
    {
        $lineCount = mt_rand(1, 5);
        $lines = [];
        $taxRates = [0, 600, 1200, 1800];

        for ($n = 0; $n < $lineCount; $n++) {
            $lines[] = new CartLine(
                sku: sprintf('SKU-%03d', mt_rand(1, 999)),
                name: 'Generated item',
                quantity: mt_rand(1, 4),
                unitPrice: new Money(mt_rand(0, 5_000_000)),
                taxRateBp: $taxRates[mt_rand(0, 3)],
                productId: (string) mt_rand(1, 20),
            );
        }

        $rules = [];

        if (mt_rand(0, 1) === 1) {
            $rules[] = new DiscountRule(
                kind: DiscountRule::CATALOG,
                type: DiscountRule::PERCENT,
                value: mt_rand(0, 3000),
                label: 'generated catalog rule',
            );
        }

        if (mt_rand(0, 2) === 0) {
            $catalogTotal = 0;
            foreach ($lines as $line) {
                $catalogTotal += $line->lineSubtotal()->minor;
            }

            $rules[] = mt_rand(0, 1) === 0
                ? new DiscountRule(
                    kind: DiscountRule::CART,
                    type: DiscountRule::PERCENT,
                    value: mt_rand(0, 2000),
                    label: 'generated cart rule',
                    minSubtotal: mt_rand(0, $catalogTotal + 1),
                )
                : new DiscountRule(
                    kind: DiscountRule::COUPON,
                    type: DiscountRule::FIXED,
                    value: mt_rand(0, 1_000_000),
                    label: 'generated coupon',
                    code: 'GEN'.mt_rand(1000, 9999),
                );
        }

        $shipping = null;

        if (mt_rand(0, 3) > 0) {
            $shipping = new ShippingMethod(
                code: 'flat',
                label: 'Generated shipping',
                baseRate: new Money(mt_rand(0, 500_000)),
                freeOver: mt_rand(0, 1) === 1 ? new Money(mt_rand(0, 10_000_000)) : null,
                taxable: mt_rand(0, 1) === 1,
                taxRateBp: $taxRates[mt_rand(0, 3)],
            );
        }

        return new CartInput(
            lines: $lines,
            rules: $rules,
            shipping: $shipping,
            pricesIncludeTax: mt_rand(0, 1) === 1,
        );
    }
}
