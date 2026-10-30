<div>
    <x-admin.page-header
        title="Customers"
        description="Who ordered, folded together by phone number. There is no customer account in a cash-on-delivery shop, so the number the rider calls is the identity — and +92 300 1234567 is the same person as 0300-1234567."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Customers' => null]"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat
            label="Customers"
            :value="$summary['customers']"
            icon="users"
            :hint="$summary['orders'].' orders between them'"
        />
        <x-admin.stat
            label="Came back"
            :value="$summary['repeat'].' ('.$summary['repeat_rate'].'%)'"
            icon="refresh"
            hint="more than one order"
            :tone="$summary['repeat'] > 0 ? 'success' : 'neutral'"
        />
        <x-admin.stat
            label="Lifetime value"
            :value="number_format(intdiv($summary['lifetime'], 100))"
            icon="wallet"
            hint="PKR ordered, net of refunds"
        />
        <x-admin.stat
            label="Outstanding"
            :value="number_format(intdiv($summary['outstanding'], 100))"
            icon="invoice"
            hint="PKR still owed by them"
            :tone="$summary['outstanding'] > 0 ? 'warning' : 'success'"
        />
    </div>

    @if ($conflicts > 0 || $summary['unidentified'] > 0)
        <div class="mt-4 rounded-xl border border-info-200 bg-info-50 px-5 py-4 dark:border-info-500/30 dark:bg-info-500/10">
            <div class="flex gap-3">
                <x-icon name="info" class="mt-0.5 size-5 shrink-0 text-info-600" />
                <div class="space-y-1 text-theme-sm text-info-700 dark:text-info-300">
                    @if ($conflicts > 0)
                        <p>
                            {{ $conflicts }} {{ $conflicts === 1 ? 'number appears' : 'numbers appear' }} under more than one name.
                            Usually a typo at checkout — occasionally a household or a shop sharing a line, which is worth knowing before the rider is sent out.
                        </p>
                    @endif
                    @if ($summary['unidentified'] > 0)
                        <p>
                            {{ $summary['unidentified'] }} {{ $summary['unidentified'] === 1 ? 'order has' : 'orders have' }} no phone number and
                            {{ $summary['unidentified'] === 1 ? 'is' : 'are' }} not counted as a customer above. They are still orders and still need delivering.
                        </p>
                    @endif
                </div>
            </div>
        </div>
    @endif

    <div class="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative flex-1">
            <x-icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
                type="search"
                wire:model.live.debounce.300ms="search"
                placeholder="Name, phone or city…"
                class="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-theme-sm text-gray-800 placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                aria-label="Search customers"
            >
        </div>

        <select wire:model.live="scope" aria-label="Show"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="all">All customers</option>
            <option value="repeat">Came back</option>
            <option value="owing">Owe us money</option>
            <option value="disputes">More than one name</option>
        </select>

        <select wire:model.live="sort" aria-label="Sort by"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="value">Highest value</option>
            <option value="recent">Most recent</option>
            <option value="orders">Most orders</option>
        </select>
    </div>

    <x-admin.card :padding="false">
        @if ($customers->isEmpty())
            <x-admin.empty
                icon="users"
                title="No customers here"
                description="Nothing matches this filter. A customer appears as soon as an order carries a phone number — orders placed at a showroom or over the phone may not have one."
            />
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-theme-sm">
                    <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        <tr>
                            <th class="px-5 py-3 font-medium">Customer</th>
                            <th class="px-3 py-3 font-medium">Phone</th>
                            <th class="px-3 py-3 font-medium">City</th>
                            <th class="px-3 py-3 text-right font-medium">Orders</th>
                            <th class="px-3 py-3 text-right font-medium">Lifetime</th>
                            <th class="px-3 py-3 text-right font-medium">Owing</th>
                            <th class="px-5 py-3 font-medium">Last order</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        @foreach ($customers as $customer)
                            <tr wire:key="customer-{{ $customer->phone }}">
                                <td class="px-5 py-3">
                                    <div class="flex items-center gap-2">
                                        <span class="text-gray-800 dark:text-white/90">{{ $customer->name }}</span>
                                        @if ($customer->isRepeat())
                                            <x-admin.badge tone="success">repeat</x-admin.badge>
                                        @endif
                                        @if ($customer->hasNameConflict())
                                            <x-admin.badge tone="warning">also {{ $customer->aliases[0] }}</x-admin.badge>
                                        @endif
                                    </div>
                                    @if ($customer->hasNameConflict())
                                        <div class="mt-0.5 text-theme-xs text-gray-400">
                                            one number, {{ count($customer->aliases) + 1 }} names
                                        </div>
                                    @endif
                                </td>
                                <td class="px-3 py-3 font-mono text-theme-xs {{ $customer->isReachable() ? 'text-gray-600 dark:text-gray-300' : 'text-error-600' }}">
                                    {{ $customer->displayPhone() }}
                                    @unless ($customer->isReachable())
                                        <div class="font-sans text-theme-xs">cannot be dialled</div>
                                    @endunless
                                </td>
                                <td class="px-3 py-3 text-gray-500">{{ $customer->city ?? '—' }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{{ $customer->orders }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-800 dark:text-white/90">
                                    {{ $this->money($customer->lifetimeMinor) }}
                                </td>
                                <td class="px-3 py-3 text-right tabular-nums {{ $customer->outstandingMinor() > 0 ? 'font-semibold text-warning-600' : 'text-gray-400' }}">
                                    {{ $customer->outstandingMinor() > 0 ? $this->money($customer->outstandingMinor()) : '—' }}
                                </td>
                                <td class="px-5 py-3 text-gray-500">
                                    {{ $customer->lastAt === null ? '—' : \Illuminate\Support\Carbon::parse($customer->lastAt)->format('j M Y') }}
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            <div class="border-t border-gray-100 px-5 py-3 text-theme-xs text-gray-500 dark:border-gray-800">
                {{ $customers->count() }} of {{ $summary['customers'] }} shown.
                Lifetime value is what they ordered, net of refunds — not what they paid.
            </div>
        @endif
    </x-admin.card>
</div>
