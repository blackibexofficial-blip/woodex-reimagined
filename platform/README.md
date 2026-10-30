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
PASS  Lint::allPhpFiles (35 files)
PASS  CatalogSeedTest::testEveryProductIsValid                    201 assertions
PASS  SchemaTest::testEveryPlannedCatalogTableIsCreated            13 assertions
30/30 checks passed · 13793 assertions · 826 ms
```

## Next (T4)

Admin shell: the Commerce navigation group, permission gates, empty screens — then T5, the
Products screen with inline price and stock editing.
