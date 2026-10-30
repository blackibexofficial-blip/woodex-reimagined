<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Commerce\Models\Attribute;
use App\Domain\Commerce\Models\AttributeOption;
use App\Domain\Commerce\Models\Category;
use App\Domain\Commerce\Models\CategoryTranslation;
use App\Domain\Commerce\Models\InventoryItem;
use App\Domain\Commerce\Models\InventorySource;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Models\ProductAttributeValue;
use App\Domain\Commerce\Models\ProductTranslation;
use App\Domain\Commerce\Models\ProductVariant;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * The catalog seed: 20 real Woodex products taken from the live storefront data
 * (src/data/products.ts), plus the four categories, three attributes, three stock sources
 * and twelve variants those products need.
 *
 * It is idempotent on purpose — re-running it updates by SKU/slug instead of duplicating, so
 * a developer can reseed without a fresh database and staging can be refreshed at any time.
 *
 * Money enters as whole rupees in the JSON and leaves as paisa, converted in exactly one
 * place so there is no chance of a stray × 100 in the middle of the seed.
 */
class CatalogSeeder extends Seeder
{
    /** @var array<string, int> */
    /** @var array<string, int> seed key or child slug => category id */
    private array $categoryIds = [];

    /** @var array<string, int> */
    private array $attributeOptionIds = [];

    public function run(): void
    {
        $path = database_path('seeders/data/catalog.json');

        if (! is_file($path)) {
            throw new RuntimeException("Catalog seed data missing at {$path}.");
        }

        $data = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);

        DB::transaction(function () use ($data): void {
            $this->seedCategories($data['categories']);
            $attributes = $this->seedAttributes($data['attributes']);
            $sources = $this->seedSources($data['sources']);
            $products = $this->seedProducts($data['products'], $sources);
            $this->seedVariants($data['variants'], $attributes, $sources, $products);
        });
    }

    /** @param  list<array<string, mixed>>  $categories */
    private function seedCategories(array $categories): void
    {
        foreach ($categories as $position => $row) {
            $category = Category::query()->updateOrCreate(
                ['code' => $row['key']],
                [
                    'slug' => $row['slug'],
                    'position' => $position,
                    'is_active' => true,
                    'show_in_menu' => true,
                ],
            );

            CategoryTranslation::query()->updateOrCreate(
                ['category_id' => $category->id, 'locale' => 'en'],
                [
                    'name' => $row['name'],
                    'meta_title' => $row['name'].' · Woodex',
                    'meta_description' => Str::limit('Explore '.$row['name'].' from Woodex.', 168, ''),
                ],
            );

            $this->categoryIds[$row['key']] = $category->id;

            // Children are how a product says where it actually lives — "bed-sets" inside
            // "bedroom" inside "home" — and they nest, because the storefront sidebar has
            // three levels for home furniture and one for office.
            $this->seedChildren($row['children'] ?? [], $category->id, 0);
        }
    }

    /**
     * Create a category's children, and their children, and so on.
     *
     * @param  list<array<string, mixed>|string>  $children  a slug, or {slug, children}
     */
    private function seedChildren(array $children, int $parentId, int $depth): void
    {
        if ($depth > 4) {
            // A tree this deep is a data mistake, and the loop that builds it would be a
            // mistake too. Fail loudly at seed time rather than at render time.
            throw new RuntimeException('Category nesting deeper than four levels is not supported.');
        }

        foreach ($children as $position => $entry) {
            $slug = is_array($entry) ? (string) ($entry['slug'] ?? '') : (string) $entry;

            if ($slug === '') {
                throw new RuntimeException('A category child was declared without a slug.');
            }

            $child = Category::query()->updateOrCreate(
                ['slug' => $slug],
                [
                    'parent_id' => $parentId,
                    'code' => $slug,
                    'position' => $position,
                    'is_active' => true,
                    'show_in_menu' => false,
                ],
            );

            CategoryTranslation::query()->updateOrCreate(
                ['category_id' => $child->id, 'locale' => 'en'],
                ['name' => Str::headline($slug)],
            );

            // Registered under its own slug so a product can name it as `subcategory` and be
            // filed there. Without this the map only knows roots, and every leaf membership
            // would throw on seed.
            $this->categoryIds[$slug] = $child->id;

            if (is_array($entry) && ($entry['children'] ?? []) !== []) {
                $this->seedChildren($entry['children'], $child->id, $depth + 1);
            }
        }
    }

    /**
     * @param  list<array<string, mixed>>  $attributes
     * @return array<string, Attribute>
     */
    private function seedAttributes(array $attributes): array
    {
        $out = [];

        foreach ($attributes as $position => $row) {
            $attribute = Attribute::query()->updateOrCreate(
                ['code' => $row['code']],
                [
                    'name' => $row['name'],
                    'type' => $row['type'],
                    'swatch_type' => $row['type'] === Attribute::TYPE_SWATCH ? 'colour' : null,
                    'is_filterable' => (bool) $row['is_filterable'],
                    'is_variant' => (bool) $row['is_variant'],
                    'position' => $position,
                ],
            );

            foreach ($row['options'] ?? [] as $index => $option) {
                $created = AttributeOption::query()->updateOrCreate(
                    ['attribute_id' => $attribute->id, 'code' => $option['code']],
                    [
                        'label' => $option['label'],
                        'hex' => $option['hex'] ?? null,
                        'position' => $index,
                    ],
                );

                $this->attributeOptionIds[$row['code'].'.'.$option['code']] = $created->id;
            }

            $out[$row['code']] = $attribute;
        }

        return $out;
    }

    /**
     * @param  list<array<string, mixed>>  $sources
     * @return array<string, InventorySource>
     */
    private function seedSources(array $sources): array
    {
        $out = [];

        foreach ($sources as $row) {
            $out[$row['code']] = InventorySource::query()->updateOrCreate(
                ['code' => $row['code']],
                [
                    'name' => $row['name'],
                    'city' => $row['city'],
                    'priority' => $row['priority'],
                    'is_active' => true,
                    'is_pickup' => $row['code'] === 'lahore',
                ],
            );
        }

        return $out;
    }

    /**
     * @param  list<array<string, mixed>>  $products
     * @param  array<string, InventorySource>  $sources
     * @return array<string, Product>
     */
    private function seedProducts(array $products, array $sources): array
    {
        $out = [];

        foreach ($products as $position => $row) {
            $categoryKey = $row['category'];
            $categoryId = $this->categoryIds[$categoryKey] ?? null;

            if ($categoryId === null) {
                throw new RuntimeException("Seed product {$row['sku']} points at unknown category [{$categoryKey}].");
            }

            /*
             * File the product where it actually lives, not at the top of its section.
             *
             * Five products declare `executive-tables` under `office-tables`. Attaching them to
             * the root — which is what this did — leaves the child category empty, so a visitor
             * filtering by "Executive Tables" gets nothing and the parent looks like it holds
             * everything. The catalog's category filter expands a parent to its children, so
             * filing at the leaf makes both questions work without duplicating the membership.
             */
            $leafId = $categoryId;

            // A subcategory equal to the category is a spreadsheet habit, not a place. Treat it
            // as "no subcategory" rather than filing the product into its own parent.
            if (($row['subcategory'] ?? null) !== null && $row['subcategory'] !== $categoryKey) {
                $leafId = $this->categoryIds[$row['subcategory']] ?? null;

                if ($leafId === null) {
                    throw new RuntimeException("Seed product {$row['sku']} points at unknown subcategory [{$row['subcategory']}].");
                }
            }

            $product = Product::query()->updateOrCreate(
                ['sku' => $row['sku']],
                [
                    'type' => Product::TYPE_SIMPLE,
                    'status' => Product::STATUS_PUBLISHED,
                    'slug' => $row['slug'],
                    'primary_category_id' => $leafId,
                    'series' => $row['series'],
                    'brand' => 'Woodex',
                    'material' => $row['material'],
                    'frame' => $row['frame'],
                    'price_minor' => $this->paisa($row['price']),
                    'compare_at_minor' => $row['compare_at'] !== null ? $this->paisa($row['compare_at']) : null,
                    'warranty_months' => $row['warranty_months'],
                    'lead_time_days' => $row['lead_time_days'],
                    'is_featured' => $row['featured'],
                    'is_customisable' => true,
                    'taxable' => true,
                    'rating_x10' => (int) round($row['rating'] * 10),
                    'review_count' => $row['review_count'],
                    'position' => $position,
                ],
            );

            ProductTranslation::query()->updateOrCreate(
                ['product_id' => $product->id, 'locale' => 'en'],
                [
                    'name' => $row['name'],
                    'summary' => $row['summary'],
                    'description' => $row['description'],
                    'features' => [],
                    'specifications' => [
                        ['label' => 'Material', 'value' => $row['material']],
                        ['label' => 'Frame', 'value' => $row['frame']],
                        ['label' => 'Warranty', 'value' => $row['warranty_months'].' months'],
                    ],
                    'meta_title' => Str::limit($row['name'].' · Woodex', 68, ''),
                    'meta_description' => Str::limit((string) $row['summary'], 168, ''),
                ],
            );

            $product->categories()->syncWithoutDetaching([$leafId]);

            if ($row['material'] !== null) {
                $optionId = $this->attributeOptionIds['material.'.Str::slug($row['material'])] ?? null;

                if ($optionId !== null) {
                    ProductAttributeValue::query()->updateOrCreate(
                        ['product_id' => $product->id, 'attribute_id' => $this->attributeId('material'), 'option_id' => $optionId],
                        [],
                    );
                }
            }

            $out[$row['sku']] = $product;
        }

        return $out;
    }

    /**
     * @param  list<array<string, mixed>>  $variants
     * @param  array<string, Attribute>  $attributes
     * @param  array<string, InventorySource>  $sources
     * @param  array<string, Product>  $products
     */
    private function seedVariants(array $variants, array $attributes, array $sources, array $products): void
    {
        foreach ($variants as $position => $row) {
            $product = $products[$row['product_sku']] ?? null;

            if ($product === null) {
                throw new RuntimeException("Variant {$row['sku']} points at unknown product [{$row['product_sku']}].");
            }

            $variant = ProductVariant::query()->updateOrCreate(
                ['sku' => $row['sku']],
                [
                    'product_id' => $product->id,
                    'name' => $product->displayName().' — '.$row['option_value'],
                    'price_minor' => $this->paisa($row['price_delta']) + (int) $product->price_minor,
                    'status' => 'active',
                    'position' => $position,
                ],
            );

            $optionId = $this->attributeOptionIds['finish.'.Str::slug($row['option_value'])] ?? null;

            if ($optionId === null) {
                throw new RuntimeException("Variant {$row['sku']} points at unknown finish [{$row['option_value']}].");
            }

            DB::table('commerce_variant_options')->updateOrInsert(
                ['variant_id' => $variant->id, 'attribute_id' => $this->attributeId('finish')],
                ['option_id' => $optionId],
            );

            // Stock is split across warehouses: most in Lahore, a little in Karachi, none
            // online for made-to-order lines.
            $allocation = ['lahore' => (int) $row['stock'], 'karachi' => (int) intdiv($row['stock'], 2), 'online' => 0];

            foreach ($allocation as $code => $qty) {
                InventoryItem::query()->updateOrCreate(
                    ['variant_id' => $variant->id, 'source_id' => $sources[$code]->id],
                    ['qty' => $qty, 'reserved' => 0, 'low_stock_threshold' => 3],
                );
            }
        }
    }

    private function attributeId(string $code): int
    {
        return (int) Attribute::query()->where('code', $code)->value('id');
    }

    /** Whole rupees → paisa, in one place. */
    private function paisa(int $rupees): int
    {
        return $rupees * 100;
    }
}
