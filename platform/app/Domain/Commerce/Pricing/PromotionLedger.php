<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Pricing;

/**
 * What the discounts actually cost, and where the money went without a name on it.
 *
 * There is no coupons table yet. A discount is recorded on the order — a `coupon_code` that may
 * be null, a `discount_minor` that may be zero, and the `applied_rules` JSON nobody reads — so
 * the only honest question an admin screen can ask today is the retrospective one: *what did
 * discounting do to the takings, and which codes did it?*
 *
 * The finding worth the whole screen is **unattributed discount**: money off an order with no
 * code attached. Every such order is a discount nobody can reproduce, explain to an accountant,
 * or switch off. In a shop with one promotion that is noise; with ten it is a leak.
 *
 * The second is a **coupon that discounted nothing** — a code present, discount zero. That is
 * almost always an expired or misspelled code that still got stored, and it tells the customer
 * their code worked when it did not.
 */
final readonly class PromotionLedger
{
    /**
     * @param  list<array{order: string, code: ?string, discount: int, subtotal: int, placed_at?: ?string}>  $orders
     */
    public function __construct(public array $orders = []) {}

    private static function code(?string $code): string
    {
        return strtoupper(trim((string) $code));
    }

    /**
     * One row per code, most expensive first.
     *
     * @return list<array{code: string, uses: int, discount: int, average: int, largest: int, subtotal: int}>
     */
    public function byCode(): array
    {
        $codes = [];

        foreach ($this->orders as $order) {
            $code = self::code($order['code'] ?? null);

            if ($code === '') {
                continue;
            }

            $codes[$code] ??= ['code' => $code, 'uses' => 0, 'discount' => 0, 'average' => 0, 'largest' => 0, 'subtotal' => 0];

            $codes[$code]['uses']++;
            $codes[$code]['discount'] += (int) $order['discount'];
            $codes[$code]['largest'] = max($codes[$code]['largest'], (int) $order['discount']);
            $codes[$code]['subtotal'] += (int) $order['subtotal'];
        }

        foreach ($codes as $code => $row) {
            $codes[$code]['average'] = $row['uses'] === 0 ? 0 : intdiv($row['discount'], $row['uses']);
        }

        usort($codes, static fn (array $a, array $b): int => [$b['discount'], $a['code']] <=> [$a['discount'], $b['code']]);

        return array_values($codes);
    }

    /**
     * Money off with nothing to explain it.
     *
     * @return list<array<string, mixed>>
     */
    public function unattributed(): array
    {
        return array_values(array_filter(
            $this->orders,
            static fn (array $order): bool => (int) $order['discount'] > 0 && self::code($order['code'] ?? null) === '',
        ));
    }

    /**
     * A code that discounted nothing.
     *
     * @return list<array<string, mixed>>
     */
    public function inert(): array
    {
        return array_values(array_filter(
            $this->orders,
            static fn (array $order): bool => self::code($order['code'] ?? null) !== '' && (int) $order['discount'] === 0,
        ));
    }

    /**
     * A discount larger than the goods it applied to.
     *
     * @return list<array<string, mixed>>
     */
    public function impossible(): array
    {
        return array_values(array_filter(
            $this->orders,
            static fn (array $order): bool => (int) $order['discount'] > (int) $order['subtotal'] && (int) $order['subtotal'] > 0,
        ));
    }

    /**
     * How much of the gross the shop gave away.
     *
     * The denominator is subtotal + discount: the price before the discount was taken, which is
     * what a marketing person means by "we discounted 8%". Dividing by the discounted total
     * instead makes every promotion look smaller than it was.
     *
     * @return array{uses: int, discount: int, gross: int, rate_bp: int, codes: int, unattributed: int, unattributed_amount: int, inert: int}
     */
    public function summary(): array
    {
        $discount = 0;
        $gross = 0;
        $uses = 0;
        $inert = 0;

        foreach ($this->orders as $order) {
            $value = (int) $order['discount'];

            if (self::code($order['code'] ?? null) !== '') {
                $uses++;
            }

            if ($value === 0 && self::code($order['code'] ?? null) !== '') {
                $inert++;
            }

            $discount += $value;
            $gross += (int) $order['subtotal'] + $value;
        }

        $unattributed = $this->unattributed();
        $unattributedAmount = 0;

        foreach ($unattributed as $order) {
            $unattributedAmount += (int) $order['discount'];
        }

        return [
            'uses' => $uses,
            'discount' => $discount,
            'gross' => $gross,
            'rate_bp' => $gross === 0 ? 0 : (int) round($discount * 10000 / $gross),
            'codes' => count($this->byCode()),
            'unattributed' => count($unattributed),
            'unattributed_amount' => $unattributedAmount,
            'inert' => $inert,
        ];
    }

    /** @return list<string> */
    public function warnings(): array
    {
        $summary = $this->summary();
        $warnings = [];

        if ($summary['unattributed'] > 0) {
            $warnings[] = $summary['unattributed'] === 1
                ? '1 order was discounted with no code attached. That is money off nobody can reproduce or switch off.'
                : $summary['unattributed'].' orders were discounted with no code attached.';
        }

        if ($summary['inert'] > 0) {
            $warnings[] = $summary['inert'] === 1
                ? '1 order carries a coupon code that discounted nothing — the customer was told their code worked, and it did not.'
                : $summary['inert'].' orders carry a coupon code that discounted nothing.';
        }

        if (count($this->impossible()) > 0) {
            $warnings[] = 'A discount is larger than the goods it applied to. One of the two amounts is wrong.';
        }

        return $warnings;
    }
}
