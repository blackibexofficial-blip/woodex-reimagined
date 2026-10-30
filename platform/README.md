# platform/ — commerce domain, ready to drop into WOODEX OS

This folder mirrors the OS tree exactly, so it can be copied in without editing a single
namespace.

```
platform/app/Domain/Commerce/          →  <os>/app/Domain/Commerce/
platform/tests/Support/*.php           →  <os>/tests/Support/
platform/tests/Commerce/*Test.php      →  <os>/tests/Unit/Commerce/
platform/tests/fixtures/...            →  <os>/tests/fixtures/...
platform/tests/run.php                 →  keep here or delete once Pest is wired
```

> Pest is already in the OS (`pestphp/pest ^5.3`). These classes are written in the plain
> `test*` method style so they run under Pest unchanged, and also run with **no Composer,
> no Laravel, no framework at all** — see below.

## Why the domain has no framework in it

`App\Domain\Commerce` imports nothing from Laravel, Livewire or the database. A cart is a
plain value object; totals are a pure function. That is what makes the money pipeline
testable to the paisa, runnable in CI before `composer install`, and impossible to break
from a controller.

Eloquent models, migrations and Livewire screens live *around* this domain (T3 onward) and
only ever call `CartCalculator::calculate()`.

## Running the tests

```bash
# anywhere with PHP 8.4
php platform/tests/run.php
php platform/tests/run.php Money      # filter by file name
```

```
PASS  GoldenTotalsTest::testEveryFixtureReconcilesToThePaisa      116 assertions
PASS  TotalsInvariantTest::testEveryGeneratedCartKeepsTheSumInvariant  13114 assertions
16/16 tests passed · 13371 assertions · 583 ms
```

No PHP on your machine? The suite also runs through WebAssembly:

```bash
cd platform/tests/sandbox
npm install php-wasm      # ~90 MB, one-off
node run-with-php-wasm.mjs
```

That path exists because the first version of this code was written in an environment with
no PHP binary — and it immediately caught a real 32-bit integer overflow in the rounding
helper. Keep it: it is the cheapest way to run the money pipeline on any machine.

## What is in here (T1 + T2 of the plan)

| File | Purpose |
|---|---|
| `Support/Money.php` | integer minor units, currency-safe, overflow-safe half-up rounding, allocation that never loses a paisa |
| `Pricing/CartLine.php` | one cart line, unit price already resolved by the caller |
| `Pricing/ShippingMethod.php` | rate, free-over threshold, whether freight is taxed |
| `Pricing/DiscountRule.php` | catalog / cart / coupon, percent or fixed, minimum spend, free-shipping action |
| `Pricing/CartInput.php` | a cart, framework-free |
| `Pricing/LineTotal.php` | the money story of one line, kept for invoices and support |
| `Pricing/CartTotals.php` | the priced cart + `toArray()` for the API |
| `Pricing/CartCalculator.php` | the single place that decides what a cart costs |
| `tests/fixtures/commerce/totals/*.json` | the 14 golden carts, hand-computed |
| `app/Domain/Commerce/ATTRIBUTION.md` | what was ported from Bagisto and under which licence |

## The invariant

```
netTotal + taxTotal + shippingTotal == grandTotal
```

Asserted inside the calculator on every run, and again over 1,000 generated carts in the
property test. If a future change breaks it, the calculator throws `LogicException`
instead of returning a wrong total.

## T3 — catalog schema (done)

```
database/migrations/
  2026_10_28_100000_create_commerce_catalog_tables.php          products, translations,
                                                                categories, media, pivot
  2026_10_28_101000_create_commerce_attribute_tables.php        attributes, options, values
  2026_10_28_102000_create_commerce_variant_inventory_tables.php variants, sources, stock
app/Domain/Commerce/Models/     11 Eloquent models
database/factories/             3 factories
database/seeders/CatalogSeeder.php + data/catalog.json
                                20 real products from src/data/products.ts, 4 categories,
                                3 attributes, 3 stock sources, 12 variants
```

**Verification without a database** — `tests/Schema/SchemaTest.php` reads the migration source
and enforces the rules that are expensive to break: every table dropped in `down()`, no
float/decimal columns anywhere, every money bigint named `*_minor`, foreign keys declaring
their delete behaviour, migrations timestamp-ordered. **It found two real bugs immediately**:
translation tables had no `timestamps()` (Eloquent would have failed on the first insert), and
`product_media.variant_id` was declared as a foreign key with no delete behaviour.

`tests/Catalog/CatalogSeedTest.php` validates the seed as data: unique SKUs and slugs, prices
positive integers, every product pointing at a category that exists, every variant pointing at
a real product and a real finish option. **It caught a product referencing a category key that
did not exist** — a failure the seeder would only have hit halfway through `db:seed`.

## Running everything

```bash
php platform/tests/run.php            # lint all PHP + every suite
php platform/tests/run.php --lint     # syntax only
php platform/tests/run.php Money      # one suite
```

```
PASS  Lint::allPhpFiles (46 files)
PASS  TotalsInvariantTest::testEveryGeneratedCartKeepsTheSumInvariant  13114 assertions
PASS  AdminWiringTest::testEveryIconExistsInTheOsIconSet              31 assertions
65/65 checks passed · 14078 assertions · 756 ms
```

## T4 + T5 — the admin shell and the Products screen (done)

```
app/Domain/Commerce/Navigation/CommerceNavigation.php   the Commerce sidebar group
app/Domain/Commerce/Access/CommercePermissions.php      11 permissions + role grants + plain-English descriptions
database/seeders/CommercePermissionsSeeder.php          additive, idempotent, never creates roles
routes/commerce.php                                     14 routes, included from routes/admin.php
app/Livewire/Admin/Commerce/*.php                       Dashboard + Products + 12 screens
app/Livewire/Admin/Commerce/Concerns/CommerceScreen.php shared base for the 12
resources/views/livewire/admin/commerce/*.blade.php     one view per screen + one shared
```

**Wiring in the OS** is two lines:

```php
// App\Support\AdminNavigation::groups(), inside the returned array
...\App\Domain\Commerce\Navigation\CommerceNavigation::groups(),

// routes/admin.php, inside the existing $admin group
Route::prefix('commerce')->name('commerce.')->group(base_path('routes/commerce.php'));

// ProductionSeeder::run(), after RolesAndPermissionsSeeder
$this->call(CommercePermissionsSeeder::class);
```

**The Dashboard shows only what exists.** Catalog counts and stock alerts are live; order and
revenue tiles say "P2" rather than showing ₨0 — a dashboard that reports zero revenue when the
table is simply empty teaches people to distrust it.

**Products edits in the row.** Click a price, type rupees, Enter. Stored as integer paisa, the
conversion happens once on save. A configurable product refuses the edit (its price belongs to
its variants) instead of silently ignoring it. Decimal input is rejected, not rounded.

### `tests/Admin/AdminWiringTest.php`

Eight checks that catch the failures which survive code review:

| Check | Catches |
|---|---|
| 14 screens, unique labels | a nav entry silently dropped in a merge |
| every nav route is registered | a sidebar link to nowhere |
| every route's class exists and matches its file | a typo that 500s on click |
| every component has its Blade view | "view not found" in production |
| every `can(...)` names a seeded permission | a screen nobody can open — or everybody can |
| every role grant references a real permission | a grant that silently does nothing |
| every icon exists in the OS set | an empty square nobody notices for a month |
| every model's `$table` is migrated | a model pointing at a table that does not exist |

**Icon test found a real bug immediately:** `box` was used for Products and does not exist in
the OS icon set — it would have rendered as a blank square. Now `archive`, and the test parses
the live icon component (or a committed snapshot when the OS clone isn't present).

## T6 — media pipeline (done)

```
app/Domain/Commerce/Media/ImageVariant.php   three sizes: 400 / 800 / 1600 webp
app/Domain/Commerce/Media/MediaPath.php      where files live, and what a request path may be
app/Domain/Commerce/Media/ImageRules.php     extension + sniffed MIME must agree; 8 MB cap
app/Domain/Commerce/Media/ImageStore.php     plans, writes, rolls back on failure
app/Domain/Commerce/Media/Transformer.php    interface (GD, Imagick, or a fake in tests)
app/Domain/Commerce/Media/GdTransformer.php  resample + webp, never upscales
app/Http/Controllers/Media/ProductImageController.php   serves from outside the web root
```

Images live in `storage/app/commerce/products/{sku}/{hash}-{size}.webp` — **never** in
`public_html`, because a deploy replaces tracked files and would delete anything staff uploaded.

The stored filename is the **content hash**, not the uploaded name. That is what makes the URL
immutable (`max-age=31536000, immutable`), makes re-uploading the same bytes free, and means a
file called `../../evil.php` never reaches a path.

## T7 — catalog API (done)

```
app/Domain/Commerce/Api/CatalogQuery.php     filters, clamping, cache key
app/Domain/Commerce/Api/CatalogService.php   paginate / find / categoryTree
app/Domain/Commerce/Api/ProductCard.php      the listing DTO
app/Http/Controllers/Api/Storefront/CatalogController.php
routes/storefront.php     →  /api/storefront/v1/products, /products/{slug}, /categories
app/Providers/CommerceServiceProvider.php    bindings + rate limiter
```

`ProductCard` emits the keys the SPA already uses (`id`, `name`, `price`, `inStock`) **plus**
`price_minor`, real stock, real rating and `url` — so replacing `data/products.ts` with the API
does not mean rewriting any JSX. Money crosses as integer paisa *and* as a formatted string, so
no client ever divides by 100.

`CatalogQuery` is the only thing between an anonymous request and the database: `per_page=500`
becomes 48, an unknown `sort` falls back, option codes are sanitised to `[a-z0-9-]`, prices
arrive in rupees and leave in paisa.
