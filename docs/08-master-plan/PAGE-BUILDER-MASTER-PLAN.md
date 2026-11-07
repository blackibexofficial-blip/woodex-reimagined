# WOODEX — Page-Builder Master Plan v2.0 (drag-and-drop complete website · legacy-parity upgrade)

> **Purpose:** the complete plan — and shipped Wave 0 spike — for a drag-and-drop page builder
> that lets WOODEX staff assemble the **entire website** (existing pages migrated + future pages)
> from the WOODEX UI kit/theme, inside the existing admin SPA.
>
> **Companion to:** `README.md` (older doc) and `UPGRADE-TODO.md` (execution checklist) in this folder.
> Where those disagree with this file on the page builder, this one wins.
>
> **v2.1 (2026-11-06, owner Q&A round):** all §11 questions answered — Theme **presets for both brands** (§11-Q1),
> chrome = **linked master sections** in-canvas (§11-Q2), **per-wave owner gating** W1→W7 (§11-Q3), W6 =
> **full generation** of pages from templates incl. SEO catalogue fan-out, draft-first (§11-Q4), **owner-only
> publish** (§11-Q5) + **Tailgrids (MIT) added as the elements-kit completion source for missing UI elements**
> (§5.3), **furniture site only — legacy catalogue not ported** (§11-Q6). See §14 log.
>
> **v2.0 (2026-11-06, same-day upgrade):** the owner shared screenshots of the **legacy Woodex Interior
> website builder** — a complete visual website system (pages tree, 40-section UI-kit, elements palette,
> theme/SEO/layers layers, Content/Style/Advanced inspector, linked styles, AI+MCP build path). This plan
> is upgraded to map and reach that parity: full anatomy in **§0A**, requirements in §1.8–§1.10, block/element
> catalogues in §5, re-phased waves in **§6 (Wave 7 = Bagisto)**, effort re-estimate in §3.2, AI+MCP scope in
> §6 Wave 6, new risks §7 R13–R16, open questions regenerated in §11.
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

## 0A. v2 — What the legacy Woodex Interior builder actually is (owner-shared anatomy, 2026-11-06)

The five reference screenshots show a **complete, production visual website system** for `wooodex.com.pk`
("Woodex Interior has worked from Lahore since 2016…") — 81 top-level pages, finishes consistent across
every panel. This is the parity target WOODEX REIMAGINED's builder must match or consciously exceed.
Everything below is observable fact from the screenshots (no guessing).

### 0A.1 Left rail (activity bar) — 6 workspaces
`Pages · Sections · Elements · Layers · Theme · SEO` (+ `+ New` page button in Pages).

### 0A.2 Pages workspace
"All website pages by folder. Click to open." Tree list with folders + `(top level) 81` — e.g. `/`,
`/i-kanal-house-design/`, `/10-marla-house-design/`, `/12-kanal-house-design/`, `/3d-visualization/`,
`/5-marla-house-design/`, `/about/`, `/apartment-interior-design/`, `/architecture/`, `/bahawalpur/`,
`/bathroom-design/`, `/beauty-salon-design/`, `/book-a-visit/`, `/cafe-interior-design/`,
`/commercial-fit-out/`, `/commercial-interior/`, `/commercial-renovation/`, `/complete-home-redesign/`,
`/contact/`, `/coworking-space-design/`, `/dressing-room-design/`, `/educational-buildings-design/`,
`/estimator/`, `/faisalabad/`, `/false-ceiling-design/`, `/farmhouse-design/` … — i.e. a programmatic,
local-SEO-driven catalogue (city/niche design pages). Search-pages filter; page slug shown with trailing slash.

### 0A.3 Sections workspace ("Add content")
"Drag onto the page, or click to add after the selected section." Tabs: **Sections · UI kit · Templates · Images**
(+ search "Search UI kit…"). Category chips: **All 40 · Hero · Features · Pricing · Stats & charts ·
Testimonials · Team · Call to action · Content · Forms · Components**. Card grid with thumbnails, e.g.
**HERO · 4**: Hero — centered with trust row · Hero — text + enquiry form · Hero — split with image and stats ·
Hero — dark centered. **FEATURES · 5**: Features — icon grid (6) · Features — list + image · Features — bento
gallery · Features — 4-step process. Each section carries a **Label shown in Layers** (e.g. "Services intro").

### 0A.4 Elements workspace
"Drag into any section, or click to add after the selected element." Search. **BASIC**: Heading · Sub-heading ·
Paragraph · Small label · Button · Two buttons · Image · Video (YouTube) · Check list · Quote · 2 columns ·
3 columns · Card box · Spacer · Divider line · Google map. **WIDGETS**: Icon · … (list truncated in shot).

### 0A.5 Layers workspace
Dedicated layers panel (icon between Elements and Theme) — z-order/visibility/lock of sections & elements
(observed from rail; presumably the standard layer tree: select, reorder, hide, lock).

### 0A.6 Theme workspace — "Theme (whole website)"
- **COLOURS**: Brand navy (`#0C1628`-class dark navy) · Text (near-black) · Muted text (grey) · Page background
  (bone/off-white) · Light surface (warm cream) · Beige.
- **FONTS**: Body font `Plus Jakarta Sans` · Heading font `Plus Jakarta Sans` · helper: "Type to search 1,900
  Google Fonts. Leave empty for DM Sans." · **Base text size** slider (16px).
- **HEADING SIZES (DESKTOP)**: H1 72px · H2 48px · H3 22px — sliders + **"Use custom heading sizes"** toggle (ON).

### 0A.7 SEO workspace
- **Page title** with counter `(56/60)` · **Meta description** `(151/160)` · URL breadcrumb preview
  (`wooodex.com.pk/`) + **live Google result preview** (blue title link, green-ish URL line, grey description).
- **Focus keyphrase** ("e.g. office renovation Lahore") + **Analyse** button + **"Open in SEO manager ↗"** link.
- **Score badges**: `SEO 60` (orange) · `Readability 86` (green).
- **SEO analysis** checklist with coloured bullets, e.g. 🔴 "No focus keyphrase set. Add the main search phrase
  for this page." · 🟢 "SEO title is 56 characters (good)." · 🟢 "Meta description is 151 characters (good)." ·
  🟢 "The page has one H1." · 🟢 "The text has 1389 words. Good…".

### 0A.8 Inspector (right panel) — three tabs **Content · Style · Advanced**
**Content** (section selected): **Section skin** radio pills `Original · White · Cream · Navy` · **Animation on
scroll**: Effect (`None`) · Delay (ms, 0) · Duration (ms, 700) · **▶ Preview** — "Plays once when the element
scrolls into view. Turned off automatically for visitors who prefer reduced motion." · **Section** group: Label
(shown in Layers) · Container width `Boxed | Full` · Container height `Auto | Full` · **Background**: `None ·
Image · Video · YouTube` + toggle **"Parallax (image stays fixed while scrolling)"** · Colour preset (`Default`) ·
Spacing preset (`Normal`) · **Overlay** (toggle + colour) · **Top separator** Show toggle ·
**Bottom separator** Show toggle · Layout group. **General** group: Tag (`<section>`) · ID (`home-about`) ·
Title (`home-about`) · Aria label (empty) · **Classes** chips (`hm-section` + `hm-about`) with "add class + E" input.
**Image selected** adds: Set image / Upload buttons · URL (`/assets/img/img-dce06249b`) · Alt text · Width 1920 ·
Height 1280 · Fit (`Default`) · **Link** group · General group · **Actions** group.

**Style**: header row **Editing: `Desktop ▾` · State: `Normal ▾` · Reset** · yellow **Linked styles** callout:
"This element shares its class with other elements. Apply styles to:" — **(•) This element only** /
**( ) All .hm-section on this page (9)** · collapsible groups: **Display · Typography** (Font size 48px,
Font weight, Font family "Default (Plus Jakarta Sans) - type to search", Text alignment, Line height `48.96`,
Letter spacing `−1.44px`, Transform `aa/Aa/AA/aA`, Style `I/N`, Text decoration, Decoration colour `rgb(12,22,40)`
+ full slider) · **Size · Margin · Padding · Border · Border radius · Background image · Effects & transform**.
**Heading selected** adds font-weight/family/line-height control + inline canvas toolbar (B I U S · link · color ·
align · font · size · A/Aa).

**Advanced**: Animation on scroll + General + **Responsive visibility** ("Hide on" — ☐ Desktop ☐ Tablet ☐ Mobile).

### 0A.9 Canvas
Blue floating **section toolbar** (move ⌘?, edit, duplicate-arrow-icons, comment?, copy, paste, trash) · element
selection with 8 resize handles · inline rich-text toolbar (B/I/U/S, link, colour, alignment, font, A/Aa, size) ·
"Heading 2" type chip · click "+" handle to add block after · **the header/nav (logo, Home · Woodex Studio ·
Services · Projects · About · Insights · Contact · Get a quote) is canvas content**, styled like any section —
site chrome is editable in the same engine.

### 0A.10 Design tokens observed (legacy interior system)
Navy-forward dark ink on warm bone; beige/light-surface support neutrals; Plus Jakarta Sans body+heading;
16px base; 72/48/22 heading scale; section skins Original/White/Cream/Navy; class-prefixed utilities (`hm-*`).
**Not adopted blindly** — see §11 Q1 (brand decision pending).

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
8. **Legacy parity (owner directive 2026-11-06):** the builder targets everything in §0A — pages tree with
   folders, 40-section catalogue + UI kit/Templates/Images tabs, elements palette, Layers panel, Theme tokens
   panel, SEO panel (Yoast-style counters, Google preview, analysis checklist, SEO/Readability scores),
   Content/Style/Advanced inspector, linked styles with page-scope class application, animation on scroll
   (reduced-motion aware), responsive visibility, section skins, inline text toolbar, per-component
   Tag/ID/Title/Aria/Classes.
9. **AI + MCP build path:** coding agents (Claude Code / Codex / local) read, audit, draft and bulk-improve
   builder pages through an MCP server bound to the same page store; every AI write is draft-first and passes
   the validators; publish stays human-gated.
10. **Design system:** Theme token layer is brand-agnostic; default preset = current WOODEX REIMAGINED tokens;
    optional "Legacy Woodex Interior" preset (navy/beige/Jakarta) pending owner answer (§11 Q1).

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
| Wave 1 — Foundation: pages slice, tree & draft/publish | demo-DB `pages` slice; admin **Pages** workspace (folder tree, §0A.2 model); create/edit/duplicate/delete/status; history + revert; slug registry vs `App.tsx` routes | 3–4 |
| Wave 2 — Sections & Elements libraries | the §0A.3 40-section UI-kit catalogue (thumbnails, "Label in Layers") + tabs Sections/UI kit/Templates/Images + category chips; Elements palette (BASIC+WIDGETS, §0A.4); Layers panel (select/reorder/hide/lock) | 5–7 |
| Wave 3 — Theme: whole-website tokens | §0A.6 panel — colours/fonts/base size/heading scale (+ custom toggle), CSS custom properties, section skins Original/White/Cream/Navy, versioned demo-DB `theme` singleton + snapshot/restore | 3–4 |
| Wave 4 — Inspector parity + Linked styles | **As built (PR #7):** Style tab (Desktop/Tablet/Mobile × Normal/Hover — padding/radius/border/align via static classes), Advanced tab (General Tag/ID/Title/Aria/Classes + responsive visibility + animation on scroll, reduced-motion aware), page-scoped **Linked styles** with live `hm-*` usage counts (inline-merge engine, Phase-B-lite), `Live home ↗` button, **inline text toolbar deferred** | 6–9 |
| Wave 5 — SEO layer | §0A.7 panel — title/meta counters (60/160), focus keyphrase, live Google preview, local Yoast-style **Analyse** (keyphrase, H1=1, title/meta length, word count, readability), SEO + Readability score badges, publish gate; JSON-LD wiring; sitemap **deferred to W7/Bagisto** (see §0A.7 as-built note) | **[done — branch, owner merge-gated]** |
| Wave 6 — AI + MCP build path | local MCP server (full-generation depth, owner §11-Q4): `create_page` / `upsert_section` / template fan-out for local-SEO catalogue; draft-first + validator; audit log; no publish tool | 5–8 |
| Wave 7 — Bagisto mapping | JSON page document persisted as Bagisto CMS custom attribute (or native blocks) behind `getAdminApi()`; migration of demo-DB pages; dual-run period | 4–5 |
| Buffer / owner UAT / parity polish | linked-styles Phase B slippage, screenshot sign-offs, migration of static pages | 8–12 |
| **Total (Waves 1–7, v2.1)** | | **≈ 37–55 dev-days** |

> **v2 honesty note:** parity with the legacy system (years of builder evolution) roughly doubles the W0-era
> estimate (22–34 → 37–54 d). Ship incrementally behind owner gates per wave; Waves 1–3 alone (11–15 d)
> deliver the pages tree, section catalogue and theme — already transformative — before the hardest wave (W4).

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

### 5.1 Elements library (legacy parity, §0A.4)
BASIC rows ship as first-class Puck components nested inside sections:
Heading · Sub-heading · Paragraph · Small label · Button · Two buttons · Image · Video (YouTube) ·
Check list · Quote · 2 columns · 3 columns · Card box · Spacer · Divider line · Google map — plus
WIDGETS (Icon · …). Each carries: content props, style props (via §6 W4 linked-styles classes),
Advanced (Tag/ID/Title/Aria/Classes) and responsive visibility. Icons use lucide (self-hosted, MIT) —
no icon-font dependency.

### 5.2 Section catalogue — "All 40" (legacy parity, §0A.3)
Category → planned WOODEX sections (variants in parentheses, mirroring legacy counts):

| Category | Legacy variants (as seen) | WOODEX mapping |
|---|---|---|
| Hero · 4 | Hero — centered with trust row · Hero — text + enquiry form · Hero — split with image and stats · Hero — dark centered | `HeroCentered`, `HeroForm`, `HeroSplitStats`, `HeroDark` |
| Features · 5 | icon grid (6) · list + image · bento gallery · 4-step process (+1 in "All 40") | `FeatureGrid` (done, +1 icon), `FeatureListImage`, `BentoGallery`, `StepsRow` |
| Pricing | packages grid / table | `PricingTable` (exists in §5) |
| Stats & charts | counters row / bar+line visual | `StatsRow`, optional `ChartBlock` (Recharts, admin already bundles it) |
| Testimonials | grid / single row / big quote | `TestimonialRow`, `TestimonialWall` |
| Team | portrait grid / role cards | `TeamGrid` |
| Call to action | centered banner · strip · split | `CtaStrip`, `CtaSplit` |
| Content | rich text + image · editorial · FAQ | `RichText`, `TwoColumnText`, `FaqAccordion` |
| Forms | enquiry form · callback · newsletter | `EnquiryForm` (WhatsApp-first, demo-safe), `NewsletterSignup` |
| Components | logo strip · map · awards · badges | `LogoStrip`, `MapEmbed`, `AwardsRow` |

Plus the legacy **Card box · Check list · Quote · Two buttons · Google map** primitives float in Elements
(§5.1). Every section exposes the Content controls of §0A.8 (skin, background, overlay, separators,
container, Label, animation, classes) — skin/background/overlay are section-level, not duplicated per child.
### 5.3 Elements kit completion — Tailgrids (MIT) adoption plan
**Source:** github.com/TailGrids/tailgrids (React + TS + Tailwind; `npx @tailgrids/cli add <component>`; 100+ free
components; **MIT** verified 2026-11-06; premium UI Blocks excluded permanently).
**Why:** our house kit (shadcn/Radix + WOODEX tokens) covers app primitives; the builder's Elements palette
needs more marketing/layout elements than we want to hand-build (§0A.4 promise). Tailgrids closes those gaps
fast, free, and with a11y-minded markup — **after** token remapping, never as-installed.

**Adoption rules (zero-cost + zero-drift):**
1. **Copy-in, never depend.** Components are vendored to `src/components/tailgrids/*` (or inlined as block
   render functions) — no `@tailgrids/*` package in dependencies; the CLI is a one-off scaffold tool, not a dep.
2. **Token remap mandatory.** Replace Tailwind colour utilities with WOODEX CSS vars (`--woodex-page-background`,
   `--woodex-text`, …) at vendor time; hex values from their palette are deleted. A grep gate in CI/build fails on
   known Tailgrids palette hex codes and on `tailwind.config` extensions from their theme.
3. **House-first rule.** If the house kit already ships the element (Button, Card, Badge, Input, Dialog…), we use
   it — Tailgrids is only for gaps (examples below). No duplicate primitives.
4. **Free components only.** Any import/reference to Tailgrids **Pro** (paid blocks, `tailgrids.com/figma|blocks|pro`)
   = build failure; license banner kept in every vendored file (`@license MIT © Tailgrids — https://github.com/TailGrids/tailgrids`).
5. **A11y parity.** Vendored component must pass our gates (axe: 0 critical; keyboard operability; visible focus);
   if it fails, we fix or drop it — never ship a weaker a11y bar to fill a visual gap.

**Gap-fill list (Wave 2 targets, matched to WOODEX elements):** `check list` (icon checkmarks) · `divider line`
(with center icon/ornament variants) · `card box` variants (image+CTA, icon+stat, testimonial card) · `small label`
(eyebrow chips) · `quote` (styled blockquote) · `logo cloud` row · `stats/counters` · `pricing card` pattern ·
`tabs` (content tabs element) · `alert/callout` (policy notes e.g. warranty terms). Button/Accordion/Badge/
Dialog/Toast etc. stay house-kit.
**Do NOT vendor:** navigation headers/footers (our linked-master chrome is bespoke), data-table (admin already
has), charts beyond Recharts usage (stats block uses Recharts already in repo).
**Attribution:** `THIRD_PARTY_LICENSES.md` gets a Tailgrids MIT entry; README credits Tailgrids for vendored elements.

### 5.4 References (Wave 2 usage)

- **TailGrids** — MIT © 2025 Tailgrids (<https://github.com/TailGrids/tailgrids>). Only the free, MIT-licensed
  components; copied at source level into `src/components/tailgrids/{callout,divider,pricing-card,stats-card,tabs}.tsx`,
  token-remapped to WOODEX tokens, with per-file attribution headers. **No** `@tailgrids/*` dependency, no Pro/premium
  files; `THIRD_PARTY_LICENSES.md` (repo root) reproduces the license verbatim. Wire usage: `PricingToggled`→`tabs`,
  `PricingCards`→`pricing-card`, `StatsRow`→`stats-card`, `NewsletterCard`→`callout`, `DividerLine` (element)→`divider`.
- **Puck 0.24 plugin APIs** — `@puckeditor/core` (MIT): official `outlinePlugin({ label: "Layers" })` for the Layers rail
  (collapse-all, per-item duplicate/delete); custom left-rail plugin slot for the **Library** (Sections | UI kit tabs,
  search, category chips, inline-SVG thumbnails, counts); dynamic `resolvePermissions` per block for lock enforcement
  (`drag/duplicate/delete/edit/insert = false`).
- **Recharts** (existing admin dependency, already used on Analytics/Dashboard) — lazy-loaded for the `ChartBlock`
  catalogue section via `React.lazy` so charts stay out of the main storefront bundle (own ~422 kB chunk, admin flow only).
- **Decision (sections in v1):** sections are top-level blocks in `content[]` — no section nesting until the Wave 4
  inspector (Slots). Hidden blocks render `null` on the storefront; the editor shows an amber dashed placeholder badge.
  Locked blocks are inert (native Puck enforcement) and the panel refuses field edits.
- **Insertion UX:** Library "＋" appends the block at the end of the page (insert-after-selected needs Puck's selection
  internals — probed and deferred, Wave 4). A `key`-remount after insert re-reads `data` so canvas + Layers reflect the new block.
- **Canvas is an iframe** (`preview-frame`, `about:srcdoc`) — all in-canvas automation (e2e, acceptance) must query the frame, not the top document.


---

## 6. Wave plan (detailed, v2 re-phased)

### Wave 0 — Spike `[done]` (2026-11-06)
**Scope:** install `@puckeditor/core@0.24.0`; WOODEX block registry (4 blocks, `src/pages-builder/blocks.tsx`);
starter document (`src/pages-builder/starter.ts`); localStorage persistence; admin editor at
`/admin/pages-lab` (nav: ENGAGE → Pages Lab; page title "Pages Lab (spike)"; lazy chunk, Puck CSS vendored
+ stripped of its remote Inter `@import` so the build stays self-contained); read-only storefront render at
`/lab/:slug` (floating "Lab preview — spike, not published" badge, `noindex`, no Header/Footer); gates.
**Verification:** typecheck 0 · lint 0 errors · clean rebuild (Puck ≈301 kB lazy chunk; storefront main bundle
+1.4 kB) · e2e 33/33 · live check **12/12**. CI lesson recorded in §12 and §14.
**Known limitations:** per-browser localStorage; no media picker (image URL text field); scaled canvas;
no multi-page list. All addressed in W1–W2.

### Wave 1 — Foundation: pages slice, tree & draft/publish `[done]` (delivered 2026-11-06 on the PR #4 branch; owner-gated merge)
Demo-DB `pages` slice (same pattern as showrooms/warranty); admin **Pages** workspace per §0A.2: folder tree,
search, `+ New`, top-level model with slugs, draft⇄published, per-page duplicate, history (cap 20) + one-click
revert, slug-collision guard vs `src/App.tsx` routes (unit test). Pages list shows status, updatedAt, SEO score
badge (once W5 lands; placeholder chip before). Publish persists the document only — no auto-deploy.
**Gate:** CRUD round-trip live check; publish/unpublish flips storefront render; revert works; folders CRUD;
e2e gains ≥2 page-store checks.

### Wave 2 — Sections & Elements libraries `[done]` (delivered 2026-11-07, PR #4 branch; owner-gated merge)
Build the §5.1/§5.2/**§5.3** catalogues (elements may be vendored from **free MIT Tailgrids** per §5.3 rules) as Puck-registered components with WOODEX tokens: 40 sections across
10 categories with thumbnail cards, "Label shown in Layers", tabs **Sections · UI kit · Templates · Images**,
category chips (All 40 · Hero · Features · Pricing · Stats & charts · Testimonials · Team ·
Call to action · Content · Forms · Components), **click to add after the selected section** + drag-drop,
and the Elements palette (BASIC + WIDGETS). **Layers panel**: select/reorder/hide/lock sections & elements;
label-driven layer names; lock prevents edit until unlocked.
**Gate:** every catalogued section mounts with sane defaults; all elements placeable; hide/lock honored on
storefront render; alt text required for Image; e2e +4.


**Delivered 2026-11-07 (PR #4 branch).** `src/pages-builder/`: `shell.tsx` (BuilderModeContext store/editor, common hidden/locked layer fields,
`resolveLayerPermissions`), `elements.tsx` (17 elements, fixed lucide icon set), `sections/catalogue-a.tsx` (18 sections: Hero×6, Features×6,
Pricing×3, Stats×3), `sections/catalogue-b.tsx` (22 sections: Testimonials×3, Team×2, CTA×3, Content×4, Forms×4, Components×6),
`sections/ChartBlock.tsx` (Recharts Bar|Line, lazy), `catalogue.ts` (manifest — exactly-40 guard at import, chips with counts),
`thumbs.tsx` (inline-SVG category glyphs), `library.tsx` (Library left-rail plugin: Sections/UI kit tabs + Templates/Images disabled "Wave 3",
search, chips, all-40), `blocks.tsx` rewired (legacy SectionHeading/ImageBanner/ButtonLink kept for seed compat; catalogue FeatureGrid supersedes
the legacy one, same props contract). `blocksPlugin` + `libraryPlugin` + `outlinePlugin({label:"Layers"})` + `fieldsPlugin` wired in PageEditor;
`LibraryActionsContext.insert` appends at end (crypto-ish id, per-block `defaultProps`, `key` remount, toast "Added — drag to reorder").
Tailgrids MIT vendored + token-remapped (`src/components/tailgrids/*`) and wired — no museum files; grep gate: no foreign palette hex, no Pro.
Gates: tsc 0 · eslint 0 errors · production build ✓ (charts stay in their own lazy chunk) · e2e **39/39** (+4: library rail, layers insert, UI kit, /lab/home) ·
acceptance (editor iframe): add → select → hide → amber placeholder → lock engaged → save → `/lab/home` hides the block, seeded page intact, 0 console errors.
Note: "click to add after the selected section" deferred — Library appends at end (Puck selection not exposed safely); tracked for Wave 4.

### Wave 3 — Theme: whole-website tokens `[open]` (3–4 d)
§0A.6 panel exactly as observed, plus **two bundled presets** (owner §11-Q1): `woodex-reimagined` (default) and `woodex-legacy-interior` (brand navy #0C1628 · beige/light surface · Plus Jakarta Sans body+heading): COLOURS (brand navy / text / muted text / page background / light surface /
beige + add/remove/reorder slots), FONTS (body/heading; Google Fonts search **online only** — offline fallback
bundles Inter + Plus Jakarta Sans subsets; empty field = DM Sans per legacy copy), **Base text size** 16px slider,
**HEADING SIZES (DESKTOP)** H1/H2/H3 sliders + **"Use custom heading sizes"** toggle. Stored as CSS custom
properties (`--woodex-*`) on `documentElement`; demo-DB `theme` singleton (versioned snapshots, one-click
restore); export/import JSON for environment moves. Section skins **Original · White · Cream · Navy** per section
instance (class + token swap, navy skin uses light ink at AA contrast).
**Gate:** token edit → all lab pages restyle live; skins ×4 render; snapshot revert; no FOUC (tokens inlined
before first paint via build-time defaults + `data-theme` attribute); e2e +2.

### Wave 4 — Inspector parity + Linked styles `[as built — PR #7]` (6–9 d)
The §0A.8 right inspector, three tabs:
**Content** — Section skin; **Background** `None · Image · Video · YouTube` + **Parallax** toggle ("image stays
fixed…"); Colour preset; Spacing preset; **Overlay**; **Top/Bottom separator**; Container `Boxed|Full`,
`Auto|Full`; **Label (shown in Layers)**; Layout group. **General** — Tag (`<section>`), ID, Title, Aria label,
**Classes** chips (`hm-section`-style; auto `hm-section` on sections; free add/remove with duplicate guard).
**Advanced** — **Animation on scroll**: Effect (None/Fade/Slide/Zoom/…), Delay (ms), Duration (ms, default 700),
▶ **Preview** (plays once on entry; auto-disabled for `prefers-reduced-motion`); **Responsive visibility**
(hide Desktop/Tablet/Mobile).
**Style** — header: **Editing `Desktop ▾` · State `Normal ▾` · Reset**; **Linked styles** radio — **This element
only** (Phase A: per-node CSS variables) vs **`All .hm-* on this page (N)`** (Phase B: managed page-scoped
class rules in a sandboxed stylesheet, `@woodex-page-rules <slug>` layer — never inline styles, never global);
groups: Display · **Typography** (size/weight/family (Jakarta/Inter + search)/align/line-height/letter-spacing/
transform/style/decoration/colour slider) · Size · Margin · Padding · Border · Border radius · Background image ·
**Effects & transform** (hover-achievable transforms behind State: Hover). Canvas gains the inline rich-text
toolbar (B/I/U/S · link · colour · align · A/Aa · size) + "Heading 2" type chip + click-"+" insertion handle.
**Gate:** class rule applies to all N matches and **does not leak cross-page** (unit test); Phase A ships usable
even if Phase B slips; contrast AA on navy skin; keyboard focus visible; axe on lab pages; e2e +4.

**As built (PR #7, 2026-11-07 — owner-merge-gated):** `_inspector` flat-prop composite custom field, post-injected on
**every** block (40 sections + 17 elements + 3 legacy). Content stays in Puck's auto-fields; the inspector renders
**Style | Advanced** tabs. Style: Desktop/Tablet/Mobile segmented device switch driving padding/radius/border/text-align
(static `builder.css` classes — storefront and canvas share one source) and Normal/:hover toggle for background / text /
heading colours (hex + picker, CSS custom-property cascade islands, zero stylesheet injection). Advanced: Tag (sections),
ID, Title, Aria, free classes + `hm-*` opt-in, hide-per-device (`bx-hide-*`), animation on scroll (fade-up/fade-in/
slide-left/zoom-in, `prefers-reduced-motion` honoured). **Linked styles (Phase-B-lite)** are declared at the page root
(root custom field), carry background/text/heading/padding/radius declarations, show a live "N blocks carry this rule"
count, and merge **inline at the wrapper** with order linked ⊂ element — zero leakage (rules travel in the document
itself). `/lab/:slug` applies the merge through `BuilderDocContext`; the editor canvas paints element-level values only
(Puck iframe boundary — honest, documented limitation). A standalone sandboxed stylesheet (`@woodex-page-rules`) and the
inline canvas text toolbar remain open. Two editor-stability defects were fixed en route (Puck re-fed a fresh `data`
identity per keystroke; `plugins` array recreated per render → panel remount/focus loss). Verification: tsc 0 · build ✓ ·
e2e 42/42 · headless functional pass 14/14 (incl. LAB-computed merge assertions).

**Chrome model (owner §11-Q2):** header/footer/announcement are **linked master sections** rendered in-canvas —
one master per chrome part, instances on every builder page; editing any instance edits the master (propagates
everywhere); per-page detach requires a confirm dialog naming the page and the propagation consequence; announcement
additionally supports per-page show/hide. Masters live in the demo-DB `pages` slice as `kind: "chrome"` docs.

### Wave 5 — SEO layer `[done — branch, owner merge-gated]` (2026-11-07)
§0A.7 SEO workspace per page: **Page title** (≤60) + **Meta description** (≤160) live counters; **Focus keyphrase**;
breadcrumb URL preview + **live Google result preview** (title/URL/description render as SERP); **Analyse** button
runs a fully local Yoast-style ruleset (keyphrase present elsewhere?; keyphrase in title/meta/first paragraph/H2?;
title ≤60 & ≥30; meta ≤160 & ≥120; exactly one H1; word count ≥ 300; readability Flesch ≥ 60) with red/amber/green
bullets exactly as legacy; **SEO** + **Readability** score badges; "**Open in SEO manager ↗**" — wired to the W6
MCP audit endpoint (or removed in builds without the MCP service). Publishing blocked (configurable) on:
missing title/description, ≠1 H1, empty focus keyphrase, `noindex` left ON for a published page.
Storefront integration: published builder pages enter **sitemap.xml at build time** (script aggregates demo-DB
or Bagisto `pages`), canonical + og:title/description/image/article:published_time, JSON-LD (BreadcrumbList +
FAQPage/Article per blocks used). robots.txt unchanged; `/lab/*` stays disallowed.
**Gate:** analysis flags missing keyphrase (red) and blesses a golden page (all green + scores ≥ 80);
sitemap includes a freshly published page after rebuild; Rich Results test passes for a FAQ-built page.

**As built (2026-11-07, `arena/87cc179f-woodex-reimagined`):** ships as a **fully local** Yoast-style analyser (`src/lib/seo/analyse.ts`,
pure functions, zero dependencies — no keys, no network) wired into the Pages editor top bar (SEO button + live score chip) and a right-side
sheet (`src/admin/pages/SeoPanel.tsx`): live ≤60/≤160 counters with severity colours, focus keyphrase, breadcrumb URL + Google SERP preview,
red/amber/green checks, SEO + Readability badges (Flesch reported honestly — see below), `noindex` switch and the **strict publish gate (default ON)**
which blocks publishing on missing/too-short title, missing meta description, ≠1 H1 or empty keyphrase; when the gate is switched off, publishing
proceeds behind a confirm dialog. All blockers link to the offending panel. `/lab/:slug` now emits canonical + og:title/description/image/type +
`article:published_time` (published pages) + Twitter card + JSON-LD (BreadcrumbList always, FAQPage from `FaqAccordion` blocks) — smoke-verified
(42/42, +3 new asserts) and axe-clean. `AdminPageSeo` gains optional `noindex` + `strictGate` (backwards compatible). Seed goldens: the real-mirror
Home analyses at **SEO 89 (good)** — every check green except Readability (Flesch 28). Readability is reported **honestly and not softened**: the
plan's Flesch ≥ 60 threshold kept; trade vocabulary scores harshly on the standard formula — re-tuning the metric to bless commerce copy was rejected.
Gate evidence: emptying the stored keyphrase flips the panel red, blocks Publish with a toast naming the violation, keeps the page a draft and the
demo DB unpublished (14/14 live verification). **Deltas from spec (disclosed, not hidden):** (a) sitemap-at-build-time **not implemented** — the
client-side demo DB has no build-time view of published pages; real aggregation lands with the Bagisto seam (Wave 7) — `robots.txt` unchanged, `/lab/*`
stays disallowed; (b) "**Open in SEO manager ↗**" button **removed** — no MCP HTTP service ships in the browser build (agents use MCP `seo_audit_page`
instead; §0A.7 permits removal in builds without the service); (c) "keyphrase in H2" approximated by the body-occurrence check (headings are strings
inside blocks; sections render h2 without a canonical h2-only string source); (d) publish **unpublish** is never gated (gate applies to going live);
(e) Rich Results / sitemap rebuild checks move to W7 with the public route. E2E 42/42 + admin render path e2e-clean; CI remains the canonical gate.

### Wave 6 — AI + MCP build path `[planned]` (5–7 d)
Local **MCP server** (`woodex-builder-mcp`, stdio + optional HTTP) bound to the same pages store — zero cost
(MCP is an open protocol); coding agents (Claude Code, Codex, local LLM agents) connect and get:
`list_pages` · `get_page` · `create_page` · `upsert_section` · `set_theme_tokens` · `run_seo_audit`
(byte-identical verdicts to the W5 panel) · `diff_page` · `draft_publish` — **there is deliberately no
`publish_page` tool**; publish remains a human action in `/admin/pages-lab` after reviewing the diff.
AI-authored documents are drafts with `source:"ai"`, full before/after diff attached to the draft, and validator
output (W4/W5) inlined; **audit log** slice (`woodex.ai.audit.v1`): actor, tool, target, diff hash, timestamp.
Owner decision (§11-Q4): **full generation** — agents may create whole pages from templates, including local-SEO
catalogue fan-out, as drafts (`source:"ai"`) with diff + validator report; owner publishes manually. The MCP surface still contains **no publish tool** — generation ≠ publication.
**Gate:** tool contract test-suite; publish impossible via MCP; audit log records every write; SEO panel and
MCP audit return identical results on the same document; W6 ships only after W4/W5 gates are green.

### Wave 7 — Bagisto CMS mapping `[planned]` (4–5 d)
(The previous "Wave 5" content, renumbered.) JSON page document persisted as Bagisto CMS page with `puck_data`
custom attribute (preferred) or native blocks; extend `src/api/bagisto/*` behind `getAdminApi()`; migration
script reads demo-DB `pages` → writes Bagisto; dual-run via flag `VITE_PAGES_SOURCE=demo|bagisto`; rollback =
env flag. **Gate:** read-path parity; write behind flag; rollback rehearsed.

### Wave 8 — Optional evolutions `[planned]`
tiptap rich-text block; layout presets ("Warranty Landing", "Seasonal Campaign"); scheduled publish; ur/en
hreflang (see `urdu-hreflang-spike.md`); **bulk local-SEO catalogue generation** (legacy's superpower:
city × service matrices from templates, AI-assisted in W6, owner-reviewed); template gallery per persona;
Wayback/diff viewer.

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
| R13 | **Linked styles** ("All .hm-section on this page (9)") implemented as inline styles → broken specificity + cross-page leakage | **High** | PR #7 ships **Phase-B-lite**: rules live in the document root (`_linkedStyles`), merge inline per wrapper (linked ⊂ element) — no stylesheet, no global selectors, zero cross-page leakage by construction. Remaining hardening: standalone `@woodex-page-rules` sandboxed stylesheet; author-facing `hm-*` collision guard |
| R14 | **Theme (whole website)** edit reshapes every page at once (one bad token = site-wide breakage) | **High** | Versioned `theme` singleton snapshots + one-click restore; "Use custom heading sizes" behind explicit confirm; staged preview re-render checklist before save-propagate; a11y contrast check on skins at save time |
| R15 | AI agents (W6) write content that reaches production unreviewed | Medium | No `publish_page` MCP tool exists; AI docs are drafts with `source:"ai"` + diff + validator report; human publishes in admin; audit log slice `woodex.ai.audit.v1` |
| R16 | Parity scope creep (legacy is years of builder) → budget blowout | **High** | Parity acknowledged as ceiling, not MVP; per-wave owner gates; W4 hardest wave split into Phase A/B; if slipping, W6 shrinks to audit-only; W2 catalogue can phase (HERO+FEATURES first, Pricing/Team later) |

**Flags requiring owner decision before Wave 1:** Chrome-singleton exception (R1, recommended yes);
`/p/<slug>` vs top-level slugs (Wave 3); CustomEmbed HTML block (R-blocked, default off); whether builder
pages may shadow reserved routes (`/shop`, `/checkout`, …) — default: never.

---

## 8. Gates & verification (every wave)

1. `bun run typecheck` (0 errors) · `bun run lint` (0 errors; pre-existing warnings tolerated) · clean rebuild
2. `bun run e2e` → 33/33 (grow with module coverage: pages CRUD ≥ +2 checks in Wave 1)
3. Live scripted browser pass for every interactive surface (lab editor, Chrome singleton, publish/rollback)
4. axe on `/lab/*` (Wave 4+) · screenshot parity sign-off for migrated pages (Wave 2)
5. Linked-styles regression: page-scope rules never apply on other pages (unit test with two documents)
6. a11y: visible focus, AA contrast on skins, `prefers-reduced-motion` honored by scroll animations
7. Commit → push `arena/51eb86ae-woodex-reimagined` → PR checks green (frozen lockfile)

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

## 11. Owner decisions (v2.1 — answered 2026-11-06)

1. **Brand system → (c) Both.** Theme (W3) ships two presets: `woodex-reimagined` (default) and
   `woodex-legacy-interior` (navy/beige/Plus Jakarta Sans). One engine, both brands.
2. **Chrome editing → (c) Linked master sections.** Header/footer/announcement render on the canvas like any
   section, but each instance is externally linked to a **master document**; editing any instance writes the master
   and propagates to every page. Per-page detach behind explicit confirm (literal-all preserved; R1 closed).
   AnnouncementBar additionally toggles per page (dismiss state is client-side anyway).
3. **Gating → strict per-wave owner sign-off.** W1→W7 proceed one wave at a time; each wave ends with gates +
   owner click-through before the next starts. No mega-sprint.
4. **AI + MCP → full generation.** W6 agents may create whole pages from templates (e.g. local-SEO catalogue
   fan-out) — always as drafts (`source:"ai"`) with diff + validator report; owner publishes each page manually.
   No publish capability exists in the MCP surface, ever.
5. **Publish permission → owner-only.** Admin staff and AI agents create/edit drafts; **only the owner publishes**.
   Relaxes to roles when Bagisto RBAC lands (W7). Interim: Pages workspace shows Publish controls only for the
   owner account (W1 implements via env/demo-config owner check).
6. **Legacy 81-page catalogue → stay separate.** This builder targets the WOODEX Reimagined furniture site;
   the legacy interior catalogue is never ported into this repo. (W8 bulk-template fan-out may still create
   furniture-site local-SEO pages, subject to §11-Q4.)
7. **NEW — Tailgrids elements kit (Q5 follow-up):** adopt **free MIT Tailgrids components** to complete the
   Elements palette for UI elements we lack or rebuild worse (§5.3). Premium TailGrids blocks/templates are
   out of scope permanently. License verified 2026-11-06 (LICENSE.md: MIT, © 2025 Tailgrids).

### Decided (2026-11-06, this session)
PR #3 merged (owner: "yes, merge") · zero-cost hard constraint · literal-all scope · `@puckeditor/core@0.24.0`
(MIT) chosen · bun.lock CI proven green after `ws`-duplicate fix · PR #4 (docs) OPEN, unmerged by owner's
"just the docs commit" instruction · master plan upgraded to v2.0 (this revision).

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
queued as PB-1…PB-7 (v2 renumbering) with owners implied (agent) and gates from §8. This document is the
strategy; the to-do file is the tracker — update both in the same commit per wave.

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
- **2026-11-06 (Wave 1, local)** — Foundation implemented locally on `arena/51eb86ae-woodex-reimagined`
  (unpushed at time of writing; delivery vehicle = owner decision — PR #4 is docs-only). Demo-DB `pages` slice
  (Puck-shaped JSON docs, history ≤20, slug registry), `/admin/pages` workspace (folder rail, search,
  new/duplicate/delete, draft⇄published switch), `/admin/pages/:pageSlug` editor (Puck bound to the DB; publish
  gated to the owner session; drafts for everyone), `/lab/:slug` storefront preview of any-status pages with
  published/draft badge, seeded published `home` page; bagisto adapter throws 501 (Wave 7). Pages Lab spike retired
  (`PagesLab.tsx`, `starter.ts` deleted). Gates: tsc 0 · eslint 0 errors · production build ✓ · e2e **35/35** (+2) ·
  live CRUD acceptance 10/10, 0 console errors. Local note: the committed `package-lock.json` is stale vs
  `package.json` (npm `ci` cannot run) and bun.lock resolves tarballs from the Lovable pkg.dev cache (blocked here);
  local verification used public npmjs grafts under node_modules only — tracked files untouched; CI (bun + pkg.dev)
  remains the canonical gate.
- **2026-11-07 (Wave 2, local)** — Sections & Elements libraries + Layers + Tailgrids completion implemented on
  `arena/51eb86ae-woodex-reimagined` (unpushed at time of writing; PR #4 delivery vehicle). All §5.2 sections mounted
  with hidden/locked layer fields + `resolveLayerPermissions`; hidden renders `null` on storefront (amber placeholder in editor);
  lock is inert in canvas and refused at the panel (verified live). Layers = official `outlinePlugin` (custom TSX panel cancelled —
  Puck 0.24 ships built-in Outline). Library rail = Sections | UI kit (+Templates/Images disabled, "Wave 3"); chips with live counts
  ("All 40" …), search, inline-SVG thumbnails. Insertion = append-at-end via `LibraryActionsContext` + `key` remount (insert-after-selection
  probed, deferred). Elements kit completed with **free MIT Tailgrids only** — vendored to `src/components/tailgrids/*`, token-remapped,
  attribution in `THIRD_PARTY_LICENSES.md` (verbatim MIT); grep gate: zero foreign palette hex / Pro references; house-first (no existing house
  component was replaced except the legacy FeatureGrid, superseded by the catalogue twin with identical props). Recharts kept out of the main
  bundle (lazy Chunk). Settings banner no longer overpromises a one-env Bagisto flip (501 stubs called out honestly). Gates: tsc 0 · eslint 0 ·
  build ✓ · e2e **39/39** (+4) · live acceptance (iframe canvas): add → hide (placeholder) → lock → save → storefront hides the block, seeded
  page intact, 0 console errors. Insert-after-selection + section Slots land with the Wave 4 inspector; MCP seo tools follow as a separate small PR.
- **2026-11-07 (MCP SEO micro-PR, post-W2)** — Owner directive: separate small read-only MCP slice. `src/lib/mcp/tools/seo.ts` adds
  `seo_audit_page` (deterministic advisory audit of `/`, `/product/<id>`, `/blog/<id>`, `/service/<slug>` from the image-free snapshot:
  title 30–60 · description 120–160 · optional focus-keyphrase in title/description/density · body depth ≥300 words · headings · slug hygiene;
  weighted 0–100 score + concrete suggestions) and `seo_generate_meta` (template-based title/description/OG/Twitter/slug suggestions with
  word-boundary 60/160 trims, keyphrase front-loading analysis, stuffing detection). No external calls and no write paths — `readOnlyHint`,
  `idempotentHint`; the write-tool set (`create_page`/`upsert_section`/`run_seo_audit`/…) remains Wave 6 / PB-6. `supabase/functions/mcp/index.ts`
  regenerated with the changes while keeping the locked `npm:@lovable.dev/mcp-js@3.0.4` specifiers (no version drift). The local gate environment
  had no node_modules, so the bundle was hand-spliced from source (strip/rename rules matched against the mcp-js output); handlers were executed
  against the live snapshot via a stubbed-tool harness (all page types, error paths, stuffing case — all pass) and the spliced bundle parses clean
  (`vm.SourceTextModule`). CI (bun + pkg.dev) is the canonical gate for this slice. MCP `version` → 0.2.0.
  CI note (2026-11-07, resolved) — earlier probe pushes (551f0db, bbbc707) attributed the Typecheck failure to the
  environment; the owner subsequently posted the failing runner log: `seo.ts(120,3) TS2322` — the audit handler's
  `structuredContent` was not assignable to mcp-js's `JsonValueInput` because `checks` was typed via an interface
  (interfaces carry no implicit index signature). Fix (in this branch): `interface AuditCheck`/`interface SeoPage` →
  type aliases; handler annotations already explicit. Verified red → green locally with a JsonValueInput-faithful
  `ToolHandlerResult` stub (the old source reproduced TS2322 at the same position; the fixed source compiles clean),
  full runtime harness re-run (scores unchanged: 60/45/28/50/60), and the bundle re-spliced from the fixed source
  (parses clean, mcp-js 3.0.4 pins preserved). Lesson recorded: with pkg.dev unreachable from the agent sandbox,
  "environment" was asserted before fixing the one visible type defect — owner log screenshots are authoritative.
- **2026-11-07 (Builder Home = real storefront mirror)** — Owner directive: "replace demo to real home page — run-time live, drag & drop."
  The Pages-builder Home document now mirrors the live storefront home instead of the placeholder starter ("Furniture that
  outlasts the brief"): hero copy from slide 1, the tagline strip, the 5-service strip, the 8 circular category tiles
  (new `CategoryCircles` block; images committed under `public/assets/home/` as stable paths), "Latest Collection" rendered
  **live from the catalog** by the new `ProductRail` block (best sellers / new / all, `/product/<id>` links, real PKR prices),
  Our Services checklist (services-office.webp), project bento, the 5 real Google reviews, 10 real client names, the 6 real
  FAQs, and the WhatsApp-first CTA. Storefront `/` is untouched; `/lab/home` and the Pages editor render the document. Two new
  builder blocks registered (`CategoryCircles`, `ProductRail` — 42 registered blocks total; the 40-catalogue count is unchanged).
  Persisted browsers carrying the untouched starter doc are auto-upgraded by a one-time migration in `src/api/demo/db.ts`
  (`woodex.pages.home-v2`, only when the stored Home still matches the pristine starter; user edits are preserved). e2e smoke
  expectation updated to the new hero copy. WorkspacePlanning carousel deliberately not mirrored in the quick fix.
- **2026-11-07 (Wave 5 — SEO layer, PB-5)** — Owner selected "Wave 5 — Pages SEO layer" from the wave menu. Implemented on
  `arena/87cc179f-woodex-reimagined`: `src/lib/seo/analyse.ts` (pure-function Yoast-style analyser + Puck document text extractor;
  Flesch reading ease; 9 equal-weight checks; hard publish-gate violations separated from advisory checks) and
  `src/admin/pages/SeoPanel.tsx` (right sheet: URL + SERP previews, live 60/160 counters, focus keyphrase, SEO/Readability badges,
  red/amber/green analysis list with an Analyse button, noindex switch, strict-gate switch). Pages editor: SEO toggle button with live score
  chip in the top bar; gate enforced in `doPublish` before any write (owner restored-into-publish also gated); panel state persists to
  `AdminPageSeo` (`noindex?`/`strictGate?` — optional, backwards compatible) on Save draft. `/lab/:slug`: canonical + OG/Twitter + published-time
  + JSON-LD BreadcrumbList + FAQPage (from FaqAccordion) with scoped cleanup on unmount. Seed Home re-keyed to `office furniture` and its SEO
  title/meta rewritten to the plan's own limits (57/157 chars) — analysis now reads SEO 89 / 8 of 9 checks green (readability honestly bad, Flesch 28).
  Golden-path live verification 14/14 (panel renders, seed passes the default gate, emptying the keyphrase blocks Publish with a visible reason and
  keeps the draft unpublished). "Open in SEO manager ↗" removed (no MCP service in browser builds); build-time sitemap deferred to Wave 7 with the
  Bagisto seam (client-side demo DB is invisible at build time — documented, not hidden). e2e 42/42 (+3 JSON-LD/canonical asserts) · axe 7 routes 0
  violations · tsc 0 · build ✓. Owner merge-gated.
- **2026-11-07 (Wave 4 — Inspector + Linked styles, PB-4)** — Owner selected **Full Wave 4** from the wave menu.
  Built on `arena/d1d750ce-woodex-reimagined` (PR #7, owner merge-gated): `_inspector` flat-prop composite field post-injected on
  **all** blocks (40 catalogue sections + 17 elements + 3 legacy). **Style** tab — Desktop/Tablet/Mobile segmented switch
  driving padding/radius/border/text-align through static `builder.css` classes (shared storefront/canvas source); **Normal/:hover**
  toggle for background / text / heading colours via hex+picker and CSS custom-property cascade islands; heading-colour overrides
  apply through descendant rules (no `!important` except the single hover-background override). **Advanced** tab — Tag (sections),
  ID, Title, Aria, free classes with `hm-*` opt-in, **responsive visibility** (hide per device), **animation on scroll**
  (fade-up/fade-in/slide-left/zoom-in, `prefers-reduced-motion` honoured). **Linked styles (Phase-B-lite)** at the page root —
  named `hm-*` rules (background/text/heading/padding/radius) with a live "N blocks carry this rule" document scan; merge happens
  inline at the wrapper, linked ⊂ element; rules travel inside the page document so there is no global/cross-page leakage by
  construction (R13 until the standalone `@woodex-page-rules` stylesheet lands). LAB preview applies the merge through
  `BuilderDocContext`; the editor canvas paints element-level styles only (Puck iframe — documented limit). Remaining Wave 4
  item: **inline text toolbar** (deferred to the next slice). Two editor-stability defects were fixed first because they made
  in-panel editing impossible: (1) fresh `data` identity per keystroke re-fed Puck and ate edits — frozen per-`puckKey` snapshot;
  (2) `plugins` array recreated per render tore the editor down per keystroke — memoized. Pages meta bar gains **Live home ↗**
  (partial answer to the owner's "no preview actual rendering as live home page" note; the deeper `/lab/home`-as-live-home question
  remains open for owner decision). Verification: tsc 0 · build ✓ · e2e **42/42** · headless functional pass **14/14** (Advanced
  tab slots, device switch, `:hover` slot, class binding, linked-rule rename + live count, LAB computed merge —
  `bx-lg-t bx-sm-m hm-verify bx-has-bg-hover` on the rendered hero, linked `#0C1628` applied, `data-animate="fade-up"`).
- **Next** — Owner answers master plan §11 → Wave 1 (PB-1) kickoff; B4 (Custom Design) remains next Phase 4
  module; Vercel cutover checklist is owner-side.
- **2026-11-06 (evening, v2.0)** — Owner shared five screenshots of the **legacy Woodex Interior builder**:
  pages tree (`(top level) 81`), Sections/UI-kit/Templates/Images tabs (All 40, HERO·4, FEATURES·5…), Elements
  palette, Layers rail, **Theme (whole website)** (colours incl. brand navy #0C1628, muted text, page background,
  light surface, beige; Plus Jakarta Sans; 16px base; H1 72/H2 48/H3 22 + custom toggle), **SEO** panel
  (title 56/60, meta 151/160, focus keyphrase, live Google preview, SEO 60 / Readability 86 badges, red/green
  analysis), **Content/Style/Advanced** inspector (Section skin Original/White/Cream/Navy; animation on scroll
  with delay/duration + Preview + reduced-motion note; General Tag/ID/Title/Aria/Classes chips; Responsive
  visibility; Style tab with Desktop/Tablet/Mobile × Normal/Hover, **Linked styles** "this element only vs
  All .hm-section on this page (9)"; Background Image/Video/YouTube + Parallax; separators; effects & transform;
  inline text toolbar). This plan was upgraded to v2.0: anatomy §0A · requirements §1.8–1.10 · catalogues §5.1/§5.2 ·
  waves re-phased **W1 foundation → W7 Bagisto** (W8 = evolutions) · effort re-estimated §3.2 (≈37–54 d, gated) ·
  risks R13–R16 · open questions §11 regenerated. Screenshots were transcribed, not copied; assets stay with the owner.
- **2026-11-06 (late, v2.1)** — Owner Q&A round: **Q1 both brand presets** · **Q2 linked master chrome** (in-canvas,
  propagate-to-all, detach behind confirm) · **Q3 strict per-wave gates** · **Q4 full generation, draft-first,
  owner publishes** · **Q5 owner-only publish + Tailgrids (MIT) to complete the Elements kit for missing
  elements** (adoption plan §5.3: copy-in vendored to `src/components/tailgrids/*`, mandatory WOODEX token
  remap, house-first rule, free components only, attribution + grep gate on Tailgrids palette hex / Pro imports) ·
  **Q6 furniture site only; legacy catalogue stays separate**. §11 rewritten as decisions; effort re-estimated
  (W6 5–8 d; total ≈37–55 d). Tailgrids license verified directly against the repository LICENSE.md (MIT, © 2025).
