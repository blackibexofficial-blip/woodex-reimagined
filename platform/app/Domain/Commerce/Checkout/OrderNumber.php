<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

use InvalidArgumentException;

/**
 * Order and invoice numbers: `WDX-000127`, `INV-000127`.
 *
 * Numbers are sequential, not random, because a customer on the phone reads theirs out loud
 * and a courier writes it on a box. Randomness would make both harder and would gain nothing —
 * the number is not a secret, the order id behind it is what authorises access.
 *
 * The format is fixed at write time and never re-derived: a number printed on an invoice must
 * still match its row ten years later, whatever the padding setting says by then.
 */
final readonly class OrderNumber
{
    public function __construct(
        public string $prefix,
        public int $number,
        public int $padding = 6,
    ) {
        if (preg_match('/^[A-Z]{2,6}$/', $prefix) !== 1) {
            throw new InvalidArgumentException("Number prefix [{$prefix}] must be 2–6 capital letters.");
        }

        if ($number < 1) {
            throw new InvalidArgumentException("Sequence value [{$number}] must be at least 1.");
        }

        if ($padding < 4 || $padding > 12) {
            throw new InvalidArgumentException("Padding [{$padding}] must be between 4 and 12.");
        }
    }

    public function value(): string
    {
        return $this->prefix.'-'.str_pad((string) $this->number, $this->padding, '0', STR_PAD_LEFT);
    }

    public function __toString(): string
    {
        return $this->value();
    }

    /**
     * A sequence that has outgrown its padding keeps counting rather than truncating:
     * `WDX-1000000` is ugly, `WDX-000000` would be a duplicate order number.
     */
    public function next(): self
    {
        return new self($this->prefix, $this->number + 1, $this->padding);
    }

    public static function order(int $sequence, string $prefix = 'WDX', int $padding = 6): self
    {
        return new self($prefix, $sequence, $padding);
    }

    public static function invoice(int $sequence, string $prefix = 'INV', int $padding = 6): self
    {
        return new self($prefix, $sequence, $padding);
    }
}
