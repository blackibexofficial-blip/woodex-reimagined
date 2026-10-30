<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Website;

use App\Domain\Website\Models\Page;
use App\Domain\Website\Puck\PuckDocument;
use App\Domain\Website\Puck\Registry;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Locked;
use Livewire\Attributes\Title;
use Livewire\Component;

/**
 * The page the Puck studio lives on.
 *
 * Livewire's job here is small on purpose: authorise, load the page, hand the document to the
 * React editor, and stay out of the way. Every keystroke in the editor is client state; the
 * only round trip is a save, which goes to the JSON endpoint rather than back through Livewire.
 * A builder that re-rendered a component on every drag would be unusable on a shared host.
 *
 * Opening this screen writes nothing. A preview token is minted on the first save, so a page
 * that is merely looked at does not change.
 */
#[Layout('layouts::admin')]
#[Title('Page editor')]
class PageEditor extends Component
{
    use InteractsWithAdmin;

    #[Locked]
    public Page $page;

    public function mount(Page $page): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $this->page = $page;
    }

    /**
     * Turn a file-backed page into a Puck page.
     *
     * Deliberately explicit and deliberately lossy: the new page starts empty and the HTML file
     * is left in place (`source_file`) until someone deletes it. Importing the v1 sections
     * automatically is a separate job with its own review; until then, converting is a
     * decision someone makes, not something that happens when they click a page.
     */
    public function convert(): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        if ($this->page->builder === 'puck') {
            return;
        }

        $this->page->builder = 'puck';
        $this->page->puck_data = ['root' => ['props' => []], 'content' => []];
        $this->page->status = 'draft';
        $this->page->published_at = null;
        $this->page->save();

        $this->redirectRoute('admin.website.pages.edit', ['page' => $this->page->id]);
    }

    public function render(): View
    {
        $registry = app(Registry::class);
        $document = PuckDocument::fromStored($this->page->puck_data, $registry);
        $publicUrl = url('/p/'.trim((string) $this->page->slug, '/'));

        return view('livewire.admin.website.page-editor', [
            'page' => $this->page,
            'isPuck' => $this->page->builder === 'puck',
            'document' => [
                'root' => ['props' => []],
                'content' => array_map(
                    static fn (array $block): array => ['type' => $block['type'], 'props' => $block['props']],
                    $document->blocks,
                ),
            ],
            'blocks' => $registry->names(),
            'canPublish' => $this->user()->can('website.publish'),
            'publicUrl' => $publicUrl,
            'previewUrl' => $this->page->preview_token !== null
                ? $publicUrl.'?preview='.$this->page->preview_token
                : null,
        ]);
    }
}
