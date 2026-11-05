# Master migration plan — IB Panel + legacy storefront → Woodex OS

_Analysed 6 Nov 2026. Every number below was read from the live database or the running application,
not recalled. Sources: the Drive audit (`Woodex_Furniture_OS_MASTER_AUDIT_REPORT_2026-11-05.md`), the
legacy archives it analysed, and a schema/routes/content census of this application._

---

## 1. What the Drive actually contains

| Archive | Size | Format | Audited? | What it is |
|---|---:|---|---|---|
| `woodex furniture os .zip` | 2 MB | ZIP | ✅ | The OS backend: PHP 8 API, admin SPA, builder, `schema.sql` (22 `wx_*` tables, 27 more created at runtime), 18 MCP tools |
| `woodex (1).zip` | 36.8 MB | ZIP | ✅ | Older legacy storefront — `lbpanel/` (418 files), CKEditor, dompdf, 40 root PHP pages |
| `frontstore.zip` | 83 MB | **RAR5, mislabelled `.zip`** | ✅ | Newer derivative of the same storefront: 51 root pages, 13 API scripts, 460 images |
| `woodexfurniture.pk (1).zip` | 150 MB | ZIP | ❌ **blocked** | Over the connector's 100 MB cap. Almost certainly the production snapshot with the real images and data |

**The one archive nobody has read is the one most likely to contain the product imagery** — which is
exactly the gap in §3.4.

Two generations, not one project:

- **OS** — newer, API-first, `wx_*` MySQL, signed tokens, 2FA, page builder, MCP. Backend + admin only;
  it has no public storefront.
- **Legacy storefront** — server-rendered PHP with `mysqli`, session cart, POS, CKEditor, PHPMailer.
  Two snapshots of it exist (`site`, `frontstore`) sharing 39 identical file hashes.

The audit's own verdict: risk **HIGH**, three critical findings (hardcoded live DB credentials,
26 unauthenticated `lbpanel`/POS write endpoints, unauthenticated CKEditor upload). None of that should
be carried forward — it is being *replaced*, not migrated.

This repository is a **third thing**: a Laravel reimagining of the OS (132 tables, Livewire admin,
Puck-style block editor). So this is not a data copy — it is a rebuild with a migration attached.

---

## 2. Feature matrix — the IB Panel list against reality

Legend: ✅ present and working · ◐ partial (data or screen only) · ✘ absent

| # | IB Panel feature | Today | Evidence | What is actually missing |
|---|---|---|---|---|
| 1 | **Sale page** | ✘ | no route, no `sale_page_settings` table | the page itself and a screen to set its banner/copy |
| 2 | **Hot products** | ◐ | `is_featured` on **21** products | a public "hot/featured" surface, plus a toggle in the product screen |
| 3 | **Quotation requests** | ◐ | `quotes` **4** (legacy had 11) | a public request form → quote; the 7 missing legacy rows |
| 4 | **SEO + redirects** | ✅ | `redirects` **137**, robots/sitemap routes, page-speed runs | nothing structural; needs the cutover to matter |
| 5 | **Contact forms** | ◐ | `leads` **26**, a Forms entry in admin | submit-side wiring to a real public form |
| 6 | **FAQs** | ✘ | **0** rows of type `faq` (legacy had 87) | table/model, admin screen, public render, the 87 records |
| 7 | **Projects** | ◐ | 7 `content_items` of type `project` | portfolio listing + detail pages in the storefront |
| 8 | **Blog** | ◐ | 6 posts | listing/detail pages; the rest of the legacy posts |
| 9 | **Customers** | ◐ | 26 contacts/companies | storefront accounts, or an explicit decision that B2B-only means no accounts |
| 10 | **Hero slider** | ◐ | a `heroSlider` block, 4 slides on home | a standalone screen (today it only exists inside the page builder) |
| 11 | **Footer** | ✅ | shell settings (28 fields) + 18 footer links | — |
| 12 | **Header** | ✅ | 48 nav items, mega menu, drag-and-drop builder | — |
| 13 | **Top bar** | ✅ | shell settings | — |
| 14 | **Categories** | ✅ | **64** (3 levels) vs legacy 53 | — |
| 15 | **Orders** | ✘ | **0** orders (legacy 5) | cart, checkout, order admin, the 5 legacy rows |
| 16 | **Products** | ◐ | **157** (legacy 171 → 14 missing), **20 images for 157 products** | 137 images, 14 records, public product page |
| 17 | **POS** | ✘ | no table, no route | the module — 3 legacy sales, likely not worth rebuilding |
| 18 | **Quotation builder** | ◐ | `quote_templates`, `quote_sections`, `quote_items`, `estimator_rates` | verify the admin flow end-to-end |
| 19 | **E-quotation** | ✘ | no public route (the SPA has `/e-quotation`) | the customer-facing builder + submission |

Also measured: `site_pages` **16**, `page_blocks` **1 442** (legacy table), Puck blocks **4** (home),
`content_items` **32** (6 post, 7 project, 5 series, 7 service, 5 showroom), `website_media` **105**.

---

## 3. Why it is still not complete — root causes, not excuses

1. **Only half the system was rebuilt.** The admin and data layer exist; the *public storefront* was
   never built in the new stack. `/shop`, `/product/*`, `/category/*`, cart and checkout still belong to
   the React SPA. That is why 157 products are visible in admin but a visitor cannot buy one.
2. **The page builder publishes the wrong thing.** It renders a real page at `/page-preview/{key}`, but
   Publish writes the old SPA shell and `public/index.html` answers `/` before Laravel runs. Proved on
   6 Nov by wiring `/` to the built page — it renders correctly.
3. **The data migration is partial, and nobody listed what was dropped.** 14 products, 137 product
   images, 87 FAQs, 7 quotation requests, 5 orders, 3 POS sales and all customer records are absent.
   The one archive that probably holds the images (150 MB) has never been opened.
4. **Deployment was never finished.** The Hostinger account has no shell, the hPanel Git deploy only
   clones, and the first working install is still waiting on the zip upload.
5. **Scope drifted across three generations** (OS, legacy storefront, this rebuild) with no single
   source of truth, so "complete" was never defined.

---

## 4. The plan

Sequenced so each phase makes the previous one visible. Nothing here needs a terminal on the server.

### Phase 0 — Make it real (blocking, ~1 day)
- Staging install running (§ the zip upload), `setup.php` green, deleted afterwards.
- Product images present (import from the archive or the live site).
- `downloads/` removed from git once installs are repeatable.
- **Done when:** `https://staging.blackibex.net` shows the new home page with images, and the
  `.env`/`.git` probes return 403.

### Phase 1 — Storefront core (~4–6 days)
- Publish writes the rendered page; `/` serves it. Static-file shadowing removed.
- Blade routes: `/shop`, `/category/{slug}`, `/product/{slug}`, `/sale`, `/search`.
- Product page: gallery, price in PKR, stock, variants, warranty — this closes 5 failing tests.
- **Done when:** a visitor can browse 157 products across 64 categories with images, and reach a
  product page from the home page.

### Phase 2 — Content migration (~3–4 days)
- FAQs (87) — new table, admin screen, public page + JSON-LD.
- Projects (portfolio) and Blog listing/detail.
- Contact forms wired to `leads`, with spam protection.
- Hero slider as its own screen (reusing the block), plus header/footer/top-bar already done.
- **Done when:** every legacy public URL either serves content or 301s via the redirect table.

### Phase 3 — Commerce (~5–7 days) — **direction depends on your answer to Q1**
- Quote-led path: e-quotation builder → quotation request → admin quote → PDF → portal.
- Checkout path: cart → checkout → order → payment → fulfilment.
- Either way: the 5 legacy orders and 11 quotation requests imported as **history**.
- **Done when:** a real order (or quotation) can be created by a customer and seen in admin.

### Phase 4 — Parity leftovers (~2 days)
- Customers (or documented decision), 14 missing products, hot-products surface.
- POS: **recommended drop** — 3 historical sales, no present need (Q5).

### Phase 5 — Hardening (~2 days)
- Fix the 5 real test failures; make the other 11 runnable in a real container.
- Remove demo credentials, delete `recovery/`, `woodex-diagnostic.php`, `inspect.php`.
- Backups, cron, uptime monitoring.

---

## 5. Questions I need answered before Phase 1

1. **Quote-led or checkout-led?** The site's primary CTA is *E-Quotation* and legacy had 11 quote
   requests vs 5 orders. This decides whether Phase 3 is a checkout or a quotation builder.
2. **Can you split the 150 MB archive** (`woodexfurniture.pk (1).zip`) into parts under 95 MB, or upload
   it to a folder I can page through? It is the most likely home of the product images and production
   content, and it is the one thing I cannot read.
3. **Does the React SPA survive the cutover?** Keep it behind `/legacy` for comparison, or delete it
   once the Blade pages are live? Keeping it doubles every future change.
4. **Bagisto: install for real, or stay with the Bagisto-shaped tables?** The 23-table commerce module
   is modelled on it; a real install is a large dependency, the shape already exists.
5. **POS — rebuild or retire?** Three legacy sales, no evidence it is used day to day.
6. **Source of truth for content:** the legacy database, or the live `woodexfurniture.pk` site? They
   disagree (the live site has 5 hero slides and a 10-category carousel; the audit found 1 hero slider
   in the legacy DB).
