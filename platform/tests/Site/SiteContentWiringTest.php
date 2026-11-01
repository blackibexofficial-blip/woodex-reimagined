<?php

declare(strict_types=1);

namespace Tests\Site;

use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The seed the reimagined site is built from, and the wiring that serves it.
 *
 * The storefront was written with its words in TypeScript: a service's slug lived in one file and its URL in
 * another, so nothing could agree by construction. This holds the replacement to three rules:
 *
 *   1. every record has a path, a title, a status and a unique (type, slug);
 *   2. the 16 URLs the storefront actually routes are all present — a missing one means a page that the
 *      CMS cannot publish;
 *   3. the API, the routes and the publisher are wired to each other, not merely written.
 *
 * The behaviour of the endpoints themselves was proved against the running application (`/api/site/v1/…`,
 * 200 with the expected payloads); a source test cannot do that, and does not pretend to.
 */
final class SiteContentWiringTest extends TestCase
{
    /** @return array{pages: array<int, array<string, mixed>>, content: array<int, array<string, mixed>>} */
    private function seed(): array
    {
        $path = self::sitePath('database/seeders/data/site-content.json');

        Assert::true($path !== null, 'the seed file must exist');

        $data = (array) json_decode((string) file_get_contents((string) $path), true);

        return ['pages' => (array) ($data['pages'] ?? []), 'content' => (array) ($data['content'] ?? [])];
    }

    public function testEveryStorefrontUrlIsInTheSeed(): void
    {
        $pages = array_column($this->seed()['pages'], 'path');

        $expected = [
            '/', '/shop', '/series', '/projects', '/services', '/blog', '/about', '/contact',
            '/custom-design', '/showrooms', '/materials', '/warranty', '/b2b', '/quotation',
            '/room-packages', '/virtual-showroom',
        ];

        foreach ($expected as $path) {
            Assert::true(in_array($path, $pages, true), 'missing page for '.$path);
        }

        Assert::same(16, count($pages), 'the storefront routes 16 content URLs');
        Assert::same(count($pages), count(array_unique($pages)), 'two pages cannot share a URL');
    }

    public function testEveryPageCarriesTheFieldsTheApiPromises(): void
    {
        foreach ($this->seed()['pages'] as $page) {
            foreach (['key', 'path', 'title', 'kind', 'status', 'seo'] as $field) {
                Assert::true(array_key_exists($field, $page), 'page '.($page['path'] ?? '?').' has no '.$field);
            }

            Assert::true(str_starts_with((string) $page['path'], '/'), 'a path starts with a slash');
            Assert::true(trim((string) $page['title']) !== '', 'a page has a title');
            Assert::true(trim((string) ($page['seo']['description'] ?? '')) !== '', 'page '.$page['path'].' has no description');
        }
    }

    public function testRecordsAreUniqueByTypeAndSlug(): void
    {
        $seen = [];

        foreach ($this->seed()['content'] as $item) {
            $key = $item['type'].'/'.$item['slug'];

            Assert::true(! isset($seen[$key]), 'duplicate record '.$key);
            $seen[$key] = true;

            Assert::true(in_array($item['type'], ['service', 'post', 'project', 'showroom', 'series'], true), 'unknown type '.$item['type']);
            Assert::true(str_starts_with((string) $item['path'], '/'), 'record '.$key.' has no path');
            Assert::true(trim((string) $item['title']) !== '', 'record '.$key.' has no title');
            Assert::true(is_array($item['sections'] ?? null), 'record '.$key.' has no body');
        }

        Assert::same(30, count($seen), '16 pages and 30 records seed the site');
    }

    public function testTheRecordCountsMatchWhatTheStorefrontHardcoded(): void
    {
        $byType = array_count_values(array_column($this->seed()['content'], 'type'));

        Assert::same(7, $byType['service'] ?? 0, 'services');
        Assert::same(6, $byType['post'] ?? 0, 'blog posts');
        Assert::same(7, $byType['project'] ?? 0, 'projects');
        Assert::same(5, $byType['showroom'] ?? 0, 'showrooms');
        Assert::same(5, $byType['series'] ?? 0, 'series');
    }

    public function testTheApiRoutesAreRegisteredAndMounted(): void
    {
        $routes = self::sitePath('routes/site.php');
        $api = self::sitePath('routes/api.php');

        Assert::true($routes !== null && $api !== null, 'both route files must exist');

        $routeSource = (string) file_get_contents((string) $routes);

        foreach (['/pages', '/pages/{key}', '/content/{type}', '/content/{type}/{slug}', '/theme'] as $uri) {
            Assert::true(str_contains($routeSource, $uri), 'route '.$uri.' is not registered');
        }

        Assert::true(
            str_contains((string) file_get_contents((string) $api), "Route::prefix('site/v1')"),
            'api.php must mount the site routes under site/v1',
        );
    }

    public function testTheControllerAnswersEveryRoute(): void
    {
        $path = self::sitePath('app/Http/Controllers/Api/Site/SiteController.php');

        Assert::true($path !== null, 'the controller must exist');

        $source = (string) file_get_contents((string) $path);

        foreach (['pages', 'page', 'content', 'contentItem', 'theme'] as $method) {
            Assert::true(str_contains($source, 'public function '.$method.'('), 'no '.$method.'() on the controller');
        }
    }

    public function testThePublisherWritesWhereTheWebServerLooks(): void
    {
        $path = self::sitePath('app/Domain/Website/Content/ShellPublisher.php');

        Assert::true($path !== null, 'the publisher must exist');

        $source = (string) file_get_contents((string) $path);

        // A shell must be per directory, because that is the file Apache answers for a path.
        Assert::true(str_contains($source, "'/index.html'"), 'the home page must be written to the web root');
        Assert::true(str_contains($source, '/index.html'), 'every other page must be written to its own directory');
        Assert::true(str_contains($source, 'sitemap.xml'), 'publishing must be able to write the sitemap');
    }

    public function testEveryCardCarriesItsPayload(): void
    {
        // The SPA reads a card's payload straight into its components (author, date, phone), so a card
        // without one turns the blog list into six rows with no byline.
        $api = self::sitePath('app/Domain/Website/Content/ContentApi.php');

        Assert::true($api !== null, 'the content api must exist');
        Assert::true(
            substr_count((string) file_get_contents((string) $api), "'payload' =>") >= 2,
            'both the card and the detail must carry the payload',
        );
    }

    public function testTheArchiveCommandNeverDeletesAnything(): void
    {
        $path = self::sitePath('app/Console/Commands/ArchiveInteriorCommand.php');

        Assert::true($path !== null, 'the archive command must exist');

        $source = (string) file_get_contents((string) $path);

        Assert::true(str_contains($source, 'archived_at'), 'archiving is a stamp, not a delete');
        Assert::true(! str_contains($source, '->delete()'), 'the archive command must never delete a page');
        Assert::true(str_contains($source, 'storage_path'), 'the export must be written to storage');
    }
}
