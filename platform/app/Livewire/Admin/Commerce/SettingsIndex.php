<?php

declare(strict_types=1);

namespace App\Livewire\Admin\Commerce;

use App\Domain\Commerce\Billing\SequenceHealth;
use App\Domain\Commerce\Checkout\CartService;
use App\Domain\Commerce\Checkout\Models\Invoice;
use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Models\InventorySource;
use App\Domain\Commerce\Support\Money;
use App\Livewire\Concerns\InteractsWithAdmin;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Facades\DB;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

/**
 * The settings that decide what a number looks like and what money is charged.
 *
 * Most of this page is read-only on purpose. A sequence counter, a tax rate and a delivery
 * threshold are the three settings where "just change it" rewrites the meaning of documents
 * that have already gone to customers — so the page shows them, checks them, and leaves the
 * change to a deliberate edit with a deploy behind it.
 *
 * The check that earns the page is the sequence one: the allocator is safe against two
 * checkouts in the same second, but nothing stops a restored backup from pointing a counter at
 * a number that is already in use. That collision is discovered by a customer holding two
 * invoices with the same number, which is the worst possible time to find out.
 */
#[Layout('layouts::admin')]
#[Title('Settings')]
class SettingsIndex extends Component
{
    use InteractsWithAdmin;

    public function mount(): void
    {
        abort_unless($this->user()->can('commerce.settings.manage'), 403);
    }

    /**
     * Every series, checked against the numbers actually issued.
     *
     * `next` is what the allocator will hand out; the highest issued number is read from the
     * orders and invoices themselves rather than stored twice — a counter and a table that
     * agree because one is derived cannot drift.
     */
    public function sequences(): SequenceHealth
    {
        $sequences = DB::table('commerce_sequences')
            ->orderBy('key')
            ->get()
            ->map(static fn ($row): array => [
                'key' => (string) $row->key,
                'prefix' => (string) $row->prefix,
                'next' => (int) $row->next,
                'padding' => (int) $row->padding,
            ])
            ->all();

        $used = [
            'order' => $this->numbersFrom(Order::query()->pluck('number')->all()),
            'invoice' => $this->numbersFrom(Invoice::query()->pluck('number')->all()),
        ];

        return new SequenceHealth($sequences, $used);
    }

    /**
     * The numeric tail of `WDX-000042`, so the comparison is numeric.
     *
     * @param  list<string|null>  $numbers
     * @return list<int>
     */
    private function numbersFrom(array $numbers): array
    {
        $out = [];

        foreach ($numbers as $number) {
            if (preg_match('/(\d+)\s*$/', (string) $number, $matches) === 1) {
                $out[] = (int) $matches[1];
            }
        }

        return $out;
    }

    /** @return array<string, mixed> */
    public function currency(): array
    {
        return [
            'code' => 'PKR',
            'symbol' => '₨',
            'minor_units' => 2,
            'note' => 'Integers everywhere. No float touches a price.',
        ];
    }

    public function money(int $minor): string
    {
        return Money::ofMinor($minor, 'PKR')->format();
    }

    public function render(): View
    {
        $health = $this->sequences();
        $delivery = CartService::cashOnDelivery();

        return view('livewire.admin.commerce.settings-index', [
            'sequences' => $health->rows(),
            'summary' => $health->summary(),
            'warnings' => $health->warnings(),
            'sources' => InventorySource::query()->orderBy('priority')->get(),
            'taxBp' => CartService::DEFAULT_TAX_RATE_BP,
            'delivery' => $delivery,
            'currency' => $this->currency(),
        ]);
    }
}
