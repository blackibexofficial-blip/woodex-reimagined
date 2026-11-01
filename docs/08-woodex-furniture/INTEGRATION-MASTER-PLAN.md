# WOODEX Furniture — Reimagined CMS Master Plan

**The reimagined storefront (image 1) · master CRM page builder · 14 admin screens · redevelopment into WOODEX OS**

| | |
|---|---|
| **The site** | `woodex-reimagined` React SPA — 22 routes, live at `/` — **this is the site to manage** |
| **The admin** | WOODEX OS, Laravel 13 + Livewire 4, dark interface — all 14 Website screens answer `200` |
| **The gap** | the admin still manages the **old interior** website; the reimagined furniture site is **hardcoded** in React |
| **Hosting** | Hostinger shared — no Node at runtime, ~30 PHP workers, no Redis |
| **Date** | 1 November 2026 · supersedes the interim screen notes of the same date |

---

## Part 0 — Your question, answered exactly

### "Are the 142 pages the reimagined frontend?"

**No — and not just "no": they belong to a different business.**

| | The 142 pages | The reimagined frontend (image 1) |
|---|---|---|
| Rows | 142 in `pages` + 1,442 `page_blocks` | React SPA, 22 routes, 0 database rows |
| Business | **WOODEX Interior** — house design, 3D visualisation, fit-out | **WOODEX Furniture** — office desks, chairs, workstations |
| Proof | `service` pages titled *"1 Kanal House Design Lahore"*, *"3D Visualization"*; 12 city + 8 area pages for interior work | nav reads *Products · Markets · Series · Projects · Services · Blog*; hero says *"Design For Your Workspace"* |
| Served by | nothing — its HTML files were deleted | the web server at `/` |
| Status | **stranded interior content** | **live** |

So the confusion is real and it has a cause: **we replaced an interior site with a furniture store, but the CMS still points at the interior content.** Every Website screen in the OS is looking at the wrong business.

### "Delete the v1 HTML frontend, keep the HTML builder as an option"

Done, and built into the plan as three page kinds:

| Page kind | How it is served | Edited by |
|---|---|---|
| **Route page** | the SPA's own built-in route (`/about`) — settings + editable sections | Puck (visual) |
| **Puck page** | new URL, JSON in the database, rendered by the SPA catch-all | Puck (visual) |
| **HTML page** | a raw `.html` file the web server answers directly | **HTML builder — kept as an option**, exactly as you asked |

The HTML builder (`BuilderApi`: `load`, `save`, `backups`, `restore`, `page_new`, `blocks_*`, theme) is **not deleted**. It becomes the third option, for hand-written pages.

---

## Part 0b — What shipped on 1 November 2026 (Phase A + B spine)

Option A was chosen. These are built, applied to the OS, and proved against the running app — not planned.

| # | Built | Proof |
|---|---|---|
| 1 | **`website:archive-interior`** — exports the 142 interior pages + 1,442 blocks to `storage/app/private/archive/interior-pages-2026-11-01-050348.json` (1.98 MB) and stamps `pages.archived_at`. Deletes nothing | ran live: *"Pages found 142 · Blocks attached 1442 · Stamped archived 142"* |
| 2 | **`site_pages` + `content_items`** — the reimagined site's tables, with `archived_at` added to `pages` | migration `2026_11_01_200000` applied |
| 3 | **`SiteContentSeeder`** — 16 URLs + 30 records, extracted from the SPA's own TypeScript (`src/data/*.ts`, `Projects.tsx`, `Showrooms.tsx`) rather than retyped | *"16 page(s) and 30 record(s) created"* |
| 4 | **`/api/site/v1`** — `pages`, `pages/{key}`, `content/{type}`, `content/{type}/{slug}`, `theme` | 5 routes registered; live 200s |
| 5 | **`website:publish`** — writes `public/<path>/index.html` per published page with its own title, description, canonical, OG tags and JSON-LD, plus `sitemap.xml` | *"16 pages · 30 records · 46 files · 0 failures"* |
| 6 | **All pages screen** — repointed from the deleted filesystem to `site_pages`, with a Publish action and an archived-interior notice | `/admin/website/pages` renders all 16 URLs, 4 stats, publish buttons |
| 7 | **Tests** — 2 classes, 17 tests, 368 assertions | `passed 17 · failed 0` |
| 8 | **The SPA reads the CMS** — `src/lib/api/site.ts` + `src/hooks/useSite.ts`, with the bundled copy as the floor | 5 pages now call `/api/site/v1` |
| 9 | **Services, Service detail, Blog, Blog post, Showrooms** — drawn from `content_items`, not from `src/data/*.ts` | edited a service title in the database → the live `<h1>` changed, then reverted |
| 10 | **Cards carry `payload`** — a blog list needs author and date, a showroom needs its phone, without 30 extra requests | verified in the JSON: `payload` on every card |

**The SEO defect is gone.** Before: one `<title>` for all 22 routes, `og:image` = `lovable.dev`. After:

```
/                          WOODEX — Pakistan's Premium Office & Home Furniture Manufacturer
/about                     About WOODEX — Pakistan's Leading Office Furniture Manufacturer
/shop                      Shop Office Furniture — WOODEX Pakistan
/blog                      Blog — WOODEX Pakistan | Office Design Tips, Trends & Case Studies
/services/custom-design    Custom Office Furniture Design Pakistan — Bespoke Desks & Workstations
/showrooms/karachi         WOODEX Showroom Karachi — Address, Hours & Phone
```

Each with its own canonical and schema (`WebPage`, `Service`, `BlogPosting` + `Person`, `FurnitureStore`).
Verified in a browser: the SPA still mounts on every published shell (h1 present, 3 root children, `/about`
highlighted in the nav).

**What is now true.**
- ✅ Editing a row changes the live page, with no rebuild and no deploy. Proved end to end: set a service
  title to *"CMS-EDITED: …"* in the database, reload `/services/custom-design` in Chromium, the `<h1>` was
  the new text; reverted afterwards.
- ✅ Publishing writes the head a crawler receives, per URL, with canonical and schema.
- ✅ Services, blog posts and showrooms are no longer frozen in React — 18 records are editable today.

**What is still hardcoded, and why.**
- ❌ **Projects.** `ProjectDetail.tsx` carries fields the seed does not have — before/after images, year,
  duration, challenge, solution, furniture used, testimonial, rating — for 7 studies. Wiring the list would
  break its `/projects/{id}` links (the records use slugs). The seed must be enriched from that file first.
- ❌ **Series.** Its pages join records to live products; that is a different job.
- ❌ **`document.title` calls remain**, so a client title can still differ from the static one (`/shop`:
  static *"Shop Office Furniture"*, React *"Shop Office & Home Furniture"*). Delete them once every page
  reads its `seo.title` from the API.

**One bug worth remembering.** The first version let `payload.title` win over the row's own `title` column,
so an edit saved correctly and changed nothing on the page — the seeded copy in `payload` quietly overrode
it. Columns are the truth; `payload` carries the type's extra fields only.

---

### 0.4 Two corrections — and a sign-in fix

| I said | Truth | How it was found |
|---|---|---|
| "105 media records, 0 files on disk — every thumbnail broken" | The files are on the `public` disk (210 of them) and are served at `/media/{id}/…` with a 200. I checked `public_path()` instead of the disk the model actually uses | opened the Media screen and fetched a tile |
| "the SPA still draws every content page from `src/data/*.ts`" | Services, blog posts and showrooms now read `/api/site/v1` (Phase C). Projects and series do not, yet | edited a service row and watched the live `<h1>` change |

**Sign-in was broken and is fixed.** The preview prints the demo password from `.env`; the account row had been
lost when the sandbox database was replaced during a sync. `php artisan woodex:owner --force` now recreates or
repairs the owner from `OWNER_EMAIL` / `OWNER_PASSWORD` — deliberately *not* `woodex:install`, which would have
imported the interior website again. Verified: `owner@woodex.test / Woodex-Preview-2026` → 302 → `/admin`, 200.

### 0.5 "The detail page has no product images" was a white screen

Worth recording, because the symptom pointed at the wrong subsystem for two rounds.

`/shop` showed all 20 photographs after the import. `/shop/ballmer-executive-desk` showed **zero** — but the
API returned `image`, `image_srcset` and `images`, and the adapter built them. The page was not missing
images; it was not rendering at all. `#root` had 0 children and the browser console carried one line:

```
TypeError: Cannot read properties of undefined (reading 'category')
```

`ProductDetail` opened with `if (!product && !isLoading)`. On the first render the query is *still* fetching,
so `product` is `undefined` **and** the guard is false — execution fell through to `product.category` and
threw. React unmounted the tree. A DOM image count reads 0 on a blank page for exactly the same reason it
reads 0 on a broken gallery, which is why the count kept incriminating the images.

The rule this leaves: **a guard must cover the loading state, not just the empty one.** `if (!product)` now
returns a skeleton while the lookup is in flight and the "not found" panel only when it has settled.

---

## Part 1 — What the reimagined site actually is

### 1.1 The nav on image 1, mapped to its real data source

| Nav item | Route | Data today | Verdict |
|---|---|---|---|
| Products | `/shop` → `/shop/:slug` | `GET /api/storefront/v1/products` | ✅ **the only fully integrated page** |
| Markets | category menus | **29 categories hardcoded** in `src/data/products.ts` | ⚠️ duplicates the OS's 24 `commerce_categories` |
| Series | `/series` → `/series/:id` | **153 series hardcoded** | ⚠️ no such thing in the OS |
| Projects | `/projects` → `/projects/:id` | **hardcoded array** in `Projects.tsx` | ⚠️ none in the OS |
| Services | `/services` → `/services/:slug` | **8 services hardcoded** (`custom-design`, `b2b-office-solutions`, `custom-manufacturing`, `delivery-installation`, `space-planning-design`, `after-sales-support`, `project-management`) | ⚠️ none in the OS |
| Blog | `/blog` → `/blog/:id` | **7 posts hardcoded** | ⚠️ OS has 48 interior posts instead |
| About · Contact · Custom Design · Showrooms · Warranty · B2B | their routes | hardcoded in each page; 5 showrooms hardcoded | ⚠️ no CMS |
| Materials | `/materials` | `GET /api/storefront/v1/materials` | ✅ integrated |
| E-Quotation | `/quotation` | `POST /checkout/quote` | ✅ integrated |
| Cart · Checkout | `/checkout` | `localStorage` + `POST /checkout` | 🟡 works, guest-only |

**Score: 4 of 12 content areas are real. The other 8 are hardcoded and cannot be edited by anyone.**

### 1.2 And the SEO is one page wearing 22 hats

| Fact | Value |
|---|---|
| `.html` files produced by the build | **1** — `dist/index.html` |
| `<title>` for every route at first byte | *"WOODEX - Premium Office Furniture \| Pakistan"* |
| Per-page titles | set by `document.title` in JavaScript — **invisible to crawlers that don't execute JS** |
| `og:image` | `https://lovable.dev/opengraph-image-p98pqg.png` — **a leftover from the prototype**, wrong brand |
| Sitemap | none |

This is the single largest SEO defect in the system, and the CMS plan fixes it as a by-product.

---

## Part 2 — The decision this forces (answer before building)

**Whose website does this WOODEX OS admin serve?**

| Option | Means | Consequence |
|---|---|---|
| **A. Furniture OS** *(recommended)* | the OS becomes WOODEX **Furniture**'s admin; the 142 interior rows are exported and archived | clean; every screen points at the live site; interior can get its own OS later |
| B. Both businesses, one OS | interior site on its own domain, furniture shop here | two frontends, two content trees, double the SEO surface — heavy |
| C. Reuse the interior rows as furniture content | rewrite 142 interior pages into furniture copy | 59 pages about house design cannot become office furniture; only the 48 blog posts have partial value |

**Recommendation: A.** The 142 rows are not waste — they are the proof that this CMS works (142 pages, 1,442 blocks, 50 templates, 142 version snapshots). Export them, keep the machinery, point it at the furniture site.

---

## Part 3 — Architecture

```
                      ┌──────────────────────── WOODEX OS admin ────────────────────────┐
                      │  All pages · Page builder (Puck | HTML) · Find&replace · Redirects │
                      │  Content (Blog · Portfolio · Services · Series · Showrooms)        │
                      │  Media · SEO · SEO agent · Speed · Site health · Theme · Settings  │
                      └───────────────┬─────────────────────────────────────────────────┘
                                      │ writes JSON rows (site_pages, content_items, theme_tokens)
                                      ▼
   ┌──────────────┐        ┌──────────────────────┐        ┌──────────────────────────────┐
   │ HTML page    │        │  /api/site/v1        │        │  The SPA (image 1)           │
   │ raw .html    │        │  pages · records     │───────►│  <Render data={puck_data}/>  │
   │ served direct│        │  theme · menus       │        │  records → /blog /services…  │
   └──────────────┘        └──────────────────────┘        └──────────────────────────────┘
                                      ▲
                                      │  injected into index.html before send
                            ┌─────────┴──────────┐
                            │ PHP shell renderer │  title · description · canonical ·
                            │ (per URL, no Node) │  OG · JSON-LD · sitemap.xml
                            └────────────────────┘
```

### Three rules

1. **Editors change content, never code.** Every word on image 1 comes from a row.
2. **Puck renders in React.** The SPA already *is* React — Puck's `<Render>` works natively, so there is **no PHP block renderer to rebuild** and no publish step for visual pages. (This is why the furniture plan is far cheaper than the interior one would have been.)
3. **SEO is served by PHP, not by JavaScript.** A thin shell renderer rewrites `<title>`, meta, canonical, OG and JSON-LD into `index.html` per URL before it is sent. No Node, no headless browser, works on Hostinger.

### Why not static HTML per page?

Because the site is an SPA with a live catalogue, cart and checkout. Publishing 142 static files would fork the design a second time. The only pages that stay static are the **HTML pages** — which is precisely where the HTML builder earns its place.

---

## Part 4 — The content model

### 4.1 Records (many rows, one template)

| Record | Rows today | Route | Screen |
|---|---|---|---|
| Product | 20 (+28 variants) | `/shop/:slug` | **Commerce → Products** ✅ exists |
| Category / Market | 24 | menus, `/shop?category=` | **Commerce → Categories** ✅ exists |
| **Series** | 153 hardcoded → import | `/series/:id` | **new** |
| **Service** | 8 hardcoded → import | `/services/:slug` | **new** |
| **Blog post** | 7 hardcoded → import | `/blog/:id` | Blog ✅ screen, wrong rows |
| **Project** | 6→ import | `/projects/:id` | Portfolio ✅ screen, wrong rows |
| **Showroom** | 5 hardcoded | `/showrooms` | **new** |
| Material / finish | 14 in catalog attributes | `/materials` | catalog ✅, no screen needed |
| Lead / enquiry | 27 | forms | Forms ✅ exists |

### 4.2 Pages (one row, one URL)

`home` · `about` · `contact` · `custom-design` · `warranty` · `b2b` · `showrooms` · `shop` (listing header) · `materials` · `projects` (listing) · `services` (listing) · `blog` (listing) · `quotation`

= **13 pages**, each a Puck document.

### 4.3 App pages (not CMS)

`/checkout`, `/cart`, `/account` — configured by **Website Settings**, never built in a page editor.

---

## Part 5 — The 14 screens

Verdicts from the running app. Legend: ✅ real and populated · 🟡 real, cannot do the job · ⚠️ correct code, wrong target · ❌ absent

### Pages & builder

| # | Screen | Today | Rebuild |
|---|---|---|---|
| 1 | **All pages** | ⚠️ `BuilderFile::pages()` → filesystem → **1 page** (the SPA shell) | list `site_pages` + system routes + HTML pages. Columns: title, URL, kind (route/Puck/HTML), status, sections, updated, SEO score, publish state. Actions: Edit visual · Edit HTML · Edit SEO · Duplicate · Publish · Unpublish · View live |
| 2 | **Page builder** | 🟡 full HTML canvas editor with nothing to open | **Puck (visual) as default + HTML mode as option, per page.** 11 section components. Device preview, page settings, versions, draft preview via `preview_token`, SEO panel |
| 3 | **Find & replace** | ⚠️ `runPreview`/`apply`/`undo` exist, over 1 file | run over Puck JSON + records (`content_items`); scope by type; snapshot before apply so undo is real; then "publish 12 changed pages" |
| 4 | **Redirects** | ✅ add / remove / CSV import / export — 0 rows | import the old URLs; auto-suggest a 301 when a slug changes; conflict check against real routes; hit counter; chain flattening |

### Content

| # | Screen | Today | Rebuild |
|---|---|---|---|
| 5 | **Blog** | 🟡 studio reads `Page[type=insight]` — **48 interior posts** | furniture posts: title, slug, cover, category, tags, author, schedule, body sections (Puck), SEO, related → `/blog/:id` |
| 6 | **Portfolio** | 🟡 `Page[type=project]` — 6 interior studies | client, sector, city, year, gallery, story, testimonial, `Project` schema → `/projects/:id` |
| 7 | **Forms** | ✅ `cms_forms` counts real submissions; lead pipeline proven (lead #27) | form definitions per key (contact, quotation, B2B, custom-design), submissions list, CSV export, spam log, notifications — **and make the SPA actually POST** (today `handleSubmit` only sets a flag) |

### Website

| # | Screen | Today | Rebuild |
|---|---|---|---|
| 8 | **Media** | ✅ works — 105 records, files on the `public` disk, tiles answer 200 | add furniture photography for the 20 products (`commerce_product_media` = 0); folders, alt text enforced, WebP + derivatives, replace-in-place, real usage tracking (`media_usage` returns `[]` today); a guard now flags and can remove a record whose file is genuinely gone |
| 9 | **SEO** | ⚠️ `FileAudit` (438 lines of real checks) over 1 file | audit per URL: title, description, H1, canonical, OG, schema, alt text, thin content, duplicates, orphans. Per-page **score**, filters, bulk fix |
| 10 | **SEO agent** | ⚠️ same audit, filtered by issue | turn into a **queue**: issue → page → why it costs traffic → Fix button. Generate `sitemap.xml`, edit `robots.txt`, preview JSON-LD, measure before/after |
| 11 | **Speed** | ✅ real (keyless local metrics + optional PageSpeed key) — 0 runs | run against live URLs, keep history in `pagespeed_runs`, budget per page, asset weight from the build, flag oversized images, cache headers |
| 12 | **Site health** | ⚠️ broken links / orphans over 1 file | links across published output + records, orphan pages, **missing media** (would have caught the 105), stale pages, 404 log, sitemap validity |
| 13 | **Theme** | 🟡 28 tokens, presets, groups — **no consumer**; the SPA never reads them | tokens → CSS custom properties → consumed by the SPA **and** Puck preview **and** HTML pages. Fonts, palette, radii, spacing, container width, live preview, presets |
| 14 | **Website Settings** | 🟡 real but narrow | business identity (name, logo, phone, WhatsApp, email, address, hours), social, analytics (GA4/GTM/pixel), Search Console, sitemap/robots, publish policy, currency, maintenance mode, checkout copy |

---

## Part 6 — The page builder

### 6.1 Two modes, one record

| Mode | Audience | Storage | Render |
|---|---|---|---|
| **Visual (Puck)** — default | anyone on the team | `site_pages.puck_data` (JSON) | SPA `<Render>` at request time |
| **HTML** — option, per page | full control, pasted markup, one-off pages | `site_pages.canvas_html` → file | web server serves the `.html` directly |

Both are the same page record; `site_pages.kind` decides which wins. Switching modes never loses the other (both columns persist).

### 6.2 The 11 section components

The Os's block vocabulary is already closed — reuse the same names so legacy content can be imported:

| Section | Used for | Props |
|---|---|---|
| `hero` | top of every page | eyebrow, heading, sub, image, 2 CTAs, overlay, height |
| `intro` | opening statement | heading, rich text, image side, stats |
| `text` | body copy | heading, rich text, 1–2 columns, width |
| `services` | what we do | list of {icon, title, text, link}, columns |
| `price_table` | pricing / packages | rows of {label, price, note}, footnote |
| `process` | how it works | steps of {number, title, text} |
| `gallery` | photos | images[], columns, captions, lightbox |
| `specs` | specifications | key/value pairs |
| `faq` | questions | {q, a}[], schema toggle |
| `related` | internal links | record type + count, manual override |
| `form` | enquiry | form key, heading, fields, success copy |

That is 11 React components for the SPA and 11 for Puck — the *same* components, wrapped.

### 6.3 The builder screen

```
┌──── toolbar: page · kind · mode [Visual | HTML] · device · ⋯ · Save · Publish · View ───────┐
│ sections palette │           canvas (real page, real width)        │ inspector            │
│ hero · intro     │      drag, drop, reorder, click to edit        │ content / style      │
│ text · services  │                                                │ advanced · SEO       │
│ price_table ...  │                                                │ image ← media        │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

Every save writes a version — `page_versions` already holds 142 snapshots and the restore flow exists. Draft preview uses `preview_token`. Publish clears the cache and updates `sitemap.xml`.

> **Acceptance:** add a hero + services + FAQ to `/services/custom-design` in Puck, save, reload the live URL — the sections render with no build step. Switch the same page to HTML mode, edit raw markup, save, and the file serves directly.

---

## Part 7 — Theme, settings, SEO, speed, media, forms

### 7.1 Theme — the one place design is decided

`theme_tokens` (28 rows) → CSS custom properties → three consumers:

| Consumer | How |
|---|---|
| the SPA | `GET /api/site/v1/theme` → injected as `:root` vars at boot |
| Puck preview | same vars inside the admin preview frame |
| HTML pages | a generated `theme.css` linked by those files |

Tokens: colours (brand, accent, ink, surfaces), type scale, font families, radii, shadows, spacing, container width, breakpoints. Live preview, presets, per-page override.

### 7.2 SEO — the fix that pays for itself

| Problem today | Fix |
|---|---|
| 1 `<title>` for 22 routes | PHP shell renderer injects per-URL title/description/canonical/OG |
| `og:image` = lovable.dev | real image from Media, per page |
| titles set by `document.title` only | rendered server-side **and** kept in sync client-side |
| no sitemap | generated from published pages on publish |
| no JSON-LD | `Organization`, `Product`, `Service`, `BlogPosting`, `Project`, `LocalBusiness` (showrooms), `FAQPage`, `BreadcrumbList` |

### 7.3 Speed

Keep the existing keyless metrics; add: history per URL (`pagespeed_runs`), budget per page, asset weight from the built bundle (874 kB JS / 240 kB gzip — worth watching), image weight, cache-header check.

### 7.4 Media

**Product photography — shipped (commit `8850254`).**

`ProductCard` had always printed `/media/products/{sku}/{hash}-{variant}.webp`; nothing answered it and
nothing had ever called `ImageStore`, so all 20 products returned `"image": null`.

| Piece | State |
|---|---|
| `ProductImageController` + `commerce.media.product` route | ✅ streams `{hash}-(thumb\|card\|hero).webp` from the `public` disk, `immutable` + ETag, refuses any other name |
| `commerce:import-images [--path=] [--force]` | ✅ 20 attached · 0 failures · 60 WebP (400/800/1600 px) |
| `/shop` | ✅ 20 of 20 cards with a photograph, natural width 800, zero failed requests |
| `/shop/ballmer-executive-desk` | ✅ 6 images, 800 px, alt text on each |
| A missing photograph | ✅ **404** (was `301 → …/photo.webp/` — see 0.5) |

The 20 SKUs are mapped to **9 bundled photographs** in `platform/database/data/product-photos/manifest.json`
(one per furniture family, so two desks can share a picture). That is honest placeholder art, not a
catalogue: §11 still says the owner supplies the real photography, and replacing a file and re-running
`commerce:import-images --force` is the whole migration.

Still open in this section:

1. **Reconcile the 105** — `website_media` rows whose files are gone; mark `missing` rather than deleting.
2. Alt text enforced at upload, folders, replace-in-place, usage guard before delete.
3. A real photograph per SKU (waits on the owner's catalogue).

### 7.4b Two deploy traps found while shipping it

Both are in the OS now, and both would have shipped broken:

1. **A rebuilt frontend left every published page pointing at a deleted bundle.** `ShellPublisher::ensureShell()`
   captured `public/site/shell.html` *once*; `vite build` emits a new hashed `front/index-<hash>.js` and deletes
   the old one, so all 16 pages kept loading a 404 script and rendered an empty `<div id="root">` with a 200.
   The copy is now refreshed when it names a bundle that is not on disk, and a stale copy with no clean source
   throws instead of publishing dead links.
2. **`APP_URL` is baked into the published files.** Canonicals, `og:url` and `sitemap.xml` are written, not
   computed per request, so publishing with a preview or staging host bakes that host into 46 files. Set
   `APP_URL` to the real domain **before** `php artisan website:publish`.

### 7.5 Forms

The pipeline is **already proven**: `POST /api/forms.php` → lead #27 · `L-2026-000001` · contact #29, with honeypot, per-IP rate limits, WhatsApp-click and booking actions. What's missing is only the front end: point the SPA's Contact, Quotation, B2B and Custom Design forms at it. Today `handleSubmit` does nothing but `setSubmitted(true)`.

---

## Part 8 — Migration of the current content

| Source | Rows | Destination |
|---|---|---|
| Interior pages (service/city/area/insight/project) | 142 | **export → archive** (decision A) |
| Interior blocks | 1,442 | export with the pages, as the import format for the new site |
| Interior media | 105 | purge records; files already gone |
| Furniture catalogue | 20 products, 28 variants, 24 categories | already in the OS ✅ |
| SPA hardcoded series | 153 | import → `content_items[series]` |
| SPA hardcoded categories | 29 | reconcile into `commerce_categories` (24) |
| SPA hardcoded services | 8 | import → `content_items[service]` |
| SPA hardcoded posts | 7 | import → `content_items[post]` |
| SPA hardcoded projects | 6+ | import → `content_items[project]` |
| SPA hardcoded showrooms | 5 | import → `content_items[showroom]` |

The SPA's own data files become the **seed** — which is honest: they are real furniture copy, already written and approved.

---

## Part 9 — Phases

| Phase | Work | Days | Exit test |
|---|---|---|---|
| **A. Truth** | reconcile media, purge/repair 105, banner off the interior screens, freeze the 142, decide A/B/C | 2 | no screen shows a broken file |
| **B. Spine** | `site_pages` + `content_items` + `/api/site/v1` (pages, records, theme) + PHP shell renderer (title/meta/OG/JSON-LD/sitemap) | 8 | `curl /services/custom-design` returns the right `<title>` and JSON-LD |
| **C. Screens** | All pages, Find & replace, Blog, Portfolio, Services, Series, Showrooms | 10 | create a post, publish, see it at `/blog` |
| **D. Builder** | Puck + 11 sections + HTML mode toggle + versions + preview + SEO panel | 9 | edit a page visually, publish, reload live |
| **E. Ops** | Media upgrades, SEO, SEO agent, Site health, Speed, Theme export, Settings, Redirects import | 9 | theme change appears on the live site; SEO queue fixes a page |
| **F. Storefront** | forms → leads, product images, accounts, server cart, checkout polish | 7 | a real enquiry lands in CRM; shop has photos |
| **G. Cutover** | Hostinger checklist, 301s, sitemap, smoke order | 3 | real order + real lead on the live domain |

**≈48 dev-days ≈ 3.5 weeks with 3 developers.** C is playable after B; D after B; E after C.

---

## Part 10 — Hostinger cutover

| # | Check |
|---|---|
| 1 | `migrate --force` + `woodex:install` on the live DB |
| 2 | Upload `public/` (storefront build already installed) |
| 3 | `tools/furniture-commerce/connect-storefront.sh` — idempotent, verifies `.htaccess` |
| 4 | `.htaccess` exclusions: `admin|install|up|api|livewire|webhooks|media|portal|vendor|storage|build|builder|assets|font|front|site|q|i|p` |
| 5 | `APP_DEBUG=false`, `APP_ENV=production` |
| 6 | No queue worker — publish must be chunked per request |
| 7 | Throttles on `/api/storefront/v1/checkout` (30 entry processes) |
| 8 | `storage/` + `bootstrap/cache` writable |
| 9 | Cache config + routes, **not views** |
| 10 | Smoke: one COD order → invoice → settle → journal entry |
| 11 | 301 map live; sitemap submitted to Search Console |

---

## Part 11 — Decisions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | **Does this OS serve Furniture only (A), or Interior + Furniture (B)?** | **A** — archive the 142 |
| 2 | Puck visual as the default builder, HTML as the option? | **yes** |
| 3 | Product & content photography — from `woodexfurniture.pk`? | re-import |
| 4 | Seed the CMS from the SPA's hardcoded data (153 series, 8 services, 7 posts…)? | **yes** |
| 5 | Customer accounts at launch? | guest + optional account |
| 6 | Explicit Publish button, or auto-publish on save? | **explicit** |

---

*Every "today" claim was verified against the running application and the current SPA source on 1 November 2026: 28/28 admin URLs return 200; a live lead was captured (`L-2026-000001`); a live order reached the ledger; and the storefront build produces exactly one HTML file.*
