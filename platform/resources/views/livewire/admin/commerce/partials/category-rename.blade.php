{{--
    Inline rename, shared by a root and a child.

    Enter saves, Escape cancels — the same contract as the price editor on the products screen,
    because a staff member who has learned one inline editor has learned all of them.

    The slug is displayed and not editable. It is in every product link, every sitemap entry and
    every bookmark; renaming it would 404 all of them at once.
--}}
<div>
    <div class="flex items-center gap-2">
        <input
            type="text"
            wire:model="nameInput"
            wire:keydown.enter="saveName"
            wire:keydown.escape="cancelEditing"
            class="h-8 w-full max-w-xs rounded-md border border-navy-400 bg-white px-2 text-theme-sm dark:bg-gray-900 dark:text-white"
            aria-label="New name for {{ $category['name'] }}"
            autofocus
        >
        <span class="font-mono text-theme-xs text-gray-400">/{{ $category['slug'] }}</span>

        <button type="button" wire:click="saveName"
            class="flex size-8 items-center justify-center rounded-md bg-success-600 text-white hover:bg-success-700"
            aria-label="Save name">
            <x-icon name="check" class="size-4" />
        </button>
        <button type="button" wire:click="cancelEditing"
            class="flex size-8 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 dark:border-gray-700"
            aria-label="Cancel rename">
            <x-icon name="x" class="size-4" />
        </button>
    </div>
    @error('nameInput')
        <p class="mt-1 text-theme-xs text-error-600">{{ $message }}</p>
    @enderror
</div>
