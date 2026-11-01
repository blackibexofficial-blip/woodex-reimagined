<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Website;

use App\Domain\Website\Content\Models\ContentItem;
use App\Domain\Website\Content\Models\SitePage;
use App\Domain\Website\Content\ShellPublisher;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

/**
 * Every page of the reimagined site (docs/08 INTEGRATION-MASTER-PLAN §5, screen 1).
 *
 * This screen used to list the v1 interior site's HTML files — 142 of them, until those files were deleted
 * and the furniture storefront took over `/`. It then showed one page: the storefront's own shell. Both were
 * honest and both were useless.
 *
 * It now lists the site that is actually live: the 16 URLs of the reimagined storefront (`site_pages`) and
 * the records behind its dynamic addresses — services, posts, projects, showrooms, series (`content_items`).
 * The archived interior site is counted at the bottom, so it is not lost, and not mistaken for live content.
 */
#[Layout('layouts::admin')]
#[Title('Pages')]
final class PagesIndex extends Component
{
    use InteractsWithAdmin;

    public string $search = '';

    /** `all`, or one kind: route, puck, html. */
    public string $kind = '';

    public function mount(): void
    {
        abort_unless($this->user()->can('website.edit'), 403);
    }

    /**
     * Write this page's shell to the web root: the SPA document with this URL's title, description,
     * canonical, Open Graph tags and JSON-LD in the head. No PHP runs when a visitor asks for it.
     */
    public function publish(string $key): void
    {
        abort_unless($this->user()->can('website.publish'), 403);

        $page = SitePage::query()->where('key', $key)->first();

        if ($page === null) {
            $this->toast('That page no longer exists.', 'error');

            return;
        }

        $publisher = app(ShellPublisher::class);

        try {
            $publisher->ensureShell();

            if ($page->kind === SitePage::KIND_HTML && trim((string) $page->canvas_html) !== '') {
                $publisher->write($page->url(), (string) $page->canvas_html);
            } else {
                $base = rtrim((string) (config('app.url') ?: url('/')), '/');
                $seo = (array) ($page->seo ?? []);

                $publisher->write($page->url(), $publisher->render([
                    'title' => $page->metaTitle(),
                    'description' => $page->metaDescription(),
                    'canonical' => (string) ($seo['canonical'] ?? $base.$page->url()),
                    'image' => (string) ($seo['og_image'] ?? ''),
                    'type' => 'website',
                    'schema' => [
                        '@context' => 'https://schema.org',
                        '@type' => (string) ($seo['schema'] ?? 'WebPage'),
                        'name' => $page->title,
                        'url' => $base.$page->url(),
                        'description' => $page->metaDescription(),
                    ],
                ]));
            }
        } catch (\Throwable $e) {
            $this->toast('Could not publish “'.$page->title.'”: '.$e->getMessage(), 'error');

            return;
        }

        $page->forceFill(['published_at' => now()])->save();

        $this->toast('“'.$page->title.'” published — '.$page->url());
    }

    public function render(): View
    {
        $pages = SitePage::query()
            ->ordered()
            ->when($this->kind !== '', fn ($query) => $query->where('kind', $this->kind))
            ->when($this->search !== '', function ($query): void {
                $needle = mb_strtolower(trim($this->search));

                $query->where(fn ($inner) => $inner
                    ->whereRaw('lower(title) like ?', ['%'.$needle.'%'])
                    ->orWhereRaw('lower(path) like ?', ['%'.$needle.'%']));
            })
            ->get()
            ->map(static fn (SitePage $page): array => [
                'key' => (string) $page->key,
                'path' => $page->url(),
                'title' => (string) $page->title,
                'kind' => (string) $page->kind,
                'status' => (string) $page->status,
                'description' => $page->metaDescription(),
                'stale' => $page->published_at === null
                    || ($page->updated_at !== null && $page->published_at !== null && $page->updated_at->gt($page->published_at)),
                'published_at' => $page->published_at?->diffForHumans(),
                'updated_at' => $page->updated_at?->diffForHumans(),
            ])
            ->all();

        $all = SitePage::query()->count();
        $stale = SitePage::query()
            ->where(fn ($query) => $query->whereNull('published_at')->orWhereColumn('updated_at', '>', 'published_at'))
            ->count();

        return view('livewire.admin.website.pages-index', [
            'pages' => $pages,
            'counts' => [
                'pages' => $all,
                'shown' => count($pages),
                'records' => ContentItem::query()->count(),
                'stale' => $stale,
                'archived' => Schema::hasTable('pages') && Schema::hasColumn('pages', 'archived_at')
                    ? DB::table('pages')->whereNotNull('archived_at')->count()
                    : 0,
            ],
            'kinds' => [
                SitePage::KIND_ROUTE => 'Storefront route',
                SitePage::KIND_PUCK => 'Built in Puck',
                SitePage::KIND_HTML => 'Hand-written HTML',
            ],
        ]);
    }
}
