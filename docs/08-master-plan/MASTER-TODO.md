# MASTER TODO — WOODEX (both tracks) — 2026-11-07

**How to use this file:** every phase/slice updates it. Completed work moves to
**FROZEN / HOLD — do not reopen** and never comes back. Anything pending is
listed under exactly one track with a status:

- `READY` — agent can start immediately (branch pushed, owner authorises)
- `DECISION` — owner decision required first (I prepare briefs; the call is yours)
- `OWNER` — action only the owner can perform (merge, deploy, keys, stocktake)
- `BLOCKED` — cannot start yet (dependency noted)
- `HOLD` — deliberately parked; revisit at the noted trigger

Two codebases are tracked here — **Track A** (`blackibexofficial-blip/woodex-reimagined`,
this repo, branch `arena/ee488920-woodex-reimagined`) and **Track B**
(`woodex420/woodex-2030`, `apps/dashboard`, branch `arena/01a10a97-woodex-2030` —
"Woodex Interiors" tenant, domain `woodexinteriors.com`, Agency-OS-style panel).
They are independent codebases; Track B work happens in that repo, not this one.

**Standing ground rules (all tracks):** everything ships rehearsed, never
hosted-verified (authoring sandbox has no Supabase egress); merges are
owner-gated; migrations are immutable once committed; dual-source parity
(`src/config/shipping.ts` ↔ `order_submit`) is mandatory; no data fabricated.

---

## Track A — woodex-reimagined (this repository)

### FROZEN / HOLD — do not reopen (complete, supersedes all earlier notes)

| Item | Evidence | Where |
|---|---|---|
| Migrations 0001 (agency_os_convergence) … 0006 (lead rate limit) — applied in order, immutable; **0007 (delivery_zones), 0008 (draft_orders), 0009 (exchanges + claims) added 2026-11-07** | rehearsal 66/66 | `supabase/migrations/` |
| Quote price authority = negotiated lines (documented in 0004 header; never re-list-price without owner sign-off) | slice 8 | `0004_quote_convert.sql` |
| 0005 grant matrix: PUBLIC EXECUTE revoked where required; 0006 rebuilt with explicit revoke + defensive `create role service_role` | rehearsal 28/28 → 36/36 | `20261107000006_lead_rate_limit.sql` |
| CI un-red: Lint (listCustomers/getCustomer types, `Record<string,never>` args) — **main green since #12 merge** | run 42390795619 | PR #12 |
| Lead-capture abuse guard (EF: x-forwarded-for key, limiter RPC pre-insert, 429, fail-open logged) | slice 10 | `lead-capture/index.ts` |
| Catalogue seed — 19 categories, 5 series, 148 products, 18 same-origin images; **placeholder stock kept as loud caveat**; idempotent ON CONFLICT | slice 11 (merged #12) | `supabase/seed.sql`, `public/images/seed/` |
| Anti-abuse decision brief (WAF vs Upstash vs Turnstile vs monitoring) | PR #13 (open — see pending) | `docs/08-master-plan/ANTI-ABUSE-DECISION.md` |
| Zone-rate shipping decision brief (recommendation: option B machinery-first, seeded at current behaviour) | commit `799691b` | `docs/08-master-plan/ZONE-RATE-DECISION.md` |
| **Zone-rate machinery (migration 0007)**: additive ALTER of 0001's CMS `delivery_zones` (tier/fee/free_at_subtotal/active/updated_at — public SELECT kept); 13 seeds (12 dropdown cities, hub = lahore/karachi/islamabad/rawalpindi; else major) + `default`, ALL Rs 2,500 / FREE ≥ 50,000 — byte-identical behavior; `order_submit` normalized city lookup (case/space-insensitive), deterministic duplicate tie-break, `default` fallback then constants (2,500/50,000) fallback, per-zone `free_at_subtotal = NULL` = never FREE; quote path keeps quote shipping | slice 13 (this PR) | `20261107000007_delivery_zones.sql` |
| **Wave 2 draft orders (migration 0008, this PR)** — staff-held drafts; RLS: read order.manage OR finance.manage, write order.manage; identity 1001; DRF-#### refs; totals = display caches; **conversion NOT wired** (owner decision). Adapter CRUD wired; Drafts.tsx lights up in supabase mode | slice 14 | `20261107000008_draft_orders.sql`, `src/api/supabase.ts` |
| **Wave 2b exchanges + claims (migration 0009, this PR)** — siblings of RMA returns; identity 1001 (EXC-####/CLM-####); finance read-only / viewer nothing; adapter state machines + `inventory_apply` stock effects (catalog.manage) + `record_order_event` RPC (order.manage) for timeline notes | slice 14 | `20261107000009_exchanges_claims.sql`, `src/api/supabase.ts` |
| **Wave 3 singleton resets** — shared defaults module `src/api/singleton-defaults.ts` (single source = `@/data/*`); demo adapter deduped onto it; supabase `resetWarrantyPage`/`resetCustomDesignPage`/`resetVirtualShowroomPage` wired (upsert page.manage rows) | slice 14 | `src/api/singleton-defaults.ts` |
| Turnstile anti-bot gate — EFs verify pre-RPC; action-pinned; fail-open when unconfigured, **fail-closed 503 on transport error**; demo/preview builds render nothing; 8/8 `node --test` | slice 12 (PR #14 open — see pending) | `_shared/turnstile.mjs`, EFs, `src/lib/turnstile.ts` |
| Aborts-on-misconfig posture for optional gates; consent contract (`lead-privacy-v1`) byte-locked across clients/EF | slices 3–12 | runbook + EFs |
| Rehearsal harness rebuilt (`/tmp/pglite-hub/run-next.mjs`) — **66/66 PASS** (0001–0009 + seed double-apply + seeded end-to-end + zone lookups + draft/exchange/claim cap matrices + CHECK constraints + `record_order_event` grants + singleton roundtrip). Figures 68/68, 68/75, 36/36 & 43/43 **permanently retired** | current | rehearsal harness |
| E2E smoke **42/42 PASS** · eslint 0 errors (34 pre-existing warnings) · tsc rc=0 · build green | per push | CI / local |
| Order intake dual guards: EF → RPC ordering (limiter/challenge before writes) | slices 9/10/12 | EFs |
| `mcp/index.ts` bundler churn reverted before every commit; `sitemap.xml` churn reverted | practice | repo |

**Do not reopen without fresh owner words:** quote pricing authority, dual-source
shipping constants, consent version (`lead-privacy-v1`), seed placeholder-stock
caveat, migration 0001–0009 contents, retired rehearsal figures.

### PENDING — merge / deploy / activate (owner actions, in order)

1. `OWNER` **Merge PR #13** (anti-abuse brief — docs-only). Ships `ANTI-ABUSE-DECISION.md`; required before #14 references resolve.
2. `OWNER` **Merge PR #14** (Turnstile slice 12 + zone-rate brief + Track B fixes + Wave 2/2b/3 + this file). CI green on the branch head — see latest run.
3. `OWNER` **Merge PR #11** (mcp bundler steady-state) if still wanted.
4. `OWNER` **Apply the CI hunk** from `docs/08-master-plan/CI-TURNSTILE-STEP.md` (App lacks `workflows` scope) so CI runs the Turnstile verifier tests.
5. `OWNER` **Hosted deploy** via `docs/08-master-plan/HOSTED-DEPLOY-RUNBOOK.md`: migrations 0001→0011 in order → **§1a seed** → deploy EFs → set env (`VITE_API_MODE=supabase`, `VITE_TURNSTILE_SITE_KEY`) → **physical stocktake before any real order** (placeholder `stock_qty` = 100/0 is fiction) → smoke §6 (incl. Turnstile path) → §8 sign-off.
6. `OWNER` **Turnstile activation**: create site/secret pair → `supabase secrets set TURNSTILE_SECRET=…` → `VITE_TURNSTILE_SITE_KEY=…` → redeploy EFs → rebuild web. Until both sides set, gate is inert (fail-open) — checkout unchanged.

### PENDING — decisions required (owner; I prepare, you call)

7. `DECISION` **Zone-rate pricing** — machinery LANDED (migration 0007, dormant at flat behavior). Still need: rate sheet from ops, tier boundaries (or keep uniform), free-threshold global vs per-tier, admin screen now/later, rate owner. Flip is one UPDATE when the sheet lands. See `ZONE-RATE-DECISION.md` §5.
8. `DECISION` **WAF / Upstash** — brief recommends Turnstile (done) + monitoring now; WAF proxy **held in reserve**; Upstash deferred behind explicit **fail-open vs fail-closed** call. Also name the **monitoring alert recipient** (unused so far).
9. `DECISION` **Stocktake** — when and who counts the physical inventory before go-live (feeds `seed.sql` stock or a post-seed `UPDATE`).

### 2026-11-07 sweep — post-#13/#14 (owner instruction: “as you recommend”)

- **Branch/tag audit (read-only), now recorded:** `docs/08-master-plan/BRANCH-INVENTORY-2026-11-07.md`. Shallow-clone artifact — trees compare, logs don't. `main` = merged union of #13/#14 verified: only 2 files differ from pre-merge tip (the merge union #13's brief + runbook). All 13 remote refs + `v1.0.0` tag classified landed/parked/archived.
- **Zero lines lost in the merges** — every merged PR (#2–#14) adds 0 source files vs main (measured). Catalogue already ported: 148/148 slugs present in `src/data/products.ts`.
- **PRs closed unmerged (owner decision, refs retained):** #1 (raw IBPanel handoff archive) and #11 (lint-red `@lovable.dev/mcp-js` bundler re-commit; underlying money-path landed via #10). Repo temporarily has **no open PRs**; this sweep's docs ride PR #15 once opened.
- **Port candidates skipped by owner:** 139 legacy product photos (17.3 MB, fork `arena/0378ff53-woodex-reimagined`), fork audit docs (`docs/07-woodex-os/`), PagesLab spike (2 files in merged `cb0d09e3`). Fork and refs retained.
- **Kept deliberately:** `v1.0.0` tag + all 9 merged remote branches (deletion needs explicit owner word).
- Rehearsal is now **reproducible in-repo** (`npm run test:rehearsal`, pglite, offline): **59/59** today (migrations 0001–0011 + quotation RLS appendix + invoice ledger suite + tasks RLS suite). The historical 66/66 was the pre-merge /tmp harness; treat `test:rehearsal` as the going-forward gate. Real typecheck = `tsc --noEmit -p tsconfig.app.json`, green. CI green on merge SHAs.
- **Owner-held still:** hosted deploy (0001–0010) + seed + physical stocktake; Turnstile keys; zone-rate sheet. `convertDraftOrder` — DONE 2026-11-07 (owner-approved full spec, migration 0010).

### PENDING — engineering slices (agent-ready once authorised)

10. `DONE 2026-11-07` **Wave 2 — draft orders** — migration 0008 + adapter CRUD (list/get/create/update/delete); finance read-only; viewer nothing; identity 1001. Conversion stays a separate item (13).
11. `DONE 2026-11-07` **Wave 3 — singleton resets** — `src/api/singleton-defaults.ts` is the single source (@/data seeds); supabase `resetWarrantyPage/CustomDesign/VirtualShowroom` wired; demo adapter deduped onto it.
12. `DONE 2026-11-07` **Wave 2b — exchanges / claims backend** — migration 0009 (tables + `record_order_event` RPC, order.manage-only) + adapter lifecycles + `inventory_apply` stock effects (catalog.manage) + transition guards + timeline notes.
13. `DONE 2026-11-07` **`convertDraftOrder` wired (migration 0010, full spec)** — catalogue reprice + order.manage-audited negotiated overrides + zone shipping + single-txn stock rollback + idempotent flip; admin reprice preview modal; rehearsed 41/41 → 50/50 (`npm run test:rehearsal`); hosted deploy pending owner.

### DONE 2026-11-07 — Quotation platform port (owner instruction: “Start complete implementation”; branch `arena/926d625e-woodex-reimagined`; PR pending owner merge)

- **Lifecycle** Draft → Review → Approval → Sent → Revised (re-submits to Review) / Accepted / Declined; 8-stage `QuoteStatus` end-to-end (types → adapters → badge → list filter + chips → contextual quick-action buttons; converted stays terminal).
- **Per-line engineering spec** — W/H/D + unit (`mm|cm|in`), material, finish, series, category, custom notes; rides `items` jsonb; print page renders a spec line per item.
- **Versioning** — `quote_versions` snapshot appended on every save (create/edit/status-change/restore); history drawer on the editor (`v{n} · action — resulting status`); restore re-opens the snapshot as a fresh `revised` revision; converted quotes are never resurrected; `audit` jsonb ring buffer (20 entries) on the quote itself.
- **Print template designer** (`QuoteTemplateDesigner`) — builtin **“Woodex classic”** (code-owned, not deletable), custom templates persist to `quote_templates`; required payment-terms wording locked (“Final payment terms will be included in formal quotation.”) — cannot be weakened; brand colour drives totals rules, headings, note boxes, sign-off lines.
- **Print page** renders template blocks (letterhead / doc title + ref / validity banner / payment note / terms / signature grid) + per-line engineering spec; validity respects the full pre-commit lifecycle; expired banner extended to review/approval/revised.
- **NO new migration** — rides 0001's `quotes` / `quote_versions` / `quote_templates` + `quote.manage` RLS (templates/versions matrix rehearsed: 50/50, 4 new asserts). POS remains skipped; Bagisto adapter untouched except stubbed 501s for the new 5 API methods; realtime collaboration deliberately not built (post-activation item).
- Gates: tsc clean, eslint clean, build ✓, e2e 42/42, rehearsal 50/50. **Hosted-gated** — nothing applied live; PR merge itself owner-gated.

### DONE 2026-11-08 — Invoice ledger + Agency OS parity review (branch `arena/2b15db15-woodex-reimagined`; PR #18)

- **Parity review delivered** — `docs/08-master-plan/AGENCY-OS-PARITY-2026-11-08.md`: every one of the 24 legacy dashboard screens audited (woodex-2030 `arena/01a10a97-woodex-2030`), verdict per screen, prioritised backlog (tasks shipped 2026-11-08; interior-projects depth largest; marketing attribution; leads kanban; control-center card; inbox poll-based parked; realtime/POS/theme-studio all deliberately not built).
- **Invoice ledger shipped in-repo** — `/admin/invoices` (KPIs collected/outstanding/count; chips All/Issued/Partially paid/Paid/Overdue/Cancelled — Overdue derived; search; per-row print at `/admin/invoice-document/:id` + finance-only payment dialog); “Invoice from quote” dialog issues via 0001 RPC `quote_invoice_snapshot` (cap quote.manage, **idempotent** — replay returns the existing invoice).
- **Finance-only posture** — payments post via `invoice_apply_payment` (cap finance.manage): auto-flips Issued → Partially paid → Paid; viewer sees zero rows; sales may snapshot + read, never post. **No deletes** on ledger documents.
- **NO new migration** — 0001 already carried `invoices`/`payments` + both RPCs + RLS (verified by read + rehearsal). Adapters: demo (in-memory + seeded: INV-1001 quote-converted Issued, INV-1002 standalone Issued, INV-1003 Partially paid with logged payment), Supabase (list/CRUD-read over table; writes RPC-only), Bagisto (501 stubs). Print route decorates with locked payment-terms line.
- Rehearsal 56/56 (6 new invoice asserts: quote→invoice snapshot ✓ idempotent ✓ sales-cannot-post ✓ partial flip ✓ full flip ✓ viewer denied ✓). Hosted activation unchanged — owner-gated.
- **Deliberately not ported**: legacy red-bin delete on invoices; full-page E-Quotation; Viewed/Negotiation stages; lossy 0001 snapshot carried onto the invoice row (Phase-2 candidate via a 0012 RPC replace — needs owner sign-off).

### DONE 2026-11-08 — Tasks & follow-ups port (branch `arena/2b15db15-woodex-reimagined`; this PR)

- **`/admin/tasks` shipped in-repo** — full parity port of legacy screen #16: KPI strip (Open / Due today / Overdue / Completed), All/Open/Done filter chips with counts, search (title/client/owner/priority/ref), three views — **List** table, **Open ↔ Done board**, **month-grid due-date calendar** — New-task dialog (title, client/deal label, due date, priority low/normal/high), Complete/Reopen per row.
- **CRM-shared, no deletes** — 0001 `tasks` table (FKs into leads/quotes/orders/site_visits) + RLS `tasks_read/insert/update` = `has_cap('crm.manage')` (sales holds it); **no delete policy** — work items are completed/reopened, never destroyed. Demo seeds: TSK-1001 (Clifton Villa 9 · teak for the porch · quote QOT-1001 · overdue 2 d · normal), TSK-1002 (Gulberg Residency · swatch before production · QOT-1002 · due today · high).
- **Demo labels vs hosted truth** — free-text client label exists only in demo; hosted Supabase mode stores `client_id` (FK) and has no label column, so `supabase.ts` surfaces related refs and drops unknown free text (documented in code comments). Bagisto = 501 stubs. **No new migration** — nothing applied hosted-side.
- **Nav/route** — Engage group, directly under Leads; `/admin/tasks`; icon `ClipboardCheck`; layout title “Tasks & Follow-ups”.
- Gates: tsc clean · eslint clean (repo config; 34 pre-existing warnings unchanged) · vite build ✓ · e2e **42/42** · rehearsal **59/59** (3 new: sales create+read ✓ viewer denied ✓ editor denied ✓). Hosted activation unchanged — owner-gated.

### HOLD — deliberately parked

14. `HOLD` **Zone-rate admin screen** — SQL edits acceptable at current volume; revisit when ops edits zones weekly.
15. `HOLD` **True courier-API freight pricing** (PostEx/Leopards/TCS) — rejected at this stage (no contracts/SLA data; not verifiable in sandbox). Trigger: real freight invoices in hand.
16. `HOLD` **Zone-rate for quote-converted orders** — intentionally quote-shipping; do not migrate.
17. `HOLD` **"68/75" rehearsal figure / pre-reset harness** — retired; never cite.

---

## Track B — woodex-2030 dashboard (`woodex420/woodex-2030`, `apps/dashboard`) — audited 2026-11-07, resolved HERE

Analysis 2026-11-07 (23 pages cross-checked). **Owner constraint (2026-11-07): the legacy repo stays untouched/analysis-only — everything below landed (or was verified already-present) in THIS repo (`src/admin`).** No writes were made to `woodex420/woodex-2030`. Zero behavior claims about the legacy panel beyond what was read.

### FROZEN / HOLD — do not reopen

- Live modules in the legacy panel work (`/api/*` + realtime): leave that repo alone. The reimagined panel (`src/admin/*`) re-implements the same module set LIVE against `getAdminApi()` (demo DB / Bagisto / Supabase adapters).
- `Placeholder.tsx` pattern remains the correct empty-state for unbuilt modules — reuse, don't redesign.

### PENDING — prioritised (greatest first) → audit verdict, this repo

| P | Item | Verdict in woodex-reimagined (2026-11-07) | Evidence |
|---|---|---|---|
| 1 | Analytics 100% mock | **Already live** — `getRevenueSeries(30)` + `listOrders` KPIs/charts; no hardcoded money/trend; date-range inert-Select removed; refresh = real reload. Backend semantics: computed demo DB; Bagisto returns zeros (honest); Supabase aggregates via RPC. | `src/admin/pages/Analytics.tsx`, `src/api/demo/db.ts`, `src/api/supabase.ts` |
| 2 | Projects 100% mock ("Phase 4 wizard" toast) | **Already live** — CRUD against `api.listProjects()` + storefront-portfolio seed; no BOQ/milestone fiction exists here; "New project" opens a real dialog. | `src/admin/pages/Projects.tsx` |
| 3 | Dashboard leaks mock rows into live widgets | **Not present** — KPI strip, MTD stats, revenue AreaChart, latest-orders table and low-stock watchlist all read live adapter data. | `src/admin/pages/Dashboard.tsx` |
| 4 | Settings toggles don't persist (fake toast) | **Already wired** — `getSettings`/`saveSettings`, controlled inputs, real success toast. **Fixed 2026-11-07:** `save()`/`resetDemo()` now have error paths + toasts (were silent-fail). Governance/team-list drift not applicable here. | `src/admin/pages/Settings.tsx` |
| 5 | `/support` placeholder route | **Does not exist** — no `/support` route, no nav entry; storefront Footer links Support → `/contact`. | `src/admin/AdminApp.tsx`, `src/admin/Layout.tsx`, `src/components/Footer.tsx` |
| 6 | Category admin not modeled | **Already modeled** — full category CRUD with group ordering, hero styles, option-set linkage. | `src/admin/pages/Categories.tsx` (`/admin/categories`) |
| 7 | Demo credentials printed on Login | **Fixed 2026-11-07 (this PR)** — the hint now renders only when `VITE_ADMIN_DEMO_HINT=1` (default off). Shared previews never print credentials; `.env.example`, README, docs/07 updated. | `src/admin/Login.tsx`, `src/config/env.ts` |
| 8 | Revenue chart on mock series | **Not present** — daily buckets computed from orders (`getRevenueSeries`), same data behind stat cards. | `src/api/demo/db.ts`, `src/api/supabase.ts` |

### Track B HOLD

- **Phase 4 Business Pack** (Support/After-Sales, Projects BOQ) — still parked until owner signs Phase 4 scope. Trigger: Phase 4 kick-off.
- **UIComponents page** — still internal showcase; consider removing from production nav later. Trigger: nav/usage review.
- **Legacy `woodex420/woodex-2030` retirement** — once the reimagined panel covers it, retire or archive; do not port piecemeal. Trigger: owner call after hosted deploy.

---

## MASTER ORDER OF WORK — greatest-complete first

1. **Track A #1→#4** (merges 13/14/11 + CI hunk) — unblocks the truth-in-main and CI coverage. *Owner, ~30 min.*
2. **Track A #9 + #5 (stocktake, then deploy)** — only now may real money move. Everything above this line protects launch honesty.
3. **Track A #6 Turnstile activation** (30 min, both keys) — checkout fraud gate goes live.
4. **Track A #7 zone-rate decision** — if "B", I build migration 0007 (one focused slice; the only open money-path engineering).
5. **Track A #8 WAF/Upstash + monitoring recipient** — closes the anti-abuse loop; I then write the Upstash slice only if you approve fail-closed/open explicitly.
6. **(DONE 2026-11-07)** Track A Wave 2 / Wave 2b / Wave 3 — 0008 draft orders, 0009 exchanges/claims, singleton resets: wired + rehearsed 66/66 in this PR (0007 zone machinery already landed). Remaining from this line: `convertDraftOrder` wiring (owner sign-off).
7. **Track B — closed in this repo 2026-11-07** — all eight findings verified/already-implemented; only real fixes shipped: Login demo-hint opt-in gate + Settings error paths (this PR). Legacy repo untouched by owner constraint.
8. **(superseded by 7)** — see the audit table; nothing else outstanding from Track B short of Phase 4 scope (owner call).

### Completed this cycle (for the record — frozen)

PR #10 (checkout+admin money path, merged), PR #12 (CI un-red + migration 0006 + catalogue seed, **merged 2026-11-07**), PR #13 (anti-abuse brief, open), PR #14 (Turnstile slice + zone-rate brief + Track B fixes + Wave 2/2b/3 + this master plan, open), rehearsal 66/66, e2e 42/42, catalogue seed, zone-rate brief.

*Track B figures come from read-only API/content inspection on 2026-11-07 (no repo writes made). Track A evidence lives in the repo: `supabase/migrations/*`, `docs/08-master-plan/*`. Nothing anywhere has run against a hosted Supabase project — every "works" above means "rehearsed + typechecked + e2e", not "deployed and proven".*
