{{--
    A CMS page, rendered inside the storefront shell.

    `$html` is the block document already rendered by BlockRenderer; this view's only job is to put
    it in the right place and to give the page a heading when none of its blocks provides one.

    A hero (or a hero slider) renders its own <h1>. Emitting a second one here would leave the page
    with two competing headings, so the quiet fallback only appears when the page has no hero.
--}}
@extends('site.layout', ['seo' => $seo ?? [], 'title' => $seo['title'] ?? $page->title])

@section('content')
    @unless ($headingProvided ?? false)
        <h1 class="sr-only">{{ $page->title }}</h1>
    @endunless

    {!! $html !!}
@endsection
