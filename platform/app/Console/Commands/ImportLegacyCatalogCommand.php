<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Commerce\Api\CatalogCache;
use App\Domain\Commerce\Models\Category;
use App\Domain\Commerce\Models\CategoryTranslation;
use App\Domain\Commerce\Models\InventoryItem;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Models\ProductVariant;
use App\Domain\Commerce\Models\ProductTranslation;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Import the IBPanel catalogue: 171 products and 53 categories.
 *
 * Run the reader first, which normalises the dump and quarantines what must not
 * be published — see tools/migration/parse-legacy.php. This command consumes its
 * manifest and writes the OS tables.
 *
 *   php artisan commerce:import-legacy --manifest=/tmp/legacy-manifest.json
 *   php artisan commerce:import-legacy --manifest=... --commit
 *
 * Dry run is the default. It prints every decision it would make and writes
 * nothing; `--commit` performs it. That order is deliberate: the first time this
 * ran against real data it would have hit the unique index on `sku`, because the
 * legacy catalogue reuses SKUs across unrelated products (13 SKUs cover 49
 * products) and leaves 24 products with no SKU at all.
 *
 * Idempotent: an imported row is identified by `legacy_id`, never by slug or SKU,
 * so re-running updates in place. SKUs are derived from legacy ids rather than
 * from import order, so the same dump always produces the same SKUs.
 */
final class ImportLegacyCatalogCommand extends Command
{
    protected $signature = 'commerce:import-legacy
                            {--manifest=/tmp/legacy-manifest.json : Output of tools/migration/parse-legacy.php}
                            {--commit : Write the changes (default is a dry run)}
                            {--archive-demo : Archive the seeded demo products so the shop shows only imported stock}';

    protected $description = 'Import the legacy IBPanel catalogue into the commerce tables';

    /** @var array<int,int> legacy category id => OS category id */
    private array $categoryMap = [];

    /** @var array<string,bool> */
    private array $usedSkus = [];

    /** @var array<string,int> */
    private array $counts = ['categories_created' => 0, 'categories_adopted' => 0, 'products_created' => 0, 'products_updated' => 0, 'links' => 0, 'archived_demo' => 0];

    public function handle(): int
    {
        $path = (string) $this->option('manifest');
        if (! is_file($path)) {
            $this->components->error("No manifest at {$path}. Run tools/migration/parse-legacy.php first.");

            return self::FAILURE;
        }

        /** @var array{manifest: array{products: list<array<string,mixed>>, categories: list<array<string,mixed>>}, catalog: array<string,mixed>} $data */
        $data = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $categories = $data['manifest']['categories'];
        $products = $data['manifest']['products'];
        $commit = (bool) $this->option('commit');

        // Existing SKUs are claimed up front so a derived SKU can never collide
        // with one the owner already has.
        foreach (Product::withTrashed()->pluck('sku') as $sku) {
            $this->usedSkus[mb_strtolower((string) $sku)] = true;
        }

        $skuMap = $this->resolveSkus($products);

        $this->components->info(sprintf('%s — %d categories, %d products from %s',
            $commit ? 'IMPORTING' : 'DRY RUN', count($categories), count($products), basename($path)));

        DB::beginTransaction();
        try {
            $this->importCategories($categories, $commit);
            $this->importProducts($products, $skuMap, $commit);

            if ($this->option('archive-demo') && $commit) {
                $this->counts['archived_demo'] = Product::query()
                    ->whereNull('legacy_id')
                    ->where('status', '!=', 'archived')
                    ->update(['status' => 'archived', 'updated_at' => now()]);
            }

            $commit ? DB::commit() : DB::rollBack();
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->components->error('Import failed and was rolled back: '.$e->getMessage());

            return self::FAILURE;
        }

        if ($commit) {
            // The catalogue is cached per query shape; without this the shop keeps
            // serving the pre-import answers for the length of the TTL and the import
            // looks like it did nothing.
            CatalogCache::bump();
        }

        $this->report($commit);

        return self::SUCCESS;
    }

    /**
     * Deterministic SKUs.
     *
     * The legacy field cannot be trusted as a key: `sku` holds `SKU: EC-10001`,
     * `EC-10001` appears on two unrelated chairs, one `CT-10002` covers a desk, a
     * chair and a conference table, and 24 products have no SKU at all. So a SKU
     * is kept only when it is unique within the import and already free; anything
     * else gets `WX-L{legacy_id}`, which is stable across re-runs.
     *
     * @param  list<array<string,mixed>>  $products
     * @return array<int,string> legacy id => sku
     */
    private function resolveSkus(array $products): array
    {
        $bySku = [];
        foreach ($products as $p) {
            $sku = trim((string) $p['sku']);
            if ($sku !== '') {
                $bySku[$sku][] = (int) $p['legacy_id'];
            }
        }

        $map = [];
        foreach ($products as $p) {
            $id = (int) $p['legacy_id'];
            $sku = trim((string) $p['sku']);
            $claimable = $sku !== ''
                && count($bySku[$sku] ?? []) === 1
                && ! isset($this->usedSkus[mb_strtolower($sku)]);

            $resolved = $claimable ? $sku : 'WX-L'.$id;
            $this->usedSkus[mb_strtolower($resolved)] = true;
            $map[$id] = $resolved;
        }

        return $map;
    }

    /** @param list<array<string,mixed>> $categories */
    private function importCategories(array $categories, bool $commit): void
    {
        // Three passes, shallowest first: a child cannot be written before its
        // parent exists, and the tree is exactly three levels deep.
        $byLevel = [];
        foreach ($categories as $c) {
            $byLevel[(int) $c['level']][] = $c;
        }
        ksort($byLevel);

        foreach ($byLevel as $level => $rows) {
            foreach ($rows as $c) {
                $legacyId = (int) $c['legacy_id'];
                $slug = (string) $c['slug'];

                $existing = Category::query()->where('legacy_id', $legacyId)->first()
                    ?? Category::query()->where('slug', $slug)->first();

                $parentId = null;
                if (! empty($c['parent_id'])) {
                    $parentId = $this->categoryMap[(int) $c['parent_id']] ?? null;
                }

                $attrs = [
                    'slug' => $slug,
                    'parent_id' => $parentId,
                    'depth' => $level - 1,
                    'position' => (int) ($c['position'] ?? 0),
                    'is_active' => (bool) $c['is_active'],
                    'show_in_menu' => true,
                    'show_in_home_carousel' => (bool) $c['show_in_home_carousel'],
                    'show_in_hot_products' => (bool) $c['show_in_hot_products'],
                    'image_path' => $c['image'] ?: null,
                    'legacy_id' => $legacyId,
                    'imported_at' => now(),
                ];

                if (! $commit) {
                    // Dry run still has to know the new ids for children and links.
                    $this->categoryMap[$legacyId] = $existing?->id ?? -$legacyId;
                    $existing ? $this->counts['categories_adopted']++ : $this->counts['categories_created']++;

                    continue;
                }

                if ($existing) {
                    $existing->fill($attrs)->save();
                    $this->categoryMap[$legacyId] = $existing->id;
                    $this->counts['categories_adopted']++;
                } else {
                    $category = Category::query()->create($attrs);
                    $this->categoryMap[$legacyId] = $category->id;
                    $this->counts['categories_created']++;
                }

                $this->writeCategoryTranslation($this->categoryMap[$legacyId], (string) $c['name']);
            }
        }

        if ($commit) {
            $this->rebuildPaths();
        }
    }

    private function writeCategoryTranslation(int $categoryId, string $name): void
    {
        CategoryTranslation::query()->updateOrCreate(
            ['category_id' => $categoryId, 'locale' => 'en'],
            ['name' => $name, 'tagline' => null, 'description' => null],
        );
    }

    /** Materialised ancestry: /1/4/9, rebuilt after the tree is settled. */
    private function rebuildPaths(): void
    {
        $all = Category::query()->get(['id', 'parent_id']);
        $parents = $all->pluck('parent_id', 'id')->all();

        foreach ($all as $category) {
            $path = [];
            $cursor = $category->id;
            $guard = 0;
            while ($cursor !== null && $guard++ < 10) {
                array_unshift($path, $cursor);
                $cursor = $parents[$cursor] ?? null;
            }
            Category::query()->whereKey($category->id)->update(['path' => '/'.implode('/', $path)]);
        }
    }

    /**
     * @param  list<array<string,mixed>>  $products
     * @param  array<int,string>  $skuMap
     */
    private function importProducts(array $products, array $skuMap, bool $commit): void
    {
        foreach ($products as $p) {
            $legacyId = (int) $p['legacy_id'];
            $sku = $skuMap[$legacyId];

            $primary = null;
            foreach ($p['category_ids'] as $legacyCat) {
                $mapped = $this->categoryMap[(int) $legacyCat] ?? null;
                if ($mapped !== null && $mapped > 0) {
                    $primary = $primary ?? $mapped;
                }
            }

            $legacyQty = (int) ($p['qty'] ?? 0);
            $existing = Product::withTrashed()->where('legacy_id', $legacyId)->first();

            $attrs = [
                'sku' => $sku,
                'type' => 'simple',
                'status' => 'published',
                'slug' => (string) $p['slug'],
                'primary_category_id' => $primary,
                'price_minor' => (int) $p['price_minor'],
                'compare_at_minor' => ((int) $p['compare_at_minor']) ?: null,
                'is_featured' => (bool) $p['is_best_seller'],
                // The legacy quantity is a placeholder, not inventory (see the
                // 2026_11_05_110000 migration). Anything it calls empty is made to order.
                'is_made_to_order' => $legacyQty <= 0,
                'rating_x10' => $this->ratingX10((int) $p['rating_count'], (int) $p['rating_sum']),
                'review_count' => (int) $p['rating_count'],
                'legacy_id' => $legacyId,
                'imported_at' => now(),
            ];

            if (! $commit) {
                $existing ? $this->counts['products_updated']++ : $this->counts['products_created']++;
                $this->counts['links'] += count($p['category_ids']);
                continue;
            }

            // `tap($model)->fill()->save()` returns the boolean from save(), not the
            // model — which is easy to write and only fails on the second import,
            // when every row takes the update path.
            if ($existing) {
                $existing->fill($attrs)->save();
                $product = $existing;
                $this->counts['products_updated']++;
            } else {
                $product = Product::query()->create($attrs);
                $this->counts['products_created']++;
            }

            ProductTranslation::query()->updateOrCreate(
                ['product_id' => $product->id, 'locale' => 'en'],
                [
                    'name' => (string) $p['name'],
                    // `short_description` in the legacy schema is HTML, and the shop's card
                    // renders `summary` as text — so it printed literal <p> tags. The card
                    // gets a plain sentence; the product page keeps the markup.
                    'summary' => $this->plainText((string) $p['summary']) ?: null,
                    'description' => $p['details'] ?: null,
                    'specifications' => $p['specifications'] ?: null,
                ],
            );

            // Stock is per variant, and a product with no variant can never be in
            // stock: `isInStock()` asks its variants. Every imported product is simple,
            // so it gets exactly one default variant carrying the legacy quantity.
            $this->ensureStocked($product, $sku, $legacyQty, (int) $p['price_minor']);

            // Category links: the legacy dump stores many-to-many, and a product's
            // placement in a carousel follows from every category it is in.
            $linkIds = [];
            foreach ($p['category_ids'] as $legacyCat) {
                $mapped = $this->categoryMap[(int) $legacyCat] ?? null;
                if ($mapped !== null && $mapped > 0) {
                    $linkIds[] = $mapped;
                }
            }
            if ($linkIds !== []) {
                $product->categories()->syncWithoutDetaching(
                    collect($linkIds)->mapWithKeys(fn ($id, $i) => [$id => ['position' => $i]])->all()
                );
                $this->counts['links'] += count($linkIds);
            }
        }
    }

    /** A one-variant product with real stock, so the card does not read "Out of Stock". */
    private function ensureStocked(Product $product, string $sku, int $qty, int $priceMinor): void
    {
        $variant = ProductVariant::query()
            ->where('product_id', $product->id)
            ->orderBy('id')
            ->first();

        if ($variant === null) {
            $variant = ProductVariant::query()->create([
                'product_id' => $product->id,
                'sku' => $sku,
                'name' => $product->displayName(),
                'price_minor' => $priceMinor,
                'status' => 'active',
                'position' => 0,
            ]);
        }

        // The first source is the physical warehouse; the row is updated rather than
        // duplicated so a re-import cannot inflate stock.
        $sourceId = (int) (\App\Domain\Commerce\Models\InventorySource::query()->orderBy('id')->value('id') ?? 1);

        InventoryItem::query()->updateOrCreate(
            ['variant_id' => $variant->id, 'source_id' => $sourceId],
            ['qty' => max(0, $qty), 'low_stock_threshold' => 3],
        );
    }

    /** HTML in the legacy catalogue is structural, not content: flatten it for card text. */
    private function plainText(string $html): string
    {
        $text = (string) preg_replace('#<(script|style)[^>]*>.*?</\1>#is', ' ', $html);
        $text = strip_tags($text);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = (string) preg_replace('/\s+/u', ' ', $text);

        return trim($text);
    }

    /** Average rating as an integer out of 50 (4.7 → 47), the shape the schema already uses. */
    private function ratingX10(int $count, int $sum): int
    {
        if ($count <= 0 || $sum <= 0) {
            return 0;
        }

        return (int) round(($sum / $count) * 10);
    }

    private function report(bool $commit): void
    {
        $rows = [
            ['categories created', $this->counts['categories_created']],
            ['categories adopted (slug matched an existing row)', $this->counts['categories_adopted']],
            ['products created', $this->counts['products_created']],
            ['products updated', $this->counts['products_updated']],
            ['category links written', $this->counts['links']],
        ];
        if ($this->option('archive-demo')) {
            $rows[] = ['demo products archived', $this->counts['archived_demo']];
        }

        $this->table(['operation', 'count'], $rows);

        if (! $commit) {
            $this->components->warn('Dry run — nothing was written. Re-run with --commit to apply.');
        } else {
            $this->components->info(sprintf('Committed. Catalogue now holds %d products in %d categories.',
                Product::query()->count(), Category::query()->count()));
        }
    }
}
