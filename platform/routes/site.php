<?php

declare(strict_types=1);

use App\Http\Controllers\Api\Site\SiteController;
use Illuminate\Support\Facades\Route;

/*
 * The reimagined site's content API.
 *
 * Mounted by routes/api.php as:
 *
 *     Route::prefix('site/v1')->name('site.')->group(base_path('routes/site.php'));
 *
 * Read-only, public, same origin as the SPA — so there is no CORS to configure and no second deploy target.
 * Throttled because a content endpoint is cheap but not free, and the site's own pages hammer it.
 */

Route::middleware('throttle:180,1')->group(function (): void {
    Route::get('/pages', [SiteController::class, 'pages'])->name('pages');
    Route::get('/pages/{key}', [SiteController::class, 'page'])->name('pages.show');

    Route::get('/content/{type}', [SiteController::class, 'content'])->name('content');
    Route::get('/content/{type}/{slug}', [SiteController::class, 'contentItem'])->name('content.show');

    Route::get('/theme', [SiteController::class, 'theme'])->name('theme');
});
