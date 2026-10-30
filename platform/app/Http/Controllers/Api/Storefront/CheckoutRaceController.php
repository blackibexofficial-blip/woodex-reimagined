<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Storefront;

use App\Domain\Commerce\Checkout\CartService;
use App\Domain\Commerce\Checkout\CheckoutService;
use App\Domain\Commerce\Checkout\InsufficientStock;
use App\Domain\Commerce\Models\ProductVariant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The endpoint the checkout-race probe fires at.
 *
 * It exists so the probe measures the *real* path — HTTP into PHP-FPM, a cart, the same
 * CheckoutService the storefront will use, a transaction, a response — rather than a seeder
 * run in-process. A race that is simulated inside one PHP process is not a race.
 *
 * It is not a public endpoint. Without a configured probe token the route answers 404, not
 * 403: a 403 confirms the endpoint exists and invites someone to go looking for the token,
 * while a 404 is what a stranger would get from a storefront that simply does not have it.
 *
 * Successful attempts return 201. Refusals return 409 with the reason — that is the expected
 * outcome for four of five callers, and the probe counts them as such rather than as errors.
 */
final class CheckoutRaceController
{
    public function __construct(
        private readonly CartService $carts,
        private readonly CheckoutService $checkout,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        abort_unless($this->authorised($request), 404);

        $data = $request->validate([
            'variant_id' => ['required', 'integer', 'exists:commerce_product_variants,id'],
            'qty' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'gateway' => ['sometimes', 'string', 'in:cod,bank'],
            'address.name' => ['required', 'string', 'max:120'],
            'address.phone' => ['required', 'string', 'max:32'],
            'address.line1' => ['required', 'string', 'max:190'],
            'address.city' => ['required', 'string', 'max:80'],
        ]);

        $variant = ProductVariant::query()->active()->findOrFail($data['variant_id']);

        $cart = $this->carts->open();
        $this->carts->add($cart, $variant, (int) ($data['qty'] ?? 1));
        $this->carts->setAddress($cart, 'shipping', [
            'name' => $data['address']['name'],
            'phone' => $data['address']['phone'],
            'line1' => $data['address']['line1'],
            'city' => $data['address']['city'],
            'country' => 'PK',
        ]);

        try {
            $order = $this->checkout->place($cart, (string) ($data['gateway'] ?? 'cod'), source: 'probe');
        } catch (InsufficientStock $e) {
            return response()->json([
                'message' => $e->getMessage(),
                'available' => $e->plan->shortfalls[0]['available'] ?? 0,
            ], 409);
        }

        return response()->json([
            'number' => $order->number,
            'total_minor' => $order->grand_total_minor,
            'status' => $order->status,
        ], 201);
    }

    private function authorised(Request $request): bool
    {
        $expected = config('commerce.probe.token');

        if (! is_string($expected) || $expected === '') {
            return false;
        }

        $given = $request->header('X-Load-Probe');

        return is_string($given) && $given !== '' && hash_equals($expected, $given);
    }
}
