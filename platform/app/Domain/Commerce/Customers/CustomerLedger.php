<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Customers;

/**
 * Every customer the shop has, reconstructed from the orders they placed.
 *
 * The rule is one line long — group by normalised phone — and everything else follows from
 * deciding what to do with the awkward rows. They are all here: a name with a trailing space,
 * a number that is the same person typed three ways, an order with no phone at all because it
 * came in through a showroom.
 *
 * Nothing is merged automatically and nothing is discarded. Rows that cannot be identified are
 * counted separately, so the total the screen shows always reconciles with the order count —
 * a list that silently drops 4% of orders is worse than a list that admits it.
 */
final readonly class CustomerLedger
{
    /**
     * @param  list<CustomerRecord>  $customers  sorted by lifetime value, highest first
     * @param  int  $unidentified  orders with no usable phone number
     * @param  int  $orders  every order considered, identified or not
     */
    public function __construct(
        public array $customers = [],
        public int $unidentified = 0,
        public int $orders = 0,
    ) {}

    /**
     * @param  list<array{name?: string|null, phone?: string|null, city?: string|null, order?: string|null, total?: int, paid?: int, placed_at?: string|null}>  $rows
     */
    public static function fromOrders(array $rows): self
    {
        /** @var array<string, array{names: array<string, int>, first: string, aliases: array<string, true>, orders: int, lifetime: int, paid: int, city: ?string, firstAt: ?string, lastAt: ?string}> $buckets */
        $buckets = [];
        $unidentified = 0;

        foreach ($rows as $row) {
            $phone = PhoneNumber::normalise($row['phone'] ?? null);
            $name = self::cleanName($row['name'] ?? null);

            if ($phone === '') {
                $unidentified++;
                continue;
            }

            $bucket = $buckets[$phone] ?? [
                'names' => [],
                'first' => $name === '' ? 'Unnamed' : $name,
                'aliases' => [],
                'orders' => 0,
                'lifetime' => 0,
                'paid' => 0,
                'city' => null,
                'firstAt' => null,
                'lastAt' => null,
            ];

            if ($name !== '') {
                $bucket['names'][$name] = ($bucket['names'][$name] ?? 0) + 1;
            }

            $bucket['orders']++;
            $bucket['lifetime'] += (int) ($row['total'] ?? 0);
            $bucket['paid'] += (int) ($row['paid'] ?? 0);

            // The address on the most recent order is the one to post to.
            if (($row['city'] ?? null) !== null && ($row['city'] ?? '') !== '') {
                $bucket['city'] = (string) $row['city'];
            }

            $placed = $row['placed_at'] ?? null;

            if (is_string($placed) && $placed !== '') {
                if ($bucket['firstAt'] === null || $placed < $bucket['firstAt']) {
                    $bucket['firstAt'] = $placed;
                }

                if ($bucket['lastAt'] === null || $placed > $bucket['lastAt']) {
                    $bucket['lastAt'] = $placed;
                }
            }

            $buckets[$phone] = $bucket;
        }

        $customers = [];

        foreach ($buckets as $phone => $bucket) {
            [$canonical, $aliases] = self::resolveNames($bucket['names'], $bucket['first']);

            $customers[] = new CustomerRecord(
                phone: $phone,
                name: $canonical,
                aliases: $aliases,
                orders: $bucket['orders'],
                lifetimeMinor: $bucket['lifetime'],
                paidMinor: $bucket['paid'],
                city: $bucket['city'],
                firstAt: $bucket['firstAt'],
                lastAt: $bucket['lastAt'],
            );
        }

        usort($customers, static function (CustomerRecord $a, CustomerRecord $b): int {
            return [$b->lifetimeMinor, $a->phone] <=> [$a->lifetimeMinor, $b->phone];
        });

        return new self($customers, $unidentified, count($rows));
    }

    /**
     * The name to show, and the ones that disagree with it.
     *
     * Most frequent wins; a tie goes to whichever was typed first, because that is usually the
     * one the customer gives when asked. Casing and spacing are not disagreements — "Ali  Khan"
     * and "ali khan" are the same person typing badly.
     *
     * @param  array<string, int>  $names
     * @return array{0: string, 1: list<string>}
     */
    private static function resolveNames(array $names, string $fallback): array
    {
        if ($names === []) {
            return [$fallback, []];
        }

        $best = '';
        $bestCount = -1;

        foreach ($names as $name => $count) {
            if ($count > $bestCount) {
                $best = $name;
                $bestCount = $count;
            }
        }

        $aliases = [];

        foreach (array_keys($names) as $name) {
            if (self::sameName($name, $best)) {
                continue;
            }

            $aliases[] = $name;
        }

        return [$best, array_values(array_unique($aliases))];
    }

    private static function sameName(string $a, string $b): bool
    {
        return self::fingerprint($a) === self::fingerprint($b);
    }

    private static function fingerprint(string $name): string
    {
        return strtolower(preg_replace('/\s+/', ' ', trim($name)) ?? '');
    }

    private static function cleanName(?string $name): string
    {
        return trim(preg_replace('/\s+/', ' ', (string) $name) ?? '');
    }

    /** @return list<CustomerRecord> */
    public function customers(): array
    {
        return $this->customers;
    }

    /** @return list<CustomerRecord> */
    public function repeatCustomers(): array
    {
        return array_values(array_filter(
            $this->customers,
            static fn (CustomerRecord $customer): bool => $customer->isRepeat(),
        ));
    }

    /** @return list<CustomerRecord> */
    public function nameConflicts(): array
    {
        return array_values(array_filter(
            $this->customers,
            static fn (CustomerRecord $customer): bool => $customer->hasNameConflict(),
        ));
    }

    /** @return list<CustomerRecord> */
    public function unreachable(): array
    {
        return array_values(array_filter(
            $this->customers,
            static fn (CustomerRecord $customer): bool => ! $customer->isReachable(),
        ));
    }

    /**
     * @return array{customers: int, repeat: int, lifetime: int, outstanding: int, conflicts: int, unidentified: int, orders: int, repeat_rate: int}
     */
    public function summary(): array
    {
        $lifetime = 0;
        $outstanding = 0;

        foreach ($this->customers as $customer) {
            $lifetime += $customer->lifetimeMinor;
            $outstanding += $customer->outstandingMinor();
        }

        $count = count($this->customers);

        return [
            'customers' => $count,
            'repeat' => count($this->repeatCustomers()),
            'lifetime' => $lifetime,
            'outstanding' => $outstanding,
            'conflicts' => count($this->nameConflicts()),
            'unidentified' => $this->unidentified,
            'orders' => $this->orders,
            // Rounded to whole percent: a repeat rate quoted to two decimals implies precision
            // the sample size does not have.
            'repeat_rate' => $count === 0 ? 0 : (int) round(count($this->repeatCustomers()) * 100 / $count),
        ];
    }
}
