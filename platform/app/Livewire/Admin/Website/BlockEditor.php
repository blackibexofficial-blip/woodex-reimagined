<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Website;

use App\Domain\Website\Content\Models\SitePage;
use App\Domain\Website\Content\ShellPublisher;
use App\Domain\Website\Puck\BlockRenderer;
use App\Domain\Website\Puck\PageComposer;
use App\Domain\Website\Puck\PageWriter;
use App\Domain\Website\Puck\PuckDocument;
use App\Domain\Website\Puck\Registry;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use InvalidArgumentException;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

/**
 * The block editor: ordered blocks on the left, the live page in the middle, the fields of the
 * selected block on the right.
 *
 * Three things shape this screen:
 *
 *   * The preview is the real page, not a mock. It is rendered by the same BlockRenderer and wrapped
 *     in the same `site.layout` shell that a visitor gets, so what the editor sees is what publishing
 *     writes — including the header's mega menu and the footer's phone number, which come from the
 *     database and can change under the editor's feet.
 *   * The field list is not written here. Every control below is generated from `registry.json`,
 *     which is the same file the React studio reads. Adding a field to a block means editing one
 *     JSON file, not this component.
 *   * Saving is explicit and publishing is a second, separate act. A draft never reaches a visitor:
 *     the page keeps `status = draft` until Publish is pressed, and Publish is what writes the
 *     static file.
 */
#[Layout('layouts::admin')]
#[Title('Edit page')]
final class BlockEditor extends Component
{
    use InteractsWithAdmin;

    public string $key = '';

    public string $pageTitle = '';

    public string $status = SitePage::STATUS_DRAFT;

    /** @var list<array{type: string, props: array<string, mixed>, id: string}> */
    public array $blocks = [];

    /** Index of the block whose fields are shown on the right. */
    public int $selected = 0;

    /** The whole rendered page, handed to the preview pane. */
    public string $previewHtml = '';

    public string $newBlockType = '';

    /** Set after a successful publish, so the screen can say where the file went. */
    public ?string $publishedFile = null;

    public function mount(string $key): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $page = SitePage::query()->where('key', $key)->firstOrFail();

        $this->key = (string) $page->key;
        $this->pageTitle = (string) $page->title;
        $this->status = (string) $page->status;

        $document = PuckDocument::fromStored($page->puck_data, $this->registry());

        $this->blocks = array_map(
            static fn (array $block): array => [
                'type' => $block['type'],
                'props' => $block['props'],
                'id' => $block['id'],
            ],
            $document->blocks,
        );

        $this->newBlockType = $this->registry()->names()[0] ?? '';

        $this->refreshPreview(dispatch: false);
    }

    public function select(int $index): void
    {
        if (isset($this->blocks[$index])) {
            $this->selected = $index;
        }
    }

    /**
     * Append a block of the chosen type and open its fields.
     *
     * A new block arrives with the registry's defaults filled in, never with an empty props array:
     * a block whose every field is blank renders nothing, and an editor who sees nothing appear has
     * no way to tell whether the click worked.
     */
    public function addBlock(): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $type = $this->newBlockType;

        if (! $this->registry()->has($type)) {
            $this->toast('That block type is not installed.', 'error');

            return;
        }

        $this->blocks[] = [
            'type' => $type,
            'props' => $this->registry()->normalizeProps($type, $this->registry()->defaults($type)),
            'id' => $type.'-'.(count($this->blocks) + 1),
        ];

        $this->selected = count($this->blocks) - 1;
        $this->reindex();
        $this->refreshPreview();
    }

    public function removeBlock(int $index): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        if (! isset($this->blocks[$index])) {
            return;
        }

        unset($this->blocks[$index]);
        $this->blocks = array_values($this->blocks);
        $this->selected = max(0, min($this->selected, count($this->blocks) - 1));

        $this->reindex();
        $this->refreshPreview();
    }

    public function moveBlock(int $index, int $direction): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $target = $index + $direction;

        if (! isset($this->blocks[$index], $this->blocks[$target])) {
            return;
        }

        [$this->blocks[$index], $this->blocks[$target]] = [$this->blocks[$target], $this->blocks[$index]];

        // Selection follows the block that moved, not the position it left.
        if ($this->selected === $index) {
            $this->selected = $target;
        } elseif ($this->selected === $target) {
            $this->selected = $index;
        }

        $this->reindex();
        $this->refreshPreview();
    }

    public function duplicateBlock(int $index): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        if (! isset($this->blocks[$index])) {
            return;
        }

        $copy = $this->blocks[$index];

        array_splice($this->blocks, $index + 1, 0, [$copy]);

        $this->selected = $index + 1;
        $this->reindex();
        $this->refreshPreview();
    }

    /**
     * Any change to a block's fields re-renders the page.
     *
     * Livewire calls this for every `wire:model` update, which is why the fields are debounced in the
     * Blade view: rendering the page runs the bound blocks' queries (a product grid is eight products,
     * a category tree is a whole tree), and doing that on every keystroke would make typing feel like
     * a slow connection.
     */
    public function updated(string $name): void
    {
        if (! str_starts_with($name, 'blocks')) {
            return;
        }

        $this->refreshPreview();
    }

    /** Persist the draft. Status is untouched: a draft stays a draft. */
    public function saveDraft(): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $page = $this->persist();

        if ($page === null) {
            return;
        }

        $this->toast('Draft saved. Nothing is live until you publish.');
    }

    /**
     * Save, flip to published, and write the static file.
     *
     * Both halves matter. The database row is what the editor and the PHP route read; the file is what
     * a visitor's web server serves without booting PHP at all. Writing one without the other is how a
     * site ends up with a published page that nobody can see, or a file that no longer matches the
     * content the admin is editing.
     */
    public function publish(): void
    {
        abort_unless($this->user()->can('website.publish'), 403);

        // Content is written first, the file second, and only then the status. The order is the
        // guarantee: if the file cannot be written the page is still a draft and nothing a visitor
        // can reach has changed. Flinching to the opposite order leaves a row that says published
        // beside a storefront that has nothing to serve.
        $page = $this->persist();

        if ($page === null) {
            return;
        }

        try {
            $file = app(ShellPublisher::class)->write((string) $page->path, $this->previewHtml);
        } catch (\Throwable $e) {
            report($e);
            $this->toast('Saved as a draft, but the static file could not be written. Nothing was published.', 'error');

            return;
        }

        $page->status = SitePage::STATUS_PUBLISHED;
        $page->published_at = now();
        $page->save();

        $this->status = SitePage::STATUS_PUBLISHED;
        $this->publishedFile = $file;

        $this->toast('Published to '.str_replace(base_path(), '', $file));
    }

    /**
     * Write the current blocks to `site_pages`.
     *
     * Every block is normalised against the registry before it is stored — the same door a save from
     * the React studio goes through — and an unknown block type fails here rather than rendering as a
     * gap. Returning null means nothing was written and the caller must not report success.
     */
    private function persist(): ?SitePage
    {
        $page = SitePage::query()->where('key', $this->key)->first();

        if ($page === null) {
            $this->toast('That page no longer exists.', 'error');

            return null;
        }

        $content = [];

        foreach ($this->blocks as $block) {
            if (! $this->registry()->has($block['type'])) {
                $this->toast("Block '{$block['type']}' is not installed; nothing was saved.", 'error');

                return null;
            }

            $content[] = [
                'type' => $block['type'],
                'props' => $this->registry()->normalizeProps($block['type'], $block['props']),
            ];
        }

        try {
            $document = app(PageWriter::class)->sanitize([
                'root' => ['props' => []],
                'content' => $content,
            ]);
        } catch (InvalidArgumentException $e) {
            $this->toast('The page could not be saved: '.$e->getMessage(), 'error');

            return null;
        }

        $page->puck_data = $document;
        $page->kind = SitePage::KIND_PUCK;

        $page->save();

        return $page;
    }

    /**
     * Re-render the page from the blocks as they are right now, and hand it to the preview pane.
     *
     * The document is built in memory rather than re-read from the database, because the whole point
     * is to show unsaved edits. `dispatch: false` is used on mount: the browser has no listener yet,
     * and the initial HTML travels inside the iframe's `srcdoc` instead.
     */
    private function refreshPreview(bool $dispatch = true): void
    {
        $this->reindex();

        $page = SitePage::query()->where('key', $this->key)->first();

        if ($page === null) {
            $this->previewHtml = '';

            return;
        }

        $document = new PuckDocument($this->blocks, $this->pageTitle);

        $html = $document->isEmpty()
            ? ''
            : $this->renderer()->renderDocument($document, $this->composer()->dataFor($document));

        $this->previewHtml = view('site.page', [
            'page' => $page,
            'seo' => is_array($page->seo) ? $page->seo : [],
            'html' => $html,
            'headingProvided' => $this->headingProvided(),
        ])->render();

        if ($dispatch) {
            $this->dispatch('preview-updated', html: $this->previewHtml);
        }
    }

    /** A hero renders its own h1; the shell only adds a hidden one when no block does. */
    private function headingProvided(): bool
    {
        foreach ($this->blocks as $block) {
            if (in_array($block['type'], ['hero', 'heroSlider'], true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Block ids are `{type}-{position}`, and they must be unique because the renderer maps bound data
     * by id. Recomputing them after every structural change is what keeps a duplicated block from
     * sharing an id with the original — two blocks with one id means one of them renders the other's
     * products.
     */
    private function reindex(): void
    {
        $counts = [];

        foreach ($this->blocks as $i => $block) {
            $counts[$block['type']] = ($counts[$block['type']] ?? 0) + 1;
            $this->blocks[$i]['id'] = $block['type'].'-'.$counts[$block['type']];
        }
    }

    private function registry(): Registry
    {
        return app(Registry::class);
    }

    private function renderer(): BlockRenderer
    {
        return app(BlockRenderer::class);
    }

    private function composer(): PageComposer
    {
        return app(PageComposer::class);
    }

    /**
     * Repeater actions for `list` fields (slides, cards) — add, remove, reorder one item.
     *
     * They live here rather than in Alpine because the item has to be normalised against its schema:
     * a slide added in the browser with no keys at all would render eight empty text nodes, and the
     * next save would keep them forever.
     */
    public function addListItem(string $field): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $index = $this->selected;
        $block = $this->blocks[$index] ?? null;

        if ($block === null) {
            return;
        }

        $definition = $this->registry()->block($block['type'])['fields'][$field] ?? null;

        if (! is_array($definition) || ($definition['type'] ?? '') !== 'list') {
            return;
        }

        $items = is_array($block['props'][$field] ?? null) ? $block['props'][$field] : [];
        $max = isset($definition['max']) ? (int) $definition['max'] : 24;

        if (count($items) >= $max) {
            $this->toast("This field holds at most {$max} items.", 'error');

            return;
        }

        /** @var array<string, array<string, mixed>> $schema */
        $schema = is_array($definition['item'] ?? null) ? $definition['item'] : [];
        $blank = [];

        foreach ($schema as $name => $fieldDefinition) {
            $blank[$name] = $fieldDefinition['default'] ?? '';
        }

        $items[] = $blank;
        $this->blocks[$index]['props'][$field] = $items;

        $this->refreshPreview();
    }

    public function removeListItem(string $field, int $item): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $index = $this->selected;
        $items = $this->blocks[$index]['props'][$field] ?? null;

        if (! is_array($items) || ! array_key_exists($item, $items)) {
            return;
        }

        unset($items[$item]);
        $this->blocks[$index]['props'][$field] = array_values($items);

        $this->refreshPreview();
    }

    public function moveListItem(string $field, int $item, int $direction): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $index = $this->selected;
        $items = $this->blocks[$index]['props'][$field] ?? null;
        $target = $item + $direction;

        if (! is_array($items) || ! isset($items[$item], $items[$target])) {
            return;
        }

        [$items[$item], $items[$target]] = [$items[$target], $items[$item]];
        $this->blocks[$index]['props'][$field] = $items;

        $this->refreshPreview();
    }

    /**
     * The field definitions of the selected block, straight from the registry.
     *
     * @return array<string, array<string, mixed>>
     */
    public function selectedFields(): array
    {
        $block = $this->blocks[$this->selected] ?? null;

        if ($block === null) {
            return [];
        }

        return $this->registry()->block($block['type'])['fields'];
    }

    /** @return array<string, array{label: string, group: string}> */
    public function blockPalette(): array
    {
        $palette = [];

        foreach ($this->registry()->blocks() as $name => $definition) {
            $palette[$name] = [
                'label' => (string) ($definition['label'] ?? $name),
                'group' => (string) ($definition['group'] ?? ''),
            ];
        }

        return $palette;
    }

    /** The label shown next to a block in the left-hand list. */
    public function blockLabel(array $block): string
    {
        $definition = $this->registry()->block($block['type']);

        return (string) ($definition['label'] ?? $block['type']);
    }

    /** A one-line summary of a block, so the list is scannable without opening each one. */
    public function blockSummary(array $block): string
    {
        $props = $block['props'];

        foreach (['heading', 'title'] as $key) {
            if (is_string($props[$key] ?? null) && trim($props[$key]) !== '') {
                return mb_strimwidth(trim($props[$key]), 0, 48, '…');
            }
        }

        foreach (['slides', 'cards', 'items'] as $key) {
            if (is_array($props[$key] ?? null) && $props[$key] !== []) {
                return count($props[$key]).' '.$key;
            }
        }

        return '';
    }

    public function render(): View
    {
        return view('livewire.admin.website.block-editor');
    }
}
