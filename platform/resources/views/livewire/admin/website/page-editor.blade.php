{{--
    The studio shell.

    Everything below the header is handed to React: the document as JSON in a data attribute,
    the save URL, the CSRF token and the current version. Passing it through attributes rather
    than a script tag keeps it escaped and keeps the entry point unaware of Blade.

    The fallback (inside <noscript>) is not decoration: if the bundle fails to load, the screen
    still explains what the page is and gives a link to the live URL, instead of showing an
    empty white box that looks like data loss.
--}}
<div class="mx-auto w-full max-w-[110rem] px-4 py-6 sm:px-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
            <p class="text-theme-xs uppercase tracking-wide text-gray-500">Website</p>
            <h1 class="font-heading text-2xl text-navy-900 dark:text-white">{{ $page->title }}</h1>
            <p class="mt-1 text-theme-sm text-gray-500">
                <code>{{ $page->slug }}</code>
                <span class="mx-1.5">·</span>
                {{ $page->status }}
                <span class="mx-1.5">·</span>
                version {{ $page->puck_version }}
            </p>
        </div>

        <div class="flex items-center gap-2">
            @if ($isPuck)
                <a href="{{ $previewUrl ?? $publicUrl }}" target="_blank" rel="noopener"
                   class="inline-flex h-9 items-center rounded-lg border border-gray-200 px-3 text-theme-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/5">
                    {{ $previewUrl ? 'Preview draft' : 'Open page' }}
                </a>
            @endif
        </div>
    </div>

    @unless ($isPuck)
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-500/30 dark:bg-amber-500/10">
            <h2 class="font-heading text-lg text-navy-900 dark:text-white">This page is still HTML on disk</h2>
            <p class="mt-2 max-w-2xl text-theme-sm text-gray-700 dark:text-gray-300">
                Converting it to a Puck page starts an empty document. The original file
                @if ($page->source_file)
                    (<code>{{ $page->source_file }}</code>)
                @endif
                stays where it is until you delete it, so the conversion is reversible by hand.
            </p>

            <button type="button" wire:click="convert" wire:loading.attr="disabled"
                    class="mt-4 inline-flex h-10 items-center rounded-lg bg-navy-900 px-4 font-medium text-white hover:bg-navy-800 disabled:opacity-60">
                <span wire:loading.remove wire:target="convert">Convert to a Puck page</span>
                <span wire:loading wire:target="convert">Converting…</span>
            </button>
        </div>
    @else
        <div
            id="puck-studio"
            data-page-id="{{ $page->id }}"
            data-page-title="{{ $page->title }}"
            data-document="{{ json_encode($document, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) }}"
            data-save-url="{{ route('admin.website.pages.document', ['page' => $page->id]) }}"
            data-csrf="{{ csrf_token() }}"
            data-version="{{ $page->puck_version }}"
            data-can-publish="{{ $canPublish ? '1' : '0' }}"
            data-preview-url="{{ $previewUrl ?? $publicUrl }}"
            class="min-h-[70vh]"
        ></div>

        <noscript>
            <p class="rounded-lg border border-gray-200 p-4 text-theme-sm text-gray-600">
                The page editor needs JavaScript. The page itself is served as plain HTML at
                <a href="{{ $publicUrl }}" class="underline">{{ $publicUrl }}</a>.
            </p>
        </noscript>

        @if (is_file(public_path('build/manifest.json')))
            @vite(['resources/js/studio/editor.tsx'])
        @endif
    @endunless
</div>
