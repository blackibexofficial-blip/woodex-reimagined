<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Commerce\Checkout\CartService;
use App\Domain\Commerce\Checkout\CheckoutService;
use App\Domain\Commerce\Checkout\InsufficientStock;
use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Models\ProductVariant;
use Illuminate\Console\Command;

/**
 * Places one real order, end to end, using the same code the storefront will.
 *
 * This exists because "the vertical slice works" is a claim that should be checkable in one
 * command on a fresh database, not by clicking through a storefront that does not exist yet.
 * It deliberately goes through CartService and CheckoutService rather than inserting rows: a
 * demo that bypasses the path it is demonstrating proves nothing.
 */
final class DemoOrderCommand extends Command
{
    protected $signature = 'commerce:demo-order
                            {--qty=1 : Units of the first in-stock variant}
                            {--sku= : A specific SKU instead of the first one with stock}';

    protected $description = 'Place a cash-on-delivery order through the real cart and checkout path.';

    public function handle(CartService $carts, CheckoutService $checkout): int
    {
        $variant = $this->pickVariant((string) $this->option('sku'));

        if ($variant === null) {
            $this->error('No variant with stock. Run `php artisan db:seed` first.');

            return self::FAILURE;
        }

        $cart = $carts->open();
        $carts->add($cart, $variant, max(1, (int) $this->option('qty')));

        $carts->setAddress($cart, 'shipping', [
            'name' => 'Ayesha Khan',
            'phone' => '0300-1234567',
            'line1' => 'House 42, Street 7',
            'city' => 'Lahore',
            'province' => 'Punjab',
            'country' => 'PK',
        ]);

        try {
            $order = $checkout->place($cart, 'cod');
        } catch (InsufficientStock $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->renderOrder($order);

        return self::SUCCESS;
    }

    private function pickVariant(string $sku): ?ProductVariant
    {
        $query = ProductVariant::query()->with(['product.translation', 'inventory'])->active();

        if ($sku !== '') {
            return $query->where('sku', $sku)->first();
        }

        return $query->get()->first(static fn (ProductVariant $variant): bool => $variant->availableQty() > 0);
    }

    private function renderOrder(Order $order): void
    {
        $order->loadMissing(['items', 'payments', 'addresses']);

        $this->info("Order {$order->number} placed — {$order->status}, payment {$order->payment_status}");

        $this->table(
            ['Line', 'SKU', 'Qty', 'Unit (₨)', 'Line total (₨)'],
            $order->items->map(static fn ($item): array => [
                $item->name,
                $item->sku,
                $item->qty,
                number_format($item->unit_price_minor / 100, 2),
                number_format($item->line_total_minor / 100, 2),
            ])->all(),
        );

        $this->table(['', 'Amount (₨)'], [
            ['Subtotal', number_format($order->subtotal_minor / 100, 2)],
            ['Discount', number_format($order->discount_minor / 100, 2)],
            ['Tax', number_format($order->tax_minor / 100, 2)],
            ['Delivery', number_format($order->shipping_minor / 100, 2)],
            ['Total', number_format($order->grand_total_minor / 100, 2)],
        ]);

        $invoice = $order->ledgerInvoice();
        $payment = $order->payments->first();

        $this->line('Invoice: '.($invoice->number ?? 'not booked — no ledger in this install'));
        $this->line(sprintf(
            'Payment: %s — ₨%s due on delivery',
            $payment->gateway ?? '—',
            number_format($order->amountDueMinor() / 100, 2),
        ));
    }
}
