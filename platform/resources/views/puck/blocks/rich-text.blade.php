@php
    // The HTML comes from the editor's rich-text field, which is already sanitised on save.
    // It is echoed raw here so tags work; the sanitiser is the boundary, not this view.
    $measure = ($props['width'] ?? 'prose') === 'wide' ? 'max-w-5xl' : 'max-w-3xl';
@endphp
<section class="mx-auto {{ $measure }} px-6 py-16">
    <div class="prose prose-neutral max-w-none dark:prose-invert">
        {!! $props['html'] !!}
    </div>
</section>
