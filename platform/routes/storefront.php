<?php

declare(strict_types=1);

use App\Http\Controllers\Api\Storefront\CatalogController;
use App\Http\Controllers\Api\Storefront\CheckoutController;
use App\Http\Controllers\Api\Storefront\CheckoutRaceController;
use App\Http\Controllers\Api\Storefront\MaterialsController;
use Illuminate\Support\Facades\Route;

/**
 * Public storefront API.
 *
 * Included from `routes/api.php`:
 *
 *     Route::prefix('storefront/v1')->name('storefront.')->group(base_path('routes/storefront.php'));
 *
 * Yields /api/storefront/v1/products — the namespace the SPA already calls, the same one
 * documented in docs/07-woodex-os/openapi.yaml. Nothing here is authenticated; everything here
 * is cached.
 *
 * Throttling is per IP and generous enough for a page that fires three catalog requests, but
 * tight enough that a scraper gets nowhere: the catalog is public, the bandwidth is not free.
 */
Route::middleware('throttle:storefront-catalog')->group(function (): void {
    Route::get('/products', [CatalogController::class, 'index'])->name('products.index');
    Route::get('/products/{slug}', [CatalogController::class, 'show'])->name('products.show');
    Route::get('/categories', [CatalogController::class, 'categories'])->name('categories.index');
    Route::get('/materials', MaterialsController::class)->name('materials.index');

    // Pricing a basket is a read: it writes nothing, and the customer may do it several times
    // while deciding. It shares the catalog's budget.
    Route::post('/checkout/quote', [CheckoutController::class, 'quote'])->name('checkout.quote');
});

/*
 * Placing an order gets its own, tighter limit.
 *
 * Ten attempts a minute is generous for a human who mistyped a phone number and stingy for a
 * script that wants to fill the orders table — every attempt allocates a sequence number and
 * writes an invoice, so the limit is protecting the numbering, not the CPU.
 */
Route::post('/checkout', [CheckoutController::class, 'store'])
    ->middleware('throttle:10,1')
    ->name('checkout.store');

/*
 * The T12 checkout race. Registered outside the public rate limit because the probe fires
 * requests simultaneously on purpose, and answers 404 unless a probe token is configured.
 */
Route::post('/checkout/race', CheckoutRaceController::class)->name('checkout.race');
