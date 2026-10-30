<?php

declare(strict_types=1);

namespace Tests\Catalog;

use Tests\Support\Assert;

/**
 * The seed data is a contract: the seeder trusts it, the storefront reads it, and nobody
 * reviews 20 JSON blocks by eye. These checks are the review.
 *
 * They caught their first real problem before any of this ran against a database — a
 * product pointing at a category key that did not exist, which the seeder would only have
 * discovered halfway through a `db:seed`.
 */
final class CatalogSeedTest
{
    /** @var array<string, mixed>|null */
    private static ?array $data = null;

    private function data(): array
    {
        if (self::$data === null) {
            $path = dirname(__DIR__, 2).'/database/seeders/data/catalog.json';
            Assert::true(is_file($path), 'catalog seed file exists');

            self::$data = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        }

        return self::$data;
    }

    public function testItShipsTwentyProductsInFourCategories(): void
    {
        $data = $this->data();

        Assert::same(20, count($data['products']), 'product count');
        Assert::same(4, count($data['categories']), 'root category count');
        Assert::same('PKR', $data['currency'], 'currency');
    }

    /**
     * A subcategory must be a child of the category the product names.
     *
     * This is the contract the seeder silently broke: products declared "executive-tables"
     * under "office-tables", the seeder attached them to the root, and the child category was
     * left empty. A visitor filtering by Executive Tables got nothing, and nothing failed.
     */
    public function testEverySubcategoryIsAChildOfItsCategory(): void
    {
        $data = $this->data();
        $tree = [];

        foreach ($data['categories'] as $category) {
            $tree[$category['key']] = $category['children'] ?? [];
        }

        $checked = 0;

        foreach ($data['products'] as $product) {
            $sub = $product['subcategory'] ?? null;

            if ($sub === null) {
                continue;
            }

            $checked++;

            // The subcategory may sit at any depth beneath the declared category — home
            // furniture is three levels deep — so it is looked up in the flattened subtree.
            Assert::true(
                in_array($sub, $this->descendants($tree[$product['category']] ?? []), true),
                "{$product['sku']}: subcategory [{$sub}] sits under [{$product['category']}]",
            );
        }

        Assert::true($checked > 0, 'the seed actually exercises subcategories');
    }

    /**
     * Every slug beneath a node, at any depth.
     *
     * @param  list<array<string, mixed>|string>  $children
     * @return list<string>
     */
    private function descendants(array $children, int $depth = 0): array
    {
        if ($depth > 4) {
            return [];
        }

        $out = [];

        foreach ($children as $entry) {
            $slug = is_array($entry) ? (string) ($entry['slug'] ?? '') : (string) $entry;

            if ($slug === '') {
                continue;
            }

            $out[] = $slug;

            if (is_array($entry)) {
                $out = array_merge($out, $this->descendants($entry['children'] ?? [], $depth + 1));
            }
        }

        return $out;
    }

    public function testEveryChildSlugIsUniqueAcrossTheWholeTree(): void
    {
        $data = $this->data();
        $seen = [];

        $walk = function (array $children) use (&$walk, &$seen): void {
            foreach ($children as $entry) {
                $slug = is_array($entry) ? (string) $entry['slug'] : (string) $entry;
                $seen[] = $slug;

                if (is_array($entry)) {
                    $walk($entry['children'] ?? []);
                }
            }
        };

        foreach ($data['categories'] as $category) {
            $walk($category['children'] ?? []);
        }

        Assert::same(
            count($seen),
            count(array_unique($seen)),
            'no slug is used twice, or a category would be moved by the second declaration',
        );
        Assert::true(count($seen) >= 9, 'the seed ships the leaves the sidebar links to');
    }

    public function testEveryProductIsValid(): void
    {
        $data = $this->data();
        $categoryKeys = array_column($data['categories'], 'key');
        $skus = [];
        $slugs = [];

        foreach ($data['products'] as $product) {
            $label = $product['sku'].' ('.$product['name'].')';

            Assert::true(! in_array($product['sku'], $skus, true), "{$label}: SKU is unique");
            Assert::true(! in_array($product['slug'], $slugs, true), "{$label}: slug is unique");

            $skus[] = $product['sku'];
            $slugs[] = $product['slug'];

            Assert::true($product['price'] > 0, "{$label}: price is positive");
            Assert::true($product['warranty_months'] > 0, "{$label}: warranty is set");
            Assert::true($product['lead_time_days'] > 0, "{$label}: lead time is set");
            Assert::true(
                in_array($product['category'], $categoryKeys, true),
                "{$label}: category [{$product['category']}] exists",
            );
            Assert::true($product['name'] !== '', "{$label}: has a name");
            Assert::true(
                preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $product['slug']) === 1,
                "{$label}: slug is URL-safe",
            );
            Assert::true(
                $product['compare_at'] === null || $product['compare_at'] > $product['price'],
                "{$label}: compare-at is above the price when present",
            );
            Assert::true(
                $product['rating'] >= 0 && $product['rating'] <= 5,
                "{$label}: rating within 0–5",
            );
        }

        Assert::same(20, count($skus), 'every product produced a SKU');
    }

    public function testVariantsOnlyReferenceRealProductsAndOptions(): void
    {
        $data = $this->data();
        $productSkus = array_column($data['products'], 'sku');
        $finish = null;

        foreach ($data['attributes'] as $attribute) {
            if ($attribute['code'] === 'finish') {
                $finish = array_column($attribute['options'], 'label');
            }
        }

        Assert::true($finish !== null, 'a finish attribute exists');

        $variantSkus = [];

        foreach ($data['variants'] as $variant) {
            Assert::true(
                in_array($variant['product_sku'], $productSkus, true),
                "variant {$variant['sku']}: parent product exists",
            );
            Assert::true(
                in_array($variant['option_value'], $finish, true),
                "variant {$variant['sku']}: finish [{$variant['option_value']}] is a real option",
            );
            Assert::true(! in_array($variant['sku'], $variantSkus, true), "variant {$variant['sku']}: SKU is unique");
            Assert::true($variant['stock'] >= 0, "variant {$variant['sku']}: stock is not negative");

            $variantSkus[] = $variant['sku'];
        }

        Assert::same(12, count($variantSkus), 'twelve variants across four products');
    }

    public function testAttributesAreUsableByTheStorefront(): void
    {
        $data = $this->data();
        $codes = array_column($data['attributes'], 'code');

        Assert::true(in_array('material', $codes, true), 'material attribute exists');
        Assert::true(in_array('finish', $codes, true), 'finish attribute exists');

        foreach ($data['attributes'] as $attribute) {
            if ($attribute['type'] === 'select' || $attribute['type'] === 'swatch') {
                Assert::true(
                    count($attribute['options']) > 0,
                    "attribute [{$attribute['code']}] has options",
                );
            }

            $optionCodes = array_column($attribute['options'], 'code');
            Assert::same(
                count($optionCodes),
                count(array_unique($optionCodes)),
                "attribute [{$attribute['code']}]: option codes are unique",
            );
        }
    }

    public function testStockSourcesMatchTheSeedersAllocationKeys(): void
    {
        $data = $this->data();
        $codes = array_column($data['sources'], 'code');

        // CatalogSeeder allocates stock across exactly these three keys.
        foreach (['lahore', 'karachi', 'online'] as $required) {
            Assert::true(in_array($required, $codes, true), "source [{$required}] exists");
        }

        $priorities = array_column($data['sources'], 'priority');
        Assert::same(
            $priorities,
            array_values(array_unique($priorities)),
            'source priorities are distinct so allocation is deterministic',
        );
    }

    public function testPricesAreWholeRupeesThatBecomeIntegerPaisa(): void
    {
        $data = $this->data();

        foreach ($data['products'] as $product) {
            Assert::true(
                is_int($product['price']) && $product['price'] > 0,
                "{$product['sku']}: price is an integer number of rupees, not a float",
            );
            Assert::true(
                $product['price'] * 100 > 0 && is_int($product['price'] * 100),
                "{$product['sku']}: converts to positive integer paisa",
            );
        }
    }

    /**
     * The material filter, checked from the product side.
     *
     * `CatalogSeeder` files a product under an option by slugging the product's material
     * string and looking it up in the attribute's options. When the two disagree the product
     * is silently filed nowhere: it is in the catalog, it is searchable, it has a price — and
     * it disappears the moment somebody ticks a material in the storefront's filter rail.
     *
     * This was true of six of the twenty seeded products when the attributes screen first
     * counted them, which is why this test exists rather than a comment in the seeder.
     */
    public function testEveryProductMaterialIsAnOptionInTheVocabulary(): void
    {
        $data = $this->data();
        $material = null;

        foreach ($data['attributes'] as $attribute) {
            if ($attribute['code'] === 'material') {
                $material = $attribute;
            }
        }

        Assert::true($material !== null, 'the material attribute exists');

        $optionCodes = array_column($material['options'], 'code');
        $orphaned = [];

        foreach ($data['products'] as $product) {
            $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', (string) $product['material']) ?? '');

            if (! in_array(trim($slug, '-'), $optionCodes, true)) {
                $orphaned[] = $product['sku'].' ['.$product['material'].']';
            }
        }

        Assert::same(
            [],
            $orphaned,
            'every product material matches a real option, or the product cannot be filtered by material',
        );
    }

    /** And the reverse: an option nothing carries is a filter that returns an empty page. */
    public function testEveryMaterialOptionIsCarriedByAtLeastOneProduct(): void
    {
        $data = $this->data();
        $material = null;

        foreach ($data['attributes'] as $attribute) {
            if ($attribute['code'] === 'material') {
                $material = $attribute;
            }
        }

        Assert::true($material !== null, 'the material attribute exists');

        $carried = [];

        foreach ($data['products'] as $product) {
            $slug = strtolower(preg_replace('/[^a-z0-9]+/i', '-', (string) $product['material']) ?? '');
            $carried[trim($slug, '-')] = true;
        }

        foreach ($material['options'] as $option) {
            Assert::true(
                isset($carried[$option['code']]),
                "material option [{$option['code']}] is carried by at least one product",
            );
        }
    }
}
