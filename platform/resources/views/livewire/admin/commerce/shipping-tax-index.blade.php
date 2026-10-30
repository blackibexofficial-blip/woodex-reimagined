<div>
    <x-admin.page-header
        title="Shipping & tax"
        description="The two charges a customer can check with a calculator. The rules are shown as they are, then every order is audited against them — an order older than a rule is fine, an order that never matched it is not."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Shipping & tax' => null]"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat
            label="Tax rate"
            :value="number_format($taxBp / 100, 2).'%'"
            icon="percent"
            hint="on goods, exclusive of delivery"
        />
        <x-admin.stat
            label="Delivery"
            :value="number_format(intdiv($delivery->baseRate->minor, 100))"
            icon="globe"
            :hint="'PKR · free over '.number_format(intdiv($delivery->freeOver?->minor ?? 0, 100))"
        />
        <x-admin.stat
            label="Tax collected"
            :value="number_format(intdiv($summary['tax'], 100))"
            icon="wallet"
            :hint="'effective '.number_format($summary['effective_bp'] / 100, 2).'% of net'"
            :tone="$summary['tax_errors'] > 0 ? 'error' : 'success'"
        />
        <x-admin.stat
            label="Delivery charged"
            :value="number_format(intdiv($summary['shipping'], 100))"
            icon="invoice"
            :hint="$summary['free'].' orders delivered free'"
            :tone="$summary['shipping_errors'] > 0 ? 'warning' : 'success'"
        />
    </div>

    @if ($warnings !== [])
        <div class="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-5 py-4 dark:border-warning-500/30 dark:bg-warning-500/10">
            <div class="flex gap-3">
                <x-icon name="alert" class="mt-0.5 size-5 shrink-0 text-warning-600" />
                <div class="space-y-1">
                    @foreach ($warnings as $warning)
                        <p class="text-theme-sm text-warning-700 dark:text-warning-300">{{ $warning }}</p>
                    @endforeach
                </div>
            </div>
        </div>
    @endif

    <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 class="text-theme-sm font-semibold text-gray-800 dark:text-white/90">Orders that disagree with the rule</h2>
        <select wire:model.live="scope" aria-label="Show"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="all">Tax and delivery</option>
            <option value="tax">Tax only</option>
            <option value="shipping">Delivery only</option>
        </select>
    </div>

    <x-admin.card :padding="false" class="mt-3">
        @if ($mismatches->isEmpty())
            <x-admin.empty
                icon="check-circle"
                title="Every order matches the rule"
                description="No order carries tax the rate does not produce, and none was charged delivery at or above the free threshold. That is what this page looks like when nothing is wrong."
            />
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-theme-sm">
                    <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        <tr>
                            <th class="px-5 py-3 font-medium">Order</th>
                            <th class="px-3 py-3 font-medium">Charge</th>
                            <th class="px-3 py-3 text-right font-medium">Net goods</th>
                            <th class="px-3 py-3 text-right font-medium">Charged</th>
                            <th class="px-3 py-3 text-right font-medium">Rule says</th>
                            <th class="px-5 py-3 text-right font-medium">Difference</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        @foreach ($mismatches as $row)
                            <tr wire:key="{{ $row['kind'] }}-{{ $row['order'] }}">
                                <td class="px-5 py-3 font-mono text-theme-xs text-gray-800 dark:text-white/90">{{ $row['order'] }}</td>
                                <td class="px-3 py-3">
                                    <x-admin.badge :tone="$row['kind'] === 'tax' ? 'warning' : 'info'">{{ $row['kind'] === 'tax' ? 'Tax' : 'Delivery' }}</x-admin.badge>
                                </td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-500">{{ $this->money((int) $row['net']) }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-800 dark:text-white/90">{{ $this->money((int) $row['charged']) }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{{ $this->money((int) $row['expected']) }}</td>
                                <td class="px-5 py-3 text-right tabular-nums {{ $row['difference'] > 0 ? 'text-warning-600' : 'text-error-600' }}">
                                    {{ $row['difference'] > 0 ? '+' : '−' }}{{ $this->money(abs((int) $row['difference'])) }}
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            <div class="border-t border-gray-100 px-5 py-3 text-theme-xs text-gray-500 dark:border-gray-800">
                A positive difference means the shop charged more than the rule; a negative one means it charged less.
            </div>
        @endif
    </x-admin.card>

    <p class="mt-3 text-theme-xs text-gray-500">
        Rates are set in configuration and applied at checkout; each order keeps the numbers it
        was given. Changing a rate here would rewrite history, so it is not offered — the values
        live in <span class="font-mono">CartService</span> and are changed deliberately, with a deploy.
    </p>
</div>
