# Complete project summary — 6 November 2026

Measured against the live checkout and the running instance. Branch `arena/0378ff53-woodex-reimagined`
at `e58313f`; `main` at `2c80945`.

---

## 1. What this repository actually contains

The repo holds **two applications stacked on top of each other**, and that is the single most
important fact about it.

| | `main` (2c80945) | this branch (e58313f) |
|---|---|---|
| What it is | The Lovable-built React storefront | The same storefront **plus** a Laravel 13 application |
| Files tracked | 275 | 2,306 |
| Stack | Vite + React + shadcn/ui + Supabase + Drizzle | + Laravel 13.40, Livewire, Pest |
| Purpose | Marketing site, SPA, `id="root"` | Back office, catalogue, CMS, page builder |

`main` is `vite_react_shadcn_ts` — a Lovable Cloud project with `src/`, `supabase/functions/` and a
`drizzle/` schema. The branch adds **2,031 files** and removes 8, all of them Supabase/Lovable
plumbing (`drizzle/schema.ts`, `src/integrations/supabase/*`, `supabase/functions/_shared/cron-auth.ts`).
Nothing of value was dropped: those 8 belong to the backend the Laravel app replaces.

**`main` commits a live `.env`** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_PROJECT_ID`). The publishable key is safe to expose by design, but committing `.env`
at all teaches the wrong habit — the Laravel side correctly ignores it.

---

## 2. The Laravel application (`platform/`)

| Layer | Size | Notes |
|---|---:|---|
| `app/` | 837 files | 510 of them under `app/Domain` — a domain-oriented, not controller-oriented, layout |
| `resources/views` | 252 files | Blade: storefront, admin, Puck blocks, PDFs, portals |
| `database/migrations` | 94 | 131 tables after migration |
| `tests` | 292 files | Pest; cannot run in this sandbox (`proc_open` disabled) |
| `routes` | 9 files | 225 routes: 156 admin, 24 API, 6 public |

Domains present: Commerce (catalogue, cart, pricing, totals, orders, POS-shaped tables),
Website (pages, Puck builder, theme, shell, media), Sales (quotes, invoices, estimates),
CRM (leads, contacts, companies), Projects, Billing, Chat, Integrations, System.

**Public surface — 6 routes before today, 9 now:**

| Route | Status |
|---|---|
| `/` | Renders the published Puck home page — hero slider, Market We Served, Latest Collection, CTA |
| `/shop` | **new** — 148 pieces, 7 pages, sort + stock filter |
| `/category/{slug}` | **new** — subtree listing |
| `/product/{slug}` | **new** — gallery, price, specs, colours, related, quote CTA |
| `/portal`, `/q/{id}`, `/i/{id}`, `/p/{id}` | Client portals (quote, invoice, project) with PDFs — pre-existing and working |
| `/robots.txt`, `/sitemap.xml` | Generated |

Still missing: `/sale`, `/blog`, `/projects`, `/services`, `/showrooms`, `/e-quotation` as Blade
pages, and cart/checkout by decision (commerce is quote-led).

---

## 3. Live data state

| Entity | Count | Comment |
|---|---:|---|
| Products | **148** | The live site's catalogue, imported from `catalog.json` |
| Categories | **38** | 3 levels: Office Furniture / Home Furniture → 14 departments → leaves |
| Product photos | **148** | Every product has one — 0 broken |
| CMS pages (legacy layer) | 143 | `pages` + 1,449 `page_blocks` |
| Puck pages (builder layer) | 1 | Home, 4 blocks |
| Website images | 105 | From `website-bundle` |
| Redirects | 0 | `website:import-redirects` needs an archived interior site |
| Users | 1 | `owner@woodex.test` |

Two CMS layers exist in parallel: the imported legacy `pages`/`page_blocks` (1,449 blocks) and the
native Puck `site_pages`. Only home is converted. That duplication is real and is the next big
consolidation task.

---

## 4. What today changed

1. **Recovered the branch after a reset.** The local clone checked out a stale ref and `platform/`
   was empty; the remote was intact at `920fcd2`. `git reset --hard` restored it.
2. **Rebuilt the runtime from scratch** — no PHP on this machine, so: php-wasm 3.1.58 (PHP 8.4.25),
   vendor via the GitHub-based composer resolver (166 packages, packagist is blocked), 131
   migrations, owner account, seeders.
3. **Made the catalogue reproducible.** 148 products were extracted from `src/data/products.ts`
   with esbuild into `database/data/catalog.json`, and a real command —
   `commerce:import-storefront --photos` — imports categories, products, translations, pivots and
   photos idempotently. 148 attached, 0 failures.
4. **Restored content data that only existed in `/tmp`**: `database/data/legacy-website.php` and
   `website-bundle/` (106 files, 12 MB). Without it the importer and migrations fail.
5. **Deleted the 88 shadowing static directories** and wrote the storefront views/controller.

---

## 5. Honest state of "complete"

| Area | State |
|---|---|
| Admin / back office | Strong — 156 routes, 30 sections |
| Storefront | Now real for shop/category/product; long tail of pages not yet built |
| Catalogue | Complete and reproducible |
| CMS | Imported, but two parallel page systems |
| Quote flow | Portal exists; public e-quotation builder not built |
| Tests | 292 files, **unrunnable here** — no claim of green |
| Deploy | Still only the Hostinger zip route; no CI |

**Next four tasks, in dependency order:**
1. Convert the 143 legacy pages into Puck pages (or bridge them) so one system owns the site.
2. Build `/e-quotation` (public) → quote → portal, the revenue path.
3. Rebuild the storefront tests around the new routes; find a way to run Pest.
4. Ship to staging and verify on the real host.

---

## 6. Reproduce everything from an empty machine

```sh
# 1. PHP via WASM (no PHP on the sandbox)
npm i @php-wasm/node@3.1.58 @php-wasm/universal@3.1.58

# 2. Dependencies (packagist blocked → GitHub resolver)
node tools/sandbox/resolve.mjs platform/composer.json platform/vendor

# 3. Database
php artisan migrate --force
OWNER_EMAIL=… OWNER_PASSWORD=… php artisan woodex:install
php artisan woodex:import-website --force     # 143 pages, 105 images
php artisan db:seed --class='Database\Seeders\HomePageSeeder'
php artisan commerce:import-storefront --photos   # 148 products + photos
```
