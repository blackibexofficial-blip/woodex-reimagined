@extends('site.layout')

@php
    use App\Domain\Commerce\Support\Money;

    $gallery = $product['images'] !== [] ? $product['images'] : array_values(array_filter([$product['image']]));
    $lead = $gallery[0] ?? null;

    $price = Money::ofMinor((int) $product['price_minor'])->format();
    $was = $product['compare_at_minor'] !== null
        ? Money::ofMinor((int) $product['compare_at_minor'])->format()
        : null;

    $quoteUrl = '/quotation?product='.urlencode((string) $product['slug']);
@endphp

@section('content')
<div class="mx-auto max-w-6xl px-6 pb-20">

    <nav aria-label="Breadcrumb" class="py-6 text-theme-xs text-gray-500 dark:text-gray-400">
        <a href="/" class="hover:text-navy-900 dark:hover:text-white">Home</a>
        <span aria-hidden="true">/</span>
        <a href="/shop" class="hover:text-navy-900 dark:hover:text-white">Shop</a>
        @if (! empty($product['category_slug']))
            <span aria-hidden="true">/</span>
            <a href="/category/{{ $product['category_slug'] }}" class="hover:text-navy-900 dark:hover:text-white">{{ $product['category'] }}</a>
        @endif
        <span aria-hidden="true">/</span>
        <span class="text-navy-900 dark:text-white">{{ $product['name'] }}</span>
    </nav>

    <div class="grid grid-cols-1 gap-10 lg:grid-cols-2">

        {{-- Gallery. Thumbnails are anchors, so the page works with JavaScript off. --}}
        <div>
            <div class="overflow-hidden rounded-xl bg-sand-100 dark:bg-white/5">
                @if ($lead !== null)
                    <img src="{{ $lead }}" alt="{{ $product['name'] }}" width="1000" height="1000"
                         class="aspect-square w-full object-cover" fetchpriority="high">
                @else
                    <div class="flex aspect-square w-full items-center justify-center text-theme-sm text-gray-400">
                        Photograph to follow
                    </div>
                @endif
            </div>

            @if (count($gallery) > 1)
                <div class="mt-3 grid grid-cols-5 gap-3">
                    @foreach ($gallery as $index => $image)
                        <a href="{{ $image }}" target="_blank" rel="noopener"
                           class="block overflow-hidden rounded-lg bg-sand-100 dark:bg-white/5">
                            <img src="{{ $image }}" alt="{{ $product['name'] }} — view {{ $index + 1 }}"
                                 loading="lazy" width="200" height="200" class="aspect-square w-full object-cover">
                        </a>
                    @endforeach
                </div>
            @endif
        </div>

        <div>
            @if (! empty($product['series']))
                <p class="text-theme-xs tracking-wider text-gray-500 uppercase dark:text-gray-400">{{ $product['series'] }}</p>
            @endif

            <h1 class="mt-2 font-heading text-3xl font-normal text-navy-900 dark:text-white">{{ $product['name'] }}</h1>

            @if (! empty($product['summary']))
                <p class="mt-3 text-theme-sm text-gray-600 dark:text-gray-400">{{ $product['summary'] }}</p>
            @endif

            <div class="mt-5 flex flex-wrap items-baseline gap-3">
                <span class="text-2xl text-navy-900 dark:text-white">{{ $price }}</span>
                @if ($was !== null)
                    <span class="text-theme-sm text-gray-400 line-through">{{ $was }}</span>
                @endif
                @if ($product['discount_bp'] > 0)
                    <span class="rounded-full bg-sand-100 px-2 py-1 text-theme-xs text-navy-900 dark:bg-white/10 dark:text-white">
                        {{ intdiv((int) $product['discount_bp'], 100) }}% off
                    </span>
                @endif
            </div>

            <p class="mt-2 text-theme-xs {{ $product['in_stock'] ? 'text-success-600' : 'text-warning-600' }}">
                @if ($product['in_stock'])
                    In stock — {{ $product['available_qty'] }} available
                @else
                    Made to order — {{ $product['lead_time_days'] }} day lead time
                @endif
            </p>

            {{-- Quote-led commerce: the primary action is a quotation, not a checkout. --}}
            <a href="{{ $quoteUrl }}"
               class="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-navy-900 px-6 py-4 text-theme-sm font-medium text-white transition hover:bg-navy-800 sm:w-auto">
                Request a quotation
            </a>

            <dl class="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-gray-200 pt-6 text-theme-sm dark:border-white/10">
                <div>
                    <dt class="text-theme-xs text-gray-500 dark:text-gray-400">SKU</dt>
                    <dd class="text-navy-900 dark:text-white">{{ $product['sku'] }}</dd>
                </div>
                @if (! empty($product['warranty_months']))
                    <div>
                        <dt class="text-theme-xs text-gray-500 dark:text-gray-400">Warranty</dt>
                        <dd class="text-navy-900 dark:text-white">{{ $product['warranty_months'] }} months</dd>
                    </div>
                @endif
                @if (! empty($product['lead_time_days']))
                    <div>
                        <dt class="text-theme-xs text-gray-500 dark:text-gray-400">Lead time</dt>
                        <dd class="text-navy-900 dark:text-white">{{ $product['lead_time_days'] }} days</dd>
                    </div>
                @endif
                @if (! empty($product['materials']))
                    <div>
                        <dt class="text-theme-xs text-gray-500 dark:text-gray-400">Materials</dt>
                        <dd class="text-navy-900 dark:text-white">{{ implode(', ', $product['materials']) }}</dd>
                    </div>
                @endif
            </dl>

            @if ($product['colors'] !== [])
                <div class="mt-6">
                    <p class="text-theme-xs text-gray-500 dark:text-gray-400">Colours</p>
                    <ul class="mt-2 flex flex-wrap gap-2">
                        @foreach ($product['colors'] as $colour)
                            <li class="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-theme-xs dark:border-white/15">
                                @if (! empty($colour['hex']))
                                    <span class="inline-block size-3 rounded-full border border-black/10" style="background: {{ $colour['hex'] }}"></span>
                                @endif
                                <span class="text-navy-900 dark:text-white">{{ $colour['name'] }}</span>
                            </li>
                        @endforeach
                    </ul>
                </div>
            @endif
        </div>
    </div>

    {{-- Long-form content. Both sections are dropped entirely when empty rather than left as headings. --}}
    @if (! empty($product['description']) || $product['specifications'] !== [] || $product['features'] !== [])
        <div class="mt-16 grid grid-cols-1 gap-10 border-t border-gray-200 pt-10 lg:grid-cols-3 dark:border-white/10">

            <section class="lg:col-span-2">
                <h2 class="font-heading text-2xl font-normal text-navy-900 dark:text-white">About this piece</h2>
                @if (! empty($product['description']))
                    <div class="prose prose-sm mt-4 max-w-none text-gray-600 dark:text-gray-400">
                        {!! nl2br(e($product['description'])) !!}
                    </div>
                @endif

                @if ($product['features'] !== [])
                    <ul class="mt-5 space-y-2 text-theme-sm text-gray-600 dark:text-gray-400">
                        @foreach ($product['features'] as $feature)
                            <li class="flex gap-2">
                                <span aria-hidden="true" class="text-navy-900 dark:text-white">—</span>
                                <span>{{ $feature }}</span>
                            </li>
                        @endforeach
                    </ul>
                @endif
            </section>

            @if ($product['specifications'] !== [])
                <section>
                    <h2 class="font-heading text-2xl font-normal text-navy-900 dark:text-white">Specification</h2>
                    <dl class="mt-4 divide-y divide-gray-200 text-theme-sm dark:divide-white/10">
                        @foreach ($product['specifications'] as $row)
                            <div class="flex justify-between gap-4 py-2">
                                <dt class="text-gray-500 dark:text-gray-400">{{ $row['label'] }}</dt>
                                <dd class="text-right text-navy-900 dark:text-white">{{ $row['value'] }}</dd>
                            </div>
                        @endforeach
                    </dl>
                </section>
            @endif
        </div>
    @endif

    @if ($related !== [])
        <section class="mt-16">
            <h2 class="mb-6 font-heading text-2xl font-normal text-navy-900 dark:text-white">More from {{ $product['category'] ?? 'this collection' }}</h2>
            <div class="grid grid-cols-2 gap-5 lg:grid-cols-4">
                @foreach ($related as $item)
                    <article class="group">
                        <a href="{{ $item['url'] }}" class="block overflow-hidden rounded-xl bg-sand-100 dark:bg-white/5">
                            @if (! empty($item['image']))
                                <img src="{{ $item['image'] }}" alt="{{ $item['name'] }}" loading="lazy" width="800" height="800"
                                     class="aspect-square w-full object-cover transition duration-500 group-hover:scale-[1.03]">
                            @else
                                <div class="aspect-square w-full"></div>
                            @endif
                        </a>
                        <h3 class="mt-3 text-theme-sm font-medium text-navy-900 dark:text-white">
                            <a href="{{ $item['url'] }}">{{ $item['name'] }}</a>
                        </h3>
                        <p class="mt-1 text-theme-sm text-gray-600 dark:text-gray-400">{{ $item['price'] }}</p>
                    </article>
                @endforeach
            </div>
        </section>
    @endif
</div>
@endsection
