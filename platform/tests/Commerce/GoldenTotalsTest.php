<?php

declare(strict_types=1);

namespace Tests\Commerce;

use App\Domain\Commerce\Pricing\CartCalculator;
use Tests\Support\Assert;
use Tests\Support\FixtureFactory;

/**
 * The 14 golden carts. Every number is written by hand in the JSON fixture and checked
 * against the calculator — so a change in the pipeline has to be argued with a fixture,
 * not silently accepted by regenerating expectations.
 */
final class GoldenTotalsTest
{
    public function testEveryFixtureReconcilesToThePaisa(): void
    {
        $calculator = new CartCalculator();

        foreach (FixtureFactory::all() as ['key' => $key, 'fixture' => $fixture]) {
            Assert::$context = $key.' · '.$fixture['name'];

            $totals = $calculator->calculate(FixtureFactory::cart($fixture));
            $expect = $fixture['expect'];

            foreach ([
                'subtotal' => $totals->subtotal->minor,
                'discount_total' => $totals->discountTotal->minor,
                'net_total' => $totals->netTotal->minor,
                'tax_total' => $totals->taxTotal->minor,
                'shipping_total' => $totals->shippingTotal->minor,
                'shipping_tax' => $totals->shippingTax->minor,
                'grand_total' => $totals->grandTotal->minor,
            ] as $field => $actual) {
                Assert::same($expect[$field], $actual, $field);
            }

            if (isset($expect['line_discounts'])) {
                Assert::same(
                    $expect['line_discounts'],
                    array_map(static fn ($line): int => $line->totalDiscount()->minor, $totals->lines),
                    'discount per line',
                );
            }

            if (isset($expect['line_net'])) {
                Assert::same(
                    $expect['line_net'],
                    array_map(static fn ($line): int => $line->net->minor, $totals->lines),
                    'net per line',
                );
            }

            // Every fixture, additionally: the line totals and the header agree.
            $lineSum = array_sum(array_map(static fn ($line): int => $line->total->minor, $totals->lines));
            Assert::same(
                $totals->grandTotal->minor,
                $lineSum + $totals->shippingTotal->minor + $totals->shippingTax->minor,
                'lines + shipping + shipping tax == grand total',
            );
        }

        Assert::$context = '';
    }

    public function testTheFixtureSetCoversEveryPricingMode(): void
    {
        $keys = array_column(FixtureFactory::all(), 'key');

        // The list is the specification: adding a pricing mode means adding a fixture.
        foreach ([
            '01_simple',
            '02_qty_gt_one',
            '03_group_price',
            '04_catalog_rule',
            '05_cart_rule',
            '06_coupon_capped',
            '07_free_shipping_threshold',
            '08_tax_inclusive',
            '09_tax_exclusive',
            '10_mixed_tax_rates',
            '11_taxed_shipping',
            '12_discount_split_remainder',
            '13_rounding_half_up',
            '14_zero_price_line',
        ] as $required) {
            Assert::true(in_array($required, $keys, true), "fixture {$required} exists");
        }
    }
}
