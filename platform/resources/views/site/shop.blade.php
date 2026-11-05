@extends('site.layout')

@php
    use App\Domain\Commerce\Support\Money;

    $query = fn (array $overrides = []) => request()->fullUrlWithQuery($overrides);

    $sortLabels = [
        'featured' => 'Featured',
        'price_asc' => 'Price: low to high',
        'price_desc' => 'Price: high to low',
        'newest' => 'Newest',
        'name' => 'Name A–Z',
    ];

    $roots = $categories;
@endphp

@section('content')
<div class="mx-auto max-w-6xl px-6 pb-20">

    {{-- Heading and count. The count is the honest one: it is the filtered total, not the page size. --}}
    <header class="border-b border-gray-200 py-10 dark:border-white/10">
        <nav aria-label="Breadcrumb" class="mb-3 text-theme-xs text-gray-500 dark:text-gray-400">
            <a href="/" class="hover:text-navy-900 dark:hover:text-white">Home</a>
            <span aria-hidden="true">/</span>
            @if ($categorySlug === null)
                <span class="text-navy-900 dark:text-white">Shop</span>
            @else
                <a href="/shop" class="hover:text-navy-900 dark:hover:text-white">Shop</a>
                <span aria-hidden="true">/</span>
                <span class="text-navy-900 dark:text-white">{{ $heading }}</span>
            @endif
        </nav>

        <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
                <h1 class="font-heading text-3xl font-normal text-navy-900 dark:text-white">{{ $heading }}</h1>
                <p class="mt-2 text-theme-sm text-gray-600 dark:text-gray-400">
                    {{ $total }} {{ $total === 1 ? 'piece' : 'pieces' }}
                    @if ($search !== '')
                        matching “{{ $search }}”
                    @endif
                </p>
            </div>

            {{-- Sorting and stock filter are a plain GET form: no JavaScript, survives a reload. --}}
            <form method="get" action="{{ $categorySlug === null ? '/shop' : '/category/'.$categorySlug }}"
                  class="flex flex-wrap items-center gap-3">
                @if ($search !== '')
                    <input type="hidden" name="q" value="{{ $search }}">
                @endif

                <label class="sr-only" for="sort">Sort by</label>
                <select id="sort" name="sort" onchange="this.form.submit()"
                        class="rounded-lg border border-gray-300 bg-white px-3 py-2 text-theme-sm text-navy-900 dark:border-white/15 dark:bg-white/5 dark:text-white">
                    @foreach ($sorts as $key)
                        <option value="{{ $key }}" @selected($sort === $key)>{{ $sortLabels[$key] ?? $key }}</option>
                    @endforeach
                </select>

                <label class="flex items-center gap-2 text-theme-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" name="in_stock" value="1" onchange="this.form.submit()" @checked($inStockOnly)
                           class="rounded border-gray-300 text-navy-900">
                    In stock
                </label>

                <noscript>
                    <button type="submit" class="rounded-lg bg-navy-900 px-3 py-2 text-theme-sm text-white">Apply</button>
                </noscript>
            </form>
        </div>
    </header>

    <div class="grid grid-cols-1 gap-10 pt-8 lg:grid-cols-[220px_1fr]">

        {{-- Category rail. Counts come from the same tree the API serves. --}}
        <aside class="lg:sticky lg:top-6 lg:self-start">
            <h2 class="mb-3 text-theme-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">Categories</h2>
            <ul class="space-y-1 text-theme-sm">
                <li>
                    <a href="/shop" class="{{ $categorySlug === null ? 'font-medium text-navy-900 dark:text-white' : 'text-gray-600 hover:text-navy-900 dark:text-gray-400 dark:hover:text-white' }}">
                        All furniture
                    </a>
                </li>
                @foreach ($roots as $root)
                    <li>
                        {{-- No counts here: `categoryTree()` counts direct children while the listing
                             counts the whole subtree, so a badge said 50 on a page of 144. Showing a
                             wrong number is worse than showing none until both use one rule. --}}
                        <a href="/category/{{ $root['slug'] }}"
                           class="{{ $categorySlug === $root['slug'] ? 'font-medium text-navy-900 dark:text-white' : 'text-gray-600 hover:text-navy-900 dark:text-gray-400 dark:hover:text-white' }}">
                            {{ $root['name'] }}
                        </a>
                        @if (! empty($root['children']))
                            <ul class="mt-1 ml-3 space-y-1 border-l border-gray-200 pl-3 dark:border-white/10">
                                @foreach ($root['children'] as $child)
                                    <li>
                                        <a href="/category/{{ $child['slug'] }}"
                                           class="{{ $categorySlug === $child['slug'] ? 'font-medium text-navy-900 dark:text-white' : 'text-gray-600 hover:text-navy-900 dark:text-gray-400 dark:hover:text-white' }}">
                                            {{ $child['name'] }}
                                        </a>
                                    </li>
                                @endforeach
                            </ul>
                        @endif
                    </li>
                @endforeach
            </ul>
        </aside>

        <div>
            @if ($items === [])
                <div class="rounded-xl border border-dashed border-gray-300 p-12 text-center dark:border-white/15">
                    <p class="text-theme-sm text-gray-600 dark:text-gray-400">
                        Nothing in this category yet.
                        <a href="/shop" class="text-navy-900 underline dark:text-white">See the whole collection</a>.
                    </p>
                </div>
            @else
                <div class="grid grid-cols-2 gap-5 lg:grid-cols-3">
                    @foreach ($items as $product)
                        <article class="group">
                            <a href="{{ $product['url'] }}" class="block overflow-hidden rounded-xl bg-sand-100 dark:bg-white/5">
                                @if (! empty($product['image']))
                                    <img src="{{ $product['image'] }}"
                                         @if (! empty($product['image_srcset'])) srcset="{{ $product['image_srcset'] }}" sizes="(min-width: 1024px) 30vw, 50vw" @endif
                                         alt="{{ $product['name'] }}" loading="lazy" width="800" height="800"
                                         class="aspect-square w-full object-cover transition duration-500 group-hover:scale-[1.03]">
                                @else
                                    <div class="flex aspect-square w-full items-center justify-center text-theme-xs text-gray-400">
                                        Photograph to follow
                                    </div>
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

                @if ($pages > 1)
                    <nav class="mt-10 flex items-center justify-between border-t border-gray-200 pt-6 dark:border-white/10" aria-label="Pagination">
                        @if ($page > 1)
                            <a href="{{ $query(['page' => $page - 1]) }}" class="text-theme-sm text-navy-900 hover:underline dark:text-white">← Previous</a>
                        @else
                            <span class="text-theme-sm text-gray-400">← Previous</span>
                        @endif

                        <span class="text-theme-xs text-gray-500 dark:text-gray-400">Page {{ $page }} of {{ $pages }}</span>

                        @if ($page < $pages)
                            <a href="{{ $query(['page' => $page + 1]) }}" class="text-theme-sm text-navy-900 hover:underline dark:text-white">Next →</a>
                        @else
                            <span class="text-theme-sm text-gray-400">Next →</span>
                        @endif
                    </nav>
                @endif
            @endif
        </div>
    </div>
</div>
@endsection
