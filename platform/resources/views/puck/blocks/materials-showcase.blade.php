@php
    $swatches = array_slice($swatches ?? [], 0, (int) ($props['limit'] ?? 12));
@endphp
@if ($swatches !== [])
<section class="mx-auto max-w-6xl px-6 py-16">
    @if (! empty($props['heading']))
        <h2 class="mb-8 font-heading text-3xl font-normal text-navy-900 dark:text-white">{{ $props['heading'] }}</h2>
    @endif
    <ul class="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        @foreach ($swatches as $swatch)
            <li>
                <div class="aspect-square overflow-hidden rounded-lg ring-1 ring-black/5"
                     @if (! empty($swatch['hex'])) style="background-color: {{ $swatch['hex'] }}" @endif>
                    @if (empty($swatch['hex']) && ! empty($swatch['swatch_path']))
                        <img src="{{ $swatch['swatch_path'] }}" alt="{{ $swatch['label'] }}" loading="lazy"
                             class="h-full w-full object-cover">
                    @endif
                </div>
                <p class="mt-2 text-theme-xs text-gray-600 dark:text-gray-400">{{ $swatch['label'] }}</p>
            </li>
        @endforeach
    </ul>
</section>
@endif
