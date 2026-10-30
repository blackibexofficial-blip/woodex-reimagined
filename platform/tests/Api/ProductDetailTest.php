<?php

declare(strict_types=1);

namespace Tests\Api;

use App\Domain\Commerce\Api\ProductDetail;
use Tests\Support\Assert;

/**
 * The product page payload.
 *
 * Every value here is copied from a database row into JSON, and copying is where products go
 * wrong: a specification with a blank label becomes an empty row in a table, a colour with a
 * misspelled hex becomes an invisible swatch, an empty image URL becomes a broken image on the
 * most-viewed page of the site. Each of those is dropped or normalised here, and each has a
 * test, so the storefront can trust the payload instead of re-validating it in every component.
 */
final class ProductDetailTest extends \Tests\TestCase
{
    /** @param array<string, mixed> $overrides */
    private function row(array $overrides = []): array
    {
        return array_merge([
            'id' => 7,
            'sku' => 'WX-1001',
            'slug' => 'ballmer-executive-desk',
            'name' => 'BALLMER Executive Desk',
            'summary' => 'A commanding desk.',
            'description' => 'Walnut veneer, integrated cable management.',
            'category' => 'Office Tables',
            'category_slug' => 'office-tables',
            'series' => 'ek-series',
            'price_minor' => 24500000,
            'compare_at_minor' => 27500000,
            'discount_bp' => 1091,
            'in_stock' => true,
            'available_qty' => 12,
            'is_featured' => true,
            'rating' => 4.6,
            'review_count' => 38,
            'image' => 'https://example.test/media/products/wx-1001/abcdef12-card.webp',
            'image_srcset' => 'https://example.test/media/products/wx-1001/abcdef12-card.webp 800w',
            'images' => [
                'https://example.test/media/products/wx-1001/abcdef12-card.webp',
                'https://example.test/media/products/wx-1001/abcdef12-hero.webp',
            ],
            'colors' => [
                ['code' => 'walnut', 'label' => 'Walnut', 'hex' => '#6B4423'],
            ],
            'specifications' => [
                ['label' => 'Dimensions', 'value' => '1800 × 900 × 760 mm'],
            ],
            'features' => ['Cable management', 'Locking drawers'],
            'materials' => ['Solid walnut', 'Steel'],
            'warranty_months' => 24,
            'lead_time_days' => 21,
            'customisable' => true,
        ], $overrides);
    }

    public function testThePayloadCarriesEveryFieldTheProductPageRenders(): void
    {
        $detail = ProductDetail::fromArray($this->row());
        $json = $detail->toArray();

        foreach ([
            'id', 'product_id', 'sku', 'slug', 'name', 'summary', 'description',
            'category', 'category_slug', 'series', 'price_minor', 'compare_at_minor',
            'discount_bp', 'in_stock', 'available_qty', 'is_featured', 'rating',
            'review_count', 'image', 'image_srcset', 'images', 'colors',
            'specifications', 'features', 'materials', 'warranty_months',
            'lead_time_days', 'customisable', 'url',
        ] as $key) {
            Assert::true(array_key_exists($key, $json), "payload has [{$key}]");
        }

        Assert::same('ballmer-executive-desk', $json['id'], 'the public id is the slug');
        Assert::same(7, $json['product_id'], 'the database id is kept separately');
        Assert::same('/shop/ballmer-executive-desk', $json['url'], 'the url the SPA routes to');
    }

    public function testMoneyIsIntegerMinorUnitsAndNeverAFloat(): void
    {
        $detail = ProductDetail::fromArray($this->row());

        Assert::same(24500000, $detail->priceMinor, 'price stays in paisa');
        Assert::same(true, is_int($detail->priceMinor), 'and stays an integer');
        Assert::same(27500000, $detail->compareAtMinor, 'compare-at too');

        // A product that was never discounted carries no compare-at price. A zero here would
        // render as "was ₨0" and a 100% discount on the busiest page of the storefront.
        $noDiscount = ProductDetail::fromArray($this->row(['compare_at_minor' => null, 'discount_bp' => 0]));

        Assert::same(null, $noDiscount->compareAtMinor, 'no compare-at is null');
        Assert::same(0, $noDiscount->discountBp, 'and no discount badge');
    }

    public function testASpecificationIsDroppedWhenEitherHalfIsMissing(): void
    {
        $detail = ProductDetail::fromArray($this->row([
            'specifications' => [
                ['label' => 'Dimensions', 'value' => '1800 mm'],
                ['label' => '', 'value' => 'orphaned value'],
                ['label' => 'Warranty', 'value' => '   '],
                ['label' => '  Material  ', 'value' => '  Walnut  '],
                'not-an-array',
            ],
        ]));

        Assert::same(2, count($detail->specifications), 'two usable rows');
        Assert::same('Dimensions', $detail->specifications[0]['label'], 'the first survives');
        Assert::same('Material', $detail->specifications[1]['label'], 'labels are trimmed');
        Assert::same('Walnut', $detail->specifications[1]['value'], 'values are trimmed');
    }

    public function testColoursNormaliseTheHexAndDropNamelessSwatches(): void
    {
        $detail = ProductDetail::fromArray($this->row([
            'colors' => [
                ['code' => 'walnut', 'label' => 'Walnut', 'hex' => '6B4423'],
                ['code' => 'oak', 'label' => 'Oak', 'hex' => '#a8c67f'],
                ['code' => 'bad', 'label' => 'Bad', 'hex' => 'green'],
                ['code' => 'nameless', 'label' => '  ', 'hex' => '#000000'],
                ['code' => 'grey', 'name' => 'Grey', 'hex' => null],
            ],
        ]));

        Assert::same(4, count($detail->colors), 'the nameless swatch is the only one dropped');
        Assert::same('#6B4423', $detail->colors[0]['hex'], 'a bare hex gains its hash');
        Assert::same('#a8c67f', $detail->colors[1]['hex'], 'case is left alone');
        Assert::same(null, $detail->colors[1]['image'], 'no image is null, not empty string');
        Assert::same('Grey', $detail->colors[3]['name'], 'a label may arrive as [name]');
        Assert::same(null, $detail->colors[3]['hex'], 'and carry no colour');
    }

    public function testAColourThatIsNotAHexBecomesNullRatherThanAColourThatCannotRender(): void
    {
        $detail = ProductDetail::fromArray($this->row([
            'colors' => [['code' => 'bad', 'label' => 'Bad', 'hex' => 'green']],
        ]));

        Assert::same(1, count($detail->colors), 'the swatch keeps its name');
        Assert::same(null, $detail->colors[0]['hex'], 'but shows no colour rather than a broken one');
    }

    public function testImagesAreDeduplicatedOfEmptiesAndThePrimaryIsTheFirst(): void
    {
        $detail = ProductDetail::fromArray($this->row([
            'images' => ['https://example.test/a.webp', '', 'https://example.test/b.webp'],
            'image' => null,
        ]));

        Assert::same(2, count($detail->images), 'empty urls are dropped');
        Assert::same('https://example.test/a.webp', $detail->image, 'the primary falls back to the first image');
    }

    public function testAnEmptyCatalogueRowStillRendersInsteadOfThrowing(): void
    {
        $detail = ProductDetail::fromArray([]);
        $json = $detail->toArray();

        Assert::same(0, $detail->priceMinor, 'no price is zero');
        Assert::same(null, $detail->category, 'no category is null');
        Assert::same(null, $detail->series, 'no series is null');
        Assert::same([], $json['images'], 'no images is an empty list, not a null');
        Assert::same([], $json['features'], 'and so are features');
        Assert::same('/shop/', $json['url'], 'the url is still a string');
    }

    public function testBlankOptionalTextBecomesNullRatherThanAnEmptyString(): void
    {
        $detail = ProductDetail::fromArray($this->row([
            'category' => '',
            'category_slug' => '',
            'series' => '',
        ]));

        Assert::same(null, $detail->category, 'empty category is null');
        Assert::same(null, $detail->series, 'empty series is null');
    }
}
