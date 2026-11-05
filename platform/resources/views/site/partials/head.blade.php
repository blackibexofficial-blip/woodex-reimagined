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

{{-- The stylesheet the build made, if there is one. --}}
@if ($siteCss !== null && is_file(public_path('build/'.$siteCss)))
    <link rel="stylesheet" href="/build/{{ $siteCss }}">
@elseif (is_file(public_path('build/assets/site.css')))
    <link rel="stylesheet" href="/build/assets/site.css">
@endif

{{--
    The theme tokens, always, and always last.

    This used to live in the `@else` branch above — so it was linked only when no built stylesheet
    existed, which is never the case in a real deployment. The Theme Builder's tokens were saved,
    cached, given a fresh hashed URL… and never loaded, so every colour in that screen changed nothing. Last, because these are the custom properties `site.css` reads: a default defined in the
    build must be overridable by the row someone edited.
--}}
@php
    $themeHref = '/assets/theme.css';
    try {
        $themeHref = app(\App\Domain\Website\Support\ThemeCss::class)->url();
    } catch (\Throwable) {
        // A theme that cannot be rendered must not take the page with it.
    }
@endphp
<link rel="stylesheet" href="{{ $themeHref }}">

{{--
    The properties the theme stylesheet declares differently from this build.

    `ThemeCss::DERIVED` bridges the shop's variables to the theme's — `--color-navy-900: var(--navy)`,
    `--color-wood-500: var(--wood)` and so on. The colour names are seeded now (ThemeTokensSeeder), so
    those resolve. Four cannot be bridged, and each one is wrong in its own way:

      * `--font-sans: var(--wx-font)` and `--font-heading: var(--wx-font)` — `--wx-font` is not a token,
        and an undefined `var()` is invalid at computed-value time, so `--default-font-family` inherits it
        and the shop drops Inter and Nohemi for the browser's defaults;
      * `--color-muted: var(--muted)` — `text-muted` is a *text* class throughout the section templates,
        but `--muted` in the shadcn vocabulary is a *surface*. Bridged, it paints footer links, captions
        and card copy in #F5F5F5: forty-one elements a page, white on white. Measured, not guessed;
      * `--color-body: var(--muted)` — the same collision one property over.

    Restating them costs nothing and the theme keeps every colour that means something. Anything the
    owner edits that this file has not pinned still flows straight through.
--}}
<style>
    :root {
        --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
        --font-heading: "Nohemi", "Inter", Arial, sans-serif;
        --color-muted: var(--muted-foreground);
        --color-body: var(--muted-foreground);
    }
</style>
