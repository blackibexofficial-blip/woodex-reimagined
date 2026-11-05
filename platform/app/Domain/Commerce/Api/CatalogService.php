<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Api;

use App\Domain\Commerce\Catalog\CategoryTree;
use App\Domain\Commerce\Models\Category;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Media\MediaPath;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

/**
 * Reads the catalog for the storefront.
 *
 * Every method here is a read. Prices and stock are never calculated or mutated in this class
 * — pricing belongs to CartCalculator and stock to the inventory actions. Keeping read and
 * write apart is what makes it safe to cache the read side hard.
 *
 * Eager loading is spelled out rather than lazy: the storefront asks for twenty-four products
 * and would otherwise issue several hundred queries on a host with thirty entry processes.
 */
final readonly class CatalogService
{
    public function __construct(private MediaPath $paths = new MediaPath) {}

    /**
     * One page of products, ready for the API.
     *
     * @return array{items: list<ProductCard>, total: int, page: int, per_page: int, pages: int}
     */
    public function paginate(CatalogQuery $query): array
    {
        $builder = $this->baseQuery($query);

        $total = (clone $builder)->count();
        $pages = $total > 0 ? (int) ceil($total / $query->perPage) : 1;

        $products = $builder
            ->forPage($query->page, $query->perPage)
            ->get();

        return [
            // Arrays, not objects, and that is two bugs prevented at once.
            //
            // `toArray()` is the only place the wire keys are decided — `price_minor`,
            // `in_stock`, `available_qty`. The controller passed the card itself, so
            // json_encode emitted its public properties instead: `priceMinor`, `inStock`.
            // Every product crossed the wire in a shape the storefront does not read, and it
            // showed twenty products, all out of stock, all at no price.
            //
            // And the result is cached. A cache holding objects is a cache that breaks on the
            // next deploy that touches the class: PHP unserialises it as an incomplete class
            // and the response gains a `__PHP_Incomplete_Class_Name` key nobody asked for.
            // Plain arrays survive any change to the class and cannot go stale that way.
            'items' => $products
                ->map(fn (Product $product): array => ProductCard::fromModel($product, $this->paths)->toArray())
                ->all(),
            'total' => $total,
            'page' => $query->page,
            'per_page' => $query->perPage,
            'pages' => $pages,
        ];
    }

    /** A single product by slug, as the wire shape, or null. */
    public function find(string $slug): ?array
    {
        $product = $this->baseQuery(new CatalogQuery)
            ->where('slug', $slug)
            ->first();

        return $product !== null ? ProductCard::fromModel($product, $this->paths)->toArray() : null;
    }

    /**
     * A single product, with everything a product page renders.
     *
     * Separate from `find()` because the two are asked for at different times by different
     * pages: a card list wants twenty-four shallow rows, a product page wants one deep one.
     * Same query builder, same eager loads, so a product can never look different in the two.
     */
    public function findDetail(string $slug): ?array
    {
        $product = $this->baseQuery(new CatalogQuery)
            ->where('slug', $slug)
            ->first();

        return $product !== null ? ProductDetail::fromModel($product, $this->paths)->toArray() : null;
    }

    /**
     * The category tree, two levels deep, with live product counts.
     *
     * Counts are of published products only — a category showing "12 products" that opens to
     * eight is worse than one that says eight.
     *
     * @return list<array<string, mixed>>
     */
    public function categoryTree(): array
    {
        $categories = Category::query()
            ->active()
            ->with(['translation', 'children.translation'])
            ->orderBy('position')
            ->get();

        $counts = $this->productCountsByCategory();

        $roots = $categories->whereNull('parent_id');

        return $roots->map(function (Category $category) use ($categories, $counts): array {
            $children = $categories->where('parent_id', $category->id);

            $childCounts = $children->map(static fn (Category $child): int => $counts[$child->id] ?? 0);

            return [
                'slug' => $category->slug,
                'name' => $category->displayName(),
                // The parent's own count plus every child's: a section that says "0 products"
                // above five full subcategories is read as empty by everyone who sees it.
                'count' => ($counts[$category->id] ?? 0) + $childCounts->sum(),
                'children' => $children->map(static fn (Category $child): array => [
                    'slug' => $child->slug,
                    'name' => $child->displayName(),
                    'count' => $counts[$child->id] ?? 0,
                ])->values()->all(),
            ];
        })->values()->all();
    }

    /** @return array<int, int> category id => published product count */
    private function productCountsByCategory(): array
    {
        /** @var Collection<int, object{category_id: int, aggregate: int}> $rows */
        $rows = \Illuminate\Support\Facades\DB::table('commerce_product_categories')
            ->join('commerce_products', 'commerce_products.id', '=', 'commerce_product_categories.product_id')
            ->where('commerce_products.status', Product::STATUS_PUBLISHED)
            ->whereNull('commerce_products.deleted_at')
            ->groupBy('commerce_product_categories.category_id')
            ->selectRaw('commerce_product_categories.category_id as category_id, count(*) as aggregate')
            ->get();

        return $rows->pluck('aggregate', 'category_id')->map(static fn ($n): int => (int) $n)->all();
    }

    /**
     * A category slug and every slug beneath it.
     *
     * One indexed read of the whole category table, cached for five minutes with the rest of
     * the read side, turned into a lookup. The obvious alternative — a recursive query per
     * product — is the one thing thirty shared-hosting workers cannot afford.
     *
     * An unknown slug returns just itself: a stale bookmark renders an empty page rather than
     * a 500, which is the same answer the catalog gives for a category with no stock.
     *
     * @return list<string>
     */
    public static function slugsInSubtree(string $slug): array
    {
        /** @var array<string, list<string>> $map slug => itself and its descendants */
        $map = Cache::remember(CatalogCache::key('category-subtrees:v1'), 300, static function (): array {
            $rows = Category::query()
                ->orderBy('position')
                ->orderBy('id')
                ->get(['id', 'parent_id', 'position', 'slug'])
                ->map(static fn (Category $category): array => [
                    'id' => (int) $category->id,
                    'parent_id' => $category->parent_id !== null ? (int) $category->parent_id : null,
                    'position' => (int) $category->position,
                    'slug' => (string) $category->slug,
                    'name' => (string) $category->slug,
                    'is_active' => true,
                    'show_in_menu' => true,
                    'product_count' => 0,
                ])
                ->all();

            $tree = CategoryTree::fromRows($rows);
            $slugById = [];

            foreach ($rows as $row) {
                $slugById[$row['id']] = $row['slug'];
            }

            $map = [];

            foreach ($slugById as $id => $categorySlug) {
                $map[$categorySlug] = array_values(array_filter(array_map(
                    static fn (int $categoryId): ?string => $slugById[$categoryId] ?? null,
                    $tree->subtreeIds($id),
                )));
            }

            return $map;
        });

        $found = $map[$slug] ?? null;

        return $found !== null && $found !== [] ? $found : [$slug];
    }

    /** @return Builder<Product> */
    private function baseQuery(CatalogQuery $query): Builder
    {
        return Product::query()
            ->published()
            ->with([
                'translation',
                'primaryCategory.translation',
                'primaryCategory.parent',
                'media',
                'variants.inventory',
                'variants.options',
            ])
            ->when($query->search !== '', function (Builder $builder) use ($query): void {
                $term = '%'.$query->search.'%';

                $builder->where(function (Builder $inner) use ($term): void {
                    $inner->where('sku', 'like', $term)
                        ->orWhere('series', 'like', $term)
                        ->orWhereHas('translations', static fn (Builder $t) => $t
                            ->where('name', 'like', $term)
                            ->orWhere('summary', 'like', $term));
                });
            })
            ->when($query->category !== null, function (Builder $builder) use ($query): void {
                /*
                 * A parent means its whole subtree.
                 *
                 * Products are filed at their leaf ("executive-tables"), so matching the slug
                 * exactly would make "Office Tables" return nothing while its children hold
                 * every desk in the catalogue. The expansion is a cached slug lookup, not a
                 * recursive query per product.
                 */
                $builder->whereHas('categories', static fn (Builder $c) => $c->whereIn(
                    'slug',
                    self::slugsInSubtree((string) $query->category),
                ));
            })
            ->when($query->minPriceMinor !== null, fn (Builder $b) => $b->where('price_minor', '>=', $query->minPriceMinor))
            ->when($query->maxPriceMinor !== null, fn (Builder $b) => $b->where('price_minor', '<=', $query->maxPriceMinor))
            ->when($query->featuredOnly, fn (Builder $b) => $b->where('is_featured', true))
            ->when($query->inStockOnly, fn (Builder $b) => $b->whereHas(
                'variants.inventory',
                static fn (Builder $i) => $i->whereColumn('qty', '>', 'reserved'),
            ))
            ->when($query->finishes !== [], fn (Builder $b) => $b->whereHas(
                'variants.options',
                static fn (Builder $o) => $o->whereIn('code', $query->finishes),
            ))
            ->when(true, function (Builder $builder) use ($query): void {
                match ($query->sort) {
                    'price_asc' => $builder->orderBy('price_minor'),
                    'price_desc' => $builder->orderByDesc('price_minor'),
                    'newest' => $builder->orderByDesc('created_at'),
                    'name' => $builder->orderBy('slug'),
                    default => $builder->orderByDesc('is_featured')->orderBy('position'),
                };
            });
    }
}
