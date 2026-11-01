<?php

declare(strict_types=1);

namespace Tests\Site;

use App\Console\Commands\PublishSiteCommand;
use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The product page a crawler receives.
 *
 * `/shop/{slug}` existed only in the browser: no file, so the SPA fallback answered every one of the 20 products
 * with the same shell — no price, no availability, no `Product` schema, and a 200 that told Google 20 different
 * products were one page. Publishing writes them like any other page now; these tests hold the two halves that
 * decide whether that is worth anything: the head (does Google get a price and an offer?) and the body (does a
 * reader without JavaScript get the product?).
 *
 * The command's builders are private — deliberately, they are not an API — so they are read through reflection
 * rather than made public for a test. That is the smaller sin: widening a class's surface to test it changes
 * what the class promises.
 */
final class ProductShellTest extends TestCase
{
    /** @return array<string, mixed> */
    private function desk(): array
    {
        return [
            'name' => 'BALLMER Executive Desk',
            'url' => '/shop/ballmer-executive-desk',
            'sku' => 'WX-1001',
            'slug' => 'ballmer-executive-desk',
            'summary' => 'Executive desk with side rack, 3 lockable drawers, cable management.',
            'category' => 'Executive Tables',
            'price_minor' => 5200000,
            'compare_at_minor' => 6500000,
            'in_stock' => true,
            'available_qty' => 36,
            'rating' => 4.7,
            'review_count' => 89,
            'image' => '/media/products/wx-1001/abc-card.webp',
            'colors' => [['name' => 'Natural Oak'], ['name' => 'Dark Walnut'], ['name' => 'Matte Black']],
            'specifications' => [
                ['label' => 'Material', 'value' => '38mm MDF Melamine'],
                ['label' => 'Warranty', 'value' => '3 months'],
            ],
            'warranty_months' => 3,
            'lead_time_days' => 7,
        ];
    }

    /** @return mixed */
    private function call(string $method, array $arguments)
    {
        $command = new PublishSiteCommand;
        $reflection = new \ReflectionMethod($command, $method);
        $reflection->setAccessible(true);

        return $reflection->invoke($command, ...$arguments);
    }

    public function testTheHeadCarriesAProductOfferInPkr(): void
    {
        // @phpstan-ignore-next-line — the reflected builder returns the documented array
        $meta = $this->call('productMeta', [$this->desk(), 'https://woodex.test']);
        $schema = $meta['schema'];

        Assert::same('Product', $schema['@type']);
        Assert::same('BALLMER Executive Desk', $schema['name']);
        Assert::same('WX-1001', $schema['sku']);
        Assert::same('https://woodex.test/shop/ballmer-executive-desk', $schema['url']);

        // Minor units in, a decimal string out — 5 200 000 paisa is Rs 52,000, not Rs 5,200,000.
        Assert::same('52000.00', $schema['offers']['price'], 'the price is divided out of minor units exactly once');
        Assert::same('PKR', $schema['offers']['priceCurrency']);
        Assert::same('https://schema.org/InStock', $schema['offers']['availability']);
        Assert::same('https://woodex.test/media/products/wx-1001/abc-card.webp', $schema['image']);

        Assert::same('BALLMER Executive Desk — Executive Tables | WOODEX', $meta['title']);
        Assert::same('https://woodex.test/shop/ballmer-executive-desk', $meta['canonical']);
        Assert::same('product', $meta['type'], 'og:type product, not website');
    }

    public function testAnOutOfStockProductSaysSo(): void
    {
        $desk = $this->desk();
        $desk['in_stock'] = false;

        // @phpstan-ignore-next-line
        $meta = $this->call('productMeta', [$desk, 'https://woodex.test']);

        Assert::same('https://schema.org/OutOfStock', $meta['schema']['offers']['availability']);
    }

    public function testARatingIsOnlyPublishedWhenReviewsExist(): void
    {
        $desk = $this->desk();

        // @phpstan-ignore-next-line
        $withReviews = $this->call('productMeta', [$desk, 'https://woodex.test']);
        Assert::same(89, $withReviews['schema']['aggregateRating']['reviewCount']);

        $desk['review_count'] = 0;

        // @phpstan-ignore-next-line
        $without = $this->call('productMeta', [$desk, 'https://woodex.test']);
        Assert::true(! isset($without['schema']['aggregateRating']), 'a rating with no reviews is a rich-result penalty');
    }

    public function testTheBodyCarriesThePriceAndTheFacts(): void
    {
        // @phpstan-ignore-next-line
        $fallback = $this->call('productFallback', [$this->desk(), collect(), []]);

        $prose = implode(' ', $fallback['paragraphs']);

        Assert::same('BALLMER Executive Desk', $fallback['heading']);
        Assert::true(str_contains($prose, 'Rs 52,000'), 'the price a reader came for must be in the file');
        Assert::true(str_contains($prose, 'save Rs 13,000'), 'and the saving, when there is one');
        Assert::true(str_contains($prose, '36 available'), 'availability is not decoration on a product page');
        Assert::true(str_contains($prose, 'Material: 38mm MDF Melamine.'), 'the specification table, as prose');
        Assert::true(str_contains($prose, 'Natural Oak, Dark Walnut and Matte Black'), 'three colours, one sentence');
        Assert::true(str_contains($prose, 'about 7 days'), 'the lead time');
    }

    public function testTheWarrantyIsNotSaidTwice(): void
    {
        // @phpstan-ignore-next-line
        $fallback = $this->call('productFallback', [$this->desk(), collect(), []]);

        Assert::same(
            1,
            substr_count(strtolower(implode(' ', $fallback['paragraphs'])), 'warranty'),
            'the specification already says "Warranty: 3 months"; a second sentence reads like a bug',
        );
    }

    public function testEveryProductGetsAShellAndASitemapEntry(): void
    {
        $path = self::sitePath('app/Console/Commands/PublishSiteCommand.php');

        Assert::true($path !== null, 'the publisher must exist');

        $source = (string) file_get_contents((string) $path);

        Assert::true(str_contains($source, 'Product::query()'), 'the publisher must read the catalogue');
        Assert::true(str_contains($source, '->published()'), 'a draft product is not a public page');
        Assert::true(str_contains($source, 'findDetail('), 'the page is built from the same payload the API serves');
        Assert::true(str_contains($source, "'/shop/'.ltrim((string) \$product->slug, '/')"), 'products live under /shop');
        Assert::true(substr_count($source, "'priority' => '0.7'") >= 1, 'products belong in the sitemap');
    }
}
