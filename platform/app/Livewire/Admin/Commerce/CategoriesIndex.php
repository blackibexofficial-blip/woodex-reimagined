<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Catalog\CategoryTree;
use App\Domain\Commerce\Models\Category;
use App\Domain\Commerce\Models\CategoryTranslation;
use App\Domain\Commerce\Models\Product;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Facades\DB;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * The category tree, editable in place.
 *
 * Three writes, each with a reason:
 *
 *  - **Rename.** The name lives in a translation row, not on the category, so the storefront's
 *    URL and every product's filter key survive a rename. Renaming a slug would break links
 *    that customers and Google already hold, so the slug is shown and not editable here.
 *  - **Show or hide.** Two independent switches: active (the catalogue will serve it) and
 *    menu (the storefront lists it). A landing page linked from an ad is active and not in the
 *    menu, and that is a legitimate state, not a half-finished one.
 *  - **Move.** Reordering rewrites the sibling positions as 0..n rather than swapping two
 *    numbers, which quietly repairs the duplicate positions that cause a sidebar to shuffle.
 *
 * Nothing is deleted. A category with products is the only way some products can be found, and
 * an unguarded delete here would orphan them; removal gets its own flow with a reassignment
 * step, later.
 */
#[Layout('layouts::admin')]
#[Title('Categories')]
class CategoriesIndex extends Component
{
    #[Url]
    public string $search = '';

    /** Category id currently being renamed, or null. */
    public ?int $editingId = null;

    public string $nameInput = '';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.products.manage'), 403);
    }

    /**
     * Every category, with its published product count.
     *
     * Counts are published-only for the same reason the storefront's are: a category that says
     * "12 products" and opens onto eight has been counted wrong.
     *
     * @return list<array<string, mixed>>
     */
    public function rows(): array
    {
        $counts = DB::table('commerce_product_categories')
            ->join('commerce_products', 'commerce_products.id', '=', 'commerce_product_categories.product_id')
            ->where('commerce_products.status', Product::STATUS_PUBLISHED)
            ->whereNull('commerce_products.deleted_at')
            ->groupBy('commerce_product_categories.category_id')
            ->selectRaw('commerce_product_categories.category_id as category_id, count(*) as aggregate')
            ->pluck('aggregate', 'category_id')
            ->map(static fn ($count): int => (int) $count)
            ->all();

        return Category::query()
            ->with('translation')
            ->orderBy('position')
            ->orderBy('id')
            ->get()
            ->map(static fn (Category $category): array => [
                'id' => $category->id,
                'parent_id' => $category->parent_id,
                'position' => (int) $category->position,
                'slug' => $category->slug,
                'name' => $category->displayName(),
                'is_active' => (bool) $category->is_active,
                'show_in_menu' => (bool) $category->show_in_menu,
                'product_count' => $counts[$category->id] ?? 0,
            ])
            ->all();
    }

    public function tree(): CategoryTree
    {
        return CategoryTree::fromRows($this->rows());
    }

    /**
     * Roots and their children, already ordered, as the view walks them.
     *
     * @return list<array{category: array<string, mixed>, children: list<array<string, mixed>>, count: int}>
     */
    public function branches(): array
    {
        $tree = $this->tree();
        $search = mb_strtolower(trim($this->search));

        $matches = static function (array $row) use ($search): bool {
            return $search === ''
                || str_contains(mb_strtolower($row['name']), $search)
                || str_contains(mb_strtolower($row['slug']), $search);
        };

        $branches = [];

        foreach ($tree->rootIds() as $rootId) {
            $root = (array) $tree->find($rootId);
            $children = [];

            foreach ($tree->childIds($rootId) as $childId) {
                $child = (array) $tree->find($childId);

                if ($matches($child)) {
                    $children[] = $child;
                }
            }

            // A search that hits a child must keep its parent visible, or the result set looks
            // like a category that lost its subcategories.
            if ($matches($root) || $children !== []) {
                $branches[] = [
                    'category' => $root,
                    'children' => $children,
                    'count' => $tree->countFor($rootId),
                ];
            }
        }

        return $branches;
    }

    /** @return array{categories: int, roots: int, empty: int, depth: int} */
    public function stats(): array
    {
        $tree = $this->tree();
        $empty = 0;

        foreach ($tree->rootIds() as $id) {
            if ($tree->countFor($id) === 0) {
                $empty++;
            }
        }

        return [
            'categories' => count($this->rows()),
            'roots' => count($tree->rootIds()),
            'empty' => $empty,
            'depth' => $tree->depth(),
        ];
    }

    public function startEditing(int $categoryId): void
    {
        abort_unless($this->user()->can('commerce.products.manage'), 403);

        $category = Category::query()->with('translation')->findOrFail($categoryId);

        $this->editingId = $category->id;
        $this->nameInput = $category->displayName();
    }

    public function cancelEditing(): void
    {
        $this->editingId = null;
        $this->nameInput = '';
        $this->resetErrorBag();
    }

    /**
     * Rename the category, in the current locale only.
     *
     * The slug is deliberately untouched: it is in every product link, every sitemap entry and
     * every bookmark, and changing it silently would 404 them all.
     */
    public function saveName(): void
    {
        abort_unless($this->user()->can('commerce.products.manage'), 403);

        if ($this->editingId === null) {
            return;
        }

        $name = trim($this->nameInput);

        if ($name === '') {
            $this->addError('nameInput', 'A category needs a name.');

            return;
        }

        if (mb_strlen($name) > 160) {
            $this->addError('nameInput', 'Keep the name under 160 characters.');

            return;
        }

        CategoryTranslation::query()->updateOrCreate(
            ['category_id' => $this->editingId, 'locale' => app()->getLocale()],
            ['name' => $name],
        );

        $this->editingId = null;
        $this->nameInput = '';
        $this->resetErrorBag();
        $this->toast($name.' renamed.');
    }

    /** Serve or stop serving this category in the catalogue. */
    public function toggleActive(int $categoryId): void
    {
        abort_unless($this->user()->can('commerce.products.manage'), 403);

        $category = Category::query()->findOrFail($categoryId);
        $category->forceFill(['is_active' => ! $category->is_active])->save();

        $this->toast($category->displayName().($category->is_active ? ' is live.' : ' is switched off.'));
    }

    /** List or delist this category in the storefront menu, without changing whether it serves. */
    public function toggleMenu(int $categoryId): void
    {
        abort_unless($this->user()->can('commerce.products.manage'), 403);

        $category = Category::query()->findOrFail($categoryId);
        $category->forceFill(['show_in_menu' => ! $category->show_in_menu])->save();

        $this->toast($category->displayName().($category->show_in_menu ? ' shown in the menu.' : ' hidden from the menu.'));
    }

    /**
     * Move a category up or down among its siblings.
     *
     * Positions are rewritten as 0..n for the whole sibling group rather than swapping two
     * values. Swapping is only correct when the numbers are contiguous to begin with, and they
     * stop being contiguous the first time anyone inserts a row by hand — after which swaps
     * start doing nothing, which reads as a broken button.
     */
    public function move(int $categoryId, string $direction): void
    {
        abort_unless($this->user()->can('commerce.products.manage'), 403);

        $tree = $this->tree();
        $pair = $tree->swapFor($categoryId, $direction);

        if ($pair === null) {
            return;
        }

        [$moving, $other] = $pair;
        $parentId = $tree->find($moving)['parent_id'] ?? null;

        // The sibling list in display order, with the two entries exchanged.
        $siblings = $parentId === null ? $tree->rootIds() : $tree->childIds($parentId);
        $index = array_search($moving, $siblings, true);

        if ($index === false) {
            return;
        }

        $target = array_search($other, $siblings, true);
        $siblings[$index] = $other;
        $siblings[$target] = $moving;

        DB::transaction(static function () use ($siblings): void {
            foreach ($siblings as $position => $id) {
                Category::query()->whereKey($id)->update(['position' => $position]);
            }
        });

        $this->toast('Order updated.');
    }

    public function render(): View
    {
        return view('livewire.admin.commerce.categories-index', [
            'branches' => $this->branches(),
            'stats' => $this->stats(),
            'problems' => $this->tree()->problems(),
            'canManage' => $this->user()->can('commerce.products.manage'),
        ]);
    }
}
