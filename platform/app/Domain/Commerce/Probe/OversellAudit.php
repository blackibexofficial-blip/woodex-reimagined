<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Probe;

/**
 * Did we sell the same chair twice?
 *
 * The probe fires N simultaneous checkouts at a variant that has one unit. Whatever the status
 * codes say, the only question that matters afterwards is: how many units left the shelf? This
 * class answers it from two maps — what was there before, and what every committed order and
 * live reservation claims — so the answer comes from the database, not from the probe's own
 * optimistic bookkeeping.
 *
 * It is also useful outside the probe: a nightly reconciliation can hand it the same two maps
 * and find a stock error before a customer does.
 */
final readonly class OversellAudit
{
    /**
     * @param  array<string, int>  $expected  variant id or SKU => units that existed before the run
     * @param  array<string, int>  $granted  variant id or SKU => units claimed by orders and reservations
     */
    public function __construct(
        public array $expected,
        public array $granted,
    ) {}

    public function isClean(): bool
    {
        return $this->violations() === [];
    }

    /** @return list<string> every way the run went wrong, in plain language */
    public function violations(): array
    {
        $reasons = [];

        foreach ($this->granted as $key => $claimed) {
            $available = $this->expected[$key] ?? 0;

            // A negative baseline is corruption, not contention. Reporting it as an oversell
            // would send whoever reads the probe looking for a race that did not happen.
            if ($available < 0) {
                continue;
            }

            if ($claimed > $available) {
                $reasons[] = sprintf(
                    'OVERSELL: %s had %d unit(s) but %d were claimed',
                    $key,
                    $available,
                    $claimed,
                );
            }
        }

        foreach ($this->expected as $key => $available) {
            if ($available < 0) {
                $reasons[] = "STOCK CORRUPTED: {$key} went negative ({$available})";
            }
        }

        return $reasons;
    }

    /** How many units were claimed overall — the number the probe prints next to the verdict. */
    public function claimedTotal(): int
    {
        return array_sum($this->granted);
    }

    /**
     * The number of checkouts that should have succeeded: how many units were actually there.
     * A probe that fires five checkouts at one unit expects exactly one success, and this is
     * where that expectation is written down rather than assumed.
     */
    public function expectedSuccesses(): int
    {
        return array_sum(array_map(static fn (int $qty): int => max(0, $qty), $this->expected));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'expected' => $this->expected,
            'granted' => $this->granted,
            'claimed_total' => $this->claimedTotal(),
            'clean' => $this->isClean(),
            'violations' => $this->violations(),
        ];
    }
}
