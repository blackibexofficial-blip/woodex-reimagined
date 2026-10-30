@php
    $categories = array_slice($categories ?? [], 0, (int) ($props['limit'] ?? 4));
@endphp
@if ($categories !== [])
<section class="mx-auto max-w-6xl px-6 py-16">
    @if (! empty($props['heading']))
        <h2 class="mb-8 font-heading text-3xl font-normal text-navy-900 dark:text-white">{{ $props['heading'] }}</h2>
    @endif
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        @foreach ($categories as $category)
            <a href="/shop/{{ $category['slug'] }}"
               class="group flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 transition hover:border-wood-400 hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03]">
                <span class="font-heading text-xl text-navy-900 dark:text-white">{{ $category['name'] }}</span>
                <span class="mt-6 text-theme-xs text-gray-500">
                    {{ $category['count'] }} {{ \Illuminate\Support\Str::plural('piece', (int) $category['count']) }}
                </span>
            </a>
        @endforeach
    </div>
</section>
@endif
