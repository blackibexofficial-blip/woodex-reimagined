@php
    /**
     * Binds live catalog data at render time. The block stores a query, so a price change or a
     * new product appears without republishing the page — which is the whole reason this
     * exists rather than a hand-placed image grid.
     *
     * $products is supplied by the page composer; an empty array renders nothing at all rather
     * than an empty section with a heading, because a "Selected pieces" title over blank space
     * looks broken on a live site.
     */
    $products = $products ?? [];
    $limit = (int) ($props['limit'] ?? 8);
    $products = array_slice($products, 0, $limit);
@endphp
@if ($products !== [])
<section class="mx-auto max-w-6xl px-6 py-16">
    @if (! empty($props['heading']))
        <h2 class="mb-8 font-heading text-3xl font-normal text-navy-900 dark:text-white">{{ $props['heading'] }}</h2>
    @endif
    <div class="grid grid-cols-2 gap-5 lg:grid-cols-4">
        @foreach ($products as $product)
            <article class="group">
                <a href="{{ $product['url'] }}" class="block overflow-hidden rounded-xl bg-sand-100 dark:bg-white/5">
                    @if (! empty($product['image']))
                        <img src="{{ $product['image'] }}"
                             @if (! empty($product['image_srcset'])) srcset="{{ $product['image_srcset'] }}" sizes="(min-width: 1024px) 25vw, 50vw" @endif
                             alt="{{ $product['name'] }}" loading="lazy" width="800" height="800"
                             class="aspect-square w-full object-cover transition duration-500 group-hover:scale-[1.03]">
                    @else
                        <div class="aspect-square w-full"></div>
                    @endif
                </a>
                <div class="mt-3">
                    <h3 class="text-theme-sm font-medium text-navy-900 dark:text-white">
                        <a href="{{ $product['url'] }}">{{ $product['name'] }}</a>
                    </h3>
                    <p class="mt-1 text-theme-sm text-gray-600 dark:text-gray-400">
                        {{ $product['price'] }}
                        @if (! empty($product['compare_at']))
                            <span class="ml-2 text-theme-xs text-gray-400 line-through">{{ $product['compare_at'] }}</span>
                        @endif
                    </p>
                    @if (empty($product['in_stock']))
                        <p class="mt-1 text-theme-xs text-warning-600">Made to order</p>
                    @endif
                </div>
            </article>
        @endforeach
    </div>
</section>
@endif
