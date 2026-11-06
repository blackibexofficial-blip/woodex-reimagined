<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Commerce\Media\GdTransformer;
use App\Domain\Commerce\Media\ImageStore;
use App\Domain\Commerce\Media\ImageVariant;
use App\Domain\Commerce\Media\MediaPath;
use App\Domain\Commerce\Models\ProductMedia;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Imports the live storefront's catalogue from `database/data/catalog.json`.
 *
 * Why this exists: the 148 products that woodexfurniture.pk actually shows were never in this
 * repository. They lived in the React storefront's `src/data/products.ts`, and the only copies in
 * the database had been built from a legacy SQL dump that existed exclusively in `/tmp` — so every
 * environment reset silently emptied the shop. `catalog.json` is that file, extracted once and
 * committed, which makes the catalogue reproducible with one command on any machine.
 *
 * Idempotent by SKU and by category slug: re-running updates rather than duplicating, and a product
 * that already has a photograph keeps it.
 *
 *   php artisan commerce:import-storefront
 *   php artisan commerce:import-storefront --photos   # also attach the bundled photography
 */
final class ImportStorefrontCatalogCommand extends Command
{
    protected $signature = 'commerce:import-storefront
                            {--path=database/data/catalog.json : Extracted storefront catalogue}
                            {--assets=src/assets : Folder holding the storefront\'s bundled product images, relative to the repository root}
                            {--photos : Attach the primary photograph to every product}';

    protected $description = 'Import the live storefront catalogue (categories, products, translations)';

    /** Display names for the middle tier, whose ids are slugs rather than titles. */
    private const array CATEGORY_NAMES = [
        'office-tables' => 'Office Tables',
        'chairs' => 'Office Chairs',
        'workstations' => 'Workstations',
        'cubicle-workstations' => 'Cubicle Workstations',
        'office-sofas' => 'Office Sofas',
        'storage' => 'Office Storage',
        'cafe' => 'Cafe Furniture',
        'public' => 'Public Sitting',
        'home-office' => 'Home Office',
        'acoustic' => 'Acoustic Furniture',
        'collaborative' => 'Collaborative Furniture',
        'bedroom' => 'Bedroom',
        'living' => 'Living',
        'dining' => 'Dining',
    ];

    public function handle(): int
    {
        $file = (string) $this->option('path');
        $file = str_starts_with($file, '/') ? $file : base_path($file);

        if (! is_file($file)) {
            $this->components->error('No catalogue at '.$file);

            return self::FAILURE;
        }

        /** @var array{products: list<array<string, mixed>>, categoryGroups: list<array<string, mixed>>} $data */
        $data = json_decode((string) file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);

        $categories = $this->importCategories($data['categoryGroups'] ?? []);
        $products = $this->importProducts($data['products'] ?? [], $categories);

        if ($this->option('photos')) {
            $this->attachPhotos($products);
        }

        // The catalogue is cached when it is read; a fresh import must not wait for expiry.
        cache()->flush();

        $this->newLine();
        $this->components->twoColumnDetail('Categories', (string) count($categories));
        $this->components->twoColumnDetail('Products', (string) count($products));
        $this->components->twoColumnDetail('Products with a photo', (string) DB::table('commerce_product_media')->distinct()->count('product_id'));

        return self::SUCCESS;
    }

    /**
     * Builds root → department → leaf from `categoryGroups`.
     *
     * @param  list<array<string, mixed>>  $groups
     * @return array<string, int> slug => id
     */
    private function importCategories(array $groups): array
    {
        $ids = [];
        $position = 0;

        foreach ($groups as $group) {
            $rootSlug = (string) $group['id'];

            $ids[$rootSlug] = $this->upsertCategory([
                'slug' => $rootSlug,
                'name' => (string) $group['name'],
                'parent_id' => null,
                'depth' => 0,
                'position' => $position++,
            ]);

            $midPosition = 0;

            foreach ((array) ($group['subcategories'] ?? []) as $leaf) {
                $leafSlug = (string) $leaf['id'];
                $parentSlug = (string) ($leaf['parent'] ?? $leafSlug);

                // The department is the leaf's `parent`. When a department has exactly one leaf of
                // the same name — "chairs" under "chairs" — the department is the leaf.
                if ($parentSlug === $leafSlug) {
                    $ids[$leafSlug] = $this->upsertCategory([
                        'slug' => $leafSlug,
                        'name' => (string) $leaf['name'],
                        'parent_id' => $ids[$rootSlug],
                        'depth' => 1,
                        'position' => $midPosition++,
                    ]);

                    continue;
                }

                if (! isset($ids[$parentSlug])) {
                    $ids[$parentSlug] = $this->upsertCategory([
                        'slug' => $parentSlug,
                        'name' => self::CATEGORY_NAMES[$parentSlug] ?? Str::headline($parentSlug),
                        'parent_id' => $ids[$rootSlug],
                        'depth' => 1,
                        'position' => $midPosition++,
                    ]);
                }

                $ids[$leafSlug] = $this->upsertCategory([
                    'slug' => $leafSlug,
                    'name' => (string) $leaf['name'],
                    'parent_id' => $ids[$parentSlug],
                    'depth' => 2,
                    'position' => $midPosition++,
                ]);
            }
        }

        // Departments that products use but no group lists (a product can carry a category the
        // navigation never shows). Created at the root rather than dropped, so nothing is orphaned.
        foreach (array_keys(self::CATEGORY_NAMES) as $slug) {
            if (! isset($ids[$slug])) {
                $ids[$slug] = $this->upsertCategory([
                    'slug' => $slug,
                    'name' => self::CATEGORY_NAMES[$slug],
                    'parent_id' => null,
                    'depth' => 0,
                    'position' => $position++,
                ]);
            }
        }

        return $ids;
    }

    /** @param  array{slug: string, name: string, parent_id: int|null, depth: int, position: int}  $data */
    private function upsertCategory(array $data): int
    {
        $existing = DB::table('commerce_categories')->where('slug', $data['slug'])->first();

        $row = [
            'parent_id' => $data['parent_id'],
            'slug' => $data['slug'],
            'path' => $data['slug'],
            'position' => $data['position'],
            'depth' => $data['depth'],
            'is_active' => true,
            'show_in_menu' => true,
            'updated_at' => now(),
        ];

        if ($existing === null) {
            $row['created_at'] = now();
            $id = (int) DB::table('commerce_categories')->insertGetId($row);
            DB::table('commerce_category_translations')->insert([
                'category_id' => $id,
                'locale' => 'en',
                'name' => $data['name'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return $id;
        }

        $id = (int) $existing->id;
        DB::table('commerce_categories')->where('id', $id)->update($row);
        DB::table('commerce_category_translations')->updateOrInsert(
            ['category_id' => $id, 'locale' => 'en'],
            ['name' => $data['name'], 'updated_at' => now(), 'created_at' => $existing->created_at ?? now()],
        );

        return $id;
    }

    /**
     * @param  list<array<string, mixed>>  $products
     * @param  array<string, int>  $categories  slug => id
     * @return array<string, array{id: int, sku: string, image: string|null}>
     */
    private function importProducts(array $products, array $categories): array
    {
        $out = [];
        $seen = [];
        $number = 1000;

        foreach ($products as $product) {
            $name = trim((string) ($product['name'] ?? ''));

            if ($name === '') {
                continue;
            }

            $slug = Str::slug($name);

            // Two products may legitimately share a name across categories; a slug may not repeat.
            if (isset($seen[$slug])) {
                $slug .= '-'.(++$seen[$slug]);
            } else {
                $seen[$slug] = 1;
            }

            $specs = $this->specifications($product['specifications'] ?? []);

            $categorySlug = (string) ($product['category'] ?? '');
            $subSlug = (string) ($product['subcategory'] ?? '');

            // Prefer the most specific category that exists; fall back to the department.
            $primarySlug = isset($categories[$subSlug]) ? $subSlug : $categorySlug;
            $primaryId = $categories[$primarySlug] ?? null;
            $primaryId ??= $categories['home-office'] ?? null;

            $sku = (string) DB::table('commerce_products')->where('slug', $slug)->value('sku');
            $sku = $sku !== '' ? $sku : 'WX-'.(++$number);

            $existing = DB::table('commerce_products')->where('sku', $sku)->first();

            $row = [
                'sku' => $sku,
                'type' => 'simple',
                'status' => 'published',
                'slug' => $slug,
                'primary_category_id' => $primaryId,
                'series' => $product['series'] ?? null,
                'brand' => 'Woodex',
                'material' => $specs['Material'] ?? null,
                'frame' => $specs['Frame'] ?? null,
                'dimensions' => $specs['Dimensions'] ?? null,
                'price_minor' => (int) round(((float) ($product['price'] ?? 0)) * 100),
                'compare_at_minor' => isset($product['originalPrice']) ? (int) round(((float) $product['originalPrice']) * 100) : null,
                'cost_minor' => null,
                'warranty_months' => $this->warrantyMonths($specs['Warranty'] ?? null),
                'lead_time_days' => 7,
                'is_featured' => (bool) ($product['isBestSeller'] ?? false),
                'is_customisable' => true,
                'taxable' => true,
                'rating_x10' => (int) round(((float) ($product['rating'] ?? 0)) * 10),
                'review_count' => (int) ($product['reviews'] ?? 0),
                'position' => 0,
                'is_made_to_order' => ! (bool) ($product['inStock'] ?? true),
                'updated_at' => now(),
            ];

            if ($existing === null) {
                $row['created_at'] = now();
                $id = (int) DB::table('commerce_products')->insertGetId($row);
            } else {
                $id = (int) $existing->id;
                DB::table('commerce_products')->where('id', $id)->update($row);
            }

            DB::table('commerce_product_translations')->updateOrInsert(
                ['product_id' => $id, 'locale' => 'en'],
                [
                    'name' => $name,
                    'summary' => (string) ($product['shortDescription'] ?? ''),
                    'description' => (string) ($product['description'] ?? ''),
                    'features' => json_encode($product['features'] ?? [], JSON_UNESCAPED_UNICODE),
                    'specifications' => json_encode($product['specifications'] ?? [], JSON_UNESCAPED_UNICODE),
                    'updated_at' => now(),
                    'created_at' => now(),
                ],
            );

            // A product belongs to its leaf, its department and its root: any of the three can be
            // browsed, and a subtree query has to find it from all of them.
            DB::table('commerce_product_categories')->where('product_id', $id)->delete();

            foreach ($this->ancestors($primaryId) as $index => $categoryId) {
                DB::table('commerce_product_categories')->insertOrIgnore([
                    'product_id' => $id,
                    'category_id' => $categoryId,
                    'position' => $index,
                ]);
            }

            $out[$sku] = [
                'id' => $id,
                'sku' => $sku,
                'image' => isset($product['images'][0]) ? basename((string) $product['images'][0]) : null,
            ];
        }

        return $out;
    }

    /** @return list<int> the category and every ancestor above it */
    private function ancestors(?int $categoryId): array
    {
        $chain = [];
        $guard = 0;

        while ($categoryId !== null && $guard++ < 5) {
            $row = DB::table('commerce_categories')->where('id', $categoryId)->first();

            if ($row === null) {
                break;
            }

            $chain[] = (int) $row->id;
            $categoryId = $row->parent_id !== null ? (int) $row->parent_id : null;
        }

        return $chain;
    }

    /** @param  array<int, array{label?: string, value?: string}>  $specifications */
    private function specifications(array $specifications): array
    {
        $map = [];

        foreach ($specifications as $row) {
            $label = trim((string) ($row['label'] ?? ''));
            $value = trim((string) ($row['value'] ?? ''));

            if ($label !== '' && $value !== '') {
                $map[$label] = $value;
            }
        }

        return $map;
    }

    /** "3 years" → 36, "6 months" → 6, anything unparseable → null. */
    private function warrantyMonths(?string $warranty): ?int
    {
        if ($warranty === null) {
            return null;
        }

        if (preg_match('/(\d+)\s*year/i', $warranty, $m) === 1) {
            return (int) $m[1] * 12;
        }

        if (preg_match('/(\d+)\s*month/i', $warranty, $m) === 1) {
            return (int) $m[1];
        }

        return null;
    }

    /**
     * Attaches the storefront's bundled photograph to each product.
     *
     * These are the same images the live site shows, so a product page here looks like the product
     * page there. A product that already has a photograph is left alone: a manual upload beats a
     * bundled default.
     *
     * @param  array<string, array{id: int, sku: string, image: string|null}>  $products
     */
    private function attachPhotos(array $products): void
    {
        $assets = (string) $this->option('assets');
        $assets = str_starts_with($assets, '/') ? $assets : dirname(base_path()).'/'.$assets;

        $store = new ImageStore(storage_path('app/public'), new MediaPath, new GdTransformer);
        $paths = new MediaPath;

        $attached = 0;
        $skipped = 0;
        $missing = 0;

        foreach ($products as $product) {
            if ($product['image'] === null) {
                $missing++;

                continue;
            }

            if (ProductMedia::query()->where('product_id', $product['id'])->exists()) {
                $skipped++;

                continue;
            }

            $file = $assets.'/'.$product['image'];

            if (! is_file($file)) {
                $missing++;

                continue;
            }

            $result = $store->store($product['sku'], $product['image'], (string) mime_content_type($file), (string) file_get_contents($file));

            if (! $result['ok'] || $result['hash'] === null) {
                $missing++;

                continue;
            }

            ProductMedia::query()->create([
                'product_id' => $product['id'],
                'variant_id' => null,
                'disk' => 'public',
                'path' => $paths->filePath($product['sku'], (string) $result['hash'], ImageVariant::Hero),
                'alt' => 'Woodex furniture — '.$product['sku'],
                'kind' => ProductMedia::KIND_IMAGE,
                'width' => null,
                'height' => null,
                'is_primary' => true,
                'position' => 0,
            ]);

            $attached++;
        }

        $this->components->twoColumnDetail('Photos attached', (string) $attached);
        $this->components->twoColumnDetail('Kept existing photo', (string) $skipped);
        $this->components->twoColumnDetail('No source image', (string) $missing);
    }
}
