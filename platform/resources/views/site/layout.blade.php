{{--
    The shared storefront shell.

    Every published page renders inside this: one top bar, one header with the mega menu, one footer.
    The page itself supplies only its body — an ordered list of blocks — which is what lets the editor
    own all the content without ever being able to break the chrome.

    The shell is injected rather than passed by every controller, so a page written tomorrow (or a
    page served from a static file) gets the same header without knowing this class exists.
--}}
@inject('shellComposer', 'App\Domain\Website\Shell\ShellComposer')
@php
    $shell = $shellComposer->shell();
@endphp
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    @include('site.partials.head', ['seo' => $seo ?? [], 'title' => $title ?? null])
</head>
<body class="bg-paper font-sans text-body antialiased">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-paper">
        Skip to content
    </a>

    @include('site.partials.topbar', ['topbar' => $shell['topbar']])
    @include('site.partials.header', ['items' => $shell['header']])

    <main id="main">
        @yield('content')
    </main>

    @include('site.partials.footer', ['footer' => $shell['footer']])
</body>
</html>
