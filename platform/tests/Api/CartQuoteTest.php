<?php

declare(strict_types=1);

namespace Tests\Api;

use App\Domain\Commerce\Api\CartQuote;
use App\Domain\Commerce\Checkout\CartService;
use App\Domain\Commerce\Checkout\PricedCart;
use App\Domain\Commerce\Pricing\CartCalculator;
use App\Domain\Commerce\Pricing\CartTotals;
use App\Domain\Commerce\Support\Money;
use InvalidArgumentException;
use Tests\Support\Assert;

/**
 * The basket the customer is shown and the basket they are charged with.
 *
 * The calculator has its own golden fixtures; what is tested here is the last hop — that the
 * priced lines survive the trip into JSON with the right photograph, the right product URL and
 * the same arithmetic. A basket that is correct in the calculator and wrong on the screen is
 * still a support ticket.
 */
final class CartQuoteTest extends \Tests\TestCase
{
    /** @param list<array<string, mixed>> $rows */
    private function totals(array $rows): CartTotals
    {
        return (new CartCalculator)->calculate(PricedCart::fromRows(
            $rows,
            shipping: CartService::cashOnDelivery(),
        ));
    }

    /** @return list<array<string, mixed>> */
    private function rows(): array
    {
        return [
            [
                'sku' => 'WX-1001',
                'name' => 'BALLMER Executive Desk',
                'qty' => 2,
                'unit_price_minor' => 5200000,
                'tax_rate_bp' => 1800,
                'product_id' => '7',
                'position' => 0,
            ],
            [
                'sku' => 'WX-1002',
                'name' => 'Manager Desk',
                'qty' => 1,
                'unit_price_minor' => 3100000,
                'tax_rate_bp' => 1800,
                'product_id' => '8',
                'position' => 1,
            ],
        ];
    }

    public function testThePricedLinesAddUpToTheTotalTheCustomerIsShown(): void
    {
        $totals = $this->totals($this->rows());
        $quote = CartQuote::fromLineTotals($totals->lines, $totals);
        $json = $quote->toArray();

        $lineSum = array_sum(array_column($json['lines'], 'line_total_minor'));

        Assert::same(
            $json['totals']['shipping_total'] + $lineSum,
            $json['totals']['grand_total'],
            'lines plus shipping equal the grand total',
        );
        Assert::same(3, $json['item_count'], 'two desks and one chair is three items');
        Assert::same('PKR', $json['currency'], 'prices are in rupees');
    }

    public function testDisplayDataIsJoinedBySkuAndNotByPosition(): void
    {
        $totals = $this->totals($this->rows());
        $quote = CartQuote::fromLineTotals($totals->lines, $totals, [
            // deliberately in the opposite order to the basket
            'WX-1002' => ['slug' => 'manager-desk', 'image' => '/m.webp', 'color' => 'Walnut'],
            'WX-1001' => ['slug' => 'ballmer-executive-desk', 'image' => '/b.webp', 'color' => 'Oak'],
        ]);

        $lines = $quote->toArray()['lines'];

        Assert::same('ballmer-executive-desk', $lines[0]['slug'], 'the first line keeps its own product');
        Assert::same('/b.webp', $lines[0]['image'], 'and its own photograph');
        Assert::same('Oak', $lines[0]['color'], 'and its own finish');
        Assert::same('manager-desk', $lines[1]['slug'], 'the second line is not shifted');
        Assert::same('/m.webp', $lines[1]['image'], 'or given the wrong photograph');
    }

    public function testAQuoteWithoutDisplayDataStillRenders(): void
    {
        $totals = $this->totals($this->rows());
        $lines = CartQuote::fromLineTotals($totals->lines, $totals)->toArray()['lines'];

        Assert::same('WX-1001', $lines[0]['slug'], 'the SKU stands in for the slug');
        Assert::same(null, $lines[0]['image'], 'no photograph is null, not a broken URL');
        Assert::same(null, $lines[0]['color'], 'and no finish is null');
    }

    public function testAnEmptyBasketQuotesZeroRatherThanThrowing(): void
    {
        $totals = $this->totals([]);
        $quote = CartQuote::fromLineTotals($totals->lines, $totals);
        $json = $quote->toArray();

        Assert::same(true, $quote->isEmpty(), 'it says it is empty');
        Assert::same([], $json['lines'], 'with no lines');
        Assert::same(0, $json['totals']['grand_total'], 'and no total');
        Assert::same(0, $json['item_count'], 'and no items');
    }

    public function testMoneyIsIntegerMinorUnitsAllTheWayToThePayload(): void
    {
        $totals = $this->totals($this->rows());
        $json = CartQuote::fromLineTotals($totals->lines, $totals)->toArray();

        foreach ($json['totals'] as $key => $value) {
            if (is_int($value)) {
                Assert::true($value >= 0, "totals.{$key} is not negative");
            }
        }

        Assert::same(true, is_int($json['lines'][0]['unit_price_minor']), 'the unit price is an integer');
        Assert::same(5200000, $json['lines'][0]['unit_price_minor'], 'and it is paisa, not rupees');
        Assert::same('PKR 52,000.00', $json['lines'][0]['unit_price'], 'while the display string is rupees');
    }

    public function testATamperedTotalIsRefusedBeforeItReachesACustomer(): void
    {
        $totals = $this->totals($this->rows());

        $short = new CartTotals(
            subtotal: $totals->subtotal,
            discountTotal: $totals->discountTotal,
            netTotal: $totals->netTotal,
            taxTotal: $totals->taxTotal,
            shippingTotal: $totals->shippingTotal,
            shippingTax: $totals->shippingTax,
            grandTotal: $totals->grandTotal->minus(Money::ofMinor(1)),
            lines: $totals->lines,
            appliedRules: $totals->appliedRules,
            freeShipping: $totals->freeShipping,
            pricesIncludeTax: $totals->pricesIncludeTax,
        );

        try {
            CartQuote::fromLineTotals($totals->lines, $short);
            Assert::true(false, 'a basket that does not add up was accepted');
        } catch (InvalidArgumentException $e) {
            Assert::true(str_contains($e->getMessage(), 'Priced lines total'), 'or refused for the right reason');
        }
    }

    public function testDeliveringToLahoreIsFreeAboveTheThresholdAndChargedBelowIt(): void
    {
        $cheap = $this->totals([[
            'sku' => 'WX-9002',
            'name' => 'Visitor Chair',
            'qty' => 1,
            'unit_price_minor' => 4500000,   // ₨45,000 — under the free-delivery threshold
            'tax_rate_bp' => 1800,
        ]]);

        $expensive = $this->totals([[
            'sku' => 'WX-9003',
            'name' => 'Boardroom Table',
            'qty' => 1,
            'unit_price_minor' => 25000000,  // ₨250,000 — over it
            'tax_rate_bp' => 1800,
        ]]);

        $cheapJson = CartQuote::fromLineTotals($cheap->lines, $cheap)->toArray();
        $expensiveJson = CartQuote::fromLineTotals($expensive->lines, $expensive)->toArray();

        Assert::same(250000, $cheapJson['totals']['shipping_total'], 'a small order pays ₨2,500 delivery');
        Assert::same(false, $cheapJson['free_shipping'], 'and says so');
        Assert::same(0, $expensiveJson['totals']['shipping_total'], 'a large order does not');
        Assert::same(true, $expensiveJson['free_shipping'], 'and says so');
    }
}
