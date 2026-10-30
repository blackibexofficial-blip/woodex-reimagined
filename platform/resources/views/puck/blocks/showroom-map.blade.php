@php
    $locations = array_slice($showrooms ?? [], 0, (int) ($props['limit'] ?? 3));
@endphp
@if ($locations !== [])
<section class="mx-auto max-w-6xl px-6 py-16">
    @if (! empty($props['heading']))
        <h2 class="mb-8 font-heading text-3xl font-normal text-navy-900 dark:text-white">{{ $props['heading'] }}</h2>
    @endif
    <div class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        @foreach ($locations as $location)
            <article class="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
                <h3 class="font-heading text-xl text-navy-900 dark:text-white">{{ $location['name'] }}</h3>
                @if (! empty($location['city']))
                    <p class="mt-1 text-theme-xs uppercase tracking-wide text-wood-600">{{ $location['city'] }}</p>
                @endif
                <p class="mt-3 text-theme-sm text-gray-600 dark:text-gray-400">{{ $location['address'] }}</p>
                @if (! empty($location['phone']))
                    <a href="tel:{{ $location['phone'] }}"
                       class="mt-3 inline-block text-theme-sm font-medium text-navy-900 hover:text-wood-600 dark:text-white">
                        {{ $location['phone'] }}
                    </a>
                @endif
                <a href="/showrooms#{{ $location['slug'] }}"
                   class="mt-4 inline-flex items-center gap-1.5 text-theme-sm font-medium text-wood-700 hover:text-wood-800 dark:text-wood-300">
                    Book a visit
                    <span aria-hidden="true">→</span>
                </a>
            </article>
        @endforeach
    </div>
</section>
@endif
