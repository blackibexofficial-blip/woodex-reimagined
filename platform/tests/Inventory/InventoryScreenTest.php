<?php

declare(strict_types=1);

namespace Tests\Inventory;

use Tests\Support\Assert;

/**
 * The inventory screen, read as source text.
 *
 * The queries cannot run here — there is no database in this sandbox — so what is pinned is
 * the part that would be expensive to get wrong in production: availability is computed from
 * two columns and never from `qty` alone, the permission is checked on the screen *and* on the
 * action, and releasing holds is an update rather than a delete.
 */
final class InventoryScreenTest
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
        $source = $this->source('/app/Livewire/Admin/Commerce/InventoryIndex.php');

        Assert::same(false, str_contains($source, 'extends CommerceScreen'), 'it does not render coming-soon');
        Assert::true(str_contains($source, 'WithPagination'), 'it paginates real rows');
        Assert::true(
            is_file($this->root().'/resources/views/livewire/admin/commerce/inventory-index.blade.php'),
            'and has a view of its own',
        );
    }

    public function testAvailabilityIsNeverReadFromOnHandAlone(): void
    {
        $screen = $this->source('/app/Livewire/Admin/Commerce/InventoryIndex.php');
        $model = $this->source('/app/Domain/Commerce/Models/InventoryItem.php');
        $level = $this->source('/app/Domain/Commerce/Inventory/StockLevel.php');

        Assert::true(str_contains($model, 'return max(0, $this->qty - $this->reserved);'), 'the model subtracts holds');
        Assert::true(str_contains($level, '$this->qty - $this->reserved'), 'and so does the value object');
        Assert::true(str_contains($screen, 'new StockLevel('), 'the screen asks the value object rather than deciding');
        Assert::true(str_contains($screen, "whereRaw('qty - reserved <= 0')"), 'the out-of-stock filter uses availability');
        Assert::true(str_contains($screen, "whereRaw('qty - reserved <= low_stock_threshold')"), 'and so does the low-stock filter');
    }

    public function testThePermissionIsCheckedOnTheScreenAndOnTheAction(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/InventoryIndex.php');

        Assert::same(2, substr_count($source, "can('commerce.inventory.manage')"), 'mount and the write both check');
        Assert::true(str_contains($source, 'public function mount(): void'), 'the screen checks on open');
        Assert::true(str_contains($source, 'public function releaseExpired(): void'), 'the action checks before writing');
    }

    public function testReleasingAHoldIsAnUpdateAndNeverADelete(): void
    {
        $source = $this->source('/app/Livewire/Admin/Commerce/InventoryIndex.php');
        $model = $this->source('/app/Domain/Commerce/Checkout/Models/InventoryReservation.php');

        Assert::true(str_contains($source, "'released_at' => now()"), 'the hold is stamped, not removed');
        Assert::true(str_contains($source, "'release_reason' => InventoryReservation::EXPIRED"), 'with the reason');
        Assert::true(str_contains($model, 'scopeExpired'), 'and only holds past their deadline are swept');
        Assert::same(false, str_contains($source, '->delete()'), 'nothing is deleted: "we held it and let it go" is the audit trail');
    }

    public function testTheScreenShowsTheBacklogInsteadOfSweepingSilently(): void
    {
        $view = $this->source('/resources/views/livewire/admin/commerce/inventory-index.blade.php');

        Assert::true(str_contains($view, 'Held right now'), 'held units are visible');
        Assert::true(str_contains($view, 'expires'), 'with a deadline the customer can be quoted');
        Assert::true(str_contains($view, 'Release'), 'and an explicit action, not a background rule');
    }

    public function testAStockRowThatIsHeldBeyondItsShelfIsCalledOut(): void
    {
        $view = $this->source('/resources/views/livewire/admin/commerce/inventory-index.blade.php');

        Assert::true(str_contains($view, '$level->isCorrupted()'), 'the corruption flag reaches the page');
        Assert::true(str_contains($view, 'oversold'), 'and is named in plain words');
    }
}
