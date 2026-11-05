{{--
    "Market we serve": the five things Woodex does for a workspace, as cards.

    On the legacy site these were five Bootstrap cards with borrowed icons. Here each card is a row
    in a `list` field, so the owner adds a sixth service or rewrites a line without a deploy, and the
    card carries no icon font — the index number doubles as the visual anchor.
--}}
@php
    $cards = is_array($props['cards'] ?? null) ? $props['cards'] : [];
    $cards = array_values(array_filter($cards, static fn ($c) => is_array($c) && trim((string) ($c['title'] ?? '')) !== ''));
    $count = count($cards);
@endphp

@if ($count > 0)
    <section class="bg-paper py-20" aria-labelledby="mws-{{ $blockId }}">
        <div class="mx-auto max-w-7xl px-6">
            <div class="max-w-2xl">
                <h2 id="mws-{{ $blockId }}" class="font-heading text-3xl text-ink sm:text-4xl">
                    {{ $props['heading'] ?? 'Market We Served' }}
                </h2>
                @if (! empty($props['intro']))
                    <p class="mt-3 text-base leading-relaxed text-muted">{{ $props['intro'] }}</p>
                @endif
            </div>

            <ul class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                @foreach ($cards as $i => $card)
                    @php
                        $href = trim((string) ($card['url'] ?? ''));
                    @endphp
                    <li class="group relative flex flex-col rounded-2xl border border-line bg-soft/60 p-6 transition hover:-translate-y-0.5 hover:border-wood-200 hover:bg-paper hover:shadow-lg hover:shadow-ink/5">
                        <span class="font-heading text-sm text-wood-500">{{ str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT) }}</span>

                        <h3 class="mt-3 font-heading text-lg text-ink">
                            @if ($href !== '')
                                {{-- The stretched link makes the whole card clickable without nesting an <a> in a heading twice. --}}
                                <a href="{{ $href }}" class="after:absolute after:inset-0 after:content-['']">{{ $card['title'] }}</a>
                            @else
                                {{ $card['title'] }}
                            @endif
                        </h3>

                        @if (! empty($card['body']))
                            <p class="mt-2 text-sm leading-relaxed text-muted">{{ $card['body'] }}</p>
                        @endif

                        @if ($href !== '')
                            <span aria-hidden="true" class="mt-auto pt-4 text-sm text-wood-600 transition group-hover:translate-x-0.5">&rarr;</span>
                        @endif
                    </li>
                @endforeach
            </ul>
        </div>
    </section>
@endif
