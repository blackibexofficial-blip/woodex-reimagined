<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Billing;

use InvalidArgumentException;

/**
 * Whether the next order number has already been used.
 *
 * Order and invoice numbers come from `commerce_sequences`, incremented under a row lock so two
 * checkouts in the same second cannot collide. That protects the allocation. It does not protect
 * against the counter being edited, restored from a backup, or never seeded in the first place —
 * and a sequence pointing at a number that already exists is the failure that hurts most,
 * because the duplicate is discovered by a customer holding two invoices with the same number.
 *
 * The check is one comparison per series: the highest number already used, against the number
 * the sequence will hand out next. Allocating at or below the high-water mark means the next
 * order tries to insert a duplicate.
 *
 * Numbers are compared by their numeric tail, not as strings: `WDX-000009` and `WDX-000010` sort
 * backwards lexicographically, and the padding changes when a series crosses a million.
 */
final readonly class SequenceHealth
{
    /**
     * @param  list<array{key: string, prefix: string, next: int, padding: int}>  $sequences
     * @param  array<string, list<int>>  $used  keyed by sequence key: every number already issued
     */
    public function __construct(
        public array $sequences = [],
        public array $used = [],
    ) {}

    /** @return list<array{key: string, prefix: string, next: int, highest: int, gap: int, state: string}> */
    public function rows(): array
    {
        $rows = [];

        foreach ($this->sequences as $sequence) {
            $key = (string) $sequence['key'];
            $used = $this->used[$key] ?? [];
            $highest = $used === [] ? 0 : max($used);
            $next = (int) $sequence['next'];

            $rows[] = [
                'key' => $key,
                'prefix' => (string) $sequence['prefix'],
                'next' => $next,
                'highest' => $highest,
                'gap' => $next - $highest,
                'state' => $this->stateFor($next, $highest, $used),
            ];
        }

        return $rows;
    }

    /**
     * colliding → the next number is already used
     * ahead     → numbers were skipped (a cancelled order, an import); wasteful, not dangerous
     * healthy   → the next number is exactly one past the highest used
     * empty     → the series has never issued anything
     */
    private function stateFor(int $next, int $highest, array $used): string
    {
        if ($used === []) {
            return 'empty';
        }

        if ($next <= $highest) {
            return 'colliding';
        }

        if ($next > $highest + 1) {
            return 'ahead';
        }

        return 'healthy';
    }

    /**
     * The next number as the customer will see it.
     *
     * Kept here rather than in the seeder so the screen and the allocator format identically —
     * a settings page showing `WDX-43` next to orders numbered `WDX-000042` is its own kind of
     * bug report.
     */
    public static function format(string $prefix, int $number, int $padding = 6): string
    {
        if ($number < 0) {
            throw new InvalidArgumentException('A sequence cannot issue a negative number.');
        }

        return $prefix.str_pad((string) $number, max(1, $padding), '0', STR_PAD_LEFT);
    }

    /** @return array{series: int, colliding: int, ahead: int, issued: int, healthy: int} */
    public function summary(): array
    {
        $rows = $this->rows();
        $issued = 0;

        foreach ($this->used as $numbers) {
            $issued += count($numbers);
        }

        return [
            'series' => count($rows),
            'colliding' => count(array_filter($rows, static fn (array $row): bool => $row['state'] === 'colliding')),
            'ahead' => count(array_filter($rows, static fn (array $row): bool => $row['state'] === 'ahead')),
            'issued' => $issued,
            'healthy' => count(array_filter($rows, static fn (array $row): bool => $row['state'] === 'healthy')),
        ];
    }

    /** @return list<string> */
    public function warnings(): array
    {
        $warnings = [];
        $summary = $this->summary();

        if ($summary['colliding'] > 0) {
            $warnings[] = $summary['colliding'] === 1
                ? 'A sequence will hand out a number that is already in use. The next order placed in that series will collide.'
                : $summary['colliding'].' sequences will hand out numbers that are already in use.';
        }

        foreach ($this->rows() as $row) {
            // One skipped number is ordinary — a failed insert burns one. Two or more means
            // somebody raised the counter, restored a backup, or imported rows under it.
            if ($row['state'] === 'ahead' && $row['gap'] > 2) {
                $warnings[] = 'The '.$row['key'].' series is '.$row['gap'].' numbers ahead of the highest one issued — '
                    .'harmless, but it means numbers were skipped or the counter was raised by hand.';
            }
        }

        return $warnings;
    }
}
