<?php

declare(strict_types=1);

namespace Tests\Catalog;

use App\Domain\Commerce\Catalog\CategoryTree;
use Tests\Support\Assert;

/**
 * The four ways a category tree goes wrong, each reproduced here.
 *
 * This class is the reason the categories screen can be trusted with an "edit" button: the
 * ordering is total, orphans are promoted rather than hidden, cycles are broken, and a root's
 * count includes its children. None of that needs a database to prove.
 */
final class CategoryTreeTest extends \Tests\TestCase
{
    /** @param array<string, mixed> $overrides */
    private function row(int $id, ?int $parent, int $position, string $name, int $count = 0, array $overrides = []): array
    {
        return array_merge([
            'id' => $id,
            'parent_id' => $parent,
            'position' => $position,
            'slug' => strtolower(str_replace(' ', '-', $name)),
            'name' => $name,
            'is_active' => true,
            'show_in_menu' => true,
            'product_count' => $count,
        ], $overrides);
    }

    /** @return list<array<string, mixed>> */
    private function shop(): array
    {
        return [
            $this->row(1, null, 0, 'Office Tables', 0),
            $this->row(2, 1, 0, 'Executive Tables', 5),
            $this->row(3, 1, 1, 'Manager Tables', 2),
            $this->row(4, null, 1, 'Chairs', 5),
            $this->row(5, null, 2, 'Workstations', 0),
            $this->row(6, 5, 0, 'Cubicle Workstations', 2),
        ];
    }

    public function testRootsAndChildrenComeOutInPositionOrder(): void
    {
        $tree = CategoryTree::fromRows($this->shop());

        Assert::same([1, 4, 5], $tree->rootIds(), 'roots in position order');
        Assert::same([2, 3], $tree->childIds(1), 'children in position order');
        Assert::same([6], $tree->childIds(5), 'the deeper branch keeps its child');
        Assert::same([], $tree->childIds(2), 'a leaf has no children');
    }

    public function testTwoRowsSharingAPositionStillOrderDeterministically(): void
    {
        $tree = CategoryTree::fromRows([
            $this->row(9, null, 0, 'Second'),
            $this->row(3, null, 0, 'First'),
            $this->row(7, null, 0, 'Third'),
        ]);

        // Same position, so the id breaks the tie — which is arbitrary but *stable*, and
        // stability is what stops the sidebar reshuffling between two page loads.
        Assert::same([3, 7, 9], $tree->rootIds(), 'ties broken by id');
        Assert::same([3, 7, 9], CategoryTree::fromRows(array_reverse([
            $this->row(9, null, 0, 'Second'),
            $this->row(3, null, 0, 'First'),
            $this->row(7, null, 0, 'Third'),
        ]))->rootIds(), 'and the order does not depend on the input order');
    }

    public function testAnOrphansIsPromotedAndNamed(): void
    {
        $tree = CategoryTree::fromRows([
            $this->row(1, null, 0, 'Office Tables'),
            $this->row(2, 99, 0, 'Orphaned Sub'),
        ]);

        Assert::same([1, 2], $tree->rootIds(), 'the orphan is visible at the top level');
        Assert::same(1, count($tree->problems()), 'and the screen is told why');
        Assert::true(str_contains($tree->problems()[0], 'Orphaned Sub'), 'naming the category');
    }

    public function testACycleIsBrokenInsteadOfLoopingForever(): void
    {
        $tree = CategoryTree::fromRows([
            $this->row(1, 2, 0, 'A'),
            $this->row(2, 1, 0, 'B'),
            $this->row(3, null, 1, 'Healthy'),
        ]);

        Assert::true($tree->depth() <= 2, 'depth stays finite once the cycle is broken');
        Assert::true(in_array(3, $tree->rootIds(), true), 'the healthy root is unaffected');
        Assert::true(count($tree->problems()) > 0, 'the cycle is reported rather than silently fixed');
        Assert::true(
            $tree->depth() < 20,
            'and no walk of the tree runs away',
        );
    }

    public function testARootCountRollsUpItsChildren(): void
    {
        $tree = CategoryTree::fromRows($this->shop());

        // A product belongs to exactly one category, so a root that only groups children owns
        // none of its own — and still must not read as empty.
        Assert::same(0, $tree->countFor(1, false), 'its own products only');
        Assert::same(7, $tree->countFor(1), 'rolled up, the section is not empty');
        Assert::same(5, $tree->countFor(4), 'a leaf counts itself');
        Assert::same(2, $tree->countFor(5), 'and so does a root whose stock is all in its child');
        Assert::same(0, $tree->countFor(404), 'an unknown id counts nothing rather than throwing');
    }

    public function testMovingIsRefusedAtTheEndsInsteadOfWrappingAround(): void
    {
        $tree = CategoryTree::fromRows($this->shop());

        Assert::same(false, $tree->canMoveUp(1), 'the first root cannot go up');
        Assert::same(true, $tree->canMoveDown(1), 'but it can go down');
        Assert::same(false, $tree->canMoveDown(5), 'the last root cannot go down');
        Assert::same(false, $tree->canMoveUp(2), 'nor can the first child');

        Assert::same([1, 4], $tree->swapFor(1, 'down'), 'moving down trades with the next sibling');
        Assert::same([5, 4], $tree->swapFor(5, 'up'), 'moving up trades with the previous one');
        Assert::same(null, $tree->swapFor(1, 'up'), 'a move off the end returns nothing to do');
        Assert::same(null, $tree->swapFor(404, 'down'), 'an unknown id is nothing to do, not an error');
    }

    public function testASingleRootCannotMoveAtAll(): void
    {
        $tree = CategoryTree::fromRows([$this->row(1, null, 0, 'Only')]);

        Assert::same(false, $tree->canMoveUp(1), 'nothing above it');
        Assert::same(false, $tree->canMoveDown(1), 'nothing below it');
    }

    public function testHiddenFromMenuIsNotTheSameAsInactive(): void
    {
        $tree = CategoryTree::fromRows([
            $this->row(1, null, 0, 'Shown'),
            $this->row(2, null, 1, 'Hidden but live', 0, ['show_in_menu' => false]),
            $this->row(3, null, 2, 'Switched off', 0, ['is_active' => false, 'show_in_menu' => false]),
        ]);

        Assert::same([2], $tree->hiddenFromMenu(), 'only the live-but-hidden one is listed');
    }

    public function testDepthIsMeasuredAndCapped(): void
    {
        $tree = CategoryTree::fromRows($this->shop());

        Assert::same(2, $tree->depth(), 'the seeded tree is two levels');
        Assert::same(0, CategoryTree::fromRows([])->depth(), 'an empty tree has no depth at all');
    }

    public function testAParentsSubtreeIsExactlyWhatTheCatalogFilterNeeds(): void
    {
        $tree = CategoryTree::fromRows($this->shop());

        Assert::same([2, 3], $tree->descendantIds(1), 'both desks are under office tables');
        Assert::same([6], $tree->descendantIds(5), 'one level down is still a descendant');
        Assert::same([], $tree->descendantIds(2), 'a leaf has none');
        Assert::same([1, 2, 3], $tree->subtreeIds(1), 'the subtree includes the parent itself');
        Assert::same([], $tree->subtreeIds(404), 'an unknown parent has no subtree rather than throwing');
    }

    public function testTheSlugIndexIsHowTheFilterFindsACategory(): void
    {
        $tree = CategoryTree::fromRows($this->shop());

        Assert::same(
            ['office-tables' => 1, 'executive-tables' => 2, 'manager-tables' => 3, 'chairs' => 4, 'workstations' => 5, 'cubicle-workstations' => 6],
            $tree->slugIndex(),
            'every slug maps to its id',
        );
    }

    public function testAMalformedRowIsSkippedRatherThanCrashingTheScreen(): void
    {
        $tree = CategoryTree::fromRows([
            ['id' => 0, 'name' => 'No id'],
            $this->row(1, null, 0, 'Real'),
        ]);

        Assert::same([1], $tree->rootIds(), 'the real category survives');
        Assert::same(1, count($tree->problems()), 'and the bad row is reported');
        Assert::same(null, $tree->find(0), 'the malformed row is not in the tree');
    }
}
