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
  Storefront `/services` grid filters live `active` (left-rail `spaceWorkItems` intentionally static); `/services/:slug`
  ready-gated (same deep-link redirect class as P1.4 — fixed preemptively) and reads live related rail. Live check 8/8
  (7 seeds → create→live grid + deep-linked detail → delete→7) · e2e 33/33 · 0 console errors. Inactive services
  redirect to /services on direct URL. Sitemap stays build-time static — admin-created services enter on next deploy
  (documented in the page footer). Bagisto backend stubbed 501 (CMS slice not provisioned).
- [ ] **P1.6** Content hub refresh — `/admin/content` becomes a launchpad linking to the four new editors
  (retire the read-only placeholder copy).

## Phase 2 — Commerce ops (Spree-style order lifecycle)

Goal: orders stop being "shipped/delivered" only — returns, exchanges, claims, draft orders, quotes, and the
purchasing side (suppliers, POs, transfers). All demo DB; each module links back to the existing order/inventory
slices instead of duplicating them.

- [ ] **P2.1** Returns — create/track/close: reason codes (damaged / wrong item / not as described / changed mind),
  line items, receipt inspection, refund or replacement decision, optional restock on receipt (stock movement).
  Admin page + entry point from delivered orders.
- [ ] **P2.2** Exchanges — replace item(s) on a delivered order; price difference (pay/refund) handling; links to return.
- [ ] **P2.3** Claims — warranty / damage claims pipeline (report → assess → approve/reject → resolve), tie-in with
  5-year warranty messaging; distinct from returns (not necessarily refund-oriented).
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
