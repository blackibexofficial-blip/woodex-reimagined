{{--
    The footer: four content columns and a legal bar, all of it data.

    Structure came from the legacy theme's footer builder (footer_settings + footer_links) and is
    seeded from the IBPanel dump, so every word here — the tagline, the phone label, the three
    columns of links — is editable without a deploy.

    Two deliberate departures from the legacy markup:

      * Social links render as labelled chips, not Bootstrap Icons glyphs. The icon font went with the
        old theme and pulling in a whole icon set for four links is a cost the footer should not pay.
      * The payment logos only render if their directory exists, because those images are fetched
        from the old host at import time. Before the fetch, the strip hides itself instead of showing
        three broken images.
--}}
@php
    $paymentDir = public_path('assets/images/misc');
    $showPayments = $footer['payment_logos'] !== [] && is_dir($paymentDir);
    $year = date('Y');
@endphp
<footer class="mt-24 border-t border-line bg-soft">
    <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:py-16">
        <div class="grid gap-10 lg:grid-cols-12 lg:gap-8">

            <div class="lg:col-span-4">
                <p class="font-heading text-lg text-ink">{{ $footer['about_title'] }}</p>
                @if ($footer['about_tagline'] !== '')
                    <p class="mt-1 text-sm font-medium text-wood-700">{{ $footer['about_tagline'] }}</p>
                @endif
                @if ($footer['about_text'] !== '')
                    <div class="mt-3 max-w-sm text-sm leading-relaxed text-muted [&_p]:mb-2 [&_p:last-child]:mb-0">
                        {!! $footer['about_text'] !!}
                    </div>
                @endif

                @if ($footer['social_links'] !== [])
                    <div class="mt-6">
                        @if ($footer['social_label'] !== '')
                            <p class="text-xs font-medium tracking-wide text-muted uppercase">{{ $footer['social_label'] }}</p>
                        @endif
                        <ul class="mt-2 flex flex-wrap gap-2">
                            @foreach ($footer['social_links'] as $social)
                                <li>
                                    <a href="{{ $social['url'] ?? '#' }}" target="_blank" rel="noopener noreferrer"
                                       class="inline-flex items-center rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink/80 transition hover:border-wood-300 hover:text-wood-700">
                                        {{ $social['label'] ?? 'Follow' }}
                                    </a>
                                </li>
                            @endforeach
                        </ul>
                    </div>
                @endif
            </div>

            @foreach ($footer['columns'] as $column)
                <nav class="lg:col-span-2" aria-label="{{ $column['title'] }}">
                    <p class="text-sm font-semibold text-ink">{{ $column['title'] }}</p>
                    <ul class="mt-3 space-y-2">
                        @foreach ($column['items'] as $link)
                            <li>
                                <a href="{{ $link['url'] }}"
                                   @if ($link['target'] === '_blank') target="_blank" rel="noopener noreferrer" @endif
                                   class="text-sm text-muted transition hover:text-wood-700">{{ $link['label'] }}</a>
                            </li>
                        @endforeach
                    </ul>
                </nav>
            @endforeach

            <div class="lg:col-span-2">
                <p class="text-sm font-semibold text-ink">{{ $footer['contact_title'] }}</p>
                <ul class="mt-3 space-y-2 text-sm text-muted">
                    @if ($footer['address'] !== '')
                        <li class="leading-relaxed">{{ $footer['address'] }}</li>
                    @endif
                    @if ($footer['phone'] !== '')
                        <li>
                            <span class="text-xs text-muted/80">{{ $footer['phone_label'] }}</span><br>
                            <a href="tel:{{ preg_replace('/[^0-9+]/', '', $footer['phone']) }}" class="transition hover:text-wood-700">{{ $footer['phone'] }}</a>
                        </li>
                    @endif
                    @if ($footer['email'] !== '')
                        <li><a href="mailto:{{ $footer['email'] }}" class="transition hover:text-wood-700">{{ $footer['email'] }}</a></li>
                    @endif
                    @if ($footer['hours'] !== '')
                        <li class="text-xs text-muted/90">{{ $footer['hours'] }}</li>
                    @endif
                </ul>

                {{--
                    The newsletter form appears only once the subscribe route exists. Rendering an
                    input that posts nowhere is a worse lie than rendering no input at all; until
                    then the heading and placeholder stay seeded in settings, waiting.
                --}}
                @if (Route::has('newsletter.store'))
                    <form method="POST" action="{{ route('newsletter.store') }}" class="mt-6">
                        @csrf
                        <label for="newsletter-email" class="text-sm font-semibold text-ink">{{ $footer['newsletter_title'] }}</label>
                        <div class="mt-2 flex gap-2">
                            <input id="newsletter-email" type="email" name="email" required
                                   placeholder="{{ $footer['newsletter_placeholder'] }}"
                                   class="h-10 w-full min-w-0 rounded-full border border-line bg-paper px-4 text-sm text-ink placeholder:text-muted/70 focus:border-wood-400 focus:ring-2 focus:ring-wood-200 focus:outline-none">
                            <button type="submit" class="h-10 shrink-0 rounded-full bg-ink px-4 text-sm font-medium text-paper transition hover:bg-navy-800">
                                {{ $footer['newsletter_button'] }}
                            </button>
                        </div>
                    </form>
                @endif
            </div>
        </div>
    </div>

    <div class="border-t border-line/80">
        <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-5 text-xs text-muted sm:px-6 md:flex-row">
            <p>&copy; {{ $year }} {{ $footer['copyright'] }}</p>

            @if ($footer['legal_links'] !== [])
                <ul class="flex flex-wrap items-center gap-x-4 gap-y-1">
                    @foreach ($footer['legal_links'] as $legal)
                        <li><a href="{{ $legal['url'] ?? '#' }}" class="transition hover:text-wood-700">{{ $legal['title'] ?? '' }}</a></li>
                    @endforeach
                </ul>
            @endif

            @if ($showPayments)
                <div class="flex items-center gap-2">
                    <span class="text-[11px] tracking-wide text-muted/80 uppercase">{{ $footer['payment_label'] }}</span>
                    @foreach ($footer['payment_logos'] as $logo)
                        <img src="/{{ ltrim($logo['src'] ?? '', '/') }}" alt="{{ $logo['alt'] ?? '' }}" class="h-5 w-auto opacity-80" loading="lazy">
                    @endforeach
                </div>
            @endif
        </div>
    </div>
</footer>
