<?php

declare(strict_types=1);

namespace Tests\Website;

use Tests\Support\Assert;
use Tests\TestCase;

/**
 * The homepage offers products that exist.
 *
 * "Latest Collection" was four hand-written cards pointing at four hand-written slugs. Three of
 * them resolved to nothing — not in the seeded database, not in the bundled snapshot — so the
 * busiest page on the site sent visitors to a product page that would apologise for a product
 * the shop had never had. Nothing failed: a `Link` to a slug that does not exist is still a
 * perfectly valid `Link`.
 *
 * The section now reads the catalogue like the shop does, so the only way to break it is to
 * stop reading it, which is what this test watches.
 */
final class HomepageTest extends TestCase
{
    private function source(string $relative): string
    {
        $path = self::sitePath($relative);

        Assert::same(true, $path !== null, "cannot read {$relative}");

        return (string) file_get_contents((string) $path);
    }

    public function testTheCollectionReadsTheCatalog(): void
    {
        $source = $this->source('src/components/home/LatestCollection.tsx');

        Assert::same(true, str_contains($source, 'useCatalogProducts'), 'the section must read the catalog');
        Assert::same(true, str_contains($source, 'product.id'), 'links must be built from the catalog row');
    }

    public function testTheCollectionCarriesNoHandWrittenProducts(): void
    {
        $source = $this->source('src/components/home/LatestCollection.tsx');

        // `slug: "..."` is a literal; `slug: string` is a type annotation, and the difference
        // is exactly the difference between a link and a link to nowhere.
        Assert::same(false, str_contains($source, 'slug: "'), 'a hard-coded slug is a link to a page nobody created');
        Assert::same(false, str_contains($source, 'const products = ['), 'no local product array');
    }

    public function testTheThreeSlugsThatNeverExistedStayGone(): void
    {
        $source = $this->source('src/components/home/LatestCollection.tsx');

        foreach (['executive-ergonomic-chair', 'nova-pro-workstation', 'cambridge-3-seater-sofa'] as $ghost) {
            Assert::same(false, str_contains($source, $ghost), "{$ghost} is not a product");
        }
    }

    public function testTheSectionDegradesToNothingRatherThanToAnEmptyGrid(): void
    {
        $source = $this->source('src/components/home/LatestCollection.tsx');

        Assert::same(true, str_contains($source, 'shown.length === 0'), 'an empty catalog must render no section');
    }

    public function testTheHomePageStillRendersTheSection(): void
    {
        Assert::same(true, str_contains($this->source('src/pages/Index.tsx'), 'LatestCollection'));
    }
}
