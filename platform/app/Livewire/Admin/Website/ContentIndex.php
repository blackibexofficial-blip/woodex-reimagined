<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Website;

use App\Domain\Website\Content\BodyText;
use App\Domain\Website\Content\Models\ContentItem;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

/**
 * The 30 records behind the storefront's dynamic addresses — services, posts, projects, series, showrooms.
 *
 * They were editable only through the studio screens, which still read the *interior* site's rows (48 insights,
 * 6 projects, 12 cities) — so the blog screen listed wardrobe articles nobody can reach, and the six furniture
 * posts that the storefront actually shows could not be edited at all.
 *
 * This screen edits the rows the site reads. Saving publishes nothing on its own: the file a visitor and a
 * crawler receive is written by `website:publish`, which is a deliberate keystroke, not a side effect of
 * pressing Save.
 */
#[Layout('layouts::admin')]
#[Title('Content')]
final class ContentIndex extends Component
{
    use InteractsWithAdmin;

    /** Empty for every type, otherwise one of ContentItem::TYPES. */
    public string $type = '';

    public string $search = '';

    public ?int $editing = null;

    /** @var array<string, mixed> */
    public array $form = [];

    public function mount(): void
    {
        abort_unless($this->user()->can('website.edit'), 403);
    }

    public function edit(int $id): void
    {
        $item = ContentItem::query()->find($id);

        if ($item === null) {
            $this->toast('That record no longer exists.', 'error');

            return;
        }

        $seo = (array) ($item->seo ?? []);

        $this->editing = $item->id;
        $this->form = [
            'title' => $item->title,
            'excerpt' => (string) $item->excerpt,
            'path' => '/'.ltrim((string) $item->path, '/'),
            'status' => $item->status,
            'seo_title' => (string) ($seo['title'] ?? ''),
            'seo_description' => (string) ($seo['description'] ?? ''),
            // One block per line keeps the field readable without a JSON editor: `heading: …` and plain text.
            'sections' => BodyText::from($item->sections),
            'kept' => $this->keptBlocks($item->sections),
        ];
    }

    public function cancel(): void
    {
        $this->editing = null;
        $this->form = [];
        $this->resetValidation();
    }

    public function save(): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $item = $this->editing !== null ? ContentItem::query()->find($this->editing) : null;

        if ($item === null) {
            $this->toast('That record no longer exists.', 'error');
            $this->cancel();

            return;
        }

        $data = $this->validate([
            'form.title' => ['required', 'string', 'max:180'],
            'form.excerpt' => ['nullable', 'string', 'max:400'],
            'form.path' => [
                'required', 'string', 'max:190', 'starts_with:/', 'regex:/^\/[a-z0-9\-\/]*$/',
                Rule::unique('content_items', 'path')->ignore($item->id),
            ],
            'form.status' => ['required', Rule::in([ContentItem::STATUS_DRAFT, ContentItem::STATUS_PUBLISHED])],
            'form.seo_title' => ['nullable', 'string', 'max:180'],
            'form.seo_description' => ['nullable', 'string', 'max:400'],
            'form.sections' => ['nullable', 'string'],
        ])['form'];

        $path = '/'.trim((string) $data['path'], '/');

        $item->update([
            'title' => (string) $data['title'],
            'excerpt' => trim((string) ($data['excerpt'] ?? '')),
            'path' => $path,
            'slug' => Str::afterLast($path, '/'),
            'status' => (string) $data['status'],
            // Only the paragraphs are replaced; a post's hero, a service's steps and an article's FAQ are
            // structured blocks this field never showed, and they keep their place in the body.
            'sections' => BodyText::merge((string) ($data['sections'] ?? ''), $item->sections),
            'seo' => array_filter([
                'title' => trim((string) ($data['seo_title'] ?? '')),
                'description' => trim((string) ($data['seo_description'] ?? '')),
            ]) + ['canonical' => '', 'schema' => ''],
            'published_at' => $data['status'] === ContentItem::STATUS_PUBLISHED
                ? ($item->published_at ?? now())
                : null,
        ]);

        $this->toast($item->title.' saved. Publish the site to write it out.');

        $this->editing = null;
        $this->form = [];
    }

    public function toggleStatus(int $id): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $item = ContentItem::query()->find($id);

        if ($item === null) {
            return;
        }

        $published = $item->status === ContentItem::STATUS_PUBLISHED;

        $item->update([
            'status' => $published ? ContentItem::STATUS_DRAFT : ContentItem::STATUS_PUBLISHED,
            'published_at' => $published ? null : ($item->published_at ?? now()),
        ]);

        $this->toast($item->title.' is now '.($published ? 'a draft' : 'published').'.');
    }

    /**
     * Write every published shell again, so an edit above reaches the file a crawler reads.
     *
     * The command owns the work — one implementation, whether it is started here or from a terminal.
     */
    public function publish(): void
    {
        abort_unless($this->user()->can('website.publish'), 403);

        try {
            \Illuminate\Support\Facades\Artisan::call('website:publish');
        } catch (\Throwable $e) {
            $this->toast('Publishing failed: '.$e->getMessage(), 'error');

            return;
        }

        $this->toast('The site was published. Every page and record now carries the current copy.');
    }

    /** @return array<int, array<string, mixed>> */
    private function rows(): array
    {
        return ContentItem::query()
            ->when($this->type !== '', fn ($query) => $query->where('type', $this->type))
            ->when($this->search !== '', function ($query): void {
                $term = '%'.$this->search.'%';

                $query->where(fn ($inner) => $inner
                    ->where('title', 'like', $term)
                    ->orWhere('path', 'like', $term)
                    ->orWhere('excerpt', 'like', $term));
            })
            ->orderBy('type')
            ->orderBy('sort')
            ->orderBy('title')
            ->get()
            ->map(fn (ContentItem $item): array => [
                'id' => $item->id,
                'type' => $item->type,
                'title' => $item->title,
                'path' => '/'.ltrim((string) $item->path, '/'),
                'excerpt' => (string) $item->excerpt,
                'status' => $item->status,
                'updated' => $item->updated_at?->diffForHumans() ?? '—',
            ])
            ->all();
    }

    /**
     * The blocks this screen does not edit, named for the note above the field.
     *
     * Saying so is not decoration: an author who opens a post, sees only its paragraphs and presses Save needs to
     * know that the hero, the steps and the FAQ are still there, or the field looks like it deleted them.
     *
     * @param  array<int, mixed>|null  $sections
     * @return list<string>
     */
    private function keptBlocks(?array $sections): array
    {
        $kept = [];

        foreach ((array) $sections as $section) {
            if (! is_array($section) || ($section['type'] ?? '') === 'text') {
                continue;
            }

            $type = (string) ($section['type'] ?? '');
            $label = match ($type) {
                'hero' => 'Hero',
                'process' => 'Process steps',
                'faq' => 'FAQ',
                default => ucfirst($type),
            };
            $count = match ($type) {
                'process' => count((array) ($section['steps'] ?? [])),
                'faq' => count((array) ($section['items'] ?? [])),
                default => 0,
            };

            $kept[] = $label.($count > 0 ? ' ('.$count.')' : '');
        }

        return array_values(array_unique($kept));
    }

    public function render(): View
    {
        return view('livewire.admin.website.content-index', [
            'rows' => $this->rows(),
            'types' => [
                '' => 'Every type',
                'service' => 'Services',
                'post' => 'Blog posts',
                'project' => 'Projects',
                'series' => 'Series',
                'showroom' => 'Showrooms',
            ],
            'counts' => ContentItem::query()
                ->selectRaw('type, count(*) as total')
                ->groupBy('type')
                ->pluck('total', 'type')
                ->all(),
        ]);
    }
}
