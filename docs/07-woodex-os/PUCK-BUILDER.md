# Puck Page Builder — Integration Spec

**Library:** [`puckeditor/puck`](https://github.com/puckeditor/puck) · `@puckeditor/core` **0.24.0** · MIT · 13.5k ★
**Role in Reimagin OS:** the **live page builder** for storefront marketing pages and landing pages.
**Constraint:** Hostinger shared hosting → **no Node at runtime**. The editor is a pre-built React bundle; published pages render in PHP.

---

## 1. The three-layer design

```
┌───────────────────────────────┐        ┌────────────────────────────────┐
│ Puck Studio (React SPA)       │  HTTP  │ Reimagin OS (Laravel/PHP)      │
│ /admin/studio                 │ ─────▶ │ • session auth + CSRF          │
│ • @puckeditor/core editor     │        │ • page CRUD, drafts, versions  │
│ • block configs (TS registry) │ ◀───── │ • media endpoints (MediaLibrary)│
│ • live preview iframe         │        │ • publish → cache flush        │
└───────────────────────────────┘        └──────────────┬─────────────────┘
                                                        │ Puck JSON
                                        ┌───────────────▼─────────────────┐
                                        │ PHP renderer (Blade registry)   │
                                        │ GET /{slug} → full HTML, no JS  │
                                        │ resolves data-bound props       │
                                        └─────────────────────────────────┘
```

**Why not render Puck in the browser only:** the marketing pages are the SEO surface. With shared hosting and no
Node SSR, a client-only renderer would ship empty HTML to crawlers. The PHP renderer keeps Google, WhatsApp
previews and AI crawlers seeing complete pages.

---

## 2. Storage model

Reuse the existing `pages` table and add columns (one migration, additive):

```sql
ALTER TABLE pages
  ADD builder       VARCHAR(16)  NOT NULL DEFAULT 'livewire',  -- 'livewire' | 'puck'
  ADD puck_data     JSON         NULL,                          -- { root: {...}, content: [...] }
  ADD puck_version  INT          NOT NULL DEFAULT 1,
  ADD published_at  TIMESTAMP    NULL,
  ADD draft_of      BIGINT       NULL,
  ADD preview_token VARCHAR(64)  NULL;

CREATE INDEX pages_builder_published_idx ON pages (builder, published_at);
```

- Existing Livewire pages keep working untouched (`builder = 'livewire'`).
- New storefront pages are `builder = 'puck'`; the live row is the published snapshot, drafts are separate rows
  linked by `draft_of` (same pattern the OS already uses for `PageVersion`).
- Revisions: on publish, copy the previous `puck_data` into `page_versions` (existing table) so rollback is a
  copy, not a reconstruction.

---

## 3. Studio API (session-authenticated, `/admin/api/studio`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/pages` | list editable pages (id, title, slug, status, updated_at) |
| `POST` | `/pages` | create draft `{title, slug}` |
| `GET` | `/pages/{id}` | `{puck_data, version, meta}` for the editor |
| `PUT` | `/pages/{id}` | save draft JSON (optimistic concurrency on `version`) |
| `POST` | `/pages/{id}/publish` | publish + flush render cache |
| `POST` | `/pages/{id}/rollback/{version}` | restore |
| `GET` | `/preview/{token}` | signed preview URL for the public renderer |
| `GET` | `/media` | media library picker (search, paginate) |
| `POST` | `/media` | upload (queued conversions) |
| `GET` | `/blocks` | the registry payload (schema + defaults) — served from the shared JSON |

Auth: existing Fortify session + `web` middleware + CSRF header; permission `website.edit` required; `website.publish`
required for publish/rollback. Throttled 120/min.

---

## 4. Block registry — one source of truth

`resources/js/studio/registry.json` is canonical:

```json
{
  "hero": {
    "label": "Hero",
    "fields": { "eyebrow": {"type":"text"}, "title": {"type":"text"}, "image": {"type":"media"},
                "cta": {"type":"object","fields":{"label":{"type":"text"},"href":{"type":"text"}}} },
    "defaults": { "eyebrow": "WOODEX", "title": "Design for your workspace", "image": null },
    "data_bind": false
  },
  "product_grid": {
    "label": "Product grid",
    "fields": { "heading": {"type":"text"}, "category": {"type":"category"},
                "limit": {"type":"number","min":2,"max":24}, "sort": {"type":"select","options":["featured","price_asc","newest"]} },
    "defaults": { "heading": "Office essentials", "category": "office-tables", "limit": 8, "sort": "featured" },
    "data_bind": true
  }
}
```

Two consumers, one schema:

| Consumer | File | Guarantees |
|---|---|---|
| Editor (React) | `resources/js/studio/config.tsx` — reads the registry, provides `render` for preview | block appears in the palette with the right fields |
| Renderer (PHP) | `app/Domain/Website/Puck/Registry.php` + `resources/views/puck/blocks/{block}.blade.php` | same props render identically |

**Test:** `PuckRegistryParityTest` asserts the TS registry (compiled to `storage/app/studio/registry.json` by the
build) and the PHP registry expose identical keys, field lists and defaults. CI fails on drift.

---

## 5. Data binding (why pages never go stale)

Blocks with `data_bind: true` store **queries, not rows**:

```json
{ "type": "product_grid", "props": { "category": "chairs", "limit": 8, "sort": "featured" } }
```

At render time the PHP resolver calls `Domain\Commerce\Services\CatalogService::forBlock($props)` and renders
server-side HTML, cached for 5 minutes and invalidated on product/price publish. A copied page therefore never
shows yesterday's price, and a merchandiser can change a grid without republishing.

Allowed resolvers (v1): `product_grid`, `product_carousel`, `category_tiles`, `series_tabs`, `room_packages`,
`materials_showcase`, `project_gallery`, `testimonials`, `faqs`, `stats`, `logo_cloud`.

---

## 6. Rendering pipeline

```
GET /{slug}
  ├─ resolve page (builder=puck, published) → 404 if none
  ├─ cached fragment? (file cache key: puck:{page_id}:{version}:{locale})  ── hit → return
  ├─ PuckRenderer::render(json)
  │    ├─ walk content tree
  │    ├─ for each block: sanitise props → resolve bindings → Blade partial
  │    └─ wrap in layout (header/footer from existing website theme)
  ├─ inject SEO meta + JSON-LD + canonical (existing SeoBlock helpers)
  └─ store fragment (5 min) · ETag · s-maxage
```

**Safety:** rich-text props pass through the existing HTML sanitiser (`stevebauman/purify`); unknown block types
render nothing and log to `IntegrationLog`; no raw HTML/PHP props exist in the registry.

---

## 7. Preview & publishing

| State | Behaviour |
|---|---|
| Draft | Only visible at `/preview/{token}` (signed, 30-min TTL, no-index header) |
| Published | Public at `/slug`, cached, in the sitemap |
| Unpublished | 404 to the public, still editable |
| Rollback | Copy `page_versions` snapshot back into `puck_data`, bump `puck_version`, flush cache |

Publishing also regenerates: page cache fragment, `sitemap.xml` when the slug set changes, and the navigation cache.

---

## 8. Editor UX on shared hosting

- Bundle pre-built with Vite → `public/studio/{app.js,app.css}` (~350–500 KB gz); versioned filename + long cache.
- Editor loads the registry + page JSON in **one** request; media picker paginates.
- Autosave every 20 s (PUT, optimistic lock) with a visible "saved/pending/error" chip — same honesty rule the OS
  already applies to its settings screens.
- No WebSockets: preview refresh is a normal iframe reload after save.
- If the bundle is missing or stale, `/admin/studio` shows a clear "run the build" panel instead of a blank screen.

---

## 9. Permissions & guardrails

| Permission | Allows |
|---|---|
| `website.view` | see pages list |
| `website.edit` | create/edit drafts, upload media, use preview |
| `website.publish` | publish, unpublish, rollback |
| `website.blocks.manage` | (future) enable/disable blocks per site |

Guardrails: no raw `<script>`, no arbitrary CSS per block, media must come from the library, external links get
`rel="noopener"`, all writes audited (`ActivityLog`), and every publish records who/when in `page_versions`.

---

## 10. Acceptance tests

| Test | Asserts |
|---|---|
| `PuckRegistryParityTest` | TS and PHP registries identical |
| `PuckRenderTest` | each block renders expected HTML from defaults; unknown block is skipped and logged |
| `PuckBindingTest` | product grid reflects a price change after cache invalidation |
| `PuckPublishTest` | draft invisible publicly; publish visible; rollback restores prior JSON |
| `PuckSecurityTest` | script/HTML injection in rich text is stripped; media outside library rejected |
| `PuckPerformanceTest` | 20-block page renders < 250 ms cold, < 20 ms cached, ≤ 12 queries |
| `StudioAccessTest` | each studio route denied without its permission |

---

## 11. Migration of existing pages

1. Existing Livewire pages remain on the Livewire builder (no forced migration).
2. New storefront marketing pages start in Puck.
3. Optional later step: a converter that reads `page_blocks` rows and emits Puck JSON for simple block types
   (hero, rich text, gallery) — only if the owner wants one editor for everything.

**Out of scope for v1:** multi-language page variants, A/B testing, scheduled publishing, per-block analytics.
These are natural v2 additions once the registry is stable.
