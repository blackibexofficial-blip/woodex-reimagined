<div>
    <x-admin.page-header
        title="Reports"
        description="Sales over a period, with one definition of revenue: what was ordered, minus discounts, minus refunds. Tax belongs to the government and delivery pays for a van, so neither is counted here."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Reports' => null]"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat label="Revenue" :value="number_format(intdiv($summary['revenue'], 100))" icon="trending-up" :hint="'PKR · '.$summary['days'].' trading days'" />
        <x-admin.stat label="Orders" :value="$summary['orders']" icon="invoice" :hint="$summary['units'].' units'" />
        <x-admin.stat label="Average order" :value="number_format(intdiv($summary['average_order'], 100))" icon="wallet" hint="PKR per order" />
        <x-admin.stat
            label="Best day"
            :value="$summary['best_day'] === null ? '—' : \Illuminate\Support\Carbon::parse($summary['best_day'])->format('j M')"
            icon="chart"
            :hint="$summary['best_day'] === null ? 'no trading yet' : number_format(intdiv($summary['best_day_revenue'], 100)).' PKR'"
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

    <div class="mt-6 flex flex-wrap items-center gap-2">
        @foreach ([7 => 'Last 7 days', 30 => 'Last 30 days', 90 => 'Last 90 days'] as $value => $label)
            <button
                wire:click="$set('range', '{{ $value }}')"
                type="button"
                class="h-9 rounded-lg border px-3 text-theme-sm font-medium transition
                    {{ $days !== [] && (int) $range === $value
                        ? 'border-navy-500 bg-navy-500 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200' }}"
            >
                {{ $label }}
            </button>
        @endforeach
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <x-admin.card :padding="false">
            <div class="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                <h2 class="text-theme-sm font-semibold text-gray-800 dark:text-white/90">Revenue by day</h2>
                <p class="mt-0.5 text-theme-xs text-gray-500">Only days that traded appear. A gap is a closed shop, not a zero.</p>
            </div>

            @if ($days === [])
                <x-admin.empty icon="chart" title="No sales in this period" description="Nothing traded in the selected window. Orders placed before it are still counted on the dashboard." />
            @else
                <ul class="divide-y divide-gray-100 dark:divide-gray-800">
                    @foreach ($days as $day)
                        <li class="px-5 py-2.5">
                            <div class="flex items-baseline justify-between gap-3">
                                <span class="text-theme-sm text-gray-700 dark:text-gray-200">{{ \Illuminate\Support\Carbon::parse($day['date'])->format('D j M') }}</span>
                                <span class="tabular-nums text-theme-sm text-gray-800 dark:text-white/90">{{ $this->money($day['revenue']) }}</span>
                            </div>
                            <div class="mt-1.5 flex items-center gap-2">
                                <div class="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-800">
                                    <div class="h-1.5 rounded-full bg-navy-500" style="width: {{ max(2, (int) round($day['revenue'] * 100 / $peak)) }}%"></div>
                                </div>
                                <span class="w-16 text-right text-theme-xs text-gray-400">{{ $day['orders'] }} {{ $day['orders'] === 1 ? 'order' : 'orders' }}</span>
                            </div>
                        </li>
                    @endforeach
                </ul>
            @endif
        </x-admin.card>

        <x-admin.card :padding="false">
            <div class="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                <h2 class="text-theme-sm font-semibold text-gray-800 dark:text-white/90">What sold</h2>
                <p class="mt-0.5 text-theme-xs text-gray-500">By product, largest first. Ten rows is what anybody reads.</p>
            </div>

            @if ($products === [])
                <x-admin.empty icon="archive" title="Nothing sold yet" description="No order lines in this period." />
            @else
                <table class="w-full text-left text-theme-sm">
                    <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        <tr>
                            <th class="px-5 py-2.5 font-medium">Product</th>
                            <th class="px-3 py-2.5 text-right font-medium">Units</th>
                            <th class="px-5 py-2.5 text-right font-medium">Revenue</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        @foreach ($products as $product)
                            <tr>
                                <td class="px-5 py-2.5">
                                    <div class="text-gray-800 dark:text-white/90">{{ $product['key'] }}</div>
                                    <div class="mt-1 h-1 w-full max-w-40 rounded-full bg-gray-100 dark:bg-gray-800">
                                        <div class="h-1 rounded-full bg-wood-500" style="width: {{ max(3, (int) round($product['share_bp'] / 100)) }}%"></div>
                                    </div>
                                </td>
                                <td class="px-3 py-2.5 text-right tabular-nums text-gray-500">{{ $product['units'] }}</td>
                                <td class="px-5 py-2.5 text-right tabular-nums text-gray-800 dark:text-white/90">{{ $this->money($product['revenue']) }}</td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            @endif
        </x-admin.card>
    </div>

    <p class="mt-3 text-theme-xs text-gray-500">
        {{ number_format(intdiv($refunded, 100)) }} PKR was refunded in this period. Refunds are an
        order-level number, so they are reported here rather than pushed down onto product lines
        where they would be an invented allocation.
    </p>
</div>
