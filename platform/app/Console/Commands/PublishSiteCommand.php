<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Website\Content\Models\ContentItem;
use App\Domain\Website\Content\RedirectPublisher;
use App\Domain\Website\Content\Models\SitePage;
use App\Domain\Website\Content\ShellPublisher;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

/**
 * Turns published rows into the files a visitor and a crawler actually receive.
 *
 * For every published page and record this writes `public/<path>/index.html`: the built SPA document with
 * that page's title, description, canonical, Open Graph tags and JSON-LD in the head. A hand-written (`html`)
 * page is written as-is, because it is a document in its own right.
 *
 *   php artisan website:publish                        # everything, canonicals from APP_URL
 *   php artisan website:publish --base=https://woodex.com.pk
 *   php artisan website:publish --only=about --only=home
 *
 * This is a build step, deliberately: nothing renders at request time, so a missing file is a 404 rather than
 * a second frontend. The SPA takes over in the browser either way.
 */
final class PublishSiteCommand extends Command
{
    protected $signature = 'website:publish
                            {--base= : Absolute base URL for canonicals (defaults to APP_URL)}
                            {--only=* : Publish only these page keys}
                            {--skip-sitemap : Do not rewrite sitemap.xml}
                            {--skip-redirects : Do not rewrite the .htaccess redirect block}';

    protected $description = 'Write the static shell for every published page and record (title, meta, JSON-LD)';

    public function handle(ShellPublisher $publisher, RedirectPublisher $redirects): int
    {
        $base = rtrim((string) ($this->option('base') ?: config('app.url') ?: url('/')), '/');

        try {
            $publisher->ensureShell();
        } catch (\RuntimeException $e) {
            $this->components->error($e->getMessage());

            return self::FAILURE;
        }

        $only = array_values(array_filter((array) $this->option('only'), static fn (string $key): bool => $key !== ''));

        $pages = SitePage::query()
            ->published()
            ->ordered()
            ->when($only !== [], fn ($query) => $query->whereIn('key', $only))
            ->get();

        // Every published page, once: each file carries this list so no page is an orphan in the file tree a
        // crawler reads (the storefront's own nav is drawn by JavaScript and is invisible to it).
        $items = ContentItem::query()->published()->ordered()->get();

        $nav = SitePage::query()->published()->ordered()->get()
            ->map(fn (SitePage $page): array => [
                'label' => $this->heading($page->title),
                'href' => $page->url(),
            ])
            ->all();

        $written = 0;
        $failed = 0;
        $urls = [];

        foreach ($pages as $page) {
            $url = $page->url();

            try {
                if ($page->kind === SitePage::KIND_HTML && trim((string) $page->canvas_html) !== '') {
                    $publisher->write($url, (string) $page->canvas_html);
                } else {
                    $publisher->write($url, $publisher->render(
                        $this->pageMeta($page, $base),
                        $this->pageFallback($page, $items, $nav),
                    ));
                }

                $written++;
                $urls[] = [
                    'loc' => $base.$url,
                    'lastmod' => $page->updated_at?->toDateString(),
                    'priority' => $url === '/' ? '1.0' : '0.8',
                ];

                $this->components->twoColumnDetail($url, 'published');
            } catch (\Throwable $e) {
                $failed++;
                $this->components->twoColumnDetail($url, '<fg=red>'.$e->getMessage().'</>');
            }
        }

        foreach ($items as $item) {
            $path = '/'.ltrim((string) $item->path, '/');

            try {
                $publisher->write($path, $publisher->render(
                    $this->itemMeta($item, $base),
                    $this->itemFallback($item, $items, $nav),
                ));
                $written++;
                $urls[] = [
                    'loc' => $base.$path,
                    'lastmod' => $item->updated_at?->toDateString(),
                    'priority' => '0.6',
                ];
            } catch (\Throwable $e) {
                $failed++;
                $this->components->twoColumnDetail($path, '<fg=red>'.$e->getMessage().'</>');
            }
        }

        // The redirects come after the pages on purpose: a redirect from an address that now has a file can never
        // fire, and the publisher is what makes the file exist.
        if (! $this->option('skip-redirects')) {
            $redirected = $redirects->write(RedirectPublisher::rows());

            $this->components->twoColumnDetail('.htaccess redirects', $redirected['rules'].' rules');

            if ($redirected['skipped'] !== []) {
                $this->components->warn(count($redirected['skipped']).' redirect(s) skipped: '.implode(', ', array_slice($redirected['skipped'], 0, 5)));
            }
        }

        if (! $this->option('skip-sitemap')) {
            $publisher->writeSitemap($publisher->sitemapXml($urls));
            $this->components->twoColumnDetail('sitemap.xml', count($urls).' URLs');
        }

        $this->newLine();
        $this->components->twoColumnDetail('Pages', (string) $pages->count());
        $this->components->twoColumnDetail('Records', (string) $items->count());
        $this->components->twoColumnDetail('Files written', (string) $written);
        $this->components->twoColumnDetail('Failures', $failed > 0 ? '<fg=red>'.$failed.'</>' : '0');
        $this->components->twoColumnDetail('Base URL', $base);

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }

    /**
     * A page's fallback document: the headline, the summary, and the site's links.
     *
     * @param  Collection<int, ContentItem>  $items
     * @param  list<array{label: string, href: string}>  $nav
     * @return array{heading: string, lead: string, paragraphs: list<string>, links: list<array{label: string, href: string}>}
     */
    private function pageFallback(SitePage $page, Collection $items, array $nav): array
    {
        $url = $page->url();

        // A listing page owns its children: putting their titles and summaries in the file is both the page's
        // real content and the internal links a crawler needs to reach them.
        $children = $items
            ->filter(fn (ContentItem $item): bool => str_starts_with('/'.ltrim((string) $item->path, '/'), rtrim($url, '/').'/'))
            ->take(12);

        $paragraphs = $children
            ->map(fn (ContentItem $item): string => trim($item->title.'. '.$item->excerpt))
            ->filter(fn (string $line): bool => $line !== '.')
            ->values()
            ->all();

        $links = array_merge(
            $children
                ->map(fn (ContentItem $item): array => [
                    'label' => $item->title,
                    'href' => '/'.ltrim((string) $item->path, '/'),
                ])
                ->values()
                ->all(),
            $nav,
        );

        return [
            'heading' => $this->heading($page->title),
            'lead' => (string) ($page->seo['description'] ?? ''),
            'paragraphs' => $paragraphs,
            'links' => $links,
        ];
    }

    /**
     * A record's fallback document: its own words, its siblings, and the site's links.
     *
     * The paragraphs are the record's real sections — a service's intro, a project's description — so the file
     * is not a stub that repeats the title three times.
     *
     * @param  Collection<int, ContentItem>  $items
     * @param  list<array{label: string, href: string}>  $nav
     * @return array{heading: string, lead: string, paragraphs: list<string>, links: list<array{label: string, href: string}>}
     */
    private function itemFallback(ContentItem $item, Collection $items, array $nav): array
    {
        $parent = [
            'post' => '/blog',
            'service' => '/services',
            'project' => '/projects',
            'series' => '/series',
            'showroom' => '/showrooms',
        ][$item->type] ?? '/';

        $siblings = $items
            ->where('type', $item->type)
            ->where('id', '!=', $item->id)
            ->take(8)
            ->map(fn (ContentItem $sibling): array => [
                'label' => $sibling->title,
                'href' => '/'.ltrim((string) $sibling->path, '/'),
            ])
            ->values()
            ->all();

        $links = array_merge(
            [['label' => 'All '.$item->type.'s', 'href' => $parent]],
            $siblings,
            $nav,
        );

        $paragraphs = [];

        foreach ((array) $item->sections as $section) {
            foreach (['text', 'body', 'heading'] as $key) {
                $text = trim(strip_tags((string) ($section[$key] ?? '')));

                if ($text !== '') {
                    $paragraphs[] = $text;
                }
            }
        }

        if ($paragraphs === []) {
            $description = trim((string) ($item->payload['description'] ?? $item->excerpt));

            if ($description !== '') {
                $paragraphs[] = $description;
            }
        }

        return [
            'heading' => $this->heading($item->title),
            'lead' => (string) $item->excerpt,
            'paragraphs' => array_slice($paragraphs, 0, 12),
            'links' => $links,
        ];
    }

    /**
     * A title without the brand suffix.
     *
     * The `<title>` should carry the brand ("… — WOODEX Pakistan"); the `<h1>` a reader sees should not repeat
     * it, or every page reads as a template.
     */
    private function heading(string $title): string
    {
        $parts = explode(' — ', $title, 2);

        return count($parts) === 2 && str_contains($parts[1], 'WOODEX') ? $parts[0] : $title;
    }

    /** @return array{title: string, description: string, canonical: string, image: string, type: string, schema: array<string, mixed>} */
    private function pageMeta(SitePage $page, string $base): array
    {
        $seo = (array) ($page->seo ?? []);
        $image = (string) ($seo['og_image'] ?? '');
        $url = $base.$page->url();

        return [
            'title' => $page->metaTitle(),
            'description' => $page->metaDescription(),
            'canonical' => (string) ($seo['canonical'] ?? $url),
            'image' => $image,
            'type' => 'website',
            'schema' => [
                '@context' => 'https://schema.org',
                '@type' => (string) ($seo['schema'] ?? 'WebPage'),
                'name' => $page->title,
                'url' => $url,
                'description' => $page->metaDescription(),
            ],
        ];
    }

    /** @return array{title: string, description: string, canonical: string, image: string, type: string, schema: array<string, mixed>} */
    private function itemMeta(ContentItem $item, string $base): array
    {
        $seo = (array) ($item->seo ?? []);
        $url = $base.'/'.ltrim((string) $item->path, '/');

        $type = match ((string) $item->type) {
            'post' => 'BlogPosting',
            'service' => 'Service',
            'project' => 'CreativeWork',
            'showroom' => 'FurnitureStore',
            'series' => 'CollectionPage',
            default => 'WebPage',
        };

        $schema = [
            '@context' => 'https://schema.org',
            '@type' => (string) ($seo['schema'] ?? $type),
            'name' => $item->title,
            'url' => $url,
            'description' => $item->metaDescription(),
        ];

        $payload = (array) ($item->payload ?? []);

        if (($payload['author'] ?? '') !== '') {
            $schema['author'] = ['@type' => 'Person', 'name' => (string) $payload['author']];
        }

        if (($payload['date'] ?? '') !== '') {
            $schema['datePublished'] = (string) $payload['date'];
        }

        if (($payload['city'] ?? '') !== '') {
            $schema['address'] = ['@type' => 'PostalAddress', 'addressLocality' => (string) $payload['city'], 'addressCountry' => 'PK'];
        }

        return [
            'title' => $item->metaTitle(),
            'description' => $item->metaDescription(),
            'canonical' => (string) ($seo['canonical'] ?? $url),
            'image' => (string) ($seo['og_image'] ?? ($payload['image'] ?? '')),
            'type' => $item->type === 'post' ? 'article' : 'website',
            'schema' => $schema,
        ];
    }
}
