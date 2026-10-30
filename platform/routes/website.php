<?php

declare(strict_types=1);

use App\Http\Controllers\Admin\PageDocumentController;
use App\Http\Controllers\Website\PuckPageController;
use App\Livewire\Admin\Website\PageEditor;
use Illuminate\Support\Facades\Route;

/**
 * The website module's routes: one public route for a page, one admin route for its editor.
 *
 * Included from `routes/web.php`:
 *
 *     Route::middleware('web')->group(base_path('routes/website.php'));
 *
 * The `/p/` prefix is deliberate. It lets the new builder serve live URLs while the 142
 * file-backed pages keep their existing routes; moving a page over is a data change (`builder`
 * flips to 'puck'), never a route change — so nothing 404s during the migration, and a page can
 * be moved back by flipping the same column.
 *
 * The public route has no auth middleware. A published page is public; a draft is visible only
 * through the single `preview_token` on its row, which is why that token is 40 random
 * characters and checked per page rather than granting access to anything else.
 */
Route::get('/p/{slug}', [PuckPageController::class, 'show'])
    ->where('slug', '.*')
    ->name('puck.page');

/**
 * Admin endpoints. The surrounding group brings the session, the admin layout and the usual
 * authenticated/active-user middleware; the permissions themselves are checked in the
 * component and in the controller, so a URL typed by hand fails exactly like a hidden item.
 */
Route::middleware(['auth'])->prefix('admin/website')->name('admin.website.')->group(function (): void {
    Route::get('/pages/{page}/edit', PageEditor::class)->name('pages.edit');

    Route::put('/pages/{page}/document', [PageDocumentController::class, 'update'])
        ->middleware('throttle:60,1')
        ->name('pages.document');
});
