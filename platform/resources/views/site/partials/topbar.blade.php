{{--
    The sale strip above the header.

    Legacy kept this in `topbar_settings` with an on/off switch, and the switch is the important
    part: an empty or stale banner is worse than no banner, so nothing renders unless the owner has
    both switched it on and written a line.
--}}
@if ($topbar['is_active'] && trim($topbar['text']) !== '')
    <div class="bg-ink text-paper">
        <div class="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2 text-center text-xs tracking-[0.02em] sm:text-sm">
            <span>{{ $topbar['text'] }}</span>
            @if ($topbar['url'] !== '')
                <a href="{{ $topbar['url'] }}"
                   class="group inline-flex items-center gap-1 font-medium underline decoration-paper/40 underline-offset-4 transition hover:decoration-paper">
                    Shop now
                    <span aria-hidden="true" class="transition group-hover:translate-x-0.5">&rarr;</span>
                </a>
            @endif
        </div>
    </div>
@endif
