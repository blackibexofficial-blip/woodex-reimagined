<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Commerce\Api\CatalogService;
use App\Domain\Commerce\Models\Product;
use App\Domain\Website\Content\Models\ContentItem;
use App\Domain\Website\Content\RedirectPublisher;
use App\Domain\Website\Content\Models\SitePage;
use App\Domain\Website\Content\ShellPublisher;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

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

        // Twenty product pages, which had no file at all: `/shop/ballmer-executive-desk` was answered by the
        // SPA fallback — 200, the shop's shell, and no price, no availability and no Product schema anywhere a
        // crawler could read them. A product is a page the site sells, so publishing writes it like any other.
        $catalog = app(CatalogService::class);

        // With their translation, because a sibling link labelled `ballmer-executive-desk` is a slug pretending
        // to be a name; `displayName()` falls back to the SKU when there is no translation.
        $products = Product::query()
            ->published()
            ->with('translation')
            ->orderBy('position')
            ->get();

        foreach ($products as $product) {
            $url = '/shop/'.ltrim((string) $product->slug, '/');
            $detail = $catalog->findDetail((string) $product->slug);

            if ($detail === null) {
                $failed++;
                $this->components->twoColumnDetail($url, '<fg=red>the catalogue returned no product</>');

                continue;
            }

            try {
                $publisher->write($url, $publisher->render(
                    $this->productMeta($detail, $base),
                    $this->productFallback($detail, $products, $nav),
                ));
                $written++;
                $urls[] = [
                    'loc' => $base.$url,
                    'lastmod' => $product->updated_at?->toDateString(),
                    'priority' => '0.7',
                ];
            } catch (\Throwable $e) {
                $failed++;
                $this->components->twoColumnDetail($url, '<fg=red>'.$e->getMessage().'</>');
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
        $this->components->twoColumnDetail('Products', (string) $products->count());
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
            // An empty string is not a canonical. Rows written by an older screen carry `''` here, and trusting
            // it writes a page with no <link rel="canonical"> at all — which is how two records lost theirs.
            'canonical' => trim((string) ($seo['canonical'] ?? '')) !== '' ? (string) $seo['canonical'] : $url,
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
            'canonical' => trim((string) ($seo['canonical'] ?? '')) !== '' ? (string) $seo['canonical'] : $url,
            'image' => (string) ($seo['og_image'] ?? ($payload['image'] ?? '')),
            'type' => $item->type === 'post' ? 'article' : 'website',
            'schema' => $schema,
        ];
    }

    /**
     * A product's head: its own title, its price and availability, and `Product` schema with an `Offer`.
     *
     * `Product` is the one schema Google reads for a shopping result, and the three fields that decide whether a
     * product page can earn one are `name`, `offers.price` and `offers.availability`. The price is stored in
     * minor units (PKR paisa) because money is never a float; schema.org wants a decimal string, so it is divided
     * exactly once, here, and formatted with a dot whatever the server's locale is.
     *
     * @param  array<string, mixed>  $product  a `CatalogService::findDetail()` payload
     * @return array{title: string, description: string, canonical: string, image: string, type: string, schema: array<string, mixed>}
     */
    private function productMeta(array $product, string $base): array
    {
        $name = trim((string) ($product['name'] ?? ''));
        $url = $base.(string) ($product['url'] ?? '');
        $image = (string) ($product['image'] ?? '');
        $summary = trim((string) ($product['summary'] ?? ''));
        $category = trim((string) ($product['category'] ?? ''));
        $reviews = (int) ($product['review_count'] ?? 0);

        $schema = [
            '@context' => 'https://schema.org',
            '@type' => 'Product',
            'name' => $name,
            'url' => $url,
            'sku' => (string) ($product['sku'] ?? ''),
            'description' => $summary,
            'brand' => ['@type' => 'Brand', 'name' => 'WOODEX'],
            'offers' => [
                '@type' => 'Offer',
                'price' => number_format(((int) ($product['price_minor'] ?? 0)) / 100, 2, '.', ''),
                'priceCurrency' => 'PKR',
                'availability' => ($product['in_stock'] ?? false)
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                'url' => $url,
            ],
        ];

        if ($image !== '') {
            $schema['image'] = $base.$image;
        }

        // Only when there are reviews: a 5.0 with no reviews behind it is a rich result Google penalises.
        if ($reviews > 0) {
            $schema['aggregateRating'] = [
                '@type' => 'AggregateRating',
                'ratingValue' => (string) ($product['rating'] ?? ''),
                'reviewCount' => $reviews,
            ];
        }

        return [
            'title' => $name.($category !== '' ? ' — '.$category : '').' | WOODEX',
            'description' => Str::limit($summary !== '' ? $summary : $name, 155),
            'canonical' => $url,
            'image' => $image === '' ? '' : $base.$image,
            'type' => 'product',
            'schema' => $schema,
        ];
    }

    /**
     * A product's fallback document: the name, the price, the facts, and a way back to the shop.
     *
     * The facts matter more here than elsewhere: this is what a crawler and a reader without JavaScript receive
     * for a page whose real content is a React gallery. Price and availability are the two things a person came
     * for, so they lead; the specification table follows as sentences.
     *
     * @param  array<string, mixed>  $product
     * @param  Collection<int, Product>  $products
     * @param  list<array{label: string, href: string}>  $nav
     * @return array{heading: string, lead: string, paragraphs: list<string>, links: list<array{label: string, href: string}>}
     */
    private function productFallback(array $product, Collection $products, array $nav): array
    {
        $price = ((int) ($product['price_minor'] ?? 0)) / 100;
        $was = ((int) ($product['compare_at_minor'] ?? 0)) / 100;

        $paragraphs = [];

        $money = 'Rs '.number_format($price, 0);

        $paragraphs[] = $was > $price
            ? $money.' (was Rs '.number_format($was, 0).', save Rs '.number_format($was - $price, 0).').'
            : $money.'.';

        $paragraphs[] = ($product['in_stock'] ?? false)
            ? 'In stock — '.((int) ($product['available_qty'] ?? 0)).' available.'
            : 'Out of stock.';

        foreach ((array) ($product['specifications'] ?? []) as $spec) {
            $label = trim((string) ($spec['label'] ?? ''));
            $value = trim((string) ($spec['value'] ?? ''));

            if ($label !== '' && $value !== '') {
                $paragraphs[] = $label.': '.$value.'.';
            }
        }

        // One sentence, not one per colour: three lines reading "Also available in …" is a list rendered as prose.
        $colours = array_values(array_filter(array_map(
            static fn (array $colour): string => trim((string) ($colour['name'] ?? '')),
            (array) ($product['colors'] ?? []),
        )));

        if ($colours !== []) {
            $last = count($colours) > 1 ? ' and '.array_pop($colours) : '';

            $paragraphs[] = 'Also available in '.implode(', ', $colours).$last.'.';
        }

        // The specification table often already says this; a second sentence repeating it reads like a bug.
        $warrantyInSpecs = false;

        foreach ((array) ($product['specifications'] ?? []) as $spec) {
            $warrantyInSpecs = $warrantyInSpecs || str_contains(strtolower((string) ($spec['label'] ?? '')), 'warranty');
        }

        if (! $warrantyInSpecs && (int) ($product['warranty_months'] ?? 0) > 0) {
            $paragraphs[] = (int) $product['warranty_months'].'-month warranty.';
        }

        if ((int) ($product['lead_time_days'] ?? 0) > 0) {
            $paragraphs[] = 'Delivered in about '.(int) $product['lead_time_days'].' days.';
        }

        $siblings = $products
            ->where('slug', '!=', $product['slug'])
            ->take(8)
            ->map(fn (Product $sibling): array => [
                'label' => $sibling->displayName(),
                'href' => '/shop/'.ltrim((string) $sibling->slug, '/'),
            ])
            ->values()
            ->all();

        return [
            'heading' => (string) ($product['name'] ?? ''),
            'lead' => trim((string) ($product['summary'] ?? '')),
            'paragraphs' => array_slice($paragraphs, 0, 12),
            'links' => array_merge([['label' => 'All office furniture', 'href' => '/shop']], $siblings, $nav),
        ];
    }
}
