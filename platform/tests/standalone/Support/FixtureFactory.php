<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Domain\Commerce\Pricing\CartInput;
use App\Domain\Commerce\Pricing\CartLine;
use App\Domain\Commerce\Pricing\DiscountRule;
use App\Domain\Commerce\Pricing\ShippingMethod;
use App\Domain\Commerce\Support\Money;
use RuntimeException;

/**
 * Turns a JSON fixture into a CartInput. Fixtures are the contract: they are readable by
 * a merchandiser, reviewable in a pull request, and executable.
 */
final class FixtureFactory
{
    /** @param  array<string, mixed>  $fixture */
    public static function cart(array $fixture): CartInput
    {
        $currency = $fixture['currency'] ?? 'PKR';

        $lines = [];
        foreach ($fixture['lines'] as $position => $row) {
            $lines[] = new CartLine(
                sku: $row['sku'],
                name: $row['name'],
                quantity: (int) $row['qty'],
                unitPrice: new Money((int) $row['unit_price'], $currency),
                taxRateBp: (int) ($row['tax_rate_bp'] ?? 0),
                productId: (string) ($row['product_id'] ?? $row['sku']),
                position: $position,
            );
        }

        $rules = [];
        foreach ($fixture['rules'] ?? [] as $row) {
            $rules[] = new DiscountRule(
                kind: $row['kind'],
                type: $row['type'],
                value: (int) $row['value'],
                label: (string) ($row['label'] ?? ''),
                code: isset($row['code']) ? (string) $row['code'] : null,
                minSubtotal: isset($row['min_subtotal']) ? (int) $row['min_subtotal'] : null,
                appliesTo: isset($row['applies_to']) ? (array) $row['applies_to'] : null,
                freeShipping: (bool) ($row['free_shipping'] ?? false),
            );
        }

        $shipping = null;
        if (isset($fixture['shipping']) && $fixture['shipping'] !== null) {
            $s = $fixture['shipping'];
            $shipping = new ShippingMethod(
                code: (string) ($s['code'] ?? 'flat'),
                label: (string) ($s['label'] ?? 'Shipping'),
                baseRate: new Money((int) $s['base_rate'], $currency),
                freeOver: isset($s['free_over']) ? new Money((int) $s['free_over'], $currency) : null,
                taxable: (bool) ($s['taxable'] ?? false),
                taxRateBp: (int) ($s['tax_rate_bp'] ?? 0),
                etaDays: (int) ($s['eta_days'] ?? 3),
            );
        }

        return new CartInput(
            lines: $lines,
            rules: $rules,
            shipping: $shipping,
            pricesIncludeTax: (bool) ($fixture['prices_include_tax'] ?? false),
            currency: $currency,
        );
    }

    /** @return list<array{key: string, fixture: array<string, mixed>}> */
    public static function all(): array
    {
        $directory = dirname(__DIR__, 2).'/fixtures/commerce/totals';
        $files = glob($directory.'/*.json') ?: [];

        if ($files === []) {
            throw new RuntimeException("No fixtures found in {$directory}");
        }

        sort($files);
        $out = [];

        foreach ($files as $file) {
            $decoded = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
            $out[] = ['key' => basename($file, '.json'), 'fixture' => $decoded];
        }

        return $out;
    }
}
