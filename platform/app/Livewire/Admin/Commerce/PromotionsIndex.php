<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Pricing\PromotionLedger;
use App\Domain\Commerce\Support\Money;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * What discounting cost, by code.
 *
 * There is no coupons table yet, so this screen is retrospective: it reads the codes and the
 * discount amounts that ended up on real orders. That is a narrower question than "what
 * promotions are running", and a more honest one — the only discounts that matter are the ones
 * that were actually given.
 *
 * Two findings make it worth a page rather than a report:
 *
 * - **Discount with no code.** Money off nobody can reproduce, explain or switch off.
 * - **Code with no discount.** The customer was told their coupon worked, and it did not.
 */
#[Layout('layouts::admin')]
#[Title('Promotions')]
class PromotionsIndex extends Component
{
    use InteractsWithAdmin;

    #[Url]
    public string $search = '';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.promotions.manage'), 403);
    }

    public function ledger(): PromotionLedger
    {
        $rows = Order::query()
            ->where('status', '<>', 'cancelled')
            ->where(function (Builder $query): void {
                $query->where('discount_minor', '>', 0)->orWhereNotNull('coupon_code');
            })
            ->orderByDesc('placed_at')
            ->limit(500)
            ->get()
            ->map(static fn (Order $order): array => [
                'order' => (string) $order->number,
                'code' => $order->coupon_code,
                'discount' => (int) $order->discount_minor,
                'subtotal' => (int) $order->subtotal_minor,
                'placed_at' => $order->placed_at?->toIso8601String(),
            ])
            ->all();

        return new PromotionLedger($rows);
    }

    /** @return list<array<string, mixed>> */
    public function codes(): array
    {
        $term = strtolower(trim($this->search));

        return array_values(array_filter(
            $this->ledger()->byCode(),
            static fn (array $row): bool => $term === '' || str_contains(strtolower($row['code']), $term),
        ));
    }

    public function money(int $minor): string
    {
        return Money::ofMinor($minor, 'PKR')->format();
    }

    public function render(): View
    {
        $ledger = $this->ledger();
        $summary = $ledger->summary();

        return view('livewire.admin.commerce.promotions-index', [
            'codes' => $this->codes(),
            'summary' => $summary,
            'warnings' => $ledger->warnings(),
            'unattributed' => $ledger->unattributed(),
            'inert' => $ledger->inert(),
        ]);
    }
}
