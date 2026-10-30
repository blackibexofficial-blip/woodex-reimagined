<div>
    <x-admin.page-header
        title="Commerce"
        description="Catalog, orders and money. Catalog figures below are live; order figures arrive with P2 and are shown as pending rather than as zero."
        :breadcrumbs="['Commerce' => null]"
    >
        <x-slot:actions>
            @can('commerce.products.manage')
                <x-admin.button :href="route('admin.commerce.products')" wire:navigate icon="archive">Manage products</x-admin.button>
            @endcan
        </x-slot:actions>
    </x-admin.page-header>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat
            label="Published products"
            :value="$stats['published']"
            icon="archive"
            :hint="$stats['drafts'].' in drafts'"
            tone="wood"
            :href="route('admin.commerce.products')"
        />
        <x-admin.stat
            label="Sellable variants"
            :value="$stats['variants']"
            icon="layers"
            hint="across all warehouses"
        />
        <x-admin.stat
            label="Categories"
            :value="$stats['categories']"
            icon="layout"
            hint="active in the storefront"
        />
        <x-admin.stat
            label="Low stock"
            :value="$stock['count']"
            icon="folder"
            hint="at or below threshold"
            :tone="$stock['count'] > 0 ? 'warning' : 'success'"
            :href="route('admin.commerce.inventory')"
        />
    </div>

    <div class="mt-6 grid gap-4 xl:grid-cols-3">
        <div class="xl:col-span-2">
            <x-admin.card title="Low stock" description="At or below the threshold for their warehouse.">
                @if ($stock['items']->isEmpty())
                    <x-admin.empty icon="check-circle" title="Nothing running low" description="Every variant is above its threshold." />
                @else
                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-theme-sm">
                            <thead class="text-theme-xs uppercase tracking-wide text-gray-500">
                                <tr>
                                    <th class="pb-3 font-medium">Product</th>
                                    <th class="pb-3 font-medium">SKU</th>
                                    <th class="pb-3 font-medium">Warehouse</th>
                                    <th class="pb-3 text-right font-medium">Available</th>
                                    <th class="pb-3 text-right font-medium">Threshold</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                                @foreach ($stock['items'] as $item)
                                    <tr>
                                        <td class="py-2.5 pr-4 text-gray-800 dark:text-white/90">
                                            {{ $item->variant?->product?->displayName() ?? $item->variant?->sku }}
                                        </td>
                                        <td class="py-2.5 pr-4 font-mono text-theme-xs text-gray-500">{{ $item->variant?->sku }}</td>
                                        <td class="py-2.5 pr-4 text-gray-500">{{ $item->source?->name }}</td>
                                        <td class="py-2.5 text-right">
                                            <x-admin.badge :color="$item->available() === 0 ? 'error' : 'warning'">
                                                {{ $item->available() }}
                                            </x-admin.badge>
                                        </td>
                                        <td class="py-2.5 text-right text-gray-500">{{ $item->low_stock_threshold }}</td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                @endif
            </x-admin.card>
        </div>

        <div class="space-y-4">
            <x-admin.card title="Needs attention">
                <ul class="space-y-3 text-theme-sm">
                    <li class="flex items-start gap-2">
                        <x-icon name="alert" class="mt-0.5 size-4 text-warning-500" />
                        <span class="text-gray-600 dark:text-gray-300">
                            <strong class="text-gray-900 dark:text-white">{{ $unpriced }}</strong>
                            {{ $unpriced === 1 ? 'product has' : 'products have' }} no price —
                            {{ $unpriced === 1 ? 'it' : 'they' }} cannot be published to the storefront.
                        </span>
                    </li>
                    <li class="flex items-start gap-2">
                        <x-icon name="folder" class="mt-0.5 size-4 text-warning-500" />
                        <span class="text-gray-600 dark:text-gray-300">
                            <strong class="text-gray-900 dark:text-white">{{ $stock['count'] }}</strong>
                            stock lines at or below threshold.
                        </span>
                    </li>
                </ul>
            </x-admin.card>

            <x-admin.card title="Not built yet" description="Shown so nobody mistakes an empty screen for a bug.">
                <ul class="space-y-2 text-theme-sm text-gray-600 dark:text-gray-300">
                    <li class="flex items-center gap-2"><x-icon name="invoice" class="size-4 text-gray-400" /> Orders and revenue <span class="text-theme-xs text-gray-400">P2</span></li>
                    <li class="flex items-center gap-2"><x-icon name="wallet" class="size-4 text-gray-400" /> Payments <span class="text-theme-xs text-gray-400">P2</span></li>
                    <li class="flex items-center gap-2"><x-icon name="megaphone" class="size-4 text-gray-400" /> Promotions <span class="text-theme-xs text-gray-400">P3</span></li>
                    <li class="flex items-center gap-2"><x-icon name="refresh" class="size-4 text-gray-400" /> Refunds and returns <span class="text-theme-xs text-gray-400">P3</span></li>
                </ul>
            </x-admin.card>
        </div>
    </div>
</div>
