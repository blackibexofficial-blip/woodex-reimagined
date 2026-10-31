<div>
    <x-admin.page-header
        title="Products"
        description="Prices are edited in the row, in rupees, and stored in paisa. Search, filter, then click a price to change it — no page load."
        :breadcrumbs="['Commerce' => route('admin.commerce.dashboard'), 'Products' => null]"
    >
        <x-slot:actions>
            @if ($canManage)
                <x-admin.button icon="plus" :href="'#'">New product</x-admin.button>
            @endif
        </x-slot:actions>
    </x-admin.page-header>

    {{-- Filters --}}
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative flex-1">
            <x-icon name="search" class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
                type="search"
                wire:model.live.debounce.300ms="search"
                placeholder="Search by name, SKU or series…"
                class="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-theme-sm text-gray-800 placeholder:text-gray-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                aria-label="Search products"
            >
        </div>

        <select wire:model.live="category" aria-label="Category"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="">All categories</option>
            @foreach ($categories as $option)
                <option value="{{ $option->id }}">{{ $option->displayName() }}</option>
            @endforeach
        </select>

        <select wire:model.live="status" aria-label="Status"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="">Any status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
        </select>

        <select wire:model.live="sort" aria-label="Sort"
            class="h-10 rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="position">Catalog order</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="name">SKU</option>
        </select>
    </div>

    <x-admin.card :padding="false">
        @if ($products->isEmpty())
            <x-admin.empty
                icon="archive"
                title="No products match"
                description="Clear the filters, or add the first product for this category."
            />
        @else
            <div class="overflow-x-auto">
                <table class="w-full text-left text-theme-sm">
                    <thead class="border-b border-gray-100 text-theme-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                        <tr>
                            <th class="px-5 py-3 font-medium">Product</th>
                            <th class="px-3 py-3 font-medium">SKU</th>
                            <th class="px-3 py-3 font-medium">Category</th>
                            <th class="px-3 py-3 text-right font-medium">Price</th>
                            <th class="px-3 py-3 text-right font-medium">Stock</th>
                            <th class="px-3 py-3 font-medium">Status</th>
                            <th class="px-5 py-3 text-right font-medium"><span class="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                        @foreach ($products as $product)
                            @php($price = $product->lowestPrice())
                            <tr wire:key="product-{{ $product->id }}" class="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]">
                                <td class="px-5 py-3">
                                    <div class="flex items-center gap-3">
                                        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sand-100 text-wood-600 dark:bg-wood-500/10 dark:text-wood-300">
                                            <x-icon name="archive" class="size-4" />
                                        </span>
                                        <div class="min-w-0">
                                            <p class="truncate font-medium text-gray-800 dark:text-white/90">{{ $product->displayName() }}</p>
                                            <p class="truncate text-theme-xs text-gray-500">
                                                {{ $product->series }}
                                                @if ($product->isConfigurable())
                                                    · {{ $product->variants->count() }} variants
                                                @endif
                                            </p>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-3 py-3 font-mono text-theme-xs text-gray-500">{{ $product->sku }}</td>
                                <td class="px-3 py-3 text-gray-500">{{ $product->primaryCategory?->displayName() ?? '—' }}</td>

                                {{-- Inline price editor --}}
                                <td class="px-3 py-3 text-right">
                                    @if ($editingId === $product->id)
                                        <div class="flex items-center justify-end gap-1.5">
                                            <input
                                                type="text"
                                                inputmode="numeric"
                                                wire:model="priceInput"
                                                wire:keydown.enter="savePrice"
                                                wire:keydown.escape="cancelEditing"
                                                class="h-8 w-24 rounded-md border border-navy-400 bg-white px-2 text-right text-theme-sm dark:bg-gray-900 dark:text-white"
                                                aria-label="Price in rupees for {{ $product->displayName() }}"
                                                autofocus
                                            >
                                            <button type="button" wire:click="savePrice"
                                                class="flex size-8 items-center justify-center rounded-md bg-success-600 text-white hover:bg-success-700"
                                                aria-label="Save price">
                                                <x-icon name="check" class="size-4" />
                                            </button>
                                            <button type="button" wire:click="cancelEditing"
                                                class="flex size-8 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700"
                                                aria-label="Cancel">
                                                <x-icon name="x" class="size-4" />
                                            </button>
                                        </div>
                                        @error('priceInput')
                                            <p class="mt-1 text-theme-xs text-error-600">{{ $message }}</p>
                                        @enderror
                                    @else
                                        <button
                                            type="button"
                                            @if ($canManage) wire:click="startEditing({{ $product->id }})" @endif
                                            @class([
                                                'rounded-md px-2 py-1 text-right tabular-nums transition',
                                                'hover:bg-wood-50 dark:hover:bg-wood-500/10' => $canManage,
                                                'cursor-default' => ! $canManage,
                                            ])
                                            @if ($canManage) aria-label="Edit price for {{ $product->displayName() }}" @endif
                                        >
                                            @if ($price !== null)
                                                <span class="font-medium text-gray-900 dark:text-white">{{ $price->format() }}</span>
                                            @else
                                                <x-admin.badge color="warning">No price</x-admin.badge>
                                            @endif
                                        </button>
                                    @endif
                                </td>

                                <td class="px-3 py-3 text-right">
                                    @php($available = $product->variants->sum(fn ($variant) => $variant->availableQty()))
                                    {{-- Every product holds stock, because every product has at least one
                                         variant underneath — a simple one for a simple product. The gate
                                         used to be on the type, so sixteen products showed "—" while
                                         their stock sat in the inventory table unread. --}}
                                    @if ($product->variants->isNotEmpty())
                                        <span class="tabular-nums {{ $available === 0 ? 'text-error-600' : 'text-gray-700 dark:text-gray-300' }}">{{ $available }}</span>
                                        <span class="text-theme-xs text-gray-400">total</span>
                                    @else
                                        <span class="text-theme-xs text-gray-400">—</span>
                                    @endif
                                </td>

                                <td class="px-3 py-3">
                                    <x-admin.badge :color="$product->isPublished() ? 'success' : 'gray'">
                                        {{ Str::headline($product->status) }}
                                    </x-admin.badge>
                                </td>

                                <td class="px-5 py-3 text-right">
                                    @if ($canManage)
                                        <button type="button" wire:click="toggleStatus({{ $product->id }})"
                                            class="rounded-md px-2 py-1 text-theme-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/5"
                                        >
                                            {{ $product->isPublished() ? 'Unpublish' : 'Publish' }}
                                        </button>
                                    @endif
                                </td>
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>

            {{ $products->links('components.admin.pagination') }}
        @endif
    </x-admin.card>

    <p class="mt-4 text-theme-xs text-gray-500">
        Prices are whole rupees in this screen and integer paisa in the database — the conversion happens once, on save.
        A configurable product's price belongs to its variants; editing it here is refused rather than silently ignored.
    </p>
</div>
