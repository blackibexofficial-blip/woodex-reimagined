# WOODEX Technical Audit — MASTER SYSTEM PROMPT Phase 0 (v2, post-merge)

| | |
|---|---|
| Date | 2026-11-08 (supersedes the v1 608f966 revision; v1 preserved in git history) |
| Branch / commit | `arena/9e1e58e5-woodex-reimagined` @ `84aad29` — **identical tree to `origin/main`** (PR #28 merged 2026-11-08T20:05:55Z, `84aad29`) |
| Audited against | `WOODEX BUSINESS OS — MASTER SYSTEM PROMPT v1.0` (attachment; the prompt file is not committed to the repo — its repo-mapped scope is this document) |
| Live site | https://woodex-reimagined.vercel.app/ (Vercel SPA; **demo mode by default** — hosted Supabase never flipped) |
| Status | **Phase 0 only.** No application code changed in this audit. **No implementation phase approved by this document.** |

> Verification legend — claims are tagged:
> `[V]` verified on this exact tree in this sandbox (command output recorded §9) · `[CI]` verified by GitHub Actions on the merge commit · `[L]` live/hosted — **UNVERIFIED (no egress)** · `[D]` demo-mode behaviour (localStorage DB) — real in demo, not proof of hosted · `[S]` source-inspected only, not executed.
>
> **Deliverables requested in Phase 0 and where they live:**
> 1. Technical audit → §1, §2, §3 · 2. Feature inventory → §4 · 3. Database relationship map → §5 · 4. Security findings → §6 · 5. Broken functionality register → §7 · 6. Missing functionality register → §8 · 7. Prioritized implementation roadmap → §9 · Baseline check results → §0.

---

## 0. Baseline checks — actual results (this sandbox, this tree, 2026-11-08)

| Check | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit -p tsconfig.app.json` | **rc=0** `[V]` |
| Lint | `eslint .` | **0 errors** · 34 warnings (pre-existing `react-refresh/only-export-components`) `[V]` |
| Production build | `npm run build` (bun 1.4.4 installed for the sitemap step) | **✓ 18.15s** · `dist/` 13 MB · chunk-size warning (>500 kB) `[V]` |
| E2E (Playwright) | `npm run e2e` (`e2e/run.sh`) | **108/108 checks pass** `[V]` |
| Accessibility (axe) | `node e2e/a11y.mjs --fail` | **0 violations across 54 admin routes** `[V]` |
| Offline DDL/RLS rehearsal | `npm run test:rehearsal` (pglite, migrations 0001→0014 + seed) | **93 passed, 0 failed** `[V]` |
| AI draft engine eval | `npm run test:ai-eval` | **19 passed, 0 failed** `[V]` |
| Payment signature eval | `npm run test:payments` | **15 passed, 0 failed** `[V]` |
| GitHub Actions on main | `CI` run for `84aad29` | **completed / success** `[CI]` |
| Hosted Supabase / Vercel dashboard | — | **UNVERIFIED** `[L]` — no egress; no migration ever applied hosted |
| npm audit (prod deps) | `npm audit --omit=dev` | **26 total — 0 critical · 19 high · 7 moderate** `[V]` (detail §6.S-03) |

**Baseline protection record (§2.3 of the prompt):** git branch = `arena/9e1e58e5-woodex-reimagined`, HEAD `84aad29` == `origin/main`, clean tree before this docs change. Production untouched: no deploy triggered by this audit, **no migration applied anywhere**, no env var changed. Rollback = drop this file.

---

## 1. Stack as-found (not as-expected)

| Layer | Reality | Evidence |
|---|---|---|
| Frontend | React 18 + **Vite 5** SPA + TypeScript (**not** Next.js). shadcn/ui (~50 Radix primitives), Tailwind, react-router v6, react-query v5, recharts, react-hook-form, react-helmet-async | `package.json` (54 deps / 23 devDeps) |
| Routing | **24 storefront routes** (lazy chunks) + catch-all 404 · **59 admin routes** (57 + `/admin/login` + `*` → Navigate) | `src/App.tsx`, `src/admin/AdminApp.tsx` |
| Visual builder | **Puck** (`@puckeditor/core` 0.24) — three-panel editor (Elements/Sections/Library/Inspector/Canvas), structured JSON documents, section library, custom richtext sanitizer | `src/pages-builder/**` (~2.5k LOC) |
| Backend | **Supabase** (Postgres + Edge Functions + Storage + Auth). **14 migrations** (`20261107000001`…`20261108000014`) · **55 public tables** · **125 RLS policies** · **29 functions** (14 SECURITY DEFINER, capability-checked via `my_role()/has_cap()`) · dynamic RLS enable across waves · private `projects` storage bucket (50 MB) | `supabase/migrations/*` (discovered programmatically by `scripts/staging-smoke.mjs`) |
| Adapter trio | `getAdminApi()` selects **demo** (6,024-line localStorage DB, default) / **Bagisto REST** (1,175-line; CRM = 501 stubs) / **hosted Supabase** (4,161-line hardened RPC client) | `src/api/{types.ts(2,153),demo/db.ts,bagisto/admin.ts,supabase.ts}` |
| CMS state | Builder + draft preview (`/lab/:slug`) + published pages **render on public routes through the same schema** — but **the builder does not own the primary storefront pages** (home/shop/product routes are code-owned React pages; published CMS pages are lab-scoped). Architectural gap vs prompt Part 6 — see §8-M01 | `src/pages-builder/*`, `src/App.tsx` |
| Hosting | Vercel SPA, `vercel.json` rewrites `/(.*)` → `index.html`; build generates `sitemap.xml` (URLs target `woodex.pk`); **no security headers configured** (§6.S-02) | `vercel.json`, `index.html` |
| CI/QA | typecheck · eslint · build · e2e 108/108 · axe 0/54 · pglite rehearsal 93/0 · AI eval 19/19 · payment eval 15/15 | `.github/workflows/main.yml`, `e2e/`, `rehearsal/` |
| AI | **Offline draft engine built & verified** (`src/lib/ai/*`, retrieval-top-K, prices only from catalogue records, Urdu RTL) · evals 19/19 · `supabase/functions/ai-agent` **undeployed** (501-gate, staff-Bearer, grounding-required) · hosted = UNVERIFIED | `src/lib/ai/{knowledge.ts,agent.ts}`, `supabase/functions/ai-agent/index.ts` |
| WhatsApp | `wa.me` deep links everywhere (storefront, inbox handoff) · `backend/supabase/functions/whatsapp-campaign-sender` exists **in-tree, unwired, never executed** | `backend/`, `src/lib/chat.ts` |
| Payments | None active. **HMAC-SHA256 webhook verifier built & tested (15/15)** + read-only "Not configured" Settings card; checkout = COD/Bank Transfer only; gateway = CREDENTIAL-BLOCKED | `src/lib/payments/signature.ts`, `CREDENTIAL-BLOCKED.md` |
| Observability | No Sentry/telemetry; demo `track_events` table + `analytics.ts` (GA4 optional, config-only, never exercised) | — |

## 2. Architecture as-found

```
Storefront (24 public routes + 404, lazy chunks, eager home for LCP)
/  /shop(+:id)  /series(+:id)  /projects(+:id)  /services(+:id)  /blog(+:id)
/about  /contact  /checkout  /quotation  /b2b  /warranty  /materials  /showrooms
/virtual-showroom  /custom-design  /room-packages  /lab/:id   (catch-all → 404)
        │
        └── shared AdminApi ← demo (default) | bagisto (catalog-read) | supabase (RPC)
                             │
Admin (59 routes, sidebar = 36 items / 5 collapsible groups / one "Taxonomy" entry — source: src/admin/Layout.tsx NAV_GROUPS)
Overview (2):  Dashboard · Analytics
Commerce (17): Products · Taxonomy · Homepage · Showrooms · Projects · Bulk Editor · Inventory · Orders · Drafts · Quotes · Invoices · Returns · Exchanges · Claims · Customers · Clients · Merge review
Purchasing (3): Suppliers · Purchase Orders · Transfers
Engage (12):   Leads · Live Chat · Tasks · Campaigns · Blog · Services · Content · Warranty · Custom Design · Virtual Showroom · Pages · Media
System (2):    Import data · Settings
```

Data rules verified `[V]`: adapters never leak demo paths into supabase mode without capability checks; hosted writes go through RPCs with `my_role()/has_cap()`; `updateLead` rejects PR-D fields the 0001 schema can't hold; Bagisto CRM = honest 501s; money-critical paths (`order_submit`, `quote_convert`, `convert_draft_order`, actuals) are DB-side atomic functions, rehearsed offline (93/0) and **never executed hosted** `[L]`.

**Cross-module identity journey:** enquiry → lead → (client record) → quotation → order → invoice/payment → job cost actuals. The links exist (`client_links`, quote→invoice RPCs, `draft_orders`/`orders`), but the chain is **not a single traceable workflow engine** — stages validated, chaining partial (see §8-M02/M04).

## 3. Audit category scorecard (§2.2 of the prompt)

| Category | Verdict | Detail |
|---|---|---|
| Architecture | **GREEN w/ debt** | Clean adapter boundary; admin isolated; debt: 6,024-line demo DB `db.ts`, generated MCP bundle (9k+ LOC, regenerated on build), dual lockfiles (`bun.lock`+`package-lock.json`) |
| Frontend | **GREEN** | Consistent shadcn/Tailwind; route-level splitting; chunk-size warning; axe 0/54 |
| Backend | **AMBER** | EFs minimal & intentional; only lead-capture/order-submit/order-tracking/admin-bootstrap/ai-agent(undeployed); no hosted run ever `[L]` |
| Database | **GREEN offline / UNVERIFIED hosted** | Best-documented layer; 14 migrations; RLS matrix rehearsed 93/0; hosted applied: **none** |
| Security | **AMBER** | No client secrets; demo gate ≠ auth (by design); missing security headers; 26 prod advisories; Turnstile fail-open until set; hosted RLS unproven |
| CMS | **AMBER** | Real builder, draft preview, sanitizer; publish-to-live incomplete; revision UI absent; builder ↛ storefront ownership |
| E-commerce | **AMBER** | Catalog/cart/checkout/orders demo-real & e2e-tested; **zero payment capture possible**; A4 furniture quotation print done & tested (print pending owner) |
| CRM | **GREEN (demo)** | Leads PR-A/C/D parity, kanban DnD, lenses, import desk, merge review, chat inbox (offline-capable), tasks; hosted unverified |
| AI | **AMBER** | Offline engine 19/19 `[V]`; hosted EF undeployed `[L]`; no product-RAG embeddings (static corpus ~18 entries); no scoring/handover automation yet |
| SEO | **AMBER** | Titles/canonical/JSON-LD/robots ✓; sitemap = `woodex.pk` URLs; LocalBusiness/FAQ schema partial; GA4 config-only |
| Performance | **AMBER** | Lazy chunks; home eager; **no Lighthouse/CWV evidence**; 13 MB dist; no responsive image pipeline |
| Deployment | **AMBER** | Vercel SPA + CI green on main `[CI]`; **zero hosted-mode verification**; no staging wired; rollback = Vercel redeploy (safe: nothing hosted depends on this code yet `[L]`) |

---

## 4. Existing feature inventory (what is real, with proof)

Legend: ✅ demo-real & exercised by tests · ◐ exists but partially wired / unverified · ✗ absent. Hosted status of **everything** = UNVERIFIED `[L]`.

### 4.1 Storefront (public)

| Feature | Route(s) | Status | Proof |
|---|---|---|---|
| Home (dynamic homepage sections) | `/` | ✅ `[V]` e2e | Homepage builder drives sections; e2e "home schema", JSON-LD, schema validator checks |
| Shop catalogue + filters | `/shop` | ✅ `[V]` e2e | e2e product listing + JSON-LD offer PKR checks |
| Product detail (JSON-LD, breadcrumb, aggregateRating) | `/shop/:id` | ✅ `[V]` e2e | e2e: canonical absolute, Product JSON-LD, breadcrumb JSON-LD |
| Search | `/shop` (client-side) | ✅ `[D]` | client-side filter; no server search |
| Category/series pages | `/series(+:id)` | ✅ `[V]` e2e | e2e render + redirect coverage |
| Cart + checkout (COD / bank transfer) | `/checkout` | ✅ `[V]` e2e | e2e checkout path incl. no-console-errors; **payment never captured** |
| Quotation request form | `/quotation` | ✅ `[V]` e2e | lazy-route render + form |
| Projects portfolio | `/projects(+:id)` | ✅ `[V]` e2e | e2e render |
| Services CMS | `/services(+:id)` | ✅ `[V]` e2e | e2e render |
| Blog | `/blog(+:id)` | ✅ `[V]` e2e | Article JSON-LD + breadcrumbs e2e-checked |
| Custom Design / Room Packages / Warranty / Materials / Showrooms / Virtual Showroom / B2B / About / Contact | 9 routes | ✅ `[V]` e2e | all render; no console errors |
| Customer accounts | — | ✗ | no storefront auth anywhere (see §8-M03) |
| Payment capture | — | ✗ | `PaymentMethod` union has easypaisa/jazzcash/card at type level; **UI exposes only COD/bank** (untestable without gateway) |
| Newsletter / wishlist / comparison | — | ✗ | — |

### 4.2 Admin (authenticated app) — 59 routes

| Module group | Pages | Status | Proof / notes |
|---|---|---|---|
| **Command center** | Dashboard · Analytics | ✅ `[V]` | demo aggregates; KPI cards, pipeline value, revenue-30d chart (e2e) |
| **Notifications** | NotificationBell (topbar, all routes) | ✅ `[V]` e2e | unread chats · stale leads >7d · low-stock · overdue tasks; popover e2e-verified `[V]` |
| **Taxonomy** | `/admin/taxonomy` — 9 kinds, chips rail + left rail, `?section=` deep links; legacy routes 308 → it | ✅ `[V]` e2e+a11y | 9 sections byte-moved from former standalone pages |
| **Products & pricing** | ProductEdit · Products · Taxonomy(Brands/Series/Categories/Collections/Materials/Options/Price Lists/Bundles/Channels) · Bulk Editor | ✅ `[V]` e2e render, ✅ `[D]` CRUD | option-sets, price lists, bundles real in demo |
| **Collections/series/brands/materials/options** | see Taxonomy | ✅ | — |
| **Orders & fulfilment** | Orders · Order detail · New order · Order document | ✅ `[V]` e2e | status machine validated; events ledger; convert-from-quote RPCs (hosted `[L]`) |
| **Drafts** | Draft orders → convert (reprice preview) | ✅ `[D]` | RPC 0008/0010 rehearsed 93/0 `[V]` |
| **Invoices & documents** | Invoices · Invoice detail · Invoice document (A4) · Invoice new wizard | ✅ `[V]` e2e | A4 print sheets render `[V]`; **invoice email never sends** |
| **Quotations** | Quotes · Quote detail (A4 furniture sheet: 75/25 advance, EN+اردو policy wording, acceptance block, zainab/store/custom footer) · Template designer (live preview) · Version history | ✅ `[V]` e2e | e2e WI-10204 policy-wording asserts ×2; designer panel asserts ×3; **physical print sign-off pending owner** |
| **Returns / Exchanges / Claims** | list + detail/RMA documents | ✅ `[V]` e2e render | demo document print `[V]` |
| **CRM — leads** | Leads (kanban + list, Mine/Unassigned/Stale lenses, assignee roster, CSV export) · Clients by category · Client Merge review | ✅ `[V]` e2e render | CRUD demo-real; hosted adapters hardened `[L]` |
| **Live chat** | Chat inbox (poll round-trip, offline capture→lead) + storefront bubble | ✅ `[V]` e2e render | Capture path e2e-tested storefront→lead→inbox→reply→bubble |
| **Import desk** | `/admin/import` — SheetJS 4.18 parse, dedupe, commit to demo store | ✅ `[V]` render; ✅ `[D]` parse | hosted import = reject stubs (honest) |
| **Tasks** | Tasks CRUD + overdue lens | ✅ `[V]` e2e | bell consumes overdue count `[V]` |
| **Projects & actuals (ERP-lite)** | Projects · Actuals vs BOQ (cost codes 0013) | ✅ `[D]` | actuals RLS roles rehearsed 93/0 `[V]` |
| **Inventory & purchasing** | Inventory · Stock movements · Transfers · Suppliers · Purchase Orders (+ post to actuals) · Low-stock | ✅ `[V]` render, ✅ `[D]` CRUD | bell consumes low-stock `[V]` |
| **Website & content** | Pages (Puck builder: elements/sections/templates/layers/preview) · Homepage builder · Blog · Services · Projects · Media library · Custom Design · Virtual Showroom · Warranty editor · Content (global blocks) | ✅ render `[V]`, ✅ `[D]` CRUD | **builder does not own public routes** (§8-M01) |
| **System** | Settings (store profile · team roster · AI sales agent card · Payment gateway card · integration status honest read-only) · Import · Settings blob incl. `aiOfflineDraftsEnabled` · Team roster · Demo reset | ✅ `[V]` render, ✅ `[D]` persistence | hosted = adapter stubs where gated |

### 4.3 Platform services

| Service | State | Proof |
|---|---|---|
| Demo auth gate (`/admin/login`) | Demo-only; **not a security boundary** | documented in env.ts, login UI, Settings |
| Supabase Auth path | Implemented (`signInWithPassword`, profile/role claims, RPC capability checks) — **never run against hosted** `[L]` | source `[S]` |
| Edge functions | lead-capture (Turnstile gate), order-submit, order-tracking, admin-bootstrap, **ai-agent (undeployed 501)**, mcp (generated) | source `[S]`; only offline-tested |
| Storage | `projects` bucket private 50 MB, crm.manage only (rehearsal 93/0 ✓) `[V]`; media/public pages bucket `[L]` | migration 0014 |
| Rate limiting | lead + order fixed-window limiter migrations 0005/0006 `[V]` rehearsed | rehearsal output |
| Analytics | GA4 config-only (`VITE_GA4_ID`), `analytics.ts` consent-aware; **never exercised** `[S]` | source |
| Sitemap/robots | generated sitemap (woodex.pk), static robots.txt | build output |
| Error monitoring | none (no Sentry) | — |

---

## 5. Database relationship map

**Scale:** 55 public tables · 125 RLS policies · 29 functions · 14 migrations (additive, immutable) · seed = catalogue (~148 products, 19 categories, 5 series). Objects discovered programmatically from the DDL (`scripts/staging-smoke.mjs`), cross-checked with `rehearsal/rehearsal.mjs` (93 assertions against pglite).

```
Identity            Catalog/commerce                 CRM/sales                Projects/ERP-lite
─────────           ──────────────                   ─────────                ─────────────────
auth.users          products ──< categories           leads ──────┐           projects
user_profiles ───< user_roles     products >── series             │            │  └── project_cost_codes ── project_actuals
   │  my_role()/has_cap()          products >── brands            │            │
   ▼                               products ── option_sets        │            ▼
RLS on everything                  products ── collections         │      (bucket: projects/, private)
   │                               orders ──< order_items         │
   │                               orders ──< order_events        │            Finance
   │                               quotes ──< quote_items         │            ───────
   │                               quotes ──< quote_versions      │            invoices ──< payments
   │                               quote_templates                │            draft_orders ──< client_links? n/a
   ▼                               returns / exchanges / claims ──┘            payments → invoices
capabilities everywhere            clients ──< client_links ───────▶ leads/quotes/orders  (cross-entity journey)
```

Key foreign-key fan-in (references per parent table, from migrations): `orders` ×6 · `clients` ×5 · `quotes` ×3 · `products` ×3 · `pages` ×3 · `leads` ×3 · `projects` ×2 · rest ×1 (series, categories, tasks, suppliers, returns, project_cost_codes, invoices, conversations).

**Integrity rules that matter:**
- Money/financial mutations are DB-atomic RPCs (`order_submit`, `quote_convert`, `convert_draft_order`, `record_order_event`, actuals insert) — capability-checked, rehearsed offline; **hosted unverified**.
- RLS is dynamic-enabled across waves; anon has no write path except `lead-capture` (Turnstile-gated EF) → `lead_rate_limit_hit` (0006) → `leads` insert.
- `bootstrap_owner` revoked from anon/authenticated; `admin_bootstrap` EF is the only promotion path (owner-gated).
- IDs: orders/quotes/exchanges/claims/actuals use bigint identity from 1001 (rehearsal-verified seeds align).
- Soft integrity: `client_links` unifies leads/quotes/orders/projects onto clients (the journey spine).
- **No multi-tenant isolation** — single business; roles ≠ tenants. Customer PII tables (`leads`, `clients`, `orders`, `conversations`) carry RLS enforced policies for staff only.
- Seed defects to note: catalogue stock is a placeholder (100/0) — stocktake required before any charge (rehearsal/runbook call this out).

**Storage:** `projects` bucket (private, 50 MB, `crm.manage`-only) — verified by rehearsal policies; media/public page bucket policy state **unverified hosted**.

---

## 6. Security findings

| ID | Sev | Finding | Evidence | Recommended fix / status |
|---|---|---|---|---|
| S-01 | **P0 (hosted)** | Hosted RLS behaviour never observed — no hosted migration has been applied; pglite proves DDL+matrix locally only | `rehearsal/rehearsal.mjs` output; CREDENTIAL-BLOCKED §9 | Staging flip per STAGING-FLIP-RUNBOOK.md §1–4 before any live traffic; sign-in deny-matrix checks |
| S-02 | P2 | **No HTTP security headers** — `vercel.json` sets only SPA rewrite; no CSP, HSTS, X-Frame-Options/frame-ancestors, Referrer-Policy, Permissions-Policy | `vercel.json` | Add `headers` block (frame-ancestors 'self', strict CSP allowing self+fonts.gstatic/fonts.googleapis + Turnstile if used, nosniff, referrer strict-origin-when-cross-origin) — preview first |
| S-03 | P2 | **26 prod dependency advisories (0 critical, 19 high, 7 moderate)** — incl. `xlsx` prototype pollution (admin import desk, admin-only, owner files), `lodash` template code-injection path, `rollup` path traversal (build-time), `vite` middleware file-serve; CI uses bun.lock, sandbox used package-lock.json — dual-lockfile drift risk | `npm audit --omit=dev` (§0) | Stage a dependency refresh PR with bun (CI parity); pin vite/rollup/xlsx; add `npm audit` gate (info-only) to CI; **not done in Phase 0 by instruction** |
| S-04 | P3 | Demo credentials documented publicly in `.env.example` + demo gate hint opt-in (`VITE_ADMIN_DEMO_HINT`, default 0) | env.example; auth.tsx | Keep hint unset; treat demo gate as demo |
| S-05 | P2 (hosted) | Turnstile anti-bot **fail-open** when `TURNSTILE_SECRET` unset; fail-closed on Cloudflare transport errors (documented) | lead-capture, ANTI-ABUSE-DECISION.md | Set both keys before hosted flip; verify 403/429 in staging |
| S-06 | P1 (cutover) | Demo gate is client-side (`woodex.admin.auth` in localStorage) — anyone can set it; NOT a boundary. Supabase Auth path exists but has never authenticated anyone `[L]` | auth.tsx | Cutover requires Supabase Auth + RLS sign-in test in staging (runbook §4) |
| S-07 | P2 | Hosted chat tables would be **unprotected if created naively** — no migration ships by design; owner-gated | chat mode code; MASTER-TODO Step 5/6 | If owner approves chat migration, it MUST carry staff-only policies + rate limit (mirror 0006) |
| S-08 | P3 | `supabase/functions/mcp/index.ts` is machine-generated (9k+ LOC, diff noise every build) — reviewed by nobody by construction | build diff; `git checkout` convention | Take ownership (remove banner) or git-exclude "AUTO-GENERATED" files; document in AGENTS.md |
| S-09 | **PASS** | No service-role key in the client bundle; only anon/publishable keys used client-side; admin tokens server-side only in prod design | grep bundle; env.ts | keep |
| S-10 | P2 | Richtext/builder sanitizer is a **custom tag-escaper**, not DOMPurify; TipTap output surface on public routes unverified against XSS vectors | `src/pages-builder/richtext.tsx` (custom `sanitizeRichHtml`) | Add DOMPurify allowlist + regression tests before public publish of CMS pages; until then CMS pages stay `/lab`-scoped |
| S-11 | P3 | No CSP/Turnstile on `/quotation` & `/contact` public forms (spam/bots) until keys provisioned | — | After Turnstile keys exist, site key is public by design — low risk |
| S-12 | P3 | PII in repo: none found — demo seeds synthetic (phones 03xx-0000xxx); business public phones (info@woodex.pk, +92 322 4000768) intentionally public | seed inspection | keep rule; never add real customer PII |
| S-13 | **PASS** | Secrets in docs: none; `.env` is git-ignored; only `.env.example` tracked | git check-ignore | keep |
| S-14 | P3 | `robots.txt` allows all + sitemap on `woodex.pk` while deploy host differs → previews potentially indexed under canonical domain | public/robots.txt, build sitemap | Env-driven canonical (`VITE_SITE_URL`) — P2-6 in v1 register, still open |

**No P0 finding in committed code** (same as v1). **The hosted cutover is the only P0 candidate** and it is fenced behind staging + owner words.

---

## 7. Broken functionality register

Severity: P0 business/security failure · P1 broken path for daily use · P2 important gap · P3 polish. Status: every item open unless marked FIXED with evidence.

| ID | Sev | Where | Root cause | Impact | Proposed fix | Verification | Status |
|---|---|---|---|---|---|---|---|
| B-01 | **P1** | Storefront `/`, `/shop` on Vercel | Site ships **demo dataset**: storefront reads build-time catalogue, not a live DB (by design pre-cutover) | Products/prices/stock on the live site are whatever was in the repo at build time; admin edits never reach it | Staging flip (runbook) then production flip; interim: treat vercel.app as a demo, keep woodex.pk on previous provider until flip | `staging-smoke.mjs` + §4 sign-in + e2e against preview | OPEN |
| B-02 | **P1** | Public CMS pages (`/lab/:slug` only); primary pages are code-owned | Builder output is scoped to lab routes; no binding to `/`, `/shop`, etc. | "Admin edits appear on the website" (prompt Part 6) is **not yet true** — admin Pages/Homepage edits do NOT change the production storefront | Phase 3 architecture task: schema-driven render path for public routes with code-pages as fallback sections; owner approval required (design decision) | preview diff of a homepage edit; e2e stays green | OPEN (architectural) |
| B-03 | **P1** | `/admin/chat` on hosted | Hosted chat tables deliberately absent | Inbox would render empty/read-only on cutover | owner-gated migration + staff-only policies (S-07) or keep chat demo-only | staging round-trip | OPEN |
| B-04 | **P1** | Checkout/payment | No gateway (merchant account + keys absent) | "Checkout" cannot take money; COD/bank only | CREDENTIAL-BLOCKED §1 sequence | sandbox wallet test on staging | OPEN (blocked) |
| B-05 | **P1** | Storefront accounts | Not built | Guest-only; no order history, no saved details | Hosted auth + customer RLS (owner decision first) | signup→login→order-history e2e | OPEN (blocked) |
| B-06 | **P1** | `backend/supabase/functions/whatsapp-campaign-sender` | Code exists, never deployed/wired; consent registry incomplete | Implies a capability that does not exist if presented as working | deploy behind flag with opt-out + rate cap, or **delete the dead path** (decision owed) | canary send to owner | OPEN (blocked) |
| B-07 | **FIXED ✅** | `src/api/demo/db.ts` DEFAULT_SETTINGS | Stale facts (email `hello@woodex.pk`, address "12-km Sheikh Zayed Road") contradict `site.ts` (info@woodex.pk, Gulberg III) | Demo/prints showed wrong business facts | synced DEFAULT_SETTINGS + Invoice.tsx/Quote.tsx fallbacks ← `site.*` (2026-11-13, WOODEX 2030 cycle) | grep clean; build/e2e re-run | **FIXED** |
| B-08 | P2 | Build churn | `mcp/index.ts` + `sitemap.xml` regenerate every build | dirty working tree; risk of accidental commit of generated diff | conventional `git checkout --` after builds (documented); or ownership step S-08 | git status clean | OPEN (hygiene) |
| B-09 | P2 | Bundle | chunk >500 kB warning (puck/recharts/vendor) | slower first load on weak connections | `manualChunks` vendor split; measure | build log; preview CWV | OPEN |
| B-10 | P2 | `AI hosted path` | EF undeployed; no key | "AI agent" only works as offline draft | CREDENTIAL-BLOCKED §8 sequence | staging rehearsal + evals | OPEN (blocked) |
| B-11 | P2 | Physical A4 print | never printed by a human | preflight tooling landed this cycle (`scripts/print-preflight.mjs`): sheet geometry, print-media visibility (found + fixed B-18), border-box, chrome hiding, Chromium PDF page truth — all PASS; paper itself still unverified | owner prints WI-10204 from preview; fix reported deltas | **preflight PASS; owner sign-off still required** |
| B-12 | P3 | `robots.txt` + sitemap | no host awareness | SEO canonical confusion on preview | S-14 fix | inspect head tags | OPEN |
| B-13 | P3 | a11y scope | print routes (`.a4-page`) not in axe route list | low risk (print CSS) | add print route scans | a11y suite | OPEN |
| B-14 | P3 | `e2e/smoke.mjs` | covers smoke/CRUD paths, not exhaustive CRUD×hosted-matrix | acceptable for smoke; regressions in rare pages may escape | grow checks where bugs found | CI | OPEN |
| B-15 | **FIXED ✅** | 9 taxonomy pages → `/admin/taxonomy`; sidebar 44→36 collapsible groups | consolidation delivered step 2 | sidebar noise, duplication | — | e2e 99→108, a11y 0/54 | **FIXED (this branch)** |
| B-16 | **FIXED ✅** | Furniture A4 advance math hardcoded 75/25; wording static | parameterized by template (`advancePct`, EN/UR terms, acceptance block, footer variants) | printed quotes wrong for non-75% deals | — | e2e ×5, build green | **FIXED (this branch)** |
| B-17 | **FIXED ✅** | No admin notification surface | NotificationBell (chat/leads/low-stock/tasks) | invisible backlog | — | e2e bell asserts ×2 | **FIXED (this branch)** |
| B-18 | **FIXED ✅** | Legacy `@media print { body * { visibility: hidden } }` (`src/index.css`) un-hid only `.print-invoice` — every admin A4/classic printable printed **blank** (confirmed: 1.4 KB two-page PDF, empty content streams) | carve-out extended to `.a4doc` **and** `.quote-sheet` trees; A4 PRINT_CSS gained pagination guards (`thead` repeat, `tr`/`footer` break-inside avoid); new gate `scripts/print-preflight.mjs` + `npm run test:print` | silent blank PDFs across all 7 printable admin routes | — | print-preflight 35/35 across 7 routes (WI-10204 → 2 pages by content, EXC-1001 → 2); PDFs 41–72 KB with painted content | **FIXED (this branch, 2026-11-08)** |

## 8. Missing functionality register (vs MASTER prompt Parts 3–21)

| ID | Part | Missing capability | Notes / blocked-by |
|---|---|---|---|
| M-01 | P6/P5 | **Builder owns public storefront** (design decision + render bridge) | the flagship Part-6 gap; page-level product/collection resolution today is code-owned |
| M-02 | P12 | **Work-flow engine** — stages validated but no resumable pipeline (lead→quote→order→production→QC→delivery→warranty as one trace) | biggest "integration" gap named by the prompt's FINAL OBJECTIVE |
| M-03 | P7/P13 | **Storefront customer auth + order history + addresses** | requires hosted auth + customer-side RLS design |
| M-04 | P7 | **Quote revision history UI** (`quote_versions` table exists; admin restore/compare UI absent) | version list exists in history dialog; no restore UI |
| M-05 | P10 | **Product-RAG embeddings + semantic retrieval for AI** (static corpus 18 entries; no catalogue vectors) | needs pgvector + provider key + corpus curation |
| M-06 | P10 | **Lead scoring with explanation** | rules drafted in master plan; nothing shipped |
| M-07 | P10 | **Human handover queue + assignment + round-robin + AI pause** (chat exists; no queue semantics) | build on chat tables (owner-gated) |
| M-08 | P11 | **Appointments / staff availability / double-booking transaction** | site-visits exist; no calendar/locking |
| M-09 | P12 | **Production stages engine, QC checklists, delivery/installation sign-off** | partial: statuses + actuals; no QC/delivery docs flow |
| M-10 | P12 | **Design management (2D/3D uploads, versions, approvals with timestamps)** | custom-design page exists as a storefront CTA + admin editor; not a design repository |
| M-11 | P17 | **Central notification automation** (triggers/conditions/actions + idempotency + failure logs) | bell is read-only surface; no rule engine |
| M-12 | P17/P9 | **Automation/audit log UI** (`track_events` table + mcp exist; no admin viewer) | needs read surface + retention policy |
| M-13 | P14 | **SEO manager** (per-entity SEO panel exists on Pages; missing coverage on products/blog/projects? plus duplicate-detection warnings, LocalBusiness/FAQ schema, redirects manager) | partial exists; complete it |
| M-14 | P8 | **Menus/navigation manager** (header/footer managed in code + settings; no menu editor) | — |
| M-15 | P6 | **Customer-facing search enhancement** (server search/typo-tolerance) | client-side today |
| M-16 | P3 | **Customer accounts data model** (addresses, wishlist) | with M-03 |
| M-17 | P16 | **Email provider** (order/invoice/quote emails) — invoice never reaches the customer | ESP creds; consent flows |
| M-18 | P16 | **WhatsApp Business sender** (B-06) | Meta WABA / 360dialog |
| M-19 | P16 | **GA4/Meta Pixel production wiring + Search Console** | config-only today |
| M-20 | P9 | **Backups/restore UI + status page + integration health** | runbook documents manual backup; no UI |
| M-21 | P19/P9 | **Full QA matrix (permission matrix tests, migration upgrade tests, backup verification)** | rehearsal covers RLS; no upgrade-path tests |
| M-22 | P20 | **Spec-set docs** (Part 20 wants ~16 WOODEX_* docs; we carry MASTER-TODO ledger + runbooks instead — declared consolidated convention) | docs convention decision (AGENTS.md) |
| M-23 | — | **i18n of admin/storefront (EN/اردو)** | partial (print sheets RTL) |

**Honest total: 23 registered missing capabilities. None are fakes-in-place; every absence is explicit.**

---

## 9. Prioritized implementation roadmap (Phase 1–9 synthesis, gated)

Order = dependency + risk. **Nothing starts without the owner's word; every step is independently verifiable. One PR per step; no combining parts.**

| # | Phase / work item | Class | Depends on | Acceptance criterion | Effort* |
|---|---|---|---|---|---|
| 0 | ~~PR #27/#28 merge · taxonomy consolidation · A4 furniture print~~ | DONE `[V]` | — | merged 2026-11-08 `[CI]`; e2e 108/108; a11y 0/54 | — |
| 1 | **A4 print sign-off** — owner physically prints `/admin/quote/WI-10204`; fix deltas | P2 | owner | owner signs the paper | ½–1 day |
| 2 | **Staging go-live (P0-front door)** — staging Supabase; apply 0001→0014 + seed; `staging-smoke.mjs`; staff RLS sign-in (§4 runbook); flip preview env; rollback drill | **P0 (hosted)** | owner staging project + words | smoke PASS; §4 checks pass; e2e against preview `VITE_API_MODE=supabase` optional | 1–3 days |
| 3 | **Production flip** — Vercel prod env; watch CI + smoke 24 h; rollback = demo env | P0 (hosted) | #2 green | 24h clean logs; first real lead captured via lead-capture EF | ½ day |
| 4 | **Hosted AI rollout (P1-6 completion)** — deploy `ai-agent` EF + `AI_AGENT_API_KEY` + budget cap; staging rehearsal; then enable Settings toggle for staff | P1 | #2 | live evals on staging conversations; human spot-check log | 1–2 days |
| 5 | **Payment gateway (P7 closure)** — JazzCash/Easypaisa sandbox → `order-submit` server verify (`x-woodex-signature`) → status machine → staging test wallets | P1 (blocked on merchant) | #2 + merchant account | sandbox end-to-end; zero unverified "paid" states | 3–5 days |
| 6 | **Storefront customer auth (P7)** — Supabase Auth; addresses; order history; RLS customer policies; guest-checkout parity kept | P1 | #2 | signup→order→history e2e on staging; RLS deny for cross-account | 4–6 days |
| 7 | **Builder → storefront binding (Part 6)** — public routes render schema for CMS-owned pages (home/services/landings) with code fallback; sanitizer→DOMPurify (S-10); page-level SEO from CMS | P1 (design decision) | #2 + owner sign-off on design | published CMS page replaces `/` (or chosen route); revert one click | 5–8 days |
| 8 | **Central notifications + automation (P17)** — trigger/condition/action rules (order confirmed → WhatsApp+email+bell; low-stock → PO draft; stale lead → task); idempotency keys; execution log UI | P2 | #2 (+#5 for payments) | rule dry-run + live demo orders fire exactly once | 4–6 days |
| 9 | **Workflow traceability (Part 3.2)** — journey bar on lead/quote/order/project records (same screen shows whole chain + links); M-04 quote revision restore | P2 | #2 | one click lead→order→invoice; quote restore works on staging | 3–5 days |
| 10 | **Bookings & appointments (P11)** — staff availability + slot locking transaction + reminders (email EF) | P2 | #2 + ESP | double-book rejected atomically; reminders send in staging | 4–6 days |
| 11 | **QC / delivery / installation (P12)** — checklist + photo capture bucket + sign-off records; wire into order stages | P2 | #2 | QC record blocks dispatch until pass | 4–6 days |
| 12 | **Product-RAG AI (M-05/M-06)** — pgvector catalogue embeddings; retrieval quotes SKU/price; lead scoring with explanations; handover queue | P2 | #4 | eval vs held-out Q&A > 85% grounded; no invented prices | 6–10 days |
| 13 | **Content hub completion** — menus manager, SEO manager (warnings/duplicates), blog SEO, redirects, LocalBusiness schema; **storefront search upgrade** | P2/P3 | #2 (optional) | sitemap/JSON-LD validated; search returns ranked results | 3–5 days |
| 14 | **Dependency hygiene** — bun-parity refresh; remove dual lockfile; `npm audit` gate; S-02 headers; S-14 sitemap host; S-08 mcp ownership | P2/P3 | none (independent) | audit shows materially fewer advisories; headers present (preview) | 2–4 days |
| 15 | **Phase 9 readiness** — permission test matrix, migration upgrade tests, backup verification, docs (Part 20 spec set consolidated), staff training | P2 | #2–#6 | drill: restore backup to scratch; staff doc | 3–5 days |

\* Efforts are estimates for the working environment, not commitments.

**P0 = blocks any "live" claim · P1 = blocks daily operations at cutover · P2 = important capability · P3 = polish.**
**Deliberately excluded from roadmap (parked, owner decision owed):** campaigns auto-send (B-06), WhatsApp provider (M-18), Bagisto mode productionisation (B-01 alternative), Urdu admin i18n (M-23).

---

## 10. What already works vs what must be fixed — the verdict

**Works today (demo, tested `[V]`/`[CI]`):** storefront (all 24 routes), admin 59 routes, products/orders/invoices/returns/claims/exchanges/actuals, CRM (leads/clients/merge/import/chat/tasks), builder (draft→lab), A4 furniture quotation print, taxonomy consolidation, notifications bell, payment signature verification, offline AI copilot, all CI gates.

**Must be fixed before real customers touch it:** hosting flip (#2/#3), security headers + dependency refresh, builder→storefront binding (#7), customer accounts + payments (#5/#6), hosted AI or remove the claim, and the honest-"not configured" cards stay until their providers exist.

**Honest position statement:** Woodex Reimagined is an unusually complete demo of the target OS, with the money path implemented as **rehearsed RPCs but zero hosted evidence**, and **zero capability to take a payment or hold a customer account today**. It is launchable only after #2–#6 land and the owner signs #1. Nothing in this document may be quoted as "production ready" before that.

## 11. Evidence index

| Claim | Evidence |
|---|---|
| e2e 108/108 | `npm run e2e` tail output, 2026-11-08 |
| axe 0/54 | `node e2e/a11y.mjs --fail` tail |
| rehearsal 93/0 | `npm run test:rehearsal` |
| ai-eval 19/19 · payments 15/15 | respective scripts |
| main CI green on 84aad29 | `gh run list --branch main` → completed/success |
| 55 tables / 125 policies / 29 functions | discovered from `supabase/migrations/*.sql` by `scripts/staging-smoke.mjs` |
| npm audit 26 (19H/7M/0C) | `npm audit --omit=dev` |
| Hosted: no egress | sandbox network allowlist (github/npm/pypi) — `[L]` claims impossible to verify here |
| v1 audit (this file @ 608f966) | git history |

## 12. Changelog

- **v2.4 (2026-11-13, this branch):** Phase-2 functional shell slice landed (PR #42): command palette (Ctrl/⌘+K, registry-backed search, 110/110 e2e) + topbar breadcrumb (a11y 0/54 `--fail`). Staging remains BLOCKED on owner decision (free-plan limit); hosted still UNVERIFIED; no production/Vercel/Supabase-write action taken.
- **v2.3 (2026-11-13, this branch):** Staging creation attempted and blocked by Supabase free-plan limit (2/2 active free projects; org `woodex`). No staging project exists; no hosted change of any kind was applied. Vercel preview flip (owner-approved, conditional) NOT executed — its precondition (staging smoke PASS) cannot be met. Runbook §0 records the blocker; ADR-style decisions owed by owner.
- **v2.2 (2026-11-13, this branch):** WOODEX 2030 program import (`docs/2030/` — package vendored verbatim + adaptation/fit-gap authored). Navigation registry extracted to `src/admin/nav-registry.ts` (typed ids + keywords; gate `npm run test:nav`, 8/8 PASS). B-07 FIXED (demo facts ← `site.ts`). No brand/IA/token changes — 2030 deltas recorded in `docs/2030/ADAPTATION-FIT-GAP.md` §5. Hosted stays UNVERIFIED.
- **v2.1 (2026-11-08, this branch):** B-18 found during roadmap #1 (A4 print sign-off) preflight — legacy print CSS hid every admin printable; fixed (visibility carve-outs + pagination guards). New gate `npm run test:print` (print-preflight): 35/35 across the 7 printable admin routes; PDFs paint. B-11 stays OPEN for the owner's physical print. Runbook §5 corrected (env trio, flip scope = admin plane, storefront stays seeded, unwired-surface list) — `a3db451`.
- **v2 (2026-11-08, 84aad29):** post-merge rewrite. Baseline re-run (e2e 108/108, axe 0/54, rehearsal 93/0, main CI green). AI status changed from "absent" to "offline-verified, hosted UNVERIFIED". A4 furniture print, taxonomy consolidation, NotificationBell added as FIXED items. §4 inventory and §5 DB map added in requested deliverable form. v1's P1-6/P2-1/B-register statuses updated accordingly; v1 issue numbering preserved where still valid.
- **v1 (2026-11-08, 608f966):** initial Phase 0 audit.

*Prepared by the implementation agent. Anything marked `[L]` has never been executed against a hosted project and must not be presented as working. This audit changes no application code.*
