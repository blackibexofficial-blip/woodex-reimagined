# WOODEX — Laravel admin: master plan (report first)

> **Status: plan only. Nothing in this document has been built, applied or deployed.**
> It exists so the Laravel tier can be approved, costed and sequenced before a single
> PHP file is written. Every claim about the *current* state below is backed by a file
> path, a suite tally or a command that can be re-run.
>
> Written 2026-11-11 on branch `arena/b670b12b-woodex-reimagined`, against
> `main` = `eb4ef30` (PR #41 merged).
>
> Companion documents: `07-MODULE-SPECIFICATIONS.md` (target module behaviour, attached),
> `PHASE2-COMPLETION-MASTER-PLAN.md` (M0–M10 of the *current* stack),
> `PHASE2-OWNER-DECISIONS.md` (D-01…D-08), `HOSTED-DEPLOY-RUNBOOK.md`,
> `MASTER-TODO.md`, `docs/02_WOODEX_FEATURE_COMPLETION_MATRIX.md` (265 triaged rows).

---

## 0. What this report answers

1. What exists today, and what of it survives a Laravel backend (evidence, not opinion).
2. Which Laravel/PHP/MySQL shape fits the owner's hosting reality.
3. What each of the 15 target modules maps to — tables, endpoints, permissions, acceptance.
4. How data moves from Postgres/Supabase to MySQL without two writers on one record.
5. What the build costs, in what order, and what has to be true before each phase starts.
6. Which parts of Bagisto 2.5 are worth adopting, and which are traps for this business.
7. What the owner must decide or supply before Phase 0 can start.

---

## 1. Decision record (what changes — and what does not)

**The target, as written in the owner's spec:**
Laravel + MySQL is the production write authority; React (storefront + dashboard) is the
presentation tier; Puck is the visual editor; two separately deployable React apps;
Hostinger shared hosting within verified resource limits.

**What that means concretely for this repository:**

| Component | Today | Under the Laravel plan |
|---|---|---|
| Presentation | One Vite React app, `src/` (storefront) + `src/admin/` (dashboard) | Unchanged code, later split into `apps/storefront` + `apps/dashboard`; adapter gains a `laravel` mode |
| Server authority | Supabase/Postgres: RLS policies + 40+ capability-gated RPCs, 38 migrations | Laravel 12 domain services + Eloquent/query layer, MySQL 8 |
| Authorization | Postgres RLS **plus** `has_cap`/`require_cap` inside SECURITY DEFINER functions | Laravel Gates/Policies + scoped queries. **MySQL has no RLS** — see §5 |
| Identity | Supabase Auth (`auth.users`), `user_roles` | Laravel auth (Sanctum SPA cookies) + `roles`/`permissions` tables |
| Concurrency control | `pages.revision` / `projects.revision` + `40001` stale-write refusals (00034, 00035) | Same contract in Laravel: `revision` column + `409 Conflict` + ETag |
| Publish pipeline | `page_versions` journal, `published_snapshot`, `published_page()`, `page_preview()` (00015, 00036) | Ported 1:1 to Laravel services; the *contract* is already proven by 26 + 31 checks |
| Data | Postgres schema, 61 tables, demo adapter, seed catalogue (148 products) | MySQL 8 schema, migrated per domain; demo adapter stays for offline work |
| Tests | 24 PGlite SQL suites + 123 browser checks + 6 focused browser suites | Pest feature tests on MySQL, contract tests, the same browser suites pointed at the Laravel API |
| CMS storage | `pages`, `page_blocks`, `page_versions`, `published_snapshot`, `published_page_index` | Same shapes as MySQL tables; the JSON document stays JSON |

**What does not change:** the React UI, the design system, the Puck block catalogue, the
page/preview/publish semantics, the capability names (`page.manage`, `catalog.manage`,
`crm.manage`, `quote.manage`, `order.manage`, `finance.manage`, `media.manage`,
`theme.manage`), the demo adapter, the SEO contract, and the browser regression suites.

**What is lost if we move to MySQL and do not compensate:** database-enforced row
security. Today an anonymous client physically cannot read `pages.published_snapshot`
drafts because policies and grants say so, and the public surface matrix (9 checks over
37 migrations) proves it. In MySQL that guarantee becomes *application* policy — weaker,
and only as good as the tests that cover it. §5 treats this as the single largest risk
of the plan.

---

## 2. Current-state inventory (the baseline the plan starts from)

| Capability | Evidence in repo | Honest limit |
|---|---|---|
| Storefront, 23 routes | `src/App.tsx`, `src/data/*` | renders from seed data; no server data |
| Admin dashboard, 47 routes | `src/admin/AdminApp.tsx`, `src/api/*` | demo localStorage by default |
| Adapter seam: demo / supabase / bagisto | `src/api/{index,demo/db,supabase,bagisto/admin}.ts` | Bagisto adapter returns 501 by design |
| Postgres tier | `supabase/migrations/` **38 files**, 61 tables, RLS on 61 | applied only to 00028 hosted; 00029–00038 in git only |
| Roles & capabilities | `20261107000001`: roles `owner, editor, sales, finance, viewer`; caps `*`, `page/theme/catalog/media.manage`, `crm/quote/order.manage`, `finance.manage` | no per-record scoping; no client portal identity |
| Concurrency | `00034` (projects), `00035` (pages): revision tokens, stale-write refusal | proven locally only |
| Publish pipeline | `00015` snapshot + `00036` preview | proven locally (26 + 31 checks) |
| Composite surface guard | `rehearsal/public-surface-matrix.mjs` — 9 checks, 37 migrations | enumerates every anon-executable definer |
| SQL regression | `npm run test:sql-all` — **24 suites**, 38 migrations, exit 0 | PGlite only; no real concurrency |
| Browser regression | `npm run e2e` — **123/123**; 6 `phase1-*` suites (page editor 23/23) | demo mode, synthetic data |
| Builder | `src/pages-builder/*`: 40 sections + 17 elements, Puck v0.19 | BLD-002 in flight (33/37 rows proven) |
| Feature matrix | `docs/02` — 265 rows: 0 Complete, 199 In Progress, 26 Testing, 25 Not Started, 15 Blocked | triage, not completion |

**Reproduce the baseline** (bun required for build/e2e):

```
npm install --no-save --no-package-lock --no-audit --no-fund
npm run test:sql-all                 # 24 suites
npm exec --yes --package=bun -- npm run e2e   # 123 checks
node e2e/phase1-page-editor-safety.mjs        # 23 checks (needs vite on :8080)
npx tsc --noEmit -p tsconfig.app.json && npx eslint .
```

---

## 3. Target architecture

### 3.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | PHP 8.3 (fallback 8.2) | Hostinger's current shared plans; Laravel 12 floor is 8.2 |
| Framework | Laravel 12, no Livewire/Inertia | the dashboard is React; Laravel must stay an API + jobs |
| Database | **MySQL 8.0** (`utf8mb4_unicode_ci`) | spec §2.6; shared-hosting default |
| Auth | Laravel Sanctum, SPA cookie mode | same-site cookie + CSRF; no long-lived token in the browser |
| Permissions | `spatie/laravel-permission` + domain guards | role bundles *and* per-action checks |
| Queue | `database` driver | no Redis guarantee on shared hosting |
| Scheduler | cron every minute → `schedule:run` | Hostinger supports it; verify cadence in Phase 0 |
| Media | local disk `storage/app/public` + optional S3/CDN adapter | keep the adapter boundary |
| Search | MySQL FULLTEXT first, Meilisearch only if the plan allows a daemon | PGroonga/tsvector is gone; don't pretend |
| API docs | OpenAPI 3.1 generated from route definitions/Pest | contract is the handover artefact |
| Static frontends | prebuilt React bundles served from the same host | no persistent Node process |

### 3.2 Shape

```
app/
  Domain/                     # one folder per module — the unit of ownership
    Crm/                      # Leads, Contacts, Tasks, Visits
    Sales/                    # Estimates, Quotations, Invoices, Payments
    Commerce/                 # Products, Categories, Series, Orders, Delivery
    Procurement/              # Suppliers, POs, Receipts, SupplierInvoices
    Production/               # Jobs, Stages, Materials, QC, Handover
    Inventory/                # Warehouses, StockLedger, Transfers, Reservations
    Accounts/                 # Ledger, Payables, Expenses, Reports
    Projects/                 # Projects, Milestones, Vendors, Portal
    Inbox/                    # Conversations, Channels, Assignment
    Automation/               # Sequences, Templates, Consents, DeliveryLog
    Marketing/                # Campaigns, Sources, SearchTerms
    WebsiteStudio/            # Pages, Blocks, Versions, Publish, Media, SEO, Redirects
    System/                   # Users, Roles, Settings, Audit, Approvals, Reports
  Http/Api/V1/…               # thin controllers: validate → authorize → service → resource
  Support/                    # Money, Currency, Timezone, Idempotency, Audit
database/migrations/          # ≤ 1 migration per table family, reversible
tests/Feature, tests/Policies, tests/Contract
```

Rules: a controller may not contain business logic; a domain may not import another
domain's models (only its public service or events); every write emits an audit row;
every list endpoint has an explicit `ORDER BY` (Bagisto's category-pagination bug class);
money is integer minor units + explicit currency (§8.4).

### 3.3 Environments

| Env | Where | Data | Purpose |
|---|---|---|---|
| local | dev machine / this sandbox | MySQL 8 docker or SQLite for unit only | build, Pest |
| staging | Hostinger subdomain + separate DB | synthetic only (`ZZ-` prefix) | parity gates, browser e2e |
| production | Hostinger main domain | real | cutover after Gate 4 |

---

## 4. Module map — spec §7/`07-MODULE-SPECIFICATIONS.md` → Laravel

Each row is a phase-able unit with its own tables, endpoints, permission and acceptance.

| # | Module | Tables (new/ported) | Key endpoints | Permission | Acceptance |
|---|---|---|---|---|---|
| 1 | Overview | reads aggregates only (`daily_metrics`, `admin_overview` view) | `GET /api/v1/overview?range=` | `dashboard.view` | totals reconcile against raw rows for the same range; no client-computed KPIs |
| 2 | Approvals | `approvals`, `approval_events` | `GET/POST /approvals`, `/approvals/{id}/decide` | `approval.decide` | idempotent decision, self-approval refused, requester notified after commit |
| 3 | Reports | `report_runs` | `POST /reports/{key}/run`, `GET /reports/runs/{id}` | `report.export` | queued above 5k rows; export audited |
| 4 | CRM | `leads`, `contacts`, `contact_methods`, `tasks`, `site_visits`, `lead_events`, `merge_reviews` | `/leads`, `/contacts`, `/tasks`, `/visits`, `/merge-reviews` | `crm.manage` | duplicate detection + merge keeps history; conversion never loses rows |
| 5 | Sales | `estimates`, `estimate_lines`, `quotations`, `quotation_lines`, `quotation_revisions`, `invoices`, `invoice_lines`, `payments`, `payment_allocations` | `/estimates`, `/quotations`, `/invoices`, `/payments` | `quote.manage`, `finance.manage` | version-bound approval, frozen pricing, currency = order currency, allocation ≤ invoice |
| 6 | Commerce | `products`, `product_variants`, `categories`, `series`, `media`, `media_usages`, `orders`, `order_lines`, `order_events`, `deliveries` | `/products`, `/categories`, `/orders`, `/deliveries` | `catalog.manage`, `order.manage` | publish state separate from draft; order totals server-computed; guest rules enforced at API |
| 7 | Procurement/Production | `suppliers`, `purchase_orders`, `po_lines`, `goods_receipts`, `supplier_invoices`, `production_jobs`, `job_stages`, `job_materials`, `stock_ledger`, `stock_balances`, `transfers`, `reservations` | `/suppliers`, `/purchase-orders`, `/receipts`, `/production/jobs`, `/stock` | `procurement.manage`, `production.manage`, `stock.manage` | no partial receipt; QC signer ≠ stage mover; ledger reconciles to balances |
| 8 | Accounts | `ledger_entries`, `payables`, `expenses`, `reconciliations` | `/accounts/ledger`, `/accounts/payables`, `/expenses` | `finance.manage` | posted rows immutable; corrections are reversals; reports tie to ledger |
| 9 | Projects | `projects`, `project_milestones`, `project_tasks`, `project_vendors`, `project_costs`, `change_requests`, `portal_users` | `/projects`, `/projects/{id}/milestones`, `/portal/*` | `project.manage`, portal scope | portal user sees only own project (policy test), change requests versioned |
| 10 | Inbox | `conversations`, `messages`, `channels`, `assignments`, `templates`, `delivery_log` | `/inbox/conversations`, `/inbox/messages` | `inbox.manage` | history survives reload; retry + failure log; human handoff recorded |
| 11 | Automation | `sequences`, `sequence_steps`, `enrolments`, `consents`, `optouts` | `/automation/sequences` | `automation.manage` | nothing sends without consent + approved template; every send attempted is logged |
| 12 | Marketing | `campaigns`, `sources`, `search_terms`, `attribution` | `/marketing/campaigns`, `/marketing/attribution` | `marketing.manage` | atomic term upsert (Bagisto lesson), attribution ties to leads/orders |
| 13 | Website Studio | `pages`, `page_blocks`, `page_versions`, `page_media_refs`, `redirects`, `seo_meta`, `themes`, `menus` | `/studio/pages`, `/studio/pages/{id}/publish`, `POST /studio/preview-token` | `page.manage`, `page.publish` | draft→preview→publish→revert with revision tokens; public reads only published snapshots |
| 14 | System | `users`, `roles`, `permissions`, `settings`, `audit_log`, `export_jobs`, `idempotency_keys` | `/system/users`, `/system/settings`, `/system/audit` | `*` / `system.admin` | every action audited with actor; 2FA + named exemptions |
| 15 | Client portal | `portal_users`, `portal_sessions` | `/portal/*` | scoped | per-client scoping proven at API level |

**Mapping to the existing 265-row matrix** happens in Phase 1 of the migration: each
matrix row gets exactly one Laravel owner module and one acceptance test. No row is
marked Complete on UI evidence.

---

## 5. The MySQL consequence (read this before approving)

Postgres gave us guarantees that do not exist in MySQL:

| Guarantee today | Where it is enforced | What replaces it |
|---|---|---|
| Anonymous cannot read drafts | `pages` RLS + `published_page()` SECURITY DEFINER | Laravel public controllers that only ever query `published_snapshot`; Pest test per public route |
| Staff capabilities | `require_cap()` inside every definer RPC (27 call sites on `page.manage` alone) | Policies + a `CapabilityMiddleware`, with the same 8 capability names |
| Service-only RPCs | `revoke … from public, anon, authenticated` | route middleware + signed internal calls; no public endpoint |
| Cross-tenant isolation | RLS policy predicates | explicit `where owner_id = ?` scopes, plus a policy test that asserts a foreign id returns 404 |
| Column-level privacy | grants + minimal projections | API Resources that project fields explicitly; never `Model::all()->toArray()` |

**Recommendation.** Take MySQL 8 (spec + hosting reality) but treat the loss as a
first-class work package: **PORT-POLICY** (Phase 1) builds a Pest "policy matrix" suite
that re-asserts, at HTTP level, every assertion `rehearsal/public-surface-matrix.mjs`
and the SQL suites make today: anon/authenticated-nonstaff/editor/sales/finance/owner ×
public/staff/service surface. If that suite is not green, Phase 2 does not start.
*Alternative, if the owner prefers: run Laravel on Postgres and keep RLS.* Cost: Hostinger
must expose Postgres (verify in Phase 0); managed Postgres elsewhere adds a monthly cost
and a network hop. This report assumes MySQL + PORT-POLICY.

Also lost with MySQL: `jsonb` operators/GIN indexes used by `published_page_index()`,
`page_blocks` queries and the project scope filters. Plan: keep documents as `JSON`
columns, query them with generated columns + indexes for the few hot paths
(`published_slug`, `published_at`), never with ad-hoc JSON scans in list endpoints.

---

## 6. Data migration strategy — strangler, one writer per table

Spec §10.1 says one production write authority per business table. Therefore **no
dual-write**. Each domain moves in three steps and only then flips:

```
Freeze (minutes) → copy → verify → flip reads → flip writes → unfreeze
```

| Step | Artefact | Evidence required |
|---|---|---|
| 1. Extract | `php artisan woodex:extract {domain}` → JSON/CSV snapshot from Postgres (read-replica or dump) | row counts per table, checksums of canonical columns |
| 2. Load | `php artisan woodex:load {domain} --dry-run` then real | idempotent; re-runnable; no sequence gaps |
| 3. Reconcile | `php artisan woodex:reconcile {domain}` | count parity, sum parity on money columns, referential check, per-record hash sample |
| 4. Flip | feature flag `domain.authority = laravel` | React adapter points at Laravel; Supabase write paths disabled in the same commit |
| 5. Soak | 72 h | no write failures in `audit_log`, no 5xx, variance report |

Domain order (lowest risk first): Website Studio → CRM → Sales → Commerce catalogue →
Orders → Procurement/Production/Inventory → Accounts → Projects/Portal → Inbox/Automation.
Accounts moves late because a bad money migration is unrecoverable.

---

## 7. API contract

* Base path `/api/v1`; every response is a Resource, never a raw model.
* Errors: `{ "error": { "code", "message", "details"? } }`; HTTP 422 validation, 403
  permission, 409 stale revision, 429 rate limit, 404 unknown-or-forbidden (never leak
  existence across tenants).
* Concurrency: `revision` integer on `pages`, `projects`, `quotations`, `invoices`,
  `purchase_orders`, `production_jobs`. Write with `If-Match: <revision>` (or body
  field); mismatch → `409` with the server revision, mirroring today's `40001` text.
* Idempotency: `Idempotency-Key` header on money and submission endpoints
  (`POST /orders`, `/payments`, `/quotations/{id}/convert`); stored in
  `idempotency_keys` with request hash; replay returns the original result, altered
  replay is refused. This is ORDER-001's contract, ported.
* Pagination: cursor or page+`per_page` (max 100) with **explicit deterministic order**
  on every endpoint; stable ties by id.
* ETag/`Last-Modified` on public content; `Cache-Control` for published snapshots.
* OpenAPI file committed; contract tests fail the build on drift.

---

## 8. Cross-cutting rules

1. **Authorization** on every route via middleware + policy; a route without an explicit
   permission fails the test suite (enumerated route table).
2. **Money**: integer minor units + `currency` column; totals computed server-side;
   historical documents keep the currency they were issued in (Bagisto's RMA lesson).
3. **Audit**: `audit_log(actor, action, subject_type, subject_id, before, after, request_id)`.
   Written in the same transaction as the change; notifications raised **after commit**.
4. **Time**: store UTC, display `Asia/Karachi`; report definitions state timezone.
5. **Files**: one validation contract (mime + size + dimensions) shared by the API and
   the React uploader; usage tracking so a replaced asset updates every reference and no
   orphan is purged while a draft still names it (Bagisto Theme lesson).
6. **Secrets**: server-side only; nothing long-lived in `VITE_*`.
7. **Jobs**: database queue, `failed_jobs` visible in System, manual retry; no external
   call inside a web request.

---

## 9. Website Studio on Laravel (the M6 contract, ported)

| Today (Postgres) | Laravel port |
|---|---|
| `pages` + `page_blocks` (block_id unique per page, props carry `id`) | same tables; `json` props; unique `(page_id, block_id)` |
| `page_versions` journal on every save/publish | `page_versions` written by `PublishService` |
| `page_publish` copies the draft into `published_snapshot` | `PublishService::publish()` in one transaction |
| `published_page(slug)` SECURITY DEFINER | `PublicPageController@show` querying only the snapshot |
| `page_preview(slug)` `page.manage` only | `PreviewController` + signed short-lived token |
| `published_page_index()` for the sitemap | `SitemapBuilder` job (queued, lock-protected) |
| revision token `40001` | `409` + `If-Match` |
| 31 + 26 + 39 + 19 + 30 checks | Pest equivalents + the same browser suites pointed at the Laravel API |

The 13-of-57 preflight gap (public renderer recognises 13 block types, catalogue ships 57)
must be closed in BLD-004 before Studio is declared live; otherwise "published output
matches editor" is false for 44 block types.

---

## 10. Bagisto 2.5 — what to adopt, what to skip

Full package list reviewed (44 packages). Disposition for **this** business:

**Adopt the behaviour** (rebuild in Laravel, do not port PHP):
CatalogRule, CartRule (we have no promotions engine), Tax (configurable rates,
inclusive/exclusive), Inventory (multi-warehouse balances, transfers, reservations),
Sales (invoice lifecycle, allocations, overdue reminders), RMA (returns with
order-currency pricing), Checkout (guest rules at the API), Theme (draft-safe media
purging → MEDIA-001), Sitemap (lock/queue safety → SEO-001 concurrency),
DataTransfer (CSV product import), DataGrid (stable ordering + export permissions),
Product (one upload validation contract), Marketing (atomic search-term upsert),
Notification (raise after commit), User (2FA + named exemptions), Attribute (locales,
→ Urdu/i18n), BookingProduct (slots, → BOOK-001), MagicAI (AI grounding → AI-001).

**Reference only:** Admin (nav/ACL patterns), Core (settings), Category (stable
pagination), Customer (read models), CMS (publish state), ImageCache (derivatives).

**Skip:** Stripe, PayPal, Razorpay, PayU, PhonePe, PayGlocal, Payment (no gateway until
merchant credentials exist; manual recording first), EUWithdrawal, Omnibus (EU law),
GDPR (keep only consent/export ideas), FPC (PHP page cache, N/A), DebugBar, Installer,
SocialLogin, SocialShare (revisit only if asked).

**Five bug classes from their recent commits we will pre-empt in Pest:**
Postgres/MySQL aborting a transaction on a caught duplicate (use one upsert);
lock-conflict detection portability; pagination without explicit ordering;
client-side enforcement of server rules; purging media still referenced by a draft.

---

## 11. Hostinger constraints → design rules

Unverified until Phase 0; the plan assumes the pessimistic case.

| Constraint (assumed) | Design rule |
|---|---|
| No persistent Node/WebSocket | React ships as static files; no SSR; no socket — polling or SSE if needed |
| No Redis | `database` queue + `database` cache; short TTLs; no cache-driven correctness |
| Cron ≥1 min, may be limited | one `schedule:run` entry; jobs chunked under 60 s; long work split into batches |
| CPU/memory per request | max 100 rows per API page, no N+1 (Laravel `preventLazyLoading` in non-prod), image work queued |
| DB size/connections | archival policy for `audit_log`, `page_versions`, `messages`; connection pooling off; keep transactions short |
| File count/inodes | media derivatives capped; cleanup job for orphans (usage-tracked) |
| SSH/Composer unverified | **Phase 0 gate**: if no SSH, deployment becomes upload + `artisan` via a protected web endpoint (worse; recorded as a risk) |
| PHP extensions | need `pdo_mysql, mbstring, openssl, fileinfo, gd/imagick, intl, zip, bcmath` — verify in Phase 0 |

Backups: nightly `mysqldump` to a dated archive + weekly restore drill into scratch DB;
`.env` and storage backed up separately; retention 30 daily + 12 monthly; restore
rehearsal recorded in `docs/09`.

---

## 12. Testing strategy

| Layer | Tool | Gate |
|---|---|---|
| Unit | Pest | money math, currency, date, policy helpers |
| Feature (HTTP) | Pest on **MySQL 8 service container** (never SQLite for behaviour) | every endpoint: success, 403, 422, 409, 404-scoping |
| Policy matrix | Pest dataset × {anon, nonstaff, editor, sales, finance, owner, portal} × {read, write, publish, export} | replaces RLS proofs (PORT-POLICY) |
| Contract | JSON schema from OpenAPI | frontend/backend drift fails CI |
| Concurrency | two-connection tests | revision conflicts, idempotent replay, double allocation |
| Browser | existing 123 + 6 suites pointed at Laravel mode | user journeys unchanged |
| Data | `woodex:reconcile` on synthetic copies | parity before flip |
| Performance | k6/ab smoke on staging, 60 s | p95 < 800 ms on list endpoints, DB < 50% max connections |

CI matrix: PHP 8.3 × MySQL 8 × Node 20; jobs = pest, contract, build (bun), e2e.

---

## 13. Phased plan

Effort is agent-days of focused work; calendar depends on review cycles. Every phase
ends with a docs pass and a full regression run.

### Phase 0 — Bootstrap & hosting verification (3–5 d) · GATE 0
Verify the host facts this plan assumes (PHP version/extensions, MySQL size & connections,
cron cadence, SSH/Composer, storage limits), create the Laravel skeleton in a **separate
repository** (`woodex-api`), CI matrix, `.env.example`, health endpoint, audit + settings
foundation, and freeze the current repo's `main`.
**Exit:** `GET /api/v1/health` returns build + DB + queue status on staging; host facts
recorded; **no business table yet**.

### Phase 1 — Auth, roles, audit, PORT-POLICY (6–9 d) · GATE 1
Sanctum SPA auth, `roles`/`permissions` mirroring the 5 roles + 8 capabilities, 2FA,
`audit_log`, idempotency store, error envelope, OpenAPI scaffold, and the **policy matrix
suite** that replaces the RLS proofs.
**Exit:** every current capability refusal (`42501` cases in the 24 suites) has an HTTP
equivalent that fails closed; self-approval and QC separation rules tested.

### Phase 2 — System & Overview (5–7 d)
Users/seats, settings, exports, approvals queue, overview aggregates with reconciliation
tests; the dashboard's "no fake metrics" rule enforced by comparing totals to raw rows.

### Phase 3 — Website Studio (8–12 d)
Pages/blocks/versions/publish/preview/sitemap/media usage + redirects/SEO. Port the
26 + 31 + 39 + 19 + 30 checks as Pest; point the existing browser suites at Laravel mode.
**Exit:** draft → authed preview → publish → public → revert round trip green on staging
with two accounts; published output matches the editor for every enabled block.

### Phase 4 — CRM & Sales (12–16 d)
Leads/contacts/tasks/visits with dedup + merge; estimates → quotations (version-bound
approval, frozen pricing) → invoices → payments/allocations with currency discipline.

### Phase 5 — Commerce catalogue & orders (12–16 d)
Products/variants/categories/series/media (single validation contract), orders with
server-computed totals, guest rules at API, delivery/installation milestones, CSV import.

### Phase 6 — Procurement, Production, Inventory (14–18 d)
Suppliers, POs, receipts, supplier invoices, production jobs/stages/materials, stock
ledger/balances/transfers/reservations, QC separation, handover evidence.

### Phase 7 — Accounts (10–14 d)
Ledger, payables, expenses, reversals, aging, reconciliation with payments; report suite.

### Phase 8 — Projects & Client portal (10–14 d)
Projects, milestones, vendors, costs, change requests, portal scoping; handover pack.

### Phase 9 — Inbox, Automation, Marketing (12–16 d, gated on D-06)
Conversations, channels, templates, sequences with consent/opt-out, delivery log and
retry, campaigns/attribution; nothing auto-sends until approved and tested.

### Phase 10 — Cutover (5–8 d) · GATE 4
Production DNS/SSL, final domain-by-domain reconciliation, soak, rollback plan, on-call,
owner sign-off. Postgres read-only for 30 days.

**Total: ≈ 100–135 agent-days.** Phases 0–2 (≈ 15–20 d) are pure foundation and produce
no user-visible feature — that is the honest cost of "one write authority".

---

## 14. Ticket backlog (first tranche)

`LAR-001` repo bootstrap · `002` CI matrix · `003` health endpoint · `004` settings table
· `005` audit log · `006` request-id middleware · `007` error envelope · `008` Sanctum SPA
· `009` roles + permissions seed · `010` capability middleware · `011` 2FA + exemptions
· `012` idempotency store · `013` OpenAPI generation · `014` **policy matrix suite** ·
`015` users/seats CRUD · `016` approvals queue · `017` overview aggregates + reconciliation
· `018` export jobs · `019` pages/blocks schema · `020` versions journal · `021` publish
service + snapshot · `022` public page controller · `023` preview tokens · `024` sitemap
job with lock · `025` media + usage tracking · `026` redirects/SEO · `027` leads ·
`028` contacts + merge · `029` tasks/visits · `030` estimates · `031` quotations +
approval · `032` invoices + allocations · `033` payments · `034` products/variants ·
`035` categories/series ·`036` orders + totals · `037` delivery/installation ·
`038` suppliers/PO/receipts · `039` production jobs/QC · `040` stock ledger ·
`041` ledger/payables · `042` projects/portal · `043` inbox · `044` automation sequences ·
`045` campaigns/attribution · `046` CSV import · `047` reconcile tooling · `048` cutover runbook.

Each ticket ships with: migration, model+policy, endpoint, Pest tests, OpenAPI update,
and (where user-facing) a browser check.

---

## 15. Risks & stop conditions

| Risk | Impact | Mitigation |
|---|---|---|
| MySQL loses RLS | silent data exposure | PORT-POLICY gate; no Phase 2 before green |
| Two writers during migration | divergent records | one-writer rule; freeze windows; reconcile before flip |
| Shared-host limits (no SSH/cron) | deployment pain | Phase 0 verification; documented fallback |
| Duplicate work with the current stack | wasted effort, drift | the Postgres tier stays the authority until each domain flips; M6 work wraps up first |
| Feature matrix inflation | false completeness | every Laravel module carries its own acceptance evidence; no row moves without a test |
| Money migration error | unrecoverable | Accounts moves last; sums reconciled; reversals only |
| React/API contract drift | broken UI | OpenAPI contract tests in CI |
| Owner decisions pending (D-01…D-08) | blocks finance/booking/AI/staging | decisions needed in Phase 0 for D-01/D-05/D-08 |

**Stop conditions** (end the phase rather than work around): no SSH and no acceptable
deploy path; MySQL size/connection limits below the 148-product + document workload;
restore drill fails; policy matrix cannot be made green; owner withdraws the MySQL choice.

---

## 16. What the owner must supply before Phase 0

1. **Hosting facts** — exact Hostinger plan, PHP version, MySQL size/connection limit, cron
   cadence, SSH/Composer availability, disk/inode limits, whether a staging subdomain is
   allowed.
2. **Topology** — API on a subdomain (`api.woodex.pk`) or a same-site path (`/api`)? Cookie
   strategy depends on it.
3. **D-01 confirmed for Laravel/MySQL** (this report assumes it), plus **D-05** (finance
   definitions: booked vs recognised, timezone) and **D-08** (staging project + backup
   location).
4. **Money & tax policy** — PKR confirmed, tax types/rates, inclusive vs exclusive,
   invoice numbering series.
5. **Payment stance** — manual recording only, or a gateway later (Bagisto's gateway
   packages stay skipped until merchant credentials exist).
6. **Gateways/credentials** — WhatsApp/Telegram provider, email sender, storage/CDN —
   or explicit "not yet".
7. **Repository decision** — separate `woodex-api` repo (recommended: independent
   lifecycle, CI, deploy) vs `backend/` monorepo folder.

---

## 17. Recommendation

Build it, in this order: **Phase 0 (verify the host) → Phase 1 (auth + policy matrix) →
Phase 3 (Website Studio)**. Studio first among the business domains is deliberate — it is
the only domain whose contract is already proven end-to-end today (revision tokens,
publish snapshots, preview permissions, sitemap index), so it validates the Laravel port
of the hardest parts of the system while the Blob/Puck frontend stays untouched.

Do **not** start with Catalogue or Orders: they look easier, but they carry money and
stock, and a policy gap there is a real loss. Do **not** attempt a big-bang migration:
the reconcile tooling and the policy suite exist like scaffolding — build them once, in
Phase 1, and every later domain is cheaper.

---

## Appendix A — table ownership at a glance (current → Laravel domain)

`categories, products, series, product_*` → Commerce · `orders, order_lines, order_events`
→ Commerce · `quotes, quote_lines` → Sales · `invoices, invoice_lines, payments` →
Sales/Accounts · `projects, project_*` → Projects · `pages, page_blocks, page_versions,
page_media_refs` → Website Studio · `production_*, project_jobs` → Production ·
`purchase_orders, goods_receipts, suppliers, supplier_invoices` → Procurement ·
`stock_ledger, stock_balances, transfers, reservations` → Inventory · `leads, contacts,
tasks, site_visits, lead_events` → CRM · `conversations, messages, delivery_log` → Inbox
· `campaigns, sources, search_terms` → Marketing · `user_roles, staff_seats, settings,
audit_*` → System · `warranty_*, claim_*` → Support (inside Commerce/Support).

## Appendix B — what happens to the current 38 migrations

They stay in this repository as the **specification** of behaviour: every constraint,
grant, trigger and refusal reason becomes a Pest test in the Laravel port. The Postgres
database stays live and authoritative for any domain not yet flipped, and becomes
read-only 30 days after the last domain cutover. They are not "thrown away" — they are
the acceptance criteria.
