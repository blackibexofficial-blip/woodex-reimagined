<div>
    <x-admin.page-header
        title="Invoices"
        description="Furniture invoices from the studio ledger, and what is still owed on each. These are the same documents Accounts works from — one sale, one invoice, one set of books."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Invoices' => null]"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat label="Invoices" :value="$summary['count']" icon="file" hint="issued in total" />
        <x-admin.stat label="Paid" :value="number_format(intdiv($summary['paid'], 100))" icon="check-circle" hint="PKR received, net of refunds" />
        <x-admin.stat
            label="Outstanding"
            :value="number_format(intdiv($summary['outstanding'], 100))"
            icon="wallet"
            hint="PKR still owed"
            :tone="$summary['outstanding'] > 0 ? 'warning' : 'success'"
        />
        <x-admin.stat
            label="Overdue"
            :value="number_format(intdiv($summary['overdue'], 100))"
            icon="refresh"
            :hint="$summary['overdue_count'].' past their due date'"
            :tone="$summary['overdue_count'] > 0 ? 'error' : 'success'"
        />
    </div>

    <div class="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative flex-1">
            <x-icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
                type="search"
                wire:model.live.debounce.300ms="search"
                placeholder="Invoice, order, customer or phone…"
                class="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-theme-sm text-gray-800 placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                aria-label="Search invoices"
            >
        </div>

        <select wire:model.live="state" aria-label="Invoice state"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            @foreach ($states as $value => $label)
                <option value="{{ $value }}">{{ $label }}</option>
            @endforeach
        </select>

        <input type="date" wire:model.live="from" aria-label="Issued from"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
        <input type="date" wire:model.live="to" aria-label="Issued to"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
    </div>

    <x-admin.card :padding="false">
        @if ($invoices->isEmpty())
            <x-admin.empty
                icon="file"
                title="No invoices here"
                description="Nothing matches this filter. Orders placed at checkout issue an invoice automatically, so an empty list means no orders matched — not that invoices are missing."
            />
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-theme-sm">
                    <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        <tr>
                            <th class="px-5 py-3 font-medium">Invoice</th>
                            <th class="px-3 py-3 font-medium">Order</th>
                            <th class="px-3 py-3 font-medium">Customer</th>
                            <th class="px-3 py-3 font-medium">Issued</th>
                            <th class="px-3 py-3 text-right font-medium">Total</th>
                            <th class="px-3 py-3 text-right font-medium">Outstanding</th>
                            <th class="px-3 py-3 font-medium">Status</th>
                            <th class="px-5 py-3"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        @foreach ($invoices as $invoice)
                            @php($balance = $this->balance($invoice))
                            <tr wire:key="invoice-{{ $invoice->id }}">
                                <td class="px-5 py-3 font-mono text-theme-xs text-gray-800 dark:text-white/90">{{ $invoice->number }}</td>
                                <td class="px-3 py-3">
                                    @if ($invoice->commerce_order_id !== null)
                                        <a href="{{ route('admin.commerce.orders.show', (int) $invoice->commerce_order_id) }}"
                                           class="font-mono text-theme-xs text-navy-600 hover:underline dark:text-navy-300">
                                            {{ $invoice->order_number }}
                                        </a>
                                    @else
                                        <span class="text-gray-400">—</span>
                                    @endif
                                </td>
                                <td class="px-3 py-3">
                                    {{ $invoice->customer_name ?? '—' }}
                                    @if ($invoice->customer_phone !== null)
                                        <div class="text-theme-xs text-gray-500">{{ $invoice->customer_phone }}</div>
                                    @endif
                                </td>
                                <td class="px-3 py-3 text-gray-500">
                                    {{ $invoice->issue_date?->format('j M Y') ?? '—' }}
                                    @if ($invoice->due_date !== null && $balance->isOverdue())
                                        <div class="text-theme-xs font-medium text-error-600">
                                            {{ $balance->daysOverdue() }} {{ $balance->daysOverdue() === 1 ? 'day' : 'days' }} late
                                        </div>
                                    @elseif ($invoice->due_date !== null)
                                        <div class="text-theme-xs text-gray-400">due {{ $invoice->due_date->format('j M') }}</div>
                                    @endif
                                </td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-800 dark:text-white/90">
                                    {{ \App\Domain\Commerce\Support\Money::ofMinor((int) $invoice->total_minor, (string) ($invoice->currency ?? 'PKR'))->format() }}
                                </td>
                                <td class="px-3 py-3 text-right tabular-nums {{ $balance->outstandingMinor() > 0 ? 'font-semibold text-warning-600' : 'text-gray-400' }}">
                                    {{ $balance->outstandingMinor() > 0
                                        ? \App\Domain\Commerce\Support\Money::ofMinor($balance->outstandingMinor(), (string) ($invoice->currency ?? 'PKR'))->format()
                                        : '—' }}
                                </td>
                                <td class="px-3 py-3">
                                    <x-admin.badge :tone="$balance->tone()">{{ $balance->label() }}</x-admin.badge>
                                </td>
                                <td class="px-5 py-3 text-right">
                                    <a href="{{ route('admin.invoices.show', $invoice) }}"
                                       class="text-theme-xs font-medium text-navy-600 hover:underline dark:text-navy-300">
                                        Open
                                    </a>
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            <div class="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
                {{ $invoices->links() }}
            </div>
        @endif
    </x-admin.card>

    <p class="mt-3 text-theme-xs text-gray-500">
        An invoice is raised automatically with the order and is never edited here. Opening one
        takes you to the studio's own invoice, where voiding or correcting it is a separate,
        permissioned action that records a reason.
    </p>
</div>
