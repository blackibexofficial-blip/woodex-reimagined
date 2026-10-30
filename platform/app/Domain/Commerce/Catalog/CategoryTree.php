<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Catalog;

/**
 * The category tree, assembled from flat rows.
 *
 * A shop's category tree looks trivially simple and is not. Four things go wrong in every
 * catalogue the moment someone can edit it:
 *
 *  1. **Ordering drifts.** `position` is edited on three rows and two of them now share a
 *     number, so the sidebar order depends on which the database happens to return first.
 *  2. **Orphans.** A parent is deleted and its children keep pointing at the id that no longer
 *     exists — they vanish from every list while still appearing in product filters.
 *  3. **Cycles.** A category is made its own grandparent, and rendering the tree loops forever.
 *  4. **Counts lie.** A root shows "0 products" because its stock lives in its children.
 *
 * All four are assembled here rather than in a Blade template, so they can be tested by
 * handing in arrays — no database, no HTTP, no browser.
 *
 * Ordering is total: `position`, then `id`. Two rows with the same position is a data problem,
 * not a reason for the sidebar to shuffle between requests.
 */
final readonly class CategoryTree
{
    /**
     * @param  array<int, array<string, mixed>>  $byId  category id => normalised row
     * @param  array<int, list<int>>  $childIds  parent id => ordered child ids
     * @param  list<int>  $rootIds
     * @param  list<string>  $problems  human-readable descriptions of anything malformed
     */
    private function __construct(
        private array $byId,
        private array $childIds,
        private array $rootIds,
        private array $problems,
    ) {}

    /**
     * @param  list<array<string, mixed>>  $rows
     *     Each row: id, parent_id, position, slug, name, is_active, show_in_menu,
     *     product_count (published products directly in this category)
     */
    public static function fromRows(array $rows): self
    {
        $byId = [];
        $problems = [];

        foreach ($rows as $row) {
            $id = (int) ($row['id'] ?? 0);

            if ($id <= 0) {
                $problems[] = 'A category row arrived without an id.';

                continue;
            }

            $byId[$id] = [
                'id' => $id,
                'parent_id' => isset($row['parent_id']) && $row['parent_id'] !== null ? (int) $row['parent_id'] : null,
                'position' => (int) ($row['position'] ?? 0),
                'slug' => (string) ($row['slug'] ?? ''),
                'name' => (string) ($row['name'] ?? ''),
                'is_active' => (bool) ($row['is_active'] ?? true),
                'show_in_menu' => (bool) ($row['show_in_menu'] ?? true),
                'product_count' => max(0, (int) ($row['product_count'] ?? 0)),
            ];
        }

        // An orphan is a child whose parent is not in the result set. It is promoted to a root
        // rather than hidden: a category that exists but cannot be reached is worse than one
        // sitting one level too high, because nobody will ever see the first one to fix it.
        foreach ($byId as $id => $row) {
            $parent = $row['parent_id'];

            if ($parent !== null && ! isset($byId[$parent])) {
                $byId[$id]['parent_id'] = null;
                $problems[] = "{$row['name']} pointed at a parent that no longer exists, so it is shown at the top level.";
            }
        }

        foreach (array_keys($byId) as $id) {
            if (self::isInCycle($byId, $id)) {
                $byId[$id]['parent_id'] = null;
                $problems[] = "{$byId[$id]['name']} was its own ancestor, so it is shown at the top level.";
            }
        }

        $childIds = [];

        foreach ($byId as $id => $row) {
            if ($row['parent_id'] !== null) {
                $childIds[$row['parent_id']][] = $id;
            }
        }

        foreach ($childIds as $parent => $ids) {
            usort($ids, static fn (int $a, int $b): int => self::compare($byId[$a], $byId[$b]));
            $childIds[$parent] = $ids;
        }

        $rootIds = array_keys(array_filter($byId, static fn (array $row): bool => $row['parent_id'] === null));
        usort($rootIds, static fn (int $a, int $b): int => self::compare($byId[$a], $byId[$b]));

        return new self($byId, $childIds, array_values($rootIds), array_unique($problems));
    }

    /** @param array<int, array<string, mixed>> $byId */
    private static function isInCycle(array $byId, int $start): bool
    {
        $seen = [];
        $current = $byId[$start]['parent_id'] ?? null;

        while ($current !== null) {
            if ($current === $start) {
                return true;
            }

            if (isset($seen[$current]) || ! isset($byId[$current])) {
                return false;
            }

            $seen[$current] = true;
            $current = $byId[$current]['parent_id'] ?? null;
        }

        return false;
    }

    /** Position first, id second, so the order is total and stable. */
    private static function compare(array $a, array $b): int
    {
        return [$a['position'], $a['id']] <=> [$b['position'], $b['id']];
    }

    /** @return list<int> */
    public function rootIds(): array
    {
        return $this->rootIds;
    }

    /** @return list<int> */
    public function childIds(int $parentId): array
    {
        return $this->childIds[$parentId] ?? [];
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        return $this->byId[$id] ?? null;
    }

    public function has(int $id): bool
    {
        return isset($this->byId[$id]);
    }

    /** @return list<string> */
    public function problems(): array
    {
        return $this->problems;
    }

    /**
     * Published products in this category, including its children.
     *
     * The roll-up is the point: "Office Tables: 0" above five populated sub-categories reads
     * as an empty section to everyone who sees it.
     */
    public function countFor(int $id, bool $includeChildren = true): int
    {
        $row = $this->byId[$id] ?? null;

        if ($row === null) {
            return 0;
        }

        $total = $row['product_count'];

        if ($includeChildren) {
            foreach ($this->childIds($id) as $childId) {
                $total += $this->countFor($childId, true);
            }
        }

        return $total;
    }

    /**
     * Every category beneath this one, breadth first.
     *
     * Used by the catalog filter: asking for "Office Tables" must return what is filed under
     * "Executive Tables", or the parent reads as an empty section on the storefront while its
     * children are full.
     *
     * @return list<int>
     */
    public function descendantIds(int $id): array
    {
        if (! $this->has($id)) {
            return [];
        }

        $out = [];
        $queue = $this->childIds($id);

        while ($queue !== []) {
            $current = array_shift($queue);

            if (in_array($current, $out, true)) {
                continue;   // a cycle was repaired above, but a guard here costs nothing
            }

            $out[] = $current;

            foreach ($this->childIds($current) as $child) {
                $queue[] = $child;
            }
        }

        return $out;
    }

    /** The category and everything under it, as one list of ids. */
    public function subtreeIds(int $id): array
    {
        return $this->has($id) ? array_merge([$id], $this->descendantIds($id)) : [];
    }

    /** @return array<string, int> slug => id */
    public function slugIndex(): array
    {
        $out = [];

        foreach ($this->byId as $row) {
            if ($row['slug'] !== '') {
                $out[$row['slug']] = $row['id'];
            }
        }

        return $out;
    }

    /**
     * Whether a row can move within its siblings.
     *
     * A single-item list has nothing to swap with, and a button that would do nothing is a
     * button that teaches the user the screen is broken.
     */
    public function canMoveUp(int $id): bool
    {
        $siblings = $this->siblingsOf($id);

        return $siblings !== [] && $siblings[0] !== $id;
    }

    public function canMoveDown(int $id): bool
    {
        $siblings = $this->siblingsOf($id);

        return $siblings !== [] && end($siblings) !== $id;
    }

    /**
     * The ids to swap, or null when the move is not possible.
     *
     * Returned rather than performed so the caller can do it in one transaction, and so the
     * rule can be tested without a database.
     *
     * @return array{0: int, 1: int}|null  [moving id, id it trades places with]
     */
    public function swapFor(int $id, string $direction): ?array
    {
        $siblings = $this->siblingsOf($id);
        $index = array_search($id, $siblings, true);

        if ($index === false) {
            return null;
        }

        $target = $direction === 'up' ? $index - 1 : $index + 1;

        if (! isset($siblings[$target])) {
            return null;
        }

        return [$id, $siblings[$target]];
    }

    /**
     * Siblings in display order. A root's siblings are the other roots.
     *
     * @return list<int>
     */
    private function siblingsOf(int $id): array
    {
        $row = $this->byId[$id] ?? null;

        if ($row === null) {
            return [];
        }

        return $row['parent_id'] === null ? $this->rootIds : $this->childIds($row['parent_id']);
    }

    /** How deep the deepest branch goes. Used to warn before a third level appears. */
    public function depth(): int
    {
        $deepest = 0;

        foreach (array_keys($this->byId) as $id) {
            $level = 1;
            $row = $this->byId[$id];

            while ($row['parent_id'] !== null && isset($this->byId[$row['parent_id']]) && $level < 20) {
                $level++;
                $row = $this->byId[$row['parent_id']];
            }

            $deepest = max($deepest, $level);
        }

        return $deepest;
    }

    /**
     * Categories hidden from the storefront menu but still reachable by URL.
     *
     * A different state from "inactive", and the difference matters: `is_active = false` means
     * the catalogue will not serve it, `show_in_menu = false` means it is a landing page you
     * link to directly.
     *
     * @return list<int>
     */
    public function hiddenFromMenu(): array
    {
        return array_values(array_keys(array_filter(
            $this->byId,
            static fn (array $row): bool => $row['show_in_menu'] === false && $row['is_active'] === true,
        )));
    }
}
