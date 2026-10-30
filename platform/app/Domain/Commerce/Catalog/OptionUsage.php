<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Catalog;

/**
 * One value of one attribute, and whether anything in the catalog actually uses it.
 *
 * Options are cheap to create and expensive to forget. An option that nothing carries still
 * appears in the storefront's filter rail, so a customer ticks "Meeting Tables" or "Matte
 * Black" and gets an empty grid — the shop looks broken, and nobody in the office can see why,
 * because the option row itself is perfectly valid.
 *
 * The worse case is a variant axis. If `finish` generates variants and an option has no
 * variant behind it, the product page offers a finish that cannot be bought: the swatch is
 * clickable, the price is blank, and the add-to-cart button leads nowhere.
 *
 * Both are count questions, not flag questions, which is why this is derived at read time
 * rather than stored as an `is_active` column somebody would have to remember to maintain.
 */
final readonly class OptionUsage
{
    /** In the storefront's filter rail, and nothing carries it. */
    public const string DEAD_FILTER = 'dead_filter';

    /** On an axis that generates variants, with no variant behind it. */
    public const string ORPHAN_VARIANT = 'orphan_variant';

    /** Not surfaced anywhere, and used by nothing. Clutter, not a defect. */
    public const string UNUSED = 'unused';

    public const string USED = 'used';

    public function __construct(
        public string $attributeCode,
        public string $attributeName,
        public string $code,
        public string $label,
        public int $products = 0,
        public int $variants = 0,
        public bool $onVariantAxis = false,
        public bool $filterable = false,
        public ?string $hex = null,
    ) {}

    /**
     * Precedence matters: a variant axis is checked before the filter rail.
     *
     * An option on both could be reported as either, and the variant case is the one that
     * stops a sale, so it wins. An option that is neither filterable nor sellable is only
     * untidy, and says so.
     */
    public function state(): string
    {
        if ($this->onVariantAxis && $this->variants === 0) {
            return self::ORPHAN_VARIANT;
        }

        if ($this->filterable && ! $this->isLive()) {
            return self::DEAD_FILTER;
        }

        return $this->isLive() ? self::USED : self::UNUSED;
    }

    /**
     * Anything a customer can reach, by either route.
     *
     * A finish with variants but no product-level attribute value is still sellable — the
     * variant is the thing that gets bought — so either count makes it live.
     */
    public function isLive(): bool
    {
        return $this->products > 0 || $this->variants > 0;
    }

    public function needsAttention(): bool
    {
        return $this->state() !== self::USED && $this->state() !== self::UNUSED;
    }

    /** A sentence for the screen, phrased as the consequence rather than the cause. */
    public function reason(): string
    {
        return match ($this->state()) {
            self::ORPHAN_VARIANT => 'Offered as a finish, but no variant exists — the customer picks it and finds nothing to buy.',
            self::DEAD_FILTER => 'Shown as a filter, but no product carries it — ticking it returns an empty page.',
            self::UNUSED => 'Nothing carries it and nothing shows it. Harmless, but it is not doing any work.',
            default => $this->variants > 0
                ? $this->variants.' '.($this->variants === 1 ? 'variant' : 'variants')
                : $this->products.' '.($this->products === 1 ? 'product' : 'products'),
        };
    }

    /** The swatch colour, or null when the attribute has no swatch. */
    public function swatch(): ?string
    {
        return $this->hex === null || $this->hex === '' ? null : $this->hex;
    }
}
