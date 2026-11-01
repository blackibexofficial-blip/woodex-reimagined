<?php

declare(strict_types=1);

namespace Tests\Site;

use App\Domain\Website\Content\ShellPublisher;
use RuntimeException;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The static shell — the file a crawler and a visitor actually receive.
 *
 * One built `index.html` used to answer all 16 URLs with one `<title>`, one description, and an `og:image`
 * pointing at `lovable.dev`. Publishing writes a real head per URL instead. Two properties make that safe,
 * and this class exists to hold them:
 *
 *   1. it never stacks a second set of tags when a page is published twice;
 *   2. it never bakes one page's title into the pristine copy every other page is built from.
 *
 * Framework-free on purpose: the publisher takes its web root as an argument, so it can be pointed at a
 * temporary directory and run by the plain PHP runner.
 */
final class ShellPublisherTest extends TestCase
{
    private string $root;

    public function setUp(): void
    {
        $this->root = sys_get_temp_dir().'/wx-shell-'.bin2hex(random_bytes(4));

        mkdir($this->root, 0o775, true);

        file_put_contents($this->root.'/index.html', <<<'HTML'
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="UTF-8" />
                <title>One title for everything</title>
                <meta name="description" content="one description for everything" />
                <meta property="og:title" content="One title for everything" />
                <meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />
              </head>
              <body><div id="root"></div></body>
            </html>
            HTML);
    }

    public function testItCapturesAPristineShell(): void
    {
        $publisher = new ShellPublisher($this->root);
        $publisher->ensureShell();

        Assert::true(is_file($this->root.'/site/shell.html'), 'the shell copy must exist');
        Assert::true(! str_contains((string) file_get_contents($this->root.'/site/shell.html'), ShellPublisher::START), 'the copy must be un-injected');
    }

    public function testItRefusesToCaptureAnAlreadyInjectedDocument(): void
    {
        $publisher = new ShellPublisher($this->root);
        $publisher->ensureShell();

        // Publishing the home page rewrites index.html. If the pristine copy is then lost — a half-finished
        // deploy, a cleared cache — the next publish must refuse rather than adopt the home page's head as
        // the source for every other page.
        $publisher->write('/', $publisher->render(['title' => 'Home']));
        unlink($this->root.'/site/shell.html');

        Assert::throws(
            RuntimeException::class,
            fn () => (new ShellPublisher($this->root))->ensureShell(),
        );
    }

    public function testItStillPublishesAfterTheCaptureIsRefused(): void
    {
        $publisher = new ShellPublisher($this->root);
        $publisher->ensureShell();
        $publisher->write('/', $publisher->render(['title' => 'Home']));

        // The pristine copy is what matters, not index.html — so a second publish still works.
        $second = (new ShellPublisher($this->root))->render(['title' => 'Second']);

        Assert::true(str_contains($second, '<title>Second</title>'), 'the second page must carry its own title');
    }

    public function testItWritesOneHeadPerUrl(): void
    {
        $publisher = new ShellPublisher($this->root);
        $publisher->ensureShell();

        $meta = [
            'title' => "About WOODEX — Pakistan's Leading Office Furniture Manufacturer",
            'description' => 'A Lahore factory and a national delivery network.',
            'canonical' => 'https://woodex.com.pk/about',
            'type' => 'website',
            'schema' => ['@context' => 'https://schema.org', '@type' => 'WebPage', 'name' => 'About'],
        ];

        $html = $publisher->render($meta);

        Assert::same(1, substr_count($html, '<title>'), 'exactly one title');
        Assert::same(1, substr_count($html, 'name="description"'), 'exactly one description');
        Assert::same(1, substr_count($html, 'application/ld+json'), 'exactly one structured-data block');
        Assert::same(1, substr_count($html, 'rel="canonical"'), 'exactly one canonical');
        Assert::true(str_contains($html, '<title>'.$meta['title'].'</title>'), 'the title is the page’s');
        Assert::true(str_contains($html, 'href="https://woodex.com.pk/about"'), 'the canonical is the page’s');
        Assert::true(str_contains($html, '"@type":"WebPage"'), 'the schema names the type');
        Assert::true(! str_contains($html, 'lovable.dev'), 'the prototype image is gone, not merely hidden');
        Assert::true(! str_contains($html, 'One title for everything'), 'the old title is gone');
    }

    public function testPublishingTwiceDoesNotGrowTheHead(): void
    {
        $publisher = new ShellPublisher($this->root);
        $publisher->ensureShell();

        $meta = ['title' => 'About', 'description' => 'One.', 'canonical' => 'https://woodex.com.pk/about'];
        $publisher->render($meta);

        $twice = (new ShellPublisher($this->root))->render($meta);

        Assert::same(1, substr_count($twice, '<title>'), 'one title after two publishes');
        Assert::same(1, substr_count($twice, ShellPublisher::START), 'one marker after two publishes');
    }

    public function testQuotesInTitlesAreNotEscapedIntoSearchResults(): void
    {
        $publisher = new ShellPublisher($this->root);
        $publisher->ensureShell();

        $html = $publisher->render(['title' => "Pakistan's Best"]);

        Assert::true(str_contains($html, "<title>Pakistan's Best</title>"), 'a title is text, not an attribute');
    }

    public function testRootGoesToIndexAndEverythingElseToItsOwnDirectory(): void
    {
        $publisher = new ShellPublisher($this->root);
        $publisher->ensureShell();

        $home = $publisher->write('/', $publisher->render(['title' => 'Home']));
        $about = $publisher->write('/about', $publisher->render(['title' => 'About']));

        Assert::same($this->root.'/index.html', $home);
        Assert::same($this->root.'/about/index.html', $about);
        Assert::true(str_contains((string) file_get_contents($about), '<title>About</title>'), 'about has its title');
        Assert::true(str_contains((string) file_get_contents($home), '<title>Home</title>'), 'home has its title');
    }

    public function testSitemapEscapesAndCountsEveryUrl(): void
    {
        $xml = (new ShellPublisher($this->root))->sitemapXml([
            ['loc' => 'https://woodex.com.pk/', 'priority' => '1.0'],
            ['loc' => 'https://woodex.com.pk/about?x=1&y=2'],
        ]);

        Assert::true(str_contains($xml, '<loc>https://woodex.com.pk/</loc>'), 'the home URL is in the map');
        Assert::true(str_contains($xml, '&amp;'), 'an ampersand must be escaped, or the sitemap is invalid XML');
        Assert::same(2, substr_count($xml, '<url>'), 'two URLs');
    }

    /**
     * A rebuild replaces the hashed bundle, and the pristine copy must follow it.
     *
     * This is not hypothetical: `public/index.html` names `front/index-<hash>.js`, a new build emits a new file
     * and deletes the old one, and a copy captured "once" kept naming the file that no longer existed. Every
     * page published from it then loaded no script at all — the shop answered 200 with an empty `<div id="root">`.
     */
    public function testItFollowsARebuildInsteadOfKeepingTheDeadBundle(): void
    {
        $document = static fn (string $entry): string => <<<HTML
            <!doctype html>
            <html lang="en">
              <head><meta charset="UTF-8" /><title>Built</title></head>
              <body><div id="root"></div><script type="module" src="{$entry}"></script></body>
            </html>
            HTML;

        mkdir($this->root.'/front', 0o775, true);
        file_put_contents($this->root.'/front/index-aaaaaaaa.js', 'console.log("first build")');
        file_put_contents($this->root.'/index.html', $document('/front/index-aaaaaaaa.js'));

        $publisher = new ShellPublisher($this->root);
        $publisher->ensureShell();

        Assert::true(
            str_contains((string) file_get_contents($this->root.'/site/shell.html'), 'index-aaaaaaaa.js'),
            'the first build is captured',
        );

        // The rebuild: a new bundle, the old one deleted, a new document naming it.
        unlink($this->root.'/front/index-aaaaaaaa.js');
        file_put_contents($this->root.'/front/index-bbbbbbbb.js', 'console.log("second build")');
        file_put_contents($this->root.'/index.html', $document('/front/index-bbbbbbbb.js'));

        (new ShellPublisher($this->root))->ensureShell();
        $shell = (string) file_get_contents($this->root.'/site/shell.html');

        Assert::true(str_contains($shell, 'index-bbbbbbbb.js'), 'the copy must name the bundle that exists');
        Assert::true(! str_contains($shell, "index-aaaaaaaa.js"), 'the dead bundle must not survive in the copy');
    }

    public function testItRefusesToRefreshFromAPublishedHomePage(): void
    {
        // A stale copy and the only other document carrying one page's head: publishing from it would give every
        // page the home page's title, so the deploy must stop here instead.
        mkdir($this->root.'/front', 0o775, true);
        mkdir($this->root.'/site', 0o775, true);
        file_put_contents(
            $this->root.'/site/shell.html',
            '<html><head><title>Built</title></head><body><script type="module" src="/front/index-old00000.js"></script></body></html>',
        );
        file_put_contents(
            $this->root.'/index.html',
            '<html><head>'.ShellPublisher::START.'<title>Home</title>'.ShellPublisher::END
            .'</head><body><script type="module" src="/front/index-new00000.js"></script></body></html>',
        );

        Assert::throws(
            RuntimeException::class,
            fn () => (new ShellPublisher($this->root))->ensureShell(),
        );
    }
}
