<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Storefront;

use App\Domain\Commerce\Api\CartQuote;
use App\Domain\Commerce\Checkout\CartService;
use App\Domain\Commerce\Checkout\CheckoutService;
use App\Domain\Commerce\Checkout\InsufficientStock;
use App\Domain\Commerce\Models\Product;
use App\Domain\Commerce\Models\ProductVariant;
use App\Domain\Commerce\Checkout\PricedCart;
use App\Domain\Commerce\Pricing\CartCalculator;
use App\Domain\Commerce\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The storefront's checkout: quote first, then place.
 *
 * The SPA keeps the basket in the browser and sends the lines with each request. That is a
 * deliberate choice over a server-side cart: the platform is on shared hosting with thirty
 * PHP workers, and a cart that lives in a session is a read and a write on every quantity
 * click. The lines are re-priced here on every call, so what the browser *thinks* a desk costs
 * is never what it pays — the server is the only opinion that counts.
 *
 * The price the customer sees in the quote and the price they are charged come from the same
 * calculator and the same shipping rule, so the summary cannot disagree with the invoice.
 */
final class CheckoutController
{
    /** A basket bigger than this is a purchase order, and it should go through sales. */
    private const int MAX_LINES = 20;

    private const int MAX_QTY_PER_LINE = 10;

    public function __construct(
        private readonly CartService $carts,
        private readonly CheckoutService $checkout,
        private readonly CartCalculator $calculator,
    ) {}

    /**
     * Price a basket without creating anything.
     *
     * No cart row, no reservation, no sequence number — this endpoint runs before the customer
     * has decided, possibly several times, and a "quote" that leaves marks in the database is
     * an abandoned cart for every keystroke.
     */
    public function quote(Request $request): JsonResponse
    {
        $data = $this->validated($request, requireCustomer: false);
        $resolved = $this->resolve($data['lines']);

        $totals = $this->calculator->calculate(PricedCart::fromRows(
            $resolved['rows'],
            shipping: CartService::cashOnDelivery(),
        ));

        $quote = CartQuote::fromLineTotals($totals->lines, $totals, $resolved['display']);

        return response()->json(['data' => $quote->toArray()]);
    }

    /**
     * Place the order.
     *
     * The cart is opened, filled and addressed inside this request, then handed to the same
     * CheckoutService the admin and the load probe use — so stock is locked, the plan is
     * refused before anything is written, and the invoice is issued in one transaction.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, requireCustomer: true);
        $resolved = $this->resolve($data['lines']);

        $cart = $this->carts->open();

        foreach ($resolved['variants'] as $line) {
            $this->carts->add($cart, $line['variant'], $line['qty']);
        }

        $customer = $data['customer'];
        $shipping = $data['shipping'];

        $this->carts->setAddress($cart, 'shipping', [
            'name' => $customer['name'],
            'phone' => $customer['phone'],
            'line1' => $shipping['line1'],
            'line2' => $shipping['line2'] ?? null,
            'city' => $shipping['city'],
            'province' => $shipping['province'] ?? null,
            'postcode' => $shipping['postcode'] ?? null,
            'country' => 'PK',
        ]);

        try {
            $order = $this->checkout->place(
                cart: $cart,
                gateway: (string) ($data['gateway'] ?? 'cod'),
                shipping: CartService::cashOnDelivery(),
                source: 'web',
            );
        } catch (InsufficientStock $e) {
            // 409, not 500: the customer asked for something the shelf cannot cover, and the
            // shortfall is the useful part of the answer.
            return response()->json([
                'error' => [
                    'code' => 'insufficient_stock',
                    'message' => 'One or more items are no longer available in that quantity.',
                ],
                'shortfalls' => $e->plan->shortfalls,
            ], 409);
        }

        // The note and the email are the customer's, not the calculator's, so they are written
        // after the order exists — a note that fails to save must never fail a placed order.
        $order->forceFill(array_filter([
            'notes' => $data['notes'] ?? null,
            'email' => $data['customer']['email'] ?? null,
        ]))->save();

        return response()->json(['data' => [
            'number' => $order->number,
            'status' => $order->status,
            'payment_status' => $order->payment_status,
            'payment_method' => $order->paymentGateway(),
            'currency' => $order->currency,
            'total_minor' => $order->grand_total_minor,
            'total' => $this->money($order->grand_total_minor),
            'amount_due_minor' => $order->amountDueMinor(),
            'placed_at' => $order->placed_at?->toIso8601String(),
            'invoice_number' => $order->invoices()->value('number'),
            'lines' => $order->items()->get()->map(static fn ($item): array => [
                'slug' => $item->sku,
                'name' => $item->name,
                'quantity' => (int) $item->qty,
                'line_total_minor' => (int) $item->line_total_minor,
                'line_total' => Money::ofMinor((int) $item->line_total_minor, (string) $order->currency)->format(),
            ])->all(),
            'shipping_estimate_days' => CartService::cashOnDelivery()->etaDays,
        ]], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $requireCustomer): array
    {
        $rules = [
            'lines' => ['required', 'array', 'min:1', 'max:'.self::MAX_LINES],
            'lines.*.slug' => ['required', 'string', 'max:190'],
            'lines.*.qty' => ['required', 'integer', 'min:1', 'max:'.self::MAX_QTY_PER_LINE],
            'lines.*.color' => ['sometimes', 'nullable', 'string', 'max:60'],
            'gateway' => ['sometimes', 'string', 'in:cod,bank'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ];

        if ($requireCustomer) {
            $rules += [
                'customer.name' => ['required', 'string', 'max:120'],
                'customer.phone' => ['required', 'string', 'max:32'],
                'customer.email' => ['sometimes', 'nullable', 'email', 'max:190'],
                'shipping.line1' => ['required', 'string', 'max:190'],
                'shipping.line2' => ['sometimes', 'nullable', 'string', 'max:190'],
                'shipping.city' => ['required', 'string', 'max:80'],
                'shipping.province' => ['sometimes', 'nullable', 'string', 'max:80'],
                'shipping.postcode' => ['sometimes', 'nullable', 'string', 'max:16'],
            ];
        }

        return $request->validate($rules);
    }

    /**
     * Turn slugs into orderable variants, or refuse with the product that made it impossible.
     *
     * Three things can go wrong and each gets its own message: the product is not in the
     * catalogue (404 territory but expressed as a field error so the basket can mark the
     * line), it has no active variant, or its variant has no price.
     *
     * @param  list<array{slug: string, qty: int, color?: string|null}>  $lines
     * @return array{rows: list<array<string, mixed>>, variants: list<array{variant: ProductVariant, qty: int}>, display: array<string, array<string, mixed>>}
     */
    private function resolve(array $lines): array
    {
        $rows = [];
        $variants = [];
        $display = [];

        foreach (array_values($lines) as $index => $line) {
            $product = Product::query()
                ->published()
                ->with(['translation', 'variants' => static fn ($query) => $query->where('is_active', true)->orderBy('position')])
                ->where('slug', $line['slug'])
                ->first();

            if ($product === null) {
                throw ValidationException::withMessages([
                    "lines.{$index}.slug" => "That product is no longer in the catalogue.",
                ]);
            }

            $variant = $product->variants->first();

            if ($variant === null) {
                throw ValidationException::withMessages([
                    "lines.{$index}.slug" => "That product cannot be ordered right now.",
                ]);
            }

            $price = $variant->price();

            if ($price === null) {
                throw ValidationException::withMessages([
                    "lines.{$index}.slug" => "That product has no price yet.",
                ]);
            }

            $qty = (int) $line['qty'];

            $rows[] = [
                'sku' => $variant->sku,
                'name' => $product->displayName(),
                'qty' => $qty,
                'unit_price_minor' => $price->minor,
                'tax_rate_bp' => CartService::DEFAULT_TAX_RATE_BP,
                'product_id' => (string) $product->id,
                'position' => $index,
            ];

            $variants[] = ['variant' => $variant, 'qty' => $qty];
            $display[$variant->sku] = [
                'slug' => $product->slug,
                'color' => $line['color'] ?? null,
                'image' => null,
            ];
        }

        return ['rows' => $rows, 'variants' => $variants, 'display' => $display];
    }

    private function money(int $minor): string
    {
        return Money::ofMinor($minor)->format();
    }
}
