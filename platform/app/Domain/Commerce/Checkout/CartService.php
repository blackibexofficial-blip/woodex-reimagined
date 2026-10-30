<?php

declare(strict_types=1);

namespace App\Domain\Commerce\Checkout;

use App\Domain\Commerce\Checkout\Models\Cart;
use App\Domain\Commerce\Checkout\Models\CartAddress;
use App\Domain\Commerce\Checkout\Models\CartItem;
use App\Domain\Commerce\Models\ProductVariant;
use App\Domain\Commerce\Pricing\CartCalculator;
use App\Domain\Commerce\Pricing\CartTotals;
use App\Domain\Commerce\Pricing\DiscountRule;
use App\Domain\Commerce\Pricing\ShippingMethod;
use App\Domain\Commerce\Support\Money;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Everything the storefront and the admin do to a cart before checkout.
 *
 * The pricing itself is not here — it is in CartCalculator, and this class is the only thing
 * that calls it. That separation is what keeps the totals testable and the cart screen honest:
 * every number the customer sees was produced by the one function that owns the arithmetic and
 * then written back to the row, so a page reload cannot invent a different total.
 */
final class CartService
{
    /** Pakistan's standard sales tax. A per-product override belongs in the catalog, not here. */
    public const int DEFAULT_TAX_RATE_BP = 1800;

    /** A guest cart survives an evening of browsing and a night's sleep, then lets its stock go. */
    public const int LIFETIME_HOURS = 24;

    public function __construct(private readonly CartCalculator $calculator = new CartCalculator) {}

    /**
     * Open the cart behind a token, creating it if this is a new visitor.
     *
     * The token is what the cookie holds. It is random, opaque and has nothing to do with the
     * customer id, so a cart URL cannot be guessed and does not leak who owns it.
     */
    public function open(?string $token = null, ?int $customerId = null): Cart
    {
        if ($token !== null && $token !== '') {
            $existing = Cart::query()->where('token', $token)->first();

            if ($existing !== null) {
                if ($existing->status === Cart::ACTIVE && ! $existing->isExpired()) {
                    return $existing;
                }

                // An expired cart is kept, not reused: its lines were priced yesterday, and
                // starting again is cheaper than explaining a total that changed overnight.
                $token = null;
            }
        }

        return Cart::create([
            'token' => $token ?: Str::random(40),
            'customer_id' => $customerId,
            'currency' => 'PKR',
            'status' => Cart::ACTIVE,
            'expires_at' => now()->addHours(self::LIFETIME_HOURS),
        ]);
    }

    /**
     * Add a variant, or increase the line that already holds it.
     *
     * Adding the same variant twice must not produce two lines: that makes the cart look like
     * two different things were bought, and gives the customer two rows to delete.
     */
    public function add(Cart $cart, ProductVariant $variant, int $qty = 1): CartItem
    {
        if ($qty < 1) {
            throw new InvalidArgumentException('Quantity must be at least 1.');
        }

        if ($cart->status !== Cart::ACTIVE) {
            throw new InvalidArgumentException("Cart {$cart->id} is {$cart->status} and cannot be changed.");
        }

        $price = $variant->price();

        if ($price === null) {
            throw new InvalidArgumentException("Variant [{$variant->sku}] has no price.");
        }

        $existing = $cart->items()->where('variant_id', $variant->id)->first();

        if ($existing !== null) {
            $existing->qty += $qty;
            $existing->save();

            return $existing;
        }

        return CartItem::create([
            'cart_id' => $cart->id,
            'variant_id' => $variant->id,
            'product_id' => $variant->product_id,
            'sku' => $variant->sku,
            'name' => $variant->name ?: $variant->product?->displayName() ?? $variant->sku,
            'qty' => $qty,
            'unit_price_minor' => $price->minor,
            'tax_rate_bp' => self::DEFAULT_TAX_RATE_BP,
            'position' => (int) $cart->items()->max('position') + 1,
        ]);
    }

    public function setQty(CartItem $item, int $qty): void
    {
        if ($qty < 1) {
            $item->delete();

            return;
        }

        $item->qty = $qty;
        $item->save();
    }

    public function remove(CartItem $item): void
    {
        $item->delete();
    }

    /**
     * Price the cart and write the totals back to the row.
     *
     * @param  list<DiscountRule>  $rules
     */
    public function recalculate(Cart $cart, ?ShippingMethod $shipping = null, array $rules = []): CartTotals
    {
        $rows = $cart->items()->get()->map(static fn (CartItem $item): array => $item->toPricingRow())->all();

        if ($rows === []) {
            $totals = $this->calculator->calculate(PricedCart::fromRows([]));

            $cart->update([
                'subtotal_minor' => 0,
                'discount_minor' => 0,
                'tax_minor' => 0,
                'shipping_minor' => 0,
                'grand_total_minor' => 0,
            ]);

            return $totals;
        }

        $totals = $this->calculator->calculate(
            PricedCart::fromRows($rows, currency: $cart->currency, shipping: $shipping, rules: $rules),
        );

        $cart->update([
            'subtotal_minor' => $totals->subtotal->minor,
            'discount_minor' => $totals->discountTotal->minor,
            'tax_minor' => $totals->taxTotal->minor,
            'shipping_minor' => $totals->shippingTotal->minor,
            'grand_total_minor' => $totals->grandTotal->minor,
        ]);

        return $totals;
    }

    /** @param  array<string, mixed>  $address */
    public function setAddress(Cart $cart, string $type, array $address): CartAddress
    {
        return CartAddress::updateOrCreate(
            ['cart_id' => $cart->id, 'type' => $type],
            $address,
        );
    }

    /** The default delivery option: cash on delivery, flat, free above a large order. */
    public static function cashOnDelivery(): ShippingMethod
    {
        return new ShippingMethod(
            code: 'cod',
            label: 'Cash on delivery',
            baseRate: new Money(250_000),
            freeOver: new Money(20_000_000),
            etaDays: 4,
        );
    }
}
