{{--
    The block editor screen.

    Left: the page as an ordered list of blocks — the only structure the page has. Middle: the page
    itself, rendered by the real renderer inside the real shell. Right: the fields of the block that
    is selected on the left, generated from registry.json.

    The preview is written into the iframe by a small Alpine handler rather than by re-rendering the
    `srcdoc` attribute: replacing `srcdoc` reloads the document and throws away the scroll position,
    which on a long page means the editor loses their place every time they type. Writing into the
    existing document keeps the scroll where it was.
--}}
<div>
    <x-admin.page-header :title="$pageTitle"
                         description="The page is its blocks, top to bottom. Edits stay a draft until you publish; publishing writes the static file a visitor receives."
                         :breadcrumbs="['Website' => null, 'Pages' => route('admin.website.pages'), 'Edit' => null]">
        <x-slot:actions>
            <span @class([
                'inline-flex items-center rounded-full px-3 py-1 text-theme-xs font-medium',
                'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' => $status === 'published',
                'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' => $status !== 'published',
            ])>
                {{ $status === 'published' ? 'Published' : 'Draft' }}
            </span>

            <x-admin.button icon="save" variant="secondary" wire:click="saveDraft" wire:loading.attr="disabled">Save draft</x-admin.button>

            @can('website.publish')
                <x-admin.button icon="upload" variant="primary" wire:click="publish" wire:loading.attr="disabled">Publish</x-admin.button>
            @endcan
        </x-slot:actions>
    </x-admin.page-header>

    @if ($publishedFile !== null)
        <div class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-theme-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            Published to <code class="font-mono text-theme-xs">{{ $publishedFile }}</code>. A visitor now receives
            that file without PHP running.
        </div>
    @endif

    <div class="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_22rem]" wire:loading.class="opacity-90">

        {{-- ── Left: the page as a list ─────────────────────────────────────────── --}}
        <x-admin.card :padding="false" class="self-start">
            <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 class="text-theme-sm font-semibold text-gray-900 dark:text-white">Blocks</h2>
                <span class="text-theme-xs text-gray-500">{{ count($blocks) }}</span>
            </div>

            <ol class="max-h-[52vh] space-y-1 overflow-y-auto p-2">
                @forelse ($blocks as $index => $block)
                    <li wire:key="block-{{ $block['id'] }}-{{ $index }}">
                        <button type="button" wire:click="select({{ $index }})"
                                @class([
                                    'w-full rounded-lg px-3 py-2 text-left transition',
                                    'bg-wood-50 ring-1 ring-wood-200 dark:bg-wood-500/10 dark:ring-wood-500/30' => $index === $selected,
                                    'hover:bg-gray-50 dark:hover:bg-gray-800/60' => $index !== $selected,
                                ])>
                            <span class="flex items-center gap-2">
                                <span class="text-theme-xs tabular-nums text-gray-400">{{ $index + 1 }}</span>
                                <span class="truncate text-theme-sm font-medium text-gray-900 dark:text-white">{{ $this->blockLabel($block) }}</span>
                            </span>
                            @if ($this->blockSummary($block) !== '')
                                <span class="mt-0.5 block truncate pl-6 text-theme-xs text-gray-500">{{ $this->blockSummary($block) }}</span>
                            @endif
                        </button>

                        @if ($index === $selected)
                            <div class="mt-1 mb-2 flex items-center gap-1 pl-2">
                                <x-admin.icon-button icon="chevron-down" class="rotate-180" wire:click="moveBlock({{ $index }}, -1)" title="Move up" />
                                <x-admin.icon-button icon="chevron-down" wire:click="moveBlock({{ $index }}, 1)" title="Move down" />
                                <x-admin.icon-button icon="copy" wire:click="duplicateBlock({{ $index }})" title="Duplicate" />
                                <x-admin.icon-button icon="trash" tone="danger" wire:click="removeBlock({{ $index }})" title="Delete" />
                            </div>
                        @endif
                    </li>
                @empty
                    <li class="px-3 py-8 text-center text-theme-sm text-gray-500">
                        This page has no blocks yet. Add one below.
                    </li>
                @endforelse
            </ol>

            <div class="space-y-2 border-t border-gray-100 p-3 dark:border-gray-800">
                <label for="new-block" class="block text-theme-xs font-medium tracking-wide text-gray-500 uppercase">Add a block</label>
                <select id="new-block" wire:model="newBlockType" class="wx-input w-full">
                    @foreach ($this->blockPalette() as $name => $meta)
                        <option value="{{ $name }}">{{ $meta['label'] }}{{ $meta['group'] !== '' ? ' · '.$meta['group'] : '' }}</option>
                    @endforeach
                </select>
                <x-admin.button icon="plus" wire:click="addBlock" class="w-full justify-center">Add</x-admin.button>
            </div>
        </x-admin.card>

        {{-- ── Middle: the page, live ────────────────────────────────────────────── --}}
        <div class="min-w-0" x-data="{
                apply(event) {
                    const frame = this.$refs.frame;
                    const detail = event.detail;
                    const html = Array.isArray(detail) ? (detail[0]?.html ?? '') : (detail?.html ?? '');
                    if (!frame || !html) return;

                    const doc = frame.contentDocument;
                    if (!doc) return;

                    const y = frame.contentWindow ? frame.contentWindow.scrollY : 0;
                    doc.open();
                    doc.write(html);
                    doc.close();
                    if (frame.contentWindow) frame.contentWindow.scrollTo(0, y);
                }
            }"
            x-on:preview-updated.window="apply($event)">
            <div class="flex items-center justify-between rounded-t-xl border border-gray-200 border-b-0 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-900">
                <span class="flex items-center gap-2 text-theme-xs font-medium text-gray-600 dark:text-gray-400">
                    <span class="inline-block size-2 rounded-full bg-emerald-500"></span>
                    Live preview
                </span>
                <a href="{{ url('/page-preview/'.$key) }}" target="_blank" rel="noopener"
                   class="text-theme-xs font-medium text-wood-700 hover:underline dark:text-wood-400">Open in a tab</a>
            </div>

            <div class="overflow-hidden rounded-b-xl border border-gray-200 bg-white dark:border-gray-800">
                <iframe x-ref="frame" srcdoc="{{ $previewHtml }}"
                        title="Live preview of {{ $pageTitle }}"
                        class="h-[62vh] w-full xl:h-[calc(100vh-16rem)]"></iframe>
            </div>

            <p class="mt-2 text-theme-xs text-gray-500">
                Rendered by the same code that publishes, inside the storefront shell — so the header,
                menu and footer here are the real ones.
            </p>
        </div>

        {{-- ── Right: fields of the selected block ──────────────────────────────── --}}
        <x-admin.card class="self-start">
            @php $selectedBlock = $blocks[$selected] ?? null; @endphp

            @if ($selectedBlock === null)
                <p class="text-theme-sm text-gray-500">Select a block to edit its content.</p>
            @else
                <div class="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
                    <h2 class="text-theme-sm font-semibold text-gray-900 dark:text-white">
                        {{ $this->blockLabel($selectedBlock) }}
                    </h2>
                    <span class="font-mono text-theme-xs text-gray-400">{{ $selectedBlock['type'] }}</span>
                </div>

                @foreach ($this->selectedFields() as $name => $field)
                    @php
                        $type = $field['type'] ?? 'text';
                        $path = 'blocks.'.$selected.'.props.'.$name;
                    @endphp

                    @if ($type === 'list')
                        @php
                            $items = is_array($selectedBlock['props'][$name] ?? null) ? $selectedBlock['props'][$name] : [];
                            $itemSchema = $field['item'] ?? [];
                        @endphp

                        <div class="mb-4">
                            <div class="mb-2 flex items-center justify-between">
                                <span class="text-theme-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-400">
                                    {{ $field['label'] ?? $name }}
                                </span>
                                <span class="text-theme-xs text-gray-400">{{ count($items) }}</span>
                            </div>

                            <div class="space-y-3">
                                @foreach ($items as $itemIndex => $item)
                                    <div wire:key="item-{{ $selected }}-{{ $name }}-{{ $itemIndex }}"
                                         class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                                        <div class="mb-2 flex items-center justify-between">
                                            <span class="text-theme-xs font-medium text-gray-500">#{{ $itemIndex + 1 }}</span>
                                            <div class="flex items-center gap-1">
                                                <x-admin.icon-button icon="chevron-down" class="rotate-180" wire:click="moveListItem('{{ $name }}', {{ $itemIndex }}, -1)" title="Move up" />
                                                <x-admin.icon-button icon="chevron-down" wire:click="moveListItem('{{ $name }}', {{ $itemIndex }}, 1)" title="Move down" />
                                                <x-admin.icon-button icon="trash" tone="danger" wire:click="removeListItem('{{ $name }}', {{ $itemIndex }})" title="Remove" />
                                            </div>
                                        </div>

                                        @foreach ($itemSchema as $childName => $childField)
                                            @include('livewire.admin.website.partials.field', [
                                                'name' => $childName,
                                                'field' => $childField,
                                                'path' => $path.'.'.$itemIndex.'.'.$childName,
                                                'value' => $item[$childName] ?? ($childField['default'] ?? ''),
                                            ])
                                        @endforeach
                                    </div>
                                @endforeach
                            </div>

                            <x-admin.button icon="plus" size="sm" wire:click="addListItem('{{ $name }}')" class="mt-2">
                                Add {{ Str::singular(strtolower($field['label'] ?? $name)) }}
                            </x-admin.button>
                        </div>
                    @else
                        @include('livewire.admin.website.partials.field', [
                            'name' => $name,
                            'field' => $field,
                            'path' => $path,
                            'value' => $selectedBlock['props'][$name] ?? ($field['default'] ?? ''),
                        ])
                    @endif
                @endforeach
            @endif
        </x-admin.card>
    </div>
</div>
