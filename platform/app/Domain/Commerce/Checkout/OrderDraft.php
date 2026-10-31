<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

use App\Domain\Commerce\Pricing\CartTotals;
use App\Domain\Commerce\Pricing\LineTotal;
use LogicException;

/**
 * A finished order, assembled but not yet saved.
 *
 * The service that persists this is deliberately dumb: every amount, status and number is
 * decided here, in a class with no database and no framework, so the arithmetic that becomes
 * an invoice can be tested to the paisa. What the service adds is a transaction and a row lock.
 *
 * The payment is assembled at the same moment as the order because it must agree with it. An
 * invoice is not assembled here: it is raised from the saved order by the ledger bridge, which
 * copies these amounts rather than re-deriving them from the catalog. Re-deriving is how a
 * customer ends up with a document that does not match what they were charged.
 */
final readonly class OrderDraft
{
    /**
     * @param  list<array{type: string, name: string, phone: string, line1: string, line2?: string|null, city: string, province?: string|null, postcode?: string|null, country?: string}>  $addresses
     */
    public function __construct(
        public OrderNumber $number,
        public CartTotals $totals,
        public string $currency,
        public string $gateway,
        public array $addresses = [],
        public string $source = 'web',
        public ?string $couponCode = null,
    ) {
        if ($addresses === []) {
            throw new LogicException("Order {$number} has no address. A courier cannot deliver a name and a total.");
        }

        $this->assertReconciles();
    }

    /**
     * @param  list<array<string, mixed>>  $addresses
     */
    public static function assemble(
        CartTotals $totals,
        OrderNumber $number,
        string $gateway,
        array $addresses,
        string $source = 'web',
        ?string $couponCode = null,
        string $currency = 'PKR',
    ): self {
        return new self($number, $totals, $currency, $gateway, $addresses, $source, $couponCode);
    }

    public function grandTotalMinor(): int
    {
        return $this->totals->grandTotal->minor;
    }

    public function status(): string
    {
        return OrderStatus::PLACED;
    }

    /**
     * COD starts unpaid; everything else starts pending a gateway callback. Neither is `paid`
     * at placement — that transition belongs to money actually arriving.
     */
    public function paymentStatus(): string
    {
        return OrderStatus::PAYMENT_PENDING;
    }

    /** @return array<string, mixed> */
    public function toOrderRow(): array
    {
        return [
            'number' => $this->number->value(),
            'currency' => $this->currency,
            'source' => $this->source,
            'status' => $this->status(),
            'payment_status' => $this->paymentStatus(),
            'fulfilment_status' => 'unfulfilled',
            'subtotal_minor' => $this->totals->subtotal->minor,
            'discount_minor' => $this->totals->discountTotal->minor,
            'tax_minor' => $this->totals->taxTotal->minor,
            'shipping_minor' => $this->totals->shippingTotal->minor,
            'grand_total_minor' => $this->grandTotalMinor(),
            'paid_minor' => 0,
            'refunded_minor' => 0,
            'coupon_code' => $this->couponCode,
            'applied_rules' => $this->totals->appliedRules,
            'placed_at' => null,   // the service stamps this with the transaction's clock
        ];
    }

    /**
     * @param  array<string, array{variant_id?: int|null, product_id?: int|null, meta?: array<string, mixed>|null}>  $references  keyed by SKU
     * @return list<array<string, mixed>>
     */
    public function toItemRows(array $references = []): array
    {
        $rows = [];

        foreach (array_values($this->totals->lines) as $position => $line) {
            $rows[] = $this->itemRow($line, $position, $references[$line->sku] ?? []);
        }

        return $rows;
    }

    /** @return list<array<string, mixed>> */
    public function toAddressRows(): array
    {
        return array_map(static fn (array $address): array => [
            'type' => $address['type'] ?? 'shipping',
            'name' => $address['name'],
            'phone' => $address['phone'],
            'line1' => $address['line1'],
            'line2' => $address['line2'] ?? null,
            'city' => $address['city'],
            'province' => $address['province'] ?? null,
            'postcode' => $address['postcode'] ?? null,
            'country' => $address['country'] ?? 'PK',
        ], $this->addresses);
    }

    /** @return array<string, mixed> */
    public function toPaymentRow(): array
    {
        return [
            'gateway' => $this->gateway,
            'amount_minor' => $this->grandTotalMinor(),
            'status' => OrderStatus::PAYMENT_PENDING,
            'paid_at' => null,
        ];
    }

    /** @return array<string, mixed> */
    public function toHistoryRow(): array
    {
        return [
            'from_status' => null,
            'to_status' => $this->status(),
            'note' => 'Order placed via '.$this->source,
        ];
    }

    /**
     * The three documents must add up to the same number. If they ever do not, the order is
     * wrong in a way no later screen can repair, so it is refused before it is saved.
     */
    private function assertReconciles(): void
    {
        $lines = 0;
        $discounts = 0;

        foreach ($this->totals->lines as $line) {
            $lines += $line->total->minor;
            $discounts += $line->totalDiscount()->minor;
        }

        $expected = $lines + $this->totals->shippingTotal->minor;

        if ($expected !== $this->grandTotalMinor()) {
            throw new LogicException(sprintf(
                'Order %s does not reconcile: lines %d + shipping %d = %d, grand total %d.',
                $this->number->value(),
                $lines,
                $this->totals->shippingTotal->minor,
                $expected,
                $this->grandTotalMinor(),
            ));
        }

        if ($discounts !== $this->totals->discountTotal->minor) {
            throw new LogicException(sprintf(
                'Order %s discounts do not reconcile: lines %d, cart %d.',
                $this->number->value(),
                $discounts,
                $this->totals->discountTotal->minor,
            ));
        }
    }

    /**
     * @param  array{variant_id?: int|null, product_id?: int|null, meta?: array<string, mixed>|null}  $reference
     * @return array<string, mixed>
     */
    private function itemRow(LineTotal $line, int $position, array $reference): array
    {
        return [
            'variant_id' => $reference['variant_id'] ?? null,
            'product_id' => $reference['product_id'] ?? null,
            'sku' => $line->sku,
            'name' => $line->name,
            'qty' => $line->quantity,
            'unit_price_minor' => $line->unitPrice->minor,
            'line_discount_minor' => $line->totalDiscount()->minor,
            'line_tax_minor' => $line->tax->minor,
            'line_total_minor' => $line->total->minor,
            'tax_rate_bp' => $line->taxRateBp,
            'meta' => $reference['meta'] ?? null,
            'position' => $position,
        ];
    }
}
