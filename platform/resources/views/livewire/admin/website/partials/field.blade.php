{{--
    One editable field, chosen by the type declared in registry.json.

    Used twice: once for a block's own props and once inside a `list` field's items, which is why the
    binding path is passed in rather than derived here. There is no per-block markup anywhere in the
    editor — add a field to the registry and it appears on this control set, in every block that
    declares it.

    Text inputs are debounced: each keystroke would otherwise re-render the whole page preview, which
    runs the bound blocks' queries. Selects and checkboxes fire immediately, because one click is one
    decision and the editor expects to see it.
--}}
@php
    $type = $field['type'] ?? 'text';
    $label = $field['label'] ?? $name;
    $inputClass = 'wx-input w-full';
    $debounce = 'wire:model.live.debounce.700ms';
@endphp

<div class="mb-4">
    @if ($type === 'boolean')
        <label class="flex items-center gap-2 text-theme-sm font-medium text-gray-700 dark:text-gray-300">
            <input type="checkbox" wire:model.live="{{ $path }}" class="size-4 rounded border-gray-300 text-wood-600">
            {{ $label }}
        </label>
    @else
        <label class="mb-1.5 block text-theme-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-400">
            {{ $label }}
        </label>

        @switch($type)
            @case('textarea')
                <textarea rows="3" class="{{ $inputClass }}" {!! $debounce !!}="{{ $path }}">{{ $value }}</textarea>
                @break

            @case('number')
                <input type="number" class="{{ $inputClass }}"
                       @isset($field['min']) min="{{ $field['min'] }}" @endisset
                       @isset($field['max']) max="{{ $field['max'] }}" @endisset
                       {!! $debounce !!}="{{ $path }}">
                @break

            @case('select')
                <select class="{{ $inputClass }}" wire:model.live="{{ $path }}">
                    @foreach ($field['options'] ?? [] as $option)
                        <option value="{{ $option }}">{{ ucfirst(str_replace('_', ' ', (string) $option)) }}</option>
                    @endforeach
                </select>
                @break

            @default
                <input type="text" class="{{ $inputClass }}" {!! $debounce !!}="{{ $path }}">
        @endswitch
    @endif

    @if (! empty($field['description']))
        <p class="mt-1 text-theme-xs text-gray-500">{{ $field['description'] }}</p>
    @endif
</div>
