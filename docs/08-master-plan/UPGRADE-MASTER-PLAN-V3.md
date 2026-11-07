# WOODEX Upgrade Master Plan v3 — Full-Stack Agency OS Convergence on Supabase

**Prepared:** 2026-11-07 · **Status:** Canonical v3 upgrade plan — **proposed, not implemented.** Nothing here ships without the per-wave owner gates at the end of each phase.
**Subjects:** combines `blackibexofficial-blip/woodex-reimagined` (current `main` @ `44b84b9`, the design reimagination) with `woodex420/woodex-2030` / “Woodex Agency OS” (`arena/01a10a97-woodex-2030` @ `6ad3f2f`, the working full-stack platform).
**Supersedes:** nothing; complements `PAGE-BUILDER-MASTER-PLAN.md` (the builder programme) with the full business-system upgrade. Waves there remain the builder authority.
**Owner sign-offs baked in (2026-11-07):** end-state = **full-stack** (reimagined becomes the real app) · runtime = **Supabase** (Postgres + RLS + Edge Functions) · reuse = **port & adapt** the Agency OS engine · dashboard look = **one reimagined admin** (Agency OS dashboard retired as reference) · scope = **complete migration (mega-plan), phased** · deliverable = **this document first**, implementation after sign-off.
**Explicitly out of scope until separately approved:** production go-live, payment-provider activation, real customer data, any data mutation on live infrastructure, deleting/rewriting history in either repo, production credentials.

---

## 1. Why this upgrade

| | woodex-reimagined (current) | woodex-2030 “Agency OS” (reference) |
|---|---|---|
| What it is | Beautiful, navigable reimagination: **41 admin modules**, catalogue/inventory/purchasing breadth nobody else has; Puck builder; seeded demo-DB in `localStorage` | Working full-stack platform: Express API, 25-table schema, session auth, RBAC, invoicing, quote versioning, digest order-tracking; own audit = **NO-GO** (blockers documented, remediated in-place, production gates unmet) |
| What it is good at | UX, breadth, performance, builder, SEO analyser | Engineering truth: real writes, real math, real authz, versioning, idempotency, security posture |
| What it lacks | Any backend: no persistence, no auth, no RBAC, no transactions, no audit trail, “checkout” is client-side | Breadth of the new admin (purchasing, price lists, bundles, channels, zones, homepage singletons…), UI quality, builder depth |

**The convergence:** reimagined keeps its look, builder and breadth; Agency OS supplies the engine (auth, RBAC, transactional writes, workflows, audit). Everything lands on **Supabase** because the owner chose it — and because reimagined already ships the scaffolding for it (`@supabase/supabase-js@^2.118.0`, `src/integrations/supabase/client.ts` with publishable-key handling + `brokeredPreviewStorage` + a 5 s bounded fetch, `supabase/functions/mcp` MCP advisor edge function, dual-mode demo/Supabase login in `src/admin/auth.tsx`, health checks in `Settings`, generated-but-empty `Database` type in `types.ts`). We extend; we do not start from zero.

**Honesty baseline, always:** a preview, a demo-DB badge, a passing local suite or a configured URL is never evidence of production readiness. Every gate in this plan exists to make that distinction visible.

---

## 2. Assessment of the reference (Agency OS) — what we inherit and what it still owes

From its own docs, read as authoritative for that codebase, not for production fact (full text: `AGENCY-OS-MASTER-PLAN-V2.md`, `WOODEX-2030-MASTER-AUDIT-REPORT-2026-11-06.md`, `schema.postgres.sql`, `apps/api/server.mjs`):

- **Strengths to port:** `ROLE_CAPS` model (owner `*` · editor `page.manage, theme.manage, catalog.manage` · sales `crm.manage, quote.manage, order.manage` · finance `finance.manage, quote.view-move, order.view-move` · viewer `[]`); token sessions (replaced by Supabase Auth JWT); checkout reprice/stock validation **server-side**; idempotency on POST /orders; SHA-256 tracking digest for order lookup (constant-time compare; returns stage fields only); quote → invoice conversion; `quote_versions` audit; `published_snapshot` pages; signed draft `preview-link`; `track_events` analytics; 25-table schema with SQLite↔Postgres parity.
- **Self-reported weaknesses to remember as gates:** own audit says **NO-GO** (F-01 public order lookup → remediated with digest; F-02 public SSE broadcast → now owner-only/410; F-03 demo seeds in prod path → gated behind `INITIAL_ADMIN_EMAIL`; F-04 viewer read scoping → fixed with capability reads). Browser E2E never completed (no Chromium in sandbox), no hosted-PG canary, no deployment, prod env vars empty. **None of this is “production proven” — treat it as a verified-start, not a verified-finish.**
- **What it does not have and we do not intend it to have:** payment capture; persisted delivery address/payment preference on orders; multi-tenant isolation (RLS placeholders only); WhatsApp automation (manual logged hand-off by policy); a second CMS.

Between the two repos, reimagined is **richer** in modules and **poorer** in engineering; Agency OS is the inverse. Nothing here imports its code silently: ports are explicit, attributed, and adapted to this repo’s conventions (that is the owner’s §-decision “port & adapt”, 2026-11-07).

---

## 3. Owner-decided constraints (2026-11-07)

1. **Full-stack end state** — reimagined becomes the real application. The demo-DB is demoted to an explicitly-labelled seed/demo mode for local development and previews; it is never a fallback in a production build and never silently.
2. **Supabase** — Postgres + RLS + Edge Functions + Supabase Auth + Storage. No parallel Express service. The Express semantics that matter are reimplemented as RPC/Postgres functions and Edge Functions (§6).
3. **Port & adapt** the Agency OS engine (schema, RBAC, workflows, integrity rules) rather than clean-rooming it. Attribution preserved in code headers and `docs/DECISION-LOG` equivalent.
4. **One admin** — Agency OS dashboard retired; its modules ported into the reimagined admin chrome (per-module disposition in §7).
5. **Mega-plan, phased execution** — this document enumerates everything; phases below are gates, not suggestions.
6. **Plan first** — this document is the deliverable of the current step. Implementation begins only after written go-ahead.

---

## 4. Target architecture

```
┌────────────────────────────── Vercel project (this repo, static) ──────────────────────────────┐
│  Storefront  /            reimagined Vite build (Cloudflare-compatible SPA)                     │
│  Admin       /admin/*     same build, lazy chunks (current)                                     │
│  Lab         /lab/*       draft preview (current; reads Supabase snapshot after P3)             │
└──────────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                               │ supabase-js (anon key, publishable) + RLS
┌──────────────────────────────────────────────▼───────────────────────────────────────────┐
│ SUPABASE  PROJECT "woodex"                                                                │
│  Postgres 25 + N tables (§5) · RLS everywhere for business data · Realtime (replaces SSE)   │
│  Auth (email/password; owner / editor / sales / finance / viewer)                          │
│  Storage (media library buckets; public read, owner/manager write)                         │
│  Edge Functions (Deno) — only what cannot live in RLS/RPC:                                  │
│     · admin-bootstrap  (one-time: INITIAL_ADMIN_EMAIL owner creation; 16-char password)      │
│     · order-track      (digest lookup; rate-limited; minimal fields)                         │
│     · checkout-submit  (server reprice + stock validation + idempotency; returns ref+code)   │
│     · quote-invoice    (convert quote → invoice snapshot; idempotent)                        │
│     · page-publish     (snapshot + rollback + signed preview link)                           │
│     · mcp (existing)   — read-only SEO advisor, unchanged                                    │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

**Key rules**

- **One data authority.** No hidden localStorage writes for business entities outside demo mode; demo mode is cosmetic-flagged and cannot reach production data.
- **RLS is the authorization layer** for reads/simple writes (`documents`, catalog reads, own-owned leads). Privileged or multi-step operations are Edge Functions or `SECURITY DEFINER` RPCs with explicit caps — never client-side trust.
- **Money math is server-side** (`checkout-submit`, `quote-invoice`): client-sent prices/totals are ignored; catalog is reloaded; idempotency keys dedupe retries.
- **Tracking privacy:** order references remain `WX-####` for display; customer access requires the high-entropy `tracking_token` returned once at submit; only its SHA-256 digest is stored; `order-track` returns stage/progress fields only.
- **Quote → invoice discipline:** snapshots only (`quote_versions`), never rewrite history; “Final payment terms will be included in formal quotation.” preserved; no 75/25 split; no client share URL.
- **Tenant-ready, single tenant now:** `tenant_id` columns + fail-closed RLS scaffolding ship commented/established, single-tenant Woodex for real customers until explicitly enabled — mirrors the Agency OS position.
- **No secrets in the bundle.** Publishable keys only; service role lives solely in Edge Function environment. `.env*` untouched; Vercel env vars approved separately.

---

## 5. Data model — complete migration inventory

Tables are grouped: **A = direct ports** (Agency OS schema, tightened), **B = new tables** (reimagined slices with no Agency OS equivalent), **C = decisions** (naming/JSON-vs-columns).

### A. Direct ports (Agency OS `schema.postgres.sql`, verbatim semantics + FK/RLS tightening)

| Table | Agency OS purpose | Reimagined mapping notes |
|---|---|---|
| `products` | id TEXT PK · `json` JSONB · price · stock | Keep JSONB `payload` (AdminProduct shape) + hot columns (`id`, `name`, `series_id`, `price`, `stock_qty`, `in_stock`, `updated_at`). Catalog reprice reads hot columns only. |
| `materials`, `services` | JSON blobs | Same pattern (JSON payload + id). |
| `leads` | CRM intake (channel consent UTM …) | Port verbatim incl. consent audit fields; add `owner_id` FK to users. |
| `quotes`, `quote_versions`, `quote_templates` | pipeline + audit + designer | Verbatim; `items` JSONB; `total` preserved; `details` JSONB; `source` incl. `admin`. |
| `orders`, `order_events` | fulfilment stages + timeline | Verbatim + `tracking_token_hash` (already exists); `order_events` (from demo: stage/notify/note) merged into the ported model — replaces ad-hoc demo events. |
| `invoices`, `payments` | ledger | Verbatim; `paid` server-computed from payments sum; status `Issued→PartiallyPaid→Paid→Void`. |
| `returns` | RMA | Port both repos’ shapes into one: reimagined `reason/restock/inspectionNote` + Agency OS `state/resolution/refund_amount`. |
| `clients`, `client_links` | CRM master + entity links | Verbatim; `merged_into` self-FK. |
| `tasks` | follow-ups | Verbatim + `site_visit_id`. |
| `site_visits` | scheduling | Verbatim. |
| `pages`, `page_blocks`, `page_versions`, `saved_sections` | CMS + builder persistence | Verbatim; **Puck data is `page_blocks.props` JSONB** — the Puck builder already round-trips via demo `pages`/`pageFolders`, so the port is mechanical (id format changes). |
| `track_events` | analytics/UTM | Verbatim. |
| `conversations`, `messages` | shared inbox | Verbatim; Realtime policy: inbox members only (MVP: any owner/sales; multi-tenant later). |
| `users`, `sessions` | auth | **Drop `sessions`** (JWT via Supabase Auth). `users` collapses into `auth.users` + `public.user_roles (user_id uuid PK/FK, role text check in owner/editor/sales/finance/viewer)` + `user_profiles (name, phone)`. |
| `meta` | key-value | Dropped (use migrations + `app_config` table only if needed). |

### B. New tables (reimagined-only surface; nothing in Agency OS)

| Table | Purpose | Notes |
|---|---|---|
| `categories`, `collections`, `series`, `brands` | catalogue taxonomy | reimagined shapes; parent/group honoured. |
| `suppliers`, `purchase_orders`, `stock_transfers` | purchasing | line items JSONB; PO lifecycle Draft→Sent→Partial→Received→Cancelled. |
| `price_lists`, `bundles`, `sales_channels` | merchandising | price list items JSONB; bundle composition JSONB; channel metadata JSONB. |
| `option_sets` | variant options | option payload JSONB (color/size/material). |
| `delivery_zones` | delivery cities/postal rules | replaces demo `zones`. |
| `warranty_page`, `custom_design_page`, `virtual_showroom_page`, `homepage_sections` | marketing singletons | one row each (`id text PK`, `content` JSONB); editors via reimagined pages. |
| `blog_posts`, `projects`, `showrooms`, `content_pages` | editorial & proof | JSONB payloads mirroring demo types. |
| `inventory_meta`, `stock_movements` | stock truth | movements ledger verbatim semantics (signed deltas, reason enum). |
| `showrooms`/`series`/`brands` import | legacy content | seeded from demo seed packets for first-run. |

### C. Decisions

- `json` columns → **JSONB** (reimagined picks indexes selectively; hot paths get generated columns, e.g. `products.name text GENERATED ALWAYS AS (payload->>'name') STORED` only where queried).
- IDs: Agency OS TEXT ids preserved on import; new rows use `gen_random_uuid()` or semantic TEXT ids per reimagined convention where the UI already renders them.
- Timestamps: `timestamptz` with app-side ISO strings at the boundary (the UI already uses ISO strings).
- **Seed/demo mirror:** demo-DB types file retained as `src/api/demo/seed.ts` used only by demo mode & tests; `Database` types become **generated** (`supabase gen types typescript --local > src/integrations/supabase/types.ts`) at P0 and the empty `Database` interface is replaced then.
- Migrations: versioned `supabase/migrations/*.sql` in-repo; idempotent; reviewed like code; `supabase db reset` for rehearsal; `pglite` CI smoke retained as rehearsal evidence (never production evidence).

---

## 6. API / Edge-Function catalogue — every surface accounted for

**Convention for the mapping:** `READ` = plain PostgREST with RLS · `RPC` = `SECURITY DEFINER` function with caps assertion · `EF` = Edge Function (Deno) · `RT` = Realtime channel (replaces SSE) · `MCP` = keep existing read-only MCP.

| Agency OS route | New home | Auth / RLS note |
|---|---|---|
| `GET /api/health` | EF `health` | public, no data |
| `POST /api/auth/login` `POST /logout` `GET me` | Supabase Auth `signInWithPassword` / `signOut` / `auth.uid()` | RLS: `user_roles` via own row |
| `GET/PATCH /api/users` | RPC `admin_users_list/update` | owner only (+ viewer sees list lite) |
| `/api/products*` (catalog, overrides) | PostgREST + RPC `catalog_overrides()` for the 15-s storefront reprice | catalog public read; write = editor+ `catalog.manage` |
| `PATCH /api/products/:id` (dashboard price/stock) | RPC `product_update` | editor+ / sales can’t by policy |
| `POST /api/orders` (checkout) | EF `checkout-submit` | public submit; idempotency key; reprice; stock validation; digest issuance; rate-limited |
| `POST /api/orders/lookup` | EF `order-track` | **public but digest-gated**, rate-limited; minimal projections; replaces both lookup route + public SSE |
| `GET/PATCH /api/orders(/:id)` | PostgREST + RLS (sales/finance/owner) | stage machine via RPC `order_stage(…)`; events row written by RPC |
| `GET /api/events` (SSE) | **Deleted.** Realtime channel `ops:owner` | owner-only topic; payload whitelist (no PII) |
| `GET/POST /api/leads`, `PATCH /leads/:id` | PostgREST + RLS (sales/owner CRM) | intake POST public with consent fields; redepends on bot-guard/rate-limit |
| `POST /api/leads/:id/whatsapp-handoff` | EF `whatsapp-handoff` | sales+; logs only; **never claims sent** |
| `GET/POST /api/quotes*`, versions, templates | PostgREST + RLS; convert via EF `quote-invoice` | editor+/owner/sales; version append only |
| `GET/POST /api/quotes/:id/invoice` | EF `quote-invoice` | idempotent; snapshot semantics |
| `GET/POST /api/invoices*` + `POST /payments` | PostgREST + RPC `invoice_apply_payment` | finance+/owner; `paid` derived |
| `GET/PATCH /api/returns*` | PostgREST + RLS; restock via RPC | sales+/owner; audit on resolution |
| `GET/POST /api/clients*`, merge, review | PostgREST + RPC `client_merge`, `client_review` | sales+/owner; merge is audited |
| `GET/POST /api/tasks*` + `site-visits*` | PostgREST + RLS; `site_visit_schedule` RPC enforces reminder task linkage | sales+/owner |
| `GET /api/messages`… inbox | PostgREST + RLS + Realtime `inbox:<conversation>` | participants only |
| `GET/PUT /api/theme` | PostgREST (page-scoped singletons `app_settings`) | editor+/owner |
| `GET/PUT /api/pages*` (+publish/rollback/preview-link/public) | EF `page-publish`, `page-rollback`, `page-preview-link`, PostgREST read public snapshot | editor+/owner; signed links TTL 15 m |
| `POST /api/track`, `GET marketing/stats` | PostgREST insert (public anon insert + owner select) | insert-only anon role; analytics read = owner |
| `GET/POST /api/saved-sections`, `/api/media` | PostgREST + Storage policies | editor+/owner |
| `POST /api/target` (import/export) | deferred to P6 (export JSON only) | owner only |
| `GET /api/blocks` | retired (Puck owns the block library) | — |
| `GET /api/stats` | replaced by `admin_overview` RPC (real events) | owner/sales |
| `GET /api/pages/:key/public` | PostgREST on `published_snapshot != null` | public read of snapshots only |
| **New:** `admin_overview`, `catalog_overrides`, `search_admin` | RPCs | power the dashboards |

**MCP advisor:** keeps running unchanged (`seo_audit_page`, `seo_generate_meta`) — it reads the published snapshot set from Supabase instead of the local data.json once pages persist (P3); until then it stays on the seed snapshot.

**Total:** 84 routes → ~46 PostgREST surfaces, 12 RPCs, 6 EFs, 1 RT topology, 1 MCP. Every row has an owner phase in §8.

---

## 7. Module disposition — every screen from BOTH repos accounted for

Legend: ✅ port as-is · 🔧 port + rework · 🆕 new (Supabase-only) · 🗑️ retire/merge.

### 7.1 reimagined admin screens (each → target)

| Module | Disposition | Backing (phase) |
|---|---|---|
| Dashboard (overview) | 🔧 rework to `admin_overview` RPC (real events: orders today, open quotes, pipeline value, low stock) | P5 |
| Analytics | 🔧 rework to real `track_events` + orders/invoice aggregates | P5 |
| Products / Categories / Collections / Series / Brands | ✅ PostgREST CRUD | P2 |
| Inventory / Stock movements | 🔧 RPC ledger (`inventory_apply(delta, reason)`), low-stock alerts via threshold | P2 |
| Delivery Zones / Delivery | 🆕 `delivery_zones` CRUD | P2 |
| Purchase Orders / Transfers / Suppliers | 🆕 RFQ→PO lifecycle; GRN posts inventory in | P2 |
| Orders / Drafts / Quotes / Quote builder / Returns / Exchanges / Claims | ✅ port Agency OS flows; exchanges/claims as special returns types | P1 |
| Invoice / Payments | 🔧 ledger; `paid` derived from `payments` | P1 |
| Customers | 🔧 backed by `clients` + order/return relations | P1 |
| Leads / Inbox (new) | 🆕 CRM kanban + omnichannel inbox (port from Agency OS `/crm`, `/omnichannel`) | P1 |
| Clients & Companies | 🆕 port merge-review flow | P1 |
| Tasks & Follow-ups / Site Visits | 🆕 port incl. reminder task auto-link | P1 |
| Pages (Puck) + SEO panel + `/lab` | ✅ keep UX; migrate persistence to Supabase; signed previews | P3 |
| Media | 🔧 Storage bucket + metadata table (`media_assets`) | P3 |
| Blog / Services / Content / Warranty / Custom Design / Virtual Showroom / Homepage / Showrooms / Materials / Options / Projects / Price Lists / Bundles / Channels & Markets / Bulk Editor | ✅ PostgREST CRUD (JSONB payload pattern) | P4 |
| Warranty/Custom Design/Virtual Showroom singleton pages | 🔧 singleton tables, same editor UX | P4 |
| Settings | 🔧 keep integrations health panel; add team/roles management | P0/P4 |
| System ➝ “View live storefront” | ✅ keep link | — |
| Bulk Editor | 🔧 rework to RPC batch ops | P2/P4 |

### 7.2 Agency OS dashboard-only screens (nothing survives as separate app)

| Screen | Disposition | Note |
|---|---|---|
| Overview (charcoal) | 🗑️ replaced by reimagined Dashboard (same data source via RPC) | single admin, owner §-decision |
| Commerce Overview | 🗑️ merged into reimagined Dashboard + Orders | |
| Landing Analytics | 🔧 port UTM/marketing view as section of Analytics | P5 |
| Theme Studio | 🔧 reimagined Wave 3 theme tokens implementation *replaces* it (own wave, distinct plan §W3) | tracked in builder plan |
| CommandPalette / keyboard nav | ✅ port component into reimagined admin (value, zero backend) | P4 |
| QuoteTemplateDesigner | ✅ port into reimagined quote builder (template mgmt UX) | P1 |
| Returns/Team components | ✅ absorbed by Returns + Settings/Team screens | — |
| UI Components (dev) | 🗑️ dev-only screen, not shipped | — |
| `/dashboard` route base & TailAdmin CSS | 🗑️ retired with app | — |

### 7.3 Storefront parity map (no rewrites, wiring only)

- Live overrides: reimagined storefront reads `catalog_overrides()` (15 s) exactly as Agency OS storefront did.
- Contact/Quote/Checkout forms → new EF endpoints (`lead_submit` public-with-consent, `quote_submit`, `order-track`).
- `/order-status` → `/order-track` page (reimagined route added; reference + code entry).
- Published builder pages `/p/:slug` stay as-is.

---

## 8. Execution roadmap — one plan, six gated phases

| Phase | Scope (what truly lands) | DoD / Gate | Est. |
|---|---|---|---|
| **P0 Foundations** | Supabase project created/linked; `woodex` schema applied as migrations; RLS enabled + policies per cap; Supabase Auth roles wired; bootstrap EF (`admin-bootstrap`); generated `Database` types; env plumbing (`VITE_SUPABASE_*`); CI for migrations (`supabase db reset` + pglite smoke); decision log updated; demo mode formally quarantined behind `VITE_DEMO_MODE` + banner | `npm run build` green · `supabase db reset` rehearsal green · RLS deny-tests for viewer/sales write paths green · **Owner gate: P0 sign-off** | 3–4 d |
| **P1 Money path** | leads intake (consent) → CRM kanban → inbox threads (+ Realtime) → quotes (+ versions + designer UX ported) → quote→invoice conversion → invoice ledger + payments → orders stage machine + tracking digest (storefront form + `/order-status`) → returns/RMA + restock → clients merge-review → tasks/site visits | Money-path E2E on a **staging Supabase project** (synthetic data): lead→…→paid invoice→fulfilled→returned; RLS negatives; idempotency replays; snapshot checks; browser E2E executed (Playwright on CI runner) — **skipped ≠ passed** · **Owner gate: P1 sign-off** | 6–8 d |
| **P2 Catalog & purchasing** | products/categories/collections/series/brands; server reprice; inventory ledger + low-stock; purchasing (suppliers, POs, transfers, GRN); price lists; bundles; channels; zones | Storefront live-overrides verified; stock race test (double-submit) green; PO→GRN posts stock; catalog write attempted by sales-role is denied · **Owner gate: P2 sign-off** | 5–6 d |
| **P3 Content & builder** | pages/puck persistence to Supabase; signed preview links (TTL); publish/rollback snapshots; Storage-backed media (bucket + policy + `media_assets`); blog/projects/services/showroom CRUD w/ JSONB | Publish→public read OK; draft NOT public readable without signature; rollback restores byte-equal snapshot; media uploads survive reloads; media bucket denies anonymous write · **Owner gate: P3 sign-off** | 3–4 d |
| **P4 Admin sweep & command palette** | every remaining module wired to Supabase; singleton pages; homepage sections; bulk RPC ops; Settings team/roles; CommandPalette (⌘K) port | All §7.1 rows green (module × backing table); role matrix tested on every endpoint (owner/editor/sales/finance/viewer); axe on admin routes · **Owner gate: P4 sign-off** | 8–12 d |
| **P5 Analytics & overview** | Dashboard + Analytics rebased on real events + RPCs (sales pipeline, conversion, returning customers, stock velocity, UTM) | Every “live” number traceable to source table; empty/loading/error truthful; stale-data banners when inputs missing · **Owner gate: P5 sign-off** | 3–4 d |
| **P6 Hardening & deprecation** | Agency OS Dashboard removed from any deployment path; seed credentials provably absent from prod build; full audit re-run (F-01…); secret scan; restore rehearsal; backup runbook; production checklist **executed with owner** (hosting, DB plan, monitoring, incident contacts, backups) | Release manifest; executed restore test; owner-signed release verdict — **NO AUTOMATIC GO-LIVE** · **Owner gate: P6 sign-off** | 3–5 d |

**Total:** 31–43 dev-days. Phases serialize only where they touch the money path (P1 → P2); P3/P4 may run parallel after P1 if a second contributor exists. Wave-3 Theme stays governed by `PAGE-BUILDER-MASTER-PLAN.md` and lands independently — do not serialize it behind this programme.

**Non-goals through all phases (never without explicit owner approval):** payment capture / PSPs; messaging-provider delivery; multi-tenant go-live; production cutover inside any phase above; deleting the old repo or its branches; any silent data migration of real customers.

---

### 8.1 Execution log — P0 slice 1 (2026-11-07, branch `arena/bb519cda-woodex-reimagined`)

**Shipped in slice 1 (c285d5c) — real code, rehearsed, not yet hosted:**
- `supabase/migrations/20261107000001_agency_os_convergence.sql` — full `woodex` schema: users/roles/capabilities (`my_role`/`my_caps`/`has_cap`/`require_cap`, Agency OS ROLE_CAPS 1:1: owner=`*`, editor, sales, finance, viewer), 47 tables (taxonomy, products+inventory ledger, CRM/sales/finance, CMS+singletons, inbox, app_settings) with FKs/indexes/generated `name`, 14 capability-checked `SECURITY DEFINER` RPCs (admin_overview, catalog_overrides, product_update, inventory_apply, order_stage, quote_invoice_snapshot, invoice_apply_payment, client_merge, bootstrap_owner…), `bootstrap_owner` revoked from `public`/`anon`/`authenticated`.
- Deny-by-default grant model: ledger tables (products, stock_movements, orders, order_events, invoices, payments) receive **no** write grant from PostgREST — money and stock move only through capability-checked RPCs. CMS/CRM surfaces grant DML to `authenticated` with capability-gated RLS (101 policies, public reads on catalog/snapshots/singletons, insert-only `track_events`, owner-only settings/roles).
- Admin demo-mode quarantine banner on every `/admin/*` screen (honest "not connected to Supabase" labeling), visible on the preview build.

**Rehearsal evidence (WASM Postgres via pglite, /tmp harness — NOT committed, hosted-DB semantics only):** migration applies cleanly; 41/41 assertions green, including per-role deny matrix (viewer `42501` on admin_overview/product_update/inventory_apply; sales denied invoice payment; editor passes taxonomy write), quote→invoice idempotency (second call returns the same invoice), payment flow Issues→Partially paid→Paid, stock ledger with movement row, `client_merge` link re-pointing, `bootstrap_owner` refusal for authenticated callers, anon lead-insert denied (public path = service-role lead-capture EF planned for P1), anon catalog read ✓ / orders+invoices+clients+leads denied ✓.

**NOT yet done in P0 (owner-side / environment-dependent):** staging Supabase project (creation, linking, hosted `supabase db reset`); `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` wiring; generated `Database` types (requires the applied schema on hosted/local CLI — `supabase` CLI absent in CI sandbox); `admin-bootstrap` edge function + first-owner flow; CI migration job; decision-log update. **P1 gate cannot run until staging exists — rehearsal ≠ production evidence.**

**Build note:** `npm run build` could not be used (`bun` absent); built with `npx vite build --mode production` (build green, AdminApp chunk contains the banner). `typecheck` was NOT run for this slice — verify before treating as release-grade. Preview server rebuilt and re-verified (HTTP 200, banner present). `supabase/functions/mcp/index.ts` auto-generated churn was reverted before commit.

---

## 9. Security & integrity gates (carry-forward from the Agency OS audit)

Each of these ships as a failing-then-passing test or explicit verification artifact; none is “considered”:

1. Order tracking is digest-gated only; sequential references are display-only (test: guessing `WX-####` yields nothing).
2. No public broadcast of order/invoice/payment events; Realtime topic requires auth; payload whitelist (test: anonymous socket receives nothing).
3. Checkout never trusts client prices/totals; stock checked atomically (test: concurrent checkout for last unit — exactly one succeeds).
4. Production bootstrap requires `INITIAL_ADMIN_EMAIL` + ≥16-char password; demo seeds excluded from prod builds (build assertion).
5. Viewer role: zero write paths; sales cannot edit catalog; finance cannot edit CRM records; editor cannot publish/unpublish (test matrix on all caps).
6. Signed preview links TTL ≤15 min; draft content unreadable without signature (test: replay, expiry, wrong-page signature).
7. SQL integrity: every write inside a transaction or single statement; no read-modify-write outside RPC; constraint-level FKs on `payments.invoice_id`, `page_blocks.page_id`, `stock_movements.` ✓.
8. Idempotency: retried `checkout-submit`, `quote-submit`, `quote-invoice`, `lead_submit` produce identical refs (test: 5× replay).
9. No secrets in repo/bundle/chat; `VITE_SUPABASE_*` = publishable only (test: artifact grep).
10. Data residency: nothing leaves Supabase; MCP advisor reads only published snapshots; no PII in analytics events (test: event payload audit).

---

## 10. Verification & evidence discipline

- **Tests:** Vitest (unit: pricing/math/digest/caps), Playwright (critical journeys; CI with Chromium), SQL suites (pglite for RPC/RLS semantics; staging Supabase for integration), a11y (axe) on `/admin/*` and `/lab/*`.
- **Rehearsal, not production:** green pglite/staging runs are evidence of behavior, never of production health. Every gate names the environment it ran against.
- **Change control:** migrations are reviewed like code; destructive DDL only behind explicit restore evidence.
- **Traceability:** each phase ends with a DECISION-LOG append (what shipped, what’s unverified, what was deferred) and a refresh of this plan’s §8 checkboxes. This plan is the canonical tracker.

---

## 11. Migration & cutover notes (when P6 is approved, not before)

1. **Catalogue import first** (products/materials/services + categories/series/brands/collections/options) — idempotent upsert by external id; images already live in repo/media.
2. **Demo Home page document** migrates as the `/home` builder page (v3 seed) with snapshot.
3. **Reimagined demo customers/orders/etc.** do **not** migrate — synthetic seeds only enter via demo mode.
4. **Agency OS data** (if any non-synthetic records exist when the owner authorizes): one-time export → schema remap → import into empty Woodex tables with integrity report; requires separate approved runbook and discard-after-verify policy; out of scope here.
5. **Read-your-writes cutover:** demo mode flag flips to Supabase-only UI; demo banner removed; localStorage business keys dropped (keep builder drafts on `woodex.pages.*` until P3 completes).

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Scope explosion (this is a mega-plan) | §8 phases are contractual boundaries; “done” requires gates, not effort; weekly triage trims only with owner sign-off |
| Two repos’ shapes diverge mid-port | Conventions fixed in §4/§5; no third source of truth; seeds mirror schema exactly |
| RLS foot-guns (over-permissive policies) | Mandatory deny-tests per role per table; review checklist in PR template; staging-only first |
| JSON payload drift (products everywhere) | Generated types + zod at the boundary; hot-column generated columns where indexed |
| Realtime leak | Topic whitelists + authZ on channels; payload audits; anonymous socket denied test |
| Demo-mode leakage into prod | `VITE_DEMO_MODE` compile-time flag; prod build asserts absence; banner impossible to miss in demo |
| Schema churn breaking builder | pages/puck persistence behind a narrow repository interface; design reserves a v4 migration window |
| Agency OS audit resurfaces (e.g. unseen PII path) | §9 gates run against the merged result, not against the old repo’s green checks; findings reopen gates |

---

## 13. Immediate next steps (this document is the gate)

1. **Owner reviews this plan** and strikes/strikes the phases or the §3 constraints as needed (single-message edits are fine).
2. On approval: P0 starts on this branch’s task-set; each phase ends in its own PR (like every prior wave), merges remain owner-gated.
3. `docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md` gains a pointer to this file (tracked in the same follow-up PR, one line only).
4. Nothing executes before (1)–(2). The old repo remains untouched; no deploys, no credentials, no data moves.

---

## 14. Appendix — side-by-side numbers

| | Agency OS (ref) | reimagined (current) | v3 target |
|---|---|---|---|
| Admin screens | 22 (funnel IA) | 41 (commerce-first IA) | 41 reimagined IA, all API-backed |
| API routes | ~84 (Express) | 0 (client-only) | ~46 PostgREST + 12 RPC + 6 EF + 1 RT + MCP |
| DB tables | 25 | 0 (localStorage demo) | 25 + 22 new = 47 (excl. junction tables) |
| Auth | token sessions + RBAC | demo gate only | Supabase Auth JWT + `user_roles`, same caps |
| Tests | 92/92 local SQL suites (not browser) | e2e 42/42 (admin flows) | SQL + pglite + staging + browser E2E on CI |
| Production | never deployed; NO-GO audit | static SPA (no data) | owner-gated, P6 runbook only |
