<div>
    <x-admin.page-header
        title="Categories"
        description="The storefront's navigation and the storefront's filters are both built from this tree. Renaming changes the label everywhere; the slug stays, so no link breaks."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Categories' => null]"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <x-admin.stat label="Categories" :value="$stats['categories']" icon="layout" :hint="$stats['roots'].' at the top level'" />
        <x-admin.stat label="Tree depth" :value="$stats['depth']" icon="layers" hint="two is what the storefront expects" />
        <x-admin.stat
            label="Empty sections"
            :value="$stats['empty']"
            icon="folder"
            hint="no published products anywhere beneath"
            :tone="$stats['empty'] > 0 ? 'warning' : 'success'"
        />
        <x-admin.stat label="Product filter keys" :value="$stats['categories']" icon="archive" hint="each slug is a /shop?category= value" />
    </div>

    {{-- A malformed tree is shown, not swallowed. The tree builder has already repaired what
         it can (orphans promoted, cycles broken); this is the list of what it had to repair. --}}
    @if ($problems !== [])
        <div class="mt-6 rounded-lg border border-warning-300 bg-warning-50 p-4 dark:border-warning-500/40 dark:bg-warning-500/10">
            <p class="text-theme-sm font-medium text-warning-700 dark:text-warning-400">This tree needed repair</p>
            <ul class="mt-2 list-disc space-y-1 pl-5 text-theme-sm text-warning-700 dark:text-warning-400">
                @foreach ($problems as $problem)
                    <li>{{ $problem }}</li>
                @endforeach
            </ul>
            <p class="mt-2 text-theme-xs text-warning-600 dark:text-warning-400/80">
                Nothing was changed in the database. Fix the parent or position of the rows above.
            </p>
        </div>
    @endif

    <div class="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative flex-1">
            <x-icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
                type="search"
                wire:model.live.debounce.300ms="search"
                placeholder="Name or slug…"
                class="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-theme-sm text-gray-800 placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                aria-label="Search categories"
            >
        </div>
        <p class="text-theme-xs text-gray-500">
            Renaming keeps the URL. Use Show and Menu to take a category off the site without hiding its products.
        </p>
    </div>

    @if ($branches === [])
        <x-admin.card :padding="false">
            <x-admin.empty
                icon="layout"
                title="No categories match"
                description="Clear the search to see the whole tree."
            />
        </x-admin.card>
    @else
        <div class="space-y-4">
            @foreach ($branches as $branch)
                @php($root = $branch['category'])
                <x-admin.card :padding="false">
                    {{-- Root row --}}
                    <div class="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
                        <div class="min-w-0 flex-1">
                            @if ($editingId === $root['id'])
                                @include('livewire.admin.commerce.partials.category-rename', ['category' => $root])
                            @else
                                <div class="flex items-center gap-2">
                                    <button
                                        type="button"
                                        @if ($canManage) wire:click="startEditing({{ $root['id'] }})" @endif
                                        @class([
                                            'rounded px-1 text-left font-semibold text-gray-800 dark:text-white/90',
                                            'hover:bg-wood-50 dark:hover:bg-wood-500/10' => $canManage,
                                        ])
                                        @if ($canManage) aria-label="Rename {{ $root['name'] }}" @endif
                                    >{{ $root['name'] }}</button>
                                    <span class="font-mono text-theme-xs text-gray-400">/{{ $root['slug'] }}</span>
                                </div>
                                <p class="mt-0.5 text-theme-xs text-gray-500">
                                    {{ $branch['count'] }} published {{ $branch['count'] === 1 ? 'product' : 'products' }}
                                    @if ($branch['children'] !== [])
                                        across {{ count($branch['children']) }} {{ count($branch['children']) === 1 ? 'subcategory' : 'subcategories' }}
                                    @endif
                                </p>
                            @endif
                        </div>

                        <div class="flex items-center gap-2">
                            @if ($root['is_active'])
                                <x-admin.badge tone="success">Live</x-admin.badge>
                            @else
                                <x-admin.badge tone="error">Off</x-admin.badge>
                            @endif

                            @if ($root['show_in_menu'])
                                <x-admin.badge tone="neutral">In menu</x-admin.badge>
                            @else
                                <x-admin.badge tone="warning">Hidden from menu</x-admin.badge>
                            @endif
                        </div>

                        @if ($canManage)
                            <div class="flex items-center gap-1">
                                <button type="button" wire:click="move({{ $root['id'] }}, 'up')"
                                    @disabled(! $this->tree()->canMoveUp($root['id']))
                                    class="flex size-8 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-gray-700"
                                    aria-label="Move {{ $root['name'] }} up">
                                    <x-icon name="chevron-down" class="size-4 rotate-180" />
                                </button>
                                <button type="button" wire:click="move({{ $root['id'] }}, 'down')"
                                    @disabled(! $this->tree()->canMoveDown($root['id']))
                                    class="flex size-8 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-gray-700"
                                    aria-label="Move {{ $root['name'] }} down">
                                    <x-icon name="chevron-down" class="size-4" />
                                </button>

                                <button type="button" wire:click="toggleActive({{ $root['id'] }})"
                                    class="rounded-md px-2 py-1 text-theme-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                                    {{ $root['is_active'] ? 'Switch off' : 'Switch on' }}
                                </button>

                                <button type="button" wire:click="toggleMenu({{ $root['id'] }})"
                                    class="rounded-md px-2 py-1 text-theme-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                                    {{ $root['show_in_menu'] ? 'Hide from menu' : 'Show in menu' }}
                                </button>
                            </div>
                        @endif
                    </div>

                    {{-- Children --}}
                    @if ($branch['children'] === [])
                        <p class="px-5 py-3 text-theme-sm text-gray-500">
                            No subcategories. Products attach to this category directly.
                        </p>
                    @else
                        <ul class="divide-y divide-gray-50 dark:divide-gray-800/60">
                            @foreach ($branch['children'] as $child)
                                <li class="flex flex-wrap items-center gap-3 px-5 py-2.5" wire:key="child-{{ $child['id'] }}">
                                    <div class="min-w-0 flex-1 pl-6">
                                        @if ($editingId === $child['id'])
                                            @include('livewire.admin.commerce.partials.category-rename', ['category' => $child])
                                        @else
                                            <div class="flex items-center gap-2">
                                                <span class="text-gray-300 dark:text-gray-600" aria-hidden="true">└</span>
                                                <button
                                                    type="button"
                                                    @if ($canManage) wire:click="startEditing({{ $child['id'] }})" @endif
                                                    @class([
                                                        'rounded px-1 text-left text-gray-800 dark:text-white/90',
                                                        'hover:bg-wood-50 dark:hover:bg-wood-500/10' => $canManage,
                                                    ])
                                                    @if ($canManage) aria-label="Rename {{ $child['name'] }}" @endif
                                                >{{ $child['name'] }}</button>
                                                <span class="font-mono text-theme-xs text-gray-400">/{{ $child['slug'] }}</span>
                                            </div>
                                        @endif
                                    </div>

                                    <span class="text-theme-xs text-gray-500">
                                        {{ $child['product_count'] }} {{ $child['product_count'] === 1 ? 'product' : 'products' }}
                                    </span>

                                    <div class="flex items-center gap-2">
                                        @if ($child['is_active'])
                                            <x-admin.badge tone="success">Live</x-admin.badge>
                                        @else
                                            <x-admin.badge tone="error">Off</x-admin.badge>
                                        @endif
                                        @unless ($child['show_in_menu'])
                                            <x-admin.badge tone="warning">Hidden</x-admin.badge>
                                        @endunless
                                    </div>

                                    @if ($canManage)
                                        <div class="flex items-center gap-1">
                                            <button type="button" wire:click="move({{ $child['id'] }}, 'up')"
                                                @disabled(! $this->tree()->canMoveUp($child['id']))
                                                class="flex size-7 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-gray-700"
                                                aria-label="Move {{ $child['name'] }} up">
                                                <x-icon name="chevron-down" class="size-3.5 rotate-180" />
                                            </button>
                                            <button type="button" wire:click="move({{ $child['id'] }}, 'down')"
                                                @disabled(! $this->tree()->canMoveDown($child['id']))
                                                class="flex size-7 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 dark:border-gray-700"
                                                aria-label="Move {{ $child['name'] }} down">
                                                <x-icon name="chevron-down" class="size-3.5" />
                                            </button>
                                            <button type="button" wire:click="toggleActive({{ $child['id'] }})"
                                                class="rounded px-2 py-1 text-theme-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                                                {{ $child['is_active'] ? 'Off' : 'On' }}
                                            </button>
                                        </div>
                                    @endif
                                </li>
                            @endforeach
                        </ul>
                    @endif
                </x-admin.card>
            @endforeach
        </div>
    @endif
</div>
