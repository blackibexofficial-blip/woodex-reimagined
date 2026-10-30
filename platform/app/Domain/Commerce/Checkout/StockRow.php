<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

use InvalidArgumentException;

/**
 * One row of physical stock: how many units of a variant sit at a source, and how many of
 * them are already promised to someone else.
 *
 * `priority` is the allocation order — 1 is the shop that should ship first. It is data, not
 * a hard-coded preference, because "Lahore ships before Karachi" is a business decision that
 * changes without a deploy.
 */
final readonly class StockRow
{
    public function __construct(
        public string $variantId,
        public string $sourceId,
        public string $sourceName,
        public int $onHand,
        public int $reserved = 0,
        public int $priority = 1,
    ) {
        if ($onHand < 0) {
            throw new InvalidArgumentException("Stock at [{$sourceName}] for variant [{$variantId}] is negative.");
        }

        if ($reserved < 0) {
            throw new InvalidArgumentException("Reserved stock at [{$sourceName}] for variant [{$variantId}] is negative.");
        }
    }

    /** What can still be sold from here. A source can never promise more than it holds. */
    public function available(): int
    {
        return max(0, $this->onHand - $this->reserved);
    }
}
