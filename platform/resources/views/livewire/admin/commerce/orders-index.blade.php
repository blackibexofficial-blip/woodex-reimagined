<div>
    <x-admin.page-header
        title="Orders"
        description="Money in paisa, copied from the cart when the order was placed — never recalculated from today's prices."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Orders' => null]"
    />

    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative flex-1">
            <x-icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
                type="search"
                wire:model.live.debounce.300ms="search"
                placeholder="Order number, customer or SKU…"
                class="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-theme-sm text-gray-800 placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                aria-label="Search orders"
            >
        </div>

        <select wire:model.live="status" aria-label="Order status"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="">Any status</option>
            @foreach ($statuses as $value => $label)
                <option value="{{ $value }}">{{ $label }}</option>
            @endforeach
        </select>

        <select wire:model.live="payment" aria-label="Payment status"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="">Any payment</option>
            @foreach ($payments as $value => $label)
                <option value="{{ $value }}">{{ $label }}</option>
            @endforeach
        </select>
    </div>

    <x-admin.card :padding="false">
        @if ($orders->isEmpty())
            <x-admin.empty
                icon="archive"
                title="No orders yet"
                description="Orders placed at checkout appear here. Nothing is missing — the table is simply empty."
            />
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-theme-sm">
                    <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        <tr>
                            <th class="px-5 py-3 font-medium">Order</th>
                            <th class="px-3 py-3 font-medium">Placed</th>
                            <th class="px-3 py-3 font-medium">Customer</th>
                            <th class="px-3 py-3 font-medium">Items</th>
                            <th class="px-3 py-3 text-right font-medium">Total</th>
                            <th class="px-3 py-3 font-medium">Payment</th>
                            <th class="px-5 py-3 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        @foreach ($orders as $order)
                            @php($shipping = $order->addresses->firstWhere('type', 'shipping'))
                            <tr wire:key="order-{{ $order->id }}" class="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]">
                                <td class="px-5 py-3">
                                    <a href="{{ route('admin.commerce.orders.show', ['order' => $order->id]) }}"
                                       class="font-medium text-navy-900 hover:text-wood-700 dark:text-white">
                                        {{ $order->number }}
                                    </a>
                                    <p class="text-theme-xs text-gray-500">{{ strtoupper($order->source) }}</p>
                                </td>
                                <td class="px-3 py-3 text-gray-600 dark:text-gray-300">
                                    {{ $order->placed_at?->format('d M Y') ?? '—' }}
                                    <p class="text-theme-xs text-gray-400">{{ $order->placed_at?->format('H:i') }}</p>
                                </td>
                                <td class="px-3 py-3 text-gray-700 dark:text-gray-200">
                                    {{ $shipping?->name ?? '—' }}
                                    <p class="text-theme-xs text-gray-400">{{ $shipping?->city }}</p>
                                </td>
                                <td class="px-3 py-3 text-gray-600 dark:text-gray-300">{{ $order->items->sum('qty') }}</td>
                                <td class="px-3 py-3 text-right font-medium text-navy-900 dark:text-white">
                                    ₨ {{ number_format($order->grand_total_minor / 100) }}
                                </td>
                                <td class="px-3 py-3">
                                    @php($paid = $order->payment_status === \App\Domain\Commerce\Checkout\OrderStatus::PAYMENT_PAID)
                                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-theme-xs {{ $paid ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' }}">
                                        {{ ucfirst($order->payment_status) }}
                                    </span>
                                    <p class="mt-1 text-theme-xs text-gray-400">{{ strtoupper($order->payments->first()?->gateway ?? '—') }}</p>
                                </td>
                                <td class="px-5 py-3">
                                    <span class="text-gray-700 dark:text-gray-200">{{ $statuses[$order->status] ?? $order->status }}</span>
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            <div class="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
                {{ $orders->links() }}
            </div>
        @endif
    </x-admin.card>
</div>
