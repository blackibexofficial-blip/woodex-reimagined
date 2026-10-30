# Week 1 — Kickoff

One app, so week 1 is not a hosting experiment — it is **foundations plus the first real vertical thread**.
The week ends with a deployable OS, a commerce schema in place, a money pipeline with failing-then-passing golden
tests, and a Puck page rendering from JSON.

Owner: **Dev A** (commerce core). Dev B: admin + API skeleton. Dev C: Puck Studio.

---

## Day 1 — Host facts, then the truth about the account

| # | Task | Done when |
|---|---|---|
| 1.1 | hPanel → PHP Configuration → **8.4** (main domain + staging subdomain) | `phpversion()` reports 8.4 |
| 1.2 | Read the real limits and **replace every estimate** in `HOSTINGER-CAPACITY.md` §1 | numbers written down |
| 1.3 | Create the staging subdomain with its own document root | resolves, SSL active |
| 1.4 | Create **two** databases: `woodex_prod`, `woodex_staging` (never share) | both reachable |
| 1.5 | SSH check `ssh -p 65002 uXXXX@<host>`; note Composer version | yes/no recorded |
| 1.6 | Confirm node is absent on the server (expected) | confirmed — builds happen locally/CI |

```
plan tier:            __________
PHP:                  __________
memory_limit:         __________
max_execution_time:   __________
entry processes:      __________
inodes quota/used:    __________
DB size quota:        __________
SSH:                  yes / no
composer:             __________
node on server:       yes / no   (expected: no)
```

---

## Day 2 — The money pipeline first (Dev A)

Nothing else in commerce is safe until this exists. Write the tests **before** the implementation.

```bash
php artisan make:test Commerce/CartCalculatorTest --unit
php artisan make:test Commerce/TotalsInvariantTest --unit
```

Fourteen golden fixtures (`database/fixtures/commerce/totals/*.json`), each an input cart plus an expected totals
breakdown to the paisa:

```
01_simple           02_qty_gt_one       03_group_price      04_catalog_rule
05_cart_rule        06_coupon_capped    07_free_over        08_tax_inclusive
09_tax_exclusive    10_mixed_tax        11_taxed_shipping   12_partial_refund
13_currency_switch  14_zero_price_line
```

Plus the invariant property test: 1,000 randomly generated carts must satisfy
`Σ line_total + shipping + tax = grand_total` with no float in the call path.

**Done when:** the fixtures exist, the first one runs red, and `Money` (integer paisa + currency) is merged.

---

## Day 3 — Schema foundation (Dev A + B)

```bash
php artisan make:migration create_commerce_catalog_tables --path=database/migrations/commerce
php artisan make:migration create_commerce_inventory_tax_tables
```

Catalog subset for this week only: `commerce_products`, `commerce_product_translations`, `commerce_categories`,
`commerce_category_translations`, `commerce_product_media`, `commerce_attributes`, `commerce_attribute_options`,
`commerce_product_attribute_values`, `commerce_product_variants`, `commerce_inventory_sources`,
`commerce_inventory_items`.

Rules that apply from the first migration:
- `commerce_` prefix on every table.
- Money columns `BIGINT` named `*_minor`.
- Every FK indexed; every slug unique per locale.
- Factories for every model, from day one.

**Done when:** `migrate:fresh --seed` produces 20 demo products across 4 categories on the staging DB.

---

## Day 4 — Puck Studio spike + first API (Dev C + B)

| Track | Task | Done when |
|---|---|---|
| C | `@puckeditor/core@0.24` mounted at `/admin/studio` behind the OS session | editor opens, drag-drop works |
| C | `registry.json` v1 with **8 blocks** (hero, rich_text, product_grid, category_tiles, faq, cta, materials_showcase, showroom_map) | editor renders all 8 |
| C | `Puck\Registry` + `resources/views/puck/blocks/*.blade.php` — 3 blocks implemented | JSON → HTML on a real page |
| C | `PuckRegistryParityTest` (TS build emits JSON, PHP asserts parity) | test exists, runs in CI |
| B | `GET /api/storefront/v1/products` + `/products/{slug}` from `CatalogService` | returns seeded data, cached 5 min |
| B | `AdminNavigation` gains the **Commerce** group (empty screens stubbed) | visible in the admin sidebar |

---

## Day 5 — Gate G0: foundations

| Gate | Pass |
|---|---|
| OS deployed by Git to staging, cron running, queue draining | yes |
| `migrate:fresh --seed` on staging | 20 products, 4 categories |
| Golden totals harness | 1 red test minimum compiles and runs in CI |
| Puck: one page saved in Studio, rendered at `/p/hello`, `pages`/`page_blocks` written | yes |
| API: product list + detail from the OS | 200, cached |
| Admin navigation shows Commerce group | yes |
| **Go/no-go note committed** | yes |

**All green → P1 starts Monday with catalog breadth.**
A miss on the money harness is the only one that stops the week's exit — everything else can slip a day.

---

## Parallel work that does not block G0

| Owner | Task | Output |
|---|---|---|
| B | Freeze `openapi.yaml` (48 paths), generate the TypeScript client | typed client in the SPA |
| B | Media pipeline: upload → 3 sizes + WebP → `public/media`, outside the repo | one image end-to-end |
| C | Inventory the 142 legacy pages into M0–M7 migration groups | migration backlog |
| All | Agree the 14 admin screens' wireframe in one sitting | shared screen map |

---

## Week-1 definition of done

- Real hosting numbers replace every estimate.
- `Money` + `CartCalculator` + 14 fixtures exist and run in CI.
- 11 commerce tables migrated, seeded, factory-covered.
- Puck Studio opens, saves JSON, renders Blade, parity test in place.
- One read-only API endpoint serving real seeded data to the SPA.
- Deploy to staging is a one-click repeatable action.
