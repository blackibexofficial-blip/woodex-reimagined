<div>
    <x-admin.page-header title="Pages"
                         description="Every address of the reimagined storefront: its 16 URLs and the records behind the rest. Publishing writes the static shell a visitor and a crawler receive — the SPA takes over in the browser."
                         :breadcrumbs="['Website' => null, 'Pages' => null]">
        <x-slot:actions>
            {{-- The builder edits the generated HTML files, not the record — a screenshot of it looks like a page
                 editor and is not one, so the label says what it opens. --}}
            <x-admin.button icon="panel" :href="route('admin.website.builder')">HTML files</x-admin.button>
        </x-slot:actions>
    </x-admin.page-header>

    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <x-admin.stat label="URLs" :value="$counts['pages']" />
        <x-admin.stat label="Records" :value="$counts['records']" />
        <x-admin.stat label="Needs publishing" :value="$counts['stale']" />
        <x-admin.stat label="Archived (interior)" :value="$counts['archived']" />
    </div>

    <div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div class="relative md:col-span-3">
            <x-icon name="search" class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" />
            <input type="search" wire:model.live.debounce.300ms="search" placeholder="Search a title or an address"
                   class="wx-input pl-10" aria-label="Search pages">
        </div>
        <select wire:model.live="kind" class="wx-input" aria-label="Kind">
            <option value="">Every kind ({{ $counts['pages'] }})</option>
            @foreach ($kinds as $value => $label)
                <option value="{{ $value }}">{{ $label }}</option>
            @endforeach
        </select>
    </div>

    <x-admin.card :padding="false">
        <div class="overflow-x-auto" wire:loading.class="opacity-60">
            <table class="min-w-full text-left text-theme-sm">
                <thead class="border-b border-gray-100 text-theme-xs tracking-wide text-gray-500 uppercase dark:border-gray-800">
                    <tr>
                        <th class="px-5 py-3 font-medium">Page</th>
                        <th class="hidden px-5 py-3 font-medium md:table-cell">Kind</th>
                        <th class="hidden px-5 py-3 font-medium lg:table-cell">Description</th>
                        <th class="hidden px-5 py-3 font-medium lg:table-cell">Published</th>
                        <th class="px-5 py-3"><span class="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    @forelse ($pages as $page)
                        <tr wire:key="page-{{ $page['key'] }}" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                            <td class="px-5 py-3">
                                <span class="block font-medium text-gray-800 dark:text-white/90">{{ $page['title'] }}</span>
                                <span class="block text-theme-xs text-gray-500">{{ $page['path'] }} · {{ $page['key'] }}</span>
                            </td>
                            <td class="hidden px-5 py-3 text-gray-600 md:table-cell dark:text-gray-400">
                                {{ $kinds[$page['kind']] ?? $page['kind'] }}
                            </td>
                            <td class="hidden max-w-md px-5 py-3 text-gray-500 lg:table-cell">
                                {{ \Illuminate\Support\Str::limit($page['description'], 90) ?: '—' }}
                            </td>
                            <td class="hidden px-5 py-3 lg:table-cell">
                                @if ($page['stale'])
                                    <span class="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-theme-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">Needs publishing</span>
                                @else
                                    <span class="text-gray-500">{{ $page['published_at'] }}</span>
                                @endif
                            </td>
                            <td class="px-5 py-3">
                                <div class="flex items-center justify-end gap-3">
                                    <a href="{{ route('admin.website.builder', ['key' => $page['key']]) }}"
                                       class="font-medium text-theme-sm text-brand-600 hover:underline">Edit</a>
                                    <a href="{{ $page['path'] }}" target="_blank" rel="noopener"
                                       class="text-theme-sm text-brand-600 hover:underline">View</a>
                                    @can('website.publish')
                                        <button type="button" wire:click="publish('{{ $page['key'] }}')" wire:loading.attr="disabled"
                                                class="text-theme-sm font-medium text-brand-600 hover:underline disabled:opacity-50">
                                            Publish
                                        </button>
                                    @endcan
                                </div>
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="5" class="px-5 py-10 text-center text-gray-500">
                                No page matches. Seed the site with
                                <code class="text-theme-xs">php artisan db:seed --class=SiteContentSeeder --force</code>.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </x-admin.card>

    @if ($counts['archived'] > 0)
        <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-5 py-4 text-theme-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
            <span class="font-medium text-gray-800 dark:text-white/90">{{ $counts['archived'] }} interior pages are archived.</span>
            They belong to the previous website (house design, 3D visualisation) and are no longer live. Nothing was
            deleted: the rows are stamped <code class="text-theme-xs">archived_at</code> and the full export is in
            <code class="text-theme-xs">storage/app/private/archive/</code>.
        </div>
    @endif
</div>
