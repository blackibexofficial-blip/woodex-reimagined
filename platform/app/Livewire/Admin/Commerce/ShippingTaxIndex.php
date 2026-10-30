<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Checkout\CartService;
use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Pricing\ChargeAudit;
use App\Domain\Commerce\Pricing\ShippingMethod;
use App\Domain\Commerce\Support\Money;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * The two charges a customer can check with a calculator.
 *
 * Tax and delivery are configured as constants today — a rate, a fee and a free-delivery
 * threshold — and every order stores what it was actually charged. This screen shows the rules
 * as they are and then audits the orders against them, which is the only way to notice that a
 * rate changed under an old order or that somebody comped a delivery by hand.
 *
 * It never recalculates an order. An order older than the current rule is *correct*; the audit
 * only flags the ones that do not match the rule they were placed under.
 */
#[Layout('layouts::admin')]
#[Title('Shipping & tax')]
class ShippingTaxIndex extends Component
{
    use InteractsWithAdmin;

    /** all | tax | shipping */
    #[Url]
    public string $scope = 'all';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.settings.manage'), 403);
    }

    public function delivery(): ShippingMethod
    {
        return CartService::cashOnDelivery();
    }

    /** The audit, over orders that actually carried a tax or delivery charge. */
    public function audit(): ChargeAudit
    {
        $delivery = $this->delivery();

        $rows = Order::query()
            ->where('status', '<>', 'cancelled')
            ->orderByDesc('placed_at')
            ->limit(500)
            ->get()
            ->map(static fn (Order $order): array => [
                'order' => (string) $order->number,
                'net' => max(0, (int) $order->subtotal_minor - (int) $order->discount_minor),
                'tax' => (int) $order->tax_minor,
                'shipping' => (int) $order->shipping_minor,
                'placed_at' => $order->placed_at?->toIso8601String(),
            ])
            ->all();

        return new ChargeAudit(
            orders: $rows,
            taxBp: CartService::DEFAULT_TAX_RATE_BP,
            deliveryMinor: $delivery->baseRate->minor,
            freeOverMinor: $delivery->freeOver?->minor ?? PHP_INT_MAX,
        );
    }

    /**
     * The orders that disagree with the rule, either way.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function mismatches(): Collection
    {
        $audit = $this->audit();

        return collect($audit->taxMismatches())
            ->map(static fn (array $row): array => $row + ['kind' => 'tax'])
            ->merge(collect($audit->shippingMismatches())->map(static fn (array $row): array => $row + ['kind' => 'shipping']))
            ->when($this->scope === 'tax', fn (Collection $rows): Collection => $rows->where('kind', 'tax'))
            ->when($this->scope === 'shipping', fn (Collection $rows): Collection => $rows->where('kind', 'shipping'))
            ->sortBy('order')
            ->values();
    }

    public function money(int $minor): string
    {
        return Money::ofMinor($minor, 'PKR')->format();
    }

    public function render(): View
    {
        $audit = $this->audit();
        $delivery = $this->delivery();

        return view('livewire.admin.commerce.shipping-tax-index', [
            'summary' => $audit->summary(),
            'warnings' => $audit->warnings(),
            'mismatches' => $this->mismatches(),
            'taxBp' => CartService::DEFAULT_TAX_RATE_BP,
            'delivery' => $delivery,
        ]);
    }
}
