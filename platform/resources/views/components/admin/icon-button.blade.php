{{--
    A small square button that carries an icon and nothing else.

    Exists because row actions (move up, move down, duplicate, delete) repeat four times per block in
    the page editor, and spelling out the markup each time is how three of them end up with slightly
    different padding. `title` is required in practice: an icon-only control with no accessible name
    is unusable with a screen reader.
--}}
@props(['icon' => null, 'tone' => 'default'])

@php
    $tones = [
        'default' => 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5',
        'danger' => 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10',
    ];
@endphp

<button type="button" {{ $attributes->merge([
    'class' => 'inline-flex size-7 items-center justify-center rounded-md transition disabled:opacity-50 '
        .($tones[$tone] ?? $tones['default']),
]) }}>
    @if ($icon)
        <x-icon :name="$icon" class="size-3.5" />
    @endif
    {{ $slot }}
</button>
