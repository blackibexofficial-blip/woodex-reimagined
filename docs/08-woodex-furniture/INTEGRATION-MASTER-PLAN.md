# WOODEX Furniture — Integration Master Plan

**Frontend ↔ WOODEX OS · full runtime audit · 28 admin screens · 4 domains**

| | |
|---|---|
| **Business** | WOODEX **Furniture** — office furniture, manufacture + delivery, Karachi/Lahore |
| **Storefront** | `woodex-reimagined` React SPA, built and installed at `platform/public/` — live at `/` |
| **Admin** | WOODEX OS, Laravel 13 + Livewire 4, dark interface, **28/28 audited screens answering 200** |
| **Hosting** | Hostinger **shared** — no Node at runtime, ~30 PHP workers, 2 MB/s I/O, no Redis |
| **Audited** | 1 November 2026, against the **running** app on `:8081`, not the source tree |
| **Scope** | Commerce (14) · Pages & builder (4) · Content (3) · Website (7) |
| **Verdict** | **The storefront sells. The website half of the OS no longer has a website.** |

---

## 0. How this was verified

Every claim below was read from the running application or its database today — not from source alone and not from a previous document.

| Method | What it produced |
|---|---|
| `GET` all 28 admin URLs with a real owner session | **28/28 → 200.** Nothing is missing a route; every screen renders |
| `POST /api/forms.php` live | **Lead #27 · `L-2026-000001` · contact #29** — the lead pipeline works end to end |
| `POST /api/storefront/v1/checkout` live | **WDX-000003 · WFI-2026-0003 · JE-2026-0004 balanced** — money reaches the ledger |
| `POST /admin/website/studio/api` live | `cms_list` returns real posts (id 229, 228…), `cms_forms` counts a live submission |
| `PRAGMA table_info` + row counts on every `website_*` / `commerce_*` table | The inventory in §1 |
| `BuilderFile::pages()` on disk | **1** — the SPA shell |

---

## 1. The finding that decides everything

### 1.1 A page is a file — and the file is gone

The OS was deliberately rebuilt around one rule, written into `app/Domain/Website/Services/SiteRouter.php`:

> **A page is a file.** Since Woodex OS 1 every public page is `public/<path>/index.html`, which the web server answers before Laravel runs. This class used to render a page from its database row… **The renderer, its Blade layout and its 20 section views are gone (owner, 21 Oct 2026).**

That was a sound decision for a static site. Then, in the previous step, we deleted all 141 page directories and the root `index.html`, and installed the SPA in their place.

**Consequence:** every screen in the Website domain still points at `public/**/index.html`. There is now exactly **one** such file — the SPA shell.

| Screen | What it actually reads | Result today |
|---|---|---|
| All pages | `BuilderFile::pages()` → filesystem | **1 page** ("WOODEX - Premium Office Furniture") |
| Page builder | same | can only edit the SPA shell |
| Find & replace | same | searches 1 file |
| SEO overview / SEO agent | `Seo\FileAudit` → files | audits **1 file** |
| Site health | `FileAudit` link graph | a site with one page |

None of these are broken code. They are correct code reading a website that no longer exists.

### 1.2 The content is not lost — it is stranded

The database still holds the entire former site, fully structured:

| Table | Rows | Meaning |
|---|---|---|
| `pages` | **142** | 59 service · 48 insight (blog) · 12 city · 8 area · 6 project · 3 listing · home, about, contact, booking, estimator, legal |
| `page_blocks` | **1,442** | the actual section content, ~10 blocks per page |
| `page_versions` | **142** | full snapshots — `{title, excerpt, seo, blocks}`, 7–11 KB each |
| `page_templates` | **50** | reusable layouts |
| `theme_tokens` | **28** | design tokens |

But:

| Column | Value |
|---|---|
| `pages.builder` | `'file'` on **all 142** |
| `pages.canvas_html` | empty on **all 142** |
| `pages.puck_data` | null on **all 142** |

So the rows are inert by the current architecture: rich, correct, and unrenderable. **This is the single most valuable asset in the system and it is currently unreachable** — 127 SEO-critical pages (59 services + 12 cities + 8 areas + 48 insights) of real copy, meta, and internal links.

### 1.3 The other half is genuinely empty

| Table | Rows | Verdict |
|---|---|---|
| `website_media` | **105** | the Media screen is full… **of 105 records whose files do not exist.** `file_exists` → **0 on disk / 105 missing** |
| `redirects` | 0 | screen works (add, CSV import/export), nothing to redirect |
| `content_entries` | 0 | **unused** — content lives in `pages`, not here |
| `media` | 0 | **unused** — the model in use is `website_media` |
| `navigation_items` | 0 | menus are not built |
| `saved_sections` | 0 | the builder's section library is empty |
| `team_members` | 0 | not built |
| `pagespeed_runs` | 0 | Speed screen works, has never run |

Two of my earlier assumptions were wrong and are corrected here: **media is not empty** (it has 105 rows), and **blog/portfolio are not empty** (they are `Page` rows of type `insight`/`project`, not `content_entries`).

---

## 2. Verdict — every screen

Legend: ✅ real and populated · 🟡 real but cannot do the job its name promises · ⚠️ correct code, wrong target · ❌ absent

### 2.1 Commerce (14)

| # | Screen | Lines | Backing data | Verdict |
|---|---|---|---|---|
| 1 | Dashboard | 80 | orders, stock, ledger | ✅ |
| 2 | Products | 193 | 20 products · 28 variants · 24 categories | ✅ — except **0 images** |
| 3 | Attributes | 191 | 3 attributes · 17 options · 20 values | ✅ |
| 4 | Categories | 293 | 24 categories + 24 translations | ✅ |
| 5 | Inventory | 193 | 84 items · 3 sources · 3 reservations | ✅ |
| 6 | Orders | 111 | 3 (`WDX-000001`…`003`) + detail | ✅ |
| 7 | Invoices | 201 | 3 · frozen PDF · posted to ledger | ✅ |
| 8 | Payments | 177 | 1 payment · 1 allocation · `RC-2026-0001` | ✅ |
| 9 | Refunds | 150 | queries `Order` | 🟡 **read-only list.** No refund can be initiated, approved, or posted from here |
| 10 | Customers | 164 | 29 contacts | ✅ |
| 11 | Promotions | 96 | queries `Order` for `coupon_code` | 🟡 **coupon usage ledger, not a coupon manager.** No code can be created; the storefront has no coupon field |
| 12 | Shipping & tax | 114 | queries `Order` | 🟡 **derived view.** The real values are constants: `DEFAULT_TAX_RATE_BP = 1800`, flat `Rs 2,500`, free over `Rs 200,000` |
| 13 | Reports | 117 | order/P&L aggregation | ✅ |
| 14 | Settings | 123 | `commerce_sequences` (1 row) | 🟡 numbering + formatting only; no tax, shipping, or store config |

**Commerce score: 9 solid · 3 read-only stand-ins · 1 images gap · 1 config gap.**
The transactional core is genuinely done and proven — an order placed from the public API produced an invoice, a journal entry, and a settle-able payment.

### 2.2 Pages & builder (4)

| # | Screen | Verdict |
|---|---|---|
| 15 | All pages | ⚠️ lists **1** file; 142 DB pages invisible to it |
| 16 | Page builder | 🟡 real HTML-canvas editor (`load`, `save`, `backups`, `restore`, `page_new`, block library, theme) — with nothing left to edit |
| 17 | Find & replace | ⚠️ site-wide text replace across files → 1 file |
| 18 | Redirects | ✅ add / remove / CSV import / CSV export — 0 rows |

### 2.3 Content (3)

| # | Screen | Verdict |
|---|---|---|
| 19 | Blog | 🟡 the studio really reads and writes `Page[type=insight]` (48 posts, versioned, publish/unpublish, delete). Nothing renders them |
| 20 | Portfolio | 🟡 same for `Page[type=project]` (6 studies) |
| 21 | Forms | ✅ `cms_forms` counts real submissions per key (contact, brief, estimator, website) and links to leads |

**Not built at all — and this is the gap in your own words "location page, services page, project":**

| Content type | Rows | Admin screen |
|---|---|---|
| Service pages | **59** | ❌ none |
| City pages | **12** | ❌ none |
| Area pages | **8** | ❌ none |
| Home / about / contact / booking / estimator / legal | 6 | ❌ none |

`StudioContent::TYPES` declares exactly two: `post` and `study`. The other 116 pages were only ever editable through the file builder.

### 2.4 Website (7)

| # | Screen | Verdict |
|---|---|---|
| 22 | Media | ⚠️ upload / edit alt / delete all work — **105 rows, 0 files, every thumbnail broken** |
| 23 | SEO overview | ⚠️ `FileAudit`, 438 lines, real checks — against 1 file |
| 24 | SEO agent | ⚠️ same audit, filtered by issue code |
| 25 | Speed | ✅ keyless local metrics + optional Google PageSpeed key; 0 runs recorded |
| 26 | Site health | ⚠️ broken links / orphans / redirect targets — over 1 file |
| 27 | Theme | 🟡 28 tokens, presets, groups, reset — **no consumer**: the SPA never reads them |
| 28 | Website settings | 🟡 real settings for a website that is no longer served from files |

---

## 3. The decision to make before any code

Three coherent futures. Only one fits Hostinger shared + 127 SEO pages + an editor-updatable CMS.

### Option A — SPA owns everything
All content moves into React, fed by a new content API.

- ❌ blog/services/city pages render client-side only → weak SEO on exactly the pages that earn traffic
- ❌ no build-time generation on shared hosting means no static content
- ✔ one codebase

### Option B — files own everything, SPA retreats
Rebuild the static site, keep the SPA only for checkout.

- ❌ throws away the reimagined design that was just built and approved
- ✔ fastest serving on Hostinger

### Option C — **RECOMMENDED: database is the source, HTML is the build output, SPA is the app**

Two surfaces, one source of truth:

```
publish (admin action)                    request (web server)
──────────┬──────────                     ──────────┬──────────
pages + page_blocks                       PHP renderer writes     public/services/x/index.html
(or Puck JSON)  ──► PHP block renderer ──► static HTML  ──►  answered by the web server, 0 PHP
                                                               (home, services, cities, areas,
                                                                insights, projects, about)
commerce_*  ◄──── /api/storefront/v1 ◄──── React SPA at /shop, /shop/:slug,
                                            /checkout, /quotation, /account
```

**Why this one:**

| Constraint | How C satisfies it |
|---|---|
| Hostinger shared, no Node at runtime | content pages are **static files** — no PHP boot, no Node |
| 127 SEO pages | full HTML + schema on first byte, written at publish |
| Editor updates content | publish re-renders only the pages that changed |
| The reimagined design stays | it is the SPA, and the content templates are rebuilt to match it |
| The owner's "a page is a file" rule | kept — files are still the thing served; the DB becomes source instead of a parallel truth |
| Puck required | Puck edits in the admin, saves JSON to `pages.puck_data`, the same renderer turns it into HTML |

**The one rule that keeps it honest:** the renderer is a **publish step**, never a request-time fallback. A missing file must 404, exactly as `SiteRouter` says today. That is what caused the two-frontends bug in October and must not come back.

---

## 4. Phase plan

3 developers · ~6 weeks · every phase ships something usable.

### Phase 0 — Stop the screens lying (2 days, 1 dev)

| Task | Detail |
|---|---|
| 0.1 Banner on file-based screens | All pages, builder, find & replace, SEO ×2, health: state plainly that the site is now served by the storefront, with a link to the new content screens (Phase 1) |
| 0.2 Repair Media | 105 rows, 0 files. Either re-import the images from the original site or mark the rows `missing` so the library stops showing broken tiles |
| 0.3 Freeze the stranded 142 | Keep the rows, add `pages.legacy_file = true`, exclude them from "All pages" until the renderer exists |
| 0.4 Route ownership map (below) | Write down which URL belongs to the SPA and which to a content page |

**Route ownership map — decide once, enforce in `.htaccess`:**

| URL | Owner |
|---|---|
| `/`, `/about`, `/contact`, `/projects`, `/services`, `/materials`, `/showrooms`, `/warranty`, `/blog` | **content** (static HTML, Phase 1) |
| `/shop`, `/shop/:slug`, `/checkout`, `/quotation`, `/account/*` | **SPA** |
| `/admin`, `/api`, `/media`, `/build`, `/front` | **app** (already excluded in `htaccess.txt`) |

### Phase 1 — The content backbone (1.5 weeks, 2 devs)

| Task | Detail |
|---|---|
| 1.1 Restore a block → HTML renderer | `pages` + `page_blocks` → Blade partials → `public/<path>/index.html`. The 1,442 blocks and 142 `page_versions` snapshots are the test corpus |
| 1.2 Publish action | `PublishPage` (queue-safe on shared hosting: one page per request, chunked). Writes only changed pages |
| 1.3 Five content screens | Services (59), Locations (city 12 + area 8), Insights (48, exists), Projects (6, exists), Pages (6 singletons). One shared editor, not five |
| 1.4 Content API | `GET /api/storefront/v1/content/{type}` so the SPA and the renderer read the same rows |
| 1.5 Seed redirects | 141 old URLs → new ones. `RedirectsIndex` already imports CSV |

**Exit test:** publish a service page in admin → `curl /services/<slug>` returns that page's H1 from static HTML.

### Phase 2 — Finish the storefront (1 week, 2 devs)

Ranked by revenue.

| # | Task | Why it matters |
|---|---|---|
| 2.1 | **Product images** — `commerce_product_media` is 0; every product returns `"image": null` | a furniture shop with no photographs cannot sell |
| 2.2 | **Contact form → `/api/forms.php`** — today `handleSubmit` just calls `setSubmitted(true)` | enquiries are being thrown away. The endpoint, honeypot, rate limit and lead→contact wiring already work |
| 2.3 | Quotation page → `POST /checkout/quote` | the quote exists in the API and is unused by `/quotation` |
| 2.4 | Customer accounts + order history | guest-only today; `contacts` (29) already exist to hang them on |
| 2.5 | Server-side cart | `localStorage` only; an abandoned cart is invisible to the OS |
| 2.6 | Checkout success page | show `WDX-…`, invoice number, ETA — the API returns them |

### Phase 3 — Commerce completion (1 week, 1 dev)

| # | Task |
|---|---|
| 3.1 | **Coupons**: `coupons` table + create/edit screen + `/checkout` acceptance (Promotions becomes the usage view it already is) |
| 3.2 | **Shipping rates**: replace `CartService::cashOnDelivery()` constants with rows; city/weight/free-over rules |
| 3.3 | **Tax rates**: replace `DEFAULT_TAX_RATE_BP = 1800` with a table (per category, per city) |
| 3.4 | **Refunds**: initiate → approve → post reversal to the ledger, reusing the proven `RecordPayment` pattern |
| 3.5 | **Product media manager** inside Products (upload, order, alt text) |
| 3.6 | Website Settings: store name, currency, phone, hours — read by both surfaces |

### Phase 4 — Website operations (1 week, 1 dev)

| # | Task |
|---|---|
| 4.1 | Repoint SEO overview / SEO agent / Site health at **DB rows** (`PageAudit` + `PageValidator` already exist), not files |
| 4.2 | Speed: record `pagespeed_runs` against published HTML; keep the keyless local metrics |
| 4.3 | Theme tokens → CSS custom properties consumed by **both** the SPA and the rendered HTML |
| 4.4 | Menus: `navigation_items` + a menu editor; the header/footer for both surfaces |
| 4.5 | Find & replace over DB rows (`SiteWideReplace` already implements it — point it at `pages`) |

### Phase 5 — Puck (1 week, 1 dev)

| # | Task |
|---|---|
| 5.1 | Puck in `resources/js/admin/puck` → Vite build copied to `public/builder/puck.js`, mounted in the existing builder route |
| 5.2 | 10–15 components matching the storefront design; each maps to one Blade partial |
| 5.3 | `puck_data` ⇄ HTML: save JSON, publish renders HTML. The `puck_data` / `puck_version` columns already exist |
| 5.4 | Retire the HTML-canvas builder for content pages once Puck covers them |

> Puck is MIT and ships a React `<Render>`, but rendering must happen in **PHP** to stay static on shared hosting. That means one Blade partial per Puck component — this is the work, not the integration.

### Phase 6 — Cutover (3 days)

See §6.

---

## 5. Complexity and cost

| Area | Existing | To build | Risk |
|---|---|---|---|
| Commerce | 9 screens, ledger, settle, invoices | coupons, rates, refunds, media | **Low** — patterns proven |
| Content | 142 pages, 1,442 blocks, 2 screens | renderer + 3 screens | **Medium** — the renderer is the crux |
| Website | 7 screens, real checks | repointing, theme, menus | **Low–Medium** |
| Storefront | 22 routes, checkout, catalog | images, accounts, forms, cart | **Medium** |
| Builder | canvas editor + API | Puck + partials | **Medium** |
| Data | 20 products, 29 contacts, 142 pages | real catalogue from you, real photos | **Blocked on you** |

---

## 6. Hostinger cutover checklist

| # | Check | Why |
|---|---|---|
| 1 | `php artisan migrate --force` + `woodex:install` | schema on the live DB |
| 2 | Upload `public/` **without** `public.v1-pages.txt` | 141 dead dirs are already gone |
| 3 | Run `tools/furniture-commerce/connect-storefront.sh` | idempotent: removes v1 pages, installs `dist/`, verifies `.htaccess` |
| 4 | Confirm `.htaccess` exclusions | `admin|install|up|api|livewire|webhooks|media|portal|vendor|storage|build|builder|assets|font|front|site|q|i|p` |
| 5 | `APP_DEBUG=false`, `APP_ENV=production` | a stack trace on checkout is a data leak |
| 6 | Queue = `sync` or cron (max 5 on Hostinger) | no workers on shared hosting; the publish step must be chunked |
| 7 | Throttles on `/api/storefront/v1/checkout` | 30 entry processes; a crawler must not exhaust them |
| 8 | Verify `storage/` and `bootstrap/cache` writable | install step fails silently otherwise |
| 9 | Cache config + route, not views | `view:clear` breaks the php-wasm harness (see Errors) |
| 10 | Smoke: place one real COD order, settle it, confirm the JE | the only proof that matters |
| 11 | 301 map live from `redirects` | the 141 old URLs must not 404 |
| 12 | Google Search Console re-submit sitemap | after Phase 1 publishes static HTML |

---

## 7. What I would do first

1. **Phase 0.1 + 0.2 (half a day).** Right now a person opening Media sees 105 broken images and opening All pages sees one page. Neither tells them the truth.
2. **Phase 2.1 + 2.2 (two days).** Product photos and a working contact form are the only two items on this list that change revenue this week.
3. **Phase 1.1 (the renderer).** Everything in the Website domain is downstream of it. Until it exists, 127 pages of real content stay unreachable and six screens stay pointed at a single file.

---

## 8. Decisions I need from you

| # | Question | Default if you don't answer |
|---|---|---|
| 1 | **Phase 1 renderer vs SPA-owned content** — confirm Option C | Option C |
| 2 | **Where do product photographs come from?** The live site has 24 products with `assets/images/products/…` | re-import from `woodexfurniture.pk` |
| 3 | **Are the 142 existing pages copy to keep?** 59 services + 48 insights + 12 cities + 8 areas is real SEO value | keep and re-publish, do not delete |
| 4 | **Coupons at launch?** | yes — Phase 3 |
| 5 | **Customer accounts at launch, or guest checkout only?** | guest + optional account |

---

*Audited against the running application on 1 November 2026. This plan supersedes no existing document; it sits beside `MASTER-PLAN.md` and covers the integration layer that document did not.*
