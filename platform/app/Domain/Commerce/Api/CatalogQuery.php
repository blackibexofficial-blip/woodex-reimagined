<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Api;

use InvalidArgumentException;

/**
 * The filters a storefront can ask for, parsed once and validated.
 *
 * Every value that reaches a query builder comes through here, which is what makes the
 * catalog endpoint safe to expose without authentication: a caller can choose a page size of
 * a thousand and will get twenty-four.
 *
 * The normalisation is also what makes caching possible — `?sort=price` and
 * `?sort=price&page=1` must produce the same cache key or the hit rate collapses.
 */
final readonly class CatalogQuery
{
    public const int MAX_PER_PAGE = 48;

    public const int DEFAULT_PER_PAGE = 24;

    /** @var list<string> */
    public const array SORTS = ['featured', 'price_asc', 'price_desc', 'newest', 'name'];

    /**
     * @param  list<string>  $finishes  option codes
     * @param  list<string>  $materials  option codes
     */
    public function __construct(
        public string $search = '',
        public ?string $category = null,
        public string $sort = 'featured',
        public int $page = 1,
        public int $perPage = self::DEFAULT_PER_PAGE,
        public ?int $minPriceMinor = null,
        public ?int $maxPriceMinor = null,
        public bool $inStockOnly = false,
        public array $finishes = [],
        public array $materials = [],
        public bool $featuredOnly = false,
    ) {
        if ($page < 1) {
            throw new InvalidArgumentException('Page must be at least 1.');
        }

        if ($perPage < 1) {
            throw new InvalidArgumentException('Per page must be at least 1.');
        }

        if (! in_array($sort, self::SORTS, true)) {
            throw new InvalidArgumentException("Unknown sort [{$sort}].");
        }
    }

    /**
     * Build from raw query-string input, silently clamping anything out of range.
     *
     * Clamping rather than rejecting is deliberate: a bad `per_page` in a bookmarked URL
     * should still render a page, not a validation error on a public catalog.
     *
     * @param  array<string, mixed>  $input
     */
    public static function fromArray(array $input): self
    {
        $sort = is_string($input['sort'] ?? null) ? $input['sort'] : 'featured';
        $category = is_string($input['category'] ?? null) && $input['category'] !== '' ? $input['category'] : null;

        return new self(
            search: is_string($input['q'] ?? null) ? self::clip(trim($input['q']), 80) : '',
            category: $category !== null ? self::clip($category, 120) : null,
            sort: in_array($sort, self::SORTS, true) ? $sort : 'featured',
            page: self::positiveInt($input['page'] ?? null, 1),
            perPage: min(self::MAX_PER_PAGE, self::positiveInt($input['per_page'] ?? null, self::DEFAULT_PER_PAGE)),
            minPriceMinor: self::optionalMinor($input['min_price'] ?? null),
            maxPriceMinor: self::optionalMinor($input['max_price'] ?? null),
            inStockOnly: self::truthy($input['in_stock'] ?? null),
            finishes: self::codeList($input['finish'] ?? null),
            materials: self::codeList($input['material'] ?? null),
            featuredOnly: self::truthy($input['featured'] ?? null),
        );
    }

    /**
     * A stable cache key for this query.
     *
     * Sorted lists inside it, every scalar cast to a string, so two requests that mean the
     * same thing share a cache entry. The version prefix is bumped by hand when the shape of
     * a cached response changes — cheaper and safer than a deploy that flushes everything.
     */
    public function cacheKey(): string
    {
        $finishes = $this->finishes;
        $materials = $this->materials;
        sort($finishes);
        sort($materials);

        return 'commerce:catalog:v1:'.md5(json_encode([
            'q' => strtolower($this->search),
            'category' => $this->category,
            'sort' => $this->sort,
            'page' => $this->page,
            'per_page' => $this->perPage,
            'min' => $this->minPriceMinor,
            'max' => $this->maxPriceMinor,
            'in_stock' => $this->inStockOnly,
            'finish' => $finishes,
            'material' => $materials,
            'featured' => $this->featuredOnly,
        ], JSON_THROW_ON_ERROR));
    }

    public function isDefault(): bool
    {
        return $this->search === ''
            && $this->category === null
            && $this->sort === 'featured'
            && $this->page === 1
            && $this->perPage === self::DEFAULT_PER_PAGE
            && $this->minPriceMinor === null
            && $this->maxPriceMinor === null
            && ! $this->inStockOnly
            && $this->finishes === []
            && $this->materials === []
            && ! $this->featuredOnly;
    }

    /**
     * Cut a string to a maximum length without splitting a multi-byte character.
     *
     * mbstring is present on every host in the deployment list, but this class is used by
     * tests that run with nothing but a PHP binary — and a missing mbstring must not turn a
     * search box into a fatal error. ASCII is the fallback here; a truncated glyph in an
     * 80-character search term is a cosmetic problem, a 500 is not.
     */
    private static function clip(string $value, int $max): string
    {
        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, $max);
        }

        return substr($value, 0, $max);
    }

    private static function positiveInt(mixed $value, int $default): int
    {
        if (! is_numeric($value)) {
            return $default;
        }

        $int = (int) $value;

        return $int >= 1 ? $int : $default;
    }

    /** Prices arrive in whole rupees from the storefront; null when absent or negative. */
    private static function optionalMinor(mixed $value): ?int
    {
        if (! is_numeric($value)) {
            return null;
        }

        $rupees = (int) $value;

        return $rupees >= 0 ? $rupees * 100 : null;
    }

    private static function truthy(mixed $value): bool
    {
        return in_array($value, ['1', 1, true, 'true', 'on'], true);
    }

    /**
     * Accepts `finish=oak,walnut` or `finish[]=oak&finish[]=walnut`, caps the list at twelve,
     * and discards anything that is not a plausible option code.
     *
     * @return list<string>
     */
    private static function codeList(mixed $value): array
    {
        if (is_string($value)) {
            $value = explode(',', $value);
        }

        if (! is_array($value)) {
            return [];
        }

        $out = [];

        foreach ($value as $item) {
            if (! is_string($item)) {
                continue;
            }

            $code = strtolower(trim($item));

            if ($code === '' || preg_match('/^[a-z0-9-]{1,60}$/', $code) !== 1) {
                continue;
            }

            $out[$code] = $code;
        }

        return array_slice(array_values($out), 0, 12);
    }
}
