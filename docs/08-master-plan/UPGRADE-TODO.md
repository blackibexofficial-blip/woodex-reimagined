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
- [ ] **P2.4** Draft Orders — admin builds an order manually (customer + lines from catalogue or free lines);
  save as draft; convert → pending order (same `createOrder` path, marked source `manual`).
- [ ] **P2.5** Quotes — turn a quote lead into a priced quotation (line items, discount %, validity days);
  printable/PDF via the existing `PrintableInvoice` pattern; convert → order. Closes the B2B loop
  (Quotation form → lead → quote → order).
- [ ] **P2.6** Suppliers — supplier master (name, contact, city, payment terms, notes); referenced by POs.
- [ ] **P2.7** Purchase Orders — create PO to supplier (lines, expected date); receive against it (full/partial);
  receipt writes inbound stock movements; status draft → sent → partial → received.
- [ ] **P2.8** Stock Transfers — showroom↔showroom / warehouse↔showroom transfer records; movement type
  `transfer` (in/out legs); location picker reusing the showroom master.

## Phase 3 — Product depth (Medusa-style)

- [ ] **P3.1** Product Options & Values — e.g. Finish (Natural Oak / Dark Walnut / …), Size, Fabric; option sets
  reusable across products; values can adjust price (+/- PKR) and carry their own SKU suffix.
- [ ] **P3.2** Variant selection on PDP — customer picks options; price/SKU/stock update live; cart lines keyed
  by variant.
- [ ] **P3.3** Spec table per product — dimensions (L×W×H), weight, materials, warranty; editable in admin;
  rendered on PDP (ProductDetail.tsx) and used for the Product JSON-LD `additionalProperty`.
- [ ] **P3.4** Advanced category control polish — evaluate per-category default option sets (avoid gold-plating;
  only if P3.1–P3.3 land clean).
- [ ] **P3.5** Translations groundwork — Urdu `hreflang` + string externalization spike; **evaluate and report
  before committing to full RTL** (master-plan Phase 5 item; do not gold-plate).

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

## Phase 4 — Owner audit upgrades (legacy lbpanel + Spree parity) — proposed, pending owner priority

Captured from the owner brief (screenshots of the legacy woodexfurniture.pk/lbpanel product + category forms,
Spree dashboard map, and the current React build). Not sequenced yet — owner to pick priority order (see questions).

### A. Catalogue parity (legacy admin has these today; our admin doesn't fully)
- [ ] **A1** Product editor upgrade — parity with legacy: Old Price vs Current Price display, Stock, SKU (exists),
  **Best Sellers** and **Sale Item** toggles, Short Description / Product Details / Specifications, multi-image
  gallery; plus "Collection(s)" and "Furniture Series" pickers on the product. Check current editor field coverage
  first; reuse demo DB `AdminProduct` + extend types where missing.
- [ ] **A2** Furniture Series taxonomy — series collections (Infinity, EK, Nova, Cubicle, Staff, …): series as a
  managed entity (slug, name, hero, description) shared by `/series/:seriesId` storefront and collections admin;
  link products to a series.
- [ ] **A3** Product Brands — dedicated brand manager (legacy "Product Brands"): name, logo, slug; products reference
  brand (Woodex today, room for others); filter in admin products + bulk editor.
- [ ] **A4** Product Attributes — option sets & values (Finish, Size, Fabric…), values can adjust price and carry
  SKU suffix. **Overlaps P3.1 — do not duplicate; treat P3.1 as the implementation task.**
- [ ] **A5** Category editor upgrade — legacy fields: Hero Style, Homepage sections (Best Sellers / Home Carousel
  switches), Short Description, Background Image, Long Description; keep our slug/parent/sortOrder.
- [ ] **A6** Homepage section control — admin toggles for Best Sellers / Home Carousel (auto from flags vs manual
  pick), plus carousel ordering.

### B. Storefront surfaces with no admin editor yet
- [ ] **B1** Showrooms admin — `/admin/showrooms`: list/create/edit/delete showroom records (name, city, address,
  phone, hours, image, map link) feeding storefront `/showrooms` + left-rail "Visit our showrooms" — demo DB slice
  + types already exist (`showrooms`, `NewShowroomInput`); only the page + nav + route are missing.
- [ ] **B2** Warranty page content — `/warranty` is hardcoded; add editable content entry (optional, low value).
- [x] **B3** Services / Blog / Materials & Colors / Projects — admin editors DONE (P1.2–P1.5).
- [ ] **B4** Custom Design consultation blocks; Virtual Showroom (WDS) content — static; admin only if owner wants.

### C. Orders & purchasing (Spree parity) — Phase 2 remainders
- [x] **P2.4** Draft Orders — `/admin/drafts`; convert → pending order (source `manual`). DONE (see Phase 2 log).
- [ ] **P2.5** Quotes — priced quotation from a lead (lines, discount %, validity); printable; convert → order.
- [ ] **P2.6** Suppliers — master (name, contact, city, payment terms, notes); referenced by POs.
- [ ] **P2.7** Purchase Orders — create PO (lines, expected date); receive full/partial (stock inbound).
- [ ] **P2.8** Transfers — move stock between locations/warehouses.

### D. Shop flow — audit findings
- The storefront ALREADY has cart + checkout (CartContext, CartDrawer, 352-line /checkout with COD + bank transfer,
  WhatsApp confirmation hand-off, demo order persisted to admin Orders). No code missing for COD flow.
- Real payment gateways (Easypaisa / JazzCash / card) remain parked — needs merchant credentials (owner-only).
- bagisto/nextjs-commerce and Spree links are design references only; no live backend until Bagisto is provisioned.

## Cross-cutting / parked

- [ ] **Payment gateway** — parked intentionally: "WhatsApp-first manual confirmation" is the chosen flow.
  Revisit Easypaisa / JazzCash / bank gateway (env-gated) once merchant credentials exist.
- [ ] **Temporary `Staff` footer link** — remove at owner's sign-off word (one-line change).
- [ ] **Vercel deployment checklist** — owner-side dashboard work; agent has no Vercel access.
- [ ] **Known limits (accepted, documented):** demo gate ≠ RBAC; Bagisto writes stay 501 until Phase 3 backend
  provisioning; channel attribution is all-or-nothing at order level; bundles don't stack trade pricing.
- [ ] **Housekeeping sweep** — remove any `console.log` remnants; `.node-version`/`bun` note in README (optional).

## Verification gate (every module)

1. `npm run build` · `npm run typecheck` (0 errors) · `npm run lint` (0 errors)
2. `bun run e2e` → **33/33 PASS** (grow the suite when a module adds a new admin surface worth gating)
3. Live pass via a scripted browsing check when the module has interactive admin UI
4. Commit → push `arena/cb0d09e3-woodex-reimagined` → PR #3 checks green
