<?php

declare(strict_types=1);

namespace Tests\Site;

use App\Domain\Website\Services\SiteRouter;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * Product photographs answer at the URL the catalogue advertises, and a missing one answers 404.
 *
 * The shop printed `/media/products/{sku}/{hash}-{variant}.webp` on every card for months while nothing
 * served that address, so the first rule here is that the route exists at all. The second is subtler and was
 * a real defect: `SiteRouter` turns an unmatched URL into the trailing-slash "canonical" form of a page, and
 * because `media` was not a reserved first segment, a photograph that did not exist answered
 * `301 → …/photo.webp/` before 404ing. Browsers cache a 301 forever, so one wrong hash poisoned the URL.
 *
 * The 404 itself was proved against the running application (200 for a real file, 404 for a made-up one, and
 * no redirect); a source test cannot boot HTTP, and does not pretend to.
 */
final class ProductMediaRouteTest extends TestCase
{
    public function testMediaIsAReservedSegment(): void
    {
        // Reflection rather than an HTTP call: the constant decides the behaviour, and `RESERVED` is private
        // precisely because no other class should read it.
        $constant = (new \ReflectionClass(SiteRouter::class))->getReflectionConstant('RESERVED');

        Assert::true($constant !== false, 'SiteRouter must keep a RESERVED list');

        $reserved = (array) $constant->getValue();

        Assert::true(
            in_array('media', $reserved, true),
            'media must be reserved, or a missing photograph is redirected like a page',
        );
        // The other app-owned segments stay, or a signed client link would be rewritten to /x/ and 404 late.
        foreach (['api', 'admin', 'storage', 'install'] as $segment) {
            Assert::true(in_array($segment, $reserved, true), $segment.' must stay reserved');
        }
    }

    public function testTheProductImageRouteIsRegistered(): void
    {
        $routes = (string) file_get_contents((string) self::sitePath('routes/web.php'));

        Assert::true(
            str_contains($routes, "Route::get('/media/products/{sku}/{file}', ProductImageController::class)"),
            'the address ProductCard advertises must have a route',
        );
        Assert::true(
            str_contains($routes, "->name('commerce.media.product')"),
            'the route must be named, so a test can refer to it without a URL literal',
        );
        Assert::true(
            str_contains($routes, 'use App\\Http\\Controllers\\Site\\ProductImageController;'),
            'the route must import the controller it points at',
        );
    }

    public function testTheControllerTrustsNoStoredName(): void
    {
        $controller = (string) file_get_contents(
            (string) self::sitePath('app/Http/Controllers/Site/ProductImageController.php'),
        );

        // A file name arrives from the URL, so it is matched against the shape MediaPath composes before it is
        // joined to a directory — a `..` in the name is refused rather than normalised away.
        Assert::true(
            str_contains($controller, '/^[a-f0-9]{8,64}-(thumb|card|hero)\.webp$/'),
            'the file name must be checked against the shape MediaPath composes',
        );
        Assert::same(2, substr_count($controller, 'abort_unless('), 'a bad name and a missing file both 404');
        Assert::true(
            str_contains($controller, "Storage::disk('public')"),
            'photographs live on the public disk, outside the web root',
        );
        // The hash in the name is the content hash, so the bytes behind a URL never change.
        Assert::true(
            str_contains($controller, 'immutable'),
            'a versioned image URL is cacheable forever',
        );
    }
}
