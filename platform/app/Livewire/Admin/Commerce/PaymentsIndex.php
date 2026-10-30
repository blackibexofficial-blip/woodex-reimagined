<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Billing\PaymentLedger;
use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Checkout\Models\Payment;
use App\Domain\Commerce\Support\Money;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

/**
 * The money, as it arrived.
 *
 * Two tables hold it and they are written by different code: `commerce_payments` records the
 * attempts, and `commerce_orders.paid_minor` is the number every other screen reads. The
 * delivery step sets one, the bank check sets the other, and nothing in the schema makes them
 * agree — so this screen compares them and says when they do not.
 *
 * The other thing it does is put the unverified bank transfers first. A pending transfer is
 * not a technical state; it is a customer who has sent money and is waiting for a chair, and
 * every day it sits there is a day somebody may ring to ask where their order is.
 *
 * Read-only. Confirming a transfer moves money and belongs behind `commerce.payments.manage`
 * with the bank statement in front of you, not on a table you can mis-click.
 */
#[Layout('layouts::admin')]
#[Title('Payments')]
class PaymentsIndex extends Component
{
    use InteractsWithAdmin, WithPagination;

    /** The ledger is built once per request: the table, the badges and the totals all read it. */
    private ?PaymentLedger $cachedLedger = null;

    #[Url]
    public string $search = '';

    /** all | awaiting | drift | duplicates | cod */
    #[Url]
    public string $scope = 'all';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.payments.manage'), 403);
    }

    public function updated(string $property): void
    {
        if (in_array($property, ['search', 'scope'], true)) {
            $this->resetPage();
        }
    }

    /**
     * The ledger for the orders in view.
     *
     * Built from the payment rows themselves — that is the table with the references on it —
     * plus the order numbers and `paid_minor` they belong to. Loading the orders separately
     * keeps the comparison honest: if it were a join, a missing order would quietly vanish
     * instead of showing up as a payment against nothing.
     */
    public function ledger(): PaymentLedger
    {
        if ($this->cachedLedger !== null) {
            return $this->cachedLedger;
        }

        $payments = Payment::query()
            ->with(['order'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(500)
            ->get();

        $numbers = $payments->pluck('order.number')->filter()->unique()->all();

        $orders = [];

        foreach (Order::query()->whereIn('number', $numbers)->get() as $order) {
            $orders[(string) $order->number] = [
                'total' => (int) $order->grand_total_minor,
                'recorded' => (int) $order->paid_minor,
            ];
        }

        $rows = [];

        foreach ($payments as $payment) {
            $rows[] = [
                'id' => $payment->id,
                'order' => (string) ($payment->order?->number ?? ''),
                'gateway' => (string) $payment->gateway,
                'reference' => $payment->reference,
                'amount' => (int) $payment->amount_minor,
                'status' => (string) $payment->status,
                'paid_at' => $payment->paid_at?->toIso8601String(),
            ];
        }

        return $this->cachedLedger = new PaymentLedger($rows, $orders);
    }

    /**
     * The table.
     *
     * Filtering runs in SQL because a payment does not need folding — one row is one payment.
     * The only scope that cannot be expressed as a column comparison is drift, so it falls
     * back to filtering the ledger's own verdict.
     *
     * @return LengthAwarePaginator<int, Payment>
     */
    public function payments(): LengthAwarePaginator
    {
        $query = Payment::query()
            ->with(['order'])
            ->when($this->search !== '', function (Builder $query): void {
                $term = '%'.trim($this->search).'%';

                $query->where(function (Builder $inner) use ($term): void {
                    $inner->where('reference', 'like', $term)
                        ->orWhere('gateway', 'like', $term)
                        ->orWhereHas('order', static fn (Builder $order) => $order->where('number', 'like', $term));
                });
            })
            ->when($this->scope === 'awaiting', fn (Builder $query) => $query
                ->where('status', 'pending')
                ->where('gateway', '<>', 'cod'))
            ->when($this->scope === 'cod', fn (Builder $query) => $query
                ->where('gateway', 'cod')
                ->where('status', 'pending'));

        if ($this->scope === 'drift' || $this->scope === 'duplicates') {
            // Neither is a column comparison: both are facts about the set of rows, so the ids
            // come from the ledger's verdict. The set is bounded by the ledger's own limit.
            $wanted = $this->scope === 'drift' ? PaymentLedger::DRIFT : PaymentLedger::DUPLICATE;
            $ids = [];

            foreach ($this->ledger()->states() as $id => $state) {
                if ($state === $wanted) {
                    $ids[] = $id;
                }
            }

            $query->whereIn('id', $ids === [] ? [0] : $ids);
        }

        return $query->orderByDesc('created_at')->orderByDesc('id')->paginate(20);
    }

    public function money(int $minor): string
    {
        return Money::ofMinor($minor, 'PKR')->format();
    }

    public function render(): View
    {
        $ledger = $this->ledger();

        return view('livewire.admin.commerce.payments-index', [
            'payments' => $this->payments(),
            'summary' => $ledger->summary(),
            'warnings' => $ledger->warnings(),
            'states' => $ledger->states(),
            'differences' => collect($ledger->byOrder())->keyBy('order')->map(fn (array $row): int => $row['difference']),
        ]);
    }
}
