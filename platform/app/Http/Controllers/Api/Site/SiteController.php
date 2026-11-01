<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Site;

use App\Domain\Website\Content\ContentApi;
use App\Domain\Website\Content\Models\ContentItem;
use Illuminate\Http\JsonResponse;

/**
 * The reimagined site's own API (docs/08 INTEGRATION-MASTER-PLAN §3).
 *
 * The storefront already reads its catalogue from `/api/storefront/v1`. This is the other half: the words,
 * the records and the theme — everything that used to be hardcoded in `src/data/*.ts`.
 *
 * Read-only. Editing happens in the admin, through Livewire, where the audit trail lives.
 */
final class SiteController
{
    public function __construct(private readonly ContentApi $content) {}

    public function pages(): JsonResponse
    {
        $pages = $this->content->pages();

        return response()->json([
            'data' => $pages,
            'meta' => ['count' => count($pages)],
        ]);
    }

    public function page(string $key): JsonResponse
    {
        $page = $this->content->page($key);

        if ($page === null) {
            return response()->json(['message' => 'No such page.', 'key' => $key], 404);
        }

        return response()->json(['data' => $page]);
    }

    public function content(string $type): JsonResponse
    {
        if (! in_array($type, ContentItem::TYPES, true)) {
            return response()->json([
                'message' => 'Unknown content type.',
                'type' => $type,
                'types' => ContentItem::TYPES,
            ], 404);
        }

        $items = $this->content->items($type);

        return response()->json([
            'data' => $items,
            'meta' => ['type' => $type, 'count' => count($items)],
        ]);
    }

    public function contentItem(string $type, string $slug): JsonResponse
    {
        if (! in_array($type, ContentItem::TYPES, true)) {
            return response()->json(['message' => 'Unknown content type.', 'type' => $type], 404);
        }

        $item = $this->content->item($type, $slug);

        if ($item === null) {
            return response()->json(['message' => 'No such record.', 'type' => $type, 'slug' => $slug], 404);
        }

        return response()->json(['data' => $item]);
    }

    public function theme(): JsonResponse
    {
        return response()->json(['data' => $this->content->theme()]);
    }
}
