<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Inventory;

/**
 * What one shelf says about one variant.
 *
 * Three integers in, one honest answer out. This is a value object rather than a set of
 * ternaries inside a Blade view for one reason: the admin, the storefront and the low-stock
 * dashboard must all agree on when "low" starts. `InventoryItem::isBelowThreshold()` and the
 * dashboard query have to keep that rule; the screen reads it from here so there is one
 * definition of the word.
 *
 * `reserved` can exceed `qty`. That is not a normal state — it means a release was missed —
 * and the answer is to clamp availability at zero and call the shelf empty, not to show a
 * negative number that a warehouse clerk will read as "order more".
 */
final readonly class StockLevel
{
    public const string OUT = 'out';

    public const string LOW = 'low';

    public const string OK = 'ok';

    public function __construct(
        public int $qty,
        public int $reserved,
        public int $threshold,
    ) {}

    /** What a customer could actually buy right now. Never negative. */
    public function available(): int
    {
        return max(0, $this->qty - $this->reserved);
    }

    public function status(): string
    {
        $available = $this->available();

        if ($available === 0) {
            return self::OUT;
        }

        // "At or below the threshold" — the same boundary InventoryItem uses, deliberately
        // inclusive. A threshold of 5 that only warns at 4 is a threshold nobody set.
        return $available <= $this->threshold ? self::LOW : self::OK;
    }

    public function isOut(): bool
    {
        return $this->status() === self::OUT;
    }

    public function isLow(): bool
    {
        return $this->status() === self::LOW;
    }

    public function label(): string
    {
        return match ($this->status()) {
            self::OUT => 'Out of stock',
            self::LOW => 'Running low',
            default => 'In stock',
        };
    }

    /** The badge tone the admin shell understands. */
    public function tone(): string
    {
        return match ($this->status()) {
            self::OUT => 'error',
            self::LOW => 'warning',
            default => 'success',
        };
    }

    /**
     * The share of the shelf that carts are sitting on, 0–100.
     *
     * Shown next to the reserved figure because "12 on hand, 11 held" is a very different
     * week from "12 on hand, 1 held", and the number alone does not say which one it is.
     */
    public function heldPercent(): int
    {
        if ($this->qty <= 0) {
            return 0;
        }

        return (int) min(100, round(($this->reserved / $this->qty) * 100));
    }

    /** True when reservations exceed the shelf — a release was missed, and it is worth saying so. */
    public function isCorrupted(): bool
    {
        return $this->reserved > $this->qty || $this->qty < 0 || $this->reserved < 0;
    }
}
