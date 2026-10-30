<div>
    <x-admin.page-header
        title="Attributes"
        description="The vocabulary the catalog is described in. Each option is counted against the products that carry it and the variants that point at it, because the failures here are silent: a filter that returns nothing, a finish with nothing behind it."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Attributes' => null]"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat label="Attributes" :value="$summary['attributes']" icon="layers" :hint="$summary['options'].' options in total'" />
        <x-admin.stat label="In use" :value="$summary['used']" icon="check-circle" hint="carried by a live product or variant" />
        <x-admin.stat
            label="Empty filters"
            :value="$summary['dead_filter']"
            icon="filter"
            hint="drawn, but return nothing"
            :tone="$summary['dead_filter'] > 0 ? 'error' : 'success'"
        />
        <x-admin.stat
            label="Orphaned finishes"
            :value="$summary['orphan_variant']"
            icon="alert"
            hint="offered, but not buyable"
            :tone="$summary['orphan_variant'] > 0 ? 'error' : 'success'"
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
                    <p class="text-theme-xs text-warning-600/80 dark:text-warning-400/80">
                        The storefront reads these options directly, so the fix is a catalog decision, not a deploy.
                    </p>
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
                placeholder="Option label or code…"
                class="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-theme-sm text-gray-800 placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                aria-label="Search options"
            >
        </div>

        <select wire:model.live="scope" aria-label="Show"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="all">All options</option>
            <option value="attention">Only what needs attention</option>
        </select>
    </div>

    @if ($groups->isEmpty())
        <x-admin.card>
            <x-admin.empty
                icon="layers"
                title="Nothing to show"
                description="{{ $scope === 'attention' ? 'Every option is carried by a live product or variant. Nothing here is showing a customer an empty page.' : 'No option matches that search.' }}"
            />
        </x-admin.card>
    @else
        <div class="space-y-4">
            @foreach ($groups as $group)
                @php($attribute = $group['attribute'])
                <x-admin.card :padding="false">
                    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
                        <div>
                            <div class="flex items-center gap-2">
                                <h2 class="font-semibold text-gray-800 dark:text-white/90">{{ $attribute->name }}</h2>
                                <span class="font-mono text-theme-xs text-gray-400">{{ $attribute->code }}</span>
                            </div>
                            <div class="mt-1 flex flex-wrap items-center gap-2">
                                <x-admin.badge tone="neutral">{{ $attribute->type }}</x-admin.badge>
                                @if ($attribute->is_variant)
                                    <x-admin.badge tone="info">generates variants</x-admin.badge>
                                @endif
                                @if ($attribute->is_filterable)
                                    <x-admin.badge tone="info">filterable</x-admin.badge>
                                @endif
                                @if ($attribute->is_required)
                                    <x-admin.badge tone="neutral">required</x-admin.badge>
                                @endif
                            </div>
                        </div>

                        <span class="text-theme-xs text-gray-500">
                            {{ count($group['options']) }} {{ count($group['options']) === 1 ? 'option' : 'options' }}
                            @if ($scope === 'attention')
                                needing attention
                            @endif
                        </span>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="w-full text-left text-theme-sm">
                            <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                                <tr>
                                    <th class="px-5 py-2.5 font-medium">Option</th>
                                    <th class="px-3 py-2.5 text-right font-medium">Products</th>
                                    <th class="px-3 py-2.5 text-right font-medium">Variants</th>
                                    <th class="px-3 py-2.5 font-medium">State</th>
                                    <th class="px-5 py-2.5 font-medium">What it means</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                                @foreach ($group['options'] as $option)
                                    <tr wire:key="option-{{ $attribute->id }}-{{ $option->code }}">
                                        <td class="px-5 py-3">
                                            <div class="flex items-center gap-2.5">
                                                @if ($option->swatch())
                                                    <span class="size-5 shrink-0 rounded-full border border-gray-200 dark:border-gray-700" style="background-color: {{ $option->swatch() }}" aria-hidden="true"></span>
                                                @endif
                                                <div>
                                                    <div class="text-gray-800 dark:text-white/90">{{ $option->label }}</div>
                                                    <div class="font-mono text-theme-xs text-gray-400">{{ $option->code }}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-3 py-3 text-right tabular-nums {{ $option->products === 0 ? 'text-gray-400' : 'text-gray-700 dark:text-gray-200' }}">
                                            {{ $option->products }}
                                        </td>
                                        <td class="px-3 py-3 text-right tabular-nums {{ $option->variants === 0 ? 'text-gray-400' : 'text-gray-700 dark:text-gray-200' }}">
                                            {{ $option->variants }}
                                        </td>
                                        <td class="px-3 py-3">
                                            @switch($option->state())
                                                @case('orphan_variant')
                                                    <x-admin.badge tone="error">Orphaned</x-admin.badge>
                                                    @break
                                                @case('dead_filter')
                                                    <x-admin.badge tone="warning">Empty filter</x-admin.badge>
                                                    @break
                                                @case('unused')
                                                    <x-admin.badge tone="neutral">Unused</x-admin.badge>
                                                    @break
                                                @default
                                                    <x-admin.badge tone="success">In use</x-admin.badge>
                                            @endswitch
                                        </td>
                                        <td class="px-5 py-3 text-theme-xs {{ $option->needsAttention() ? 'text-warning-700 dark:text-warning-300' : 'text-gray-500' }}">
                                            {{ $option->reason() }}
                                        </td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                </x-admin.card>
            @endforeach
        </div>
    @endif

    <p class="mt-4 text-theme-xs text-gray-500">
        {{ $rail }} filter {{ $rail === 1 ? 'option' : 'options' }} will return something in the storefront.
        Editing the vocabulary lives behind product management, not on this page — every change here
        reaches the filter rail on the next page load.
    </p>
</div>
