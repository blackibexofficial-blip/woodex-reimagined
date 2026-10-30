<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Catalog;

/**
 * The finishes and materials the shop offers, as the catalog data models them.
 *
 * The Materials page has been accurate about nothing since the catalog arrived: it lists six
 * wood finishes and twelve fabric colours as hard-coded hex values, while the catalog has three
 * real finishes on a variant axis and fourteen real materials. A customer picks "Maple" on that
 * page and there is no product anywhere that offers it — the page is a brochure pretending to
 * be inventory.
 *
 * This closes that gap without inventing columns. `commerce_attribute_options` already carries
 * `code`, `label`, `hex` and a swatch path, and the migration that created it says why: *"the
 * option is the swatch, which is how the material library and the product filter stay one
 * record."* So the library is that table, grouped by attribute, with the product and variant
 * counts that make an option real rather than decorative.
 *
 * The page keeps its editorial sections — "Premium Pakistani and imported hardwoods" is copy,
 * not data. What it loses is the invented palette.
 */
final readonly class MaterialLibrary
{
    /**
     * @param  list<array{code: string, name: string, type: string, swatch_type: ?string, options: list<array<string, mixed>>}>  $groups
     */
    public function __construct(public array $groups = []) {}

    /**
     * Build from flat rows, one per option.
     *
     * Rows arrive in attribute-then-option order (`position, position`), and the grouping
     * preserves it, so the storefront renders the same order an administrator sees in the OS.
     *
     * @param  list<array<string, mixed>>  $rows
     */
    public static function fromRows(array $rows): self
    {
        $groups = [];

        foreach ($rows as $row) {
            $code = (string) ($row['attribute_code'] ?? '');

            if ($code === '') {
                continue;
            }

            $groups[$code] ??= [
                'code' => $code,
                'name' => (string) ($row['attribute_name'] ?? $code),
                'type' => (string) ($row['attribute_type'] ?? 'select'),
                'swatch_type' => isset($row['swatch_type']) && $row['swatch_type'] !== ''
                    ? (string) $row['swatch_type']
                    : null,
                'options' => [],
            ];

            $hex = trim((string) ($row['hex'] ?? ''));

            $groups[$code]['options'][] = [
                'code' => (string) ($row['code'] ?? ''),
                'label' => (string) ($row['label'] ?? ''),
                // Only a real six-digit hex becomes a colour. A malformed one would render as
                // an invisible swatch on the page, which is worse than showing none.
                'hex' => preg_match('/^#[0-9a-f]{6}$/i', $hex) === 1 ? strtoupper($hex) : null,
                'image' => isset($row['swatch_path']) && $row['swatch_path'] !== ''
                    ? (string) $row['swatch_path']
                    : null,
                'products' => (int) ($row['products'] ?? 0),
                'variants' => (int) ($row['variants'] ?? 0),
            ];
        }

        return new self(array_values($groups));
    }

    /** @return list<array<string, mixed>> */
    public function groups(): array
    {
        return $this->groups;
    }

    /**
     * Groups that can actually be drawn as colours.
     *
     * A `material` attribute with fourteen labels and no hexes is a filter, not a palette, so
     * the page renders it as a list of names rather than fourteen blank circles.
     *
     * @return list<array<string, mixed>>
     */
    public function paletteGroups(): array
    {
        return array_values(array_filter($this->groups, static function (array $group): bool {
            foreach ($group['options'] as $option) {
                if ($option['hex'] !== null) {
                    return true;
                }
            }

            return false;
        }));
    }

    /**
     * Every swatch the shop actually sells, flattened.
     *
     * @return list<array<string, mixed>>
     */
    public function swatches(): array
    {
        $swatches = [];

        foreach ($this->groups as $group) {
            foreach ($group['options'] as $option) {
                if ($option['hex'] === null) {
                    continue;
                }

                $swatches[] = $option + [
                    'attribute' => $group['code'],
                    'attribute_name' => $group['name'],
                ];
            }
        }

        return $swatches;
    }

    /**
     * @return array{groups: int, options: int, swatches: int, live_options: int, dead_options: int}
     */
    public function summary(): array
    {
        $options = 0;
        $swatches = 0;
        $live = 0;

        foreach ($this->groups as $group) {
            foreach ($group['options'] as $option) {
                $options++;

                if ($option['hex'] !== null) {
                    $swatches++;
                }

                if ($option['products'] > 0 || $option['variants'] > 0) {
                    $live++;
                }
            }
        }

        return [
            'groups' => count($this->groups),
            'options' => $options,
            'swatches' => $swatches,
            'live_options' => $live,
            'dead_options' => $options - $live,
        ];
    }

    public function isEmpty(): bool
    {
        return $this->groups === [];
    }

    /**
     * The API body.
     *
     * `meta` carries the counts so the page can say "14 finishes, 3 colours" without counting
     * in the browser, and so a dead option is visible in the payload rather than only on the
     * admin screen.
     *
     * @return array{groups: list<array<string, mixed>>, meta: array<string, int>}
     */
    public function toArray(): array
    {
        return [
            'groups' => $this->groups,
            'meta' => $this->summary(),
        ];
    }
}
