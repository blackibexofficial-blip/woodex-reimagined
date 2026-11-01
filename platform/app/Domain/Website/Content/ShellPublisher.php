<?php

declare(strict_types=1);

namespace App\Domain\Website\Content;

use RuntimeException;

/**
 * Writes the static shell for a published page (docs/08 INTEGRATION-MASTER-PLAN §3, §7.2).
 *
 * The storefront is a single-page application: one `index.html` boots React, and React draws whatever the
 * pathname asks for. That is fine for a visitor and invisible to a crawler, which reads one `<title>` and one
 * description for all 16 pages. This class fixes exactly that, without adding a runtime dependency:
 *
 *   1. `public/site/shell.html` keeps a pristine copy of the built SPA document.
 *   2. Publishing writes `public/<path>/index.html` — the same shell with this page's title, description,
 *      canonical, Open Graph tags and JSON-LD injected into the head.
 *   3. The web server answers that file directly. No PHP boots, no Node runs, and the SPA still takes over
 *      in the browser as soon as the script loads.
 *
 * Marker-delimited, so publishing twice replaces the block instead of stacking a second set of tags.
 */
final class ShellPublisher
{
    public const string START = '<!--wx:seo:start-->';

    public const string END = '<!--wx:seo:end-->';

    private readonly string $root;

    public function __construct(?string $webroot = null)
    {
        $this->root = rtrim($webroot ?? public_path(), '/');
    }

    public function root(): string
    {
        return $this->root;
    }

    /** Where the pristine copy lives, relative to the web root. */
    public function shellFile(): string
    {
        return $this->root.'/site/shell.html';
    }

    /**
     * Take a pristine copy of the built document, once — and again after a rebuild.
     *
     * Refuses to capture from an already-injected `index.html`: that would bake one page's title into every
     * other page for ever. The home page must be published from the copy, never from itself.
     *
     * "Once" was too literal. `public/index.html` names the built bundle by content hash, and a rebuild
     * replaces that file: the copy kept naming `front/index-<old>.js`, so every page published afterwards
     * linked a script that no longer existed and the storefront rendered as an empty `<div id="root">`.
     * A shell whose bundle is gone is therefore refreshed from the freshly installed build.
     */
    public function ensureShell(): bool
    {
        if (is_file($this->shellFile()) && ! $this->shellIsStale()) {
            return true;
        }

        $index = $this->root.'/index.html';

        if (! is_file($index)) {
            throw new RuntimeException('No built storefront to publish: '.$index.' is missing. Run the Vite build and install it first.');
        }

        $built = (string) file_get_contents($index);

        if (str_contains($built, self::START)) {
            throw new RuntimeException(
                'public/index.html is the published home page and the pristine shell is missing or stale, so there is '
                .'nothing clean to capture. Install the Vite build over public/ (index.html and front/) and run this again.'
            );
        }

        if (! is_dir(dirname($this->shellFile())) && ! mkdir(dirname($this->shellFile()), 0o775, true) && ! is_dir(dirname($this->shellFile()))) {
            throw new RuntimeException('Cannot create '.dirname($this->shellFile()));
        }

        file_put_contents($this->shellFile(), $built);

        return true;
    }

    /** The bundle the document boots (`/front/index-<hash>.js`), or null when it is built some other way. */
    private function entryOf(string $html): ?string
    {
        return preg_match('#/front/index-[A-Za-z0-9_-]+\.js#', $html, $matches) === 1 ? $matches[0] : null;
    }

    /** True when the pristine copy names a bundle this installation no longer has. */
    private function shellIsStale(): bool
    {
        $entry = $this->entryOf((string) file_get_contents($this->shellFile()));

        return $entry !== null && ! is_file($this->root.$entry);
    }

    /**
     * The shell with one page's head applied.
     *
     * @param  array{title: string, description?: string, canonical?: string, image?: string,
     *               type?: string, schema?: array<string, mixed>|null}  $meta
     */
    public function render(array $meta): string
    {
        $html = $this->shell();
        $html = $this->strip($html);

        return $this->inject($html, $meta);
    }

    /** The pristine shell. */
    public function shell(): string
    {
        if (! is_file($this->shellFile())) {
            $this->ensureShell();
        }

        return (string) file_get_contents($this->shellFile());
    }

    /**
     * Write a document for a URL.
     *
     * `/` becomes `public/index.html`; anything else becomes `public/<path>/index.html`, which is the file a
     * web server serves for that directory and therefore needs no rewrite rule at all.
     *
     * @return string the file written, absolute
     */
    public function write(string $path, string $html): string
    {
        $path = '/'.ltrim($path, '/');
        $file = $path === '/' ? $this->root.'/index.html' : $this->root.rtrim($path, '/').'/index.html';

        if (! is_dir(dirname($file)) && ! mkdir(dirname($file), 0o775, true) && ! is_dir(dirname($file))) {
            throw new RuntimeException('Cannot create '.dirname($file));
        }

        file_put_contents($file, $html);

        return $file;
    }

    /**
     * The sitemap for a set of published URLs.
     *
     * @param  list<array{loc: string, lastmod?: string, priority?: string}>  $urls
     */
    public function sitemapXml(array $urls): string
    {
        $entries = '';

        foreach ($urls as $url) {
            $entries .= "  <url>\n"
                .'    <loc>'.$this->xml((string) $url['loc'])."</loc>\n"
                .(isset($url['lastmod']) ? '    <lastmod>'.$this->xml($url['lastmod'])."</lastmod>\n" : '')
                .(isset($url['priority']) ? '    <priority>'.$this->xml($url['priority'])."</priority>\n" : '')
                ."  </url>\n";
        }

        return '<?xml version="1.0" encoding="UTF-8"?>'."\n"
            .'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n"
            .$entries
            .'</urlset>'."\n";
    }

    public function writeSitemap(string $xml): string
    {
        $file = $this->root.'/sitemap.xml';
        file_put_contents($file, $xml);

        return $file;
    }

    /** Remove everything this class owns, so re-publishing replaces rather than duplicates. */
    private function strip(string $html): string
    {
        $patterns = [
            '/'.preg_quote(self::START, '/').'.*?'.preg_quote(self::END, '/').'/s',
            '/<title>.*?<\/title>/is',
            '/<meta\s+name="description"[^>]*>\s*/i',
            '/<meta\s+property="og:[^"]*"[^>]*>\s*/i',
            '/<meta\s+name="twitter:image"[^>]*>\s*/i',
            '/<link\s+rel="canonical"[^>]*>\s*/i',
        ];

        return (string) preg_replace($patterns, '', $html);
    }

    /** @param  array{title: string, description?: string, canonical?: string, image?: string, type?: string, schema?: array<string, mixed>|null}  $meta */
    private function inject(string $html, array $meta): string
    {
        // Element text, not an attribute: escaping the apostrophe would show `&apos;` in a search result.
        $title = $this->text((string) $meta['title']);
        $attrTitle = $this->attr((string) $meta['title']);
        $description = $this->attr((string) ($meta['description'] ?? ''));
        $canonical = $this->attr((string) ($meta['canonical'] ?? ''));
        $image = $this->attr((string) ($meta['image'] ?? ''));
        $type = (string) ($meta['type'] ?? 'website');

        $block = self::START."\n";
        $block .= '    <title>'.$title."</title>\n";

        if ($description !== '') {
            $block .= '    <meta name="description" content="'.$description."\">\n";
        }

        if ($canonical !== '') {
            $block .= '    <link rel="canonical" href="'.$canonical."\">\n";
            $block .= '    <meta property="og:url" content="'.$canonical."\">\n";
        }

        $block .= '    <meta property="og:title" content="'.$attrTitle."\">\n";

        if ($description !== '') {
            $block .= '    <meta property="og:description" content="'.$description."\">\n";
        }

        $block .= '    <meta property="og:type" content="'.$this->attr($type)."\">\n";

        if ($image !== '') {
            $block .= '    <meta property="og:image" content="'.$image."\">\n";
            $block .= '    <meta name="twitter:image" content="'.$image."\">\n";
        }

        if (isset($meta['schema']) && $meta['schema'] !== []) {
            $json = json_encode($meta['schema'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            if ($json !== false) {
                $block .= '    <script type="application/ld+json">'.$json."</script>\n";
            }
        }

        $block .= '    '.self::END.'\n';

        if (str_contains($html, '</head>')) {
            return str_replace('</head>', $block.'  </head>', $html);
        }

        return $block.$html;
    }

    private function attr(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    /** Text between tags: quotes need no escaping there, and escaping them leaks `&apos;` into titles. */
    private function text(string $value): string
    {
        return htmlspecialchars($value, ENT_NOQUOTES | ENT_HTML5, 'UTF-8');
    }

    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }
}
