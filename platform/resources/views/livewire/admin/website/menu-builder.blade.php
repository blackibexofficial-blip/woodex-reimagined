{{--
    The menu builder.

    Left: which menu. Middle: the tree — every row is a link, indented by depth, with the four moves
    that matter (up, down, in, out). Right: the selected link's fields.

    The tree is deliberately a flat list ordered depth-first rather than nested markup: indentation
    is a number the component already knows, and a nested tree in Blade would need a recursive partial
    to say the same thing with more ways to get it wrong.
--}}
<div>
    <x-admin.page-header title="Menus"
                         description="The header and footer links of the storefront shell. Structure saves as you click; text saves with the button."
                         :breadcrumbs="['Website' => null, 'Pages' => route('admin.website.pages'), 'Menus' => null]">
        <x-slot:actions>
            @if ($dirty)
                <span class="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-theme-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                    Unsaved text
                </span>
            @endif
            <x-admin.button icon="eye" variant="secondary" :href="url('/page-preview/home')">See the shell</x-admin.button>
            <x-admin.button icon="save" wire:click="save" wire:loading.attr="disabled">Save changes</x-admin.button>
        </x-slot:actions>
    </x-admin.page-header>

    <div class="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">

        {{-- ── Left: which menu ──────────────────────────────────────────────────── --}}
        <x-admin.card :padding="false" class="self-start">
            <div class="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 class="text-theme-sm font-semibold text-gray-900 dark:text-white">Menus</h2>
            </div>

            <ul class="p-2">
                @foreach ($this->menus() as $key => $label)
                    <li wire:key="menu-{{ $key }}">
                        <button type="button" wire:click="selectMenu('{{ $key }}')"
                                @class([
                                    'w-full rounded-lg px-3 py-2 text-left text-theme-sm transition',
                                    'bg-wood-50 font-medium text-ink ring-1 ring-wood-200 dark:bg-wood-500/10 dark:text-white dark:ring-wood-500/30' => $menu === $key,
                                    'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/60' => $menu !== $key,
                                ])>
                            {{ $label }}
                        </button>
                    </li>
                @endforeach
            </ul>

            <div class="border-t border-gray-100 px-4 py-3 text-theme-xs text-gray-500 dark:border-gray-800">
                Footer column headings (Shop, Quick links, Learn more) are in Site settings, not here.
            </div>
        </x-admin.card>

        {{-- ── Middle: the tree ──────────────────────────────────────────────────── --}}
        <x-admin.card :padding="false" class="self-start" wire:loading.class="opacity-70">
            <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 class="text-theme-sm font-semibold text-gray-900 dark:text-white">
                    {{ $this->menus()[$menu] ?? $menu }}
                </h2>
                <span class="text-theme-xs text-gray-500">
                    {{ count($items) }} links · <span class="hidden xl:inline">drag to reorder, drop on a row to nest</span>
                </span>
            </div>

            {{--
                Drag and drop, in three zones per row: the top and bottom quarters reorder as a sibling,
                the middle nests. The arrow buttons stay for the keyboard and for touch, where HTML5
                dragging does not exist — this is an addition, not a replacement.

                Everything here is client-side until the drop: `moveTo()` is the only call, and it
                re-derives the order on the server rather than trusting an array sent from the browser.
            --}}
            <ul class="p-2" x-data="{ drag: null, over: null, zone: '' }">
                @forelse ($items as $row)
                    <li wire:key="item-{{ $row['id'] }}"
                        draggable="true"
                        x-bind:class="{ 'opacity-40': drag === {{ $row['id'] }}, 'ring-2 ring-wood-300 dark:ring-wood-500': over === {{ $row['id'] }} && zone === 'inside' }"
                        x-on:dragstart="drag = {{ $row['id'] }}; $event.dataTransfer.effectAllowed = 'move'"
                        x-on:dragend="drag = null; over = null; zone = ''"
                        x-on:dragover.prevent="over = {{ $row['id'] }}; const r = $el.getBoundingClientRect(); const y = ($event.clientY - r.top) / Math.max(r.height, 1); zone = y < 0.28 ? 'before' : (y > 0.72 ? 'after' : 'inside')"
                        x-on:drop.prevent="if (drag && drag !== {{ $row['id'] }}) { $wire.moveTo(drag, {{ $row['id'] }}, zone) } drag = null; over = null; zone = ''"
                        class="relative flex items-stretch gap-1 rounded-lg">

                        {{-- where it will land --}}
                        <span x-show="over === {{ $row['id'] }} && zone === 'before'" style="display: none"
                              class="pointer-events-none absolute inset-x-2 -top-px h-0.5 rounded bg-wood-500"></span>
                        <span x-show="over === {{ $row['id'] }} && zone === 'after'" style="display: none"
                              class="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded bg-wood-500"></span>
                        <button type="button" wire:click="select({{ $row['id'] }})"
                                @class([
                                    'min-w-0 flex-1 rounded-lg py-2 pr-3 text-left transition',
                                    'bg-wood-50 ring-1 ring-wood-200 dark:bg-wood-500/10 dark:ring-wood-500/30' => $selected === $row['id'],
                                    'hover:bg-gray-50 dark:hover:bg-gray-800/60' => $selected !== $row['id'],
                                ])
                                style="padding-left: {{ 12 + ($row['depth'] - 1) * 22 }}px">
                            <span class="flex items-center gap-2">
                                @if ($row['depth'] > 1)
                                    <span class="text-gray-300 dark:text-gray-600" aria-hidden="true">└</span>
                                @endif
                                <span class="truncate text-theme-sm {{ trim($row['label']) === '' ? 'text-gray-400 italic' : 'font-medium text-gray-900 dark:text-white' }}">
                                    {{ trim($row['label']) === '' ? 'Untitled link' : $row['label'] }}
                                </span>
                                @if ($row['is_mega'])
                                    <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-gray-600 uppercase dark:bg-white/5 dark:text-gray-400">Mega</span>
                                @endif
                            </span>
                            <span class="mt-0.5 block truncate pl-0 text-theme-xs text-gray-500">{{ $row['url'] }}</span>
                        </button>

                        <div class="flex shrink-0 items-center gap-0.5">
                            <x-admin.icon-button icon="chevron-down" class="rotate-180" wire:click="moveUp({{ $row['id'] }})" title="Move up" />
                            <x-admin.icon-button icon="chevron-down" wire:click="moveDown({{ $row['id'] }})" title="Move down" />
                            @if ($row['depth'] > 1)
                                <x-admin.icon-button icon="arrow-left" wire:click="outdent({{ $row['id'] }})" title="Outdent" />
                            @endif
                            @if ($row['depth'] < \App\Livewire\Admin\Website\MenuBuilder::MAX_DEPTH)
                                <x-admin.icon-button icon="arrow-left" class="rotate-180" wire:click="indent({{ $row['id'] }})" title="Nest under the one above" />
                            @endif
                            <x-admin.icon-button icon="trash" tone="danger" wire:click="deleteItem({{ $row['id'] }})"
                                                 wire:confirm="Delete this link and everything under it?" title="Delete" />
                        </div>
                    </li>
                @empty
                    <li class="px-4 py-10 text-center text-theme-sm text-gray-500">
                        This menu has no links yet.
                    </li>
                @endforelse
            </ul>

            <div class="flex flex-wrap gap-2 border-t border-gray-100 p-3 dark:border-gray-800">
                <x-admin.button icon="plus" size="sm" variant="secondary" wire:click="addItem(null)">Top level</x-admin.button>
                @if ($selected !== null)
                    <x-admin.button icon="plus" size="sm" variant="secondary" wire:click="addItem({{ $selected }})">
                        Under the selected link
                    </x-admin.button>
                @endif
            </div>
        </x-admin.card>

        {{-- ── Right: the selected link ──────────────────────────────────────────── --}}
        <x-admin.card class="self-start">
            @php $current = collect($items)->firstWhere('id', $selected); @endphp

            @if ($current === null)
                <p class="text-theme-sm text-gray-500">Select a link to edit its text.</p>
            @else
                <div class="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
                    <h2 class="text-theme-sm font-semibold text-gray-900 dark:text-white">Link text</h2>
                    <span class="text-theme-xs text-gray-400">level {{ $current['depth'] }}</span>
                </div>

                {{--
                    `blur`, not `live`. A live binding re-renders this input on every debounce tick, and
                    the re-render puts the caret at the end of the value — so typing "Sale & Offers" over
                    a selected "Home Furniture" produced "Home FurnitureSale & Offers". There is nothing
                    live to preview on this screen, so the binding waits for the field to lose focus and
                    the caret never moves.
                --}}
                <div class="mb-4">
                    <label for="menu-label" class="mb-1.5 block text-theme-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-400">
                        Label
                    </label>
                    <input id="menu-label" type="text"
                           wire:model.blur="items.{{ collect($items)->search(fn ($r) => $r['id'] === $selected) }}.label"
                           wire:change="markDirty"
                           class="wx-input w-full" placeholder="Shop">
                </div>

                <div class="mb-4">
                    <label for="menu-url" class="mb-1.5 block text-theme-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-400">
                        Link
                    </label>
                    <input id="menu-url" type="text"
                           wire:model.blur="items.{{ collect($items)->search(fn ($r) => $r['id'] === $selected) }}.url"
                           wire:change="markDirty"
                           class="wx-input w-full" placeholder="/shop">
                    <p class="mt-1 text-theme-xs text-gray-500">
                        A path (<code>/shop</code>, <code>/projects</code>) or a full URL. Leave blank and it saves as <code>#</code>.
                    </p>
                </div>

                <div class="mb-4">
                    <label for="menu-target" class="mb-1.5 block text-theme-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-400">
                        Opens in
                    </label>
                    <select id="menu-target"
                            wire:model.live="items.{{ collect($items)->search(fn ($r) => $r['id'] === $selected) }}.target"
                            wire:change="markDirty"
                            class="wx-input w-full">
                        <option value="_self">Same tab</option>
                        <option value="_blank">New tab</option>
                    </select>
                </div>

                @if ($current['depth'] === 1)
                    <label class="flex items-start gap-2 text-theme-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox"
                               wire:model.live="items.{{ collect($items)->search(fn ($r) => $r['id'] === $selected) }}.is_mega"
                               wire:change="markDirty"
                               class="mt-0.5 size-4 rounded border-gray-300 text-wood-600">
                        <span>
                            <span class="font-medium">Mega panel</span>
                            <span class="mt-0.5 block text-theme-xs text-gray-500">
                                Renders its children as a wide multi-column panel instead of a dropdown.
                                The Shop menu uses this.
                            </span>
                        </span>
                    </label>
                @endif

                <div class="mt-5 rounded-lg bg-gray-50 px-3 py-2 text-theme-xs text-gray-600 dark:bg-white/5 dark:text-gray-400">
                    Reordering, nesting and deleting save immediately. Label and link text save with
                    “Save changes” — the button stays honest about it.
                </div>
            @endif
        </x-admin.card>
    </div>
</div>
