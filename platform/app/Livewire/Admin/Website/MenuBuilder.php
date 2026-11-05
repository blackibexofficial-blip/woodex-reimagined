<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Website;

use App\Domain\Website\Models\NavigationItem;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

/**
 * The menu builder: header and footer links as an editable tree.
 *
 * Until now the shell's menus existed only in `navigation_items`, written by SiteShellSeeder. That
 * made them "data-driven" in name only — changing a footer link meant running a seeder, which is a
 * developer's tool. This screen is the owner's.
 *
 * Editing rules, chosen deliberately:
 *
 *   * Structure (add, delete, reorder, indent) is written immediately. It is a click, the click has
 *     one meaning, and batching it behind a Save button would leave the tree and the database
 *     disagreeing whenever someone closed the tab.
 *   * Text (label, URL, target) is batched behind Save. Typing produces a round trip per keystroke
 *     otherwise, and a half-typed URL should not be what the live header reads.
 *
 * Depth is capped at three, which is not arbitrary: the storefront shell renders a top-level link,
 * a column heading, and the links inside that column. A fourth level would be stored, saved, and
 * silently never drawn.
 */
#[Layout('layouts::admin')]
#[Title('Menus')]
final class MenuBuilder extends Component
{
    use InteractsWithAdmin;

    public const int MAX_DEPTH = 3;

    /** @var array<string, string> menu key => label shown in the picker */
    public const array MENUS = [
        NavigationItem::HEADER => 'Header',
        'footer:shop' => 'Footer · Shop',
        'footer:quick_links' => 'Footer · Quick links',
        'footer:learn_more' => 'Footer · Learn more',
    ];

    public string $menu = NavigationItem::HEADER;

    /**
     * A flat, depth-first list of the current menu's items.
     *
     * @var list<array{id: int, label: string, url: string, target: string, is_mega: bool, parent_id: int|null, position: int, depth: int}>
     */
    public array $items = [];

    public ?int $selected = null;

    /** True when a text field has changed and Save has not run yet. */
    public bool $dirty = false;

    public function mount(?string $menu = null): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        if (is_string($menu) && array_key_exists($menu, self::MENUS)) {
            $this->menu = $menu;
        }

        $this->load();
    }

    public function selectMenu(string $menu): void
    {
        if (! array_key_exists($menu, self::MENUS)) {
            return;
        }

        $this->menu = $menu;
        $this->selected = null;
        $this->dirty = false;
        $this->load();
    }

    public function select(int $id): void
    {
        if ($this->find($id) !== null) {
            $this->selected = $id;
        }
    }

    /**
     * Add a link under a parent, or at the end of the top level.
     *
     * Created empty rather than with placeholder text: "New link" on a live header is a broken link
     * that someone forgets to fix. An empty label is obvious in the admin, and the row is not saved
     * into the header until it has one — see `save()`, which drops untitled items.
     */
    public function addItem(?int $parentId = null): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $parent = $parentId === null ? null : NavigationItem::query()->find($parentId);

        if ($parentId !== null && $parent === null) {
            return;
        }

        if ($parent !== null) {
            $depth = $this->depthOf($parent);
            $parentDepth = $depth + 1;

            if ($parentDepth >= self::MAX_DEPTH) {
                $this->toast('That is already the deepest level the header can show.', 'error');

                return;
            }
        }

        $position = NavigationItem::query()
            ->where('menu', $this->menu)
            ->where('parent_id', $parentId)
            ->max('position');

        $item = NavigationItem::query()->create([
            'menu' => $this->menu,
            'label' => '',
            'url' => '',
            'parent_id' => $parentId,
            'position' => (int) $position + 1,
            'target' => '_self',
            'is_mega' => false,
        ]);

        $this->selected = $item->id;
        $this->load();
    }

    /**
     * Delete an item and everything under it.
     *
     * The foreign key cascades, so children go with the parent — which is what a person expects when
     * they delete a column heading, and surprising only if it happens silently. The count is reported.
     */
    public function deleteItem(int $id): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $item = NavigationItem::query()->find($id);

        if ($item === null) {
            return;
        }

        $descendants = $this->descendantsOf($id);

        $item->delete(); // the self-referencing FK cascades

        if ($this->selected === $id || in_array($this->selected, $descendants, true)) {
            $this->selected = null;
        }

        $this->load();

        $removed = count($descendants);
        $this->toast($removed > 0
            ? "Link deleted, along with {$removed} beneath it."
            : 'Link deleted.');
    }

    /** Swap with the sibling above, within the same parent. */
    public function moveUp(int $id): void
    {
        $this->swapWithSibling($id, -1);
    }

    public function moveDown(int $id): void
    {
        $this->swapWithSibling($id, 1);
    }

    /**
     * Nest an item under the sibling above it.
     *
     * Only the item moves — its children come with it, which is why the depth check verifies the
     * whole subtree fits rather than just the item itself. Indenting a column with three links into
     * the last level would push those links to a fourth level nobody renders.
     */
    public function indent(int $id): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $item = NavigationItem::query()->find($id);

        if ($item === null) {
            return;
        }

        $siblings = $this->siblingsOf($item);
        $index = $siblings->search(fn (NavigationItem $row): bool => $row->id === $item->id);

        if ($index === false || $index === 0) {
            $this->toast('Nothing above it to nest under.', 'error');

            return;
        }

        /** @var NavigationItem $newParent */
        $newParent = $siblings[$index - 1];

        $newDepth = $this->depthOf($newParent) + 1 + $this->subtreeHeight($item);

        if ($newDepth > self::MAX_DEPTH) {
            $this->toast('That would nest deeper than the header can show (three levels).', 'error');

            return;
        }

        $item->parent_id = $newParent->id;
        $item->position = ((int) NavigationItem::query()
            ->where('menu', $this->menu)
            ->where('parent_id', $newParent->id)
            ->max('position')) + 1;
        $item->save();

        $this->normalise();
        $this->load();
    }

    /** Lift an item one level, placing it after its former parent. */
    public function outdent(int $id): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $item = NavigationItem::query()->find($id);

        if ($item === null || $item->parent_id === null) {
            return;
        }

        $parent = NavigationItem::query()->find($item->parent_id);

        $item->parent_id = $parent?->parent_id;
        $item->position = ((int) ($parent?->position ?? 0)) + 1;
        $item->save();

        $this->normalise();
        $this->load();
    }

    /**
     * Move a link to a new place in the tree — what drag and drop calls.
     *
     * Three drop zones, because a tree needs to express two different things:
     *
     *   before / after  become a sibling of the row you dropped on, at its parent's level
     *   inside          becomes a child of it, appended after its existing children
     *
     * Two refusals, both silent data loss otherwise: a link cannot be dropped inside its own
     * descendant (the subtree would detach from the tree and vanish from every render), and the
     * moved subtree must still fit under the three-level cap.
     */
    public function moveTo(int $id, int $targetId, string $position): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        if ($id === $targetId) {
            return;
        }

        // Moving reloads the tree from the database, which would throw away text typed but not yet
        // saved. Refusing costs one click; losing a half-written URL costs trust.
        if ($this->dirty) {
            $this->toast('Save your text changes before moving links.', 'error');

            return;
        }

        if (! in_array($position, ['before', 'after', 'inside'], true)) {
            return;
        }

        $item = NavigationItem::query()->find($id);
        $target = NavigationItem::query()->find($targetId);

        if ($item === null || $target === null || $item->menu !== $this->menu || $target->menu !== $this->menu) {
            return;
        }

        if (in_array($targetId, $this->descendantsOf($id), true)) {
            $this->toast('A link cannot be moved inside one of its own children.', 'error');

            return;
        }

        $newParentId = $position === 'inside' ? (int) $target->id : ($target->parent_id === null ? null : (int) $target->parent_id);

        /** @var NavigationItem|null $newParent */
        $newParent = $newParentId === null ? null : NavigationItem::query()->find($newParentId);
        $parentDepth = $newParent === null ? 0 : $this->depthOf($newParent);

        if ($parentDepth + 1 + $this->subtreeHeight($item) > self::MAX_DEPTH) {
            $this->toast('That would nest deeper than the shell can show (three levels).', 'error');

            return;
        }

        // The new order, as ids: the destination's siblings without the moved item, with it slotted in.
        $siblings = NavigationItem::query()
            ->where('menu', $this->menu)
            ->where('parent_id', $newParentId)
            ->orderBy('position')
            ->orderBy('id')
            ->pluck('id')
            ->map(static fn ($value): int => (int) $value)
            ->reject(static fn (int $value): bool => $value === $id)
            ->values()
            ->all();

        $index = array_search($targetId, $siblings, true);

        if ($position === 'inside') {
            $at = count($siblings);
        } elseif ($index === false) {
            $at = count($siblings);
        } else {
            $at = $position === 'before' ? $index : $index + 1;
        }

        array_splice($siblings, $at, 0, [$id]);

        $item->parent_id = $newParentId;
        $item->save();

        foreach ($siblings as $offset => $siblingId) {
            NavigationItem::query()
                ->where('id', $siblingId)
                ->update(['position' => $offset + 1]);
        }

        // The old parent's list now has a hole; renumbering every list costs one query and removes the
        // class of bug where two rows claim position 3 and the order depends on the database's mood.
        $this->normalise();
        $this->load();

        $this->selected = $id;
    }

    /**
     * Persist the text fields of every item on this screen.
     *
     * Items with no label are dropped: an empty label renders an invisible link in the header, and
     * an empty URL renders one that goes nowhere. Better to lose the half-made row than to publish it.
     */
    public function save(): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $saved = 0;
        $dropped = 0;

        foreach ($this->items as $row) {
            $item = NavigationItem::query()->find($row['id']);

            if ($item === null) {
                continue;
            }

            $label = trim((string) $row['label']);

            if ($label === '') {
                // Only drop rows the builder itself created and never filled in.
                if ($item->url === '') {
                    $item->delete();
                    $dropped++;
                }

                continue;
            }

            $url = trim((string) $row['url']);

            $item->label = $label;
            $item->url = $url === '' ? '#' : $url;
            $item->target = in_array($row['target'], ['_self', '_blank'], true) ? $row['target'] : '_self';
            $item->is_mega = (bool) $row['is_mega'];
            $item->save();

            $saved++;
        }

        $this->selected = null;
        $this->dirty = false;
        $this->load();

        $message = "Saved {$saved} link".($saved === 1 ? '' : 's').'.';
        $message .= $dropped > 0 ? " {$dropped} empty row".($dropped === 1 ? '' : 's').' discarded.' : '';

        $this->toast($message);
    }

    /** Called by every text field: badging the screen is the only job. */
    public function markDirty(): void
    {
        $this->dirty = true;
    }

    // ---- internals -----------------------------------------------------------------------------

    /**
     * Reload the tree in display order: depth-first, siblings by position.
     *
     * Ordered in PHP rather than SQL because it is one query either way at this size, and a recursive
     * walk is easier to follow than a recursive CTE that SQLite and MySQL spell differently.
     */
    private function load(): void
    {
        /** @var Collection<int, NavigationItem> $rows */
        $rows = NavigationItem::query()
            ->where('menu', $this->menu)
            ->orderBy('position')
            ->orderBy('id')
            ->get();

        $byParent = [];

        foreach ($rows as $row) {
            $byParent[$row->parent_id ?? 0][] = $row;
        }

        $flat = [];

        $walk = static function (int $parentId, int $depth) use (&$walk, &$flat, $byParent): void {
            foreach ($byParent[$parentId] ?? [] as $row) {
                $flat[] = [
                    'id' => (int) $row->id,
                    'label' => (string) $row->label,
                    'url' => (string) $row->url,
                    'target' => (string) $row->target,
                    'is_mega' => (bool) $row->is_mega,
                    'parent_id' => $row->parent_id === null ? null : (int) $row->parent_id,
                    'position' => (int) $row->position,
                    'depth' => $depth,
                ];

                $walk((int) $row->id, $depth + 1);
            }
        };

        $walk(0, 1);

        $this->items = $flat;
    }

    /** @return array<string, mixed>|null */
    private function find(int $id): ?array
    {
        foreach ($this->items as $row) {
            if ($row['id'] === $id) {
                return $row;
            }
        }

        return null;
    }

    private function swapWithSibling(int $id, int $direction): void
    {
        abort_unless($this->user()->can('website.edit'), 403);

        $item = NavigationItem::query()->find($id);

        if ($item === null) {
            return;
        }

        $siblings = $this->siblingsOf($item);
        $index = $siblings->search(fn (NavigationItem $row): bool => $row->id === $item->id);
        $target = is_int($index) ? $index + $direction : false;

        if (! is_int($index) || $target === false || ! isset($siblings[$target])) {
            return;
        }

        /** @var NavigationItem $other */
        $other = $siblings[$target];

        $mine = (int) $item->position;
        $item->position = (int) $other->position;
        $other->position = $mine;
        $item->save();
        $other->save();

        $this->normalise();
        $this->load();
    }

    /** Rewrite positions 1..n per parent, so swaps never drift into collisions after many moves. */
    private function normalise(): void
    {
        /** @var Collection<int, NavigationItem> $rows */
        $rows = NavigationItem::query()->where('menu', $this->menu)->orderBy('position')->orderBy('id')->get();

        $counters = [];

        foreach ($rows as $row) {
            $key = $row->parent_id ?? 0;
            $counters[$key] = ($counters[$key] ?? 0) + 1;

            if ((int) $row->position !== $counters[$key]) {
                $row->position = $counters[$key];
                $row->save();
            }
        }
    }

    /** @return Collection<int, NavigationItem> */
    private function siblingsOf(NavigationItem $item): Collection
    {
        return NavigationItem::query()
            ->where('menu', $this->menu)
            ->where('parent_id', $item->parent_id)
            ->orderBy('position')
            ->orderBy('id')
            ->get();
    }

    /** 1 for a top-level item, 2 for its child, and so on. */
    private function depthOf(NavigationItem $item): int
    {
        $depth = 1;
        $guard = 0;
        $current = $item;

        while ($current->parent_id !== null && $guard < 10) {
            $parent = NavigationItem::query()->find($current->parent_id);

            if ($parent === null) {
                break;
            }

            $depth++;
            $current = $parent;
            $guard++;
        }

        return $depth;
    }

    /** How many levels hang below this item; 0 when it is a leaf. */
    private function subtreeHeight(NavigationItem $item): int
    {
        $children = NavigationItem::query()
            ->where('menu', $this->menu)
            ->where('parent_id', $item->id)
            ->get();

        if ($children->isEmpty()) {
            return 0;
        }

        $deepest = 0;

        foreach ($children as $child) {
            $deepest = max($deepest, $this->subtreeHeight($child));
        }

        return $deepest + 1;
    }

    /** @return list<int> ids beneath the given item */
    private function descendantsOf(int $id): array
    {
        $ids = [];

        $children = NavigationItem::query()
            ->where('menu', $this->menu)
            ->where('parent_id', $id)
            ->get();

        foreach ($children as $child) {
            $ids[] = (int) $child->id;
            $ids = [...$ids, ...$this->descendantsOf((int) $child->id)];
        }

        return $ids;
    }

    /** @return array<string, string> */
    public function menus(): array
    {
        // Any other menu key in the table (a future service menu, say) still has to be reachable,
        // otherwise a row exists that no screen can edit.
        try {
            $extra = NavigationItem::query()
                ->select('menu')
                ->distinct()
                ->pluck('menu')
                ->reject(fn (string $key): bool => array_key_exists($key, self::MENUS))
                ->mapWithKeys(fn (string $key): array => [$key => ucfirst(str_replace(['footer:', ':', '_'], ['Footer · ', ' · ', ' '], $key))])
                ->all();
        } catch (\Throwable) {
            $extra = [];
        }

        return self::MENUS + $extra;
    }

    public function render(): View
    {
        return view('livewire.admin.website.menu-builder');
    }
}
