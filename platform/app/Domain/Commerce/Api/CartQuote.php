<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Api;

use App\Domain\Commerce\Pricing\CartTotals;
use App\Domain\Commerce\Pricing\LineTotal;
use InvalidArgumentException;

/**
 * What the storefront needs to draw a basket and a checkout summary.
 *
 * Two callers, one shape: the quote endpoint (before the customer commits) and the order
 * receipt (after). That is deliberate — the number a customer is shown while deciding and the
 * number they are charged come from the same calculator and are rendered by the same mapper,
 * so they cannot disagree.
 *
 * Display data (the product URL, the photograph, the chosen finish) is joined by SKU, never by
 * array position. Relying on position is how a basket ends up showing the desk's price next to
 * the chair's name — invisible in every one-item test.
 */
final readonly class CartQuote
{
    /**
     * @param  list<LineTotal>  $lines
     * @param  array<string, array{slug?: string, image?: string|null, color?: string|null}>  $display  keyed by SKU
     */
    public function __construct(
        public array $lines,
        public CartTotals $totals,
        public array $display = [],
    ) {}

    /**
     * @param  list<LineTotal>  $lines
     * @param  array<string, array{slug?: string, image?: string|null, color?: string|null}>  $display
     */
    public static function fromLineTotals(array $lines, CartTotals $totals, array $display = []): self
    {
        self::assertReconciles($lines, $totals);

        return new self($lines, $totals, $display);
    }

    public function isEmpty(): bool
    {
        return $this->lines === [];
    }

    public function itemCount(): int
    {
        return array_sum(array_map(static fn (LineTotal $line): int => $line->quantity, $this->lines));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'currency' => $this->totals->grandTotal->currency,
            'lines' => array_map(fn (LineTotal $line): array => [
                'slug' => $this->display[$line->sku]['slug'] ?? $line->sku,
                'sku' => $line->sku,
                'name' => $line->name,
                'quantity' => $line->quantity,
                'unit_price_minor' => $line->unitPrice->minor,
                'unit_price' => $line->unitPrice->format(),
                'line_total_minor' => $line->total->minor,
                'line_total' => $line->total->format(),
                'tax_minor' => $line->tax->minor,
                'tax_rate_bp' => $line->taxRateBp,
                'discount_minor' => $line->totalDiscount()->minor,
                'image' => $this->display[$line->sku]['image'] ?? null,
                'color' => $this->display[$line->sku]['color'] ?? null,
            ], $this->lines),
            'totals' => $this->totals->toArray(),
            'item_count' => $this->itemCount(),
            'free_shipping' => $this->totals->freeShipping,
            'savings_bp' => $this->totals->savingsBasisPoints(),
        ];
    }

    /**
     * The arithmetic a customer is entitled to.
     *
     * Lines plus shipping must equal the grand total, and lines must equal net plus tax. Both
     * are properties of CartCalculator, which has 14 golden fixtures behind it — but the quote
     * is where those numbers reach a human, and a broken total here is a support ticket, not a
     * failed unit test. Checking it at the boundary is cheap.
     *
     * @param  list<LineTotal>  $lines
     */
    public static function assertReconciles(array $lines, CartTotals $totals): void
    {
        $lineSum = 0;

        foreach ($lines as $line) {
            $lineSum += $line->total->minor;
        }

        // grandTotal = net + goods tax + shipping (+ shipping tax); a line's total already
        // includes its own tax, so subtracting both shipping components isolates the lines.
        $expected = $totals->grandTotal->minor - $totals->shippingTotal->minor - $totals->shippingTax->minor;

        if ($lineSum !== $expected) {
            throw new InvalidArgumentException(
                "Priced lines total {$lineSum} but the basket says {$expected} before shipping.",
            );
        }

        if ($lines === [] && $totals->grandTotal->minor !== 0) {
            throw new InvalidArgumentException('A basket with no lines cannot have a total.');
        }
    }
}
