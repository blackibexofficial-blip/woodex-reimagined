<?php

declare(strict_types=1);

namespace App\Domain\Website\Puck;

use App\Domain\Commerce\Api\CatalogQuery;
use App\Domain\Commerce\Api\CatalogService;
use App\Domain\Commerce\Models\Attribute;
use App\Domain\Website\Models\ContentEntry;
use Illuminate\Support\Facades\Cache;

/**
 * The live implementation of BlockData.
 *
 * Products and categories come from the commerce catalog; swatches come from an attribute's
 * options, which is why the Materials page and the product filter can never disagree. FAQs
 * come from `content_entries` — the shared content library that already exists in the OS and,
 * until now, was served by nothing but the v1 section renderer.
 *
 * Everything is cached for five minutes. That is the price of a bound block: the page is a
 * stored query, so the same page can show a new price without being republished — and five
 * minutes is short enough that nobody notices and long enough that a busy product grid costs
 * one query per five minutes instead of one per visitor.
 */
final readonly class CatalogBlockData implements BlockData
{
    public function __construct(
        private CatalogService $catalog,
        private int $ttl = 300,
    ) {}

    public function products(array $props): array
    {
        $query = new CatalogQuery(
            category: ($props['category'] ?? '') !== '' ? (string) $props['category'] : null,
            sort: in_array($props['sort'] ?? 'featured', CatalogQuery::SORTS, true) ? (string) $props['sort'] : 'featured',
            perPage: min(CatalogQuery::MAX_PER_PAGE, max(1, (int) ($props['limit'] ?? 8))),
            inStockOnly: (bool) ($props['inStockOnly'] ?? false),
        );

        return Cache::remember(
            'puck:products:'.md5((string) json_encode($props)),
            $this->ttl,
            // Cache the plain arrays, not the DTOs: a cached object is a serialised class that
            // has to be deserialisable after any future refactor of that class.
            fn (): array => array_map(
                static fn ($card): array => $card->toArray(),
                $this->catalog->paginate($query)['items'],
            ),
        );
    }

    public function categories(array $props): array
    {
        $tree = Cache::remember(
            'puck:categories',
            $this->ttl,
            fn (): array => $this->catalog->categoryTree(),
        );

        return array_slice($tree, 0, max(1, (int) ($props['limit'] ?? 4)));
    }

    public function swatches(array $props): array
    {
        $code = (string) ($props['attribute'] ?? 'finish');
        $limit = max(1, (int) ($props['limit'] ?? 12));

        return Cache::remember('puck:swatches:'.$code.':'.$limit, $this->ttl, static function () use ($code, $limit): array {
            $attribute = Attribute::query()
                ->where('code', $code)
                ->with('options')
                ->first();

            if ($attribute === null) {
                return [];
            }

            return $attribute->options
                ->take($limit)
                ->map(static fn ($option): array => [
                    'code' => $option->code,
                    'label' => $option->label,
                    'hex' => $option->hex,
                    'swatch_path' => $option->swatch_path,
                ])
                ->values()
                ->all();
        });
    }

    public function faqs(array $props): array
    {
        $limit = max(1, (int) ($props['limit'] ?? 6));

        return Cache::remember('puck:faqs:'.$limit, $this->ttl, static function () use ($limit): array {
            return ContentEntry::query()
                ->where('kind', ContentEntry::FAQ)
                ->orderBy('position')
                ->orderBy('id')
                ->get()
                ->map(static fn (ContentEntry $entry): array => [
                    'question' => (string) ($entry->data['question'] ?? ''),
                    'answer' => (string) ($entry->data['answer'] ?? ''),
                ])
                ->filter(static fn (array $row): bool => $row['question'] !== '')
                ->take($limit)
                ->values()
                ->all();
        });
    }

    public function showrooms(array $props): array
    {
        // The Places module lands in T-C4. Until then a showroom block renders nothing, which
        // is the correct behaviour for a page that has not been given locations yet.
        return [];
    }
}
