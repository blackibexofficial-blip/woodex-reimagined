# WOODEX Furniture — Website CMS Master Plan

**14 admin screens · page builder · theme · settings · SEO · speed · media · blog · portfolio · services · materials**

| | |
|---|---|
| **Scope** | The Website half of WOODEX OS, rebuilt to serve the **reimagined** storefront |
| **Screens** | Pages & builder (4) · Content (3) · Website (7) — all 14 already exist, all answer `200` |
| **Rule** | **Reuse what is already there.** Every screen below is an improvement of a working component, not a new build |
| **Hosting** | Hostinger shared — static HTML out, no Node at runtime, no Redis |
| **Companion** | `INTEGRATION-MASTER-PLAN.md` — the runtime audit and evidence behind every claim here |
| **Date** | 1 November 2026 |

---

## Part 0 — Three answers first

### 0.1 "Are the 142 pages the reimagined frontend?"

**No.** They are the **v1 site's database rows**, and they are not the frontend in any sense.

| | The 142 pages | The reimagined frontend |
|---|---|---|
| What it is | 142 rows in `pages` + 1,442 `page_blocks` | a React SPA, 22 routes |
| Where it lives | SQLite/MySQL | `platform/public/index.html` + `public/front/index-*.js` |
| Rendered by | nothing (its HTML files were deleted) | Vite build, served by the web server |
| Status | **stranded content** | **live at `/`** |

The SPA's pages (`/shop`, `/projects`, `/blog`…) are React components. The 142 rows are *content* — service copy, blog text, city pages — that used to be written into HTML files. Delete one and you lose nothing visual; delete the other and the site disappears. They are different layers that happen to share the word "page".

### 0.2 "The v1 HTML frontend is deleted, but keep the HTML builder as an option"

**Agreed, and that is exactly how it will be built.**

- **Deleted (already done):** 141 page directories + root `index.html` — the v1 *output*. Nothing renders them again.
- **Kept:** the HTML **builder** — `BuilderApi` (`load`, `save`, `backups`, `restore`, `page_new`, `blocks_*`, theme) and the canvas editor at `/admin/website/builder`. It is not deleted. It becomes **one of two modes** on the page builder:

| Mode | For | Writes to |
|---|---|---|
| **Visual (Puck)** — default | normal content editing, drag and drop | `pages.puck_data` |
| **HTML (existing canvas)** — option, per page | full control, pasted markup, one-off landing pages | `pages.canvas_html` |

Both are published by the same renderer into `public/<path>/index.html`. The `pages` table already has every column this needs: `builder`, `puck_data`, `puck_version`, `canvas_html`, `preview_token`.

### 0.3 "Plan the existing OS admin for the reimagined system"

That is Parts 2–6. Every one of the 14 URLs gets: what exists, what is reused, what changes, and a one-line acceptance test.

---

## Part 1 — The architecture this plan serves

```
        EDIT (admin)                        PUBLISH                        SERVE
   ┌──────────────────────┐        ┌───────────────────────┐      ┌──────────────────────┐
   │ Puck visual builder  │──┐     │ PHP block renderer    │      │ static HTML          │
   │ HTML canvas builder │──┼───► │ pages + page_blocks   │ ───► │ public/services/x/…  │
   │ Studio (blog/…)      │──┘     │ → index.html per page │      │ 0 PHP, 0 Node        │
   └──────────────────────┘        └───────────────────────┘      └──────────────────────┘
            │                                                              ▲
            │ writes rows                                                  │ same rows
            ▼                                                              │
   ┌──────────────────────┐        ┌───────────────────────┐      ┌──────┴───────────────┐
   │ pages · media · theme│        │ /api/storefront/v1    │ ───► │ React SPA            │
   │ commerce_*           │        │ catalog · content     │      │ /shop /checkout /…   │
   └──────────────────────┘        └───────────────────────┘      └──────────────────────┘
```

Three rules that keep it honest:

1. **The database is the source.** No content exists only in a file.
2. **Publishing is a step, never a request-time fallback.** A missing file 404s — the October bug (a row shadowing a file) cannot return.
3. **One page record, two editors.** Puck and HTML write the same row; the renderer reads whichever is set.

### 1.1 Why the renderer is cheap: there are only 11 block types

| Block | Count | Block | Count |
|---|---|---|---|
| `intro` | 399 | `process` | 76 |
| `text` | 202 | `gallery` | 61 |
| `form` | 143 | `related` | 52 |
| `hero` | 142 | `specs` | 28 |
| `faq` | 140 | | |
| `services` | 121 | **total** | **1,442** |
| `price_table` | 78 | | |

And `page_templates` (50) already declares how they compose per page type — *"Service page — full: hero, intro, what is delivered, how it runs, specifications, photos, questions and the enquiry form"*.

**So the renderer is 11 Blade partials, and Puck is 11 React components mapped to those same partials.** That is the whole build. Not a framework.

---

## Part 2 — Pages & builder

### 2.1 All pages — `/admin/website/pages`

| | |
|---|---|
| **Today** | `BuilderFile::pages()` reads the filesystem → shows **1** page (the SPA shell). 142 DB pages invisible |
| **Reuse** | the screen's whole design: search, section filter, counts, retire action, dark layout |
| **Change** | swap the data source from `BuilderFile` to `Page::query()`. That is a one-class change — `PagesIndex::render()` already builds exactly this shape |

**The rebuilt screen**

| Column | Source |
|---|---|
| Title | `pages.title` |
| URL | `pages.slug` (canonical, trailing slash) |
| Type | service · city · area · insight · project · page |
| Status | draft / scheduled / published |
| Blocks | `page_blocks` count |
| **Published** | `in sync` · `stale` (source edited after publish) · `never published` |

**Actions:** Edit (visual) · Edit HTML · Edit SEO · Duplicate · Publish · Unpublish · Delete · View live.
**Filters:** type, status, publish state, section, search.
**Counts:** 142 pages · 6 types · **142 published · 0 draft** · 0 stale (nothing published yet) — the numbers a page list exists to answer.

> **Acceptance:** editing a title in the admin marks the row `stale`; Publish turns it `in sync` and `curl /services/<slug>` shows the new title.

---

### 2.2 Page builder — `/admin/website/builder`

| | |
|---|---|
| **Today** | a real HTML-canvas editor (`load`, `save`, `backups`, `backup_get`, `restore`, `page_new`, `media`, `theme_get`, `blocks_list/usage/save/delete/sync/import`) with nothing left to open |
| **Reuse** | **all of it.** The API, the page list, the version/backup system, the section library, the theme bridge |
| **Change** | add Puck as the visual mode; keep HTML as the option |

**Screen layout**

```
┌──────────── toolbar: page · mode [Visual | HTML] · device · Save · Publish · ⋯ ────────────┐
│ blocks palette  │            canvas                     │  inspector                     │
│ ─────────────   │  ────────────────────────────────     │  content / style / advanced    │
│ hero            │   the page, live, at real width       │  props of the block            │
│ intro           │                                       │  + per-page SEO panel          │
│ text            │                                       │  + image picker (media)        │
│ services        │                                       │                                │
│ price_table     │                                       │                                │
│ process         │                                       │                                │
│ gallery         │                                       │                                │
│ specs           │                                       │                                │
│ faq             │                                       │                                │
│ related         │                                       │                                │
│ form            │                                       │                                │
└─────────────────┴───────────────────────────────────────┴────────────────────────────────┘
```

**Visual mode (Puck)**

| Feature | Detail |
|---|---|
| Components | the 11 block types above, each with the props the existing blocks already carry |
| Responsive | mobile / tablet / desktop switch, per-breakpoint props |
| Page settings | title, slug, template, parent, status, canonical, OG image, schema type |
| Versions | every save writes `page_versions` — the table already holds 142 snapshots |
| Draft preview | `pages.preview_token` → `/services/x?preview=<token>` renders the draft |
| Publish | one button → renderer writes `index.html`, clears cache, logs the version |

**HTML mode (existing canvas)** — kept exactly as it is: click any element, edit text or HTML, quick styles, save-as-block, export HTML/JSON, backup and restore. Selectable **per page** via `pages.builder = 'html'`.

> **Acceptance:** create a service page from the "Service page — full" template in Puck, publish, and the static HTML contains all 11 block types; the same page opened in HTML mode edits the same record.

---

### 2.3 Find & replace — `/admin/website/find-replace`

| | |
|---|---|
| **Today** | `runPreview` / `apply` / `undo` already implemented, but over files → 1 file |
| **Reuse** | the whole three-step UX (preview → apply → undo) and `SiteWideReplace` |
| **Change** | point it at `pages` + `page_blocks` JSON instead of `public/*.html` |

**Rebuilt:** search term → matches grouped by page and block, with context and a count; scope by type (services only, insights only…); case/whole-word/regex; apply writes a `page_versions` snapshot first, so **undo is real**; then mark affected pages `stale` and offer "Publish 12 changed pages".

> **Acceptance:** replace "Woodex Interior" → "WOODEX Furniture" across 59 service pages, preview shows 59 matches, apply, undo restores all 59.

---

### 2.4 Redirects — `/admin/website/redirects`

| | |
|---|---|
| **Today** | ✅ works — add, remove, CSV import, CSV export. 0 rows |
| **Reuse** | everything |
| **Change** | fill it, and make it defend itself |

**Additions**

| Feature | Why |
|---|---|
| Import the 141 v1 URLs | the old site's addresses must not 404 on cutover |
| Auto-suggest on slug change | renaming a page offers a 301 from the old slug — the single most common SEO break |
| Conflict check | refuse a redirect that shadows a real route or a published page |
| Test a path box | type `/about-us` → "301 → `/about/`" |
| Hit counter | shows which 301s still earn traffic, so they can be retired |
| Chain flattening | A→B→C collapses to A→C |

> **Acceptance:** import 141 rows, `curl -I /old-url` returns `301` to the right target, and a redirect to a non-existent page is refused.

---

## Part 3 — Content

### 3.1 The gap you named: services, locations, projects

| Content type | Rows | Screen today | Screen needed |
|---|---|---|---|
| Service pages | **59** | ❌ none | new — Content → Services |
| City pages | **12** | ❌ none | new — Content → Locations |
| Area pages | **8** | ❌ none | new — Content → Locations |
| Blog posts (`insight`) | **48** | ✅ Blog | rebuild editor |
| Projects (`project`) | **6** | ✅ Portfolio | rebuild editor |
| Singletons (home, about, contact, booking, estimator, legal) | 6 | ❌ none | All pages → Pages |
| Materials | 14 (catalog attribute) | ❌ none | **not a CMS type** — see 3.4 |

`StudioContent::TYPES` declares only `post` and `study`. Adding the other three is the same class, three more entries.

### 3.2 Blog — `/admin/website/blog`

| | |
|---|---|
| **Today** | studio lists the 48 posts, saves, publishes, unpublishes, deletes — real, versioned |
| **Reuse** | `StudioContent` (`listing`, `get`, `save`, `setStatus`, `delete`, `publish`), the studio shell, the AI-ready editor field |
| **Improve** | → a proper article editor |

**Editor:** title, slug, excerpt, cover image (media), kicker/category, tags, author, publish date (scheduling), body blocks (Puck), SEO panel, related posts, preview token.
**List:** status, author, updated, views, SEO score; filters and search.
**Publish:** → `/insights/<slug>/index.html` with `BlogPosting` schema.

### 3.3 Portfolio — `/admin/website/portfolio`

Same machinery, different fields: client, sector, city, year, services used, gallery blocks, before/after, testimonial, `Project` schema. → `/projects/<slug>/index.html`.

### 3.4 Services & Locations — the 116 pages with no screen

**Services (59)** — title, slug, summary, hero image, deliverable blocks, process, price table, FAQs, gallery, related services, enquiry form, `Service` schema, internal links to the city pages where it is offered.

**Locations (12 city + 8 area)** — city name, province, areas covered, local intro, services offered there, map, reviews, `LocalBusiness` schema, and cross-links both ways.

> Two Actions already in the codebase do exactly this linking: **`LinkCityPagesToAreas`** and **`LinkEmptyServiceUrls`**, plus **`AddMissingCallToActions`** and **`CheckSeoHealth`**. The internal-linking engine is written — the screens are what's missing.

**Materials** is **not** a CMS content type. It is a catalog attribute — 14 real materials and finishes live in `commerce_attribute_options`, served by `GET /api/storefront/v1/materials`, and the storefront's Materials page is **already wired to it**. The only work is making that data real, not building a screen.

> **Acceptance:** create a city page, publish, and `curl /lahore/` returns the city HTML with `LocalBusiness` JSON-LD and links to the services offered.

---

## Part 4 — Website operations (7 screens)

### 4.1 Media — `/admin/website/media`

| | |
|---|---|
| **Today** | upload / alt / delete all work; **105 rows, 0 files — every thumbnail broken** |
| **Reuse** | `MediaLibrary` component, `BuilderMedia`, the `website_media` table |
| **First job** | reconcile 105 rows against disk: re-import from the live site, or mark `missing` |

**Improvements:** folders, search, alt text enforced on upload, WebP + responsive derivatives (imagick/gd are on Hostinger), replace-in-place, **usage tracking** (`media_usage` returns `[]` today — make it real so nothing is deleted while in use), bulk upload, drag order for galleries.

### 4.2 SEO — `/admin/website/seo-overview`

| | |
|---|---|
| **Today** | `FileAudit` (438 lines) — real, thorough checks, run against 1 file |
| **Reuse** | the checks themselves |
| **Change** | read `pages`, not `public/` |

Checks that survive unchanged: missing title, title length, missing description, description length, H1 count, duplicate titles, canonical, alt text, thin content, orphan pages, redirect targets.
New: per-page **score**, filters by issue and type, bulk fix, sitemap preview.

### 4.3 SEO agent — `/admin/website/seo`

| | |
|---|---|
| **Today** | the same audit, filtered by issue code |
| **Change** | turn a list into a queue |

Per issue: the page, the problem, why it costs traffic, and a **Fix** button that opens the page's SEO panel. Plus: generate `sitemap.xml` from published pages, edit `robots.txt`, preview structured data, and a "before/after" count so the work is measurable.

### 4.4 Speed — `/admin/website/speed`

| | |
|---|---|
| **Today** | ✅ real — keyless local metrics (TTFB, bytes, cached page size) plus optional Google PageSpeed key; 0 runs recorded |
| **Improve** | run against **published URLs**, keep history in `pagespeed_runs`, set a budget per page, break down asset weight from the built files, flag oversized images, check cache headers |

### 4.5 Site health — `/admin/website/health`

Rebuilt on published output + DB: broken internal links, orphan pages, redirect loops, **missing media** (would have caught the 105), **stale pages** (source newer than file), 404 log from the web server, sitemap validity. `rescan` already exists.

### 4.6 Theme — `/admin/website/theme`

| | |
|---|---|
| **Today** | 🟡 28 tokens, presets, groups, reset — **no consumer**; the SPA never reads them |
| **Change** | make it the one place colour and type are decided, for **both** surfaces |

`theme_tokens` → CSS custom properties → (a) exported into the SPA build, (b) emitted into every published page. Fonts, palette, radii, spacing, shadows, container width, dark values. Live preview, presets, per-page override.

### 4.7 Website Settings — `/admin/website/settings`

| | |
|---|---|
| **Today** | 🟡 real but narrow |
| **Change** | the single record both surfaces read |

Business identity (name, logo, phone, WhatsApp, email, address, hours) · social links · analytics (GA4, GTM, Meta pixel) · Search Console verification · sitemap & robots · publish settings (auto-publish, preview token lifetime) · currency and units · maintenance mode · checkout copy.

---

## Part 5 — What is reused, what is written

| Screen | Reuse | Write |
|---|---|---|
| All pages | screen, filters, retire | data source swap |
| Page builder | canvas editor, API, versions, section library | Puck mode + 11 components |
| Find & replace | 3-step UX, `SiteWideReplace` | DB adapter |
| Redirects | **all** (CRUD + CSV) | import 141 rows, conflicts, counter |
| Blog | `StudioContent`, studio shell | article editor, scheduling, publish |
| Portfolio | same | project fields, publish |
| Forms | `cms_forms`, lead pipeline | form builder, submissions, export |
| Media | component, table | reconcile 105, usage tracking, derivatives |
| SEO ×2 | `FileAudit` checks | DB source, scoring, fix queue, sitemap |
| Speed | **all** | history, budgets, asset breakdown |
| Site health | checks, `rescan` | DB + 404 log + stale detection |
| Theme | tokens, presets | CSS export to both surfaces |
| Settings | settings store | full settings model |
| **New:** Services, Locations | `Page`, `StudioContent`, linking Actions | 3 screens |
| **New:** renderer | 1,442 blocks, 50 templates | 11 Blade partials + publisher |

**Nothing here starts from zero.** The largest unknown — the content renderer — is 11 partials because the block vocabulary is already closed.

---

## Part 6 — Phases

| Phase | Work | Dev-days | Exit test |
|---|---|---|---|
| **A. Truth** | Media reconcile; banner on file-based screens; freeze the stranded 142 | 3 | no screen shows a broken file |
| **B. Spine** | 11 block partials + publisher (DB → `public/<path>/index.html`); 50 templates wired | 8 | publish → static HTML, 0 PHP served |
| **C. Screens** | All pages (data swap), Find & replace (DB), Services, Locations, Blog, Portfolio | 10 | 142 pages editable, publishable |
| **D. Builder** | Puck + 11 components + HTML-mode toggle + versions + preview token | 8 | create, publish, edit in both modes |
| **E. Ops** | SEO ×2, Site health, Speed, Media upgrades, Theme export, Settings, Redirects import | 9 | SEO queue fixes a page; theme changes both surfaces |
| **F. Storefront** | Contact form → leads; product images; content API; accounts | 7 | enquiry lands in CRM; shop has photos |
| **G. Cutover** | Hostinger checklist, 301s, sitemap, smoke order | 3 | real order + real lead on the live domain |

**~48 dev-days ≈ 3.5 weeks with 3 developers**, delivered in that order — C is playable after B, D after B, E after C.

---

## Part 7 — Decisions

| # | Question | Default |
|---|---|---|
| 1 | Keep the 142 pages' copy? | **keep and republish** — 127 SEO pages of real content |
| 2 | Puck visual as default, HTML as option? | **yes** |
| 3 | Product & content photography source | re-import from `woodexfurniture.pk` |
| 4 | Publish automatically on save, or explicit Publish button? | **explicit** — a publish is a build |
| 5 | Customer accounts at launch? | guest + optional account |

---

*Every current-state claim in this document was verified against the running application on 1 November 2026. Evidence and the full 28-screen verdict table are in `INTEGRATION-MASTER-PLAN.md`.*
