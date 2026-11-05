{{--
    The header: wordmark, the three-level menu, and the two things a visitor always needs.

    The mega panel is pure CSS — `group-hover` for the mouse, `group-focus-within` for the keyboard —
    so the menu works before any JavaScript loads, and the keyboard path is not an afterthought.
    Mobile collapses to a <details> disclosure for the same reason.

    `$items` is the tree from NavigationItem::HEADER, seeded from the IBPanel dump: level 1 is the
    top-level link, level 2 a column heading, level 3 the links inside that column.
--}}
@php
    $brandLogo = public_path('assets/brand/woodex-interior.svg');
    $currentPath = '/'.ltrim(request()->path(), '/');
    $isActive = static fn (string $url): bool => $url !== '#'
        && ($currentPath === $url || ($url !== '/' && str_starts_with($currentPath, rtrim($url, '/').'/')));

    $linkBase = 'relative flex items-center rounded-full px-3 py-2 text-sm font-medium transition';
    $linkIdle = 'text-ink/75 hover:bg-soft hover:text-ink';
    $linkOn = 'bg-soft text-ink';
@endphp
<header class="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-backdrop-filter:bg-paper/80">
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:h-20 lg:gap-8">

        <a href="/" class="flex shrink-0 items-center" aria-label="WoodEx Furniture — home">
            @if (is_file($brandLogo))
                <img src="/assets/brand/woodex-interior.svg" alt="WoodEx Furniture" class="h-7 w-auto lg:h-9">
            @else
                <span class="font-heading text-xl tracking-tight text-ink lg:text-2xl">WoodEx</span>
            @endif
        </a>

        <nav class="hidden items-center gap-0.5 lg:flex" aria-label="Main">
            @foreach ($items as $item)
                <div class="group relative">
                    <a href="{{ $item['url'] }}"
                       @if ($isActive($item['url'])) aria-current="page" @endif
                       @if ($item['children'] !== []) aria-haspopup="true" @endif
                       class="{{ $linkBase }} {{ $isActive($item['url']) ? $linkOn : $linkIdle }}">
                        {{ $item['label'] }}
                        @if ($item['children'] !== [])
                            <svg class="ml-1 h-3.5 w-3.5 transition group-hover:rotate-180" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                <path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        @endif
                    </a>

                    @if ($item['children'] !== [])
                        <div class="pointer-events-none invisible absolute top-full left-0 z-50 pt-2 opacity-0 transition duration-150 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100">
                            @if ($item['is_mega'])
                                {{-- Level 2 becomes a column; level 3 the links under it. --}}
                                <div class="w-[min(90vw,60rem)] rounded-2xl border border-line bg-paper p-6 shadow-xl shadow-ink/5">
                                    <div class="grid grid-cols-2 gap-x-6 gap-y-7 md:grid-cols-3 xl:grid-cols-4">
                                        @foreach ($item['children'] as $column)
                                            <div>
                                                <a href="{{ $column['url'] }}" class="text-sm font-semibold text-ink hover:text-wood-700">
                                                    {{ $column['label'] }}
                                                </a>
                                                @if ($column['children'] !== [])
                                                    <ul class="mt-2.5 space-y-1.5">
                                                        @foreach ($column['children'] as $link)
                                                            <li>
                                                                <a href="{{ $link['url'] }}" class="text-[13px] text-muted transition hover:text-wood-700">
                                                                    {{ $link['label'] }}
                                                                </a>
                                                            </li>
                                                        @endforeach
                                                    </ul>
                                                @endif
                                            </div>
                                        @endforeach
                                    </div>
                                </div>
                            @else
                                <ul class="min-w-56 rounded-xl border border-line bg-paper p-2 shadow-xl shadow-ink/5">
                                    @foreach ($item['children'] as $child)
                                        <li>
                                            <a href="{{ $child['url'] }}" class="block rounded-lg px-3 py-2 text-sm text-ink/80 transition hover:bg-soft hover:text-ink">
                                                {{ $child['label'] }}
                                            </a>
                                        </li>
                                    @endforeach
                                </ul>
                            @endif
                        </div>
                    @endif
                </div>
            @endforeach
        </nav>

        <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
            <a href="/cart" class="relative flex h-10 w-10 items-center justify-center rounded-full text-ink/75 transition hover:bg-soft hover:text-ink" aria-label="Cart">
                <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 8H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="10" cy="20" r="1.4" fill="currentColor"/>
                    <circle cx="18" cy="20" r="1.4" fill="currentColor"/>
                </svg>
            </a>

            <a href="/e-quotation"
               class="hidden h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:bg-navy-800 sm:inline-flex">
                Get a quotation
            </a>

            <details class="group/mobile lg:hidden">
                <summary class="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-ink/75 transition hover:bg-soft hover:text-ink [&::-webkit-details-marker]:hidden" aria-label="Open menu">
                    <svg class="h-5 w-5 group-open/mobile:hidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>
                    <svg class="hidden h-5 w-5 group-open/mobile:block" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                    </svg>
                </summary>

                <div class="absolute inset-x-0 top-full max-h-[75vh] overflow-y-auto border-b border-line bg-paper p-4 shadow-xl shadow-ink/5">
                    <ul class="divide-y divide-line/70">
                        @foreach ($items as $item)
                            <li class="py-1">
                                @if ($item['children'] === [])
                                    <a href="{{ $item['url'] }}" class="block px-2 py-2.5 text-sm font-medium text-ink">{{ $item['label'] }}</a>
                                @else
                                    <details class="group/sub">
                                        <summary class="flex cursor-pointer list-none items-center justify-between px-2 py-2.5 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
                                            {{ $item['label'] }}
                                            <svg class="h-3.5 w-3.5 text-muted transition group-open/sub:rotate-180" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                                <path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                                            </svg>
                                        </summary>
                                        <div class="pb-2 pl-2">
                                            @foreach ($item['children'] as $column)
                                                <div class="py-1.5">
                                                    <a href="{{ $column['url'] }}" class="text-[13px] font-medium text-ink/90">{{ $column['label'] }}</a>
                                                    @if ($column['children'] !== [])
                                                        <ul class="mt-1 space-y-1 pl-3">
                                                            @foreach ($column['children'] as $link)
                                                                <li><a href="{{ $link['url'] }}" class="block py-0.5 text-[13px] text-muted">{{ $link['label'] }}</a></li>
                                                            @endforeach
                                                        </ul>
                                                    @endif
                                                </div>
                                            @endforeach
                                        </div>
                                    </details>
                                @endif
                            </li>
                        @endforeach
                    </ul>

                    <a href="/e-quotation" class="mt-3 flex h-11 items-center justify-center rounded-full bg-ink text-sm font-medium text-paper">
                        Get a quotation
                    </a>
                </div>
            </details>
        </div>
    </div>
</header>
