<div>
    <x-admin.page-header
        title="Inventory"
        description="Availability is on hand minus held. A hold is a promise to a cart, and a promise that never expires is stock nobody can sell."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Inventory' => null]"
    >
        <x-slot:actions>
            @if ($expired > 0)
                <x-admin.button wire:click="releaseExpired" icon="refresh" wire:loading.attr="disabled">
                    Release {{ $expired }} expired {{ $expired === 1 ? 'hold' : 'holds' }}
                </x-admin.button>
            @endif
        </x-slot:actions>
    </x-admin.page-header>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat label="Units on hand" :value="$stats['units']" icon="layers" hint="across all warehouses" />
        <x-admin.stat label="Held by carts" :value="$stats['held']" icon="folder" hint="not sellable until released" />
        <x-admin.stat
            label="Running low"
            :value="$stats['low']"
            icon="folder"
            hint="at or below threshold"
            :tone="$stats['low'] > 0 ? 'warning' : 'success'"
        />
        <x-admin.stat
            label="Out of stock"
            :value="$stats['out']"
            icon="layout"
            hint="cannot be bought right now"
            :tone="$stats['out'] > 0 ? 'error' : 'success'"
        />
    </div>

    <div class="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative flex-1">
            <x-icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
                type="search"
                wire:model.live.debounce.300ms="search"
                placeholder="SKU or product name…"
                class="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-theme-sm text-gray-800 placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                aria-label="Search stock"
            >
        </div>

        <select wire:model.live="source" aria-label="Warehouse"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="">Any warehouse</option>
            @foreach ($sources as $id => $name)
                <option value="{{ $id }}">{{ $name }}</option>
            @endforeach
        </select>

        <select wire:model.live="stock" aria-label="Stock level"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="">Everything</option>
            <option value="low">Running low</option>
            <option value="out">Out of stock</option>
        </select>
    </div>

    <x-admin.card :padding="false">
        @if ($items->isEmpty())
            <x-admin.empty
                icon="check-circle"
                title="Nothing to show"
                description="No stock rows match this filter. That is an answer, not an error — widen the filter to see the rest."
            />
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-theme-sm">
                    <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        <tr>
                            <th class="px-5 py-3 font-medium">Product</th>
                            <th class="px-3 py-3 font-medium">SKU</th>
                            <th class="px-3 py-3 font-medium">Warehouse</th>
                            <th class="px-3 py-3 text-right font-medium">On hand</th>
                            <th class="px-3 py-3 text-right font-medium">Held</th>
                            <th class="px-3 py-3 text-right font-medium">Available</th>
                            <th class="px-3 py-3 text-right font-medium">Threshold</th>
                            <th class="px-5 py-3 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        @foreach ($items as $item)
                            @php($level = $this->level($item))
                            <tr wire:key="stock-{{ $item->id }}">
                                <td class="px-5 py-3 text-gray-800 dark:text-white/90">
                                    {{ $item->variant?->product?->displayName() ?? $item->variant?->sku }}
                                </td>
                                <td class="px-3 py-3 font-mono text-theme-xs text-gray-500">{{ $item->variant?->sku }}</td>
                                <td class="px-3 py-3 text-gray-500">{{ $item->source?->name }}</td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-800 dark:text-white/90">{{ $item->qty }}</td>
                                <td class="px-3 py-3 text-right tabular-nums">
                                    @if ($item->reserved > 0)
                                        <span class="text-warning-600">{{ $item->reserved }}</span>
                                        <span class="ml-1 text-theme-xs text-gray-400">{{ $level->heldPercent() }}%</span>
                                    @else
                                        <span class="text-gray-400">0</span>
                                    @endif
                                </td>
                                <td class="px-3 py-3 text-right font-semibold tabular-nums {{ $level->isOut() ? 'text-error-600' : 'text-gray-800 dark:text-white/90' }}">
                                    {{ $level->available() }}
                                </td>
                                <td class="px-3 py-3 text-right tabular-nums text-gray-500">{{ $item->low_stock_threshold }}</td>
                                <td class="px-5 py-3">
                                    <x-admin.badge :tone="$level->tone()">{{ $level->label() }}</x-admin.badge>

                                    @if ($level->isCorrupted())
                                        {{-- More is held than exists: a release was missed, and the
                                             number beside it is now a lie until someone looks. --}}
                                        <span class="ml-2 text-theme-xs text-error-600" title="Held exceeds what is on hand">
                                            oversold
                                        </span>
                                    @endif
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            <div class="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
                {{ $items->links() }}
            </div>
        @endif
    </x-admin.card>

    <div class="mt-6">
        <x-admin.card
            title="Held right now"
            description="The oldest promise first. When a cart expires its units come back, but only because something releases them."
        >
            @if ($holds->isEmpty())
                <x-admin.empty icon="check-circle" title="Nothing is held" description="Every unit on the shelf can be sold." />
            @else
                <div class="overflow-x-auto">
                    <table class="w-full text-left text-theme-sm">
                        <thead class="text-theme-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th class="pb-3 font-medium">Product</th>
                                <th class="pb-3 font-medium">Warehouse</th>
                                <th class="pb-3 text-right font-medium">Units</th>
                                <th class="pb-3 font-medium">Expires</th>
                                <th class="pb-3 font-medium">Held by</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                            @foreach ($holds as $hold)
                                <tr wire:key="hold-{{ $hold->id }}">
                                    <td class="py-2.5 pr-4 text-gray-800 dark:text-white/90">
                                        {{ $hold->variant?->product?->displayName() ?? $hold->variant?->sku }}
                                    </td>
                                    <td class="py-2.5 pr-4 text-gray-500">{{ $hold->source?->name }}</td>
                                    <td class="py-2.5 pr-4 text-right tabular-nums">{{ $hold->qty }}</td>
                                    <td class="py-2.5 pr-4">
                                        @if ($hold->expires_at === null)
                                            <span class="text-gray-400">Until placed</span>
                                        @elseif ($hold->expires_at->isPast())
                                            <span class="text-warning-600">{{ $hold->expires_at->diffForHumans() }}</span>
                                        @else
                                            <span class="text-gray-500">{{ $hold->expires_at->diffForHumans() }}</span>
                                        @endif
                                    </td>
                                    <td class="py-2.5 font-mono text-theme-xs text-gray-500">
                                        {{ $hold->order_id !== null ? 'order #'.$hold->order_id : 'cart #'.$hold->cart_id }}
                                    </td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @endif
        </x-admin.card>
    </div>
</div>
