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
        (navy-900, wood-500, sand-100, font-heading) are defined.

        `@vite()` was guarded by "does the manifest file exist", which is the wrong question:
        the manifest exists on every build and does not necessarily contain the entry being
        asked for. It requested `resources/css/app.css`, that entry does not exist (the
        storefront stylesheet is `site.css`), and every block page returned a ViteException —
        which looks like a broken builder rather than a missing stylesheet.

        So the entry is looked up in the manifest, and if it is absent the page falls back to
        the plain asset path, then to the theme route. A page with no stylesheet is ugly; a
        page that throws is down.
    --}}
    @php
        $buildManifest = public_path('build/manifest.json');
        $siteCss = null;
        if (is_file($buildManifest)) {
            $decoded = json_decode((string) file_get_contents($buildManifest), true);
            $entry = is_array($decoded) ? ($decoded['resources/css/site.css'] ?? null) : null;
            $siteCss = is_array($entry) ? ($entry['file'] ?? null) : null;
        }
    @endphp
    @if ($siteCss !== null && is_file(public_path('build/'.$siteCss)))
        <link rel="stylesheet" href="/build/{{ $siteCss }}">
    @elseif (is_file(public_path('build/assets/site.css')))
        <link rel="stylesheet" href="/build/assets/site.css">
    @else
        <link rel="stylesheet" href="/assets/theme.css">
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
