<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/**
 * Closes the old interior website without destroying it (docs/08 INTEGRATION-MASTER-PLAN, §2 option A, §8).
 *
 * The `pages` table still holds the 142 pages of the interior site this OS was built for: 59 service pages,
 * 48 insights, 12 city and 8 area landing pages, 6 project studies. Their HTML files were deleted when the
 * furniture storefront took over `/`, so nothing can render them — but the copy, the meta and the 1,442
 * blocks are still worth keeping.
 *
 * This exports every one of them to a single JSON file and stamps `archived_at`. Nothing is deleted:
 *
 *   php artisan website:archive-interior            # export and archive
 *   php artisan website:archive-interior --dry-run  # say what would be archived, change nothing
 *
 * Re-running is safe — already-archived rows are skipped unless `--force` is given.
 */
final class ArchiveInteriorCommand extends Command
{
    protected $signature = 'website:archive-interior
                            {--dry-run : Report what would be exported, write nothing}
                            {--force : Re-export pages that are already archived}';

    protected $description = 'Export the old interior website (pages + blocks) to storage and mark it archived';

    public function handle(): int
    {
        if (! DB::getSchemaBuilder()->hasTable('pages')) {
            $this->components->error('No `pages` table — this does not look like a Woodex OS database.');

            return self::FAILURE;
        }

        $query = DB::table('pages')->orderBy('id');

        if (! $this->option('force')) {
            $query->whereNull('archived_at');
        }

        $pages = $query->get();

        if ($pages->isEmpty()) {
            $this->components->info('Nothing to archive — every page is already stamped.');

            return self::SUCCESS;
        }

        $blocks = DB::table('page_blocks')
            ->whereIn('page_id', $pages->pluck('id')->all())
            ->get()
            ->groupBy('page_id');

        $records = [];

        foreach ($pages as $page) {
            $row = (array) $page;
            $row['blocks'] = $blocks->get($page->id, collect())
                ->map(static fn (object $block): array => (array) $block)
                ->values()
                ->all();

            $records[] = $row;
        }

        $document = [
            'site' => 'WOODEX Interior (v1)',
            'reason' => 'Replaced by the WOODEX Furniture storefront at the root of the site.',
            'exported_at' => now()->toIso8601String(),
            'pages' => count($records),
            'blocks' => array_sum(array_map(static fn (array $r): int => count($r['blocks']), $records)),
            'records' => $records,
        ];

        $json = json_encode($document, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        if ($json === false) {
            $this->components->error('Could not encode the export: '.json_last_error_msg());

            return self::FAILURE;
        }

        $this->components->twoColumnDetail('Pages found', (string) count($records));
        $this->components->twoColumnDetail('Blocks attached', (string) $document['blocks']);
        $this->components->twoColumnDetail('Export size', number_format(strlen($json) / 1024, 1).' KB');

        if ($this->option('dry-run')) {
            $this->components->warn('Dry run — nothing was written and no page was stamped.');

            return self::SUCCESS;
        }

        $directory = storage_path('app/private/archive');
        File::ensureDirectoryExists($directory);

        $path = $directory.'/interior-pages-'.now()->format('Y-m-d-His').'.json';
        File::put($path, $json);

        DB::table('pages')
            ->whereIn('id', $pages->pluck('id')->all())
            ->update(['archived_at' => now(), 'updated_at' => now()]);

        $this->components->twoColumnDetail('Exported to', $path);
        $this->components->twoColumnDetail('Stamped archived', (string) count($records));

        $this->newLine();
        $this->components->info('The interior site is archived. Nothing was deleted — every row is still readable, and the file above holds the whole export.');

        return self::SUCCESS;
    }
}
