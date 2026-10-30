@php
    $items = array_slice($faqs ?? [], 0, (int) ($props['limit'] ?? 6));
    $emitSchema = (bool) ($props['emitSchema'] ?? true);
@endphp
@if ($items !== [])
<section class="mx-auto max-w-3xl px-6 py-16">
    @if (! empty($props['heading']))
        <h2 class="mb-8 font-heading text-3xl font-normal text-navy-900 dark:text-white">{{ $props['heading'] }}</h2>
    @endif
    <div class="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        @foreach ($items as $item)
            <details class="group py-4" @if ($loop->first) open @endif>
                <summary class="flex cursor-pointer items-center justify-between gap-4 text-theme-lg font-medium text-navy-900 marker:content-none dark:text-white">
                    {{ $item['question'] }}
                    <span class="text-gray-400 transition group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p class="mt-3 text-theme-sm leading-relaxed text-gray-600 dark:text-gray-400">{{ $item['answer'] }}</p>
            </details>
        @endforeach
    </div>
</section>

@if ($emitSchema)
    {{-- Structured data so these questions can appear as a rich result. Plain JSON-LD, no script tag escaping games. --}}
    <script type="application/ld+json">
        {!! json_encode([
            '@context' => 'https://schema.org',
            '@type' => 'FAQPage',
            'mainEntity' => array_map(static fn (array $item): array => [
                '@type' => 'Question',
                'name' => $item['question'],
                'acceptedAnswer' => ['@type' => 'Answer', 'text' => $item['answer']],
            ], $items),
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) !!}
    </script>
@endif
@endif
