<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Website\Content\Models\ContentItem;
use App\Domain\Website\Content\Models\SitePage;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

/**
 * Fills the reimagined site's tables from the copy the SPA was hardcoding (docs/08 §8).
 *
 * The storefront was built with its words in TypeScript: 7 services, 6 blog posts, 7 projects, 5 showrooms,
 * 5 series. That copy is real and approved, so it seeds the CMS rather than being retyped. The JSON here was
 * extracted from `src/data/*.ts` and `pages/Projects.tsx` / `pages/Showrooms.tsx`.
 *
 * Safe to re-run: a page or record that already exists is left alone, so seeding can never overwrite an
 * edit somebody made in the admin.
 *
 *   php artisan db:seed --class=SiteContentSeeder --force
 */
final class SiteContentSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('seeders/data/site-content.json');

        if (! File::exists($path)) {
            $this->command?->warn('No site-content.json — nothing to seed.');

            return;
        }

        /** @var array{pages?: array<int, array<string, mixed>>, content?: array<int, array<string, mixed>>} $data */
        $data = (array) json_decode((string) File::get($path), true);

        $pages = 0;
        $records = 0;

        foreach ((array) ($data['pages'] ?? []) as $page) {
            $created = SitePage::query()->firstOrCreate(
                ['key' => (string) $page['key']],
                [
                    'path' => (string) $page['path'],
                    'title' => (string) $page['title'],
                    'kind' => (string) ($page['kind'] ?? SitePage::KIND_ROUTE),
                    'status' => (string) ($page['status'] ?? SitePage::STATUS_PUBLISHED),
                    'seo' => (array) ($page['seo'] ?? []),
                    'sort' => (int) ($page['sort'] ?? 0),
                    'published_at' => now(),
                ],
            );

            $pages += $created->wasRecentlyCreated ? 1 : 0;
        }

        foreach ((array) ($data['content'] ?? []) as $item) {
            $created = ContentItem::query()->firstOrCreate(
                ['type' => (string) $item['type'], 'slug' => (string) $item['slug']],
                [
                    'path' => (string) $item['path'],
                    'title' => (string) $item['title'],
                    'excerpt' => mb_substr((string) ($item['excerpt'] ?? ''), 0, 500),
                    'sections' => (array) ($item['sections'] ?? []),
                    'payload' => (array) ($item['payload'] ?? []),
                    'seo' => (array) ($item['seo'] ?? []),
                    'status' => (string) ($item['status'] ?? ContentItem::STATUS_PUBLISHED),
                    'sort' => (int) ($item['sort'] ?? 0),
                    'published_at' => now(),
                ],
            );

            $records += $created->wasRecentlyCreated ? 1 : 0;
        }

        $this->command?->info(sprintf(
            'Site content: %d page(s) and %d record(s) created; existing rows left untouched.',
            $pages,
            $records,
        ));
    }
}
