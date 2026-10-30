<?php

declare(strict_types=1);

namespace App\Http\Controllers\Website;

use App\Domain\Website\Models\Page;
use App\Domain\Website\Puck\BlockRenderer;
use App\Domain\Website\Puck\PageComposer;
use App\Domain\Website\Puck\PuckDocument;
use App\Domain\Website\Puck\Registry;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;

/**
 * Serves a Puck page at /p/{slug}.
 *
 * Both halves of the website answer the same URLs in the end, but this controller only exists
 * so the new builder can be proven on a handful of pages before the other 142 are moved — the
 * existing file-backed routes are untouched, and a page is switched over by flipping
 * `builder` to 'puck', not by deleting a route.
 *
 * Two kinds of visitor: the public, who see published pages only, and an editor holding a
 * preview link, who may see a draft. The preview token is a 40-character random string in the
 * URL; it is checked per page, so a leaked token exposes exactly one draft.
 */
final class PuckPageController
{
    public function __construct(
        private readonly Registry $registry,
        private readonly PageComposer $composer,
        private readonly BlockRenderer $renderer,
    ) {}

    public function show(Request $request, string $slug): Response
    {
        $page = $this->findPage($slug, $request->query('preview'));

        if ($page === null) {
            abort(404);
        }

        $document = PuckDocument::fromStored($page->puck_data, $this->registry);

        // An empty document is not a 404: the page exists, it just has no blocks yet, and an
        // editor opening their own draft should see that rather than a 404 page.
        if ($document->isEmpty()) {
            abort_unless($this->isPreview($page, $request->query('preview')), 404);
        }

        $html = $this->html($page, $document);

        $body = view('puck.page', [
            'page' => $page,
            'seo' => is_array($page->seo) ? $page->seo : [],
            'html' => $html,
            'headingProvided' => in_array('hero', array_column($document->blocks, 'type'), true),
        ])->render();

        return response($body, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            // Previews must never be cached by anything — not the CDN, not the browser.
            'Cache-Control' => $this->isPreview($page, $request->query('preview'))
                ? 'private, no-store'
                : 'public, max-age=60, s-maxage=300',
        ]);
    }

    /**
     * Rendered HTML, cached on the page's content signature.
     *
     * The key changes when the page is saved (`updated_at`) or when its block list changes
     * (`signature`), so an edit is live immediately. Catalog data inside the blocks is cached
     * separately and refreshes within five minutes — which is the whole promise of a bound
     * block: change the price in the admin, the page follows.
     */
    private function html(Page $page, PuckDocument $document): string
    {
        $key = 'puck:page:'.$page->id.':'.$page->updated_at?->getTimestamp().':'.md5($document->signature());

        return Cache::remember($key, 60, fn (): string => $this->renderer->renderDocument(
            $document,
            $this->composer->dataFor($document),
        ));
    }

    private function findPage(string $slug, mixed $preview): ?Page
    {
        $slug = '/'.trim($slug, '/');

        // Slugs are stored with a trailing slash (the v1 convention, kept so the 142 existing
        // URLs do not change). Both spellings resolve, so a link without the slash works.
        $candidates = array_values(array_unique([$slug.'/', $slug]));

        return Page::query()
            ->whereIn('slug', $candidates)
            ->where('builder', 'puck')
            ->where(static function ($query) use ($preview): void {
                $query->where(static function ($published): void {
                    $published->where('status', 'published')->whereNotNull('published_at');
                });

                // A valid preview token lifts the published requirement for that one page.
                if (is_string($preview) && $preview !== '') {
                    $query->orWhere('preview_token', $preview);
                }
            })
            ->first();
    }

    private function isPreview(Page $page, mixed $preview): bool
    {
        return is_string($preview) && $preview !== '' && $page->preview_token === $preview;
    }
}
