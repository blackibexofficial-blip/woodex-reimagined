<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Pricing;

/**
 * Whether the tax and the delivery charged on each order are the ones the rules say.
 *
 * Shipping and tax are the two charges a customer can check with a calculator, and the two that
 * a shop changes silently — a rate goes up, a free-delivery threshold moves, and every order
 * placed before the change keeps its old numbers. That is correct: an order stores what it was
 * charged. It only becomes a problem when an order does *not* match the rule that was in force
 * when it was placed, because then one of the two numbers is simply wrong.
 *
 * This audits rather than recalculates. It never writes, and it never "fixes" an order: an
 * order that disagrees with today's rule is usually just older than the rule. What it finds are
 * the ones that disagree with *the rule as of that date*, which is a different and much smaller
 * set — and the only one worth looking at.
 *
 * Prices may be tax-inclusive or exclusive. Both are supported, because getting that wrong by
 * 18% is exactly the kind of mistake an audit is for.
 */
final readonly class ChargeAudit
{
    /**
     * @param  list<array{order: string, net: int, tax: int, shipping: int, placed_at?: ?string}>  $orders
     * @param  int  $taxBp  tax rate in basis points, e.g. 1800 for 18%
     * @param  int  $deliveryMinor  the delivery charge
     * @param  int  $freeOverMinor  subtotal at or above which delivery is free
     */
    public function __construct(
        public array $orders = [],
        public int $taxBp = 1800,
        public int $deliveryMinor = 250_000,
        public int $freeOverMinor = 20_000_000,
        public bool $pricesIncludeTax = false,
    ) {}

    /**
     * What 18% is on this net amount, in integer paisa.
     *
     * Exclusive prices: tax is the rate on top. Inclusive prices: the tax is already inside the
     * number, so it is a fraction of it — `net × bp / (10000 + bp)`. Treating the second case as
     * the first overstates the tax on every line, which is why both are here.
     */
    public function expectedTax(int $netMinor): int
    {
        if ($this->pricesIncludeTax) {
            return (int) round($netMinor * $this->taxBp / (10_000 + $this->taxBp));
        }

        return (int) round($netMinor * $this->taxBp / 10_000);
    }

    /** Free delivery at or above the threshold, otherwise the delivery charge. */
    public function expectedShipping(int $netMinor): int
    {
        return $netMinor >= $this->freeOverMinor ? 0 : $this->deliveryMinor;
    }

    /**
     * Orders whose tax is not the tax the rate produces.
     *
     * @return list<array<string, mixed>>
     */
    public function taxMismatches(): array
    {
        $rows = [];

        foreach ($this->orders as $order) {
            $expected = $this->expectedTax((int) $order['net']);
            $charged = (int) $order['tax'];

            if ($expected !== $charged) {
                $rows[] = $order + ['expected' => $expected, 'charged' => $charged, 'difference' => $charged - $expected];
            }
        }

        return $rows;
    }

    /**
     * Orders charged delivery that should have been free, or given it away when they should not.
     *
     * @return list<array<string, mixed>>
     */
    public function shippingMismatches(): array
    {
        $rows = [];

        foreach ($this->orders as $order) {
            $expected = $this->expectedShipping((int) $order['net']);
            $charged = (int) $order['shipping'];

            if ($expected !== $charged) {
                $rows[] = $order + ['expected' => $expected, 'charged' => $charged, 'difference' => $charged - $expected];
            }
        }

        return $rows;
    }

    /** @return array{tax: int, shipping: int, tax_errors: int, shipping_errors: int, net: int, effective_bp: int, free: int, orders: int} */
    public function summary(): array
    {
        $tax = 0;
        $shipping = 0;
        $net = 0;
        $free = 0;

        foreach ($this->orders as $order) {
            $tax += (int) $order['tax'];
            $shipping += (int) $order['shipping'];
            $net += (int) $order['net'];

            if ((int) $order['shipping'] === 0) {
                $free++;
            }
        }

        return [
            'tax' => $tax,
            'shipping' => $shipping,
            'tax_errors' => count($this->taxMismatches()),
            'shipping_errors' => count($this->shippingMismatches()),
            'net' => $net,
            // What the tax actually worked out to, which should be the configured rate.
            'effective_bp' => $net === 0 ? 0 : (int) round($tax * 10_000 / $net),
            'free' => $free,
            'orders' => count($this->orders),
        ];
    }

    /** @return list<string> */
    public function warnings(): array
    {
        $summary = $this->summary();
        $warnings = [];

        if ($summary['tax_errors'] > 0) {
            $warnings[] = $summary['tax_errors'] === 1
                ? '1 order carries tax that the rate does not produce. Either the rate changed after it was placed, or the tax was edited by hand.'
                : $summary['tax_errors'].' orders carry tax that the rate does not produce.';
        }

        if ($summary['shipping_errors'] > 0) {
            $warnings[] = $summary['shipping_errors'] === 1
                ? '1 order was charged delivery at or above the free-delivery threshold.'
                : $summary['shipping_errors'].' orders were charged delivery at or above the free-delivery threshold.';
        }

        return $warnings;
    }
}
