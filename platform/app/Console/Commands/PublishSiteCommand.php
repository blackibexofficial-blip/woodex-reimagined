<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Website\Content\Models\ContentItem;
use App\Domain\Website\Content\Models\SitePage;
use App\Domain\Website\Content\ShellPublisher;
use Illuminate\Console\Command;

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
                            {--skip-sitemap : Do not rewrite sitemap.xml}';

    protected $description = 'Write the static shell for every published page and record (title, meta, JSON-LD)';

    public function handle(ShellPublisher $publisher): int
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

        $written = 0;
        $failed = 0;
        $urls = [];

        foreach ($pages as $page) {
            $url = $page->url();

            try {
                if ($page->kind === SitePage::KIND_HTML && trim((string) $page->canvas_html) !== '') {
                    $publisher->write($url, (string) $page->canvas_html);
                } else {
                    $publisher->write($url, $publisher->render($this->pageMeta($page, $base)));
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

        $items = ContentItem::query()->published()->ordered()->get();

        foreach ($items as $item) {
            $path = '/'.ltrim((string) $item->path, '/');

            try {
                $publisher->write($path, $publisher->render($this->itemMeta($item, $base)));
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
