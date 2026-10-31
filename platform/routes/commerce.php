<?php

declare(strict_types=1);

use App\Livewire\Admin\Commerce\AttributesIndex;
use App\Livewire\Admin\Commerce\CategoriesIndex;
use App\Livewire\Admin\Commerce\CustomersIndex;
use App\Livewire\Admin\Commerce\Dashboard;
use App\Livewire\Admin\Commerce\InventoryIndex;
use App\Livewire\Admin\Commerce\InvoicesIndex;
use App\Livewire\Admin\Commerce\OrdersIndex;
use App\Livewire\Admin\Commerce\OrderShow;
use App\Livewire\Admin\Commerce\PaymentsIndex;
use App\Livewire\Admin\Commerce\ProductsIndex;
use App\Livewire\Admin\Commerce\PromotionsIndex;
use App\Livewire\Admin\Commerce\RefundsIndex;
use App\Livewire\Admin\Commerce\ReportsIndex;
use App\Livewire\Admin\Commerce\SettingsIndex;
use App\Livewire\Admin\Commerce\ShippingTaxIndex;
use Illuminate\Support\Facades\Route;

/**
 * Commerce routes.
 *
 * Included from `routes/admin.php` inside the existing authenticated, two-factor, active-user
 * group — so every screen inherits the same session, the same layout and the same middleware.
 * No new auth stack, no second login.
 *
 *     // routes/admin.php, inside the $admin group
 *     Route::prefix('commerce')->name('commerce.')->group(base_path('routes/commerce.php'));
 *
 * Permissions are checked in each component's mount() as well as in the Blade, so a URL typed
 * by hand fails the same way a hidden sidebar item does.
 */
Route::get('/', Dashboard::class)->name('dashboard');

Route::get('/products', ProductsIndex::class)->name('products');
Route::get('/attributes', AttributesIndex::class)->name('attributes');
Route::get('/categories', CategoriesIndex::class)->name('categories');
Route::get('/inventory', InventoryIndex::class)->name('inventory');

Route::get('/orders', OrdersIndex::class)->name('orders');
Route::get('/orders/{order}', OrderShow::class)->name('orders.show');
Route::get('/invoices', InvoicesIndex::class)->name('invoices');

// filed, and all three need a page with no chrome on it.

Route::get('/payments', PaymentsIndex::class)->name('payments');
Route::get('/refunds', RefundsIndex::class)->name('refunds');

Route::get('/promotions', PromotionsIndex::class)->name('promotions');
Route::get('/shipping', ShippingTaxIndex::class)->name('shipping');
Route::get('/customers', CustomersIndex::class)->name('customers');
Route::get('/reports', ReportsIndex::class)->name('reports');
Route::get('/settings', SettingsIndex::class)->name('settings');
