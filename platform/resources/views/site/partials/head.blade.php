{{--
    The <head> for every storefront page: title, description, social tags and the stylesheet.

    Stylesheet resolution is deliberately forgiving. `@vite()` throws when the manifest exists but
    does not contain the entry being asked for — and the storefront stylesheet is `site.css`, not the
    entry some pages assumed — so the manifest is read and the file checked before linking, with two
    fallbacks. A page with the wrong stylesheet is ugly; a page that throws is down.
--}}
@php
    $seo = is_array($seo ?? null) ? $seo : [];
    $pageTitle = $title ?? ($seo['title'] ?? config('app.name'));
    $description = $seo['description'] ?? null;
    $ogImage = $seo['og_image'] ?? null;

    $buildManifest = public_path('build/manifest.json');
    $siteCss = null;
    if (is_file($buildManifest)) {
        $decoded = json_decode((string) file_get_contents($buildManifest), true);
        $entry = is_array($decoded) ? ($decoded['resources/css/site.css'] ?? null) : null;
        $siteCss = is_array($entry) ? ($entry['file'] ?? null) : null;
    }
@endphp
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $pageTitle }}</title>

@if (! empty($description))
    <meta name="description" content="{{ $description }}">
@endif

@if (! empty($seo['canonical']))
    <link rel="canonical" href="{{ $seo['canonical'] }}">
@endif

@if (! empty($seo['robots']))
    <meta name="robots" content="{{ $seo['robots'] }}">
@endif

<meta property="og:type" content="website">
<meta property="og:title" content="{{ $pageTitle }}">
@if (! empty($description))
    <meta property="og:description" content="{{ $description }}">
@endif
@if (! empty($ogImage))
    <meta property="og:image" content="{{ $ogImage }}">
@endif

@if ($siteCss !== null && is_file(public_path('build/'.$siteCss)))
    <link rel="stylesheet" href="/build/{{ $siteCss }}">
@elseif (is_file(public_path('build/assets/site.css')))
    <link rel="stylesheet" href="/build/assets/site.css">
@else
    <link rel="stylesheet" href="/assets/theme.css">
@endif
