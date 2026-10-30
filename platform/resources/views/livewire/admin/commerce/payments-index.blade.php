<div>
    <x-admin.page-header
        title="Payments"
        description="What actually arrived, against what the orders say arrived. The two are written by different code, so this screen compares them and names the orders where they disagree."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Payments' => null]"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat
            label="Received"
            :value="number_format(intdiv($summary['received'], 100))"
            icon="banknote"
            hint="PKR confirmed"
        />
        <x-admin.stat
            label="Awaiting a check"
            :value="$summary['pending']"
            icon="clock"
            :hint="number_format(intdiv($summary['pending_amount'], 100)).' PKR in bank transfers'"
            :tone="$summary['pending'] > 0 ? 'warning' : 'success'"
        />
        <x-admin.stat
            label="Bookkeeping drift"
            :value="$summary['drift']"
            icon="alert"
            hint="orders whose payments disagree"
            :tone="$summary['drift'] > 0 ? 'error' : 'success'"
        />
        <x-admin.stat
            label="Cash on delivery"
            :value="number_format(intdiv($summary['cod_pending'], 100))"
            icon="wallet"
            hint="PKR to collect at the door"
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
                placeholder="Order, reference or gateway…"
                class="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-theme-sm text-gray-800 placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                aria-label="Search payments"
            >
        </div>

        <select wire:model.live="scope" aria-label="Show"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="all">Every payment</option>
            <option value="awaiting">Waiting to be checked</option>
            <option value="drift">Does not match the order</option>
            <option value="duplicates">Repeated reference</option>
            <option value="cod">Cash to collect</option>
        </select>
    </div>

    <x-admin.card :padding="false">
        @if ($payments->isEmpty())
            <x-admin.empty
                icon="banknote"
                title="No payments here"
                description="Nothing matches this filter. A payment row is written when an order is placed, so an empty list means no orders matched — not that money is missing."
            />
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-theme-sm">
                    <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        <tr>
                            <th class="px-5 py-3 font-medium">Order</th>
                            <th class="px-3 py-3 font-medium">Gateway</th>
                            <th class="px-3 py-3 font-medium">Reference</th>
                            <th class="px-3 py-3 text-right font-medium">Amount</th>
                            <th class="px-3 py-3 font-medium">Status</th>
                            <th class="px-3 py-3 font-medium">Check</th>
                            <th class="px-5 py-3 font-medium">When</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        @foreach ($payments as $payment)
                            @php($state = $states[$payment->id] ?? null)
                            <tr wire:key="payment-{{ $payment->id }}">
                                <td class="px-5 py-3">
                                    @if ($payment->order !== null)
                                        <a href="{{ route('admin.commerce.orders.show', $payment->order) }}"
                                           class="font-mono text-theme-xs text-navy-600 hover:underline dark:text-navy-300">
                                            {{ $payment->order->number }}
                                        </a>
                                        @php($difference = $differences[$payment->order->number] ?? 0)
                                        @if ($difference !== 0)
                                            <div class="text-theme-xs text-error-600">
                                                {{ $difference > 0 ? 'payments exceed' : 'payments fall short of' }} the recorded
                                                total by {{ $this->money(abs($difference)) }}
                                            </div>
                                        @endif
                                    @else
                                        <span class="text-gray-400">—</span>
                                    @endif
                                </td>
                                <td class="px-3 py-3 text-gray-700 dark:text-gray-200">{{ $payment->gateway }}</td>
                                <td class="px-3 py-3 font-mono text-theme-xs text-gray-500">{{ $payment->reference ?? '—' }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-800 dark:text-white/90">
                                    {{ $this->money((int) $payment->amount_minor) }}
                                </td>
                                <td class="px-3 py-3">
                                    @switch($payment->status)
                                        @case('paid')
                                            <x-admin.badge tone="success">Paid</x-admin.badge>
                                            @break
                                        @case('failed')
                                            <x-admin.badge tone="error">Failed</x-admin.badge>
                                            @break
                                        @case('refunded')
                                            <x-admin.badge tone="neutral">Refunded</x-admin.badge>
                                            @break
                                        @default
                                            <x-admin.badge tone="info">Pending</x-admin.badge>
                                    @endswitch
                                </td>
                                <td class="px-3 py-3">
                                    @switch($state)
                                        @case('awaiting')
                                            <x-admin.badge tone="warning">Awaiting a check</x-admin.badge>
                                            @break
                                        @case('duplicate')
                                            <x-admin.badge tone="error">Repeated reference</x-admin.badge>
                                            @break
                                        @case('drift')
                                            <x-admin.badge tone="error">Does not match</x-admin.badge>
                                            @break
                                        @case('overpaid')
                                            <x-admin.badge tone="warning">Overpaid</x-admin.badge>
                                            @break
                                        @default
                                            <span class="text-theme-xs text-gray-400">agrees with the order</span>
                                    @endswitch
                                </td>
                                <td class="px-5 py-3 text-gray-500">
                                    {{ $payment->paid_at?->format('j M Y') ?? $payment->created_at?->format('j M Y') ?? '—' }}
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            <div class="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
                {{ $payments->links() }}
            </div>
        @endif
    </x-admin.card>

    <p class="mt-3 text-theme-xs text-gray-500">
        Confirming a bank transfer is a separate, permissioned action taken with the statement
        open — it moves money and changes an invoice, so it is not a table row you can click.
    </p>
</div>
