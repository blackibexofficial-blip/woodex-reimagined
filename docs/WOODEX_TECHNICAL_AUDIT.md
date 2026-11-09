# Woodex Reimagined — Phase 0 technical audit

**Date:** 2026-11-08 · **Branch:** `arena/6bd5a1db-woodex-reimagined` · **Base:** `84aad2944a2c23c9493304277f84cb4796270b28`

**Scope:** discovery only; no application, migration, hosted data, or deployment changes. The previously committed audit referred to a different branch and historical tests; it is preserved at `docs/08-master-plan/WOODEX_TECHNICAL_AUDIT_PREVIOUS.md` and is not evidence of this baseline.

## 1. Scope, evidence and limits

The requested `docs/WOODEX_MASTER_SYSTEM_PROMPT.md` is not in this checkout. The attached `writing-block.md` contains the 2,265-line Woodex Business OS master prompt; it was read in full and used as the target specification. The explicit request for **Phase 0 only** takes precedence over the attachment's later implementation directive.

Repository discovery covered the file tree, scripts and configuration, route definitions, adapter boundaries, major storefront/admin/CMS flows, root migrations and policies, relevant edge functions, and the reference backend. Search and targeted inspection identified the issues below; this is **not a line-by-line review or proof of correctness of all 359 source files, every imported reference function, every dependency, or every production feature**. In particular the hosted Supabase schema, storage policies, deployed edge functions, Vercel configuration/environment and actual live routes were not inspected or exercised. Outbound network policy excludes the production site and Supabase. Route lists below are repository routes, not verified production routes. Live deployment status and production risk exposure are **unknown**.

Evidence grades: **local test** = actually exercised here; **code** = observed in this tree, not end-to-end verified; **unverified** = needs staging/hosted checks. Passing a smoke test does not mean the whole feature meets the master prompt's definition of done. No feature is marked complete solely for having UI. All issue priorities use P0 critical security/data loss/business failure; P1 major broken workflow; P2 missing capability/performance; P3 polish/maintenance. P0 items below are release blockers **if the corresponding schema/function is deployed**, not assertions of an active breach.

## 2. Repository and architecture map

| Area | Current implementation and assessment |
|---|---|
| Application | React 18, TypeScript, Vite 5 SPA, React Router 6, React Query, Tailwind/shadcn/Radix, Recharts. Not Next.js. `src/main.tsx`, `src/App.tsx`, `package.json`. TypeScript config is non-strict (`tsconfig.app.json`). |
| Public storefront | `src/pages`, `src/components`, `src/contexts`; static seed catalog/content in `src/data`; cart and quote contexts; lazy-loaded routes. Browser-local demo storage is not a shared order or CRM database. `src/api/index.ts`, `src/api/demo/db.ts`. |
| Admin | `src/admin/AdminApp.tsx`, `Layout.tsx`, `pages`, `taxonomy`; API contract `src/api/types.ts`, adapters `demo/db.ts`, `supabase.ts`, `bagisto/admin.ts`. Demo and static resolve to demo adapter; Supabase is opt-in; Bagisto has extensive deliberate 501s. `src/config/env.ts`. |
| Backend | Current deployable Supabase artifacts are root `supabase/migrations` (14 files) and `supabase/functions` (bootstrap, lead capture, order submit/tracking, AI, MCP and shared utilities). `backend/supabase` is a separately imported reference set (15 SQL files, reference tables/functions), not proof of current deployment. Bagisto is a runbook/Docker reference under `backend/`, not an installed Laravel application. Do not blindly combine these schemas. |
| CMS / builder | Puck editor in `src/pages-builder` and `src/admin/pages/PageEditor.tsx`; document blocks, library, rich text, layers and preview; Supabase page RPCs in migration 0002; demo implementation in `src/api/demo/db.ts`. Distinct homepage controls and hardcoded `/` mean builder pages are not a universal live-site CMS. |
| Database | Root convergence migration defines business entities; later migrations add checkout, quote conversion, draft orders, exchanges/claims, job actuals and private project storage. 55 business tables were enumerated from an isolated migration replay; local test DB reported 56 including its test-only `_woodex_db_meta`. `drizzle/schema.ts` and `backend/supabase/tables` are additional artifacts, not evidence of the hosted schema. See §5. |
| Security | Demo login is explicitly a browser-side preview gate, not authorization. Supabase roles/capabilities and RLS are defined in root migration 0001, but serious exceptions are documented in §6. Root `supabase/config.toml` disables gateway JWT verification for several public functions; each must enforce its own rules. Hosted settings are unknown. |
| Deployment | `vercel.json` rewrites all paths to the SPA; `public/.htaccess` supports Apache. Vite dev server permits preview hosts. `.env.example` describes demo, Supabase publishable credentials, Bagisto, GA4 and Turnstile; `.env` is tracked despite `.gitignore` and must contain no secrets. Do not publish `VITE_BAGISTO_ADMIN_TOKEN` or any secret in a `VITE_` variable. Deployment and backup status not verified. |
| SEO/performance | `RouteHead.tsx`, JSON-LD, `public/robots.txt`, and generated `public/sitemap.xml` exist. Sitemap is seed-based and uses `woodex.pk`; confirm canonical host before deployment. Vite splits some vendor bundles; large output remains (§3). CWV, crawling, mobile performance and indexing have not been measured. |
| Integrations | `src/lib/analytics.ts`, wa.me links, Turnstile, optional Supabase, optional Bagisto, AI proxy and payment signature helper exist; none of the external provider connections or hosted secrets were verified. Reference backend functions are not deployment evidence. |

### Repository route inventory (as defined, not live-verified)

Public: `/`, `/shop`, `/shop/:productId`, `/room-packages`, `/virtual-showroom`, `/series`, `/series/:seriesId`, `/projects`, `/projects/:projectId`, `/services`, `/services/:slug`, `/b2b`, `/about`, `/contact`, `/custom-design`, `/quotation`, `/showrooms`, `/materials`, `/warranty`, `/blog`, `/blog/:postId`, `/checkout`, `/lab/:slug`, plus catch-all NotFound. There is no buyer account or public tracking route in `src/App.tsx` even though a tracking edge function exists.

Admin `/admin/*` (`src/admin/AdminApp.tsx`): login; dashboard, analytics, products/new/edit, taxonomy and legacy taxonomy redirects, projects, bulk-editor, inventory, orders/new, drafts, quotes, invoices/new, tasks, campaigns, client-merge, suppliers, showrooms, homepage, purchase-orders, transfers, returns, exchanges, claims, customers, clients, leads, chat, import, services, blog, content, warranty, custom-design, virtual-showroom, media, settings, pages and pages/:pageSlug. Print routes: invoice/:id, invoice-document/:id, quote/:id, order/:id, purchase-order/:id, return/:id, exchange/:id. Unknown admin routes redirect to dashboard. Access behavior for every parameterized route remains untested.

## 3. Baseline checks — actually run on this checkout

Initial `git status --short` was clean; branch and base recorded above. Node `v22.22.3`, npm `10.9.8`. `npm ci --no-audit --no-fund` succeeded (633 packages). Bun was initially absent. To run the Bun-dependent scripts and local PostgreSQL emulator, installed local, uncommitted Bun `1.4.4` and `@electric-sql/pglite` with `npm install --no-save --no-package-lock`; npm reported changing some installed packages. Consequently the subsequent full build/browser/DB runs use this locally modified node_modules, **not a frozen Bun CI install**. No package manifest or lockfile was intentionally changed.

| Check | Actual result and boundaries |
|---|---|
| `npm run typecheck` | PASS, exit 0, after `npm ci`; covers `src` per tsconfig, not Deno edge functions or SQL. |
| `npm run lint` | PASS, exit 0; **34 warnings, 0 errors**. |
| `npm run build` before local Bun installation | FAILED, exit 127, `bun: not found` — environment dependency, not a demonstrated application defect. |
| `npx vite build` after `npm ci` | PASS, exit 0; skips sitemap generation. |
| `npm run build` with local Bun on PATH | PASS, exit 0; 182 seed sitemap URLs generated, Vite warned of >500 kB chunks (builder ~662 kB, main ~843 kB, admin ~900 kB minified; values toolchain-dependent). Build regenerated tracked sitemap/MCP artifacts; changes were restored. |
| `npm run e2e` with local Bun | PASS **108/108** in local demo mode, including login, category CRUD guard, admin render, lab render, SEO markup and chat capture/reply. It is not a hosted backend or full commerce test. |
| `npm run e2e:a11y -- --fail` | PASS, **0 automated axe violations across 54 scanned routes**, desktop demo context. Not WCAG certification or mobile/manual keyboard testing. |
| `npm run test:rehearsal` | PASS **93/93**, isolated in-memory PGlite with stubbed Auth/Storage, root migrations + seed; partial capability/business assertions only. |
| `npm run test:db` | PASS **11/11**, isolated ignored `.local-db/woodex-test`, 14 root migrations and seed applied; 56 tables including test metadata, all RLS-enabled, private project bucket stub. This is not hosted Supabase. |
| `node --test supabase/functions/_shared/turnstile.test.mjs` | PASS **8/8**, mocked verification; not real Cloudflare. |
| `npm run test:payments` | PASS **15/15** HMAC helper cases; no gateway, webhook deployment or money movement tested. |
| `npm run test:ai-eval` | PASS **19/19** offline fixture tests; not a provider or customer-facing AI validation. |
| Targeted isolated PGlite probes | Reproduced anonymous draft snapshot access, anonymous access to changed blocks of a published page, published-version restore deleting draft blocks, and anonymous direct order RPC reducing synthetic stock. Details in §6–7. No real customer data or hosted system used. |

Not run: hosted migration/rollback and RLS matrix, actual Supabase Auth/Storage/Edge Functions, Bagisto, production smoke, staging checkout, provider webhooks/WhatsApp/GA4, real device/responsive review, Lighthouse/CWV, complete security penetration test, backup/restore and deployment validation. `scripts/staging-smoke.mjs` is not run against any hosted project. CI status was not queried.

## 4. Existing feature inventory

Legend: **Local evidence** means only the explicitly stated subset passed locally. **Code** means present in this checkout, untested end-to-end. **Partial** means design intentionally stops short of target or a documented defect exists. No feature is certified complete; no Phase 1+ fixes or new functionality were delivered in Phase 0.

| Feature | Existing evidence / tested boundary | Target status |
|---|---|---|
| Dashboard, analytics, notifications | Demo dashboard/chart surfaces and notification popover exercised in smoke; `admin_overview` RPC in SQL. | Partial; live metrics, calculations, ranges, reconciliation and drilldowns unverified. |
| Product catalogue, taxonomy | Demo category create/delete guard and product editor rendering tested; products, inventory, taxonomy SQL and API present. | Partial; admin-to-public shared catalog, variants, stock, all mode mappings and production data unverified. |
| Cart, checkout, orders | Browser cart/checkout and demo order adapter; Supabase order RPC reprices and locks stock. Anonymous RPC abuse reproduced. | Partial; no real test checkout or payment integration verified. |
| Quotes, invoices, payments | Quote UI/print and version model; quote and invoice/payment RPCs; local rehearsal tested specific role and partial/full-payment cases. Storefront quote form captures a lead, not a structured quote. | Partial; approval/conversion policy, pricing, revision/rollback and reconciliation need end-to-end staging tests. |
| CRM, clients, leads, tasks | Demo chat→lead and staff reply round-trip tested; client/lead/task pages, consent model, Edge intake and RLS exist. | Partial; hosted intake/identity linking and server chat unverified; Supabase chat methods are stubs (§7). |
| Page builder and CMS | Puck editor, block/section library, save/publish/unpublish/history/restore controls and `/lab` render exist; smoke tests lab render only. | Partial; unsafe draft visibility and restore defect reproduced, public routes and Supabase publish UI broken; no end-to-end editor-to-live acceptance. |
| Blog, services, portfolio | Admin and public route/components, seed data and Supabase adapters. | Code only; publication, edits and SEO propagation unverified. Project practice data raises security risk (§6). |
| Media, project storage | Demo media editor; metadata table and private `projects` bucket migration; local storage policy stubs tested. | Partial; real upload/download and media usage/validation unverified, no MIME allowlist on project bucket. |
| Inventory, procurement, returns/exchanges/claims | Pages, schema, stock ledger and conversion RPCs; selected draft conversion/stock rollback and role tests passed in PGlite. | Partial; lifecycle reconciliation and integrations untested. |
| Projects/production/QC | Project practice UI has BOQ, milestones, stages, QC and job actuals; actuals/RLS locally rehearsed. | Partial; dispatch QC gate explicitly client-side, not robust server enforcement; design approvals/delivery/installation/warranty lifecycle not verified. |
| AI / chat | Deterministic offline staff reply draft tested on fixtures and demo chat smoke. AI edge proxy exists. | Partial; not an autonomous customer AI, no hosted provider test, verified knowledge governance, controlled handover or staff enforcement in proxy. |
| Appointments | `site_visits` and admin workflow exist. | Partial; no demonstrated availability, collision-proof booking or provider notifications. |
| SEO | Local smoke asserts canonical and some JSON-LD; sitemap/robots exist. | Partial; real crawl/indexing, schema truthfulness, dynamic CMS sitemap, canonical deployment host unverified. |
| Settings / roles / integrations | Demo settings and role-aware root SQL; some RLS tests. | Partial; live permission isolation, audit coverage, provider configuration and admin security not verified. |

## 5. Database relationship map

This is the **root migration model replayed locally**, not a hosted database diagram. Actual deployed versions, extra tables, grants and data are unknown. `backend/supabase/migrations` and `tables` describe a separate imported model (e.g. `quotations`, `order_items`, WhatsApp tables); do not infer those are active or merge them blindly.

### Entities by domain (55 root migration tables)

- Identity/settings: `user_roles`, `user_profiles`, `app_settings`.
- Catalogue: `categories`, `series`, `collections`, `brands`, `option_sets`, `materials`, `services`, `products`, `bundles`, `price_lists`, `sales_channels`.
- Inventory/procurement: `inventory_meta`, `stock_movements`, `stock_transfers`, `suppliers`, `purchase_orders`, `delivery_zones`.
- CRM: `leads`, `clients`, `client_links`, `tasks`, `site_visits`, `conversations`, `messages`.
- Sales/finance: `quotes`, `quote_versions`, `quote_templates`, `orders`, `order_events`, `invoices`, `payments`, `returns`, `draft_orders`, `exchanges`, `claims`.
- CMS/content: `pages`, `page_blocks`, `page_versions`, `saved_sections`, `media_assets`, `track_events`, `blog_posts`, `projects`, `showrooms`, `homepage_sections`, `warranty_page`, `custom_design_page`, `virtual_showroom_page`.
- Project accounting: `project_cost_codes`, `project_actuals`; abuse control: `order_rate_limits`, `lead_rate_limits`. Storage migration also defines private `projects` bucket and four object policies.

### Explicit FK edges

```text
auth.users ──< user_roles, user_profiles
categories ──< categories(parent_id); categories ──< products >── series
products ──< stock_movements, inventory_meta, claims
suppliers ──< purchase_orders
clients ──< clients(merged_into), client_links, tasks, site_visits, conversations
leads ──< quotes, tasks, site_visits
quotes ──< quote_versions, invoices, tasks
orders ──< order_events, invoices, returns, tasks, exchanges, claims
returns ──< exchanges
invoices ──< payments
site_visits ──> tasks(reminder_task_id)
conversations ──< messages
pages ──< page_blocks, page_versions, track_events
projects ──< project_cost_codes, project_actuals
(project_cost_codes.project_id, code) ──< project_actuals(project_id, cost_code)
```

Source: migrations `0001`, `0008`–`0009`, `0013`. Check exact delete behavior and migrations for details. `purchase_orders.items`, `quotes.items`, `orders.items`, `stock_transfers.items`, catalog/content payloads and project practice data use JSON, so individual product/order lines lack FK enforcement. `client_links(entity, entity_id)` is polymorphic and cannot enforce a target FK. `series.collection_id`, links embedded in JSON, and the draft conversion reference require explicit integrity review; do not infer hard FKs from names. Quotes have a lead FK, but orders do not have a direct quote FK in the base schema; conversion uses metadata/reference fields. These gaps complicate traceability, uniqueness and reporting, not proof of lost data. Historical reference schema may differ substantially.

## 6. Security findings

Each entry includes priority, evidence/root cause, impact, proposed fix and verification. No remediation has been applied.

| ID | Priority / finding | Evidence and impact | Proposed fix and verification |
|---|---|---|---|
| S1 | **P0 — anonymous draft disclosure** | `supabase/migrations/20261107000002_page_rpcs.sql` defines `page_snapshot` as SECURITY DEFINER without a capability check or EXECUTE revoke. Isolated replay: anon could not select a draft page directly but could call `page_snapshot(1)` and retrieve its draft title/blocks. Migration 0001 also exposes current `page_blocks` and full `pages` rows to anon whenever a published snapshot exists; anon read an unpublished edit locally. | In a new reviewed migration revoke public/anon execution, enforce `page.manage` for drafts, expose a minimal published-snapshot-only public view/RPC; avoid breaking editor. Test anon, unprivileged authenticated, editor, owner, published vs draft and subsequent edit in staging. Review existing exposure before enabling. |
| S2 | **P0 — public order RPC bypasses anti-abuse** | Migration `20261107000007_delivery_zones.sql` grants anon EXECUTE on SECURITY DEFINER `order_submit`; direct callers can choose `p_customer.rateKey` and bypass Edge Function Turnstile and input limits (`supabase/functions/order-submit/index.ts`); an omitted key falls into the shared `anon` bucket rather than disabling the SQL limiter. Local anon RPC created a synthetic order and decremented stock 5→4 without calling the EF. Replay returns customer details for a known client reference; assess reference entropy and authorization. | Revoke direct public access, restrict RPC to a trusted server role, bind idempotency to an authorized request without exposing PII, implement server-enforced limits. Verify direct PostgREST denial and genuine EF checkout/replay/abuse tests on isolated staging. |
| S3 | **P0 — project business data publicly readable** | Migration 0001 `projects_read` allows anon `using (true)` for full `projects.payload` regardless of status. `src/admin/pages/ProjectPracticeDialog.tsx` saves practice BOQ, milestones, production and file metadata into that payload; `src/api/supabase.ts` persists it. Private Storage bucket does not hide metadata or budgets in JSON. | Separate a curated public portfolio projection from private project/CRM data, restrict underlying rows and migrate carefully. Verify anon cannot read practice, cost, client or archived data while public portfolio still works. Check hosted policies before storing sensitive project details. |
| S4 | **P1 — AI proxy does not verify staff membership** | `supabase/functions/ai-agent/index.ts` comments promise a staff allowlist, but `staffUserFrom` only verifies an Auth user and returns its ID; no role/capability lookup and no server rate limiter. Grounding is client-supplied. Hosted function is described as undeployed; actual state unknown. | Require server-side staff capability and server-trusted retrieval, rate/budget limits and PII handling; test valid nonstaff, disabled user, authorized staff, spoofed grounding and provider outage. Keep disabled until verified. |
| S5 | **P1 — demo auth and potential secret exposure** | `src/admin/auth.tsx` trusts a localStorage session; `src/config/env.ts` includes browser-visible demo credentials and an optional `VITE_BAGISTO_ADMIN_TOKEN`; `.env` is tracked. Demo gate is not real RBAC even when its hint is hidden. No secret values were copied into this report; actual credential validity/history not verified. | Never use demo gate as a production trust boundary; remove secret tokens from browser builds in a separate reviewed change, use server proxy and real auth/RLS, audit tracked history and rotate any real exposed credentials. Verify bundle scanning and direct API denial. |
| S6 | **P1 — authenticated users receive overly broad reads** | Migration 0001 policies allow any `authenticated` user to read suppliers, purchase orders, stock movements and app settings (`using (true)`); default role is viewer. Customer accounts could widen exposure if enabled. Other definer functions and historical imported functions need a full privilege audit. | Enforce least-privilege read capabilities and separate public settings; inventory EXECUTE grants/default privileges and service-role paths. Run a complete anon/nonstaff/role deny matrix against staging. |
| S7 | **P2 — unsafe operational assumptions** | `lead-capture` and `order-submit` fail open when Turnstile secret is absent; lead limiter RPC failure also fails open. `admin-bootstrap` documents a concurrent first-owner race and potential orphaned Auth user; `0014` has 50 MB cap but no MIME allowlist. `richtext.tsx` uses a custom sanitizer and requires adversarial testing. | Explicitly choose fail-closed production posture, rate limiting and bootstrap lock/cleanup; validate content and file types server-side; use proven sanitization with a security corpus. Test missing secret, concurrency, malicious HTML/upload and failure paths. |

RLS being enabled on every locally replayed table is useful but does **not** prove the policies secure. No production credentials, records or policies were read or modified.

## 7. Broken-functionality register

| ID | Priority / paths / root cause | Impact | Proposed fix and verification |
|---|---|---|---|
| B1 | **P0 — version restore can delete draft blocks.** Migration `0002` `page_publish` and `page_revert` store `to_jsonb(pg)` (blocks nested in `published_snapshot` or absent); `page_revert` expects top-level `snapshot.blocks` and deletes existing blocks first. | Local replay: publish a page with one block then revert that published version → zero page blocks. Permanent loss is possible if no valid history remains. | Store one versioned canonical snapshot shape for save/publish/revert; migrate/read old shapes without overwriting; add transactional regression tests for every version action and restore. |
| B2 | **P1 — Supabase owner cannot publish in editor.** `src/lib/owner.ts` returns `isDemoMode` only; `PageEditor.tsx` disables/denies publish otherwise. | A real Supabase owner is blocked in UI regardless of DB capability. | Resolve authenticated role/capability and retain server checks; test owner/editor/viewer in each mode. |
| B3 | **P1 — builder publish does not route to live public pages.** `src/App.tsx`, `src/pages/Index.tsx`, `src/pages-builder/LabPreview.tsx`, `src/api/supabase.ts`. `/lab/:slug` uses current `page.doc`, while `/` is an independent hardcoded page; no generic published-page route. | A published builder page is not automatically the real storefront; live and draft isolation cannot be claimed. | Introduce published-snapshot renderer for approved routes while preserving URLs and old fallbacks; authenticated draft previews; test edits→draft→publish→public→restore. |
| B4 | **P1 — Supabase chat adapter incomplete.** `src/api/supabase.ts` chat methods return undefined/empty/offline, despite demo chat functioning. | Demo smoke does not establish hosted visitor/staff message persistence or handover. | Implement authorized server-backed conversation/message flow and consent, or clearly disable; staging round-trip and access tests. |
| B5 | **P1 — quote request is only a lead and loses structured detail.** `src/pages/Quotation.tsx` calls `createLead`, constructs truncated basket summary; `src/api/supabase.ts` sends company/city/value but `supabase/functions/lead-capture/index.ts` does not insert those fields and clips interest to 120 chars. | Quote request data can be incomplete; no structured quote or full basket persistence from that form. Hosted behavior inferred from code, not tested. | Define validated intake contract, persist all consented fields and line items with CRM/quote linkage; test long basket, city, retry and failure. |
| B6 | **P1 — Bagisto adapter incomplete.** `src/api/bagisto/admin.ts` deliberately throws 501 for quotes, invoices, RMA, page builder and other methods. | Selecting Bagisto does not provide parity; avoid claiming the mode is live-ready. | Decide authoritative backend, implement/verify mappings or clearly gate unsupported actions; integration tests on an isolated Bagisto staging instance. |
| B7 | **P1 — quote conversion approval is not enforced in SQL.** `20261107000004_quote_convert.sql` checks capability and already-converted but does not require an approved status before converting. | A caller with quote capability can convert a non-approved quote through the RPC. | Enforce allowed state transition atomically; test draft/revised/rejected/approved, replay and concurrency. Approval policy needs owner decision. |
| B8 | **P2 — project QC enforcement only in UI.** `src/admin/pages/ProjectPracticeDialog.tsx` documents dispatch check as client-side; `src/api/supabase.ts` merges project payload. | Direct writes can bypass the QC gate. | Enforce state transitions and audit at server/DB boundary; test direct API and concurrent edits. |
| B9 | **P2 — routes/build/runtime documentation drift.** `README.md`, `backend/supabase/README.md`, old audit, `.env.example`; `src/integrations/supabase/client.ts` consumes env directly and creates a client from raw env despite docs saying central config only; build requires Bun. | Misleading backend, mode and test claims; clean npm-only environments cannot run scripted build. Empty-Supabase configuration behavior was not tested. | Reconcile docs, pin toolchain and validate config/optional mode explicitly; run clean install, empty env, each adapter and build CI. |
| B10 | **P2 — large bundles and seed-only sitemap.** `vite.config.ts`, `scripts/generate-sitemap.ts`, `public/robots.txt`. | Build warns >500 kB; dynamic CMS/product entries and deployed canonical host are not proven reflected. | Measure mobile LCP/INP/CLS, split based on profiling, generate sitemap from authoritative published data and chosen domain; validate crawl/head output. |

## 8. Missing-functionality register versus master prompt

These are target gaps, not claims that every related screen is absent. Each includes a suggested verification gate.

| Priority / gap | Evidence and proposed direction | Verification |
|---|---|---|
| P1 Shared production data | Default demo/localStorage; hosted integration status unknown (`src/config/env.ts`, `src/api/index.ts`). Choose system of record and prove staging persistence before any flip. | Two independent browsers + admin and reload; no demo fallback; backup/rollback. |
| P1 Safe complete builder publishing | Missing generic live renderer, draft isolation and functional Supabase publish (B1–B3). Add public snapshot, revisions, authorized preview and concurrency protection. | Full create/edit/save/preview/publish/restore/unpublish tests with two editors. |
| P1 Checkout/payment and account | Checkout offers COD/bank only (`src/pages/Checkout.tsx`); no buyer account route; helper test is not gateway. Decide provider and server-side verified webhook design. | Sandbox payment/replay/refund, permission and ledger reconciliation; no real money in tests. |
| P1 Autonomous AI sales / human takeover | Offline staff drafting and unverified proxy are not customer-facing qualified agent. Build grounded retrieval, persistent conversations and human handover after security/privacy review. | Adversarial grounding, catalog freshness, no invented claims, staff takeover and history tests. |
| P2 Booking | Site visits exist, but no demonstrated slot inventory/staff schedules or transactional conflict prevention. | Concurrent double-book and timezone/reschedule tests. |
| P2 CRM lifecycle | Lead intake/quotes/clients exist but structured intake and cross-domain traceability are incomplete. | Lead→client→approved quote→order→invoice traceability, retry and reconciliation tests. |
| P2 ERP / production | Practice stages and basic QC exist, not the complete auditable design-approval, production, inspection, delivery, installation and warranty workflow. | Immutable approval versions, server-side gates, role and traceability tests. |
| P2 Finance/procurement | Manual invoices/payment and job actuals exist; expenses, full accounting/receivables/refunds and inventory/PO reconciliation are not established. | Double-entry/accounting decisions, idempotency, balances and reconciliation tests. |
| P2 Communications / automation | Links, local inbox, campaign UI and reference WhatsApp functions exist; no verified provider sender, suppression, execution logs or full automated notification system. | Provider sandbox opt-in/opt-out, webhook authentication, retry/idempotency and audit tests. |
| P2 CMS capabilities | Scheduling, granular global theme/menu manager, schema validation/migration, asset usage/focal crop and full multi-device controls not established; existing features should be reused. | Builder widget, asset and responsive acceptance matrix. |
| P2 SEO / observability | CMS-driven sitemap/redirect controls and independent performance/error monitoring not established. | Crawl, schema validation, CWV measurements and alert/rollback drill. |
| P3 Maintenance / accessibility | 34 lint warnings, non-strict TS, large generated/adapter files; axe covers only automated subset. | Incremental lint/type improvements and manual keyboard/screen-reader/mobile testing. |

## 9. Prioritized roadmap — future work only, not authorized or started

1. **P0 safety gate:** owner review of S1–S3 and B1; establish isolated staging, identify actual deployed migrations/functions/grants, verify backup and rollback. Do not enable affected hosted features or place sensitive project data in public payloads until exposure is assessed. Reproduce deny tests against staging, never production data. Prepare additive reversible migrations and targeted regression tests before applying anything.
2. **P1 foundations:** fix auth/capability and AI authorization (S4–S6), anti-abuse at the actual trust boundary, restore/version safety, Supabase publish, quote approval and structured lead intake. Run complete auth/RLS/abuse tests and preserve routes/functionality. Decide Supabase vs Bagisto authority explicitly; do not remove either without approval.
3. **P1 CMS/storefront:** shared renderer of published snapshots, authenticated preview, version compatibility/concurrency and real catalog propagation; migrate incrementally while retaining existing public URLs and controls. Verify independent admin/visitor sessions.
4. **P1 commerce and CRM:** safe order intake, inventory, quote approval/conversion and invoice reconciliation; then customer identity and sandbox payments. Keep provider secrets server-side and integrations visibly unconfigured until tested.
5. **P2 content, AI and operations:** blog/services/portfolio and media; verified AI/handover and communications; booking and ERP/QC workflows, in dependency order. Adopt domain ownership, consent and accounting/provider decisions before connecting external services.
6. **P2/P3 readiness:** instrumentation, analytics reconciliation, accessibility and mobile/CWV measurements, SEO and sitemap validation, regression/permission/migration tests, staff docs, recovery exercise and owner-approved release.

Every phase needs explicit scope/approval, staged backup and rollback, actual tests, and a fresh status report. No hosted deployment, migration, backup, provider connection or implementation is claimed in Phase 0.

## 10. Environment and handoff

- Set `VITE_API_MODE` deliberately; demo/static use browser-local state, `supabase` requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, Bagisto requires its server and an appropriately secured integration. Do not expose a service-role key or privileged Bagisto token in browser variables.
- Public site key and server `TURNSTILE_SECRET` must be paired if anti-abuse is enabled; current unconfigured behavior is fail-open. GA4 is optional and unverified. Actual required hosted secrets and selected provider configuration must be reviewed in deployment, not copied into this report.
- The 14 root SQL migrations and seed were preserved; only local ephemeral/test databases were changed. No backup of the hosted DB was created or verified and no deployment was made. Before later migrations, obtain owner-approved staging and a verified backup/restore plan.
- Phase 0 deliverables are this consolidated technical audit, route/feature inventory, relationship map, findings and roadmap. Functional repair and all acceptance workflows remain open.
