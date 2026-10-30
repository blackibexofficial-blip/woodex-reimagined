<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Billing\RefundAudit;
use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Support\Money;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * Money that went back out.
 *
 * There is no refunds table, so this screen has nothing to list and everything to reconcile.
 * A refund is `refunded_minor` on the order plus, usually, a status of `cancelled` — two
 * fields written at different moments by different people. When they disagree, the customer is
 * either owed goods they have already been refunded for, or money that has not moved.
 *
 * `RefundAudit` finds the three disagreements. This is the table around it.
 */
#[Layout('layouts::admin')]
#[Title('Refunds & returns')]
class RefundsIndex extends Component
{
    use InteractsWithAdmin;

    #[Url]
    public string $search = '';

    /** all | over | cancelled | partial | full */
    #[Url]
    public string $scope = 'all';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.payments.manage'), 403);
    }

    /**
     * Every order a refund could apply to: anything with money back, or cancelled with money in.
     *
     * Fetching only refunded rows would hide the cancelled order that still holds the
     * customer's money — which is the case the screen exists for.
     */
    public function audit(): RefundAudit
    {
        $rows = Order::query()
            ->where(function (Builder $query): void {
                $query->where('refunded_minor', '>', 0)
                    ->orWhere(function (Builder $inner): void {
                        $inner->where('status', 'cancelled')->where('paid_minor', '>', 0);
                    });
            })
            ->with(['addresses'])
            ->orderByDesc('placed_at')
            ->orderByDesc('id')
            ->limit(500)
            ->get()
            ->map(static fn (Order $order): array => [
                'order' => (string) $order->number,
                'total' => (int) $order->grand_total_minor,
                'paid' => max(0, (int) $order->paid_minor),
                'refunded' => max(0, (int) $order->refunded_minor),
                'status' => (string) $order->status,
            ])
            ->all();

        return new RefundAudit($rows);
    }

    /**
     * The rows the table shows.
     *
     * The scope filters ask about the three defects and the two ordinary shapes, which is how
     * somebody actually uses this page: "show me what is wrong" first, "show me everything" second.
     *
     * @return Collection<int, array<string, mixed>>
     */
    public function rows(): Collection
    {
        $audit = $this->audit();
        $term = strtolower(trim($this->search));

        $orders = collect($audit->orders)
            ->when($this->scope === 'over', fn (Collection $rows): Collection => $rows->filter(
                static fn (array $order): bool => (int) $order['refunded'] > (int) $order['paid'],
            ))
            ->when($this->scope === 'cancelled', fn (Collection $rows): Collection => $rows->filter(
                static fn (array $order): bool => $order['status'] === 'cancelled'
                    && (int) $order['paid'] > 0
                    && (int) $order['refunded'] === 0,
            ))
            ->when($this->scope === 'partial', fn (Collection $rows): Collection => $rows->filter(
                static fn (array $order): bool => (int) $order['refunded'] > 0
                    && (int) $order['refunded'] < (int) $order['paid'],
            ))
            ->when($this->scope === 'full', fn (Collection $rows): Collection => $rows->filter(
                static fn (array $order): bool => (int) $order['refunded'] > 0
                    && (int) $order['refunded'] >= (int) $order['paid'],
            ))
            ->when($term !== '', fn (Collection $rows): Collection => $rows->filter(
                static fn (array $order): bool => str_contains(strtolower((string) $order['order']), $term),
            ));

        return $orders->values();
    }

    /** The verdict for one row, so the badge and the warning cannot disagree. */
    public function stateOf(array $order): string
    {
        if ((int) $order['refunded'] > (int) $order['paid']) {
            return 'over';
        }

        if ($order['status'] === 'cancelled' && (int) $order['paid'] > 0 && (int) $order['refunded'] === 0) {
            return 'held';
        }

        if ((int) $order['refunded'] > 0 && $order['status'] !== 'cancelled') {
            return 'open';
        }

        return (int) $order['refunded'] >= (int) $order['paid'] ? 'full' : 'partial';
    }

    public function money(int $minor): string
    {
        return Money::ofMinor($minor, 'PKR')->format();
    }

    public function render(): View
    {
        $audit = $this->audit();

        return view('livewire.admin.commerce.refunds-index', [
            'rows' => $this->rows(),
            'summary' => $audit->summary(),
            'warnings' => $audit->warnings(),
            'total' => count($audit->orders),
        ]);
    }
}
