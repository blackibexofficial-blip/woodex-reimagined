<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Checkout\Models\InventoryReservation;
use App\Domain\Commerce\Inventory\StockLevel;
use App\Domain\Commerce\Models\InventoryItem;
use App\Domain\Commerce\Models\InventorySource;
use App\Domain\Commerce\Support\Money;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

/**
 * Where the shelf is, and who is holding what.
 *
 * Two questions this screen exists to answer, in this order:
 *
 *  1. "Can we still sell this?" — availability, which is `qty - reserved`, not `qty`. A
 *     warehouse count that ignores holds is how a showroom promises a chair twice.
 *  2. "Who is holding it, and until when?" — every held reservation with its expiry, because
 *     the answer to a customer saying "the website said two left" is a timestamp.
 *
 * The only write here is releasing expired holds. Adjusting stock by hand is deliberately not
 * on this screen yet: it needs a reason and an audit row, and a stock adjustment without one
 * is how a count drifts with no explanation. That lands with the movement ledger, not before.
 */
#[Layout('layouts::admin')]
#[Title('Inventory')]
class InventoryIndex extends Component
{
    use InteractsWithAdmin, WithPagination;

    #[Url]
    public string $search = '';

    #[Url]
    public string $source = '';

    /** all | low | out */
    #[Url]
    public string $stock = '';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.inventory.manage'), 403);
    }

    public function updatedSearch(): void
    {
        $this->resetPage();
    }

    public function updatedSource(): void
    {
        $this->resetPage();
    }

    public function updatedStock(): void
    {
        $this->resetPage();
    }

    /** @return Collection<int, string> warehouse id => name */
    public function sources(): Collection
    {
        return InventorySource::query()->orderBy('name')->pluck('name', 'id');
    }

    /**
     * The numbers above the table.
     *
     * Computed in SQL rather than by loading every row: a catalogue of 148 products is fine
     * either way, one of 5,000 would make this screen the slowest page in the admin.
     *
     * @return array{units: int, held: int, low: int, out: int, value_minor: int}
     */
    public function stats(): array
    {
        $rows = InventoryItem::query()
            ->selectRaw('COALESCE(SUM(qty), 0) as units')
            ->selectRaw('COALESCE(SUM(reserved), 0) as held')
            ->selectRaw('COALESCE(SUM(CASE WHEN qty - reserved <= 0 THEN 1 ELSE 0 END), 0) as out')
            ->selectRaw('COALESCE(SUM(CASE WHEN qty - reserved > 0 AND qty - reserved <= low_stock_threshold THEN 1 ELSE 0 END), 0) as low')
            ->selectRaw('COALESCE(SUM(qty * COALESCE((SELECT price_minor FROM commerce_product_variants WHERE commerce_product_variants.id = commerce_inventory_items.variant_id), 0)), 0) as value_minor')
            ->first();

        return [
            'units' => (int) ($rows->units ?? 0),
            'held' => (int) ($rows->held ?? 0),
            'low' => (int) ($rows->low ?? 0),
            'out' => (int) ($rows->out ?? 0),
            'value_minor' => (int) ($rows->value_minor ?? 0),
        ];
    }

    public function stockValue(): string
    {
        return Money::ofMinor($this->stats()['value_minor'])->format();
    }

    /** @return \Illuminate\Pagination\LengthAwarePaginator<int, InventoryItem> */
    public function items()
    {
        return InventoryItem::query()
            ->with(['variant.product.translation', 'source'])
            ->when($this->search !== '', function (Builder $query): void {
                $term = '%'.trim($this->search).'%';

                $query->where(function (Builder $inner) use ($term): void {
                    $inner->whereHas('variant', static fn (Builder $v) => $v->where('sku', 'like', $term))
                        ->orWhereHas('variant.product.translations', static fn (Builder $t) => $t->where('name', 'like', $term));
                });
            })
            ->when($this->source !== '', fn (Builder $query) => $query->where('source_id', (int) $this->source))
            // Availability is the difference between two columns, so it cannot be compared to
            // a third with whereColumn alone. The expressions are constant strings; no input
            // reaches this query.
            ->when($this->stock === 'low', fn (Builder $query) => $query
                ->whereRaw('qty - reserved > 0')
                ->whereRaw('qty - reserved <= low_stock_threshold'))
            ->when($this->stock === 'out', fn (Builder $query) => $query->whereRaw('qty - reserved <= 0'))
            ->orderBy('qty')
            ->orderBy('id')
            ->paginate(20);
    }

    public function level(InventoryItem $item): StockLevel
    {
        return new StockLevel((int) $item->qty, (int) $item->reserved, (int) $item->low_stock_threshold);
    }

    /**
     * Holds that have run out of time but have not been released.
     *
     * A cart lives 24 hours (`CartService::LIFETIME_HOURS`); when it does not convert, its
     * units stay reserved until something sweeps them. That job runs on a schedule, and this
     * list is the visible backlog in case the scheduler is late.
     *
     * @return Collection<int, InventoryReservation>
     */
    public function holds(): Collection
    {
        return InventoryReservation::query()
            ->held()
            ->with(['variant.product.translation', 'source'])
            ->orderByRaw('expires_at IS NULL')
            ->orderBy('expires_at')
            ->limit(10)
            ->get();
    }

    public function expiredCount(): int
    {
        return InventoryReservation::query()->expired()->count();
    }

    /** Release every hold whose deadline has passed. */
    public function releaseExpired(): void
    {
        abort_unless($this->user()->can('commerce.inventory.manage'), 403);

        $released = InventoryReservation::query()
            ->expired()
            ->update([
                'released_at' => now(),
                'release_reason' => InventoryReservation::EXPIRED,
            ]);

        $this->toast($released === 0
            ? 'No holds had expired.'
            : $released.' expired '.($released === 1 ? 'hold' : 'holds').' released.');
    }

    public function render(): View
    {
        return view('livewire.admin.commerce.inventory-index', [
            'items' => $this->items(),
            'sources' => $this->sources(),
            'stats' => $this->stats(),
            'holds' => $this->holds(),
            'expired' => $this->expiredCount(),
        ]);
    }
}
