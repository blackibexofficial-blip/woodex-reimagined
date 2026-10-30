<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Pricing;

use InvalidArgumentException;

/**
 * A discount instruction, evaluated by CartCalculator in a fixed order.
 *
 * kind = catalog → applied per line, before any cart-wide rule
 * kind = cart    → applied to the post-catalog total, then split back across lines
 * kind = coupon  → same arithmetic as a cart rule, but carries a code for reporting
 *
 * This is deliberately a small, explicit shape rather than a condition tree: the tree
 * arrives in phase P3. Anything this class cannot express is not yet a supported rule.
 */
final readonly class DiscountRule
{
    public const string CATALOG = 'catalog';

    public const string CART = 'cart';

    public const string COUPON = 'coupon';

    public const string PERCENT = 'percent';

    public const string FIXED = 'fixed';

    public function __construct(
        public string $kind,
        public string $type,
        public int $value,
        public string $label = '',
        public ?string $code = null,
        /** Minimum pre-discount subtotal, in minor units, for a cart/coupon rule to apply. */
        public ?int $minSubtotal = null,
        /** Product ids the rule reaches; null means every line. */
        public ?array $appliesTo = null,
        public bool $freeShipping = false,
    ) {
        if (! in_array($kind, [self::CATALOG, self::CART, self::COUPON], true)) {
            throw new InvalidArgumentException("Unknown discount kind [{$kind}].");
        }

        if (! in_array($type, [self::PERCENT, self::FIXED], true)) {
            throw new InvalidArgumentException("Unknown discount type [{$type}].");
        }

        if ($value < 0) {
            throw new InvalidArgumentException('Discount value cannot be negative.');
        }

        if ($type === self::PERCENT && $value > 10_000) {
            throw new InvalidArgumentException('A percentage discount cannot exceed 100 % (10 000 bp).');
        }
    }

    public function isPercent(): bool
    {
        return $this->type === self::PERCENT;
    }

    public function reaches(string $productId): bool
    {
        return $this->appliesTo === null || in_array($productId, $this->appliesTo, true);
    }

    public function hasMinimum(?int $subtotalMinor): bool
    {
        return $this->minSubtotal === null || ($subtotalMinor !== null && $subtotalMinor >= $this->minSubtotal);
    }
}
