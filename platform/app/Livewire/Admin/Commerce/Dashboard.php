<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Models\Category;
use App\Domain\Commerce\Models\InventoryItem;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Models\ProductVariant;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

/**
 * The Commerce front door.
 *
 * It shows only what actually exists in this phase: catalog counts and stock alerts. The
 * order and revenue tiles are present but marked as "from P2" rather than faked with zeroes —
 * a dashboard that reports ₨0 revenue when the table is simply empty teaches people to
 * distrust the dashboard.
 */
#[Layout('layouts::admin')]
#[Title('Commerce')]
class Dashboard extends Component
{
    use InteractsWithAdmin;

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.view'), 403);
    }

    /** @return array<string, int> */
    public function catalogStats(): array
    {
        return [
            'published' => Product::query()->where('status', Product::STATUS_PUBLISHED)->count(),
            'drafts' => Product::query()->where('status', Product::STATUS_DRAFT)->count(),
            'categories' => Category::query()->where('is_active', true)->count(),
            'variants' => ProductVariant::query()->where('status', 'active')->count(),
        ];
    }

    /** @return array<string, mixed> */
    public function stockAlerts(): array
    {
        $items = InventoryItem::query()
            ->with(['variant.product.translation', 'source'])
            ->whereColumn('qty', '<=', 'low_stock_threshold')
            ->orderBy('qty')
            ->limit(8)
            ->get();

        return [
            'count' => InventoryItem::query()->whereColumn('qty', '<=', 'low_stock_threshold')->count(),
            'items' => $items,
        ];
    }

    /** Products with no price and no priced variant — unpublishable, and easy to miss. */
    public function unpricedCount(): int
    {
        return Product::query()
            ->whereNull('price_minor')
            ->whereDoesntHave('variants', static fn ($query) => $query->whereNotNull('price_minor'))
            ->count();
    }

    public function render(): View
    {
        return view('livewire.admin.commerce.dashboard', [
            'stats' => $this->catalogStats(),
            'stock' => $this->stockAlerts(),
            'unpriced' => $this->unpricedCount(),
        ]);
    }
}
