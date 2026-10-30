{{--
    The shell around a Puck page.

    Deliberately thin: one <h1> for the page, the rendered blocks, nothing else. Everything a
    visitor sees comes from a block, so the editor has full control of the body without ever
    touching a Blade file — which is the entire point of having a builder.

    `$seo` is the page's seo JSON cast; every key is optional, and a missing one simply does
    not emit a tag rather than emitting an empty one.
--}}
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $seo['title'] ?? $page->title }}</title>

    @if (! empty($seo['description']))
        <meta name="description" content="{{ $seo['description'] }}">
    @endif

    @if (! empty($seo['canonical']))
        <link rel="canonical" href="{{ $seo['canonical'] }}">
    @endif

    @if (! empty($seo['robots']))
        <meta name="robots" content="{{ $seo['robots'] }}">
    @endif

    <meta property="og:type" content="website">
    <meta property="og:title" content="{{ $seo['title'] ?? $page->title }}">
    @if (! empty($seo['description']))
        <meta property="og:description" content="{{ $seo['description'] }}">
    @endif
    @if (! empty($seo['og_image']))
        <meta property="og:image" content="{{ $seo['og_image'] }}">
    @endif

    {{--
        The storefront's compiled Tailwind, which is where the tokens the block views use
        (navy-900, wood-500, sand-100, font-heading) are defined. Guarded because a fresh
        install has no manifest yet: a page without a stylesheet is ugly, a page that throws
        a Vite exception is down.
    --}}
    @if (is_file(public_path('build/manifest.json')))
        @vite(['resources/css/app.css'])
    @endif
</head>
<body class="bg-sand-50 font-body text-navy-900 antialiased dark:bg-navy-950 dark:text-white">
    <a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>

    <main id="main">
        {{--
            A hero block renders its own <h1>. Emitting a second one here would give the page
            two headings and no clear title, so the quiet fallback only appears on pages
            without a hero.
        --}}
        @unless ($headingProvided ?? false)
            <h1 class="sr-only">{{ $page->title }}</h1>
        @endunless

        {!! $html !!}
    </main>
</body>
</html>
