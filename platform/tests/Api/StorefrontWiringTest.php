<?php

declare(strict_types=1);

namespace Tests\Api;

use Tests\Support\Assert;

/**
 * The storefront's contract, read as source text.
 *
 * The React app is the only consumer of these three routes, and it is not in this test suite.
 * That makes the routes the seam where a rename breaks the shop without breaking a single
 * PHP test — so the names, the envelope and the caching are pinned here instead.
 */
final class StorefrontWiringTest
{
    private function root(): string
    {
        return dirname(__DIR__, 2);
    }

    private function source(string $relative): string
    {
        $path = $this->root().$relative;

        Assert::trueWith(is_file($path), static fn (): string => "missing file {$relative}", 'file exists');

        return is_file($path) ? (string) file_get_contents($path) : '';
    }

    public function testTheThreeStorefrontRoutesArePublicAndThrottled(): void
    {
        $routes = $this->source('/routes/storefront.php');

        Assert::true(str_contains($routes, "'/products'"), 'the list route');
        Assert::true(str_contains($routes, "'/products/{slug}'"), 'the detail route');
        Assert::true(str_contains($routes, "'/categories'"), 'the category route');
        Assert::true(str_contains($routes, "throttle:storefront-catalog"), 'all three are rate limited');
        Assert::same(false, str_contains($routes, "middleware('auth')"), 'and none of them requires a session');
        Assert::same(false, str_contains($routes, "'auth:"), 'not even a guard-specific one');
    }

    public function testTheListAnswersWithDataAndMeta(): void
    {
        $controller = $this->source('/app/Http/Controllers/Api/Storefront/CatalogController.php');

        Assert::true(str_contains($controller, "'data' => \$payload['items']"), 'data is the item list');
        Assert::true(str_contains($controller, "'total' => \$payload['total']"), 'meta carries the total');
        Assert::true(str_contains($controller, "'pages' => \$payload['pages']"), 'and the page count the SPA loops over');
        Assert::true(str_contains($controller, 'If-None-Match'), 'a returning browser gets a 304');
    }

    public function testTheDetailRouteReturnsThePagePayloadAndNotA404ForAMissingProduct(): void
    {
        $controller = $this->source('/app/Http/Controllers/Api/Storefront/CatalogController.php');
        $service = $this->source('/app/Domain/Commerce/Api/CatalogService.php');

        Assert::true(str_contains($controller, 'findDetail'), 'the detail route asks for the detail payload');
        Assert::true(str_contains($service, 'public function findDetail'), 'which the service provides');
        Assert::true(str_contains($controller, 'product_not_found'), 'a missing product has a machine-readable code');
        Assert::true(str_contains($controller, '], 404);'), 'and a 404 status the SPA can trust');

        // `findDetail` must not grow its own query: a product that looks one way in a grid and
        // another on its own page is the classic catalogue bug.
        $detail = substr($service, (int) strpos($service, 'public function findDetail'));
        $detail = substr($detail, 0, (int) strpos($detail, 'public function categoryTree'));

        Assert::true(str_contains($detail, 'baseQuery(new CatalogQuery)'), 'the detail read reuses the list query');
    }

    public function testTheCategoryTreeIsCountedFromPublishedProductsOnly(): void
    {
        $service = $this->source('/app/Domain/Commerce/Api/CatalogService.php');

        Assert::true(str_contains($service, 'STATUS_PUBLISHED'), 'unpublished products are not counted');
        Assert::true(str_contains($service, "whereNull('parent_id')"), 'roots are the categories with no parent');
        Assert::true(str_contains($service, "'children' =>"), 'the tree is two levels deep');
        Assert::true(str_contains($service, "->active()"), 'a hidden category is not served');
    }

    public function testTheCachedProductKeyWasVersionedWhenThePayloadChanged(): void
    {
        $controller = $this->source('/app/Http/Controllers/Api/Storefront/CatalogController.php');

        // The detail payload gained images, colours and specifications in T13. A cache entry
        // written before that would be served for five more minutes with none of them.
        Assert::true(str_contains($controller, ':v2'), 'the product cache key was bumped');
        // The category tree's key is still v1 on purpose: nothing about its payload changed.
        // Exactly one `:v1` key should remain in the file, and it is not the product's.
        Assert::same(1, substr_count($controller, ":v1'"), 'and the product key is no longer v1');
    }
}
