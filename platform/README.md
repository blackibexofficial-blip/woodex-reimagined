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
PASS  Lint::allPhpFiles (150 files)
PASS  TotalsInvariantTest::testEveryGeneratedCartKeepsTheSumInvariant  13114 assertions
PASS  StockPlannerTest::testAPlanNeverAllocatesMoreThanIsPhysicallyThere  601 assertions
218/218 checks passed · 15397 assertions · 841 ms
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

## T8 — the studio (done)

```
resources/js/studio/registry.json        the contract: 8 blocks, their fields, defaults and ranges
resources/js/studio/registry.ts          typed access + the summary line printed in the editor
resources/js/studio/config.tsx           registry → Puck Config; no block is named here
resources/js/studio/BlockPreview.tsx     what a block looks like *inside* the editor
resources/js/studio/editor.tsx           mount, save draft, publish, 409 handling
app/Livewire/Admin/Website/PageEditor.php  authorise, load, hand over
resources/views/livewire/admin/website/page-editor.blade.php   the shell + data attributes
app/Http/Controllers/Admin/PageDocumentController.php          the only write endpoint
app/Providers/WebsiteServiceProvider.php                       bindings
```

**Livewire does the authorising, React does the editing, the server does the rendering.** The
component loads the page and hands over a document; every keystroke stays in the browser. One
round trip per save, because a builder that syncs continuously is a builder that times out
mid-sentence on a shared host.

**Editor previews are wireframes, on purpose.** The published page is rendered by Blade from the
same props. Mirroring eight Blade views as React components would mean two implementations of
every block, and the copy that drifts is always the one nobody is looking at — so the editor
shows the block's shape and settings, with a link to the real page. One renderer, one truth.

**Two refusals, both about not losing work:**

| Refusal | Why |
|---|---|
| `409` when `puck_version` is stale | two people opened the same page; the second save would erase the first |
| `422` naming every bad block | a save must never quietly delete a block the build no longer knows |

Note the asymmetry with rendering: **reading is lenient, writing is strict.** Reading drops an
unknown block so an old page still renders; writing refuses one, because a save that silently
tidies up is how a page loses a section nobody meant to delete.

## T9 — the registry (done)

```
resources/js/studio/registry.json                       8 blocks in one committed file
app/Domain/Website/Puck/Registry.php                    reads it; proves the shape; normalises props
app/Domain/Website/Puck/PuckDocument.php                decoding: drops unknown blocks, never throws
app/Domain/Website/Puck/BlockRenderer.php               one Blade view per block
app/Domain/Website/Puck/PageWriter.php                  strict validation on the way in
resources/views/puck/blocks/*.blade.php                 8 views (hero, rich-text, cta, product-grid, …)
```

`registry.json` is **committed, not generated**. A build artefact can go stale, and the moment it
does the editor offers fields the server ignores — a page that looks right and cannot be changed.
One file, read by both sides, cannot drift.

Block names are camelCase (`productGrid`) and view names are kebab-case (`product-grid`), because
Puck's config and Laravel's view names have different conventions and neither is worth changing.

**`normalizeProps()` drops unknown keys.** Without that, renaming a field leaves the old key in
every stored page forever, and the renderer keeps reading a value nobody edits any more.

## T10 — serving the page (done)

```
routes/website.php                                    GET /p/{slug} + the two admin routes
app/Http/Controllers/Website/PuckPageController.php   publish gating, preview token, caching
app/Domain/Website/Puck/PageComposer.php              which data a page needs, fetched once
app/Domain/Website/Puck/BlockData.php                 the seam: catalog today, showrooms later
app/Domain/Website/Puck/CatalogBlockData.php          the live implementation, cached 5 min
resources/views/puck/page.blade.php                   the shell: SEO meta, one <h1>, the blocks
database/migrations/2026_10_28_103000_add_puck_columns_to_pages.php
```

**A bound block stores a query, never a copy.** The product grid on a marketing page is a
category and a limit; the price it shows is the price in the catalog today. That is the whole
reason to have a builder plugged into the OS rather than a static HTML page.

**Each resolver is called at most once per page.** Three identical product grids share one query —
`tests/Website/PageComposerTest.php` proves it with a fake.

**Caching is in two layers, and both names say why:**

| Layer | Key | TTL |
|---|---|---|
| rendered HTML | page id + `updated_at` + block signature | 60 s |
| block data | resolver + normalised props | 300 s |

An edit is live immediately (the key changes). A price change appears within five minutes. A
draft is never cached (`private, no-store`), and a draft is only reachable through the page's own
40-character `preview_token` — a leaked link exposes one page, not the admin.

### Wiring in the OS

Seven lines, and nothing else changes:

```php
// bootstrap/providers.php
App\Providers\WebsiteServiceProvider::class,

// routes/web.php
Route::middleware('web')->group(base_path('routes/website.php'));

// app/Domain/Website/Models/Page.php — casts()
'puck_data' => 'array',
'seo'       => 'array',

// App\Support\AdminNavigation, next to the other website items
// → a "Pages" item pointing at admin.website.pages.edit

// vite.config: add resources/js/studio/editor.tsx to the inputs, then
//   npm i @puckeditor/core
```

**One column is deliberately missing from the migration.** `PUCK-BUILDER.md` §3 lists `draft_of`;
it is not added, because `pages.slug` is unique — a draft row could not share the published
page's slug — and `page_versions` already stores every published snapshot. Editing in place with
`status` + `published_at` covers the same ground without a second row duplicating the site's URLs.

### `tests/Website/`

| Suite | What it proves |
|---|---|
| `PuckRegistryTest` | every declared block has a Blade view (the parity test), defaults fill, numbers clamp, unknown select values fall back, stale keys are dropped |
| `PuckDocumentTest` | malformed JSON renders nothing rather than throwing; unknown blocks are skipped; order and ids survive; props are normalised at decode |
| `PageWriterTest` | saving refuses what rendering tolerates: unknown block, duplicate id, garbage input — all reported at once |
| `PageComposerTest` | only bound blocks fetch, each variable lands under the name its view expects, identical queries are fetched once |
| `PuckWiringTest` | routes exist, the controller gates on publish, the Blade shell writes every data attribute the studio reads, the migration adds the documented columns, and the studio really does import the same registry file |

## T11 — the vertical slice (done)

```
database/migrations/2026_10_28_104000_create_commerce_checkout_tables.php   14 tables
app/Domain/Commerce/Checkout/PricedCart.php        stored rows → CartInput (pure)
app/Domain/Commerce/Checkout/StockPlanner.php      which warehouse ships what (pure)
app/Domain/Commerce/Checkout/OrderNumber.php       WDX-000127 / INV-000127 (pure)
app/Domain/Commerce/Checkout/OrderStatus.php       the order graph + COD payment rules (pure)
app/Domain/Commerce/Checkout/OrderDraft.php        order + invoice + payment, reconciled (pure)
app/Domain/Commerce/Checkout/CartService.php       open, add, change, price, write back
app/Domain/Commerce/Checkout/CheckoutService.php   one transaction, one order
app/Domain/Commerce/Checkout/SequenceAllocator.php numbers under a row lock
app/Domain/Commerce/Checkout/Models/*.php          12 models
app/Livewire/Admin/Commerce/{OrdersIndex,OrderShow}.php + views
app/Console/Commands/DemoOrderCommand.php          php artisan commerce:demo-order
```

**The order of operations inside `place()` is the design**, not an accident:

```
lock the inventory rows → plan → refuse if short → price → take numbers → write everything
```

Refusing *before* pricing and before writing is what stops a phantom order: a customer is
never shown a total for something that was already sold. `CheckoutWiringTest` pins that
ordering by comparing positions in the source file, because a moved `Order::create()` compiles
and reads fine.

**A cart is mutable; an order is a record.** Every amount on an order line is copied when the
order is placed. Rename or reprice a product tomorrow and the invoice still says what was agreed.

**Money and statuses are three axes, not one.** `status`, `payment_status` and
`fulfilment_status` are separate because a COD order is delivered *and then* paid, while a bank
transfer is paid *and then* delivered. Delivering a COD order is what sets `paid_minor` — the
model does it, so no screen can forget.

**Stock is locked, planned, then consumed.** `commerce_inventory_reservations` records which
cart or order held which units at which source, and releasing is a timestamp, never a delete.
`StockPlanner` is pure, so the decision that prevents overselling is tested without a database
(200 randomised rounds assert the plan never allocates more than exists).

**One command proves it end to end:**

```bash
php artisan db:seed
php artisan commerce:demo-order --qty=2
# Order WDX-000001 placed — placed, payment pending
# Invoice: INV-000001 · Payment: cod · ₨... due on delivery
```

### Admin

`Commerce → Orders` is now a real screen: filter by order status and by payment status
independently (the useful question is "delivered but still marked unpaid"), search by the number
a customer reads out on the phone, and open an order to see the lines, the money breakdown, the
address and the timeline. The only actions are the ones the graph allows — advance one step, or
cancel with a reason that is written into the history. There is no status dropdown.

### `tests/Checkout/`

| Suite | What it proves |
|---|---|
| `CartPricingTest` | rows become priced lines; strings from MySQL stay integers; zero quantity is refused, not priced; free-shipping and inclusive-tax behave |
| `StockPlannerTest` | priority order, splitting across sources, reserved stock, exact fits, and 200 randomised rounds that never over-allocate |
| `OrderNumberTest` | padding, overflow without truncation, refused prefixes |
| `OrderStatusTest` | the graph, terminals, cancelling before shipping, COD settling on delivery |
| `VerticalSliceTest` | **the acceptance test** — 1 sofa + 2 chairs, 10% coupon, 18% GST, ₨2,500 delivery → ₨208,528; order, invoice, payment and line items all agree to the paisa |
| `CheckoutWiringTest` | every model's table is migrated, stock is refused before an order is written, money is never a float |

## T12 — the load probe (built; the gate runs on staging)

```
app/Domain/Commerce/Probe/LoadSample.php     one request as measured
app/Domain/Commerce/Probe/LoadReport.php     p50/p95/p99 by nearest rank, errors by whose fault
app/Domain/Commerce/Probe/ProbeTarget.php    the pass mark, in one place, with reasons
app/Domain/Commerce/Probe/OversellAudit.php  did we sell the same chair twice
app/Console/Commands/LoadProbeCommand.php    commerce:load-probe
app/Http/Controllers/Api/Storefront/CheckoutRaceController.php   the endpoint the race fires at
config/commerce.php                          probe token + thresholds, off by default
```

```bash
# 30 concurrent catalog reads × 10 waves, from outside the app, over HTTPS
php artisan commerce:load-probe --base=https://staging.example.com \
    --token="$COMMERCE_PROBE_TOKEN" --catalog=30 --waves=10

# 5 simultaneous checkouts for a variant with exactly one unit
php artisan commerce:load-probe --base=https://staging.example.com \
    --token="$COMMERCE_PROBE_TOKEN" --checkouts=5 --sku=WX-1019 --confirm-oversell-test
```

**Measured from outside, deliberately.** Calling the controller in-process measures the code and
not the hosting, and the hosting is what the gate is about. curl_multi rather than a Guzzle pool:
thirty simultaneous requests on a shared account is exactly where one buffer per request matters.

**The verdict is computed, not read off a table.** `ProbeTarget` fails the run on a p95 over
budget, on any 5xx, on an error rate over 1%, and on any oversell — and prints every reason.
Exit code 0 means the gate passed. `1500 ms` passes (the budget is "≤ 1.5 s"); `1500.1` does not.

**Oversell is audited from the database.** Order lines claimed after the run plus units still held
by a live reservation must not exceed what was on the shelf. The probe's own count of its 2xx
responses is not evidence — it is the thing being tested.

**A probe that cannot reach the host must not pass.** A 4xx is reported but not failed on: the
checkout race expects four refusals out of five, and counting those as errors would report a
correct race as a broken site. Timeouts and 5xx always fail.

**Safe by default.** The race endpoint answers 404 unless a `COMMERCE_PROBE_TOKEN` is configured;
the rate-limit bypass exists only when that token exists; and the command refuses to place real
orders without `--confirm-oversell-test`. Unset in production means none of it is reachable.

### `tests/Probe/`

| Suite | What it proves |
|---|---|
| `LoadReportTest` | nearest-rank percentiles against hand-checkable cases; 20 samples put p95 on the 19th; one outlier in twenty is the p100, not the p95 — which is why the probe runs 300 requests |
| `ProbeTargetTest` | the boundaries: exactly on budget passes, a tenth of a millisecond over fails; one 5xx fails; a 404 does not; an oversell fails whatever the latency |
| `OversellAuditTest` | two orders for one unit, claiming from nothing, negative stock reported as corruption rather than as a race |
| `ProbeWiringTest` | curl_multi and not curl_exec; the endpoint hides as 404 without a token; the limiter trusts nothing unconfigured; the command refuses to place orders uninvited |

### Honest scope

This sandbox has no PHP binary, no database and no HTTP server, so the probe itself cannot be
executed here — only its engine, which is what the suite covers. Running it is a staging task:
`HOSTINGER-CAPACITY.md` §Gate G1 has the commands and what to record. Until those numbers exist,
T12 is *built*, not *passed*.

## T13 — the storefront reads the API (this branch)

The gap this closes was the last one standing in the plan: the React app shipped 148 products
as a TypeScript literal and made zero `fetch()` calls, so every product on the site was
fiction the moment the catalogue moved into the database.

### The seam

One function knows both languages:

```
commerce_product_translations ─┐
commerce_products ─────────────┼─→ CatalogService ─→ ProductDetail ─→ JSON ─→ toProduct() ─→ <ProductCard>
commerce_product_media ────────┘        (paisa, snake_case)                  (rupees, camelCase)
```

`src/lib/api/catalog.ts:toProduct()` is the only place `price_minor` becomes rupees, `hex: null`
becomes a visible swatch, and an empty `images` array becomes a category photo. Twenty
components kept rendering `product.images[0]` and `formatPKR(product.price)` untouched.

### What the pages do now

| Page | Reads | Falls back to |
|---|---|---|
| `/shop` | `GET /products` (all pages, 48 at a time), filtered in the browser | bundled snapshot |
| `/shop/:slug` | `GET /products/{slug}` + `GET /products?category=…&per_page=5` | snapshot, on network failure only |
| `/series`, `/series/:id` | `GET /products` | bundled snapshot |
| `/quotation` | `GET /products` (the quote builder searches the live catalogue) | bundled snapshot |

### Why there is still a bundled catalogue

Three reasons, and none of them is laziness:

1. **The snapshot is the first paint.** `useCatalogProducts()` returns the bundled list
   synchronously and swaps in the API answer when it arrives, so the shop never shows a
   skeleton where a product grid belongs. On Hostinger that is a cached 40 ms response; on a
   phone on 3G it is the difference between a shop and a spinner.
2. **The app has to work with no backend.** Build previews, design reviews and a staging box
   with PHP down all render a complete site.
3. **It is now a fallback, not a source of truth.** It is named `snapshotProducts`, it is used
   only when a request fails, and the shop labels the state ("… 148 products · catalogue
   snapshot").

A *successful* empty answer is respected: if the catalogue says it has no products, the shop
shows an empty state rather than 148 products that cannot be ordered.

### Decisions worth arguing about

- **Filter in the browser, not the server.** The sidebar shows a live count for thirteen
  categories and search is per-keystroke. Server-side filtering would make each of those a
  request. At 148 products that is four cached requests of 48; at 1,000 it should move to
  server-side pagination, and `MAX_PAGES` in `catalog.ts` is where that decision gets forced.
- **The sidebar is trimmed to what exists.** A category with no stock is a dead end — the
  visitor clicks and gets "no products found". The editorial order and wording survive; empty
  nodes do not. A category the API has but the sidebar has never heard of gets its own group
  rather than being hidden behind "All".
- **404 is not a fallback.** `useProduct()` degrades to the snapshot when the API is
  *unreachable* (status 0 or 5xx) and shows "no longer in the catalogue" when the API answers
  404. Switching those two would let a withdrawn product be quoted and ordered.
- **One retry, three-second deadline.** A PHP worker at capacity does not answer slowly, it
  hangs; three retries turn a two-second stall into six. The snapshot is a better answer.

### Wiring in the OS

`git apply` the platform tree over the OS checkout as before. Two model changes are still
needed in the OS's `app/Models/Page.php`, because the columns are new:

```php
protected $casts = [
    // …
    'puck_data' => 'array',
    'seo' => 'array',
];
```

`PuckDocument::fromStored()` accepts a JSON string or an array, so a cast that has not been
added yet will not break the page — it is only faster.

No new environment variables are required. `VITE_API_BASE_URL` defaults to
`/api/storefront/v1`, which is correct on Hostinger where the SPA and the API share a domain.
`.env.example` documents both it and `VITE_CATALOG_OFFLINE=1`.

### `tests/Api/`

| Suite | What it proves |
|---|---|
| `CatalogQueryTest` | page size is clamped, unknown sorts fall back, cache keys normalise |
| `ProductDetailTest` | the product-page payload: minor units stay integers, empty specification rows and nameless swatches are dropped, a non-hex colour becomes a visible swatch, an empty row still renders |
| `StorefrontWiringTest` | the three routes are public and throttled; the list answers `data`+`meta` and 304s; the detail route reuses the list query; the product cache key was bumped with the payload |

**Result: `204/204 checks · 15,330 assertions`** (`php platform/tests/run.php`), TypeScript
clean, `npm run build` clean.

## T14 — checkout through the API (this branch)

The storefront's "Place Order" button used to set a boolean and clear the cart. Nothing was
written anywhere. Now it places a real COD order — stock locked, invoice issued, order number
the customer can read back to support.

### Two endpoints, one calculator

| Route | Writes | Limit | Answers |
|---|---|---|---|
| `POST /api/storefront/v1/checkout/quote` | nothing | `throttle:storefront-catalog` | server-priced basket |
| `POST /api/storefront/v1/checkout` | order + invoice + payment + reservation | `throttle:10,1` | 201 with the order number |

The quote exists because the checkout page shows a total before the customer commits. If the
browser computed that total, the summary and the invoice would be two opinions about the same
money. Instead the SPA sends its lines and the server answers with `CartCalculator`'s numbers —
the same object that later prices the order, so they cannot drift.

A quote opens no cart, takes no sequence number and creates no reservation. It runs on every
quantity change; it must leave no trace.

### The basket lives in the browser

Deliberate. A server-side cart is a row read and written on every quantity click, on a host
with thirty PHP workers. The SPA keeps the lines in `localStorage` and re-sends them with each
request; the server re-prices from the catalogue every time, so what the browser thinks a desk
costs is never what it pays. The trade-off is honest: no basket follows a customer between
devices until they have an account.

### Refusals

- **422** — unknown slug, a product with no active variant, a product with no price, a
  quantity of zero, more than 20 lines, more than 10 of one thing. Field-level, so the basket
  can mark the offending line.
- **409** — `insufficient_stock`, with the shortfall. Four of five racing checkouts get this
  and it is the correct answer, not an error.
- **429** — more than ten placement attempts a minute.

### `tests/Api/`

| Suite | What it proves |
|---|---|
| `CartQuoteTest` | lines plus shipping equal the grand total; display data is joined by SKU and not by position; an empty basket quotes zero; paisa stays integer to the payload; a tampered total is refused; delivery is free above the threshold and charged below it |
| `StorefrontCheckoutTest` | the quote writes nothing; the order goes through `CheckoutService` and not a reimplementation; 409 on stock; unknown slugs are refused before a row is written; the receipt carries the number and the amount due |

**Result: `218/218 checks · 15,397 assertions`.** TypeScript and `npm run build` clean. The
client was exercised against a stand-in API for all four answer classes — 200, 201, 409, 422 —
and against an unreachable host, which surfaces as an explicit "nothing has been charged"
message rather than a fake confirmation.

### One honest gap

The preview and any deploy without a database still cannot place an order, because there is no
PHP behind them. The page says so, keeps the basket, and offers the phone number. A checkout
that claims success into a local variable is worse than one that admits it could not reach the
order system.

## T15 — the inventory screen (this branch)

Inventory was a placeholder that described what it would do. It now reads
`commerce_inventory_items` and `commerce_inventory_reservations`.

### Two questions, in order

1. **"Can we still sell this?"** — availability, which is `qty - reserved`, never `qty`. The
   warehouse count is not the sellable count, and every filter, badge and dashboard tile on
   the screen is computed from the subtraction.
2. **"Who is holding it, and until when?"** — the ten oldest live holds, with their deadline
   and whether they are a cart or an order. That is the answer to "the website said two left".

The screen also shows the expired-hold backlog and releases it on an explicit click. Releasing
is an `UPDATE` that stamps `released_at` and a reason — never a delete, because "we held it and
let it go" is the audit trail support needs.

### `StockLevel`

`App\Domain\Commerce\Inventory\StockLevel` is a three-integer value object that decides
in-stock / low / out. It exists so the admin badge, the dashboard tile and the storefront cannot
disagree about where "low" starts, and because it is testable without a database:

- the threshold is **inclusive** (`available <= threshold` is low, `available == 0` is out)
- availability is clamped at zero, so a missed release shows as an empty shelf and an
  `oversold` flag, not a negative number nobody can act on
- a negative count or hold is corruption and is named as such

### Why stock adjustment is still missing

Deliberately. An adjustment needs a reason and a movement row, or the count drifts with no
explanation. That lands with the movement ledger; this screen ships the part that is safe today.

### Result

**`231/231 checks · 15,460 assertions`** — `tests/Inventory/` adds 13 checks: the boundary
cases of the stock rule, and the wiring that keeps availability out of `qty`.

## The admin preview

`node platform/tools/make-admin-preview.mjs` renders
`docs/07-woodex-os/preview/admin.html` — one self-contained file showing Dashboard, Products,
Orders and Inventory with the seeded catalogue, the platform's own tax and delivery rules, and
the same words the Livewire screens use.

It exists because the real admin needs PHP, Composer and MySQL, and none of those exist in a
build sandbox or a design review. It is a preview and the page says so at the top; the live
admin is still Livewire behind the OS login. Click the ten greyed-out screens and you get the
same "coming in a later slice" card the real admin shows.

## T16 — the category tree, and the bug it found (this branch)

Categories was the third placeholder to become a screen. Building it surfaced a defect that
had been shipping since T13.

### The screen

`CategoriesIndex` reads every category, orders it through `CategoryTree`, and offers three
writes:

| Action | What changes | What does not |
|---|---|---|
| Rename | the `commerce_category_translations` row for the current locale | **the slug** — it is in every product link, sitemap entry and bookmark |
| Show / hide | `is_active` (serves) or `show_in_menu` (listed) — two independent switches | the products inside it |
| Move | every sibling's `position`, rewritten `0..n` | anything else |

Deleting is not offered. A category is the only way some products can be found, and removal
needs a reassignment step, which is its own flow.

### The defect

The seed gives products a `subcategory` (`executive-tables`), but `CatalogSeeder` attached
every product to its **root** and silently dropped the subcategory. Consequences on the API
path, all of them invisible:

- `GET /products?category=executive-tables` returned **nothing** — five desks were unreachable
  by the filter the sidebar links to.
- The sidebar's child entries showed 0 products.
- `GET /categories` reported 0 for every child, and the root looked like it held everything.

### The fix

A product is now filed where it **lives** — the leaf — and the parents derive from it:

- **Seeder** resolves `subcategory` to a real category and files the product there. Children
  are registered in the seeder's id map and may nest (home furniture is three levels deep).
- **`CatalogService::slugsInSubtree()`** expands a category to itself plus every descendant,
  cached five minutes, so `?category=office-tables` still returns its children's products.
  Without this the fix would have made every parent empty instead.
- **Tree counts roll up**, so a parent shows its subtree even though it holds nothing directly.
- **`ProductCard` gains `category_path`** (root → leaf). The storefront adapter sets
  `category` to the root and `subcategory` to the leaf, so one product answers to both
  `/shop?category=office-tables` and `/shop?category=executive-tables`.

### Two data problems the new test caught

`testEverySubcategoryIsAChildOfItsCategory` failed immediately, and both failures were real:

1. `bed-sets`, `dressing-tables` and `home-sofa` were named by products but did not exist as
   categories — the seed declared only `bedroom`, `living`, `dining` under `home`.
2. Eight products declared `subcategory` **equal to** their `category` (every chair and
   workstation). After the seeder started filing at the leaf, those would have been filed into
   their own parent.

Both are fixed in `catalog.json`, and the seeder now treats a self-referential subcategory as
"no subcategory" because spreadsheets will keep producing them.

### Result

**`259/259 checks · 15,583 assertions`** — `CategoryTreeTest` (13) covers ordering ties,
orphans, cycles, roll-up and move boundaries; `CategoriesScreenTest` (8) pins the permission
checks, the untouched slug and the position rewrite.

The admin preview gained a **Categories** screen with the same tree and the same counts,
three levels deep.

## T17 — invoices (this branch)

The invoice screen answers one question — **who owes us money** — and it answers it from the
money, not from the status column.

### Why the status is derived

`commerce_invoices.status` is written once at issue and then never touched. A customer who paid
in full three weeks ago still reads `issued` until somebody remembers to change the row. The
amount, what has been paid and what has been refunded are the only values that cannot disagree
with themselves, so `InvoiceBalance` derives the state from them:

| Money | State |
|---|---|
| void flag set | **Void** — not a claim, whatever the balance says |
| nothing received | **Issued** |
| something received | **Part paid** |
| everything received | **Paid** |

A refund is money going *out*, so `netPaid = paid − refunded`. Refunding ₨5,000 of a settled
₨50,000 invoice puts ₨5,000 back on the balance — which is correct, and which a naive
`paid_minor` read gets wrong. Both sides are clamped at zero: a refund larger than the payment
leaves the invoice owed in full, not negative.

**Overdue is a separate axis**, not a fourth state. A void invoice cannot be late, a paid one
no longer has a deadline that means anything, and an unpaid one is late only once `due_at` has
passed. It carries aging buckets (0–30, 31–60, 61–90, 90+) because "how much is stale" is a
question an accountant asks in ranges.

### The screen and the paper

`GET /admin/commerce/invoices` lists with filters that run against the same columns the
derivation reads — outstanding, overdue, paid, void — plus a search across invoice number,
order number, customer name and phone.

`GET /admin/commerce/invoices/{invoice}/print` is a **separate document**: no sidebar, no
breadcrumbs, `@media print` and `@page` rules, and exactly one button that is hidden when
printing. It builds its balance through the same `InvoiceBalance`, so the paper and the screen
cannot tell a customer two different stories. Both routes check `commerce.orders.view`; the
document is not public, because it carries a customer's name, phone and address.

Line amounts come from the invoice's own items when it has them, and from the order only when
it does not — never recalculated from today's prices.

### Not offered, deliberately

Editing, voiding and correcting an invoice from this screen. A document that has been sent to a
customer is changed by a named action that records a reason, not by a list row.

### Result

**`279/279 checks · 15,691 assertions`** — `InvoiceBalanceTest` (14) covers refunds, voids,
zero-value invoices, overdue boundaries and the COD stamping rule; `InvoicesScreenTest` (7)
pins the derivation, the print document and both permission checks.

## T18 — attributes, and the six products the filter could not see

The attributes screen exists to answer a question the attribute table cannot: **does this
vocabulary still describe this catalog?**

An option is configuration. It stays valid forever, whether or not anything uses it. But the
storefront draws every filterable option as a checkbox and every variant-axis option as a
swatch, so an option nothing carries becomes a checkbox that returns an empty page, or a
finish a customer can select with nothing to buy. Neither throws an error. Both look like a
broken shop.

`AttributeVocabulary` counts two things per option — live products carrying it, and live
variants pointing at it — and sorts each option into one of four states:

| Products | Variants | On a variant axis | Filterable | State |
|---|---|---|---|---|
| any | 0 | yes | — | **Orphaned** — offered as a finish, not buyable |
| 0 | 0 | no | yes | **Empty filter** — drawn, returns nothing |
| 0 | 0 | no | no | **Unused** — untidy, not a defect |
| >0 | — | — | — | **In use** |

Orphans outrank empty filters when an option could be both, because an orphan costs a sale and
an empty filter costs a click.

Both counts are restricted to what a customer can reach: `published` products only, and
variants that are neither soft-deleted nor inactive. Counting drafts would make a dead option
look busy because of work in progress.

### The bug it found

`CatalogSeeder` files a product under a material by slugging its material string and looking
it up in the attribute's options. Six of the twenty seeded products had a material with no
matching option — `MDF Melamine` (seven products), `Solid Hardwood`, `Mesh + Split-Pad`,
`Mesh Back + Premium MoltyFoam`, `Natural Walnut Veneer + Glass`, `Dark Oak Veneer`. Those
products were in the catalog, searchable, priced, and **invisible to the material filter**,
because no attribute value was ever written for them.

The fix is in the seed: the material attribute now has all fourteen options the catalog
actually uses. Two tests in `CatalogSeedTest` pin both directions — every material string has
an option, and every option is carried by something — so the next product added with a new
material fails the suite instead of quietly disappearing from the filter.

### Not offered

Editing options here. Every change on this table reaches the storefront's filter rail on the
next page load, so it belongs with product management behind `commerce.products.manage`, not
on a screen whose job is to report.

## T19 — customers, without a customers table

There is no `commerce_customers` table, and adding one would be the wrong fix. A
cash-on-delivery shop has no accounts: the rider's phone number is the only durable identity,
and every order already stores it. A customers table would be filled from those same rows, kept
in step with them by hand, and would still be wrong the first time somebody typed their number
differently.

So customers are derived. `PhoneNumber::normalise()` folds a number to one shape — local,
digits only, leading zero — which is why `0300-1234567`, `+92 300 1234567` and
`0092-300-1234567` are one customer rather than three. The length guard is `>= 11`, not `> 11`:
a Karachi landline written as `+92 51 …` leaves eleven digits, the same length as a local
mobile, and a `> 11` test folds nothing — which is how a business ends up counted twice.

`CustomerLedger` groups orders by that key and derives what the orders table cannot show:

- **Repeat.** More than one order. One order is a trial; the second is the only proof that the
  furniture, the price and the delivery were acceptable. The repeat rate counts people, not
  orders.
- **Name conflict.** The same number under two names. Not corrected automatically — it is
  usually a typo at checkout, and occasionally a household or a shop sharing a line, which is
  worth knowing before a rider is sent.
- **Outstanding.** Ordered minus paid, per person, using the same arithmetic as the invoices
  screen. Cash on delivery is not money until the van arrives.

Cancelled orders are excluded — they are not purchases — and orders with no phone number are
**counted, not dropped**. The screen says how many there are, so the customer total always
reconciles with the order total instead of silently losing a few percent of the business.

## Spec drift fixed

`openapi.yaml` still described the checkout from before T14: a `cart_id`-based `POST
/checkout` returning an `Order`. The code takes the basket's lines directly and returns a
placed-order receipt. Both are now documented as built, including `POST /checkout/quote`
(the re-pricing read that writes nothing) and the `409 insufficient_stock` response with its
`shortfalls`. The older quotation endpoints kept their names — `BasketQuote` and
`BasketRequest` were used for the basket instead, because "quote" already means something
specific to the sales team.

### Result

**`329/329 checks · 15,891 assertions`** — `AttributeVocabularyTest` (17), `CustomerLedgerTest`
(18), `AttributesScreenTest` (8), `CustomersScreenTest` (9), plus two seed tests that now fail
if a product's material is not in the vocabulary.

## T20 — payments, and the two numbers that are allowed to disagree

Money arrives in two places. `commerce_payments` records attempts — gateway, reference,
amount, status — and `commerce_orders.paid_minor` is the single number every other screen
reads. They are written by different code: the bank check writes the first, the delivery step
writes the second, and nothing in the schema forces them to agree.

That is not a design flaw, it is a fact of the workflow — and it means a screen is needed. This
one compares them, per order, and reports three things the tables cannot:

| Finding | What it means | Why it matters |
|---|---|---|
| **Awaiting a check** | A bank transfer is `pending` | Money may already be in the account. Someone has to look, and until they do the customer is waiting |
| **Drift** | Paid payments ≠ `paid_minor` | The invoice screen keeps chasing somebody who has already paid, or vice versa |
| **Repeated reference** | One reference on two rows | A double payment, a double click, or one transfer entered against two orders |

A payment larger than its order is caught too, because overpayment means either a refund the
shop does not know it owes or a total that is wrong.

### Three things it deliberately does not do

**Cash on delivery is not "awaiting verification."** Nobody banks a rider's cash into an
account before it is collected; a pending COD row is expected, not a task. It is counted
separately as "to collect at the door".

**Handwritten cash references are not compared.** A rider's receipt number is reused freely,
so two COD rows sharing `55` is not a duplicate — only electronic references are compared, and
blank ones are not duplicates of each other.

**Failures are not discrepancies.** A declined card is a fact about an attempt, not an open
question about the bookkeeping, so the failed row stays visible and contributes nothing to the
arithmetic.

The verdict for every row is computed in one pass (`states()`) rather than per row: the screen
shows two hundred payments, and asking "is this a duplicate?" by rescanning the whole set each
time is the kind of thing that makes a page feel slow for no visible reason.

### Result

**`350/350 checks · 15,976 assertions`** — `PaymentLedgerTest` (15) and `PaymentsScreenTest`
(7) pin the comparison, the COD exemptions and the absence of any write.
