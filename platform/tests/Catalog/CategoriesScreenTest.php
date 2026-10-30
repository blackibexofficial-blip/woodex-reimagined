<?php

declare(strict_types=1);

namespace Tests\Catalog;

use Tests\Support\Assert;

/**
 * The categories screen, read as source text.
 *
 * The tree builder has its own tests; what is pinned here is the contract around it — that the
 * screen cannot be used to break a URL, that reordering repairs duplicate positions instead of
 * swapping two numbers, and that every write is permission-checked on the action and not only
 * on the page.
 */
final class CategoriesScreenTest
{
    private function root(): string
    {
        return dirname(__DIR__, 2);
    }

    private function source(string $relative): string
    {
        $path = $this->root().$relative;

        Assert::trueWith(is_file($path), static fn (): string => "missing file {$relative}", 'file exists');

        return is_file($path) ? (string) file_get_contents($path) : '';
    }

    public function testTheScreenIsNoLongerAPlaceholder(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/CategoriesIndex.php');

        Assert::same(false, str_contains($source, 'extends CommerceScreen'), 'it renders real rows, not coming-soon');
        Assert::true(str_contains($source, 'CategoryTree::fromRows'), 'and reads the tree through the value object');
        Assert::true(
            is_file($this->root().'/resources/views/livewire/admin/commerce/categories-index.blade.php'),
            'with a view of its own',
        );
    }

    public function testRenamingNeverTouchesTheSlug(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/CategoriesIndex.php');

        $rename = substr($source, (int) strpos($source, 'public function saveName'));
        $rename = substr($rename, 0, (int) strpos($rename, 'public function toggleActive'));

        Assert::true(str_contains($rename, 'CategoryTranslation::query()->updateOrCreate'), 'it writes the translation row');
        Assert::same(false, str_contains($rename, "'slug'"), 'and never the slug');
        Assert::true(str_contains($rename, "'locale' => app()->getLocale()"), 'only for the current locale');
        Assert::true(str_contains($rename, 'mb_strlen($name) > 160'), 'with a length the column can hold');
    }

    public function testReorderingRewritesEverySiblingPosition(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/CategoriesIndex.php');
        $move = substr($source, (int) strpos($source, 'public function move'));
        $move = substr($move, 0, (int) strpos($move, 'public function render'));

        Assert::true(str_contains($move, 'DB::transaction'), 'the whole sibling group moves or none of it does');
        Assert::true(str_contains($move, 'foreach ($siblings as $position => $id)'), 'positions are rewritten, not swapped');
        Assert::true(str_contains($move, "'position' => $position"), 'as 0..n');
        Assert::true(str_contains($move, '$tree->swapFor'), 'and the move is validated by the tree first');
    }

    public function testEveryWriteChecksThePermission(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/CategoriesIndex.php');

        foreach (['saveName', 'toggleActive', 'toggleMenu', 'move', 'startEditing'] as $method) {
            $body = substr($source, (int) strpos($source, "public function {$method}"));
            $body = substr($body, 0, 900);

            Assert::true(
                str_contains($body, "can('commerce.products.manage')"),
                "{$method} checks the permission",
            );
        }
    }

    public function testDeletingIsNotOffered(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/CategoriesIndex.php');
        $view = $this->source('/resources/views/livewire/admin/commerce/categories-index.blade.php');

        Assert::same(false, str_contains($source, '->delete()'), 'no delete in the component');
        Assert::same(false, str_contains($view, 'Delete'), 'and no delete button on the page');
        Assert::same(false, str_contains($view, 'Trash'), 'not even as an icon');
    }

    public function testABrokenTreeIsShownRatherThanSilentlyRepaired(): void
    {
        $view = $this->source('/resources/views/livewire/admin/commerce/categories-index.blade.php');

        Assert::true(str_contains($view, '$problems'), 'the repair list reaches the page');
        Assert::true(str_contains($view, 'Nothing was changed in the database'), 'and the page says the repair was display-only');
    }

    public function testTheCountsShownArePublishedOnly(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/CategoriesIndex.php');

        Assert::true(str_contains($source, 'Product::STATUS_PUBLISHED'), 'drafts are not counted');
        Assert::true(str_contains($source, 'whereNull(\'commerce_products.deleted_at\')'), 'nor are deleted products');
    }

    public function testEveryIconUsedExistsInTheOsSet(): void
    {
        $names = json_decode((string) file_get_contents($this->root().'/tests/fixtures/os/icon-names.json'), true)['names'];
        $view = $this->source('/resources/views/livewire/admin/commerce/categories-index.blade.php')
            .$this->source('/resources/views/livewire/admin/commerce/partials/category-rename.blade.php');

        preg_match_all('/<x-icon name="([a-z0-9-]+)"/', $view, $matches);

        Assert::true($matches[1] !== [], 'the view uses icons');

        foreach (array_unique($matches[1]) as $icon) {
            Assert::true(in_array($icon, $names, true), "icon [{$icon}] exists in the OS set");
        }
    }
}
