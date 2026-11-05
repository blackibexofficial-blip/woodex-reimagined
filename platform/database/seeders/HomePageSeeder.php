<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Website\Content\Models\SitePage;
use App\Domain\Website\Puck\Registry;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

/**
 * Builds the home page as blocks, from the content the legacy site actually served.
 *
 * The slide copy and order come from the IBPanel dump (`hero_slides_alt`), so the page the rebuild
 * ships is the page the business has been running, not a placeholder that happens to look similar.
 *
 * Every block is passed through Registry::normalizeProps before it is stored. That is what the admin
 * editor does on save, so seeding through the same door means the seeded page and a hand-built page
 * are the same shape — an unknown block type or a misnamed field fails here, in the seeder, rather
 * than rendering as a blank gap on the live site.
 */
class HomePageSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('seeders/data/legacy-home-blocks.json');

        if (! File::isFile($path)) {
            $this->command?->error("Missing seed data: {$path}");

            return;
        }

        /** @var array{blocks: list<array{type: string, props: array<string, mixed>}>} $data */
        $data = json_decode(File::get($path), true, flags: JSON_THROW_ON_ERROR);

        $registry = app(Registry::class);
        $content = [];

        foreach ($data['blocks'] as $block) {
            $type = (string) $block['type'];

            if (! $registry->has($type)) {
                $this->command?->error("Unknown block type '{$type}' in {$path} — skipped.");

                continue;
            }

            $content[] = [
                'type' => $type,
                'props' => $registry->normalizeProps($type, is_array($block['props'] ?? null) ? $block['props'] : []),
            ];
        }

        if ($content === []) {
            $this->command?->error('No valid blocks; home page left untouched.');

            return;
        }

        $page = SitePage::query()->firstOrNew(['key' => 'home']);

        $page->path = $page->path ?: '/';
        $page->title = $page->title ?: "WOODEX — Pakistan's Premium Office & Home Furniture Manufacturer";

        $page->kind = SitePage::KIND_PUCK;
        $page->status = SitePage::STATUS_PUBLISHED;
        $page->puck_data = [
            'root' => ['props' => new \stdClass()],
            'content' => $content,
        ];
        $page->save();

        $this->command?->info('Home page: '.count($content).' blocks seeded.');
    }
}
