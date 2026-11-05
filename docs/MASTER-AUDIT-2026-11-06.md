# Master audit — 6 November 2026

Measured against a running instance (Laravel 13.40, SQLite, 225 routes), not against documentation.
Every figure below came from a command whose output is quoted.

---

## 1. Verdict

The code is in better shape than its history suggests. The **engineering is good** — no `eval`, no
`shell_exec`, no superglobal reads, no hardcoded credentials, no interpolated SQL, `md5` used only for
cache keys, `.env` untracked. The **project state is bad**, for reasons that have nothing to do with code
quality: the repository did not contain the application, the public site was never rebuilt, and the
migration is ~40% done.

| Dimension | State |
|---|---|
| Code quality | **Good.** Typed value objects, prepared statements throughout, documented decisions |
| Repository integrity | **Was broken — fixed today** (F1) |
| Admin / back office | **Strong.** 156 routes, 30 sections, most IB Panel modules matched or exceeded |
| Public storefront | **Missing.** 6 public routes vs ~30 navigable URLs |
| Data migration | **Partial.** 157/171 products, 0/87 FAQs, 0/5 orders |
| Deployment | **Unfinished.** First install still pending |

---

## 2. Findings, worst first

### F1 — The application was never in the repository  · CRITICAL · **fixed today**
`git ls-files platform` held 325 files; the working application has 2,410. Absent from every commit:
`app/Models`, `app/Actions`, `app/Support`, `app/Integrations`, `app/Listeners`, `app/Notifications`,
`routes/web.php`, and the entire Pest suite. Nothing was `.gitignore`d — the files were simply never
added. The only complete copy existed inside `downloads/woodex-staging-master.zip`.

Consequence: no change could be reviewed, tested or deployed from this repository, which is why earlier
work kept "disappearing".

**Fixed** in `afbfa89`: +1,476 files, +162,524 lines, source only (no `vendor/`, no built assets, no
media, no SQLite).

### F2 — 95 static directories shadow every route  · CRITICAL · open
`public/` contains 95 published-site directories (`shop/`, `about/`, `contact/`, `series/`, `quotation/`…),
each with an `index.html`. Under Apache's `DirectoryIndex` + `-f` rewrite, those files answer before
Laravel runs, so a Blade route at `/shop` is unreachable no matter what is written.

Measured before the fix: `/shop` → **200 serving a 3,425-byte stale SPA shell with `id="root"`**, while
`/category/*`, `/product/*`, `/sale` → **404**. A visitor gets a dead old single-page app.

**Fix (planned, Phase 1):** route all non-asset requests through `index.php`; the existing fallback
already serves legacy files via `LegacySiteBridgeController`, so no content is lost.

### F3 — The public site does not exist in the new stack  · CRITICAL · open
Public routes: `/`, `/page-preview/{key}`, `/portal`, `/q/*`, `/i/*`, `/p/*`, `/robots.txt`,
`/sitemap.xml`. That is it.

Missing: `/shop`, `/category/{slug}`, `/product/{slug}`, `/sale`, `/blog`, `/projects`, `/services`,
`/showrooms`, `/contact`, `/planning-ideas`, `/e-quotation`. The header ships 48 navigation links; almost
every one is a 404 or a stale static file.

Good news: this is **wiring, not invention**. `CatalogService::paginate()`, `::findDetail()`,
`::categoryTree()` and the typed `ProductCard`/`ProductDetail` value objects already exist and are
tested; `resources/views/puck/blocks/product-grid.blade.php` already renders the card grid. The product
cards on the home page already link to `/product/{slug}` — into a void.

### F4 — Product imagery is 87% missing  · HIGH · open
157 products, **20** `commerce_product_media` rows, **0** `media` rows, and no image column on
`commerce_products`. `database/data/product-photos/` holds 11 placeholder files for a handful of SKUs.
The one Drive archive that probably contains the real photography — `woodexfurniture.pk (1).zip`,
150 MB — has never been opened because it exceeds the connector's 100 MB cap.

### F5 — The page builder publishes the wrong artefact  · HIGH · open
`PublishSiteCommand` writes `public/<path>/index.html`; `public/index.html` answered `/` before Laravel
ran. The builder therefore edits content nobody sees. Proven on 5 Nov: move the shell aside, add a `/`
route → the published page renders correctly. That route is now committed (`routes/web.php:200`), but it
is annotated `EXPERIMENT` and depends on F2 being solved.

### F6 — Migration is 40% complete  · HIGH · open
| Entity | Legacy | Now | Gap |
|---|---:|---:|---:|
| Products | 171 | 157 | −14 |
| Product images | ~171 | 20 | −151 |
| FAQs | 87 | **0** | −87 |
| Quotation requests | 11 | 4 | −7 |
| Orders | 5 | **0** | −5 |
| POS sales | 3 | **0** table | −3 |
| Customers | present | 26 contacts | unverified |

No document recorded what was intentionally dropped, so "complete" was never measurable. `docs/MASTER-MIGRATION-PLAN.md` is that document.

### F7 — Deployment never landed  · HIGH · open
Hostinger has **no shell**, so `apply.sh`, `sync-slice.sh` and `structure.sh` are unusable there. The
hPanel Git deploy only clones — it cannot run `composer install`, migrations or publishing — and it was
correctly disconnected to stop it republishing over uploads. The install still waits on the 70 MB zip.

### F8 — Test suite cannot run as documented  · MEDIUM · open
`php artisan test` dies: `proc_open` is disabled in this environment. `vendor/bin/phpunit` dies on Pest
`TestSuite::getInstance()`. The suite needs `vendor/bin/pest`, and at least one test
(`tests/Unit/NativePreviewTransportTest.php`) requires `tools/sandbox/NativePreviewTransport.php`, which
does not exist. Last clean figure on record: **539/555 passing, 16 failing** (11 harness, 5 real).

### F9 — Misc · LOW
- `//` (double slash) returns 500 rather than normalising to `/`.
- `downloads/woodex-staging-master.zip` (70 MB) is in git — fine as a transport, wrong as a habit.
- 1,442 rows in `page_blocks` are a legacy table the builder no longer reads.

### Security comparison with the legacy audit
The Drive audit rated the **legacy** system HIGH risk: hardcoded live DB credentials, 26 unauthenticated
`lbpanel`/POS write endpoints, an unauthenticated CKEditor upload handler, `display_errors=On`, sessions
inside the web root. **None of this exists in the rebuilt stack** — it is being replaced, not migrated,
and nothing from `lbpanel` should be carried across except data.

---

## 3. What "complete" means from here

Six phases, in dependency order. Full detail and acceptance criteria in `docs/MASTER-MIGRATION-PLAN.md`.

| Phase | Work | Blocks |
|---|---|---|
| **0** | Application in git ✅ · staging install · images | everything |
| **1** | Kill static shadowing (F2) · `/shop`, `/category`, `/product` from `CatalogService` (F3) | sales, SEO, quoting |
| **2** | FAQs, projects, blog, contact forms, sale page, hero slider screen (F6) | content parity |
| **3** | E-quotation → quote → PDF → portal, *or* cart → checkout → order | revenue |
| **4** | Customers, remaining products, hot products | full IB Panel parity |
| **5** | Tests (F8), hardening, backups | production |

Phases 1–2 are mechanical: the services and value objects already exist. Phase 3 is the only part that
needs a product decision (Q1).

---

## 4. Decisions needed

1. **Quote-led or checkout-led?** Evidence says quote-led: the primary CTA is *E-Quotation*, legacy
   logged 11 quote requests against 5 orders. Everything in Phase 3 depends on this.
2. **Can the 150 MB archive be split?** It is the likely home of the 151 missing product images.
3. **Do the 95 static directories stay?** Keeping them preserves the old site as a reference; deleting
   them removes a 26 MB tail and the shadowing problem in one move. My recommendation: keep the files on
   disk, change the rewrite so Laravel answers first.
4. **POS: rebuild or retire?** Three historical sales.
