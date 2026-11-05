{{--
    Storefront settings.

    Left: which part of the shell. Middle: its fields, rendered from the schema in the component so a
    new field is one line there rather than a new block of markup here. Right: the real storefront in
    an iframe, reloaded after each save.

    Why an iframe and not a mock: the footer has its own stylesheet, its own responsive behaviour and
    three columns whose headings come from this form. A hand-built preview would need that CSS inside
    the admin and would still drift from the template the first time either changed. This shows the
    actual page — the honest version of "live" is "you are looking at the site".

    Bindings are `blur`, never `live`, for the reason documented in the menu builder: a live binding
    re-renders the input mid-keystroke and the caret jumps to the end of the value.
--}}
<div>
    <x-admin.page-header title="Storefront settings"
                         description="The top bar, footer columns, contact block and legal line. The site reloads beside you after each save."
                         :breadcrumbs="['Website' => null, 'Pages' => route('admin.website.pages'), 'Settings' => null]">
        <x-slot:actions>
            @if ($saved)
                <span class="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-theme-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    Saved
                </span>
            @endif

            <x-admin.button icon="eye" variant="secondary" :href="$storefrontUrl" target="_blank">Open the site</x-admin.button>
            <x-admin.button icon="save" wire:click="save" wire:loading.attr="disabled"
                            wire:target="save">Save changes</x-admin.button>
        </x-slot:actions>
    </x-admin.page-header>

    {{--
        A failed save has to be visible. Validation covers every section, so the field that blocked it
        is often not the one you were editing; the component opens the owning section, and this says so
        in words instead of leaving the button looking like it did nothing.
    --}}
    @if ($errors->any())
        <div class="mb-4 rounded-lg border border-error-200 bg-error-50 px-4 py-3 dark:border-error-500/30 dark:bg-error-500/10">
            <p class="text-theme-sm font-medium text-error-700 dark:text-error-400">
                Nothing was saved — {{ $errors->count() }} {{ \Illuminate\Support\Str::plural('problem', $errors->count()) }} to fix.
            </p>
            <p class="mt-1 text-theme-xs text-error-600 dark:text-error-400">{{ $errors->first() }}</p>
        </div>
    @endif

    <div class="grid gap-4 xl:grid-cols-[15rem_minmax(0,1fr)_24rem]">

        {{-- ── Left: which part of the shell ─────────────────────────────────────── --}}
        <x-admin.card :padding="false" class="self-start">
            <div class="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 class="text-theme-sm font-semibold text-gray-900 dark:text-white">Settings</h2>
            </div>

            <ul class="p-2">
                @foreach ($sections as $item)
                    <li wire:key="section-{{ $item['key'] }}">
                        <button type="button" wire:click="selectSection('{{ $item['key'] }}')"
                                @class([
                                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-theme-sm transition',
                                    'bg-wood-50 font-medium text-ink ring-1 ring-wood-200 dark:bg-wood-500/10 dark:text-white dark:ring-wood-500/30' => $section === $item['key'],
                                    'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/60' => $section !== $item['key'],
                                ])>
                            <span>{{ $item['label'] }}</span>
                            <span class="text-theme-xs text-gray-400">{{ $item['count'] }}</span>
                        </button>
                    </li>
                @endforeach
            </ul>

            <p class="border-t border-gray-100 px-4 py-3 text-theme-xs leading-relaxed text-gray-500 dark:border-gray-800">
                The footer link lists themselves are on the
                <a href="{{ route('admin.website.menus') }}" class="font-medium text-wood-700 underline dark:text-wood-300">Menus</a>
                screen, because they are lists and lists grow.
            </p>
        </x-admin.card>

        {{-- ── Middle: the fields ────────────────────────────────────────────────── --}}
        <x-admin.card class="self-start" wire:loading.class="opacity-70" wire:target="selectSection">
            <div class="mb-5 border-b border-gray-100 pb-3 dark:border-gray-800">
                <h2 class="text-theme-sm font-semibold text-gray-900 dark:text-white">{{ $sectionLabel }}</h2>
                @if ($sectionHint !== '')
                    <p class="mt-1 text-theme-xs leading-relaxed text-gray-500">{{ $sectionHint }}</p>
                @endif
            </div>

            @foreach ($fields as $field)
                @php $key = $field['key']; @endphp

                @if ($field['type'] === 'toggle')
                    <label class="mb-5 flex cursor-pointer items-start gap-3" wire:key="field-{{ $key }}">
                        <input type="checkbox" wire:model.live="form.{{ $key }}" wire:change="markDirty"
                               class="mt-0.5 size-4 rounded border-gray-300 text-wood-600 focus:ring-wood-500">
                        <span>
                            <span class="block text-theme-sm font-medium text-gray-800 dark:text-gray-200">{{ $field['label'] }}</span>
                            @isset($field['hint'])
                                <span class="mt-0.5 block text-theme-xs text-gray-500">{{ $field['hint'] }}</span>
                            @endisset
                        </span>
                    </label>

                @elseif ($field['type'] === 'rows')
                    <div class="mb-5" wire:key="field-{{ $key }}">
                        <div class="mb-2 flex items-center justify-between">
                            <span class="text-theme-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-400">{{ $field['label'] }}</span>
                            <button type="button" wire:click="addRow('{{ $key }}')"
                                    class="text-theme-xs font-medium text-wood-700 hover:underline dark:text-wood-300">
                                + {{ $field['add'] }}
                            </button>
                        </div>

                        @if (($form[$key] ?? []) === [])
                            <p class="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-theme-xs text-gray-500 dark:border-gray-700">
                                Nothing here yet — the row is skipped on the site.
                            </p>
                        @endif

                        <div class="space-y-2">
                            @foreach (($form[$key] ?? []) as $index => $row)
                                <div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700" wire:key="row-{{ $key }}-{{ $index }}">
                                    <div class="mb-2 flex items-center justify-between">
                                        <span class="text-theme-xs text-gray-400">#{{ $index + 1 }}</span>
                                        <div class="flex items-center gap-1">
                                            <x-admin.icon-button icon="chevron-down" class="rotate-180"
                                                                 wire:click="moveRow('{{ $key }}', {{ $index }}, -1)" title="Move up" />
                                            <x-admin.icon-button icon="chevron-down"
                                                                 wire:click="moveRow('{{ $key }}', {{ $index }}, 1)" title="Move down" />
                                            <x-admin.icon-button icon="trash" tone="danger"
                                                                 wire:click="removeRow('{{ $key }}', {{ $index }})"
                                                                 wire:confirm="Remove this row?" title="Remove" />
                                        </div>
                                    </div>

                                    @foreach ($field['sub'] as $sub)
                                        <div class="mb-2 last:mb-0">
                                            <label class="mb-1 block text-theme-xs text-gray-500">{{ $sub['label'] }}</label>
                                            <input type="text"
                                                   wire:model.blur="form.{{ $key }}.{{ $index }}.{{ $sub['key'] }}"
                                                   wire:change="markDirty"
                                                   maxlength="{{ $sub['max'] }}"
                                                   class="wx-input w-full"
                                                   placeholder="{{ $sub['hint'] ?? '' }}">
                                        </div>
                                    @endforeach
                                </div>
                            @endforeach
                        </div>

                        @error($key.'.*')
                            <p class="mt-2 text-theme-xs text-error-600">{{ $message }}</p>
                        @enderror
                    </div>

                @elseif ($field['type'] === 'textarea')
                    <div class="mb-5" wire:key="field-{{ $key }}">
                        <label for="field-{{ $key }}" class="mb-1.5 block text-theme-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-400">
                            {{ $field['label'] }}
                        </label>
                        <textarea id="field-{{ $key }}" rows="{{ $field['rows'] ?? 4 }}"
                                  wire:model.blur="form.{{ $key }}" wire:change="markDirty"
                                  maxlength="{{ $field['max'] ?? 255 }}"
                                  class="wx-input w-full">{{ $form[$key] }}</textarea>
                        @error('form.'.$key)
                            <p class="mt-1 text-theme-xs text-error-600">{{ $message }}</p>
                        @enderror
                    </div>

                @else
                    <div class="mb-5" wire:key="field-{{ $key }}">
                        <label for="field-{{ $key }}" class="mb-1.5 block text-theme-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-400">
                            {{ $field['label'] }}
                        </label>
                        <input id="field-{{ $key }}" type="{{ $field['input'] ?? 'text' }}"
                               wire:model.blur="form.{{ $key }}" wire:change="markDirty"
                               maxlength="{{ $field['max'] ?? 255 }}"
                               class="wx-input w-full"
                               placeholder="{{ $field['placeholder'] ?? '' }}">
                        @isset($field['hint'])
                            <p class="mt-1.5 text-theme-xs leading-relaxed text-gray-500">{{ $field['hint'] }}</p>
                        @endisset
                        @error('form.'.$key)
                            <p class="mt-1 text-theme-xs text-error-600">{{ $message }}</p>
                        @enderror
                    </div>
                @endif
            @endforeach

            <div class="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-gray-800">
                <span class="text-theme-xs text-gray-500">
                    @if ($saved) Saved. @else Changes are not on the site until you save. @endif
                </span>
                <x-admin.button icon="save" wire:click="save" wire:loading.attr="disabled" wire:target="save">
                    Save changes
                </x-admin.button>
            </div>
        </x-admin.card>

        {{-- ── Right: the storefront, as it actually renders ───────────────────────── --}}
        <x-admin.card :padding="false" class="self-start overflow-hidden">
            <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                <h2 class="text-theme-sm font-semibold text-gray-900 dark:text-white">On the site</h2>
                <span class="text-theme-xs text-gray-400">after save</span>
            </div>

            <iframe src="{{ $previewUrl }}" title="The storefront with the saved settings"
                    class="h-[32rem] w-full border-0 bg-white" loading="lazy"
                    wire:key="preview-{{ $previewKey }}"></iframe>

            <p class="border-t border-gray-100 px-4 py-3 text-theme-xs leading-relaxed text-gray-500 dark:border-gray-800">
                This is the home page, not a mock — scroll it, or open the site in a tab. It reloads when
                you save; it does not repaint on every keystroke, because then it would be showing
                something the database does not yet contain.
            </p>
        </x-admin.card>
    </div>
</div>
