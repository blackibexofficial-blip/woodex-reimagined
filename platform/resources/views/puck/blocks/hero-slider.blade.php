{{--
    Full-width hero slides.

    Built as a horizontal scroll-snap track rather than a carousel library: with no JavaScript at all
    a visitor can still swipe through every slide, on any device, and the page never depends on a
    failed script to show its own headline. The small script below only adds the two things that do
    need JS — the arrow buttons and the timer — and steps aside for `prefers-reduced-motion`.

    Autoplay is off unless the block says otherwise (0 = manual). An auto-rotating hero that nobody
    asked for is a hero nobody finishes reading.
--}}
@php
    $slides = is_array($props['slides'] ?? null) ? $props['slides'] : [];
    $slides = array_values(array_filter($slides, static fn ($s) => is_array($s) && trim((string) ($s['heading'] ?? '')) !== ''));
    $height = match ($props['height'] ?? 'tall') {
        'compact' => 'min-h-[22rem]',
        'normal' => 'min-h-[30rem]',
        default => 'min-h-[34rem] sm:min-h-[38rem]',
    };
    $autoplay = (int) ($props['autoplaySeconds'] ?? 0);
    $uid = 'hero-'.$blockId;
@endphp

@if ($slides !== [])
    <section class="relative isolate bg-navy-950" aria-roledescription="carousel" aria-label="Highlights">
        <div id="{{ $uid }}"
             class="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
             @if ($autoplay > 0) data-autoplay="{{ $autoplay }}" @endif>

            @foreach ($slides as $i => $slide)
                @php
                    $align = match ($slide['align'] ?? 'left') {
                        'center' => 'items-center text-center mx-auto',
                        'right' => 'items-end text-right ml-auto',
                        default => 'items-start text-left',
                    };
                    // An image only renders if it can actually be served: an absolute URL, or a file
                    // that exists under public/. The legacy media is fetched from the old host in a
                    // separate step, so before that step the hero is a clean gradient rather than a
                    // broken-image icon over one.
                    $image = (string) ($slide['image'] ?? '');
                    $renderImage = $image !== '' && (
                        str_starts_with($image, 'http://')
                        || str_starts_with($image, 'https://')
                        || is_file(public_path(ltrim($image, '/')))
                    );
                    $headingId = $uid.'-'.($i + 1);
                @endphp

                <article class="relative w-full shrink-0 snap-center {{ $height }} isolate overflow-hidden"
                         role="group" aria-roledescription="slide"
                         aria-label="{{ $i + 1 }} of {{ count($slides) }}"
                         @if ($i > 0) aria-hidden="true" @endif>
                    @if ($renderImage)
                        <img src="{{ $image }}" alt="{{ $slide['imageAlt'] ?? '' }}" loading="{{ $i === 0 ? 'eager' : 'lazy' }}"
                             @if ($i === 0) fetchpriority="high" @endif
                             class="absolute inset-0 -z-20 h-full w-full object-cover">
                    @endif
                    {{-- A gradient, not a flat scrim: the left side stays readable, the furniture stays visible. --}}
                    <div class="absolute inset-0 -z-10 bg-linear-to-r from-navy-950/85 via-navy-950/55 to-navy-950/10"></div>

                    <div class="mx-auto flex h-full max-w-7xl flex-col justify-center gap-4 px-6 py-16 {{ $align }}">
                        <div class="max-w-2xl">
                            @if (! empty($slide['kicker']))
                                <p class="text-theme-xs font-medium tracking-[0.18em] text-wood-300 uppercase">{{ $slide['kicker'] }}</p>
                            @endif

                            <h1 id="{{ $headingId }}" class="mt-3 font-heading text-4xl leading-[1.08] font-normal text-white sm:text-5xl lg:text-6xl">
                                <span class="bg-linear-to-b from-white to-white/70 bg-clip-text text-transparent">
                                    {!! nl2br(e(trim((string) $slide['heading']))) !!}
                                </span>
                            </h1>

                            @if (! empty($slide['body']))
                                <p class="mt-4 max-w-xl text-base leading-relaxed text-white/75">{{ $slide['body'] }}</p>
                            @endif

                            @if (! empty($slide['ctaLabel']))
                                <a href="{{ $slide['ctaUrl'] ?: '/shop' }}"
                                   class="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-paper px-7 text-sm font-medium text-ink transition hover:-translate-y-0.5 hover:bg-beige">
                                    {{ $slide['ctaLabel'] }}
                                    <span aria-hidden="true">&rarr;</span>
                                </a>
                            @endif
                        </div>
                    </div>
                </article>
            @endforeach
        </div>

        @if (count($slides) > 1)
            <div class="pointer-events-none absolute inset-x-0 bottom-6 z-10">
                <div class="mx-auto flex max-w-7xl items-center justify-between px-6">
                    <div class="pointer-events-auto flex items-center gap-2">
                        @foreach ($slides as $i => $_)
                            <button type="button" data-slide-to="{{ $i }}"
                                    class="h-2.5 w-2.5 rounded-full bg-white/45 transition hover:bg-white aria-[current=true]:w-7 aria-[current=true]:bg-white"
                                    @if ($i === 0) aria-current="true" @endif
                                    aria-label="Go to slide {{ $i + 1 }}"></button>
                        @endforeach
                    </div>

                    <div class="pointer-events-auto flex items-center gap-2">
                        <button type="button" data-slide-prev
                                class="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-navy-950/40 text-white backdrop-blur transition hover:bg-navy-950/70"
                                aria-label="Previous slide">&larr;</button>
                        <button type="button" data-slide-next
                                class="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-navy-950/40 text-white backdrop-blur transition hover:bg-navy-950/70"
                                aria-label="Next slide">&rarr;</button>
                    </div>
                </div>
            </div>

            @if ($autoplay > 0)
                <script>
                    (() => {
                        const track = document.getElementById(@json($uid));
                        if (!track || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

                        const slides = [...track.querySelectorAll('[role="group"]')];
                        const dots = [...document.querySelectorAll('#' + @json($uid) + ' ~ * [data-slide-to]')];
                        const prev = document.querySelector('#' + @json($uid) + ' ~ * [data-slide-prev]');
                        const next = document.querySelector('#' + @json($uid) + ' ~ * [data-slide-next]');
                        if (slides.length < 2) return;

                        let index = 0;
                        const go = (i) => {
                            index = (i + slides.length) % slides.length;
                            slides[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
                            dots.forEach((d, n) => d.setAttribute('aria-current', n === index ? 'true' : 'false'));
                        };

                        dots.forEach((d, n) => d.addEventListener('click', () => go(n)));
                        prev?.addEventListener('click', () => go(index - 1));
                        next?.addEventListener('click', () => go(index + 1));

                        let timer = setInterval(() => go(index + 1), {{ max(3, $autoplay) * 1000 }});
                        const pause = () => clearInterval(timer);
                        const resume = () => { pause(); timer = setInterval(() => go(index + 1), {{ max(3, $autoplay) * 1000 }}); };

                        ['mouseenter', 'focusin', 'touchstart'].forEach((e) => track.addEventListener(e, pause, { passive: true }));
                        ['mouseleave', 'focusout'].forEach((e) => track.addEventListener(e, resume));
                        document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
                    })();
                </script>
            @endif
        @endif
    </section>
@endif
