<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Domain\Website\Models\Page;
use App\Domain\Website\Puck\InvalidPuckDocument;
use App\Domain\Website\Puck\PageWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The one write endpoint behind the Puck studio.
 *
 * It is a JSON endpoint rather than a Livewire action because the editor is a React
 * application: posting one document and getting one answer back is the whole protocol, and it
 * survives a page that has been open for two hours far better than a component round-trip.
 *
 * Three refusals matter here:
 *
 *  - **Permission.** Saving needs `website.edit`, publishing additionally needs
 *    `website.publish` — the same split the v1 website section already uses, so an editor can
 *    prepare a page without being able to put it live.
 *  - **Stale version.** If two people open the same page, the second save is refused with 409
 *    instead of overwriting the first. Losing a colleague's work is the fastest way to lose
 *    the colleague.
 *  - **Unknown blocks.** Validated strictly on save (see PageWriter), so a save can never
 *    delete a block it does not understand.
 */
final class PageDocumentController
{
    public function __construct(private readonly PageWriter $writer) {}

    public function update(Request $request, Page $page): JsonResponse
    {
        abort_unless($request->user()?->can('website.edit') === true, 403);

        $data = $request->validate([
            'document' => ['required', 'array'],
            'publish' => ['sometimes', 'boolean'],
            'version' => ['required', 'integer', 'min:0'],
        ]);

        $publish = (bool) ($data['publish'] ?? false);

        if ($publish) {
            abort_unless($request->user()->can('website.publish'), 403);
        }

        if ((int) $data['version'] !== (int) $page->puck_version) {
            return response()->json([
                'message' => 'This page was saved somewhere else. Reload before saving again.',
                'version' => $page->puck_version,
            ], 409);
        }

        try {
            $document = $this->writer->sanitize($data['document']);
        } catch (InvalidPuckDocument $e) {
            return response()->json([
                'message' => 'The page was not saved.',
                'errors' => $e->errors,
            ], 422);
        }

        $page->builder = 'puck';
        $page->puck_data = $document;
        $page->puck_version = (int) $page->puck_version + 1;

        if ($publish) {
            $page->status = 'published';
            $page->published_at ??= now();
        } elseif ($page->status === 'published') {
            // A published page that is edited stays published; saving a draft of a live page
            // must not take the page off the site.
            $page->status = 'published';
        } else {
            $page->status = 'draft';
        }

        // The token exists from the first save, so "preview" works for a draft that has never
        // been published — which is exactly when a preview link is wanted.
        $page->preview_token ??= Str::random(40);

        $page->save();

        return response()->json([
            'saved' => true,
            'version' => (int) $page->puck_version,
            'status' => $page->status,
            'url' => $this->publicUrl($page),
            'preview_url' => $this->publicUrl($page).'?preview='.$page->preview_token,
            'blocks' => count($document['content']),
        ]);
    }

    /**
     * Where the page is served. Puck pages live under /p/ while the file-backed pages keep
     * their own routes, so this is the studio's only knowledge of that prefix — change it here
     * and in routes/website.php.
     */
    private function publicUrl(Page $page): string
    {
        return url('/p/'.trim((string) $page->slug, '/'));
    }
}
