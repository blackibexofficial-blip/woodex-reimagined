# WOODEX — Upgrade To-Do (admin ↔ storefront completion)

> **Purpose:** turn the remaining "Spree / Medusa style" gaps into a concrete, sequenced build plan.
> Single source for this phase of work. Companion to `docs/08-master-plan/README.md` (older doc;
> where they disagree on *this* phase, this one wins).
>
> **Owner-confirmed decisions (2026-11-06, chat):**
> - **Scope:** everything, phased — Phase 1 Content & storefront ops → Phase 2 Commerce ops → Phase 3 Product depth.
> - **Payment:** WhatsApp-first manual verification — no real gateway until merchant credentials exist (Easypaisa/JazzCash/bank transfer details stay manual).
> - **Data:** demo DB (`woodex.admin.db.v1`) for all new modules — consistent with everything shipped so far; Bagisto writes stay 501 until backend is provisioned (master-plan Phase 3).
> - **This file** is the tracked to-do list; keep it updated per module (check items off in the same PR).
>
> **Status legend:** `[ ]` pending · `[x]` shipped & verified · `[~]` in progress
>
> **Build ladder (this phase):** module per commit → build + typecheck + lint → e2e 33/33 → push → checks green.

---

## Phase 1 — Content & storefront ops (public pages get real admin)

Goal: every public storefront module that today is code-managed (`src/data/*`, inline constants) gets
demo-DB-backed admin CRUD, and the storefront reads it live. Pattern = showrooms (Module 4, `a6e9778`):
demo DB slice + admin page + storefront read with static-data fallback.

- [x] **P1.1** WhatsApp-first manual payment confirmation — checkout success screen now opens WhatsApp with a
  pre-filled confirmation (order ref, items, total, payment method, customer name/phone). Admin Orders already
  deep-links to the customer's WhatsApp (`src/admin/pages/Orders.tsx` — `MessageCircle` button + PK-format
  normaliser); verified consistent.
- [x] **P1.2** Materials & Colors — one demo-DB slice `materials` (39 seeded rows: 16 image finishes from
  `src/data/materials.ts` + 23 hex swatches from `src/data/materialsPage.ts`), full admin CRUD at
  `/admin/materials` (search, category tabs, image/hex, applicable parts, active toggle, sort order),
  room configurator reads live via `useMaterials()` (static fallback), `/materials` renders hex swatches
  live (static fallback). Live check 9/9 (create → visible on storefront → delete) · e2e 33/33 · 0 console errors.
- [x] **P1.3** Projects (case studies) — inline data extracted to `src/data/projects.ts` (single source; the
  duplicate divergent copies in `Projects.tsx` / `ProjectDetail.tsx` are gone), demo DB slice `projects`, full
  admin CRUD at `/admin/projects` (core + images + content + per-line furniture list + testimonial/rating +
  visibility/sort), `/projects` and `/projects/:id` read live via `useProjects()` with static fallback. Rich
  case-study sections hide gracefully on admin-created entries. Live check 9/9 (list, filter, detail, create →
  storefront → detail → delete, 0 console errors) · e2e 33/33.
- [x] **P1.4** Blog / Journal — `/admin/blog` full editor: search + category filter, create/edit dialog (article,
  excerpt, image, tags, date picker, read time, featured/Editor's Pick, publish switch, ordered content-block editor
  with heading + body, move/add/remove), star toggle for featured, delete confirm. Storefront `/blog` + `/blog/:id`
  read live via `useBlogPosts()` (ready-gated — deep links to admin-created posts no longer bounce to /blog; fixed
  during live verification). Category filter on `/blog` now actually works (was dead UI). Legacy date format
  ("Feb 15, 2025") still renders; ISO everywhere new. Live check 9/9 · e2e 33/33 · 0 console errors. Sitemap is
  build-time static — admin-created posts enter sitemap.xml on the next deploy (documented in the page footer).
- [x] **P1.5** Services — `/admin/services` full editor: search + table (number, title/slug, tagline, steps/FAQs
  counts, active switch, edit/delete), tabbed dialog (Core / SEO / Overview / Process steps / Benefits / Inclusions
  one-per-line / FAQs / Case study / related-service pills excluding self / Visibility + sortOrder); wholesale nested
  replace on save; slug immutable on edit, auto-deduped on create; create auto-numbers `number` and bumps `sortOrder`.
  Storefront `/services` reads the live catalogue after the owner's page redesign (main 1fb680b/97942a3/8092ed0/69985d3
  removed the catalogue grid — hero + highlight cards now resolve against live *active* services; admin-created services
  are reachable via `/services/:slug` and any editorial links). `/services/:slug` ready-gated (same deep-link redirect
  class as P1.4 — fixed preemptively) and reads live related rail. Live check 8/8 pre-redesign
  (7 seeds → create→storefront + deep-linked detail → delete→7) · e2e 33/33 · 0 console errors. Inactive services
  redirect to /services on direct URL. Sitemap stays build-time static — admin-created services enter on next deploy
  (documented in the page footer). Bagisto backend stubbed 501 (CMS slice not provisioned).
- [x] **P1.6** Content hub refresh — `/admin/content` retired the read-only placeholder (static `src/data/*` listings)
  and is now a launchpad: one card per editor (Materials & Colors, Projects, Blog, Services) with live content counts,
  client-side "Open editor" routing and a storefront "view live" link; intro banner notes instant demo-store
  publishing + build-time sitemap lag. Live check 6/6 · e2e 33/33 · 0 console errors. **Phase 1 complete.**

## Phase 2 — Commerce ops (Spree-style order lifecycle)

Goal: orders stop being "shipped/delivered" only — returns, exchanges, claims, draft orders, quotes, and the
purchasing side (suppliers, POs, transfers). All demo DB; each module links back to the existing order/inventory
slices instead of duplicating them.

- [x] **P2.1** Returns — `/admin/returns`: create/track/close RMAs with reason codes (damaged / wrong item / not as
  described / changed mind / other), line-item selection with qty steppers (capped at ordered qty), requested →
  received → inspected → refunded | replaced | rejected pipeline with transition guards, receipt inspection note,
  refund amount editable at inspection (prefilled from line value), optional restock on receipt posting `return`
  stock movements (reuses adjustLineStock), full lifecycle noted on the order timeline. Seeded from delivered
  orders (RMA-1001 requested / RMA-1002 inspected). Entry point from delivered orders ("Request return" button in
  the order dialog → deep link opens the create flow via ?new=1&order=). Live check 12/12 (seeds → create →
  full pipeline → timeline assertion) · e2e 33/33 · 0 console errors. Bagisto stubbed 501 (no RMA in Bagisto core).
- [x] **P2.2** Exchanges — `/admin/exchanges`: replace item(s) on a delivered order with catalogue picks. Incoming
  lines snapshot order lines (qty capped), outgoing picked via debounced catalogue search; price difference
  (outgoing − incoming) computed live in the form and shown in the table/dialog with pay/refund hints + a
  manual "difference settled" toggle. Pipeline requested → approved → shipped → completed (+ rejected, requested-
  stage only) with transition guards; dispatch posts `outbound` stock movements for replacements, completion restocks
  incoming lines; every step noted on the order timeline. Optional link to a return of the same order (returnId).
  Seeded EXC-1001 (approved, ↔ RMA-1001, deterministic from delivered orders). Entry point from delivered orders
  ("Request exchange" button next to Request return). Live check 10/10 (seed → create → approve → dispatch →
  complete → timeline assertion) · e2e 33/33 · 0 console errors. Bagisto stubbed 501 (no exchange in core).
- [x] **P2.3** Claims — `/admin/claims`: warranty / damage / defect claims pipeline (reported → assessing →
  approved | rejected → resolved) with transition guards, 5-year warranty messaging banner, linked-order timeline
  notes, optional WOODEX cost absorption recorded on resolution, walk-in claims supported (no order needed).
  Seeded CLM-1001 (assessing · warranty) + CLM-1002 (reported · damage). Entry point from delivered orders
  ("File claim" deep links). Live check 8/8 · e2e 33/33 · 0 console errors. Bagisto stubbed 501.
- [x] **P2.4** Draft Orders — `/admin/drafts`: manual order building (customer + catalogue lines or free lines);
  searchable/filterable list (all/draft/converted); totals auto-recalc; convert → pending order via the shared
  `materializeOrder` path (source channel `manual`, same WDX-seq + customer-aggregate roll-in as `createOrder`);
  converted drafts lock (edit/delete/convert disabled); seeded DRF-1001 (Indus Developers — Procurement).
  Live check 20/20 (create → edit qty → convert COD → WDX-1065 visible in Orders · 0 console errors) · e2e 33/33 ·
  Bagisto stubbed 501.
- [x] **P2.5** Quotes — `/admin/quotes`: priced quotations (catalogue/free lines, discount %, validity days,
  valid-until tracking with derived expired badge); create from a CRM lead ("Create quote" on Leads → advances
  lead to quoted, prefills contact, links leadId) or from scratch; chrome-free printable `/admin/quote/:id`
  (discount carried onto the converted order + shown on the invoice); convert → pending order via the shared
  `materializeOrder` path (channel `manual`, discountPct/discountAmount on the order). Seeded QOT-1001
  (Bilal Ahmed · sent) + QOT-1002 (Ravi Agro Foods · accepted). Leads nav label clarified to "Leads".
  Live check 24/24 (incl. invoice Discount row · 0 console errors) · e2e 33/33 · Bagisto stubbed 501.
- [x] **P2.6** Suppliers — `/admin/suppliers`: purchasing master (company, contact, city, phone/email, NTN,
  payment terms advance/COD/Net-15/30/45, notes, active flag); searchable; delete blocked when referenced by
  POs (deactivate instead); live check 13/13 · e2e 33/33 · Bagisto stubbed 501. Seeded SUP-1001 Pak Wood &
  Timber Co · SUP-1002 Sheikh Sawmills · SUP-1003 MetalKraft · SUP-1004 Al-Noor Foam. Nav group "Purchasing".
- [x] **P2.7** Purchase Orders — `/admin/purchase-orders`: create PO to supplier (catalogue lines at 60% cost
  default — editable per line, or free lines); expected date; draft → sent → partial → received; cancel blocked
  once anything is received; receive dialog supports partial receipts — catalogue lines lift on-hand stock and
  write inbound movements (`Purchase order PO-… receipt` in the ledger); draft-only edit/delete; overdue badge.
  Seeded PO-1001 (draft · Pak Wood) + PO-1002 (sent · MetalKraft). Live check 27/27 (create → send → partial
  receive → full receive → movement in /admin/inventory · cancel · delete · 0 console errors) · e2e 33/33 ·
  Bagisto stubbed 501.
- [x] **P2.8** Stock Transfers — `/admin/transfers`: records move stock between the factory warehouse
  (`loc-warehouse`) and the showroom master (active showrooms via `getTransferLocations`); movement type
  `transfer` — dispatch writes OUT legs (−qty at source, stock leaves available) after an on-hand availability
  check, receipt (full/partial, remaining pre-filled) writes IN legs and returns stock to available; draft →
  in_transit → received; draft-only edit/delete; catalogue lines only (real tracked stock). Seeded TRF-1001
  (received · warehouse → Lahore HQ chairs) + TRF-1002 (in transit · warehouse → Karachi staff tables).
  Live check 31/31 (create → dispatch → partial → full receive, stock deducted then restored, ledger legs in
  /admin/inventory · delete draft · 0 console errors) · e2e 33/33 · Bagisto stubbed 501.

## Phase 3 — Product depth (Medusa-style)

- [x] **P3.1** Product Options & Values — `/admin/options` (Commerce nav): Finish / Fabric / Size master with
  price-delta values (+/- PKR) and SKU suffixes; seeds clone the static storefront master (`src/data/options.ts`)
  1:1 into the admin demo DB (editable independently); products attach sets (Products → edit → Option sets chips;
  seeded deterministically by subcategory/category rule table); create/edit/delete sets with inline value rows;
  delete refused while attached (usage counter shown). Attach consumed by PDP in P3.2. Live check 17/17 · e2e 33/33 ·
  Bagisto stubbed 501.
- [x] **P3.2** Variant selection on PDP — `/shop/:id` selects each attached set (Finish/Fabric/Size chips with
  +/- PKR deltas); price, SKU suffix (`<id>-DW-LE-C`) and JSON-LD sku update live; cart and quote lines are
  keyed by variant (`variantKey` = product + value ids + colour) and carry `variantLabel` end-to-end (drawer,
  checkout summary, quote basket, printable invoice, checkout order payload + order lines persist `sku`);
  stock remains product-level (documented). Live check 22/22 · e2e 33/33.
- [x] **P3.3** Spec table per product — factory specs were already seeded (`specifications` label/value rows,
  rendered by SpecificationTabs on the PDP); now: Product JSON-LD emits `additionalProperty` PropertyValue rows
  (verified live in the ld+json script); the admin Products editor gained a free-form spec table (add/remove
  label/value rows, seeded from the factory table) with save → demo-DB persistence round-trip (verified live);
  `AdminProduct.specs` (+CSV-style round-trip via updateProduct patch). JSON-LD Product `sku` already varies by
  variant selection (P3.2). Live check 11/11 · e2e 33/33 · lint 0 errors.
- [x] **P3.4** Advanced category control polish — EVALUATION: per-category default option sets were already
  delivered in P3.1 as the rule table (`src/data/options.ts` — subcategory first, category fallback) and are live
  on the PDP; turning the table into a DB-overridable per-category config would be gold-plating against the
  static storefront. Polish shipped instead: the admin Categories tree now shows each category's resolved
  "PDP defaults" inline (Finish · Size / Finish · Fabric …) so the rule table is legible to the owner — live
  check 4/4 · e2e 33/33.
- [x] **P3.5** Translations groundwork — SPIKE DONE (evaluate + report, no full build): measured inventory
  (~313 JSX text nodes / 105 storefront files, no i18n lib, sitemap generated from data modules — 182 URLs,
  `scripts/generate-sitemap.ts`); options A (full /ur + RTL audit, 6–10 wks) / B (chrome-only Urdu, 2–3 wks,
  hreflang only for routes that exist in Urdu) / C (defer with groundwork) documented with full hreflang
  mechanics; **RTL audit identified as the hidden cost**; recommendation: defer for launch, A/B/C is an owner
  decision — see `docs/08-master-plan/urdu-hreflang-spike.md`.

## Owner decisions (2026-11-06, after the Phase 4 audit)

- **Sequencing:** finish Phase 2 remainder (P2.4 Draft Orders → P2.5 Quotes → P2.6 Suppliers → P2.7 POs →
  P2.8 Transfers) → Phase 3 (P3.1–P3.5) → Phase 4.
- **Phase 4 first pick:** **A1 — Product editor upgrade** (legacy parity: old/current price, SKU, stock, Best
  Sellers + Sale Item toggles, descriptions, images, Collection + Furniture Series pickers).
- **Payment:** keep COD + bank transfer + WhatsApp confirmation. No gateway work now; revisit with merchant creds.
- **Laravel / Bagisto:** **Bagisto later (recommended & approved)** — React demo admin stays the working surface;
  no new Laravel package in this repo now. Provision Bagisto on owner's hosting when ready, then wire the React
  admin adapters to it incrementally (501 stubs already documented per module). docs/07 stays the reference.
- **Furniture Series:** a **separate entity** (own admin page, own storefront /series/:seriesId, FK on products) —
  NOT unified with collections.
- Reference repos (spree/spree, spree.sh dashboard, bagisto/nextjs-commerce) are design references only.
- **P3.5 (2026-11-06):** **Option C — defer Urdu / hreflang for launch** (English-only, groundwork stays:
  `en_PK` locale, sitemap + JSON-LD language metadata already correct; no fake hreflang). Revisit when Urdu
  demand is real; options A/B documented in `docs/08-master-plan/urdu-hreflang-spike.md`.
- **Phase 4 order (owner-picked):** A1 (done) → **B1** (done) — further Phase 4 sequence undecided.
- **PR #3 (2026-11-06):** keep open; continue stacking work on the branch. Do NOT merge without explicit owner request.

## Phase 4 — Owner audit upgrades (legacy lbpanel + Spree parity) — proposed, pending owner priority

Captured from the owner brief (screenshots of the legacy woodexfurniture.pk/lbpanel product + category forms,
Spree dashboard map, and the current React build). Not sequenced yet — owner to pick priority order (see questions).

### A. Catalogue parity (legacy admin has these today; our admin doesn't fully)
- [x] **A1** Product editor upgrade — legacy parity delivered (React admin Products → edit): Old vs Current price
  advisory line (computed, incl. strike-through % on PDP terms) · Stock + SKU (existed) · **Best Seller** relabelled
  from "Featured" · **Sale Item** toggle — deliberately backed by the single compare-at source of truth
  (on ⇔ compareAtPrice > price; ON seeds ≈ +15%, OFF clears; list shows a SALE badge) · Short Description +
  Product Details fields (seeded from the static catalogue) · free-form Spec table (P3.3) · multi-image gallery
  (URL-per-line editor + thumbnail strip, primary = images[0] synced on save) · **Collections picker** (manual
  collections only, chips, membership diffed + synced on save via updateCollection) · **Furniture Series** picker
  (static series list, FK `seriesId`, matches /series/:seriesId). Storefront remains static by accepted
  architecture (admin edits don't leak to PDP). Live check 22/22 (seed render · Sale Item OFF/ON round-trip · short
  desc/gallery persisted · Series picker · collection membership flip persisted · 0 console errors) · e2e 33/33 ·
  lint 0 errors.
- [x] **A2** Furniture Series taxonomy — managed master delivered: demo DB entity `AdminSeries` (slug, name,
  tagline, badge, description, features[], accent color, sortOrder, active) + `/admin/series` (list/search/CRUD/
  Live-Hidden toggle, linked-product count from the admin catalogue, delete refused while products or the static
  catalogue reference it; HQ-style uniqueness for slugs enforced on create). A1’s product-editor Furniture Series
  picker now reads the admin master (static seriesList fallback). **Storefront `/series/:seriesId` pages stay
  static until the Bagisto cutover** — the admin master is the working surface and the SEO/URL layout is unchanged.
  Build note: named imports from `@/data/products` mis-wire inside the shared demo-db chunk in production builds
  (unbound identifier at module evaluation → blank admin until fixed); series seed is inlined in db.ts with a
  keep-in-sync note, and `bun run e2e` (33/33) now guards this class of failure. Owner decision still stands:
  Series = separate entity, NOT unified with collections. Live check 27/27 (seed render · count 88 · search ·
  toggle · create/delete of unreferenced Staff Series · delete-guard for Ek Series · edited tagline persisted ·
  A1 picker fed by master · 0 console errors) · e2e 33/33 · lint 0 errors. Data drift caveat: seed copy in
  `SERIES_SEED` (db.ts) vs `seriesList` (`src/data/products.ts`) — edit both until Bagisto owns it.
- [x] **A3** Product Brands — DONE: `AdminBrand` entity + `/admin/brands` (list/search/CRUD/Live-Hidden toggle,
  website + logo, linked-product count, delete refused while products reference it; slug auto-derived & locked).
  Catalogue seeded with house brand **Woodex** (`brandId: "woodex"` cloned onto all seeded products; new products
  default to it). Products: **filter in /admin/products** (brand select) · **Brand picker** in the editor
  (after Furniture Series) · **Bulk editor**: "Brand" action (set brandId on selected rows) + brand filter column —
  bulk round-trip verified (assign → count 2 → reassign → count 0). Bagisto adapter = 501 stubs. Live check
  35/35 · e2e 33/33 · lint 0 errors · clean rebuild verified. Storefront unchanged (catalogue is Woodex).
- [ ] **A4** Product Attributes — option sets & values (Finish, Size, Fabric…), values can adjust price and carry
  SKU suffix. **Overlaps P3.1 — do not duplicate; treat P3.1 as the implementation task.**
- [x] **A5** Category editor upgrade — DONE: `AdminCategory` gains `heroStyle` (standard/split/full-width/minimal),
  `homepageBestSellers` / `homepageCarousel` switches (row chips in the tree), `shortDescription` (hero sub-copy),
  `backgroundImage` (URL + thumbnail preview), `longDescription`. Legacy lbpanel parity block sits in the edit
  dialog; slug/parent/sortOrder untouched. Create flow carries the same fields. Hero/flags/copy persist via
  `updateCategory`. Live check 34/34 · e2e 33/33 · lint 0 · clean rebuild · real `tsc -p tsconfig.app.json` exit 0.
  Process note: root `npx tsc --noEmit` is vacuous (solution tsconfig with `files: []`); local typecheck must be
  `bun run typecheck`, which mirrors CI’s Typecheck step — CI was already gating correctly all along.
- [x] **A6** Homepage section control — DONE (`/admin/homepage`, Commerce nav): two rails (Best Sellers / Home
  Carousel), each with mode `auto` (flags-derived preview) or `manual` (explicit pick, up/down ordering, cap 12,
  dedup). Auto preview reads honestly (best sellers = isBestSeller by reviews desc top 8; carousel = in-stock by
  reviews desc top 6). `getHomepageSections` / `updateHomepageSections` on AdminApi; demo DB master bundle with
  seed; stale ids pruned on save (intersect with DB) with a warning chip; auto mode clears picked ids. NOTE: A6 is
  the SITE-WIDE homepage rail master — A5's per-category `homepageBestSellers`/`homepageCarousel` switches are a
  DIFFERENT, category-level surface; both kept. Bagisto cutover maps these to Bagisto CMS blocks. Storefront
  stays static until cutover (admin is the working surface). Live check ALL PASS (nav · auto previews · manual
  pick ×2 · reorder persists across reload · back to auto · 0 console errors) · e2e 33/33 · lint 0 errors ·
  clean rebuild · `bun run typecheck` exit 0.

### B. Storefront surfaces with no admin editor yet
- [x] **B1** Showrooms admin — DONE (`/admin/showrooms`): list/search/create/edit/delete; fields name · city ·
  address · phone · WhatsApp link · hours · lat/lng · sortOrder · **HQ** (exactly one; setting another unsets it,
  HQ delete blocked) · live/hidden toggle feeding the storefront list. Wired in sidebar nav + admin route + crumb
  label; demo DB slice + API methods used as-is. Client-side required validation added (demo DB also enforces
  name/city/address/phone/hours). Live check 23/23 (seed render · search · create · edit round-trip · active
  toggle · HQ guard · delete · 0 console errors) · e2e 33/33 · lint 0 errors. Storefront `/showrooms` page stays
  static by accepted architecture — wiring demo master → storefront happens with the Bagisto cutover.
- [x] **B2** Warranty page content — DONE (`/admin/warranty`, Engage nav + Content hub card): the /warranty policy page
  is now a singleton in the demo content store (`AdminWarrantyPage`), seeded with the exact copy that used to be
  hardcoded (hero eyebrow/title/subtitle, coverage tiers with coverage/excludes lists + "Most Popular" flag, numbered
  claim steps, FAQs with reorder). Storefront /warranty renders from the store via `useWarrantyPage()` (seed fallback =
  identical render); FAQ section hides when empty. Save persists to the demo DB; "Restore defaults" resets to seed.
  Admin validation/sanitization server-rejects empty hero/tiers/steps with toasts. Bagisto side: honest 501 stubs.
  Live check ALL PASS (hub card · nav · seed load · edit hero+FAQ · persist across reload · storefront reflects edit ·
  reset restores defaults incl. storefront · 0 first-party console errors) · e2e 33/33 · lint 0 errors · clean rebuild ·
  `bun run typecheck` exit 0. Storefront now reads live content — EXCEPT the contact card row (phone/hours/warranty
  email), which still interpolates site config by design.
- [x] **B3** Services / Blog / Materials & Colors / Projects — admin editors DONE (P1.2–P1.5).
- [ ] **B4** Custom Design consultation blocks; Virtual Showroom (WDS) content — static; admin only if owner wants.

### C. Orders & purchasing (Spree parity) — Phase 2 remainders
- [x] **P2.4** Draft Orders — `/admin/drafts`; convert → pending order (source `manual`). DONE (see Phase 2 log).
- [x] **P2.5** Quotes — priced quotations from leads or scratch; printable; convert → order (discount carried). DONE (see Phase 2 log).
- [x] **P2.6** Suppliers — purchasing master. DONE (see Phase 2 log).
- [x] **P2.7** Purchase Orders — draft → sent → partial → received; receipt writes inbound movements. DONE (see Phase 2 log).
- [x] **P2.8** Transfers — move stock between locations/warehouses. DONE (see Phase 2 log).

### D. Shop flow — audit findings
- The storefront ALREADY has cart + checkout (CartContext, CartDrawer, 352-line /checkout with COD + bank transfer,
  WhatsApp confirmation hand-off, demo order persisted to admin Orders). No code missing for COD flow.
- Real payment gateways (Easypaisa / JazzCash / card) remain parked — needs merchant credentials (owner-only).
- bagisto/nextjs-commerce and Spree links are design references only; no live backend until Bagisto is provisioned.

## Page builder (Puck) — plan + Wave 0 spike shipped 2026-11-06

Full strategy: `docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md`. Owner decisions (2026-11-06):
scope **literal-all** (header/footer/announcement/all marketing pages); **zero-cost hard constraint**
(no paid SaaS); deliverable **plan + spike**. Recommendation: `@puckeditor/core@0.24.0` (MIT).

**v2.0 (2026-11-06):** plan upgraded to legacy parity (pages tree/Sections/Elements/Layers/Theme/SEO/inspector/
AI+MCP) — waves re-numbered **W1–W7** (Bagisto → W7), W8 optional/evolutions; effort ≈37–54 d, owner-gated per wave.
See plan §0A (legacy anatomy), §6, §11. Wave list below refers to v2 numbering.

**v2.1 (2026-11-06, owner Q&A):** brand = **both presets** (W3) · chrome = **linked master sections** (W4) ·
**per-wave owner gating** (W1→W7) · W6 = **full generation** (draft-first, owner publishes) · publish = **owner-only** ·
**Tailgrids (MIT) adopted for missing elements** (§5.3 — copy-in vendored, token-remapped, free components only) ·
legacy 81-page catalogue **stays separate** (furniture site only). See plan §11/§14.

- [x] **PB-0.1** Dependency integrated cleanly — `@puckeditor/core@0.24.0` in package.json; 63/45 overlay
  (repo majors kept); package-lock merged (64 entries, 0.24.0 on disk == lock); bun.lock hand-merged
  (64 entries, 780 pkgs strict-parse, `@puckeditor/core` added to workspace deps). `@measured/puck`
  (deprecated) purged from tree, locks and scratch. **CI `bun install --frozen-lockfile` PROVEN green** —
  first push failed on a duplicate `ws@8.22.1` key from the injection (JSON.parse cannot detect duplicate
  keys; bun's parser can) → fixed in `7d5dd66` (one-line drop of the inferior duplicate). Push CI
  42268579873 ✓ and PR re-run 42268591312 ✓ (`build-and-test` green).**Lesson: validate bun.lock with
  bun itself, not JSON.parse.**
- [x] **PB-0.2** WOODEX block registry — 4 real kit blocks in `src/pages-builder/blocks.tsx`
  (SectionHeading, FeatureGrid, ImageBanner, ButtonLink) + categories; JSON-only props, no HTML injection.
- [x] **PB-0.3** Admin lab editor at `/admin/pages-lab` (ENGAGE nav, lazy chunk, vendored Puck CSS with remote
  rsms.me `@import` stripped) — localStorage persistence (`woodex.pages.lab.v1`), Publish → toast.
- [x] **PB-0.4** Read-only storefront render at `/lab/:slug` — `<Render>`, floating "Lab preview — spike,
  not published" badge, `noindex,nofollow`, no Header/Footer, starter fallback. Live check **12/12**
  (editor mount → scale-corrected canvas select → field edit → Publish → /lab/home renders the edit;
  0 console errors) · e2e 33/33 · typecheck 0 · lint 0 errors · clean rebuild (Puck splits ~301 kB lazy
  chunk; storefront main bundle +1.4 kB).
- [x] **PB-1** Wave 1 — Foundation: demo-DB `pages` slice + Pages workspace (folder tree per plan §0A.2,
  CRUD, draft⇄published, history/revert, slug registry vs App.tsx routes). Est. 3–4 d.
  **LOCAL DONE 2026-11-06 (unpushed; delivery vehicle = owner decision):** `/admin/pages` workspace (folder rail,
  search, new/duplicate/delete, draft⇄published switch) + per-page editor `/admin/pages/:pageSlug` (Puck bound to
  the demo DB; everyone saves drafts, publish = owner-only interim rule), history ≤20 + revert-as-draft, `/lab/:slug`
  renders any-status pages, seeded published `home` page, bagisto = 501 stubs (Wave 7). Gates: tsc 0 · eslint 0
  errors · production build ✓ · e2e 35/35 (+2) · live CRUD acceptance 10/10, 0 console errors.
- [ ] **PB-2** Wave 2 — Sections & Elements libraries: 40-section UI-kit catalogue (thumbnails, label-in-Layers,
  Sections/UI kit/Templates/Images tabs, category chips, click-to-add-after) + Elements palette (BASIC+WIDGETS)
  + Layers panel (select/reorder/hide/lock). **Elements kit completion via free MIT Tailgrids per plan §5.3**
  (vendored `src/components/tailgrids/*`, token-remapped, house-first, attribution + hex/Pro grep gate). Est. 5–7 d.
- [ ] **PB-3** Wave 3 — Theme: whole-website token panel (colours/fonts/base/heading scale), CSS custom
  properties, section skins Original/White/Cream/Navy, versioned `theme` singleton snapshots/restore. Est. 3–4 d.
- [ ] **PB-4** Wave 4 — Inspector parity: Content/Style/Advanced tabs; Desktop/Tablet/Mobile × Normal/Hover;
  **Linked styles** (element-only → page-scope class rules, leak-tested); **chrome = linked master sections**
  (header/footer/announcement canvas instances wired to chrome masters, detach behind confirm; plan §11-Q2); animation on scroll (reduced-motion aware);
  General Tag/ID/Title/Aria/Classes chips; inline text toolbar; responsive visibility. Est. 6–9 d.
- [ ] **PB-5** Wave 5 — SEO layer: page title/meta counters (60/160), focus keyphrase, live Google preview,
  local Yoast-style Analyse (SEO + Readability score badges), publish gate, sitemap + JSON-LD. Est. 3–5 d.
- [ ] **PB-6** Wave 6 — AI + MCP build path: local MCP server (`list_pages/get_page/create_page/upsert_section/
  set_theme_tokens/run_seo_audit/diff_page/create_page (template fan-out, e.g. local-SEO catalogue — owner §11-Q4
  full-generation)/`draft_publish` — deliberately no publish tool); draft-first AI docs with
  diff + validator; audit log `woodex.ai.audit.v1`. Depth per owner Q4. Est. 5–7 d.
- [ ] **PB-7** Wave 7 — Bagisto CMS mapping (`puck_data` custom attribute behind `getAdminApi()`), demo-DB →
  Bagisto migration, env-flag rollback. Est. 4–5 d.
- [ ] **PB owner questions (v2)** — Q1 brand (current reimagined vs legacy navy/beige vs both-presets vs
  rebuild legacy site) · Q2 chrome model (singleton vs in-canvas vs linked master) · Q3 wave gating (strict
  W1→W7 sign-off vs batched W1–W3 vs mega-sprint vs W1-only) · Q4 AI depth (audit-only vs audit+drafts vs
  full generation) · Q5 publish permission (any admin vs owner-only vs Bagisto RBAC later) · Q6 legacy
  81-page catalogue (separate vs port into this builder vs retire legacy stack). Delivered as chat form
  2026-11-06; see master plan §11.

## Cross-cutting / parked

- [ ] **Payment gateway** — parked intentionally: "WhatsApp-first manual confirmation" is the chosen flow.
  Revisit Easypaisa / JazzCash / bank gateway (env-gated) once merchant credentials exist.
- [ ] **Temporary `Staff` footer link** — remove at owner's sign-off word (one-line change).
- [ ] **Vercel deployment checklist** — owner-side dashboard work; agent has no Vercel access.
- [ ] **Known limits (accepted, documented):** demo gate ≠ RBAC; Bagisto writes stay 501 until Phase 3 backend
  provisioning; channel attribution is all-or-nothing at order level; bundles don't stack trade pricing.
- [ ] **Housekeeping sweep** — remove any `console.log` remnants; `.node-version`/`bun` note in README (optional).

## Pending task registry (consolidated 2026-11-06, post PR #3 merge)

Everything outstanding after the merge — owner to triage; agent holds code-sized tasks only.

**Owner-side / decisions**
- [ ] **Vercel production verification** — `main` advanced `69985d3 → 44ff091` (PR #3 merge, 2026-11-06).
  Vercel deploys production from `main`; agent has no Vercel access. Owner confirms the deployment and
  that the storefront + admin are healthy. NOTE: `/lab/home` is now public (unlisted, `noindex`,
  badged, read-only) — if unwanted on production, say so and a one-commit removal follows.
- [ ] **PB owner questions (v2 · master plan §11)** — Q1 brand · Q2 chrome model · Q3 wave gating · Q4 AI depth ·
  Q5 publish permission · Q6 legacy 81-page catalogue. (Form delivered 2026-11-06.)
- [ ] **PR #3 merged, no further merges pending authorisation** — next merges need the same explicit go-ahead.
- [ ] **`Staff` footer link** — remove at owner's sign-off word (one-line change).
- [ ] **Payment gateway** — parked (WhatsApp-first manual confirmation); revisit Easypaisa/JazzCash/card once merchant credentials exist.
- [ ] **Vercel deployment checklist** (cPanel/Vercel cutover) — owner-side dashboard work.

**Agent-code sized (no owner input needed)**
- [ ] **B4 — Custom Design / Virtual Showroom (static)** — last open Phase 4 module; fold into Phase 4 sweep.
- [ ] **PB-1 … PB-5** — page-builder waves 1–5 (see PB section above); PB-1 starts after the §11 answers.
- [ ] **Housekeeping sweep** — any `console.log` remnants; `.node-version`/bun note in README (optional).

**Parked / accepted**
- [ ] **Known limits (accepted, documented):** demo gate ≠ RBAC; Bagisto writes stay 501 until Phase 3
  backend provisioning; channel attribution all-or-nothing at order level; bundles don't stack trade pricing.
- [ ] **Page-builder literal-all risk review** — revisit R1 (per-page chrome) at Wave 1 kickoff.

## Verification gate (every module)

1. `npm run build` · `npm run typecheck` (0 errors) · `npm run lint` (0 errors)
2. `bun run e2e` → **33/33 PASS** (grow the suite when a module adds a new admin surface worth gating)
3. Live pass via a scripted browsing check when the module has interactive admin UI
4. Commit → push `arena/cb0d09e3-woodex-reimagined` → PR #3 checks green
