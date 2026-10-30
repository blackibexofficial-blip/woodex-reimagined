@php
    $tones = [
        'wood' => 'bg-wood-600 text-white',
        'navy' => 'bg-navy-900 text-white',
        'sand' => 'bg-sand-100 text-navy-900',
    ];
    $tone = $tones[$props['tone'] ?? 'wood'] ?? $tones['wood'];
    $button = ($props['tone'] ?? 'wood') === 'sand'
        ? 'bg-navy-900 text-white hover:bg-navy-800'
        : 'bg-white text-navy-900 hover:bg-white/90';
@endphp
<section class="mx-auto max-w-6xl px-6 py-12">
    <div class="flex flex-col items-start gap-5 rounded-2xl px-8 py-10 sm:flex-row sm:items-center sm:justify-between {{ $tone }}">
        <div>
            <h2 class="font-heading text-2xl font-normal">{{ $props['heading'] }}</h2>
            @if (! empty($props['body']))
                <p class="mt-1.5 max-w-xl opacity-80">{{ $props['body'] }}</p>
            @endif
        </div>
        @if (! empty($props['ctaLabel']))
            <a href="{{ $props['ctaHref'] ?: '#' }}"
               class="inline-flex h-11 shrink-0 items-center rounded-lg px-6 font-medium transition {{ $button }}">
                {{ $props['ctaLabel'] }}
            </a>
        @endif
    </div>
</section>
