# Woodex Website CMS — the complete plan

**Status:** 1 November 2026. Written after the audit in `INTEGRATION-MASTER-PLAN.md`; the numbers in it were
measured against the running OS, not estimated.

This document answers three questions and then specifies all fourteen Website screens, one at a time: what is
there today, what is reused, what changes, and the test that proves it works.

---

## 0. Three answers, up front

### "The 142 pages are not the reimagined frontend. That is only v1 database rows."

Correct, and it is worse than "not the frontend" — they are the **whole interior site** and nothing else:

| What the 142 are | Count |
|---|---|
| `service` — interior design services (kitchen renovation, false ceiling, 3D visualisation…) | 59 |
| `insight` — the interior blog | 48 |
| `city` / `area` — SEO landing pages (DHA, Gulberg, Bahawalpur…) | 12 / 8 |
| `project` — interior case studies | 6 |
| `listing` | 3 |
| `about`, `booking`, `contact`, `estimator`, `home`, `legal` | 1 each |

Every row is stamped `archived_at`, `canvas_html` is empty on all of them, `puck_data` is null, and the HTML
files that used to render them were deleted with the v1 frontend. They are a **content archive**, kept in
`storage/app/private/archive/interior-pages-2026-11-01-050348.json` (1.98 MB, 1,442 blocks) and in
`page_versions` (one JSON snapshot per page, 7.6–11.1 KB each: `{title, excerpt, seo, blocks}`).

The reimagined storefront is a separate thing: `site_pages` (16), `content_items` (30), `commerce_products`
(20), rendered by the SPA and published as 67 static files. **No screen should ever present the 142 as the
site.** Where they still appear — the old HTML builder, the media library's imported photographs — they are
labelled as the archive (§2.2, §2.8).

### "Delete the v1 HTML frontend completely. The HTML builder stays in the page builder as an option."

The delete is done: `public/` holds the storefront's build and its 67 published files, the v1 markup is gone,
and `.htaccess` plus 137 generated `RewriteRule`s answer the old interior URLs with a 301 to their nearest
furniture equivalent. The rewrite is idempotent — `apply.sh` can run again without touching a thing.

The builder is **not** deleted. In the new plan it is one of two modes on one page record:

| Mode | Writes | For |
|---|---|---|
| **Visual** (Puck) — the default | `pages.puck_data` (JSON blocks) | The owner editing by drag and drop |
| **HTML** (the existing canvas editor) | `pages.canvas_html` | Hand-written markup, a pasted landing page, a one-off |

Both snapshot `page_versions` before a save and both publish through the same renderer, so a page can be
switched from HTML to visual and back without losing the file. See §4.

### "What is the plan?"

§2 specifies all fourteen screens, §3 the six content types behind them, §4 the builder, §5 the renderer that
has to exist first, §6 the sequence and the days.

---

## 1. The architecture, in one page

```
                      ┌─────────────────────────────────────────┐
   owner/edit  ──────▶│  Woodex OS admin  (/admin/website/*)    │
                      │  14 screens · 2 builders · 1 publish    │
                      └───────────────┬─────────────────────────┘
                                      │ writes
                                      ▼
                      ┌─────────────────────────────────────────┐
                      │  MySQL: pages · page_blocks · versions  │
                      │        site_pages · content_items       │
                      │        commerce_products · theme_tokens │
                      └───────────────┬─────────────────────────┘
                                      │ php artisan website:publish
                                      ▼
                      ┌─────────────────────────────────────────┐
                      │  public/<path>/index.html  (67 files)   │
                      │  title · meta · canonical · OG · JSON-LD│
                      │  + the SPA mount for the browser        │
                      └───────────────┬─────────────────────────┘
                                      │ served by Apache
                                      ▼
                            visitor / crawler
```

Four rules, unchanged from the integration plan:

1. **The database is the source of truth.** A file is an artefact of it. Nothing is edited only in `public/`.
2. **A URL is answered by a file.** No PHP render on the request path — this is what lets the site run on
   Hostinger with no queue worker and no node process.
3. **Publish is a step, and it says so.** The admin must show "source changed after the file was written" and
   offer one button. A silent divergence is the failure mode of every static-publishing CMS.
4. **The SPA owns interaction, the file owns the document.** Shop, cart, checkout, configurator and quotation
   are React; everything a crawler reads is in the file.

**Why not render dynamically?** Because it reintroduces the thing this migration deleted: a PHP process, a
theme cache, and a server that must be warm. The published file is 3–6 KB, cacheable forever, and provably
correct — `website:publish` reports 0 failures and the tests read the files back.

**Where publishing happens.** `php artisan website:publish` writes 67 files in ~1.2 s. On save, the admin may
publish **one page** (`--only=about`) so the button feels instant; the full build runs on demand, after an
import, and as a deploy step.

---

## 2. The fourteen screens

The table is the summary; each subsection is the specification.

| # | Screen | Today | Verdict |
|---|---|---|---|
| 2.1 | All pages | lists **1** file from `public/` | **rebuild** on `pages` |
| 2.2 | Page builder | HTML editor over generated files | **rebuild**: Puck + HTML mode |
| 2.3 | Find & replace | file-based string replace | **rebuild** on `pages` + `page_blocks` |
| 2.4 | Redirects | empty screen, redirects table doesn't exist | **rebuild** + backfill 141 |
| 2.5 | Blog | studio app on `pages[insight]` (48) | **reuse**, finish editor |
| 2.6 | Portfolio | studio app on `pages[project]` (6) | **reuse**, finish editor |
| 2.7 | Forms | counts only, 1 submission | **reuse** the pipeline, build the screen |
| 2.8 | Media | 105 imported interior photos, 0 product photos | **repair + rebuild** |
| 2.9 | SEO | audits HTML files | **rebuild** on the database |
| 2.10 | SEO agent | same audit, filtered | **rebuild** with actions |
| 2.11 | Speed | real, 0 runs recorded | **reuse**, add history |
| 2.12 | Site health | file checks over generated files | **rebuild** across DB + files |
| 2.13 | Theme | 28 tokens, nothing consumes them | **rebuild** the export |
| 2.14 | Website settings | real but narrow | **extend to the whole site's settings |

### 2.1 All pages — `/admin/website/pages`

**The problem.** `BuilderFile::pages()` walks `public/` and returns **one** page (`index.html`). The screen
therefore says the site has one page. It has 46 addresses and 142 archived ones.

**What it becomes.** One list of every URL the site answers, grouped by type, with the publish state of each:

| Column | Source |
|---|---|
| Title | `pages.title` / `site_pages.title` / `content_items.title` |
| Address | `/<slug>` + the file that answers it |
| Type | `pages.type` — home, service, location, insight, project, listing, legal, page |
| Blocks | `page_blocks` count |
| Edited | `updated_at` |
| File | **in sync** / **stale** / **missing** — `filemtime` vs `updated_at` |
| Actions | Edit (visual) · Edit HTML · Preview draft · Publish · Unpublish |

Filters: type, status, publish state, "has no content", "no SEO title". Bulk: publish selected, re-slug with a
301, retire.

**Reuses:** `pages-index.blade.php` layout, `x-admin.stat`, the publish command, `page_versions`.

**Acceptance:** the list shows 46 addresses; editing a title in the DB and reloading marks that row **stale**;
publishing it clears the mark and changes the live `<title>`.

### 2.2 Page builder — `/admin/website/builder`

**The problem.** The screen is a real HTML canvas editor, and what it opened was `warranty/index.html` — a file
written by `website:publish`, whose visible body is the crawler fallback (a heading, a lead and the site's nav).
Editing it changes nothing that survives the next publish. This is the single most misleading screen in the
admin, and it is the one the owner opened.

**What it becomes.** A builder with two modes on the same record:

```
/admin/website/builder?page=198&mode=visual   →  Puck, JSON in pages.puck_data
/admin/website/builder?page=198&mode=html     →  the existing editor, pages.canvas_html
```

- **Mode is per page** (`pages.builder = 'puck' | 'html'`), set at creation, switchable — switching keeps both
  representations and asks which one publishes.
- **The page picker is the database**, not `public/`. It lists `pages` by type with a search box; a page with no
  file yet is a draft, and its preview URL carries `preview_token`.
- **Save** writes the row and a `page_versions` snapshot, then offers **Publish this page** (incremental).
- **SEO panel** (already in the HTML builder) edits `pages.seo`: title, description, canonical, OG image,
  `schema_type`, robots. It writes into the rendered `<head>`.
- **Generated files are read-only here.** If someone opens `/admin/website/builder?path=about/index.html`, the
  screen says "this file is generated from the About page" and links to it.

**Reuses:** all of `BuilderApi` (`load/save/backups/restore/page_new/blocks_*`), `SaveHtmlFile` (conflict check,
script guard, 40 versions), `HtmlGuard`, `BlockLibrary`, `ThemeBridge`. The HTML mode is the current editor with
its file layer swapped for the record layer.

**Acceptance:** create a page in visual mode, add a hero and a text block, save, publish → `public/<slug>/index.html`
contains the hero in server-rendered HTML; switch to HTML mode, edit a string, save, publish → the string is in
the file; restore a version → the previous string returns.

### 2.3 Find & replace — `/admin/website/find-replace`

**The problem.** `SiteWideReplace` reads `BuilderFile::pages()` — one file — so a "replace across the site"
touches at most one page that will be overwritten anyway.

**What it becomes.** Search across `pages.title`, `pages.excerpt`, `page_blocks.data` (JSON), `pages.seo`.
Preview shows every match with its block and a diff; apply writes per page inside a transaction, snapshots
`page_versions`, and marks the pages stale. Undo restores the snapshot by run id.

Guards: dry run first; a match inside a script or style block is refused (`HtmlGuard`); replacing a URL offers to
create a redirect.

**Reuses:** `SiteWideReplace::runPreview/apply/undo`, the run history table.

**Acceptance:** a site-wide replace finds the same string in ≥3 pages, changes them, marks them stale, and undoes
cleanly.

### 2.4 Redirects — `/admin/website/redirects`

**The problem.** There is no `redirects` table and the screen says "No redirects yet". All 141 legacy URLs are
served by rules generated into `.htaccess` from `LegacyRedirects` — a **constant in code**, so the screen can
never show them and the owner can never add one.

**What it becomes.**

| Piece | Detail |
|---|---|
| Table `redirects` | `from`, `to`, `status` (301/302), `hits`, `last_hit_at`, `note`, `created_by` |
| Source | Seeded from `LegacyRedirects` (141 rows), imported by CSV, created when a slug changes |
| Screen | List with filters (has hits / never hit / conflicts), inline add, "test a path" box, CSV export/import |
| Enforcement | `website:publish` renders the table into the `.htaccess` block + `redirects.json`; direct hit counting via a 410 log parse |
| Safety | a rule whose `from` still resolves to a real page is flagged **shadowed** — files are answered before rewrites |

**Reuses:** the whole `.htaccess`/`redirects.json` writer, import command, `RedirectPublisher`.

**Acceptance:** add a redirect in the admin, publish, `curl -I` shows 301 to the target; the screen counts the
hit; deleting it and publishing makes the URL 404 again.

### 2.5 Blog — `/admin/website/blog`

**Today:** a studio JSON app over `pages` where `type = insight` — 48 real posts, list / edit / status / delete
all work through `StudioApi` (34 actions) and `StudioContent` (454 lines).

**What changes.** The screen stays; the editor gets the fields a blog needs and a way to publish:

- fields: title, slug, excerpt, body blocks, cover image, category, tags, author, published_at (schedule),
  SEO title/description/canonical
- draft preview through `preview_token`
- publish → `/insights/<slug>/index.html` with `Article` JSON-LD, og:image, and an entry in the sitemap
- the storefront reads the same rows (`content_items`, type `post`) — one list, two consumers

**Acceptance:** create a post in the admin, publish, the URL returns 200 with its `<title>`, its JSON-LD parses,
and it appears at `/blog` and in `sitemap.xml`.

### 2.6 Portfolio — `/admin/website/portfolio`

**Today:** same studio app over `pages[project]` — 6 projects.

**What changes:** gallery (multi-image, reorderable), client, location, year, services used, before/after pair,
and publish to `/projects/<slug>/index.html` with `CreativeWork`/`ImageGallery` JSON-LD. The project's images and
services become internal links to the matching service pages — the link engine for this already exists
(`LinkCityPagesToAreas`, `LinkEmptyServiceUrls`).

**Acceptance:** a project with 6 images publishes, the page carries `og:image`, and each service it names links to
that service's page.

### 2.7 Forms — `/admin/website/forms`

**Shipped 1 November.** The storefront's Contact and Quotation forms post to the bridge and the leads land in the
CRM, verified end to end in a browser:

| Form | Lead | Reference | What was stored |
|---|---|---|---|
| Contact | #1 | `L-2026-000001` | Ayesha Khan · `website_form` · detail `contact` · service "Executive desk bulk order" · message · landing `/contact` |
| Quotation | #2 | `L-2026-000002` | Bilal Ahmed · `website_form` · detail `quote` · company + the quote basket spelled out (2 items, PKR 104,000) |

`src/lib/api/enquiry.ts` is the only thing that posts; both forms show a sending state, the server's error
message when it fails, and the lead's reference only after the server confirms it. The bridge now reads `line`
so a furniture enquiry is booked on the furniture line (it was hard-coded to interior).

**Two seeders the sample database was missing** — `NumberSequenceSeeder` and `PipelineStageSeeder`. Without them
the first real enquiry answers 500 "Number sequence [lead] is not configured". `php artisan install` runs both
(`ProductionSeeder`); a database migrated by hand does not. Any fresh deploy must run the installer.

**What remains on this screen.**

1. **Wire the SPA** (Contact, Quotation, B2B, Custom Design) to `POST /api/forms.php`. This is the one item worth
   doing before anything else in this document.
2. Screen: one tab per form (contact, quote, b2b, custom design, estimator), with fields, recipients, the
   auto-reply template, and the submission list (name, phone, page, time, spam score) with CSV export.
3. Spam log and blocklist; a test button that posts a fake submission end to end.

**Acceptance:** submit the contact form on the live site → a lead appears with its reference, the source page and
the message; the admin lists it within the same request.

### 2.8 Media — `/admin/website/media`

**Today:** 105 rows, **all 105 files present**, every one imported from the retired interior site
(`folder = imported`) — and none of them on the storefront. The 20 product photographs live in a different table
(`commerce_product_media`) and were invisible here. The screen therefore showed a wall of villas and kitchens.

**What changed on 1 November (shipped).** The screen now opens on **Product photography** — the 20 photographs the
shop actually shows, linked to their products — and the 105 imported images are behind one checkbox, labelled as
the archive.

**What remains.**

- **Upload pipeline:** convert to WebP (400/800/1600), strip EXIF, keep the original, store under
  `website/YYYY/MM`, deduplicate by hash.
- **Alt text** is enforced on upload and written into the published file (the current `PageImageAlt` writes into
  files that `publish` overwrites — it must write into the record instead).
- **Usage:** `media_usage` returns `[]` today. It must answer which pages and blocks reference a file, and block
  deletion while it is in use.
- **Folders, replace-in-place, bulk alt from filename.**

**Acceptance:** upload a JPEG, it appears as a WebP with `alt` required; using it on a page and publishing puts
its `alt` in the file; trying to delete it warns and links to the page.

### 2.9 SEO — `/admin/website/seo-overview`

**Today:** `FileAudit` reads `public/**/*.html` and reports title length, description, H1, canonical, schema. It
is measuring the *output*, which is honest — but it cannot tell you which block of which page produced a bad
title, and it cannot fix anything.

**What it becomes.** A `PageAudit` over the database that runs the same rules **plus** the ones only the record
can answer:

| Check | From |
|---|---|
| title / description length, presence | `pages.seo` |
| duplicate titles across the site | `pages` group by |
| H1 count, thin content, keyword in first paragraph | `page_blocks` |
| internal links & orphans | block link graph |
| image alt text | block media refs |
| canonical, OG, schema type | `pages.seo`, `schema_type` |
| redirect chains, 404s | `redirects`, server log |

Site score, per-page score, filters by issue, and **Fix** links that open the builder at the offending field.

**Acceptance:** a page with a 90-character title is flagged; fixing it in the builder and republishing clears the
flag; two pages with the same title are flagged as duplicates.

### 2.10 SEO agent — `/admin/website/seo`

**Today:** the same `FileAudit`, filtered by issue code. Green ticks over generated files.

**What it becomes.** The action queue on top of §2.9: each issue with a one-click fix where a fix is mechanical
(generate a title from the H1, trim a description, add alt from the product name, add the missing internal link),
a diff before applying, and a history of what was changed by the agent versus by a person. Plus **sitemap.xml**
regeneration, a **robots.txt** editor, and a **structured-data preview** (the exact JSON-LD a URL will ship).

**Reuses:** `CheckSeoHealth`, `AddMissingCallToActions`, `LinkEmptyServiceUrls`, `LinkCityPagesToAreas`.

**Acceptance:** run the agent on a thin page, accept the suggested title and description, publish, and the
audit's finding count drops by exactly that page's issues.

### 2.11 Speed — `/admin/website/speed`

**Today:** real but empty — `google_api_key` is stored encrypted, keyless metrics work, `pagespeed_runs` has 0
rows. It only measures when someone presses the button.

**What it becomes.** Scheduled weekly runs per published URL, history charts, a budget per page (JS kB, image kB,
LCP), asset-weight table computed from the built bundle (874 kB JS / 240 kB gzip today — the number worth
watching), image weight per page, and a cache-header check against the live host.

**Acceptance:** run it against the preview, get 67 rows, and a page over budget is listed with the assets that
made it heavy.

### 2.12 Site health — `/admin/website/health`

**Today:** file checks over the generated files.

**What it becomes.** A cross-store health check:

- broken internal links (DB blocks + published HTML)
- orphan pages (no inbound link)
- pages whose source is newer than their file (the **stale** list from §2.1)
- redirects pointing at 404s, chains longer than one hop
- products without a photograph, records without a title, blocks with an empty media ref
- sitemap matches the published files exactly (67 ↔ 66 + checkout)
- the 404 page is reachable and the fallback is off

**Acceptance:** break a link in a block → health names the page and the block; republish → clean.

### 2.13 Theme — `/admin/website/theme`

**Today:** 28 tokens in `theme_tokens`, with a builder that saves them — and **no consumer**. The storefront has
its palette in `src/index.css`; the published files use the shell's CSS.

**What it becomes.** The tokens are the single source for both surfaces:
`theme_tokens` → CSS custom properties → `public/front/theme.css` (imported by the SPA build and by every
published file). Changing a token and publishing re-skins the whole site without a rebuild. Plus font pairing,
radii, spacing scale, and a live preview of the actual storefront inside the admin.

**Acceptance:** change `--wx-primary`, publish, the storefront and all 67 files use it; reload shows no other
colour.

### 2.14 Website settings — `/admin/website/settings`

**Today:** a real screen with a few settings; the rest of the site's configuration is in `config/` and
`settings` scattered.

**What it becomes.** One place for: business identity (name, logo, phone, WhatsApp, email, address, hours, map),
social links, analytics (GA4/GTM/Meta pixel — injected at publish), search-console verification, canonical base
URL (this is what `APP_URL` bakes into 67 files — it belongs on this screen with a warning), publish behaviour
(auto-publish on save, incremental vs full), currency and units, checkout copy, maintenance mode and its message.

**Acceptance:** change the phone number, publish, every file shows it; change the canonical base and the sitemap
follows.

---

## 3. The content types behind the screens

| Type | Rows today | Screen | Public URL | Ships |
|---|---|---|---|---|
| **Pages** (home, about, contact, legal) | 6 | All pages | `/`, `/about`… | static page |
| **Services** | 59 archived | **new** Content → Services | `/services/<slug>` | slug — `pages.type = service` |
| **Locations** | 20 archived (12 city + 8 area) | **new** Content → Locations | `/<city>-<service>` | `LocalBusiness` schema, map |
| **Blog posts** | 48 archived | Blog | `/insights/<slug>` | `Article` |
| **Projects** | 6 archived | Portfolio | `/projects/<slug>` | `ImageGallery` |
| **Materials** | 14 (catalog attributes) | (catalog) | `/materials` | read-only page, already API-wired |

**The important consequence:** the 142 archived rows are the *shape* of the content model the OS needs — a
service page, a city page, an insight, a project. The reimagined site has 7 services and 6 posts in TypeScript.
The migration is not "delete 142 rows"; it is **bring the 142 into the new model** (one block set, one renderer,
one publish) so the owner keeps a 59-service SEO surface instead of losing it.

That is the largest single piece of content work in this plan, and it is why `page_blocks` (1,442 rows, 15 per
page, already JSON) is the asset worth keeping.

---

## 4. The page builder in detail

**One record, two representations, one renderer.**

```
pages
 ├─ builder = 'puck'  →  puck_data   { content: [ {type:'hero', props:{…}}, … ], root }
 └─ builder = 'html'  →  canvas_html  "<section>…</section>"

PageRenderer::render($page)  →  either path produces the same HTML contract
                              →  Blade partials for the 11 sections
```

**The 11 sections** (from the plan's Part 6): hero, split text + image, feature list, gallery, pricing/table,
testimonial, FAQ, CTA band, stats strip, logos strip, rich text. Each is a Blade partial + a Puck component
that share one props schema, so a block added in the visual builder and a block typed in HTML mode render
identically.

**What the HTML mode keeps.** Everything the current editor does: CodeMirror, block library, per-device styles,
global header/footer, undo/redo, image picker, SEO analyser, 40 versions and restore. Only its storage moves
from `public/**/*.html` to `pages.canvas_html`.

**Safety.** `HtmlGuard` still refuses `<script>` in block content; `SaveHtmlFile`'s conflict check survives as a
`puck_version`/mtime check so two tabs cannot silently overwrite each other.

---

## 5. What has to exist before any screen can be finished

**The renderer.** `SiteRouter` says it plainly: *"a page is a file"*, and the DB renderer, the Blade layout and
the 20 section views were deleted by the owner on 21 October. Today `website:publish` can render `site_pages` and
`content_items` into shells — but not a `pages` row with blocks, because there is no block → HTML layer.

So the order is:

1. `PageRenderer` — blocks to HTML, 11 section partials, one layout with the `<head>` contract
   (title, description, canonical, OG, JSON-LD, hreflang).
2. `website:publish` learns to render `pages` rows (with `--only` for one page).
3. Only then does a screen's "Publish" button mean anything.

Everything else — media, redirects, forms — is independent and can ship in parallel.

---

## 6. Sequence and effort

| Phase | Work | Days | Exit test |
|---|---|---|---|
| **0. Renderer** | `PageRenderer`, 11 partials, publish a `pages` row, incremental publish, stale detection | 5 | a DB page renders to `public/` and the audit sees it |
| **1. Screens that lie** | All pages on `pages`; builder opens a record; media (done) + upload pipeline; redirects table | 6 | no screen reports "1 page" or "No redirects yet" |
| **2. Content that is missing** | Services, Locations; import the 142 into the new model; blog & portfolio editors finished | 9 | a service and a city page publish with schema and internal links |
| **3. Builder** | Puck + 11 components, mode switch, versions, preview, SEO panel | 9 | edit visually, publish, reload live |
| **4. Ops** | SEO on the DB, SEO agent actions, Site health, Speed history, Theme export, Settings | 8 | theme change re-skins 67 files; agent clears a finding |
| **5. Storefront gaps** | forms wired, product imagery per SKU, accounts, cart, checkout polish | 7 | a real enquiry lands in the CRM; a real order in the ledger |
| **6. Cutover** | `APP_URL`, migrate, upload, `.htaccess`, sitemap, smoke | 3 | real order + real lead on the live domain |

**≈47 dev-days.** Phases 0→1 are the ones that make the admin honest; 2→3 make it useful; 4→6 make it a launch.

---

## 7. What is intentionally **not** in this plan

- **No headless CMS split.** One Laravel app, one database, one deploy.
- **No runtime PHP for public pages.** The file is the page.
- **No revival of the interior frontend.** Its rows stay archived as content and as redirect sources.
- **No silent auto-publish.** Publishing is a keystroke, and the stale badge makes sure nobody forgets it.

---

## 8. Decisions needed

| # | Question | Default if unanswered |
|---|---|---|
| 1 | Do the 59 interior services come across as *furniture* services (rewritten), or stay archived? | rewritten — the SEO surface is the asset |
| 2 | Do the 20 location pages come across as furniture showroom/service areas? | yes, `LocalBusiness` schema |
| 3 | Puck as the visual builder, HTML as the option? | yes |
| 4 | Auto-publish on save, or an explicit button? | explicit button, stale badge |
| 5 | Real product photography before launch? | yes — the 9 bundled photos are honest placeholders |
| 6 | Are the 48 interior blog posts migrated to the furniture journal, or rewritten? | migrated, tagged `interior` |
