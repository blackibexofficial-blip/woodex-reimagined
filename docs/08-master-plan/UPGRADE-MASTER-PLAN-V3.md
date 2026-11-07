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

**Slice 2 (27c46c2, 20c26d4, 23c1cfe, 6546afe, 1c2eb87) — real types, EFs, guardrails (still no hosted project):**
- `types.ts` replaced empty `Database` with catalog-introspected types (48 tables, 14 RPC signatures; tsc green; stamped for regeneration via `supabase gen types` when CLI/staging exists).
- Edge Functions authored, all `verify_jwt=false` and service-role only, **none verified on hosted infra**: `admin-bootstrap` (first-owner mint behind `ADMIN_BOOTSTRAP_SECRET`), `order-tracking` (digest-gated public lookup; uniform 404; narrow projection), `lead-capture` (sole public lead intake; mandated consent+version; stale version → 410; rate-limiting explicitly deferred).
- `src/lib/tracking.ts`: digest-token utils bound to the migration's order-stage vocabulary; 6/6 node:test assertions (tsx) pass.
- `src/integrations/supabase/woodex.ts`: typed RPC/table wrappers; fast-fails when env absent; demo mode untouched.
- P0 residuals: staging project creation + hosted `supabase db reset`; generated types via CLI; decision log; CI migration rehearsal — **CI workflow changes need owner sign-off (not done)**.
- Honesty: nothing in this slice is exercised end-to-end; no claim of production, and no claim that any EF has executed anywhere.

**Slice 3 (febc1e5) — consent-first public intake (preview-visible, demo-safe):**
- Both public lead forms (Contact enquiry, Quotation basket) now gate submit on an **explicit consent tick** (`lead-privacy-v1`, inline notice — no dead `/privacy` link). Attribution (`landingPath`, `referrer`, `utm_source|medium|campaign`) captured at submit.
- `AdminLead`/`NewLeadInput` extended (additive, back-compat); demo `createLead` persists consent context; bagisto path unchanged in behavior.
- `src/lib/consent.ts` + `LeadConsent` component; 4/4 consent unit tests; both forms spread identical consent+attribution into the same contract the `lead-capture` EF requires — no double maintenance.
- Preview rebuilt + verified (200s on `/`, `/contact`, LeadConsent chunk).
- Still NOT verified against hosted Supabase; forms remain demo/localStorage until staging.

**Slice 4 (022fc72) — fix pass:** banner + admin badge keyed on `isSupabaseConfigured` (was `isDemoMode` — would have kept the 'not connected' quarantine showing even after Supabase went live). EFs dropped `Buffer` for portable constant-time hex compares. tsc/eslint/preview re-verified.

**Slice 5 (cdf6cea) — admin Leads surfaces consent & attribution:** per-lead consent chip (`consented · lead-privacy-v1` / amber `no consent record`), UTM trio + landing path when present. Demo seed enriched (0–3 day leads carry consent+UTM; older deliberately pre-consent) — cached demo DBs read truthfully. Preview rebuilt+verified.

**Slice 6 (baa5263, f7f86b2, 67a97be, 41fc8e0, ed027e9, c754fc4) — schema convergence finish + the interface-complete Supabase admin adapter:**
- `supabase/migrations/20261107000002_page_rpcs.sql` (NEW): `page_save` / `page_publish` / `page_revert` — atomic builder round-trips; blocks are baked into append-only snapshots (no partial-block loss, no full-doc rewrite of `pages`); capability-checked (`page.manage`); versioned (`page_versions.version/action`, unique per page).
- Convergence `20261107000001` extended (file unreleased): products.sku; categories(+visible,payload); orders (full B2C fulfilment/dispatch leg: customer_*, courier/tracking/internal, subtotal/shipping/payment_method/discounts); returns (items jsonb, contact/city, reason_detail); quotes (company/city/address/customer_*); clients.kind; price_lists.status + payload + updated_at; pages(+kind, seo jsonb, published_at); media_assets.folder; purchase_orders + stock_transfers received_at + notes; `product_update_payload` RPC (catalog-metadata jsonb merge, money keys refused). `types.ts` re-synced by hand (no live DB to regenerate from).
- `src/api/supabase.ts` (NEW, ~2,600 lines): **all 169 `AdminApi` methods implemented.** Real round-trips through PostgREST/RPCs/EFs (products via product_update/product_update_payload; orders via order_stage + courier columns; quotes create/list/update/delete/from-lead with totals recomputed; returns state machine + restock via inventory_apply; pages builder create/update/publish/unpublish/revert/duplicate via the page RPCs; dashboard = admin_overview + client aggregation, approximate windows labeled; customers = clients + order aggregate via best-effort exact name match (labeled); leads via lead-capture EF; singletons/homepage via content upserts; media/categories/collections/POs/transfers/option sets etc.). **Explicitly not wired** — `SupabaseUnsupportedError` naming method + reason + wave: createOrder / convertQuote / convertDraftOrder (server-side reprice EF pending), exchanges/claims/draft-orders/companies/page-folders (no tables / waves), delivery zones (model mismatch), catalogue-authoring paths by design (create/delete/duplicateProduct, CSV import), singleton resets, channel-sales attribution, resetDemoData. **Never fabricated data anywhere.**
- Factory: `VITE_API_MODE=supabase` selects the adapter (demo default unchanged; preview NOT flipped). `isDemoMode` now means demo/static only.
- Rehearsal re-run after every DDL delta: **50/50** (incl. builder journal tests, product_update_payload money-key refusal, 42501 deny matrix). `tsc -p tsconfig.app.json` rc=0 (this time with pipefail checked). `npx vite build --mode production` green; preview rebuilt+restarted; storefront/admin HTTP 200.
- **UNSHAKABLE caveat:** nothing in this slice ran against a hosted Supabase project — the authoring environment has no egress to it (HTTP 000 on every Supabase host, verified). Correctness evidence = rehearsal + types + review, not runtime. The publishable lead-capture EF was updated to return `{ ok, id }` (deploy pending, owner-side).

**Slice 7 (this commit) — the money path: server-priced order intake (RPC + EF + adapter wiring):**
- `supabase/migrations/20261107000003_order_submit.sql` (NEW): `orders.client_ref text` + unique partial index (replay idempotency). `public.order_submit(p_lines jsonb, p_customer jsonb, p_channel_id text default null, p_client_ref text default null) returns json` — validates every line (productId + qty ≥ 1), re-reads the catalogue with `SELECT ... FOR UPDATE` inside the transaction, verifies stock availability per line, decrements atomically (`stock_qty - qty`, `in_stock` flip), writes `stock_movements` ('sale'), computes the **server** subtotal/total (client-sent prices and totals are ignored), validates the payment method against the orders check constraint (`cod|bank-transfer|easypaisa|jazzcash|card`), inserts the order (ref `WDX-<id>` via the orders id sequence) as stage `intake`, journals `order_events` (stage:intake + optional customer-note event). Same `client_ref` replay → returns the existing order with `replay: true` and zero side effects (no double stock decrement, no duplicate order). Anon-executable by design — self-verifying inside the function; nothing about the orders table is exposed via direct anon writes. Shipping is stored as 0 pending the zone-rate EF (see honest limitations).
- `supabase/functions/order-submit/index.ts` (NEW): public pre-verify-JWT EF (registered `verify_jwt = false` in `supabase/config.toml`), thin pass-through: input clipping/validation → service-role `rpc('order_submit')` → `200 {ok, order}` / `400` / `409` (insufficient stock) / `500`. Rate-limiting deferred (needs per-IP counters; ops must monitor) — documented in the file header.
- `AdminApi.createOrder(input)` wired: POST `{items: [{productId, quantity}], name/phone/email/address/city/notes, paymentMethod, channelId?, clientRef}` to the EF; `clientRef` generated per checkout (`ord-<ts>-<rand>` — retries dedupe server-side); maps the RPC's AdminOrder-shaped JSON into `AdminOrder` with **server totals**. Throws loudly on EF failure — never falls back to fabricated data. Storefront checkout UI still calls the demo/Bagisto path today — flip depends on staging + the owner deploy, out of scope here.
- Honesty: `NewOrderItem` prices carried by the caller are display-only; server totals are authoritative. `shipping` stored as 0 with dispatch-resolution pending the zone-rate EF — orders placed through this path must show "shipping resolved at dispatch" in ops tools. Customer notes persist via `order_events` (staff-scoped timeline, kind `note`), NOT in `internal_notes` (staff-only) and NOT in any customer-visible column.
- Verified: **pglite rehearsal 58/58 PASS** (new: happy path returns `WDX-*` + server total; stock decremented exactly one; `client_ref` replay returns same state with zero double-decrement; out-of-stock rejected with rollback; unknown payment method rejected; unknown product rejected; exactly one order persisted from the replay window). `tsc -p tsconfig.app.json` rc=0; `npx vite build --mode production` green; adapter header synchronized (createOrder moved from the not-wired list into the wired list; `convertQuote` remains not wired — same re-price path, owner cut pending).
- **UNSHAKABLE caveat (unchanged):** nothing in this slice executed against hosted Supabase. Migration `0003` has NOT been applied anywhere hosted; the `order-submit` EF has NOT been deployed; no `.env` flip has been performed. This is verified-by-rehearsal code, not a live money path yet.
- Remaining for the money path: zone-rate shipping EF (decides dispatch cost — replaces hardcoded 0), quote→order conversion (`convertQuote` via `order_submit`-equivalent price re-read), and the owner's deploy + staging run (apply 0001–0003, deploy order-submit + lead-capture + order-tracking, flip `VITE_API_MODE`, end-to-end purchase test against hosted).

**Slice 8 (this commit) — quote→order conversion, server-side, single-execution:**
- `supabase/migrations/20261107000004_quote_convert.sql` (NEW): `orders.sales_channel_id text` (nullable, additive). `order_submit` re-defined byte-for-byte + `sales_channel_id` stamped (0003 left immutable). New `public.quote_convert(p_quote_ref text, p_payment_method text default 'cod') returns json` — capability check `quote.manage` (42501); payment method whitelist; parses `QOT-<id>`; row lock (`FOR UPDATE`); missing → `{ok:false, reason:'not-found'}`, already converted → `{ok:false, reason:'already-converted', orderRef}` (zero side effects), `quote.manage` denied → 42501. **Price authority = the quote** (negotiated lines, discountPct ≤ 60 re-clamped, shipping from the quote) — catalogue is re-verified ONLY for stock (`FOR UPDATE`, whole transaction rolls back on insufficient stock — verified). Catalogue lines decrement `stock_qty` + flip `in_stock` + write `stock_movements` ('sale', note `quote convert QOT-n`); synthetic/free negotiated lines carry at quoted price with no inventory touch. Inserts the order (stage `intake`, sales_channel_id `ch-manual`, discount_pct/amount stamped); flips the quote to `converted` (details `convertedOrderId`, audit append, version+1, updated_at); journals `order_events` (stage:intake with `Converted from quote QOT-…` note). Re-entrant by construction — double convert is impossible. Anon NOT granted; admin session only via RLS path.
- `AdminApi.convertQuote(id, paymentMethod?)` wired to `quote_convert` (direct RPC — admin JWT, no EF needed). Demo parity: not-found / bad-id / already-converted → `undefined`; out-of-stock and 42501 → loud thrown errors; success maps the RPC's AdminOrder-shaped JSON into `AdminOrder` with server-computed totals (subtotal − negotiated discount + shipping).
- Adapter header synchronized; `types.ts` Functions: `quote_convert` signed. Hosted deploy of `0004` is owner-pending; nothing executed on hosted infra. Rehearsal extended: **58 → 68 PASS** (happy path, negotiated total math with 10% discount + Rs 1,500 shipping = 109,500 against Rs 120,000 list; stock decrement; re-convert refused with `already-converted` + preserved orderRef; zero double stock; not-found/bad-id reasons without exceptions; viewer denied 42501; order stamped `ch-manual`; quote flipped + audit appended). Rehearsal setup: p-2 restocked via `inventory_apply(... 'inbound')` — seed starts it at zero by design.
- Storefront honesty fix (`src/pages/Checkout.tsx`): the placed-order state and the WhatsApp confirmation now use the **server order total** (`order.total`, demo-identical in demo mode); in supabase mode the message appends "(delivery fee confirmed at dispatch)" — the UI no longer displays a client-side grand total the Supabase path does not (yet) match.
- Build green (vite), `tsc -p tsconfig.app.json` rc=0. The deploy/smoke RUNBOOK for the owner (0001–0004 + five functions + env flip + e2e smoke + rollback) lives at `docs/08-master-plan/HOSTED-DEPLOY-RUNBOOK.md` (docs-only slice to follow).

**Slice 9 (this commit) — shipping fee parity + public-intake abuse guard (migration 0005):**
- `supabase/migrations/20261107000005_shipping_and_rate_limit.sql` (NEW): `order_rate_limits` (key/bucket_time/count, RLS locked, zero client-facing grants — the RPC is the only writer). `order_submit` re-defined (0003/0004 left immutable) with two deliberate changes: (1) **shipping now computed server-side** — Rs 2,500 flat, FREE at ≥ Rs 50,000 subtotal, mirroring `Checkout.tsx`'s live policy exactly; quote-converted orders still carry quote shipping. (2) **fixed-window rate limit** — 20 submissions per 10 minutes per caller key; key = edge `x-forwarded-for` stamped by the EF (client-sent `rateKey` values discarded — the abuse vector sealed); missing key buckets as `anon`; exceeded → exception `rate limit exceeded` (errcode 42501) → EF maps to **429** (adapter throws a friendly error). Replay-idempotent client_ref calls count toward the bucket too — the 20/10min budget is the whole caller's intake budget, documented inline.
- TS mirror: `src/config/shipping.ts` (`FLAT_DELIVERY_FEE_PKR`, `FREE_DELIVERY_AT_PKR`, `deliveryFeeFor`) — `Checkout.tsx` imports it; the DB and this module are dual-source by construction and both carry a keep-in-sync comment.
- `supabase/functions/order-submit/index.ts`: extracts the first `x-forwarded-for` entry, stamps it as `rateKey` inside `p_customer` (server wins), and maps RPC `rate limit` → **429** (not 400/500 — retry-safe semantics; also documented in the header contract comment).
- `AdminApi.createOrder` maps HTTP 429 → descriptive `Error` ("too many orders on this connection…").
- `types.ts` unchanged — `p_customer` is opaque JSON; the EF is the only place the rate key enters.
- Verified: rehearsal **75/75** (legacy happy-path expectation updated to `price + Rs 2,500`; new: below-threshold fee; free-at-50k exactly at the boundary (`Rs 1000 × 50 = Rs 50,000 → 0`); 20-allowed/21st-rejected; per-key isolation; window reset after 11 minutes; missing-key `anon` path). `tsc` rc=0; production build green; Checkout renders through the shared constant. **UNSHAKABLE caveat unchanged: nothing executed on hosted Supabase.** The shipping value in any order written before a hosted 0005 run stays 0 — one-time rows, no migration needed (or backfill if the owner wants parity).

**Slice 10 (this commit) — lead-capture abuse guard (migration 0006) + a rebuilt rehearsal harness:**
- `supabase/migrations/20261107000006_lead_rate_limit.sql` (NEW): `lead_rate_limits` (key/bucket_time/count, RLS-locked, zero client grants — mirrors `order_rate_limits`). `lead_rate_limit_hit(p_key, p_limit default 20, p_window_minutes default 10) returns int`, security definer, **`PUBLIC` EXECUTE revoked** (the 0005 grant matrix exposed the PG default — rehearsal caught executable-by-anon before this fix), granted to `service_role` only. Defensive `create role service_role if missing` added (hosted compatibility + rehearsal on bare PG).
- `lead-capture` EF: stamps caller key from edge `x-forwarded-for` (client-sent keys discarded), calls the limiter RPC BEFORE the insert, returns **429** over budget, **fails OPEN (logs)** when the limiter RPC errors — a missing migration degrades to pre-limiter behavior, never silently drops leads (documented in header + runbook).
- Runbook updated (migration 6 applied, §8 bullets rewritten). The subset of CI pre-existing failures is NOT touched — lint stayed 0-errors on this branch (#12).
- **Harness rebuilt and result is different from the old number, on purpose:** the `/tmp` rehearsal harness was wiped with the authoring sandbox. Rebuilt from the migrations as `/tmp/pglite-hub/run-next.mjs` (fresh install of `@electric-sql/pglite`). Result over the same critical paths **28/28 PASS** on this build (migrations 0001–0006 apply clean; caps flow; order_submit fee boundary 49,999/50,000 exactly; replay idempotency incl. no double decrement; quote_convert negotiated math + re-convert refusal + sale movement; `lead_rate_limit_hit` grant matrix incl. PUBLIC-revoke proof + window reset). The pre-reset "68/75" figure was NOT re-asserted and is no longer cited anywhere.
- **UNSHAKABLE caveat unchanged:** nothing executed on hosted Supabase. The lead limit also ships unverified end-to-end (EF → RPC) — EF logic is thin pass-through, but the 429 path has no hosted evidence yet.

**Slice 11 (this commit) — catalogue seed (`supabase/seed.sql`) — hosted deploy would otherwise serve nothing:**
- Discovery driving this slice: **no migration, seed, or fixture in the repo seeds any data** — a hosted project following the runbook would deploy successfully and then show an empty storefront; every storefront `order_submit` would fail with "product not found". The catalogue lives only in `src/data/products.ts`.
- `supabase/seed.sql` (NEW, ~227 KB, 203 statements): applied after migration 0006, single transaction, **idempotent (`ON CONFLICT DO NOTHING` — rehearsed by applying the file twice)**. Content, generated from `src/data/products.ts`: 19 categories (tops NULL parent, `office|home` groups from `categoryGroups`; `sort` = insertion order; **one dangling parent ref found and neutralized — `office-sofas` referenced `sofas`, which has no catalogue row; stored top-level and documented in-file**), 5 series (names humanized from slugs: EK / Infinity / Nova / Woodex / Cubicle), **148 products** (`id`, synthetic `WK-<UPPER-ID>` SKUs — the source catalogue has no SKU field, **stock_qty = 100 in-stock / 0 otherwise — placeholder only, see warning**, `in_stock` boolean, `series_id`/`category_id` FKs, `payload` = the full Product plus `specs` alias, `stockStatus`, `sku`, fixed `createdAt` 2026-11-01; `products.name` is a GENERATED column from `payload->>'name'`, so the payload carries it).
- 18 product images copied to `public/images/seed/*.webp`; seeded payloads reference the same-origin `/images/seed/<file>.webp` paths — **those files must ship with the web build or every product photo 404s** (they do: tracked under `public/`).
- `src/data/products.ts` untouched (still `import`ed by the SPA); the seed was generated via the `/tmp` esbuild bundle harness (stubs for Vite asset imports) — harness not committed.
- Rehearsal extended (`/tmp/pglite-hub/run-next.mjs`): applies seed after migrations, asserts 19/5/148 rows, zero unresolved `products.category_id`, generated-name population, **idempotent double-apply (catalogue stays exactly 148)**, and an end-to-end order against the seeded `ballmer-executive-desk` (Rs 52,000 ≥ threshold → FREE delivery, WDX ref, stock 100 → 99). **36/36 PASS.**
- Runbook updated (new §1a seed step with stocktake warning; rehearsal figure 68/68 retired → 36/36; stale branch/PR references modernized; products/categories/series count expectations added).
- **Placeholder-stock caveat is load-bearing:** until the owner runs a physical stocktake, `stock_qty` in a seeded database is fiction. The seed header repeats this in all caps.
- **UNSHAKABLE caveat unchanged:** nothing executed on hosted Supabase. The seed file has never been run against a hosted project either — only in rehearsal.

**Slice 12 (this commit) — Cloudflare Turnstile anti-bot gate on both public intake EFs (decision brief option C):**
- `supabase/functions/_shared/turnstile.mjs` (NEW, plain ESM, fetch injected — runs in Deno AND under `node --test`): verifies the token against siteverify; success + action match → ok; missing token → 403 (never calls siteverify); invalid → 403; siteverify HTTP/transport/non-JSON failure → **503 fail-CLOSED** (a Cloudflare blip must not wave bots through a COD checkout); action mismatch → 403 (a token minted for one flow can't be replayed against the other).
- `supabase/functions/_shared/turnstile.test.mjs` (NEW): 8/8 `node --test` PASS (ok/missing/invalid/action-mismatch/500/transport-error/non-JSON/form-body). CI workflow gained an `Edge-function guard tests` step (node --test) — wired into `.github/workflows/main.yml` before Typecheck.
- `order-submit` + `lead-capture` EFs: import the shared verifier; **gate runs BEFORE any RPC/limiter spend** when `TURNSTILE_SECRET` is set; **fail OPEN (log) when unset** (unconfigured mode, same posture as the fixed-window limiter); deploy from this repo bundles the relative import.
- Client: new `src/lib/turnstile.ts` — `getTurnstileToken(action)`; invisible challenge (`execution: render`), dynamic script injection (no new dependency), 15 s timeout, surfaced errors abort the submit with a toast instead of flying blind. Demo/preview builds and builds without `VITE_TURNSTILE_SITE_KEY` render nothing and change nothing.
- `Checkout.tsx` (action `order`), `Contact.tsx` + `Quotation.tsx` (action `lead`): token acquired before submit; `NewOrderInput`/`NewLeadInput` gained optional `cfTurnstileToken`; the supabase adapter passes it through and maps 403 → "anti-bot check failed".
- Env: `.env.example` documents `VITE_TURNSTILE_SITE_KEY` + EF-side `TURNSTILE_SECRET`; runbook gained the secrets/env lines, a §2 deploy note, and a §8 caveat. Runbook §8's anti-abuse bullet still points at `docs/08-master-plan/ANTI-ABUSE-DECISION.md`, which arrives on main via the anti-abuse docs PR (#13) — **merge order: #13 first (docs-only), then this PR; code here does not depend on the doc.**
- Verified locally: `node --test` 8/8 · `tsc` rc=0 · eslint 0 errors (34 pre-existing warnings) · `vite build` green · e2e smoke **42/42 PASS**. **UNSHAKABLE caveat unchanged: nothing executed on hosted Supabase** — the siteverify path has mocked-fetch tests only. Gates flip live only when the owner creates the Turnstile pair and sets both keys (§3/§5 of the runbook).

**Slice 13 — Delivery-zone machinery, migration 0007 (2026-11-07) — BEHAVIOR-PRESERVING, not yet in a hosted DB.**
Adds `tier`, `fee`, `free_at_subtotal`, `active`, `updated_at` as an **additive ALTER** of the CMS-facing `delivery_zones` table that 0001 already created (public SELECT and the catalog.manage write path are intentionally kept). Seeds 13 rows — 12 storefront dropdown cities (`zone-<city>`; hub = lahore/karachi/islamabad/rawalpindi, other eight major tier) + a `default` row — every row fee 2500 / free_at_subtotal 50,000, byte-identical to the flat rule. `order_submit` redefined: city matches normalised (lower/trim), duplicates resolve deterministically (earliest `created_at asc nulls last`, then `id asc`, limit 1), unknown city falls back to `default`, missing/inactive `default` falls back to the historic constants (2,500 / 50,000), `free_at_subtotal = NULL` is the never-FREE escape hatch, and the quote path keeps the quote's own shipping. Rate flips are owner data (one UPDATE), not code. Rehearsal: 43/43, incl. flipped-hub-fee lookup, case-insensitive match, unknown-city/default fallback, never-FREE NULL, and constants fallback with default deactivated. Rate values and threshold policy are NOT decided — see ZONE-RATE-DECISION §5 (owner).

**Slice 14 — Wave 2 draft orders + Wave 2b exchanges/claims + Wave 3 singleton resets (2026-11-07) — migrations 0008/0009, adapter-wired, not yet in a hosted DB.**
- **0008 draft_orders** — staff-held draft carts (Wave 2). RLS: read = order.manage OR finance.manage (finance read-only), write = order.manage, anon nothing. Identity starts at 1001; refs DRF-####. Totals are display caches — conversion deliberately NOT wired (owner 2026-11-07: conversion must reprice via the order-submit path: server-authoritative prices, stock-checked, replay-safe). Supabase adapter CRUD wired (line sanitise, totals recompute, optimistic UI untouched); `Drafts.tsx` unchanged and lights up in supabase mode.
- **0009 exchanges + claims** — sibling of RMA returns (Wave 2b). Identity 1001 (EXC-#### / CLM-####). Same cap model (finance read-only). State machines enforced in the adapter (`EXCHANGE_TRANSITIONS`/`CLAIM_TRANSITIONS` mirror demo); line validation against order/RMA/products; stock effects via `inventory_apply` (catalog.manage — same constraint as returns restock); timeline notes via NEW `record_order_event` security-definer RPC (order.manage only; 500-char note cap; PUBLIC/anon EXECUTE revoked).
- **Wave 3 singleton resets** — new shared defaults module `src/api/singleton-defaults.ts` (single source = `@/data/*` seeds). Demo adapter deduped onto it (removed its duplicated warranty-page clone machinery). Supabase `resetWarrantyPage` / `resetCustomDesignPage` / `resetVirtualShowroomPage` now upsert the bundle's real default copy into the page.manage-gated singleton rows — no invented copy.
- **Track B audit (2026-11-07, owner: legacy stays analysis-only)** — all eight greatest-first findings verified in THIS repo: #1 Analytics, #2 Projects, #3 dashboard widgets, #4 Settings, #6 category admin, #8 revenue series already live/absent-by-design; #5 `/support` does not exist here; **#7 fixed** — Login demo-credentials hint now renders only with `VITE_ADMIN_DEMO_HINT=1` (default off); Settings `save()`/`resetDemo()` gained error paths + toasts. woodex420/woodex-2030 untouched.
- **Rehearsal 66/66** — migrations 0001–0009 + seed double-apply clean on fresh pglite; prior coverage holds; new: draft/exchange/claim cap matrices, identity starts, CHECK constraints, `record_order_event` grants, singleton upsert roundtrip. Hosted project has NOT executed 0008/0009 (no egress in this sandbox).

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
