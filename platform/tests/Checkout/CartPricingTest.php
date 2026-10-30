<?php

declare(strict_types=1);

namespace Tests\Checkout;

use App\Domain\Commerce\Checkout\PricedCart;
use App\Domain\Commerce\Pricing\CartCalculator;
use App\Domain\Commerce\Pricing\DiscountRule;
use App\Domain\Commerce\Pricing\ShippingMethod;
use App\Domain\Commerce\Support\Money;
use InvalidArgumentException;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The bridge between a cart row and the calculator.
 *
 * This is where a database value becomes money, and it is the last chance to catch a bad row
 * before it is priced: a zero quantity, a missing SKU, a price that is not a number. The
 * calculator is entitled to assume all of that is already true, and this file is what makes
 * that assumption safe.
 */
final class CartPricingTest extends TestCase
{
    private CartCalculator $calculator;

    public function setUp(): void
    {
        $this->calculator = new CartCalculator;
    }

    public function testRowsBecomePricedLines(): void
    {
        $cart = PricedCart::fromRows([
            ['sku' => 'WX-1001', 'name' => 'Sofa', 'qty' => 1, 'unit_price_minor' => 12_500_000],
            ['sku' => 'WX-1002', 'name' => 'Chair', 'qty' => 2, 'unit_price_minor' => 3_450_000],
        ]);

        $totals = $this->calculator->calculate($cart);

        Assert::same(2, $cart->count(), 'two lines');
        Assert::same(19_400_000, $totals->subtotal->minor, '12,500,000 + 2 × 3,450,000');
        Assert::same(0, $totals->taxTotal->minor, 'no tax rate was set, so no tax');
        Assert::same(19_400_000, $totals->grandTotal->minor, 'the sum is the total');
    }

    public function testDatabaseStringsAreCastWithoutLosingPaisa(): void
    {
        $cart = PricedCart::fromRows([
            ['sku' => 'WX-1001', 'name' => 'Sofa', 'qty' => '2', 'unit_price_minor' => '3450000', 'tax_rate_bp' => '1800'],
        ]);

        $totals = $this->calculator->calculate($cart);

        Assert::same(6_900_000, $totals->subtotal->minor, 'strings from MySQL are integers here');
        Assert::same(1_242_000, $totals->taxTotal->minor, '18% of 6,900,000');
        Assert::same(8_142_000, $totals->grandTotal->minor, 'and the total follows');
    }

    public function testAZeroQuantityIsRefusedRatherThanPriced(): void
    {
        Assert::throws(
            InvalidArgumentException::class,
            static fn () => PricedCart::fromRows([['sku' => 'WX-1001', 'qty' => 0, 'unit_price_minor' => 100]]),
            'zero-quantity lines must be removed, not silently priced at zero',
        );
    }

    public function testARowWithoutAnSkuIsRefused(): void
    {
        Assert::throws(
            InvalidArgumentException::class,
            static fn () => PricedCart::fromRows([['qty' => 1, 'unit_price_minor' => 100]]),
            'a line with no SKU cannot be shipped or returned',
        );
    }

    public function testAnEmptyCartPricesToZeroWithoutInventingLines(): void
    {
        $totals = $this->calculator->calculate(PricedCart::fromRows([]));

        Assert::same(0, $totals->grandTotal->minor, 'zero');
        Assert::same([], $totals->lines, 'no lines');
    }

    public function testAFreeShippingThresholdIsHonouredFromStoredPaisa(): void
    {
        $shipping = new ShippingMethod(
            code: 'cod',
            label: 'Cash on delivery',
            baseRate: new Money(250_000),
            freeOver: new Money(2_000_000),
        );

        $under = $this->calculator->calculate(PricedCart::fromRows(
            [['sku' => 'WX-1002', 'qty' => 1, 'unit_price_minor' => 1_500_000]],
            shipping: $shipping,
        ));

        $over = $this->calculator->calculate(PricedCart::fromRows(
            [['sku' => 'WX-1002', 'qty' => 1, 'unit_price_minor' => 2_500_000]],
            shipping: $shipping,
        ));

        Assert::same(250_000, $under->shippingTotal->minor, 'below the threshold, delivery is charged');
        Assert::same(0, $over->shippingTotal->minor, 'above it, delivery is free');
        Assert::same(true, $over->freeShipping, 'and the customer is told so');
    }

    public function testACouponIsPassedThroughToTheCalculator(): void
    {
        $cart = PricedCart::fromRows(
            [['sku' => 'WX-1001', 'qty' => 1, 'unit_price_minor' => 10_000_000]],
            rules: [new DiscountRule(DiscountRule::COUPON, DiscountRule::PERCENT, 1000, 'Eid sale', 'EID10')],
        );

        $totals = $this->calculator->calculate($cart);

        Assert::same(9_000_000, $totals->grandTotal->minor, '10% off');
        Assert::same(['EID10 · Eid sale'], $totals->appliedRules, 'and the reason is recorded');
    }

    public function testTaxInclusivePricesAreSplitNotAdded(): void
    {
        $totals = $this->calculator->calculate(PricedCart::fromRows(
            [['sku' => 'WX-1001', 'qty' => 1, 'unit_price_minor' => 11_800_000, 'tax_rate_bp' => 1800]],
            pricesIncludeTax: true,
        ));

        Assert::same(11_800_000, $totals->grandTotal->minor, 'the customer pays what was on the shelf');
        Assert::same(10_000_000, $totals->netTotal->minor, 'the net is extracted');
        Assert::same(1_800_000, $totals->taxTotal->minor, 'and the tax with it');
    }

    public function testOneLineOfCalculatedTotalsWritesTheColumnsBothTablesShare(): void
    {
        $totals = $this->calculator->calculate(PricedCart::fromRows(
            [['sku' => 'WX-1001', 'name' => 'Sofa', 'qty' => 2, 'unit_price_minor' => 5_000_000, 'tax_rate_bp' => 1800]],
            rules: [new DiscountRule(DiscountRule::CART, DiscountRule::PERCENT, 1000, 'Sale')],
        ));

        $columns = PricedCart::itemColumns($totals->lines[0]);

        Assert::same([
            'sku' => 'WX-1001',
            'name' => 'Sofa',
            'qty' => 2,
            'unit_price_minor' => 5_000_000,
            'line_discount_minor' => 1_000_000,
            'line_tax_minor' => 1_620_000,
            'line_total_minor' => 10_620_000,
            'tax_rate_bp' => 1800,
        ], $columns, 'the cart row and the order row are written by the same call');
    }
}
