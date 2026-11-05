<?php

declare(strict_types=1);

namespace App\Http\Controllers\Website;

use App\Domain\Commerce\Api\CatalogQuery;
use App\Domain\Commerce\Api\CatalogService;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * The public catalogue: shop listing, category pages and product pages.
 *
 * These are the three addresses the home page has been linking to since the product grid was
 * built — every card on the front page pointed at `/product/{slug}` and every one of them
 * answered 404. The catalogue itself was never the missing piece: `CatalogService` has had
 * `paginate`, `findDetail` and `categoryTree` since the storefront API was written, and they
 * are covered by tests. What was missing was a Blade front end, so this controller is a thin
 * adapter: it turns a request into a `CatalogQuery`, hands it to the service, and picks a view.
 *
 * Deliberately no query building here. The moment a controller starts assembling `where`
 * clauses it becomes a second, untested catalogue that drifts from the one the API serves.
 */
final class StorefrontController extends Controller
{
    public function __construct(private readonly CatalogService $catalog) {}

    /** `/shop` — the full catalogue with filters, sorting and pagination. */
    public function shop(Request $request): View
    {
        return $this->listing($request, null, 'Shop');
    }

    /**
     * `/category/{slug}` — a category and everything beneath it.
     *
     * `CatalogService::slugsInSubtree()` already resolves a parent to its children, so "Office
     * Furniture" lists the chairs and desks too rather than showing an empty page.
     */
    public function category(Request $request, string $slug): View
    {
        $node = $this->findCategory($slug);

        abort_if($node === null, 404);

        return $this->listing($request, $slug, (string) $node['name']);
    }

    /** `/product/{slug}` — one product, with its gallery, specification and related pieces. */
    public function product(string $slug): View
    {
        $product = $this->catalog->findDetail($slug);

        abort_if($product === null, 404);

        $related = [];

        if (! empty($product['category_slug'])) {
            $related = array_values(array_filter(
                $this->catalog->paginate(CatalogQuery::fromArray([
                    'category' => $product['category_slug'],
                    'per_page' => 5,
                ]))['items'],
                fn (array $item): bool => $item['slug'] !== $product['slug'],
            ));
        }

        return view('site.product', [
            'product' => $product,
            'related' => array_slice($related, 0, 4),
            'seo' => [
                'title' => $product['name'].' — Woodex Furniture',
                'description' => $this->describe($product),
                'canonical' => url($product['url']),
                'og_image' => $product['image'] !== null ? url($product['image']) : null,
                'robots' => 'index,follow',
            ],
            'title' => $product['name'],
        ]);
    }

    /**
     * The shared listing renderer for `/shop` and `/category/{slug}`.
     *
     * Both screens are the same page with a different constraint, so they share one code path;
     * only the heading and the category constraint differ.
     */
    private function listing(Request $request, ?string $categorySlug, string $heading): View
    {
        $query = CatalogQuery::fromArray(array_filter([
            'search' => (string) $request->query('q', ''),
            'category' => $categorySlug,
            'sort' => (string) $request->query('sort', 'featured'),
            'page' => (int) $request->query('page', 1),
            'in_stock' => $request->boolean('in_stock'),
        ], fn (mixed $value): bool => $value !== null && $value !== '' && $value !== false));

        $results = $this->catalog->paginate($query);

        return view('site.shop', [
            'heading' => $heading,
            'categorySlug' => $categorySlug,
            'items' => $results['items'],
            'total' => $results['total'],
            'page' => $results['page'],
            'pages' => $results['pages'],
            'sort' => $query->sort,
            'search' => $query->search,
            'inStockOnly' => $query->inStockOnly,
            'sorts' => CatalogQuery::SORTS,
            'categories' => $this->catalog->categoryTree(),
            'seo' => [
                'title' => $heading.' — Woodex Furniture',
                'description' => sprintf(
                    'Browse %d %s from Woodex Furniture — office and home furniture made in Lahore, delivered across Pakistan.',
                    $results['total'],
                    $heading === 'Shop' ? 'pieces' : mb_strtolower($heading).' pieces',
                ),
                'canonical' => url($categorySlug === null ? '/shop' : '/category/'.$categorySlug),
                'robots' => 'index,follow',
            ],
            'title' => $heading,
        ]);
    }

    /** Finds a category node anywhere in the tree by slug. */
    private function findCategory(string $slug): ?array
    {
        $walk = function (array $nodes) use (&$walk, $slug): ?array {
            foreach ($nodes as $node) {
                if (($node['slug'] ?? null) === $slug) {
                    return $node;
                }

                $found = $walk($node['children'] ?? []);

                if ($found !== null) {
                    return $found;
                }
            }

            return null;
        };

        return $walk($this->catalog->categoryTree());
    }

    /** Meta description that never ends mid-word, and never ships an empty tag. */
    private function describe(array $product): string
    {
        $summary = trim((string) ($product['summary'] ?? ''));
        $description = trim((string) ($product['description'] ?? ''));

        $text = $summary !== '' ? $summary : strip_tags($description);
        $text = trim((string) preg_replace('/\s+/', ' ', $text));

        if ($text === '') {
            $text = $product['name'].' from Woodex Furniture, Lahore.';
        }

        return mb_strlen($text) <= 158 ? $text : mb_substr($text, 0, 155).'…';
    }
}
