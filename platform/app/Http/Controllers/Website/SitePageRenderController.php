<?php

declare(strict_types=1);

namespace App\Http\Controllers\Website;

use App\Domain\Website\Content\Models\SitePage;
use App\Domain\Website\Puck\BlockRenderer;
use App\Domain\Website\Puck\PageComposer;
use App\Domain\Website\Puck\PuckDocument;
use App\Domain\Website\Puck\Registry;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Renders a CMS page from its blocks.
 *
 * This is the missing link between `site_pages` and the storefront. The table has held
 * `puck_data` and `canvas_html` since it was created, and the block renderer has been able to
 * turn that data into HTML for just as long, but nothing joined the two: all sixteen rows are
 * `route` pages pointing at the React app, with empty `puck_data`. So a page "existed" in the
 * admin and could not be built.
 *
 * Two audiences, one method:
 *
 *   ?preview=1  — the editor's live preview. Requires a signed-in admin, never cached.
 *   (no query)  — the published page, as the storefront serves it.
 *
 * Pages are written to disk on publish, so in normal operation a visitor never reaches this
 * controller at all: the static file answers first, exactly like every other page in `public/`.
 * It exists for the moment between saving and publishing, and for the editor.
 */
final class SitePageRenderController
{
    public function __construct(
        private readonly Registry $registry,
        private readonly PageComposer $composer,
        private readonly BlockRenderer $renderer,
    ) {}

    public function show(Request $request, string $key): Response
    {
        $page = SitePage::query()->where('key', $key)->firstOrFail();

        $isPreview = $request->boolean('preview');
        $isAdmin = $request->user() !== null;

        // A draft is not public. Preview is an admin privilege, not a query parameter.
        abort_if($isPreview && ! $isAdmin, 403);
        abort_unless($isPreview || $page->status === SitePage::STATUS_PUBLISHED, 404);

        $document = PuckDocument::fromStored($page->puck_data, $this->registry);

        $html = $document->isEmpty()
            ? ''
            : $this->renderer->renderDocument($document, $this->composer->dataFor($document));

        $body = view('puck.page', [
            'page' => $page,
            'seo' => is_array($page->seo) ? $page->seo : [],
            'html' => $html,
            'headingProvided' => in_array('hero', array_column($document->blocks, 'type'), true)
                || in_array('heroSlider', array_column($document->blocks, 'type'), true),
        ])->render();

        return response($body, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => $isPreview ? 'private, no-store' : 'public, max-age=60, s-maxage=300',
            'X-Robots-Tag' => $isPreview ? 'noindex, nofollow' : 'index, follow',
        ]);
    }
}
