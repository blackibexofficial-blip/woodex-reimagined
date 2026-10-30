<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

use App\Domain\Commerce\Checkout\Models\Cart;
use App\Domain\Commerce\Checkout\Models\InventoryReservation;
use App\Domain\Commerce\Checkout\Models\Invoice;
use App\Domain\Commerce\Checkout\Models\Order;
use App\Domain\Commerce\Checkout\Models\Payment;
use App\Domain\Commerce\Models\InventoryItem;
use App\Domain\Commerce\Pricing\CartCalculator;
use App\Domain\Commerce\Pricing\DiscountRule;
use App\Domain\Commerce\Pricing\ShippingMethod;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use LogicException;

/**
 * Turns a cart into an order. The only place a customer's money becomes a commitment.
 *
 * The whole method is one transaction, and the order of operations inside it is the design:
 *
 *   1. lock the inventory rows for the variants in the cart;
 *   2. plan the allocation against what is really available;
 *   3. refuse the order if the plan is short — before any row is written;
 *   4. price the cart with the same calculator the cart page used;
 *   5. take the order and invoice numbers under their own lock;
 *   6. write order, items, addresses, invoice, payment and history together.
 *
 * Step 3 before step 4 matters: refusing after pricing costs a calculation that threw away a
 * plausible-looking total, and a customer who is shown a total and then told "out of stock" has
 * been told two different things about the same order.
 *
 * Everything decided here — totals, numbers, statuses — is decided by the framework-free
 * classes and then merely persisted. This class is the lock and the sequence of inserts.
 */
final class CheckoutService
{
    public function __construct(
        private readonly CartCalculator $calculator = new CartCalculator,
        private readonly StockPlanner $planner = new StockPlanner,
        private readonly SequenceAllocator $numbers = new SequenceAllocator,
    ) {}

    /**
     * @param  list<DiscountRule>  $rules
     *
     * @throws InsufficientStock before anything is written
     * @throws InvalidArgumentException when the cart is empty, converted or has no address
     */
    public function place(
        Cart $cart,
        string $gateway = 'cod',
        ?ShippingMethod $shipping = null,
        array $rules = [],
        ?string $source = 'web',
        ?int $actorId = null,
    ): Order {
        return DB::transaction(function () use ($cart, $gateway, $shipping, $rules, $source, $actorId): Order {
            $items = $cart->items()->get();

            if ($items->isEmpty()) {
                throw new InvalidArgumentException('An empty cart cannot become an order.');
            }

            if ($cart->status !== Cart::ACTIVE) {
                throw new LogicException("Cart {$cart->id} is {$cart->status}; it cannot be placed twice.");
            }

            $addresses = $cart->addresses()->get()->map(static fn ($address): array => [
                'type' => $address->type,
                'name' => $address->name,
                'phone' => $address->phone,
                'line1' => $address->line1,
                'line2' => $address->line2,
                'city' => $address->city,
                'province' => $address->province,
                'postcode' => $address->postcode,
                'country' => $address->country,
            ])->values()->all();

            if ($addresses === []) {
                // Checked before the stock lock and before a number is taken: a cart with no
                // address was never going to become an order, and burning a sequence value to
                // discover that is how gaps appear in a numbering scheme customers read aloud.
                throw new InvalidArgumentException('A delivery address is required before placing the order.');
            }

            // 1 + 2. Lock, then plan. The lock covers every source that holds any requested
            // variant, so a second checkout for the same chair waits rather than double-selling it.
            $stock = $this->lockStock($items->pluck('variant_id')->filter()->unique()->values()->all());
            $plan = $this->planner->plan($this->requestsFrom($items->all()), $this->rowsFrom($stock));

            // 3. Refuse before writing.
            if (! $plan->isComplete()) {
                throw new InsufficientStock($plan);
            }

            // 4. Price with the same calculator the cart used.
            $rows = array_map(static fn ($item): array => $item->toPricingRow(), $items->all());
            $totals = $this->calculator->calculate(
                PricedCart::fromRows($rows, currency: $cart->currency, shipping: $shipping ?? CartService::cashOnDelivery(), rules: $rules),
            );

            // 5. Numbers, under their own row locks.
            [$orderNumber, $invoiceNumber] = $this->numbers->pair();

            $draft = OrderDraft::assemble(
                totals: $totals,
                number: $orderNumber,
                invoiceNumber: $invoiceNumber,
                gateway: $gateway,
                addresses: $addresses,
                source: (string) $source,
                couponCode: $this->couponOf($rules),
                currency: $cart->currency,
            );

            // 6. Everything, together.
            $order = Order::create(array_merge($draft->toOrderRow(), [
                'cart_id' => $cart->id,
                'customer_id' => $cart->customer_id,
                'placed_at' => now(),
            ]));

            $orderItems = $this->writeItems($order, $draft, $items->all());

            $order->addresses()->createMany($draft->toAddressRows());

            $invoice = Invoice::create(array_merge($draft->toInvoiceRow(), [
                'order_id' => $order->id,
                'issued_at' => now(),
            ]));

            $invoice->items()->createMany($draft->toInvoiceItemRows($orderItems));

            Payment::create(array_merge($draft->toPaymentRow(), [
                'order_id' => $order->id,
                'invoice_id' => $invoice->id,
            ]));

            $order->history()->create($draft->toHistoryRow());

            // Stock leaves the shelf now. A COD order is going to be delivered, so the units are
            // committed rather than merely held; the reservation rows are written and released
            // in the same breath, which keeps the audit trail without a second lifecycle.
            $this->consume($cart, $order, $plan, $stock);

            $cart->update(['status' => Cart::CONVERTED, 'shipping_method_code' => $shipping?->code ?? 'cod']);

            return $order->refresh();
        });
    }

    /**
     * @param  list<int|string>  $variantIds
     * @return \Illuminate\Support\Collection<int, InventoryItem>
     */
    private function lockStock(array $variantIds)
    {
        return InventoryItem::query()
            ->with('source')
            ->whereIn('variant_id', $variantIds)
            ->orderBy('source_id')
            ->lockForUpdate()
            ->get();
    }

    /**
     * @param  list<\App\Domain\Commerce\Checkout\Models\CartItem>  $items
     * @return list<StockRequest>
     */
    private function requestsFrom(array $items): array
    {
        $requests = [];

        foreach ($items as $item) {
            if ($item->variant_id === null) {
                // A line without a variant cannot be allocated. Treat it as unavailable rather
                // than skipping it, so it shows up in the shortfall with a reason.
                $requests[] = new StockRequest('missing-'.$item->id, $item->sku, $item->qty);

                continue;
            }

            $requests[] = new StockRequest((string) $item->variant_id, $item->sku, (int) $item->qty);
        }

        return $requests;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, InventoryItem>  $stock
     * @return list<StockRow>
     */
    private function rowsFrom($stock): array
    {
        return $stock->map(static fn (InventoryItem $item): StockRow => new StockRow(
            variantId: (string) $item->variant_id,
            sourceId: (string) $item->source_id,
            sourceName: (string) ($item->source?->name ?? $item->source_id),
            onHand: (int) $item->qty,
            reserved: (int) $item->reserved,
            priority: (int) ($item->source?->priority ?? 1),
        ))->all();
    }

    /**
     * @param  list<\App\Domain\Commerce\Checkout\Models\CartItem>  $items
     * @return list<array<string, mixed>>  the created order item rows, with their ids
     */
    private function writeItems(Order $order, OrderDraft $draft, array $items): array
    {
        $references = [];

        foreach ($items as $item) {
            $references[$item->sku] = [
                'variant_id' => $item->variant_id,
                'product_id' => $item->product_id,
                'meta' => $item->meta,
            ];
        }

        $created = [];

        foreach ($draft->toItemRows($references) as $row) {
            $model = $order->items()->create($row);
            $created[] = array_merge($row, ['id' => $model->id]);
        }

        return $created;
    }

    /**
     * @param  \Illuminate\Support\Collection<int, InventoryItem>  $stock
     */
    private function consume(Cart $cart, Order $order, StockPlan $plan, $stock): void
    {
        $byKey = [];

        foreach ($stock as $item) {
            $byKey[$item->variant_id.':'.$item->source_id] = $item;
        }

        foreach ($plan->allocations as $allocation) {
            $key = $allocation['variantId'].':'.$allocation['sourceId'];
            $item = $byKey[$key] ?? null;

            if ($item === null) {
                continue;
            }

            $item->qty = max(0, (int) $item->qty - (int) $allocation['qty']);
            $item->save();

            InventoryReservation::create([
                'cart_id' => $cart->id,
                'order_id' => $order->id,
                'variant_id' => $item->variant_id,
                'source_id' => $item->source_id,
                'qty' => $allocation['qty'],
                'expires_at' => null,
                'released_at' => now(),
                'release_reason' => InventoryReservation::CONVERTED,
            ]);
        }
    }

    /** @param  list<DiscountRule>  $rules */
    private function couponOf(array $rules): ?string
    {
        foreach ($rules as $rule) {
            if ($rule->kind === DiscountRule::COUPON && $rule->code !== null) {
                return $rule->code;
            }
        }

        return null;
    }
}
