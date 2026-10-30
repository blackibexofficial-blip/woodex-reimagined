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
191/191 checks passed · 15241 assertions · 884 ms
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
