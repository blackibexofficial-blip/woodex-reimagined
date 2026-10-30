<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

use RuntimeException;

/**
 * Thrown when an order cannot be filled from what is actually on the shelf.
 *
 * Carries the plan so the caller can show what *is* available ("2 left, 3 requested") instead
 * of a flat "out of stock", which is the answer that makes people phone the showroom.
 */
final class InsufficientStock extends RuntimeException
{
    public function __construct(public readonly StockPlan $plan)
    {
        parent::__construct('Not enough stock: '.$plan->summary());
    }
}
