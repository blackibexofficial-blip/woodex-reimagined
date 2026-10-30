# Puck Studio — Replacing the File-Based Frontend (v1)

**Library:** [`puckeditor/puck`](https://github.com/puckeditor/puck) · `@puckeditor/core` **0.24.0** · MIT · 13.5k ★
**Replaces:** the "frontend v1" system — 142 static HTML files edited as raw documents.
**Scope:** **Page Builder** and **Content** modules. Website tools (Media, SEO, Speed, Site health, Theme, Settings) stay.

---

## 1. Why replace it (measured, not opinion)

| Today | Consequence |
|---|---|
| Every public page is `public/<path>/index.html` — `SiteRouter` states *"A page is a file"* | A page cannot be data-driven; prices, products and stock can never live inside one |
| The builder edits the **whole HTML document** (`SaveHtmlFile`, 3 MB ceiling, hash-conflict guard, editor-markup guard) | Every edit is a code change to production; a stray `<div>` breaks the layout; no component contract |
| Blog/Portfolio publish by writing HTML shells (`ArticleFile`) | The `pages`, `page_blocks`, `content_entries` tables exist but are **dead weight** |
| The DB renderer was deleted on 21 Oct 2026 | There is no structured path to build a product page, a landing page or a campaign |
| One page = one file | No shared blocks, no reuse across the 54 specialist pages, no way to add a block once and have it everywhere |

**Target:** pages are **JSON documents** (Puck) rendered by **typed PHP blocks** that can bind to live OS data.

---

## 2. Architecture on shared hosting

```
┌─────────────────────────────┐         ┌──────────────────────────────────────┐
│ Puck Studio (React SPA)     │  HTTP   │ Reimagin OS (Laravel 13 / PHP 8.4)   │
│ /admin/studio  (full page)  │ ──────▶ │ • existing session + permissions     │
│ • @puckeditor/core editor   │         │ • page/draft/version CRUD            │
│ • block configs (TS)        │ ◀────── │ • media library, preview tokens      │
│ • iframe preview            │         │ • publish → flush cache              │
└─────────────────────────────┘         └───────────────┬──────────────────────┘
                                                        │ Puck JSON
                                        ┌───────────────▼──────────────────────┐
                                        │ PHP renderer (Blade block registry)  │
                                        │ GET /{path}/ → full HTML, no JS      │
                                        │ binds product/category/FAQ data      │
                                        └──────────────────────────────────────┘
```

- **Editor is static**: built once with Vite, uploaded to `public/studio/` — no Node runtime (Hostinger rule).
- **Public render is PHP**: SEO, WhatsApp previews and AI crawlers always see complete HTML.
- **Preview** runs through a signed token route, no-index, 30-minute TTL.

---

## 3. Storage model (additive migration)

```sql
ALTER TABLE pages
  ADD builder       VARCHAR(16) NOT NULL DEFAULT 'file',   -- 'file' (v1) | 'puck'
  ADD puck_data     JSON        NULL,
  ADD puck_version  INT         NOT NULL DEFAULT 1,
  ADD published_at  TIMESTAMP   NULL,
  ADD draft_of      BIGINT      NULL,
  ADD preview_token VARCHAR(64) NULL,
  ADD source_file   VARCHAR(255) NULL;                     -- v1 origin, for rollback & parity
```

- Existing 142 pages keep `builder='file'`; **nothing breaks** while they are converted group by group.
- `page_versions` (already exists) stores every published snapshot → rollback is a copy.
- `content_entries` (already exists, unused) becomes the **Content** backbone: `type` ∈ `post | study | page` with a
  Puck body, so Blog and Portfolio stop writing HTML shells.
- **`draft_of` is not added** (decision, T8): `pages.slug` is unique, so a draft row cannot share the published
  page's slug, and `page_versions` already stores every published snapshot. Pages are edited in place with
  `status` + `published_at`; drafts are previewed through the row's own `preview_token`, not a parallel row.
- **Reading is lenient, writing is strict.** Decoding a document drops blocks the build no longer knows, so an
  old page still renders; saving refuses them, so a save can never silently delete a section.

---

## 4. Block registry — one schema, two consumers

`resources/js/studio/registry.json` is the single source of truth:

```json
{
  "hero":           { "label": "Hero",        "group": "Layout",    "bind": false },
  "rich_text":      { "label": "Rich text",   "group": "Content",   "bind": false },
  "category_tiles": { "label": "Category tiles","group": "Commerce","bind": true  },
  "product_grid":   { "label": "Product grid","group": "Commerce", "bind": true  },
  "series_tabs":    { "label": "Series tabs", "group": "Commerce", "bind": true  },
  "materials_showcase": { "label": "Materials","group": "Commerce","bind": true  },
  "faq":            { "label": "FAQ",         "group": "Content",   "bind": true  },
  "testimonials":   { "label": "Testimonials","group": "Social proof","bind": true},
  "cta":            { "label": "Call to action","group": "Layout",  "bind": false },
  "quote_form":     { "label": "Quote form",  "group": "Forms",     "bind": false }
}
```

| Consumer | Implementation | Contract |
|---|---|---|
| Editor | `resources/js/studio/config.tsx` → Puck `Config` | fields, defaults, preview render |
| Renderer | `app/Domain/Website/Puck/Registry.php` + `resources/views/puck/blocks/*.blade.php` | same props → same HTML |

**Parity test** (`PuckRegistryParityTest`): the build emits `storage/app/studio/registry.json` from the TS side;
a PHP test asserts keys, field lists and defaults match. CI fails on drift.

### Mapping from the existing 18 `BlockType` cases

| v1 enum | Puck block | Note |
|---|---|---|
| `Hero`, `Slider` | `hero`, `hero_slider` | port the same markup |
| `Intro`, `Text`, `Columns` | `rich_text`, `columns` | sanitised HTML inside |
| `Services`, `Process`, `Specs`, `PriceTable` | `services_grid`, `process`, `spec_table`, `price_table` | unchanged visuals |
| `Gallery`, `Related`, `Reviews`, `Clients`, `Team`, `Map`, `Faq` | `gallery`, `related_pages`, `testimonials`, `logo_cloud`, `team`, `map`, `faq` | `faq`/`testimonials` become data-bound |
| `Form` | `quote_form`, `contact_form` | posts to existing lead endpoints |
| `Html` | `raw_html` *(owner-only)* | stays sanitised on save **and** render |
| — | **`product_grid`, `product_carousel`, `category_tiles`, `series_tabs`, `materials_showcase`, `room_packages`, `project_gallery`, `stats`** | **new, data-bound** |

---

## 5. Data binding (what makes pages commerce-ready)

Blocks marked `bind: true` store **queries**, never copies:

```json
{ "type": "product_grid", "props": { "category": "chairs", "limit": 8, "sort": "featured" } }
```

At render: `CatalogService::forBlock($props)` → products → Blade. Cached 5 min, invalidated on product/price publish.
A merchandiser changes a grid without republishing; a price change never leaves a stale page.

---

## 6. Migration of the 142 v1 pages (no URL ever changes)

The OS's own rule from `docs/13-V1-TO-V2-CONVERSION-PLAN.md` is kept: **the site never goes dark, every move is reversible.**

| Step | Work | Gate |
|---|---|---|
| M0 | Renderer + registry shipped; `builder='file'` pages untouched | v1 site byte-identical |
| M1 | **Pilot group**: 6 core service pages | DOM + computed styles + Lighthouse parity at 3 widths; same URLs, same titles/H1/schema |
| M2 | Home, About, Contact, Estimator, Book a visit | parity + form submissions land in CRM exactly as before |
| M3 | 48 cost guides (templated) | 100% parity, batch-converted from their HTML sections |
| M4 | 20 city/area pages | parity + local proof blocks |
| M5 | 54 specialist pages | last, highest volume, lowest risk |
| M6 | Blog + Portfolio → `content_entries` | ArticleFile writing switched off after a dual-run week |
| M7 | Remove `SaveHtmlFile` write path (keep read-only archive for one release) | no page still `builder='file'` |

**Rollback:** each page keeps `source_file`; a single command flips `builder` back to `file` and serves the original
HTML. A group is converted only after its parity report is signed off.

**Risk to SEO:** zero URL churn, same `<title>`/meta/H1/JSON-LD, same internal links. The converter hashes the
rendered DOM of v1 vs v2 and refuses the switch when they diverge beyond the allow-listed node set.

---

## 7. Content module on Puck

| Screen | Today | After |
|---|---|---|
| **Blog** | studio screen writes `public/insights/<slug>/index.html` (`ArticleFile`) | `content_entries(type=post)` with Puck body, template shell, scheduled publish, same URLs |
| **Portfolio** | same pattern under `public/projects/` | `content_entries(type=study)` + project gallery blocks |
| **Forms** | studio screen | form definitions in settings; submissions already route to CRM |

Content gains: drafts, revisions, rollback, scheduled publishing, templates, and reuse of the same blocks as pages.

---

## 8. Studio API (session-authenticated)

`/admin/api/studio`: `GET /pages` · `POST /pages` · `GET /pages/{id}` · `PUT /pages/{id}` (optimistic version) ·
`POST /pages/{id}/publish` · `POST /pages/{id}/rollback/{v}` · `GET /preview/{token}` · `GET /media` · `POST /media` ·
`GET /blocks`. All behind `website.edit`, publish behind `website.publish`, throttled 120/min, CSRF + session.

---

## 9. Permissions, safety, performance

| Concern | Control |
|---|---|
| Who edits | `website.edit`; publish/rollback needs `website.publish` |
| Raw HTML | sanitised (htmlpurifier) on save and render; `raw_html` owner-only |
| Media | library-only, re-encoded on upload, 3 sizes + WebP |
| Publish | writes `page_versions`, bumps `puck_version`, flushes page + sitemap caches |
| Performance | 20-block page < 250 ms cold, < 20 ms cached, ≤ 12 queries (`PuckPerformanceTest`) |
| SEO | canonical, meta, JSON-LD injected by the renderer; `noindex` on preview |

## 10. Acceptance tests

`PuckRegistryParityTest` · `PuckRenderTest` (each block) · `PuckBindingTest` (price change reflected) ·
`PuckPublishTest` (draft hidden / publish visible / rollback) · `PuckSecurityTest` (XSS, media outside library) ·
`PuckParityTest` (v1 vs v2 DOM for each migrated group) · `PuckPerformanceTest` · `StudioAccessTest`.

---

## 11. Out of scope for v1

Multi-language page variants · A/B testing · scheduled publishing *(added in P5 if cheap)* · per-block analytics ·
inline visual editing of data-bound blocks (they are edited through the commerce admin instead).
