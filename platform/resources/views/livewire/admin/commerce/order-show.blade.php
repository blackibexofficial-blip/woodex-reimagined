<div>
    <x-admin.page-header
        :title="$order->number"
        :description="'Placed '.($order->placed_at?->format('d M Y, H:i') ?? '—').' · '.strtoupper($order->source)"
        :breadcrumbs="[
            'Commerce' => route('admin.commerce.dashboard'),
            'Orders' => route('admin.commerce.orders'),
            $order->number => null,
        ]"
    >
        <x-slot:actions>
            @if ($canManage && $next)
                <button type="button" wire:click="advance" wire:loading.attr="disabled"
                        class="inline-flex h-9 items-center rounded-lg bg-navy-900 px-4 text-theme-sm font-medium text-white hover:bg-navy-800 disabled:opacity-60">
                    Mark {{ strtolower($labels[$next] ?? $next) }}
                </button>
            @endif
        </x-slot:actions>
    </x-admin.page-header>

    @if ($errors->any())
        <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-theme-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {{ $errors->first() }}
        </div>
    @endif

    <div class="grid gap-4 lg:grid-cols-3">
        {{-- Lines --}}
        <div class="lg:col-span-2">
            <x-admin.card :padding="false">
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-theme-sm">
                        <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                            <tr>
                                <th class="px-5 py-3 font-medium">Item</th>
                                <th class="px-3 py-3 text-right font-medium">Qty</th>
                                <th class="px-3 py-3 text-right font-medium">Unit</th>
                                <th class="px-3 py-3 text-right font-medium">Discount</th>
                                <th class="px-3 py-3 text-right font-medium">Tax</th>
                                <th class="px-5 py-3 text-right font-medium">Line total</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            @foreach ($order->items as $item)
                                <tr wire:key="line-{{ $item->id }}">
                                    <td class="px-5 py-3">
                                        <p class="font-medium text-navy-900 dark:text-white">{{ $item->name }}</p>
                                        <p class="text-theme-xs text-gray-500">{{ $item->sku }}</p>
                                    </td>
                                    <td class="px-3 py-3 text-right">{{ $item->qty }}</td>
                                    <td class="px-3 py-3 text-right">{{ number_format($item->unit_price_minor / 100) }}</td>
                                    <td class="px-3 py-3 text-right text-wood-700 dark:text-wood-300">
                                        {{ $item->line_discount_minor > 0 ? '−'.number_format($item->line_discount_minor / 100) : '—' }}
                                    </td>
                                    <td class="px-3 py-3 text-right text-gray-500">
                                        {{ number_format($item->line_tax_minor / 100) }}
                                        <span class="text-theme-xs">({{ $item->tax_rate_bp / 100 }}%)</span>
                                    </td>
                                    <td class="px-5 py-3 text-right font-medium text-navy-900 dark:text-white">
                                        {{ number_format($item->line_total_minor / 100) }}
                                    </td>
                                </tr>
                            @endforeach
                        </tbody>
                        <tfoot class="border-t border-gray-100 text-theme-sm dark:border-gray-800">
                            <tr>
                                <td colspan="5" class="px-5 py-2 text-right text-gray-500">Subtotal</td>
                                <td class="px-5 py-2 text-right">{{ number_format($order->subtotal_minor / 100) }}</td>
                            </tr>
                            @if ($order->discount_minor > 0)
                                <tr>
                                    <td colspan="5" class="px-5 py-2 text-right text-gray-500">
                                        Discount{{ $order->coupon_code ? ' ('.$order->coupon_code.')' : '' }}
                                    </td>
                                    <td class="px-5 py-2 text-right text-wood-700 dark:text-wood-300">−{{ number_format($order->discount_minor / 100) }}</td>
                                </tr>
                            @endif
                            <tr>
                                <td colspan="5" class="px-5 py-2 text-right text-gray-500">Tax</td>
                                <td class="px-5 py-2 text-right">{{ number_format($order->tax_minor / 100) }}</td>
                            </tr>
                            <tr>
                                <td colspan="5" class="px-5 py-2 text-right text-gray-500">Delivery</td>
                                <td class="px-5 py-2 text-right">{{ number_format($order->shipping_minor / 100) }}</td>
                            </tr>
                            <tr class="border-t border-gray-100 dark:border-gray-800">
                                <td colspan="5" class="px-5 py-3 text-right font-medium text-navy-900 dark:text-white">Total</td>
                                <td class="px-5 py-3 text-right font-heading text-lg text-navy-900 dark:text-white">
                                    ₨ {{ number_format($order->grand_total_minor / 100) }}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </x-admin.card>
        </div>

        {{-- Status, payment, address, timeline --}}
        <div class="space-y-4">
            <x-admin.card>
                <h2 class="mb-3 font-heading text-lg text-navy-900 dark:text-white">Status</h2>
                <dl class="space-y-2 text-theme-sm">
                    <div class="flex justify-between gap-3">
                        <dt class="text-gray-500">Order</dt>
                        <dd class="font-medium text-navy-900 dark:text-white">{{ $labels[$order->status] ?? $order->status }}</dd>
                    </div>
                    <div class="flex justify-between gap-3">
                        <dt class="text-gray-500">Payment</dt>
                        <dd class="font-medium">{{ ucfirst($order->payment_status) }}</dd>
                    </div>
                    <div class="flex justify-between gap-3">
                        <dt class="text-gray-500">Fulfilment</dt>
                        <dd class="font-medium">{{ ucfirst($order->fulfilment_status) }}</dd>
                    </div>
                    <div class="flex justify-between gap-3">
                        <dt class="text-gray-500">Paid</dt>
                        <dd class="font-medium">
                            ₨ {{ number_format($order->paid_minor / 100) }}
                            @if ($order->amountDueMinor() > 0)
                                <span class="block text-theme-xs text-amber-600">₨ {{ number_format($order->amountDueMinor() / 100) }} due</span>
                            @endif
                        </dd>
                    </div>
                </dl>

                @if ($canManage && $canCancel)
                    <div class="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
                        <label for="cancelReason" class="mb-1.5 block text-theme-xs font-medium uppercase tracking-wide text-gray-500">
                            Cancel this order
                        </label>
                        <div class="flex gap-2">
                            <input id="cancelReason" type="text" wire:model="cancelReason"
                                   placeholder="Reason (written to the history)"
                                   class="h-9 flex-1 rounded-lg border border-gray-300 px-2 text-theme-sm dark:border-gray-700 dark:bg-gray-900">
                            <button type="button" wire:click="cancel" wire:loading.attr="disabled"
                                    class="h-9 shrink-0 rounded-lg border border-red-300 px-3 text-theme-sm text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-500/40 dark:text-red-300">
                                Cancel
                            </button>
                        </div>
                        <p class="mt-1.5 text-theme-xs text-gray-400">Cancelling puts the stock back and closes the payment.</p>
                    </div>
                @endif
            </x-admin.card>

            @php($address = $order->addresses->firstWhere('type', 'shipping'))
            @if ($address)
                <x-admin.card>
                    <h2 class="mb-3 font-heading text-lg text-navy-900 dark:text-white">Delivering to</h2>
                    <p class="text-theme-sm font-medium text-navy-900 dark:text-white">{{ $address->name }}</p>
                    <p class="mt-1 text-theme-sm text-gray-600 dark:text-gray-300">{{ $address->oneLine() }}</p>
                    <a href="tel:{{ $address->phone }}" class="mt-2 inline-block text-theme-sm text-wood-700 dark:text-wood-300">{{ $address->phone }}</a>
                </x-admin.card>
            @endif

            <x-admin.card>
                <h2 class="mb-3 font-heading text-lg text-navy-900 dark:text-white">History</h2>
                <ol class="space-y-3">
                    @foreach ($order->history as $entry)
                        <li wire:key="history-{{ $entry->id }}" class="border-l-2 border-wood-200 pl-3 dark:border-wood-500/30">
                            <p class="text-theme-sm text-navy-900 dark:text-white">
                                {{ $entry->from_status ? ($labels[$entry->from_status] ?? $entry->from_status).' → ' : '' }}{{ $labels[$entry->to_status] ?? $entry->to_status }}
                            </p>
                            <p class="text-theme-xs text-gray-500">{{ $entry->created_at?->format('d M Y, H:i') }}</p>
                            @if ($entry->note)
                                <p class="mt-0.5 text-theme-xs text-gray-500">{{ $entry->note }}</p>
                            @endif
                        </li>
                    @endforeach
                </ol>
            </x-admin.card>
        </div>
    </div>
</div>
