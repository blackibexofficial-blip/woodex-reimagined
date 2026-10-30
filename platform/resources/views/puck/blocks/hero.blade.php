@php
    $align = ($props['align'] ?? 'left') === 'center' ? 'text-center items-center mx-auto' : 'text-left items-start';
    $image = (string) ($props['image'] ?? '');
@endphp
<section class="relative isolate overflow-hidden bg-navy-900" aria-labelledby="hero-{{ $blockId }}">
    @if ($image !== '')
        <img src="{{ $image }}" alt="" loading="eager" fetchpriority="high"
             class="absolute inset-0 -z-10 h-full w-full object-cover opacity-45">
    @endif
    <div class="mx-auto flex min-h-[34rem] max-w-6xl flex-col justify-center gap-5 px-6 py-24 {{ $align }}">
        @if (! empty($props['eyebrow']))
            <p class="text-theme-xs font-medium uppercase tracking-[0.18em] text-wood-300">{{ $props['eyebrow'] }}</p>
        @endif
        <h1 id="hero-{{ $blockId }}" class="max-w-3xl font-heading text-4xl font-normal leading-tight text-white sm:text-5xl">
            {{ $props['heading'] }}
        </h1>
        @if (! empty($props['subheading']))
            <p class="max-w-2xl text-theme-lg text-white/75">{{ $props['subheading'] }}</p>
        @endif
        @if (! empty($props['ctaLabel']))
            <a href="{{ $props['ctaHref'] ?: '#' }}"
               class="mt-2 inline-flex h-12 items-center rounded-lg bg-wood-500 px-7 font-medium text-white transition hover:bg-wood-600">
                {{ $props['ctaLabel'] }}
            </a>
        @endif
    </div>
</section>
