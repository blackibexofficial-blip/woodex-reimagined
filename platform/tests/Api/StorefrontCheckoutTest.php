<?php

declare(strict_types=1);

namespace Tests\Api;

use Tests\Support\Assert;

/**
 * The storefront's checkout, read as source text.
 *
 * Named `StorefrontCheckoutTest` and not `CheckoutWiringTest`: the T11 suite already has a
 * class by that name, and the runner identifies a test by its class name — two classes called
 * the same thing means one of them silently never runs.
 *
 * This endpoint writes money-bearing rows: an order, an invoice, a payment and a stock
 * reservation. The parts that matter cannot be proven by a unit test in this sandbox — there
 * is no database — so the rules that keep it safe are pinned as text: it must delegate to the
 * same service the admin uses, it must refuse before it writes, and a quote must leave no
 * trace.
 */
final class StorefrontCheckoutTest
{
    private function root(): string
    {
        return dirname(__DIR__, 2);
    }

    private function source(string $relative): string
    {
        $path = $this->root().$relative;

        Assert::trueWith(is_file($path), static fn (): string => "missing file {$relative}", 'file exists');

        return is_file($path) ? (string) file_get_contents($path) : '';
    }

    public function testTheQuoteAndTheOrderAreSeparateRoutesWithSeparateLimits(): void
    {
        $routes = $this->source('/routes/storefront.php');

        Assert::true(str_contains($routes, "/checkout/quote"), 'the quote has its own route');
        Assert::true(str_contains($routes, "'/checkout'"), 'and so does placing the order');
        Assert::true(str_contains($routes, "throttle:10,1"), 'placing an order is rate limited');
        Assert::true(str_contains($routes, "throttle:storefront-catalog"), 'the quote shares the catalog budget');
    }

    public function testAQuoteNeverOpensACart(): void
    {
        $controller = $this->source('/app/Http/Controllers/Api/Storefront/CheckoutController.php');

        $quote = substr($controller, (int) strpos($controller, 'public function quote'));
        $quote = substr($quote, 0, (int) strpos($quote, 'public function store'));

        Assert::same(false, str_contains($quote, '->open('), 'a quote opens no cart');
        Assert::same(false, str_contains($quote, '->place('), 'and places no order');
        Assert::same(false, str_contains($quote, 'setAddress'), 'and writes no address');
        Assert::true(str_contains($quote, '->calculate('), 'it only prices');
    }

    public function testTheOrderIsPlacedByTheSameServiceTheAdminUses(): void
    {
        $controller = $this->source('/app/Http/Controllers/Api/Storefront/CheckoutController.php');

        Assert::true(str_contains($controller, 'use App\\Domain\\Commerce\\Checkout\\CheckoutService;'), 'the shared service is injected');
        Assert::true(str_contains($controller, '$this->checkout->place('), 'and called, not reimplemented');
        Assert::true(
            str_contains($controller, 'CartService::cashOnDelivery()'),
            'shipping comes from the same rule the cart uses, so the quote and the order agree',
        );
    }

    public function testOutOfStockIsAConflictWithTheShortfallAndNotAServerError(): void
    {
        $controller = $this->source('/app/Http/Controllers/Api/Storefront/CheckoutController.php');

        Assert::true(str_contains($controller, 'catch (InsufficientStock'), 'the refusal is caught');
        Assert::true(str_contains($controller, 'insufficient_stock'), 'and named');
        Assert::true(str_contains($controller, '], 409);'), 'and answered with 409, so the basket can explain itself');
    }

    public function testAProductThatCannotBeOrderedIsRefusedBeforeAnyRowIsWritten(): void
    {
        $controller = $this->source('/app/Http/Controllers/Api/Storefront/CheckoutController.php');

        $resolve = substr($controller, (int) strpos($controller, 'private function resolve'));
        $resolve = substr($resolve, 0, (int) strpos($resolve, 'private function money'));

        Assert::true(str_contains($resolve, 'published()'), 'only published products can be bought');
        Assert::true(str_contains($resolve, 'ValidationException::withMessages'), 'an unknown slug is a field error, not a 500');
        Assert::true(str_contains($resolve, 'cannot be ordered right now'), 'a product with no active variant is refused');
        Assert::true(str_contains($resolve, 'has no price yet'), 'and so is one with no price');
    }

    public function testABasketCannotBeUsedToFloodTheOrdersTable(): void
    {
        $controller = $this->source('/app/Http/Controllers/Api/Storefront/CheckoutController.php');

        Assert::true(str_contains($controller, 'MAX_LINES = 20'), 'line count is bounded');
        Assert::true(str_contains($controller, 'MAX_QTY_PER_LINE = 10'), 'and quantity per line');
        Assert::true(str_contains($controller, "'min:1'"), 'a zero-quantity line is refused, not priced');
    }

    public function testTheReceiptCarriesTheNumberTheCustomerWillQuote(): void
    {
        $controller = $this->source('/app/Http/Controllers/Api/Storefront/CheckoutController.php');

        Assert::true(str_contains($controller, "'number' => \$order->number"), 'the order number is returned');
        Assert::true(str_contains($controller, "'invoice_number'"), 'so is the invoice');
        Assert::true(str_contains($controller, '], 201);'), 'and the response is a 201');
        Assert::true(str_contains($controller, 'amountDueMinor()'), 'the amount due comes from the order, not from the request');
    }
}
