<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Customers\CustomerLedger;
use App\Domain\Commerce\Customers\CustomerRecord;
use App\Domain\Commerce\Customers\PhoneNumber;
use App\Domain\Commerce\Support\Money;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Collection;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;

/**
 * The customers the shop has, which is to say: the phone numbers that ordered.
 *
 * There is no customer table, and adding one would be the wrong fix. A cash-on-delivery shop
 * has no accounts — the number the rider calls is the only durable identity, and the schema
 * already stores it on every order. A `customers` table would need to be filled from these
 * same rows, kept in step with them, and would still be wrong the first time somebody typed
 * their number differently.
 *
 * So the list is derived. `CustomerLedger` folds orders into people by normalised phone, which
 * is why `+92 300 1234567` and `0300-1234567` are one customer rather than two. What the screen
 * adds beyond the arithmetic is the three things that are invisible in the orders table: who
 * came back, which numbers carry more than one name, and how much of it is unpaid.
 *
 * Read-only. Editing a customer would mean editing the order they placed, and that is a
 * conversation with the customer, not a text field.
 */
#[Layout('layouts::admin')]
#[Title('Customers')]
class CustomersIndex extends Component
{
    use InteractsWithAdmin;

    #[Url]
    public string $search = '';

    /** all | repeat | owing | disputes */
    #[Url]
    public string $scope = 'all';

    /** value | recent | orders */
    #[Url]
    public string $sort = 'value';

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.customers.view'), 403);
    }

    public function updated(string $property): void
    {
        if (in_array($property, ['search', 'scope', 'sort'], true)) {
            $this->resetPage();
        }
    }

    /**
     * The ledger, built from orders rather than from a table of people.
     *
     * Cancelled orders are excluded: a cancelled order is not a purchase, and counting it
     * would inflate both the lifetime value and the repeat count of somebody who changed
     * their mind. Everything else counts, including orders still awaiting payment — they are
     * real orders with a real customer behind them and a real balance outstanding.
     */
    public function ledger(): CustomerLedger
    {
        $rows = Order::query()
            ->where('status', '<>', 'cancelled')
            ->with(['addresses'])
            ->orderBy('placed_at')
            ->get()
            ->map(static function (Order $order): array {
                // The shipping address is where the customer is; billing is the fallback for
                // orders placed over the phone where only one address was taken down.
                $address = $order->addresses->firstWhere('type', 'shipping')
                    ?? $order->addresses->firstWhere('type', 'billing')
                    ?? $order->addresses->first();

                return [
                    'name' => $address?->name,
                    'phone' => $address?->phone,
                    'city' => $address?->city,
                    'order' => $order->number,
                    'total' => (int) $order->grand_total_minor,
                    'paid' => max(0, (int) $order->paid_minor - (int) $order->refunded_minor),
                    'placed_at' => $order->placed_at?->toIso8601String(),
                ];
            })
            ->all();

        return CustomerLedger::fromOrders($rows);
    }

    /**
     * What the table shows.
     *
     * Filtering happens here rather than in SQL because the grouping that defines a customer
     * only exists after the fold — there is no column to put a `where` on. That is affordable
     * at this shop's volume (thousands of orders, not millions) and the numbers are honest
     * because of it: a filter that ran in SQL would have to pick one row per phone, which is
     * exactly the mistake this screen exists to avoid.
     *
     * @return Collection<int, CustomerRecord>
     */
    public function customers(): Collection
    {
        $ledger = $this->ledger();
        $term = strtolower(trim($this->search));

        $customers = collect($ledger->customers())
            ->when($term !== '', fn (Collection $rows): Collection => $rows->filter(
                static fn (CustomerRecord $customer): bool => str_contains(strtolower($customer->name), $term)
                    || str_contains($customer->phone, preg_replace('/\D+/', '', $term) ?? '')
                    || str_contains(strtolower((string) $customer->city), $term),
            ))
            ->when($this->scope === 'repeat', fn (Collection $rows): Collection => $rows->filter(
                static fn (CustomerRecord $customer): bool => $customer->isRepeat(),
            ))
            ->when($this->scope === 'owing', fn (Collection $rows): Collection => $rows->filter(
                static fn (CustomerRecord $customer): bool => $customer->outstandingMinor() > 0,
            ))
            ->when($this->scope === 'disputes', fn (Collection $rows): Collection => $rows->filter(
                static fn (CustomerRecord $customer): bool => $customer->hasNameConflict(),
            ));

        return match ($this->sort) {
            'recent' => $customers->sortByDesc(static fn (CustomerRecord $customer): string => (string) $customer->lastAt)->values(),
            'orders' => $customers->sortByDesc(static fn (CustomerRecord $customer): int => $customer->orders)->values(),
            default => $customers->values(),
        };
    }

    /** Money for the view, formatted once here rather than in three places in the blade. */
    public function money(int $minor): string
    {
        return Money::ofMinor($minor, 'PKR')->format();
    }

    public function displayPhone(string $phone): string
    {
        return PhoneNumber::format($phone);
    }

    public function render(): View
    {
        $ledger = $this->ledger();

        return view('livewire.admin.commerce.customers-index', [
            'customers' => $this->customers(),
            'summary' => $ledger->summary(),
            'conflicts' => count($ledger->nameConflicts()),
            'unreachable' => count($ledger->unreachable()),
        ]);
    }
}
