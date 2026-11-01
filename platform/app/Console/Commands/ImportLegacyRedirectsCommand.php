<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Website\Content\LegacyRedirects;
use App\Domain\Website\Content\Models\ContentItem;
use App\Domain\Website\Content\Models\SitePage;
use App\Domain\Website\Models\Redirect;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Writes the 301s for the archived interior site, so the addresses Google has indexed still land somewhere.
 *
 *   php artisan website:import-redirects --dry-run     # print the plan, change nothing
 *   php artisan website:import-redirects               # add the rows that are missing
 *
 * Re-running is safe by construction: a row that exists is left alone, so a target the owner has since edited in
 * the admin is never overwritten and the hit counter is never reset. Nothing is deleted — an archived URL whose
 * redirect the owner removes stays removed, because this command is not a sync.
 */
final class ImportLegacyRedirectsCommand extends Command
{
    protected $signature = 'website:import-redirects
                            {--dry-run : Print what would be added, write nothing}';

    protected $description = 'Add the 301s that carry the archived interior site\'s URLs to the storefront';

    public function handle(): int
    {
        $archived = DB::table('pages')
            ->whereNotNull('archived_at')
            ->orderBy('type')
            ->orderBy('slug')
            ->get(['type', 'slug'])
            ->map(fn ($page): array => ['type' => (string) $page->type, 'slug' => (string) $page->slug])
            ->all();

        if ($archived === []) {
            $this->components->warn('No archived pages: run `website:archive-interior` first, or this site never had an interior.');

            return self::SUCCESS;
        }

        $plan = LegacyRedirects::plan($archived, $this->published());
        $dryRun = (bool) $this->option('dry-run');
        $added = 0;
        $kept = 0;

        foreach ($plan as $row) {
            $exists = Redirect::query()->where('from_path', $row['from'])->exists();

            if ($exists) {
                $kept++;

                continue;
            }

            if ($dryRun) {
                $this->line(sprintf('  would add  %-46s → %s', $row['from'], $row['to']));
                $added++;

                continue;
            }

            Redirect::query()->create([
                'from_path' => $row['from'],
                'to_path' => $row['to'],
                'code' => 301,
                'hits' => 0,
                'note' => $row['note'],
            ]);

            $added++;
        }

        $verb = $dryRun ? 'would add' : 'added';
        $this->components->info(sprintf(
            '%d archived URLs · %d %s · %d already redirected · %d still answered by a page',
            count($archived),
            $added,
            $verb,
            $kept,
            count($archived) - count($plan),
        ));

        return self::SUCCESS;
    }

    /**
     * Every address a page, a record or the storefront's own routing already answers.
     *
     * A redirect from one of these could never fire — the file is served before the app is asked — so the plan
     * leaves them out rather than filling the table with rows that do nothing.
     *
     * @return list<string>
     */
    private function published(): array
    {
        return [
            ...SitePage::query()->pluck('path')->all(),
            ...ContentItem::query()->pluck('path')->all(),
            '/shop', '/series', '/projects', '/services', '/blog',
        ];
    }
}
