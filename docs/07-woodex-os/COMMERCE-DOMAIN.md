# Commerce Domain — Implementation Spec

**Target:** `platform/app/Domain/Commerce/` inside WOODEX OS (Laravel 13 / Livewire 4 / PHP 8.4 / MySQL 8)
**Companion:** [`MASTER-PLAN.md`](./MASTER-PLAN.md) §5–§9 · [`openapi.yaml`](./openapi.yaml)

---

## 1. Layout

```
app/Domain/Commerce/
├── Models/          Product, Variant, Attribute, AttributeValue, Category, Collection,
│                    Media, PriceList, Price, Inventory, StockMovement,
│                    Cart, CartItem, Order, OrderItem, Shipment, Return
├── Actions/         PublishProduct, SyncVariants, ResolvePrice, ReserveStock, ReleaseStock,
│                    CreateCart, AddCartItem, UpdateCartItem, StartCheckout, PlaceOrder,
│                    CancelOrder, RaiseOrderInvoice, RecordOrderPayment, CreateShipment, RefundOrder
├── Data/            ProductData, VariantData, PriceData, CartData, OrderData (spatie/laravel-data style arrays)
├── Services/        CatalogService, PricingService (price lists + company tiers), StockService,
│                    CheckoutService, OrderNumberService (wraps NumberSequence)
├── Enums/           OrderStatus, PaymentStatus, CartStatus, StockReason
├── Events/          OrderPlaced, OrderPaid, OrderShipped, OrderCancelled, StockDepleted
└── Policies/        ProductPolicy, OrderPolicy, PriceListPolicy
```

**Architecture rule (enforced by a test):** files under `Domain/Commerce` may not reference
`Domain\Accounts\Models\JournalEntry`/`JournalLine` or `Domain\Sales\Models\Payment` for **writing**; they must go
through `Domain\Sales\Actions\*` and `Domain\Accounts\Actions\*`.

---

## 2. Migrations (create, in order)

| # | Migration | Key columns / notes |
|---:|---|---|
| 1 | `create_commerce_categories` | `parent_id` self-FK, `slug` unique, `position`, `image_path` |
| 2 | `create_commerce_attributes` | `code` unique, `type` enum(select,color,text), `unit` |
| 3 | `create_commerce_attribute_values` | `attribute_id`, `value`, `hex` (nullable) |
| 4 | `create_commerce_products` | `sku` unique, `slug` unique, `category_id`, `series_code`, `is_active`, `lead_time_days`, SEO fields |
| 5 | `create_commerce_variants` | `product_id`, `sku` unique, `price_minor` BIGINT, `compare_at_minor`, `cost_minor`, `is_default` |
| 6 | `create_commerce_variant_values` | pivot (`variant_id`,`attribute_value_id`) unique |
| 7 | `create_commerce_media` | `product_id`, `path`, `alt`, `position`, `is_cover` |
| 8 | `create_commerce_collections` | `type` enum(series,room_package,curated), `slug` |
| 9 | `create_commerce_collection_items` | (`collection_id`,`product_id`) unique, `position` |
| 10 | `create_commerce_price_lists` | `code`, `company_id` nullable → B2B tiers, `starts_at`, `ends_at` |
| 11 | `create_commerce_prices` | (`price_list_id`,`variant_id`) unique, `amount_minor` |
| 12 | `create_commerce_inventory_sources` | `name`, `city`, `type` enum(showroom,workshop,warehouse) |
| 13 | `create_commerce_inventory` | (`variant_id`,`source_id`) unique, `on_hand`, `reserved` |
| 14 | `create_commerce_stock_movements` | `variant_id`, `source_id`, `qty` signed, `reason` enum, `reference` morph, `created_by` |
| 15 | `create_commerce_carts` | `token` unique, `customer_id` nullable, `company_id` nullable, `status`, `expires_at` |
| 16 | `create_commerce_cart_items` | `cart_id`, `variant_id`, `qty`, `unit_price_minor` (snapshot), `note` |
| 17 | `create_commerce_orders` | `number` unique, `cart_id`, `customer_id`, `company_id`, `status`, `payment_status`, money columns, `invoice_id` nullable FK → `invoices`, `placed_at` |
| 18 | `create_commerce_order_items` | `order_id`, `variant_id`, **`name_snapshot`**, `unit_price_minor`, `line_total_minor` |
| 19 | `create_commerce_shipments` | `order_id`, `carrier`, `tracking`, `status`, timestamps |
| 20 | `create_commerce_returns` | `order_id`, `reason`, `status`, `refund_minor` |
| 21 | `add_commerce_permissions` | seeder: `commerce.view`, `commerce.manage`, `commerce.pricing`, `commerce.fulfil` |

**Conventions**

- Money: `*_minor` BIGINT (paisa), rendered via `App\Support\Money`. Never floats.
- Every table: `timestamps()`, and `softDeletes()` on products/carts/orders (finance-adjacent rows are never hard-deleted).
- Indexes: `products(slug)`, `products(is_active,published_at)`, `variants(product_id)`,
  `prices(variant_id,price_list_id)`, `inventory(variant_id,source_id)`,
  `orders(number)`, `orders(status,placed_at)`, `carts(token)`, `cart_items(cart_id)`.
- FKs `restrictOnDelete()` for anything referenced by an order.

---

## 3. Actions — contracts

| Action | Input | Side effects |
|---|---|---|
| `ResolvePrice` | variant, customer/company, qty, date | picks best price list → amount (no DB write) |
| `ReserveStock` | variant, qty, reference | increments `inventory.reserved`, writes `stock_movements` (reason `reserve`) |
| `PlaceOrder` | cart, customer, address, payment method | creates `Order` + items, reserves stock, raises draft `Invoice` via Sales, emits `OrderPlaced`, queues notifications |
| `RaiseOrderInvoice` | order | calls `Sales\Actions\CreateManualInvoice` → stores `invoice_id` |
| `RecordOrderPayment` | order, amount, method, proof | calls `Sales\Actions\RecordPayment` + `AllocatePayment` → updates `payment_status` |
| `CreateShipment` | order, carrier, tracking | shipment row, order → shipped, WhatsApp/email notify |
| `RefundOrder` | order, amount, reason | `commerce_returns` + credit note through Sales; restock via `stock_movements` |

Every action: `DB::transaction()`, an `ActivityLog` entry, and an idempotency guard on the mutating ones.

---

## 4. Storefront endpoints (Laravel routes)

Add `routes/storefront.php`, registered with prefix `api/storefront/v1`, middleware
`['throttle:storefront', 'cache.headers:public;max_age=300;etag']` for reads:

```php
Route::get('products',            [ProductController::class, 'index']);
Route::get('products/{slug}',     [ProductController::class, 'show']);
Route::get('categories',          [CategoryController::class, 'index']);
Route::get('series',              [SeriesController::class, 'index']);
Route::get('materials',           [MaterialController::class, 'index']);
Route::get('room-packages',       [RoomPackageController::class, 'index']);
Route::get('projects',            [ProjectController::class, 'index']);
Route::get('posts',               [PostController::class, 'index']);
Route::get('posts/{slug}',        [PostController::class, 'show']);
Route::post('quotes',             [QuoteRequestController::class, 'store'])->middleware('throttle:storefront-write');
Route::get('quotes/{number}',     [QuoteRequestController::class, 'show']);
Route::post('carts',              [CartController::class, 'store']);
Route::patch('carts/{token}/items', [CartController::class, 'patch']);
Route::post('checkout',           [CheckoutController::class, 'store'])->middleware(['idempotent']);
Route::get('orders/{number}',     [OrderController::class, 'show']);
Route::post('payments/intents',   [PaymentController::class, 'store']);
Route::post('webhooks/{gateway}', [WebhookController::class, 'handle']);
Route::post('leads',              [LeadController::class, 'store'])->middleware('throttle:public-leads');
```

Existing `api/public/*` endpoints stay untouched (the legacy site and chat widget depend on them).

---

## 5. Seeding the catalog from the storefront

A one-time artisan command converts this repo's TypeScript data into commerce records:

```bash
php artisan commerce:import-storefront \
  --products=../woodex-reimagined/src/data/products.ts \
  --materials=../woodex-reimagined/src/data/materials.ts \
  --services=../woodex-reimagined/src/data/services.ts \
  --posts=../woodex-reimagined/src/data/blogPosts.ts \
  --media=../woodex-reimagined/src/assets
```

Mapping:

| Storefront field | Commerce target |
|---|---|
| `id` | `products.sku` (slug form) |
| `name`, `shortDescription`, `description` | product columns |
| `category`, `subcategory` | category tree (2 groups → 28 subcategories) |
| `series` | collection (`type=series`) |
| `price`, `originalPrice` | default variant `price_minor`, `compare_at_minor` |
| `colors[].name/hex` | attribute `colour` + values |
| `images[]` | media library (copied into storage, not hot-linked) |
| `specifications[]`, `features[]` | product JSON columns or attribute set |
| `inStock`, `isNew`, `isBestSeller`, `rating`, `reviews` | flags + cached aggregates |
| materials (`id,name,family,hex,brightness`) | attribute `finish` values + material library page |

Idempotent (`updateOrCreate` on SKU), so it can run on every deploy.

---

## 6. Acceptance tests (Pest, matching the OS's existing style)

| Test | Asserts |
|---|---|
| `CommerceCatalogApiTest` | pagination, filters, ETag 304, unknown slug → 404 |
| `CommercePricingTest` | company price list beats public price; date windows; qty tiers |
| `CommerceStockTest` | reserve/release idempotency; oversell rejected under concurrency (`lockForUpdate`) |
| `CommerceCheckoutTest` | cart → order; invoice raised; totals match line sums; stock reserved |
| `CommercePaymentTest` | webhook HMAC verified; replay rejected; payment allocated; order paid |
| `CommerceQuoteBridgeTest` | storefront quote creates `Lead` + `Quote`; token read; accept path |
| `CommerceArchitectureTest` | no direct writes to financial tables from Commerce (static analysis) |
| `CommerceAdminAccessTest` | each new route blocked without its permission |

Definition of done for P1: catalog API green + storefront rendering entirely from the API with a page-by-page
parity report against the static data.
