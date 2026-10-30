<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Support;

use InvalidArgumentException;

/**
 * An amount of money in minor units (paisa for PKR, cents for USD).
 *
 * Rules this class exists to enforce:
 *  - no floats, ever — every operation is integer arithmetic;
 *  - a currency travels with the amount, so a PKR figure can never be added to a USD one;
 *  - rounding is half-up, applied once, at the point of conversion — never accumulated;
 *  - splitting an amount across lines never loses or invents a single paisa.
 *
 * Ported in spirit from Bagisto's price handling (MIT); see ATTRIBUTION.md.
 */
final readonly class Money
{
    public function __construct(
        public int $minor,
        public string $currency = 'PKR',
    ) {
        if ($currency === '') {
            throw new InvalidArgumentException('Currency code is required.');
        }
    }

    public static function zero(string $currency = 'PKR'): self
    {
        return new self(0, $currency);
    }

    /** Build from a whole-unit amount, e.g. 42500 PKR → 4250000 paisa. */
    public static function fromUnits(int $units, string $currency = 'PKR'): self
    {
        return new self($units * 100, $currency);
    }

    public function plus(self $other): self
    {
        $this->assertSameCurrency($other);

        return new self($this->minor + $other->minor, $this->currency);
    }

    public function minus(self $other): self
    {
        $this->assertSameCurrency($other);

        return new self($this->minor - $other->minor, $this->currency);
    }

    public function times(int $factor): self
    {
        return new self($this->minor * $factor, $this->currency);
    }

    public function negate(): self
    {
        return new self(-$this->minor, $this->currency);
    }

    public function isZero(): bool
    {
        return $this->minor === 0;
    }

    public function isNegative(): bool
    {
        return $this->minor < 0;
    }

    public function isPositive(): bool
    {
        return $this->minor > 0;
    }

    public function equals(self $other): bool
    {
        return $this->currency === $other->currency && $this->minor === $other->minor;
    }

    public function greaterThan(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->minor > $other->minor;
    }

    public function greaterThanOrEqual(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->minor >= $other->minor;
    }

    public function lessThan(self $other): bool
    {
        $this->assertSameCurrency($other);

        return $this->minor < $other->minor;
    }

    /** The smaller of the two amounts — used to cap a discount at what is actually owed. */
    public function min(self $other): self
    {
        $this->assertSameCurrency($other);

        return $this->minor <= $other->minor ? $this : $other;
    }

    /** A percentage expressed in basis points: 1800 = 18.00 %, 750 = 7.50 %. */
    public function percentage(int $basisPoints): self
    {
        return new self(self::mulDivHalfUp($this->minor, $basisPoints, 10_000), $this->currency);
    }

    /**
     * The tax already contained in a tax-inclusive amount.
     * 1800 bp on 1 180 000 inclusive → 180 000 tax, leaving 1 000 000 net.
     */
    public function taxPortionOfInclusive(int $basisPoints): self
    {
        return new self(
            self::mulDivHalfUp($this->minor, $basisPoints, 10_000 + $basisPoints),
            $this->currency,
        );
    }

    /**
     * Split this amount across weights without losing a paisa (largest-remainder method).
     *
     * Example: 100 000 across [1, 2, 4] → [14 286, 28 571, 57 143], which sums back to 100 000.
     *
     * @param  list<int|float|self>  $weights  non-negative magnitudes, order preserved
     * @return list<self>
     */
    public function allocate(array $weights): array
    {
        $count = count($weights);

        if ($count === 0) {
            return [];
        }

        $ints = [];
        foreach ($weights as $index => $weight) {
            $ints[$index] = $weight instanceof self ? $weight->minor : (int) $weight;
        }

        $total = array_sum($ints);

        if ($total <= 0) {
            // Nothing to weight by: the whole amount belongs to the first slot so it is not lost.
            $out = array_fill(0, $count, self::zero($this->currency));
            $out[0] = new self($this->minor, $this->currency);

            return $out;
        }

        $parts = [];
        $remainders = [];
        $assigned = 0;

        foreach ($ints as $index => $weight) {
            [$share, $remainder] = self::mulDivParts($this->minor, $weight, $total);
            $parts[$index] = $share;
            $remainders[$index] = $remainder;
            $assigned += $share;
        }

        $leftover = $this->minor - $assigned;

        if ($leftover !== 0) {
            $order = array_keys($remainders);
            usort($order, static function (int $a, int $b) use ($remainders): int {
                return [$remainders[$b], $a] <=> [$remainders[$a], $b];
            });

            for ($step = 0; $step < abs($leftover); $step++) {
                $parts[$order[$step % $count]] += $leftover > 0 ? 1 : -1;
            }
        }

        $out = [];
        foreach ($parts as $part) {
            $out[] = new self($part, $this->currency);
        }

        return $out;
    }

    /**
     * This amount expressed in basis points of $whole — 10 000 bp = 100 %.
     * Integer maths end to end: no division by zero, no float, no overflow.
     */
    public function basisPointsOf(self $whole): int
    {
        $this->assertSameCurrency($whole);

        if ($whole->isZero()) {
            return 0;
        }

        [$quotient, $remainder] = self::mulDivParts($this->minor, 10_000, $whole->minor);

        return 2 * $remainder >= $whole->minor ? $quotient + 1 : $quotient;
    }

    /** Sum a list of amounts, defaulting to zero of the given currency. */
    public static function sum(iterable $amounts, string $currency = 'PKR'): self
    {
        $total = self::zero($currency);

        foreach ($amounts as $amount) {
            $total = $total->plus($amount);
        }

        return $total;
    }

    /** "42500.00" — for invoices and exports, never for arithmetic. */
    public function toDecimal(): string
    {
        $sign = $this->minor < 0 ? '-' : '';
        $abs = abs($this->minor);

        return sprintf('%s%d.%02d', $sign, intdiv($abs, 100), $abs % 100);
    }

    public function format(): string
    {
        $sign = $this->minor < 0 ? '-' : '';
        $abs = abs($this->minor);

        return sprintf('%s %s%s.%02d', $this->currency, $sign, number_format(intdiv($abs, 100)), $abs % 100);
    }

    public function __toString(): string
    {
        return $this->format();
    }

    /**
     * (a × b) ÷ d rounded half-up, computed without ever overflowing an integer.
     *
     * On 64-bit PHP the native product is used. Where the product would exceed the
     * platform's integer range (32-bit builds, or an absurdly large cart) the calculation
     * falls back to exact string arithmetic via ext-bcmath, which every host in this
     * project's deployment list provides. Floats are never involved.
     */
    private static function mulDivHalfUp(int $a, int $b, int $d): int
    {
        [$quotient, $remainder] = self::mulDivParts($a, $b, $d);

        if ($a >= 0 && $b >= 0) {
            return 2 * $remainder >= $d ? $quotient + 1 : $quotient;
        }

        if ($a < 0) {
            return 2 * $remainder <= -$d ? $quotient - 1 : $quotient;
        }

        return $quotient;
    }

    /**
     * Integer division of (a × b) by d, returning [quotient, remainder] truncated toward
     * zero — the same result intdiv() would give if the intermediate product fitted.
     *
     * @return array{0: int, 1: int}
     */
    private static function mulDivParts(int $a, int $b, int $d): array
    {
        if ($d <= 0) {
            throw new InvalidArgumentException('Denominator must be positive.');
        }

        if (self::productFits($a, $b)) {
            $product = $a * $b;
            $quotient = intdiv($product, $d);

            return [$quotient, $product - ($quotient * $d)];
        }

        if (! function_exists('bcmul')) {
            throw new InvalidArgumentException(sprintf(
                'Amount too large for this platform (%d × %d) and ext-bcmath is unavailable.',
                $a,
                $b,
            ));
        }

        $product = bcmul((string) $a, (string) $b, 0);
        $quotient = bcdiv($product, (string) $d, 0);
        $remainder = bcsub($product, bcmul($quotient, (string) $d, 0), 0);

        return [(int) $quotient, (int) $remainder];
    }

    /** True when a × b is guaranteed to stay inside PHP's integer range. */
    private static function productFits(int $a, int $b): bool
    {
        if ($a === 0 || $b === 0) {
            return true;
        }

        $limit = intdiv(PHP_INT_MAX, max(abs($a), abs($b)));

        return abs(min(abs($a), abs($b))) <= $limit;
    }

    private function assertSameCurrency(self $other): void
    {
        if ($this->currency !== $other->currency) {
            throw new InvalidArgumentException(sprintf(
                'Cannot combine %s with %s.',
                $this->currency,
                $other->currency,
            ));
        }
    }
}
