<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

/**
 * The answer to "can I sell this, and from where".
 *
 * A plan always exists, even when it is short — that is deliberate. A planner that threw on
 * the first shortage would tell the customer "out of stock" for an order that is one unit
 * short of a source which has twenty, and would hide the partial allocation that the admin
 * screen needs in order to say "7 from Lahore, 3 on order".
 */
final readonly class StockPlan
{
    /**
     * @param  list<array{variantId: string, sku: string, sourceId: string, sourceName: string, qty: int}>  $allocations
     * @param  list<array{variantId: string, sku: string, requested: int, available: int}>  $shortfalls
     */
    public function __construct(
        public array $allocations = [],
        public array $shortfalls = [],
    ) {}

    public function isComplete(): bool
    {
        return $this->shortfalls === [];
    }

    public function allocatedQty(string $variantId): int
    {
        $total = 0;

        foreach ($this->allocations as $allocation) {
            if ($allocation['variantId'] === $variantId) {
                $total += $allocation['qty'];
            }
        }

        return $total;
    }

    /**
     * One line per shortfall, ready to show a customer. "Only 2 left" is actionable; "out of
     * stock" for something that is in stock in another city is not.
     */
    public function summary(): string
    {
        $parts = [];

        foreach ($this->shortfalls as $shortfall) {
            $parts[] = $shortfall['available'] > 0
                ? "{$shortfall['sku']}: {$shortfall['available']} available, {$shortfall['requested']} requested"
                : "{$shortfall['sku']}: out of stock";
        }

        return implode('; ', $parts);
    }
}
