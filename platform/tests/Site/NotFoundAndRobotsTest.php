<?php

declare(strict_types=1);

namespace Tests\Site;

use App\Console\Commands\PublishSiteCommand;
use App\Domain\Website\Content\ShellPublisher;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * Two promises about URLs that are not pages: `noindex` where a page must not be found, and a real 404 where
 * nothing is.
 *
 * Both depend on the same change — the storefront fallback is gone, so an unknown path reaches Laravel instead
 * of being answered with the shop and a 200. That makes the checkout a problem (a real address with no file) and
 * the 404 page a visible thing rather than a page nobody saw.
 */
final class NotFoundAndRobotsTest extends TestCase
{
    private string $root = '';

    private ShellPublisher $publisher;

    public function setUp(): void
    {
        $this->root = sys_get_temp_dir().'/wx-robots-'.getmypid();
        @mkdir($this->root.'/front', 0777, true);

        file_put_contents(
            $this->root.'/index.html',
            '<!DOCTYPE html><html><head><title>WOODEX</title><meta name="robots" content="index,follow"></head>'
            .'<body><div id="root"></div><script src="/front/app-abc123.js"></script></body></html>',
        );
        file_put_contents($this->root.'/front/app-abc123.js', '/* built */');

        $this->publisher = new ShellPublisher($this->root);
    }

    public function testNoIndexIsWrittenWhenAsked(): void
    {
        $html = $this->publisher->render([
            'title' => 'Checkout — WOODEX',
            'description' => 'Complete your order.',
            'canonical' => 'https://woodex.test/checkout',
            'robots' => 'noindex, follow',
        ]);

        Assert::true(str_contains($html, '<meta name="robots" content="noindex, follow">'), 'the checkout must not be indexed');
        Assert::same(1, substr_count($html, 'name="robots"'), 'the shell\'s own robots tag must be replaced, not joined');
    }

    public function testASecondPublishDoesNotStackRobotsTags(): void
    {
        $meta = ['title' => 'Checkout — WOODEX', 'canonical' => 'https://woodex.test/checkout', 'robots' => 'noindex, follow'];

        $once = $this->publisher->render($meta);
        // Re-publishing strips what this class owns before writing it again.
        file_put_contents($this->root.'/index.html', $once);
        $publisher = new ShellPublisher($this->root);
        $twice = $publisher->render($meta);

        Assert::same(1, substr_count($twice, 'name="robots"'), 'publishing twice must not leave two robots tags');
    }

    public function testAPageWithoutRobotsGetsNone(): void
    {
        $html = $this->publisher->render(['title' => 'About — WOODEX', 'canonical' => 'https://woodex.test/about']);

        Assert::true(! str_contains($html, 'name="robots"'), 'noindex is a decision about one page, not a default');
    }

    public function testTheCheckoutIsPublishedAndKeptOutOfTheSitemap(): void
    {
        $path = self::sitePath('app/Console/Commands/PublishSiteCommand.php');

        Assert::true($path !== null, 'the publisher must exist');

        $source = (string) file_get_contents((string) $path);

        Assert::true(str_contains($source, "APP_PAGES"), 'the command needs its list of app routes');
        Assert::true(str_contains($source, "'/checkout' =>"), 'the checkout is a real address and must not 404');
        Assert::true(str_contains($source, "'robots' => 'noindex, follow'"), 'and it must not be indexed');

        // The app pages loop must not push to `$urls` — a sitemap entry is a promise the page wants to be found.
        $loop = substr($source, (int) strpos($source, 'foreach (self::APP_PAGES'), 1200);

        Assert::true(! str_contains($loop, '$urls[]'), 'an app route must never be a sitemap entry');
    }

    public function testThe404PageIsTheStorefrontsOwnAndLeadsSomewhere(): void
    {
        $path = self::sitePath('resources/views/errors/404.blade.php');

        Assert::true($path !== null, 'the 404 page must ship with the slice');

        $view = (string) file_get_contents((string) $path);

        Assert::true(str_contains($view, '<title>Page not found — WOODEX</title>'), 'a dead URL is still the brand');
        Assert::true(str_contains($view, 'noindex, follow'), 'a 404 must not be indexed');
        Assert::true(str_contains($view, '<h1>'), 'a reader who lands here needs one sentence and a way out');
        Assert::true(str_contains($view, 'href="/shop"'), 'the shop is the way out');

        // The archived interior's page was what Laravel served before this file existed: its navigation pointed
        // at URLs that now 301 elsewhere, so every link on a 404 was a second dead end.
        Assert::true(! str_contains($view, 'Woodex Interior'), 'the interior brand must not appear on the furniture site');
    }
}
