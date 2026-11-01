<?php

declare(strict_types=1);

namespace App\Domain\Website\Content;

use App\Domain\Website\Content\Models\ContentItem;
use App\Domain\Website\Content\Models\SitePage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * The read side of the reimagined site (docs/08 INTEGRATION-MASTER-PLAN §3).
 *
 * One class serves two consumers: the SPA, which asks for a page's sections to draw them, and the publisher,
 * which asks for the same row to write a static shell. They must never drift, so both read from here.
 *
 * The wire is snake_case and plain arrays — the same rule the storefront API follows, and for the same
 * reason: an Eloquent model cached or JSON-encoded across a deploy becomes an incomplete class.
 */
final class ContentApi
{
    /** @return list<array<string, mixed>> */
    public function pages(): array
    {
        return SitePage::query()
            ->published()
            ->ordered()
            ->get()
            ->map(fn (SitePage $page): array => $this->pageCard($page))
            ->all();
    }

    /** A page by its key (`about`) or its path (`/about`) — the SPA knows one, a request knows the other. */
    public function page(string $keyOrPath): ?array
    {
        $needle = $keyOrPath === '' ? '/' : $keyOrPath;
        $needle = $needle === '/' ? '/' : '/'.ltrim(Str::before($needle, '?'), '/');

        $page = SitePage::query()
            ->published()
            ->where(fn ($query) => $query->where('key', ltrim($keyOrPath, '/'))->orWhere('path', $needle))
            ->first();

        if ($page === null) {
            return null;
        }

        return $this->pageCard($page) + [
            'puck_data' => $page->puck_data ?? [],
            'html' => $page->kind === SitePage::KIND_HTML ? (string) $page->canvas_html : null,
        ];
    }

    /** Every published record of a type, as a card the SPA can draw in a grid. */
    public function items(string $type): array
    {
        return ContentItem::query()
            ->ofType($type)
            ->published()
            ->ordered()
            ->get()
            ->map(fn (ContentItem $item): array => $this->itemCard($item))
            ->all();
    }

    public function item(string $type, string $slug): ?array
    {
        $item = ContentItem::query()
            ->ofType($type)
            ->published()
            ->where('slug', $slug)
            ->first();

        if ($item === null) {
            return null;
        }

        return $this->itemCard($item) + [
            'sections' => $item->sections ?? [],
            'payload' => $item->payload ?? [],
        ];
    }

    /**
     * The theme as CSS custom properties, ready to drop into `:root`.
     *
     * The tokens already exist (`theme_tokens`, 28 rows, edited by Theme). Until now nothing read them;
     * this is the read the SPA and every published shell will use.
     *
     * @return array{tokens: list<array<string, mixed>>, css: string}
     */
    public function theme(): array
    {
        if (! Schema::hasTable('theme_tokens')) {
            return ['tokens' => [], 'css' => ''];
        }

        $tokens = DB::table('theme_tokens')
            ->orderBy('group')
            ->orderBy('sort')
            ->get(['group', 'key', 'value', 'label', 'type'])
            ->map(static fn (object $row): array => [
                'group' => (string) $row->group,
                'key' => (string) $row->key,
                'value' => (string) $row->value,
                'label' => (string) $row->label,
                'type' => (string) $row->type,
            ])
            ->all();

        $css = collect($tokens)
            ->map(static fn (array $token): string => '  '.$token['key'].': '.$token['value'].';')
            ->implode("\n");

        return [
            'tokens' => $tokens,
            'css' => $css === '' ? '' : ":root {\n".$css."\n}",
        ];
    }

    /** @return array<string, mixed> */
    private function pageCard(SitePage $page): array
    {
        return [
            'key' => (string) $page->key,
            'path' => $page->url(),
            'title' => (string) $page->title,
            'kind' => (string) $page->kind,
            'status' => (string) $page->status,
            'seo' => [
                'title' => $page->metaTitle(),
                'description' => $page->metaDescription(),
                'canonical' => (string) (($page->seo ?? [])['canonical'] ?? $page->url()),
                'image' => (string) (($page->seo ?? [])['og_image'] ?? ''),
                'schema' => (string) (($page->seo ?? [])['schema'] ?? 'WebPage'),
            ],
            'updated_at' => $page->updated_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function itemCard(ContentItem $item): array
    {
        return [
            'type' => (string) $item->type,
            'slug' => (string) $item->slug,
            'path' => (string) $item->path,
            'title' => (string) $item->title,
            'excerpt' => (string) ($item->excerpt ?? ''),
            'image' => (string) (($item->payload ?? [])['image'] ?? ''),
            'seo' => [
                'title' => $item->metaTitle(),
                'description' => $item->metaDescription(),
                'canonical' => (string) (($item->seo ?? [])['canonical'] ?? $item->path),
                'image' => (string) (($item->seo ?? [])['og_image'] ?? ''),
                'schema' => (string) (($item->seo ?? [])['schema'] ?? 'WebPage'),
            ],
            'updated_at' => $item->updated_at?->toIso8601String(),
        ];
    }
}
