<div>
    <x-admin.page-header
        title="Refunds & returns"
        description="Money that went back out. A refund is two numbers on the order and nothing else, so this page checks them against each other rather than listing them."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Refunds & returns' => null]"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat
            label="Refunded"
            :value="number_format(intdiv($summary['refunded'], 100))"
            icon="rotate-ccw"
            :hint="'PKR across '.$summary['count'].' orders'"
        />
        <x-admin.stat
            label="Refund rate"
            :value="number_format($summary['rate_bp'] / 100, 2).'%'"
            icon="percent"
            hint="of everything paid"
            :tone="$summary['rate_bp'] > 500 ? 'warning' : 'success'"
        />
        <x-admin.stat
            label="Partial"
            :value="$summary['partial']"
            icon="refresh"
            hint="part of the money returned"
        />
        <x-admin.stat
            label="Money held"
            :value="$summary['cancelled_unpaid']"
            icon="alert"
            hint="cancelled orders not refunded"
            :tone="$summary['cancelled_unpaid'] > 0 ? 'error' : 'success'"
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

    <div class="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative flex-1">
            <x-icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
                type="search"
                wire:model.live.debounce.300ms="search"
                placeholder="Order number…"
                class="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-theme-sm text-gray-800 placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                aria-label="Search refunds"
            >
        </div>

        <select wire:model.live="scope" aria-label="Show"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="all">Every refund and cancellation</option>
            <option value="over">Refunded more than paid</option>
            <option value="cancelled">Cancelled, money held</option>
            <option value="partial">Partially refunded</option>
            <option value="full">Fully refunded</option>
        </select>
    </div>

    <x-admin.card :padding="false">
        @if ($rows->isEmpty())
            <x-admin.empty
                icon="rotate-ccw"
                title="Nothing to reconcile"
                description="No refunds or cancellations in this view. That is a good sign — this page only has work on it when money went back out."
            />
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-theme-sm">
                    <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        <tr>
                            <th class="px-5 py-3 font-medium">Order</th>
                            <th class="px-3 py-3 text-right font-medium">Order total</th>
                            <th class="px-3 py-3 text-right font-medium">Paid</th>
                            <th class="px-3 py-3 text-right font-medium">Refunded</th>
                            <th class="px-3 py-3 font-medium">Order status</th>
                            <th class="px-5 py-3 font-medium">Reconciliation</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        @foreach ($rows as $row)
                            @php($state = $this->stateOf($row))
                            <tr wire:key="refund-{{ $row['order'] }}">
                                <td class="px-5 py-3 font-mono text-theme-xs text-gray-800 dark:text-white/90">{{ $row['order'] }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-500">{{ $this->money($row['total']) }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{{ $this->money($row['paid']) }}</td>
                                <td class="px-3 py-3 text-right tabular-nums {{ $row['refunded'] > 0 ? 'font-semibold text-gray-800 dark:text-white/90' : 'text-gray-400' }}">
                                    {{ $row['refunded'] > 0 ? $this->money($row['refunded']) : '—' }}
                                </td>
                                <td class="px-3 py-3 text-gray-500">{{ $row['status'] }}</td>
                                <td class="px-5 py-3">
                                    @switch($state)
                                        @case('over')
                                            <x-admin.badge tone="error">Refunded more than paid</x-admin.badge>
                                            <div class="mt-1 text-theme-xs text-error-600">
                                                {{ $this->money($row['refunded'] - $row['paid']) }} more than ever arrived
                                            </div>
                                            @break
                                        @case('held')
                                            <x-admin.badge tone="error">Cancelled, money held</x-admin.badge>
                                            <div class="mt-1 text-theme-xs text-error-600">
                                                {{ $this->money($row['paid']) }} still with us
                                            </div>
                                            @break
                                        @case('open')
                                            <x-admin.badge tone="warning">Refunded, still live</x-admin.badge>
                                            <div class="mt-1 text-theme-xs text-warning-600">This order is still marked for delivery</div>
                                            @break
                                        @case('partial')
                                            <x-admin.badge tone="info">Partially refunded</x-admin.badge>
                                            @break
                                        @default
                                            <x-admin.badge tone="success">Refunded in full</x-admin.badge>
                                    @endswitch
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            <div class="border-t border-gray-100 px-5 py-3 text-theme-xs text-gray-500 dark:border-gray-800">
                {{ $rows->count() }} of {{ $total }} orders that have money back or money held.
            </div>
        @endif
    </x-admin.card>

    <p class="mt-3 text-theme-xs text-gray-500">
        A refund is never issued from this page. Returning money is a permissioned action that
        records who authorised it and why — the reason is the part an accountant asks for.
    </p>
</div>
