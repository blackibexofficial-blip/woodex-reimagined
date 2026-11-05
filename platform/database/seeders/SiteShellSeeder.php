<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Domain\Commerce\Models\Category;
use App\Domain\Website\Models\NavigationItem;
use App\Settings\SiteShellSettings;
use Illuminate\Database\Seeder;
use ReflectionClass;
use ReflectionProperty;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

/**
 * Seeds the storefront shell from the IBPanel dump.
 *
 * The legacy theme kept its top bar, footer and footer links in three admin tables
 * (topbar_settings, footer_settings, footer_links) and its header menu in PHP. This seeder moves
 * all of it into the two places Woodex OS reads at render time: `settings` (group `shell`) for
 * values, `navigation_items` for menus.
 *
 * Idempotent: re-running updates rows in place and never duplicates a menu item. Safe to run after
 * a fresh catalog import, which is exactly when the header's mega panel gets its links.
 */
class SiteShellSeeder extends Seeder
{
    /** A mega column longer than this is a sign the menu needs a landing page, not more links. */
    private const int MAX_CHILDREN = 12;

    public function run(): void
    {
        $path = database_path('seeders/data/legacy-site-shell.json');

        if (! File::isFile($path)) {
            $this->command?->error("Missing seed data: {$path}");

            return;
        }

        /** @var array{topbar: array, footer: array, header: list<array>, footer_links: list<array>} $data */
        $data = json_decode(File::get($path), true, flags: JSON_THROW_ON_ERROR);

        $this->seedSettings($data['topbar'], $data['footer']);
        $this->seedHeader($data['header']);
        $this->seedFooterLinks($data['footer_links']);
    }

    /**
     * Writes the `shell` settings group.
     *
     * Deliberately through the repository's own table rather than `SiteShellSettings::save()`. Spatie
     * resolves settings classes from config (`config/settings.php`), and this project does not publish
     * that file — so a settings class has no registered defaults, and its `save()` throws
     * MissingSettings for every property the repository has not seen yet. That is fine for classes
     * that only ever exist in the database; it makes a seeder impossible.
     *
     * Writing the rows here — one per property, value JSON-encoded the way the repository expects —
     * has the useful side effect of being complete by construction: every property the class declares
     * gets a row, so no read can ever be missing.
     *
     * @param  array<string, mixed>  $topbar
     * @param  array<string, mixed>  $footer
     */
    private function seedSettings(array $topbar, array $footer): void
    {
        $values = [
            'topbar_is_active' => (bool) ($topbar['is_active'] ?? false),
            'topbar_text' => (string) ($topbar['text'] ?? ''),
            'topbar_url' => (string) ($topbar['url'] ?? '/shop'),
        ];

        foreach ($footer as $key => $value) {
            $values[$key] = $value;
        }

        // Class defaults first, so a property the JSON never mentions still lands with a sane value.
        $defaults = (new ReflectionClass(SiteShellSettings::class))->getDefaultProperties();

        foreach ($defaults as $key => $default) {
            if ((new ReflectionProperty(SiteShellSettings::class, $key))->isStatic()) {
                continue;
            }

            $values[$key] ??= $default;
        }

        foreach ($values as $key => $value) {
            DB::table('settings')->updateOrInsert(
                ['group' => SiteShellSettings::group(), 'name' => $key],
                [
                    'payload' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
                    'locked' => false,
                    'updated_at' => now(),
                    'created_at' => now(),
                ],
            );
        }
    }

    /** @param list<array<string, mixed>> $items */
    private function seedHeader(array $items): void
    {
        $tree = [];

        foreach ($items as $item) {
            $children = $item['children'] ?? [];

            if (($item['children_from'] ?? null) === 'categories') {
                $children = $this->categoryTree();
                unset($item['children_from']);
            }

            $tree[] = [
                'label' => (string) $item['label'],
                'url' => (string) ($item['url'] ?? '#'),
                'is_mega' => (bool) ($item['is_mega'] ?? false),
                'children' => $children,
            ];
        }

        $this->sync(NavigationItem::HEADER, $tree, null);
    }

    /**
     * The mega panel's columns, straight from the catalog: one column per root category, one link per
     * category underneath it that actually holds products.
     *
     * Two things make this less obvious than "list the children":
     *
     *   * Depth. The catalog is three levels deep (Office Furniture → Office Tables → Manager Table)
     *     and the products sit at the bottom. Listing only the middle level would build a Shop menu
     *     whose every link leads to an empty page, so a column collects the *product-bearing
     *     descendants* of its root, at whatever depth they live.
     *   * Duplicates. The legacy catalog carries near-identical pairs (Executive Tables / Executive
     *     Table, Manager Tables / Manager Table) where only one of the two was ever populated, and the
     *     populated one often had `show_in_menu = 0`. Deciding by product count rather than the flag
     *     keeps the real category and drops the empty twin, without a hard-coded list of exceptions.
     *
     * @return list<array<string, mixed>>
     */
    private function categoryTree(): array
    {
        /** @var list<Category> $all */
        $all = Category::query()
            ->where('is_active', true)
            ->with('translation')
            ->withCount('products')
            ->orderBy('position')
            ->orderBy('id')
            ->get()
            ->all();

        $byParent = [];

        foreach ($all as $category) {
            $byParent[$category->parent_id ?? 0][] = $category;
        }

        $columns = [];

        foreach ($byParent[0] ?? [] as $root) {
            if (! $root->show_in_menu) {
                continue;
            }

            /** @var list<array{label: string, url: string, count: int}> $found */
            $found = [];

            $walk = static function (Category $node) use (&$walk, &$found, $byParent): void {
                foreach ($byParent[$node->id] ?? [] as $child) {
                    $count = (int) ($child->products_count ?? 0);

                    if ($count > 0) {
                        $found[] = [
                            'label' => $child->displayName(),
                            'url' => '/shop?category='.$child->slug,
                            'count' => $count,
                        ];
                    }

                    $walk($child);
                }
            };

            $walk($root);

            $columns[] = [
                'label' => $root->displayName(),
                'url' => '/shop?category='.$root->slug,
                'children' => array_slice($this->dedupe($found), 0, self::MAX_CHILDREN),
            ];
        }

        return $columns;
    }

    /** @param list<array<string, mixed>> $links */
    private function seedFooterLinks(array $links): void
    {
        $position = [];

        foreach ($links as $link) {
            $section = 'footer:'.(string) $link['section'];
            $position[$section] = ($position[$section] ?? 0) + 1;

            NavigationItem::query()->updateOrCreate(
                ['menu' => $section, 'parent_id' => null, 'label' => (string) $link['label']],
                [
                    'url' => (string) $link['url'],
                    'position' => (int) ($link['position'] ?? $position[$section]),
                    'target' => str_starts_with((string) $link['url'], 'http') ? '_blank' : '_self',
                    'is_mega' => false,
                ],
            );
        }
    }

    /**
     * Collapses the catalog's singular/plural twin categories into one link each.
     *
     * The legacy admin let the same shelf be created twice — "Executive Tables" and "Executive
     * Table", "Manager Table" and "Manager Tables" — and split the products across the pair. Both
     * are real rows with real products, so neither can simply be filtered out; but a menu that lists
     * the same thing twice reads as a broken site. The twin holding more products keeps the link,
     * and equal counts keep the first, so the result is stable across runs.
     *
     * This is a menu-level fix, not a catalog fix: the duplicate categories still need merging at the
     * source, which is logged in the Phase 1 open items.
     *
     * @param  list<array{label: string, url: string, count: int}>  $candidates
     * @return list<array{label: string, url: string}>
     */
    private function dedupe(array $candidates): array
    {
        $byKey = [];

        foreach ($candidates as $candidate) {
            $key = mb_strtolower(rtrim($candidate['label'], 'sS'));

            if (! isset($byKey[$key]) || $candidate['count'] > $byKey[$key]['count']) {
                $byKey[$key] = $candidate;
            }
        }

        return array_values(array_map(
            static fn (array $c): array => ['label' => $c['label'], 'url' => $c['url']],
            $byKey,
        ));
    }

    /**
     * Upserts a menu tree in place, keyed on (menu, parent, label), then removes rows under the same
     * parent that the seed no longer contains.
     *
     * The prune is what makes re-running safe rather than merely harmless. Upserting alone leaves
     * whatever the previous run (or a previous catalog) put there, so a link that stopped existing
     * keeps its place in the header forever — which is exactly how the legacy menu rotted. Re-running
     * this seeder therefore restores the menu to its seeded state: menus are edited in the admin,
     * the seeder is setup.
     *
     * @param list<array<string, mixed>> $items
     */
    private function sync(string $menu, array $items, ?int $parentId): void
    {
        $position = 0;
        $labels = [];

        foreach ($items as $item) {
            $labels[] = (string) $item['label'];
            $node = NavigationItem::query()->updateOrCreate(
                ['menu' => $menu, 'parent_id' => $parentId, 'label' => (string) $item['label']],
                [
                    'url' => (string) ($item['url'] ?? '#'),
                    'position' => $position++,
                    'target' => '_self',
                    'is_mega' => (bool) ($item['is_mega'] ?? false),
                ],
            );

            $children = $item['children'] ?? [];

            if ($children !== []) {
                $this->sync($menu, $children, $node->id);
            } else {
                // A node that lost its children keeps none of them.
                NavigationItem::query()
                    ->where('menu', $menu)
                    ->where('parent_id', $node->id)
                    ->delete();
            }
        }

        NavigationItem::query()
            ->where('menu', $menu)
            ->where('parent_id', $parentId)
            ->whereNotIn('label', $labels)
            ->delete();
    }
}
