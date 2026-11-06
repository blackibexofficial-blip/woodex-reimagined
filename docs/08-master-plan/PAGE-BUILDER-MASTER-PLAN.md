# WOODEX — Page-Builder Master Plan (drag-and-drop complete website)

> **Purpose:** the complete plan — and shipped Wave 0 spike — for a drag-and-drop page builder
> that lets WOODEX staff assemble the **entire website** (existing pages migrated + future pages)
> from the WOODEX UI kit/theme, inside the existing admin SPA.
>
> **Companion to:** `README.md` (older doc) and `UPGRADE-TODO.md` (execution checklist) in this folder.
> Where those disagree with this file on the page builder, this one wins.
>
> **Last updated: 2026-11-06** — Wave 0 shipped; CI green; **PR #3 MERGED by owner authorisation
> 2026-11-06 (merge commit `44ff091`, main `69985d3 → 44ff091`)**. Vercel production tracks `main`;
> `/lab/home` is public but unlisted, `noindex` and read-only — owner may request its removal at any time.
>
> **Owner-confirmed decisions (2026-11-06, chat):**
> - **Scope: `literal-all`** — header, footer, announcement bar, hero/heading/CTA/feature-grid and every
>   marketing page (home, showrooms/location, services, materials, warranty, custom design, legal, …)
>   are in scope for drag-and-drop composition. Commerce *transactional* flows (cart, checkout, quotation)
>   stay code-built and are explicitly **not** editable blocks.
> - **Zero cost is a hard constraint.** No paid SaaS, ever. Open-source only; anything requiring a
>   subscription is only listed as a rejected alternative.
> - **Deliverable: plan + spike** (`docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md` + PoC at
>   `/admin/pages-lab` with a read-only storefront render at `/lab/home`) — not the full implementation.
> - **`literal-all` chosen over agent-recommended risk-reduced scope.** Risks of that choice are flagged
>   in §7 and called out wherever the plan deviates safely (e.g. Site Chrome singleton, §6 Wave 1).
>
> **Status legend:** `[done]` shipped & verified · `[open]` actionable · `[blocked]` needs owner decision ·
> `[planned]` future wave

---

## 0. Executive summary & recommendation

**Recommendation (one line):** build the page builder on **`@puckeditor/core@0.24.0`** (MIT), the
current, renamed release line of the Puck editor, reusing the WOODEX shadcn/Tailwind kit as the
block library, with JSON document storage in the existing demo DB (later: Bagisto). Zero license cost,
zero SaaS, zero new infrastructure.

| | |
|---|---|
| **License cost** | **$0** — Puck MIT; all dependencies MIT/BSD/ISC; no usage quotas, no watermark |
| **Runtime cost** | $0 incremental — same static SPA, same hosting; editor is a lazy admin chunk |
| **Wave 0 status** | **[done]** — package integrated, 4 real WOODEX blocks, lab editor, read-only storefront render, verified |
| **Total effort to full builder** | ≈ **22–34 dev-days** across Waves 1–5 + owner UAT (§6) |
| **Biggest risk** | Global chrome (header/footer) edited as free-drag blocks — mitigated by singleton Site Chrome (§6 W1) |
| **Hard no-ship trigger** | Owner reports visual regression on a migrated page at Wave 2 parity gate → roll that page back to static |

**What is real today (Wave 0):** visit `/admin/pages-lab` (admin demo account) → the Puck editor mounts
with a *WOODEX blocks* palette (Section heading, Feature grid, Image banner, Button), a starter "home"
page, localStorage persistence, and a Publish button. `/lab/home` renders the same page read-only on the
storefront with a noindex badge. Verified 2026-11-06: 12/12 live checks, e2e 33/33, typecheck/lint/build clean.
Since merged (2026-11-06), this state ships on production (see header note).

**What is deliberately not done:** multi-page list, draft/publish workflow, media picker, theme blocks
(header/footer/announcement), storefront route migration, sitemap/SEO wiring, Bagisto mapping — all sequenced in §6.

---

## 1. Requirements (from the owner, 2026-11-06)

1. Drag-and-drop **complete website** — existing pages converted to builder output, new pages creatable.
2. Blocks styled by the **WOODEX UI kit** (shadcn + Tailwind + house classes, Inter, brand green/accent).
3. **literal-all** composition: header, footer, announcement bar, every marketing page.
4. **Zero cost** — OSS only; must remain efficient (no hand-rolling a canvas engine, no heavyweights).
5. Fits the current architecture: static SPA + localStorage demo DB + (later) Bagisto behind the existing
   `getAdminApi()` adapter seam.
6. Commerce correctness unaffected: cart/checkout/quotation stay code-built, unreachable from the canvas.
7. SEO/a11y must not regress: noindex lab routes, per-page title/description/OG, alt-text validation,
   heading-order safety in blocks.

---

## 2. Candidate evaluation (zero-cost shortlist + rejected alternatives)

| Candidate | License / cost | Fit | Verdict |
|---|---|---|---|
| **`@puckeditor/core` 0.24.0** (`puckeditor/puck`) | **MIT · $0** | React-native block editor; `Config` + `<Puck>` + `<Render>`; JSON `Data` document; shadcn-friendly; tiny runtime; active release line (0.24.0 is current) | **RECOMMENDED** |
| `@measured/puck` 0.20.2 | MIT · $0 | Same codebase under the old name; **deprecated, no 0.21+ line** | Rejected — wrong package name; installing it would strand the builder one major behind |
| Builder.io | SaaS · paid seats/quotas | Hosted SDK, Figma-first | **Rejected** — violates zero-cost hard constraint; lock-in; rejected-alternative row only |
| GrapesJS | BSD-3 · $0 | Mature, framework-agnostic canvas | Rejected — drag-drop DOM builder, not React-block native; we'd hand-map every block's React tree and fight its event model; heavier, template-y output |
| Craft.js | MIT · $0 | Low-level React canvas framework | Rejected — engine primitives only; we would re-implement selection/history/fields WXO; high effort, no savings vs Puck |
| Editor.js | Apache-2.0 · $0 | Block text editor | Rejected — outputs text blocks, not composable page layout; wrong problem |
| TinaCMS / Decap CMS | Apache · $0 | Git-backed CMS, form editing of markdown/JSON | Rejected — no visual drag-drop canvas; tied to git content workflow, not runtime-editable storefront |
| Sanity / Contentful / Storyblok | SaaS · free-tier caps → paid | Headless CMS with visual editors | Rejected — hard constraint: zero cost and zero lock-in |
| Payload / Directus | MIT · $0 (self-host) | Full backend CMS | Rejected **for now** — requires running a server; revisit only if/when Bagisto is provisioned (Wave 5 prefers the Bagisto seam) |
| Self-built DnD on dnd-kit | MIT · $0 | Total control | Rejected — weeks of editor UX (selection, history, keyboard a11y, panels) Puck already solves; not efficient |

**Pin note:** package.json declares `^0.24.0`; locks carry **0.24.0 exactly**. See §12 for the bun.lock
hash-freeze and the upgrade procedure. `@puckeditor/core` peers: `react ^18 || ^19` — satisfied (18.3.1).

---

## 3. Quotation — license & total cost of ownership (all $0)

### 3.1 License table

| Item | Kind | License | Wave | Cost |
|---|---|---|---|---|
| `@puckeditor/core` | npm runtime (lazy admin chunk) | MIT | 0 | **$0** |
| `@dnd-kit/*` (transitive) | npm runtime | MIT | 0 | $0 |
| `@tiptap/*` (transitive) | npm runtime (editor internals) | MIT | 0 | $0 |
| WOODEX UI kit (blocks, admin) | existing repo code | Proprietary (ours) | 0–5 | $0 |
| Demo DB pages slice (`localStorage woodex.admin.db.v1`) | existing persistence | — | 1–4 | $0 |
| Bagisto CMS JSON mapping | Wave 5 adapter | MIT (Bagisto) | 5 | $0 |
| Hosting / CI / CDN | existing | — | all | $0 incremental |
| Build-time sitemap regeneration | existing Vite pipeline | MIT | 3 | $0 |
| `axe-core` (optional a11y gate) | dev dependency | MPL-2.0 | 4 | $0 |
| **Total** | | | | **$0** |

### 3.2 Effort estimate (owner-confirmed `literal-all` scope)

| Wave | Deliverable | Est. dev-days |
|---|---|---|
| Wave 0 — Spike | package, 4 blocks, lab editor, `/lab/home`, gates, this doc | **[done]** (≈2 d elapsed) |
| Wave 1 — Persistence & Site Chrome | demo-DB `pages` slice; admin pages list (create/edit/duplicate/delete/status); singleton **Site Chrome** editor (announcement/header/footer); media picker from admin Media library | 3–4 |
| Wave 2 — Storefront migration | `PuckPage` render engine + published-page route; migrate home, warranty, services, materials, showrooms, custom-design, legal pages to builder content; static fallback kept; visual-parity gate per page | 5–7 |
| Wave 3 — New pages & registry | create-from-scratch flow; slug registry (collision vs existing routes); draft/published + preview links; build-time sitemap inclusion; noindex switch | 4–6 |
| Wave 4 — Quality gates | root-level SEO fields (title/description/OG/canonical) enforced at publish; alt-text validation; axe pass on lab; route-lazy loading; publish-time validation summary (heading order, missing alt, empty links) | 3–4 |
| Wave 5 — Bagisto mapping | JSON page document persisted as Bagisto CMS custom attribute (or native blocks) behind `getAdminApi()` adapter; migration of demo-DB pages; dual-run period | 4–5 |
| Buffer / owner UAT / parity polish | | 3–8 |
| **Total (Waves 1–5)** | | **≈ 22–34 dev-days** |

Zero recurring fees, at every wave. If Bagisto is never provisioned, Waves 1–4 still ship value against
the demo DB; Wave 5 becomes optional.

---

## 4. Architecture

### 4.1 Composition model

```
Admin (lazy chunk)                        Storefront
┌──────────────────────────────┐         ┌─────────────────────────────┐
│ /admin/pages-lab (Wave 0)    │         │ /lab/:slug (Wave 0)         │
│  <Puck config={woodexConfig} │  local  │  <Render config={…}         │
│         data={pageData}      │ storage │         data={pageData}/>  │
│         onPublish={…}/>      │───────▶│  + "LAB PREVIEW" badge       │
└──────────────────────────────┘         │  + noindex meta              │
              │ Wave 1+: pages slice in demo DB (woodex.admin.db.v1)   │
              ▼                                     ▼ Wave 2+
   pages: [{ id, slug, title, status: draft|published,                 │
              data: Data, updatedAt, publishedAt, version, history[] }] │
                                     ▼ Wave 5
                  Bagisto CMS (JSON custom attribute) via
                  getAdminApi() adapter — same Data document
```

### 4.2 Document format

Puck `Data` = `{ root: { props }, content: [{ type, props }] }`. Wave 4 adds root props enforced at
publish time: `title`, `description`, `ogImage`, `canonical`, `noindex`. Content items reference blocks
registered in `src/pages-builder/blocks.tsx`; unknown block types fail **soft** (block renders nothing and
logs in dev) — a stored page never whitescreens the storefront.

### 4.3 Block contract (the WOODEX-UI-kit rule)

Every block obeys: (1) renders with existing house classes/tokens/`components/ui/*` only — no new design
language; (2) no `dangerouslySetInnerHTML`; (3) props are JSON-serializable (no functions, no refs);
(4) images require `alt` (enforced at publish in Wave 4); (5) links restricted to internal routes or
`https://` (plus `tel:`/`mailto:`/`wa.me`), validated Wave 4; (6) commerce flows are not blocks.

### 4.4 Routes & rendering strategy

- Wave 0: `/admin/pages-lab` (editor, lazy) and `/lab/:slug` (read-only storefront render, noindex badge).
- Wave 2: `src/pages-builder/PuckPage.tsx` resolves a slug → published `Data` → `<Render>`; migrated routes
  (`/`, `/warranty`, `/services`, `/materials`, `/showrooms`, `/custom-design`, legal pages) render through
  it, falling back to today's static implementation when no published document exists (per-route, reversible).
- Wave 3: catch-all ownership moves to a registry so **new** builder pages get clean URLs (`/p/<slug>` or
  top-level slugs with collision detection against `src/App.tsx` routes).

### 4.5 Persistence & drafts

Wave 1 stores the pages bundle in the demo DB (`woodex.admin.db.v1`, same slice pattern as showrooms /
warranty / blog). Each document carries `status` and `version`; every publish snapshots the previous
document into `history[]` (cap 20) — rollback is a one-click revert of `data`. localStorage quota errors
surface as a toast with export-to-JSON download (nothing is silently lost).

### 4.6 Security & moderation

Editor is admin-gated by the existing demo adapter (documented limit: demo gate ≠ RBAC). Blocks render
only registered components; content JSON cannot inject code. Embedded iframes (map, YouTube-nocookie) are
allow-listed by hostname in their block validators. `/lab/*` and draft URLs carry `noindex,nofollow` and
are excluded from sitemap; published pages opt **in** via Wave 3 sitemap build step.

---

## 5. Block inventory (~30; ✅ = shipped in Wave 0)

| Block | Category | Fields (sketch) | Wave | Status |
|---|---|---|---|---|
| SectionHeading ✅ | Sections | eyebrow, title, subtitle, align(radio) | 0 | done |
| FeatureGrid ✅ | Sections | items[] (icon select, title, text) max 6 | 0 | done |
| ImageBanner ✅ | Media | src, alt, caption | 0 | done |
| ButtonLink ✅ | CTA | label, href, variant(accent/outline) | 0 | done |
| Hero | Sections | image, eyebrow, headline, sub, primary/secondary CTA, trust line | 1/2 | open |
| RichText | Sections | textarea (tiptap optional later), prose styling | 1 | open |
| TwoColumnText | Sections | heading, body, image side(left/right) | 2 | open |
| FeatureRow | Sections | image + 3 bullet points + CTA (alternating) | 2 | open |
| CtaStrip | CTA | headline, sub, button label/href, tone(dark/light) | 2 | open |
| AnnouncementBar | Chrome | message, link, dismissible, tone | 1 | open (singleton) |
| Header | Chrome | logo variant, nav items[], phone, CTA — edits singleton, all pages | 1 | open (singleton) |
| Footer | Chrome | columns[], socials, legal links, newsletter toggle | 1 | open (singleton) |
| ContactRail | Chrome | phone/WhatsApp/hours interpolated from `site` config (not free text) | 1 | open (singleton) |
| FaqAccordion | Sections | items[] (question, answer) | 2 | open |
| StatsRow | Sections | stats[] (value, label) max 4 | 2 | open |
| TestimonialRow | Sections | testimonials[] (quote, name, role) | 2 | open |
| LogoStrip | Sections | logos[] (media, alt), caption | 3 | open |
| ImageGallery | Media | images[], layout(grid/masonry), caption | 3 | open |
| VideoEmbed | Media | youtube-nocookie/vimeo id, title (a11y) | 3 | open |
| MapEmbed | Media | Google Maps embed URL allow-list, height, caption | 3 | open |
| NewsletterSignup | Forms | headline, sub, provider=WhatsApp/mailto (no keys in demo) | 3 | open |
| ProductShelf | Commerce-adjacent | mode(collection/ids/bestsellers), limit — renders live catalog, read-only | 3 | open |
| ShowroomCardGrid | Showrooms | pulls live `showrooms` slice | 3 | open |
| ServiceGrid | Services | pulls live `services` catalogue | 3 | open |
| MaterialSwatches | Materials | category filter, pulls live `materials` slice | 3 | open |
| WarrantyHighlights | Warranty | warranty singleton highlights | 3 | open |
| PricingTable | CTA | tiers[] (name, price, features[], highlighted) | 4 | open |
| Spacer / Divider | Utility | size token | 2 | open |
| CustomEmbed (HTML) | Utility | **disabled by default**; requires owner flag + CSP nonce design | 4 | blocked (owner) |
| Cart/Checkout/Quote | — | **never blocks** — remain code-built | — | excluded by contract |

Data blocks (ProductShelf…) render through existing live hooks (`useMaterials`, `useShowrooms`, …) with
static fallback, preserving the offline demo guarantees.

---

## 6. Wave plan (detailed)

### Wave 0 — Spike `[done]` (2026-11-06)
**Scope:** install `@puckeditor/core@0.24.0`; WOODEX block registry (4 blocks, `src/pages-builder/blocks.tsx`);
starter document (`src/pages-builder/starter.ts`); localStorage persistence; admin editor at
`/admin/pages-lab` (nav: ENGAGE → Pages Lab; page title "Pages Lab (spike)"; lazy chunk, Puck CSS vendored
+ stripped of its remote Inter `@import` so the build stays self-contained); read-only storefront render at
`/lab/:slug` (floating "Lab preview — spike, not published" badge, `noindex`, no Header/Footer); gates.
**Verification:** typecheck 0 · lint 0 errors (19 pre-existing warnings) · clean rebuild (Puck splits into a
~301 kB lazy chunk; storefront main bundle +1.4 kB) · e2e 33/33 · live check **12/12** (login → nav → editor
mount → banner → canvas select via scale-corrected pointer events → field edit → Publish → `/lab/home` shows
the edited eyebrow; 0 console errors).
**CI note (same day):** first push failed `bun install --frozen-lockfile` on a duplicate `ws@8.22.1` key in the
hand-merged bun.lock (JSON.parse silently tolerates duplicate keys — invalid per bun's parser). Fixed in `7d5dd66`;
push run 42268579873 ✓ and PR re-run 42268591312 ✓ green. **Lesson for all future lockfile surgery: validate with
bun's own parser, never JSON.parse.**

**Known limitations:** persistence is per-browser localStorage; no media picker (image URL by text field);
canvas is scaled (selection UX papercuts for automation, fine for humans); no multi-page list; desktop-only panel.

### Wave 1 — Persistence & Site Chrome `[open]` (3–4 d)
Demo-DB `pages` slice + admin "Pages" list (search, create/edit/duplicate/delete, draft⇄published toggle,
auto `slug`, version history with revert); singleton **Site Chrome** editor — announcement bar, header nav,
footer columns — edited once, applied to every builder-rendered page. This is the one deliberate deviation
from `literal-all`: chrome is global; free per-page chrome editing would let one mis-drag unbrand the whole
site. If the owner insists on per-page chrome, ship it behind a confirm-guard with a "affects all pages" banner.
Media picker: reuse admin Media library (`media` slice) to assign `ImageBanner`/`Hero` sources.
**Gate:** CRUD round-trip + publish → `/lab/<slug>` shows published doc only; history revert works; Chrome
singleton renders on lab pages; e2e gains a pages-lab persistence check.

### Wave 2 — Storefront migration with visual parity `[open]` (5–7 d)
`PuckPage` engine; migrate in order of risk (lowest first): **warranty → services → materials → showrooms →
custom design → legal (new) → home**. Home last because it is the flagship. Per page: extract current static
layout into the equivalent block sequence, seed the builder document, flip the route behind a data-present check,
**side-by-side screenshot parity** (current static vs builder output at 3 breakpoints), owner sign-off per page.
Static implementation stays in-repo, unused-but-fallbackable, until all migrated pages pass UAT — then it is
removed in a dedicated cleanup commit (keep git history, not dead code).
**Gate:** zero visual regression per page; e2e 33/33 + new builder assertions; Lighthouse within 5% of baseline.

### Wave 3 — New pages, registry & SEO `[open]` (4–6 d)
Create-from-scratch (name, slug, template); route registry with collision detection against existing routes;
draft preview links (`/lab/<slug>?v=draft`); **build-time sitemap.xml regeneration** from published builder
pages (homepage/showrooms/materials… entries stay, new pages appended); noindex toggle per page; 404 fallback
for unknown builder slugs. Legal pages (privacy, terms, returns) authored here — they never existed and become
builder pages, satisfying the `literal-all` legal scope for the first time.
**Gate:** publish → URL reachable + in sitemap + noindex off; unpublish → 404 + removed from next sitemap build;
zero collisions with `src/App.tsx` routes (unit test against the route manifest).

### Wave 4 — Quality gates & publish validation `[open]` (3–4 d)
Publish-time validator: missing `alt`, empty hrefs, `javascript:` URLs, heading-order sanity (no h3 before h2),
image file-size budget warning, at least one heading and one CTA; results shown as a blocking/non-blocking checklist
(non-blocking by default; blocking for `alt` and unsafe URLs). Root SEO fields enforced (`title`, `description`,
`ogImage`). axe run against `/lab/home` (0 critical). Route-level lazy chunks already split; verify initial-load
budget unchanged (<250 kB gzip excluding admin).
**Gate:** validator unit tests; axe clean; performance budget diff reported in the PR.

### Wave 5 — Bagisto CMS mapping `[planned]` (4–5 d)
Persist the page `Data` JSON as a Bagisto CMS page with a `puck_data` custom attribute (preferred) or native
blocks; extend `src/api/bagisto/*` behind `getAdminApi()`; migration script reads demo-DB `pages` → writes Bagisto;
dual-run: demo DB remains source of truth until flag `VITE_PAGES_SOURCE=bagisto` is set; rollback = env flag.
**Gate:** read path parity (same `Data` round-trips), write path behind flag, rollback rehearsed.

### Wave 6 — Optional evolution `[planned]`
tiptap rich-text block; multi-page "layout presets" (e.g. Warranty Landing, Seasonal Campaign); scheduled
publish; localized pages (ur/en with hreflang — see `urdu-hreflang-spike.md`); template gallery per persona.

---

## 7. Risks & mitigations (`literal-all` consciously accepted)

| # | Risk | Severity | Mitigation / flag |
|---|---|---|---|
| R1 | Per-page edits to header/footer/announcement drift or break global chrome | **High** | Wave 1 Site Chrome **singleton** (recommended); if owner forces literal-all per-page chrome → confirm-guard + "affects every page" banner + one-click reset to last Chrome snapshot |
| R2 | Homepage migration ships a regression on the flagship | **High** | Homemigrates last (Wave 2 order); screenshot parity + owner sign-off; static fallback route stays |
| R3 | Puck 0.24.0 early-line churn (API moves between minor versions) | Medium | Exact pin `^0.24.0` with lockfile freeze (§12); re-vendor CSS on upgrades; upgrade drills scheduled per minor; blocks use only stable public API (`Config`, `ComponentConfig`, `Data`, field types) |
| R4 | Editor chunk bloat (≈301 kB JS + 100 kB CSS) reaches storefront bundle | Medium | Lazy route-only imports; puck CSS vendored (rsms `@import` stripped); storefront never imports `@puckeditor/*` (lint rule candidate) |
| R5 | Stored page references an unregistered/retired block → broken section | Medium | Soft-fail renderer (skip unknown type + dev warning); block retirement = rename-to-deprecated + keep renderer for 1 wave |
| R6 | localStorage quota (≈5–10 MB) overflows with images-as-URLs (fine) or history | Low | History cap 20; images always URLs (media library), never data-URIs; quota toast + JSON export |
| R7 | XSS via CMS content | Low | React-rendered blocks only; no HTML block; URL/hostname allow-lists; `noindex` lab |
| R8 | a11y regressions (heading order, missing alt, focus trap in canvas) | Medium | Wave 4 publish validator + axe gate; blocks use semantic elements (h2/h3, buttons, alt) |
| R9 | SEO duplication/thin pages | Medium | Wave 3 sitemap integration + canonical; Wave 4 required title/description; `noindex` for drafts |
| R10 | bun.lock hand-merged entries diverge from a fresh bun resolve | Medium | Validated: trailing-comma-strip strict parse (780 pkgs); CI `install --frozen-lockfile` on every push (watch next run); if CI fails, regenerate lock on a bun-enabled machine and land as dedicated PR |
| R11 | Legal pages authored hastily create compliance exposure | Medium | Template with standard PK e-comm clauses; owner/legal review before publish (Wave 3 gate) |
| R12 | Two sources of truth during migration (static vs builder) | Medium | Migration registry; per-route data-present check; delete static only post-UAT; e2e asserts both paths identical for shared pages |

**Flags requiring owner decision before Wave 1:** Chrome-singleton exception (R1, recommended yes);
`/p/<slug>` vs top-level slugs (Wave 3); CustomEmbed HTML block (R-blocked, default off); whether builder
pages may shadow reserved routes (`/shop`, `/checkout`, …) — default: never.

---

## 8. Gates & verification (every wave)

1. `bun run typecheck` (0 errors) · `bun run lint` (0 errors; pre-existing warnings tolerated) · clean rebuild
2. `bun run e2e` → 33/33 (grow with module coverage: pages CRUD ≥ +2 checks in Wave 1)
3. Live scripted browser pass for every interactive surface (lab editor, Chrome singleton, publish/rollback)
4. axe on `/lab/*` (Wave 4+) · screenshot parity sign-off for migrated pages (Wave 2)
5. Commit → push `arena/cb0d09e3-woodex-reimagined` → PR #3 checks green (frozen lockfile)

---

## 9. What ships today + how to try it

```bash
# admin: sign in (demo gate) with admin@woodex.pk / woodex-admin
# sidebar → ENGAGE → "Pages Lab" (hammer icon) → /admin/pages-lab
#   1. Click any WOODEX block in the palette to add it
#   2. Click a block on the canvas to edit its fields
#   3. Publish → toast; open /lab/home → the saved page renders read-only
```

Spike file map: `src/pages-builder/blocks.tsx` (block registry/config) · `starter.ts` (starter document +
localStorage helpers) · `puck-editor.css` (vendored Puck styles, remote import stripped) ·
`LabPreview.tsx` (storefront read-only render) · `src/admin/pages/PagesLab.tsx` (editor screen) ·
routes in `src/App.tsx` (`/lab/:slug`), `src/admin/AdminApp.tsx` (`pages-lab`), nav in `src/admin/Layout.tsx`.

**Not a production surface:** noindex, badge, localStorage-only, unlisted — Wave 2+ decides what ships.

---

## 10. Rollback plan

Delete the two routes (`/lab/:slug`, `/admin/pages-lab`), the nav entry, and `src/pages-builder/`;
`bun remove @puckeditor/core` (or revert this PR range); restore `bun.lock`/`package-lock.json` from git
history (pre-spike `e05dfc1`-era state); `node_modules` reinstall. **Zero coupling to the storefront** — the
main bundle only grew ≈1.4 kB (route registration); rollback of the feature is a single revert commit.

---

## 11. Open questions for the owner (blocking Wave 1)

1. Site Chrome singleton exception (recommended) — approve?
2. New-page URLs: top-level slugs (`/warranty-extended`) or `/p/…`? (collision rules apply either way)
3. CustomEmbed (raw HTML) block — default off; enable?
4. Publish permission: any admin, or restricted role when real auth lands (Bagisto RBAC)?
5. Legal page copy — who drafts privacy/returns/terms (owner + counsel)? Deadline?

---

## 12. Dependency pin & maintenance notes

- **Pinned:** `@puckeditor/core` `^0.24.0` in package.json; **0.24.0 exact** on disk and in both lockfiles.
- **bun.lock was hand-merged 2026-11-06** (64 injected entries, `fast-equals@5.4.5` carried as chain-key
  `@puckeditor/core/@tiptap/react/fast-equals`; top-level `fast-equals@5.2.2` retained; one duplicate `ws` entry
  dropped in `7d5dd66`). Final state: **780 packages, zero duplicates**, parses under bun's own parser; frozen-lockfile
  CI **proven green** on the merge runs (42268579873 ✓ / 42268591312 ✓). Rule of record: any future hand-merge is
  validated with `bun install --frozen-lockfile` itself in a scratch copy — JSON.parse cannot detect duplicate keys.
- **puck.css vendored** at `src/pages-builder/puck-editor.css`; only change vs upstream: the remote
  `@import "https://rsms.me/inter/inter.css"` was removed (self-contained build; Inter comes from `index.html`).
  On every Puck upgrade: re-copy `dist/index.css` → delete the matching `@import` line → diff hunks → gates.
- **Upgrade policy:** pin minor; read changelog; bump in one commit with lockfile regen; re-vendor CSS;
  run §8 gates + the live 12/12-style interaction check. No floating upgrades.
- **npm vs bun lag:** npm registry (`registry.npmjs.org`) is accurate for the renamed package
  (`@puckeditor/core`); the deprecated `@measured/puck` line must never re-enter the tree.
- **Contamination lesson (2026-11-06):** isolated scratch installs must start from a reset `package.json`;
  a stray `@measured/puck` root dep forced spurious copies and a 73-path rollback. Overlay = `cp -n`
  (skip-existing) semantics only; never overwrite repo-major React/Radix packages.

---

## 13. Execution checklist

Tracked in `UPGRADE-TODO.md` (see the **Page builder (Puck)** section): Wave 0 items ticked; Waves 1–5
queued with owners implied (agent) and gates from §8. This document is the strategy; the to-do file is
the tracker — update both in the same commit per wave.

---

## 14. Status log

- **2026-11-06 (AM)** — Owner scope decisions: scope `literal-all`, zero-cost hard constraint, deliverable
  plan + spike. Package decision: `@puckeditor/core@0.24.0` (MIT). Dependency surgery completed across
  package.json / package-lock.json / bun.lock; repo majors preserved; `@measured/puck` purged.
- **2026-11-06 (midday)** — Wave 0 implemented: block registry, starter doc, lab editor
  (`/admin/pages-lab`, ENGAGE → Pages Lab), read-only `/lab/:slug` storefront render (noindex, badged).
  Gates green; live check 12/12 (canvas-select via scale-corrected pointer events → eyebrow edit →
  Publish → `/lab/home` renders the edit; 0 console errors). Spike committed as `312e282`; e2e 33/33.
- **2026-11-06 (PM)** — CI failure diagnosed (bun parse error: duplicate `ws` key, invisible to JSON.parse);
  fixed (`7d5dd66`); push CI and PR re-run both **green**. Duplicate-key scan added to the §12 rule of record.
- **2026-11-06 (merge)** — Owner authorised: **"yes, merge."** PR #3 MERGED 2026-11-06T18:29:20Z, merge commit
  `44ff091` (`main` `69985d3 → 44ff091`). Vercel production tracks `main` — deploy verification is owner-side;
  `/lab/home` is now reachable in production (unlisted, noindex, badged, read-only; removal available on request).
- **Next** — Owner answers master plan §11 → Wave 1 (PB-1) kickoff; B4 (Custom Design) remains next Phase 4
  module; Vercel cutover checklist is owner-side.
