<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Api;

use App\Domain\Commerce\Models\Category;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Media\MediaPath;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

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
            'items' => $products->map(fn (Product $product): ProductCard => ProductCard::fromModel($product, $this->paths))->all(),
            'total' => $total,
            'page' => $query->page,
            'per_page' => $query->perPage,
            'pages' => $pages,
        ];
    }

    /** A single product by slug, or null. */
    public function find(string $slug): ?ProductCard
    {
        $product = $this->baseQuery(new CatalogQuery)
            ->where('slug', $slug)
            ->first();

        return $product !== null ? ProductCard::fromModel($product, $this->paths) : null;
    }

    /**
     * A single product, with everything a product page renders.
     *
     * Separate from `find()` because the two are asked for at different times by different
     * pages: a card list wants twenty-four shallow rows, a product page wants one deep one.
     * Same query builder, same eager loads, so a product can never look different in the two.
     */
    public function findDetail(string $slug): ?ProductDetail
    {
        $product = $this->baseQuery(new CatalogQuery)
            ->where('slug', $slug)
            ->first();

        return $product !== null ? ProductDetail::fromModel($product, $this->paths) : null;
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

            return [
                'slug' => $category->slug,
                'name' => $category->displayName(),
                'count' => $counts[$category->id] ?? 0,
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

    /** @return Builder<Product> */
    private function baseQuery(CatalogQuery $query): Builder
    {
        return Product::query()
            ->published()
            ->with([
                'translation',
                'primaryCategory.translation',
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
                $builder->whereHas('categories', static fn (Builder $c) => $c->where('slug', $query->category));
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
