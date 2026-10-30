<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Storefront;

use App\Domain\Commerce\Api\CatalogQuery;
use App\Domain\Commerce\Api\CatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * The storefront's read-only catalog API.
 *
 * Public and unauthenticated by design — it serves the same data the site renders to anyone
 * who visits. It is safe because it only reads published products and because every filter
 * passes through CatalogQuery, which clamps page size and validates sort values.
 *
 * Responses are cached for five minutes and carry an ETag, so a returning visitor's browser
 * gets a 304 instead of the payload. Five minutes is a deliberate trade: long enough that a
 * busy catalog page is served from the file cache, short enough that a price correction
 * appears without anyone needing to purge anything.
 */
final class CatalogController
{
    private const int TTL_SECONDS = 300;

    public function __construct(private readonly CatalogService $catalog) {}

    public function index(Request $request): JsonResponse
    {
        $query = CatalogQuery::fromArray($request->query());

        $payload = Cache::remember(
            $query->cacheKey(),
            self::TTL_SECONDS,
            fn (): array => $this->catalog->paginate($query),
        );

        $body = [
            'data' => $payload['items'],
            'meta' => [
                'total' => $payload['total'],
                'page' => $payload['page'],
                'per_page' => $payload['per_page'],
                'pages' => $payload['pages'],
            ],
        ];

        $etag = '"'.substr(md5((string) json_encode($body)), 0, 32).'"';

        if ($request->header('If-None-Match') === $etag) {
            return new JsonResponse(null, 304, ['ETag' => $etag]);
        }

        return new JsonResponse($body, 200, [
            'ETag' => $etag,
            'Cache-Control' => 'public, max-age=60, stale-while-revalidate=300',
        ]);
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        $card = Cache::remember(
            'commerce:product:'.$slug.':v2',
            self::TTL_SECONDS,
            fn () => $this->catalog->findDetail($slug),
        );

        if ($card === null) {
            return new JsonResponse([
                'error' => [
                    'code' => 'product_not_found',
                    'message' => 'That product is not in the catalog.',
                ],
            ], 404);
        }

        return new JsonResponse(['data' => $card], 200, [
            'Cache-Control' => 'public, max-age=60, stale-while-revalidate=300',
        ]);
    }

    public function categories(): JsonResponse
    {
        $tree = Cache::remember(
            'commerce:categories:v1',
            self::TTL_SECONDS,
            fn (): array => $this->catalog->categoryTree(),
        );

        return new JsonResponse(['data' => $tree], 200, [
            'Cache-Control' => 'public, max-age=300',
        ]);
    }
}
