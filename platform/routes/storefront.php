<?php

declare(strict_types=1);

use App\Http\Controllers\Api\Storefront\CatalogController;
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
});
