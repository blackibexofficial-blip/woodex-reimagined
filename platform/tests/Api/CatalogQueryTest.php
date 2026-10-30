<?php

declare(strict_types=1);

namespace Tests\Api;

use App\Domain\Commerce\Api\CatalogQuery;
use InvalidArgumentException;
use Tests\Support\Assert;

/**
 * CatalogQuery is the only thing between an anonymous request and the database, so its
 * clamping is a security property, and its cache key is a performance property. Both are
 * tested here rather than discovered in production.
 */
final class CatalogQueryTest extends \Tests\TestCase
{
    public function testDefaultsAreTheDefaultPage(): void
    {
        $query = CatalogQuery::fromArray([]);

        Assert::same('', $query->search, 'no search');
        Assert::same('featured', $query->sort, 'default sort');
        Assert::same(1, $query->page, 'first page');
        Assert::same(24, $query->perPage, 'twenty-four per page');
        Assert::same(true, $query->isDefault(), 'recognised as the default query');
    }

    public function testPerPageIsClampedAndNeverTrusted(): void
    {
        Assert::same(48, CatalogQuery::fromArray(['per_page' => '500'])->perPage, 'capped at 48');
        Assert::same(48, CatalogQuery::fromArray(['per_page' => 999999])->perPage, 'capped from an integer too');
        Assert::same(24, CatalogQuery::fromArray(['per_page' => '0'])->perPage, 'zero falls back to the default');
        Assert::same(24, CatalogQuery::fromArray(['per_page' => '-5'])->perPage, 'negative falls back');
        Assert::same(24, CatalogQuery::fromArray(['per_page' => 'abc'])->perPage, 'nonsense falls back');
        Assert::same(12, CatalogQuery::fromArray(['per_page' => '12'])->perPage, 'a sensible value is honoured');
    }

    public function testAnUnknownSortFallsBackInsteadOfErroring(): void
    {
        Assert::same('featured', CatalogQuery::fromArray(['sort' => 'cheapest'])->sort, 'unknown sort ignored');
        Assert::same('price_asc', CatalogQuery::fromArray(['sort' => 'price_asc'])->sort, 'known sort accepted');
        Assert::same('featured', CatalogQuery::fromArray(['sort' => "price_asc'; DROP TABLE--"])->sort, 'injection attempt ignored');
    }

    public function testPageFallsBackToTheFirstPage(): void
    {
        Assert::same(1, CatalogQuery::fromArray(['page' => '0'])->page, 'zero');
        Assert::same(1, CatalogQuery::fromArray(['page' => '-3'])->page, 'negative');
        Assert::same(7, CatalogQuery::fromArray(['page' => '7'])->page, 'valid');
    }

    public function testSearchIsTrimmedAndCapped(): void
    {
        Assert::same('chair', CatalogQuery::fromArray(['q' => '  chair  '])->search, 'trimmed');
        Assert::same(80, strlen(CatalogQuery::fromArray(['q' => str_repeat('a', 500)])->search), 'capped at 80 characters');
    }

    public function testPricesArriveInRupeesAndLeaveInPaisa(): void
    {
        $query = CatalogQuery::fromArray(['min_price' => '20000', 'max_price' => '150000']);

        Assert::same(2_000_000, $query->minPriceMinor, 'minimum converted to paisa');
        Assert::same(15_000_000, $query->maxPriceMinor, 'maximum converted to paisa');
        Assert::same(null, CatalogQuery::fromArray(['min_price' => '-1'])->minPriceMinor, 'negative ignored');
        Assert::same(null, CatalogQuery::fromArray(['min_price' => 'free'])->minPriceMinor, 'text ignored');
    }

    public function testOptionListsAcceptBothFormsAndAreSanitised(): void
    {
        Assert::same(['oak', 'walnut'], CatalogQuery::fromArray(['finish' => 'oak,walnut'])->finishes, 'comma form');
        Assert::same(['oak', 'walnut'], CatalogQuery::fromArray(['finish' => ['oak', 'walnut']])->finishes, 'array form');
        Assert::same(['oak'], CatalogQuery::fromArray(['finish' => 'OAK'])->finishes, 'lowercased');
        Assert::same([], CatalogQuery::fromArray(['finish' => '../../etc,<script>'])->finishes, 'hostile codes dropped');
        Assert::same(12, count(CatalogQuery::fromArray(['finish' => implode(',', range(1, 30))])->finishes), 'capped at twelve');
        Assert::same(['oak'], CatalogQuery::fromArray(['finish' => ['oak', 'oak']])->finishes, 'deduplicated');
    }

    public function testTheCacheKeyIsStableForEquivalentRequests(): void
    {
        $a = CatalogQuery::fromArray(['finish' => 'oak,walnut', 'sort' => 'price_asc']);
        $b = CatalogQuery::fromArray(['finish' => ['walnut', 'oak'], 'sort' => 'price_asc']);

        Assert::same($a->cacheKey(), $b->cacheKey(), 'option order does not change the key');
    }

    public function testTheCacheKeyDiffersWhenTheRequestDiffers(): void
    {
        $base = CatalogQuery::fromArray([]);

        foreach ([
            ['page' => '2'],
            ['sort' => 'price_asc'],
            ['q' => 'chair'],
            ['in_stock' => '1'],
            ['per_page' => '12'],
            ['finish' => 'oak'],
        ] as $variation) {
            Assert::true(
                CatalogQuery::fromArray($variation)->cacheKey() !== $base->cacheKey(),
                'a different request produces a different key: '.json_encode($variation),
            );
        }
    }

    public function testTheCacheKeyIsNamespacedAndVersionedSoAFlushIsPossible(): void
    {
        $key = CatalogQuery::fromArray([])->cacheKey();

        Assert::true(str_starts_with($key, 'commerce:catalog:v1:'), 'namespaced and versioned');
        Assert::same(52, strlen($key), '23-character prefix plus a 32-character digest');
    }

    public function testBooleansAreParsedFromTheQueryStringNotFromTruthiness(): void
    {
        Assert::same(true, CatalogQuery::fromArray(['in_stock' => '1'])->inStockOnly, '1 is true');
        Assert::same(true, CatalogQuery::fromArray(['in_stock' => 'true'])->inStockOnly, 'true is true');
        Assert::same(false, CatalogQuery::fromArray(['in_stock' => '0'])->inStockOnly, '0 is false');
        Assert::same(false, CatalogQuery::fromArray(['in_stock' => 'yes'])->inStockOnly, 'unrecognised is false');
        Assert::same(false, CatalogQuery::fromArray([])->inStockOnly, 'absent is false');
    }

    public function testTheConstructorRejectsImpossibleValues(): void
    {
        Assert::throws(
            InvalidArgumentException::class,
            static fn () => new CatalogQuery(page: 0),
            'page zero',
        );

        Assert::throws(
            InvalidArgumentException::class,
            static fn () => new CatalogQuery(sort: 'sideways'),
            'unknown sort',
        );
    }
}
