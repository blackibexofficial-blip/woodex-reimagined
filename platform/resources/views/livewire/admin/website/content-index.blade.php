<div>
    <x-admin.page-header title="Content"
                         description="The records behind the storefront's dynamic addresses — services, blog posts, projects, series and showrooms. These are the rows the site reads; saving one changes the site on its next publish."
                         :breadcrumbs="['Website' => null, 'Content' => null]">
        <x-slot:actions>
            @can('website.publish')
                <x-admin.button icon="check" wire:click="publish" wire:loading.attr="disabled">Publish site</x-admin.button>
            @endcan
        </x-slot:actions>
    </x-admin.page-header>

    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        @foreach (['service' => 'Services', 'post' => 'Posts', 'project' => 'Projects', 'series' => 'Series', 'showroom' => 'Showrooms'] as $key => $label)
            <x-admin.stat :label="$label" :value="$counts[$key] ?? 0" />
        @endforeach
    </div>

    <div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div class="relative md:col-span-3">
            <x-icon name="search" class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" />
            <input type="search" wire:model.live.debounce.300ms="search" placeholder="Search a title, an address or a summary"
                   class="wx-input pl-10" aria-label="Search content">
        </div>
        <select wire:model.live="type" class="wx-input" aria-label="Type">
            @foreach ($types as $value => $label)
                <option value="{{ $value }}">{{ $label }}</option>
            @endforeach
        </select>
    </div>

    @if ($editing !== null)
        <x-admin.card class="mb-4">
            <h2 class="mb-4 text-theme-lg font-semibold text-gray-800 dark:text-white/90">Editing</h2>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label class="block">
                    <span class="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">Title</span>
                    <input type="text" wire:model="form.title" class="wx-input w-full">
                    @error('form.title') <span class="mt-1 block text-theme-xs text-red-600">{{ $message }}</span> @enderror
                </label>

                <label class="block">
                    <span class="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">Address</span>
                    <input type="text" wire:model="form.path" class="wx-input w-full">
                    @error('form.path') <span class="mt-1 block text-theme-xs text-red-600">{{ $message }}</span> @enderror
                </label>

                <label class="block md:col-span-2">
                    <span class="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">Summary</span>
                    <textarea wire:model="form.excerpt" rows="2" class="wx-input w-full"></textarea>
                    @error('form.excerpt') <span class="mt-1 block text-theme-xs text-red-600">{{ $message }}</span> @enderror
                </label>

                <label class="block">
                    <span class="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">Status</span>
                    <select wire:model="form.status" class="wx-input w-full">
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                    </select>
                </label>

                <label class="block">
                    <span class="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">SEO title</span>
                    <input type="text" wire:model="form.seo_title" class="wx-input w-full">
                </label>

                <label class="block md:col-span-2">
                    <span class="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">SEO description</span>
                    <textarea wire:model="form.seo_description" rows="2" class="wx-input w-full"></textarea>
                </label>

                <label class="block md:col-span-2">
                    <span class="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-300">Body</span>
                    <textarea wire:model="form.sections" rows="10" class="wx-input w-full font-mono text-theme-xs"></textarea>
                    <span class="mt-1 block text-theme-xs text-gray-500">
                        Blank lines separate blocks. Start a block with <code>heading:</code> to give it a headline.
                        @if ($kept !== [])
                            <span class="mt-1 block">
                                Kept as they are: {{ implode(' · ', $kept) }} — structured blocks this field does not show.
                            </span>
                        @endif
                    </span>
                </label>
            </div>

            <div class="mt-5 flex items-center gap-3">
                <x-admin.button icon="check" wire:click="save" wire:loading.attr="disabled">Save</x-admin.button>
                <button type="button" wire:click="cancel" class="text-theme-sm font-medium text-gray-600 hover:underline dark:text-gray-400">
                    Cancel
                </button>
            </div>
        </x-admin.card>
    @endif

    <x-admin.card :padding="false">
        <div class="overflow-x-auto" wire:loading.class="opacity-60">
            <table class="min-w-full text-left text-theme-sm">
                <thead class="border-b border-gray-100 text-theme-xs tracking-wide text-gray-500 uppercase dark:border-gray-800">
                    <tr>
                        <th class="px-5 py-3 font-medium">Record</th>
                        <th class="hidden px-5 py-3 font-medium md:table-cell">Type</th>
                        <th class="hidden px-5 py-3 font-medium lg:table-cell">Summary</th>
                        <th class="px-5 py-3 font-medium">Status</th>
                        <th class="px-5 py-3"><span class="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                    @forelse ($rows as $row)
                        <tr wire:key="content-{{ $row['id'] }}" class="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                            <td class="px-5 py-3">
                                <span class="block font-medium text-gray-800 dark:text-white/90">{{ $row['title'] }}</span>
                                <span class="block text-theme-xs text-gray-500">{{ $row['path'] }}</span>
                            </td>
                            <td class="hidden px-5 py-3 text-gray-600 capitalize md:table-cell dark:text-gray-400">{{ $row['type'] }}</td>
                            <td class="hidden max-w-md px-5 py-3 text-gray-500 lg:table-cell">
                                {{ \Illuminate\Support\Str::limit($row['excerpt'], 90) ?: '—' }}
                            </td>
                            <td class="px-5 py-3">
                                @if ($row['status'] === 'published')
                                    <span class="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-theme-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">Published</span>
                                @else
                                    <span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-theme-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">Draft</span>
                                @endif
                                <span class="mt-1 block text-theme-xs text-gray-500">{{ $row['updated'] }}</span>
                            </td>
                            <td class="px-5 py-3">
                                <div class="flex items-center justify-end gap-3">
                                    <button type="button" wire:click="edit({{ $row['id'] }})"
                                            class="text-theme-sm font-medium text-brand-600 hover:underline">Edit</button>
                                    @if ($row['status'] === 'published')
                                        <a href="{{ $row['path'] }}" target="_blank" rel="noopener"
                                           class="text-theme-sm text-brand-600 hover:underline">View</a>
                                    @endif
                                    <button type="button" wire:click="toggleStatus({{ $row['id'] }})"
                                            class="text-theme-sm text-gray-500 hover:underline">
                                        {{ $row['status'] === 'published' ? 'Unpublish' : 'Publish' }}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="5" class="px-5 py-10 text-center text-gray-500">
                                No record matches. Seed the site with
                                <code class="text-theme-xs">php artisan db:seed --class=SiteContentSeeder --force</code>.
                            </td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </x-admin.card>
</div>
