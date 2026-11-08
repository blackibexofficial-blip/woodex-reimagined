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
| E2E smoke **63/63 PASS** · eslint 0 errors (33 pre-existing warnings — all `react-refresh/only-export-components`, accepted shadcn/builder pattern; `react-hooks/exhaustive-deps` fixed 2026-11-08) · tsc rc=0 · build green | per push | CI / local |
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
- Rehearsal is now **reproducible in-repo** (`npm run test:rehearsal`, pglite, offline): **93/93** today (migrations 0001–0014 + quotation RLS appendix + invoice ledger suite + tasks RLS suite + admin_overview casing suite + client_merge identity suite + site_visits RLS suite + project actuals ledger suite (0013) + storage bucket suite (0014, with a storage-schema stub)). The historical 66/66 was the pre-merge /tmp harness; treat `test:rehearsal` as the going-forward gate. Real typecheck = `tsc --noEmit -p tsconfig.app.json`, green. CI green on merge SHAs.
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

- **Parity review delivered** — `docs/08-master-plan/AGENCY-OS-PARITY-2026-11-08.md`: every one of the 24 legacy dashboard screens audited (woodex-2030 `arena/01a10a97-woodex-2030`), verdict per screen, prioritised backlog (tasks shipped 2026-11-08; client merge review shipped 2026-11-08; interior-projects depth largest; marketing attribution; leads kanban; inbox poll-based parked; realtime/POS/theme-studio all deliberately not built).
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

### DONE 2026-11-08 — Dashboard "Pipeline control center" card (branch `arena/2b15db15-woodex-reimagined`; this PR)

- **Control-center / ecommerce-overview parity (backlog #2) shipped in-repo** — new SectionCard on `/admin/dashboard`: four linked tiles — **Open pipeline** (count + PKR pipeline value → `/admin/quotes`), **Outstanding invoices** (Issued+Partially paid count → `/admin/invoices`), **Needs attention** (returns awaiting handling + new leads → `/admin/returns`), **Storefront pages live** (published count → `/admin/pages`).
- **Zero new RPCs / zero migration** — supabase mode reads the same `admin_overview` RPC payload the KPI strip already uses (`pending_invoices`, `open_quotes`, `pipeline_value`, `overdue_returns`, `published_pages` — passed through verbatim). Demo mode computes the identical signals from the seeded store; Bagisto baseline returns zeros + comment (not derivable from `/sales/*`; Bagisto invoices are 501 stubs — zeros, never invented numbers).
- **e2e +4 asserts** (card renders · outstanding-invoices tile · open-pipeline tile · pipeline-value sub-line) — first run failed on CSS upper-cased tile labels vs case-sensitive includes; asserts made case-insensitive; **46/46**. tsc clean · lint rc=0 · build ✓ · rehearsal unchanged **59/59**.
- **Honest flag for hosted verification (not fixed here)** — 0001 `admin_overview` counts open quotes with `status in ('Draft','Sent','Review')` (Title Case) while this codebase's quote statuses are lowercase (`draft/sent/review`) — hosted `open_quotes` may under-count until casing is reconciled (candidate: 0012 RPC replace or quote-status audit). Nothing silently changed.

### DONE 2026-11-08 — Migration 0012: admin_overview open-quote casing fix (branch `arena/2b15db15-woodex-reimagined`; this PR)

- **Closes the last defect flagged on this PR** — 0001 counted open quotes with Title Case `('Draft','Sent','Review')` while the app writes lowercase lifecycle statuses (`draft/review/approval/sent/revised`); hosted `open_quotes`/`pipeline_value` would have read 0. `0012_admin_overview_quote_status_case.sql` = identical function, identical cap-guard, identical payload keys; only the two open-quote predicates change. Column default retained (insert path passes status explicitly).
- **Rehearsed offline (pglite) +3 asserts** — lowercase `draft/review/sent` quoted rows counted (`converted` excluded) ✓ · `pipeline_value` delta = 70,000 ✓ · viewer denied (42501) ✓. Suite **62/62** (migrations 0001–0012). Nothing touched hosted — apply stays owner-gated.
- **Verification** — returns/stock_transfers/invoices all confirmed casing-consistent (Title Case writers, Title Case readers; returns `state='Requested'` is the column the RPC reads); `published_pages` is snapshot-count (case-free). Only the quotes predicates needed the fix.

### DONE 2026-11-08 — CRM identity: merge-review queue + customer score & source (branch `arena/2b15db15-woodex-reimagined`; this PR)

- **`/admin/client-merge` shipped in-repo** (Commerce group, under Customers; `GitMerge` icon) — the backlog-#3 CRM depth slice. Ambiguity goes to a human: **nothing auto-merges**; explicit canonical choice per pair; tombstone-only posture.
- **Queue derived, no new RPCs or migrations** — candidates are client-side groupings of non-merged `clients` on normalized email/phone (`email_norm`/`phone_norm`); merge executes via the capability-checked 0001 RPC **`client_merge`** (cap crm.manage): links (`lead`/`quote`/`order`/`site_visit`) re-pointed, loser marked `merged_into`. Merge audit trail lists retired records. Demo seeds: CLI-1001/1004 (email collision `BILAL.A@example.com`), CLI-1003/1005 (phone collision +92 322 4567890), CLI-1007 (already-retired record for the audit view).
- **Customers page** — drawer gains **Source** (storefront/referral/site-visit/b2b; demo seeded, deterministic) and **Score** (1–99, pure derivation from orders/lifetime-value/account-type — never stored, never hand-entered; hosted: same derivation). 
- **Rehearsal +3 asserts** → **65/65** (sales merge with link re-point ✓ viewer denied ✓ viewer reads 0 client rows ✓). Bagisto = 501 stubs. e2e unchanged **46/46** (merge page not yet browser-driven — flagged honestly in the PR body).
- **Hosted gap, disclosed** — customers hosted-side are synthesized from orders; `source` surfaces only when a `clients` row is backfilled by the first hosted merge cycle; score is always derived. No migration was added; apply stays owner-gated.

### DONE 2026-11-08 — Leads CRM depth: Table/Board kanban + site visits (branch `arena/be885bad-woodex-reimagined`; this PR)

- **`/admin/leads` gains a Table/Board toggle** — Table (paginated rows, unchanged behavior; status Select now optimistic) and **Board** (five lowercase stages `new/contacted/quoted/won/lost`, count chips, HTML5 drag-and-drop — **no new libraries**; drop moves the lead via `updateLeadStatus` with optimistic UI + rollback on failure; board ignores pagination/status-filter, fetches ≤100 rows).
- **Site visits shipped in-repo** — per-row and on-card calendar action opens a dialog: existing visits for that lead (status Select: Scheduled/Completed/No-show/Cancelled; outcome input saved on blur/Enter; notes) + schedule form (`datetime-local`, **address required**, owner, site notes). Backed by `site_visits` through the adapters: demo (in-memory, seeds SV-1001 Completed measure-up + SV-1002 Scheduled +3d), supabase (plain RLS — **no `site_visit_schedule` RPC exists**; `client_id` resolved via explicit ref → `client_links` lookup → auto-create identity client from the lead), Bagisto = 501 stubs.
- **Rehearsal +3 asserts** → **68/68** (sales may schedule a visit ✓ viewer denied read ✓ sales may record outcome — status→Completed ✓). e2e **46/46** at that time; now **59/59** (+2 campaigns, +4 click-through, +2 practice-workspace, +5 coverage-pass asserts — 2026-11-08). Browser-driven smoke **8/8** (demo gate → leads page → board columns/counts/draggable cards → visit dialog → seeded outcome persisted) + synthetic-drag smoke **4/4** (card moved New→Quoted with success toast).
- **Demo fix included** — pre-existing off-by-one: Kashif Mirza's quote assembly + client link pointed at `lead-1008` (Fatima Raza's lead); now uniformly `lead-1007`. Zero app-behavior change beyond the seed correction.
- **Not done (flagged)** — win-rate analytics (undefined metric; needs owner definition); reminder-task linkage (`reminder_task_id` — needs an owner-approved migration or RPC design); hosted verification (activation stays owner-gated); touch/keyboard drag; kanban colour/label polish pending UX sign-off; e2e does not yet cover the new dialog (manual smoke only).

### DONE 2026-11-08 — Backlog #1: Campaign attribution view (`/admin/campaigns`) (branch `arena/be885bad-woodex-reimagined`; this PR)

- **Campaign-funnel surface ships** — new admin page + nav entry (Engage group, `Megaphone` icon, title map). Honest by construction: rows come from leads' captured UTM/landing tags — **first-party only; NO pixels, no cookies, no third-party trackers** (pixel go-live is an owner decision: provider/consent copy/CMP impact) — stated on-page, not just in docs.
- **Metrics** — KPIs (attributed/total, open pipeline, won value, win rate), Leads-vs-Won bar chart (recharts; `isAnimationActive={false}` — mount animation never painted under this headless chromium; hit-testing confirmed the bars rendered all along), campaign table (leads · consent-OK · B2B · won/lost · win rate · pipeline · won value + **honest Unattributed group** for referrer/organic/direct leads), source/medium rollups, 500-lead fetch window (paged).
- **Spend/CPA/ROAS deliberately absent** — ad spend has no home; both need your decision on where spend is stored. Not faked.
- **Demo seeds enriched** — 5 leads gained UTM/consent tags (Omar `linkedin/organic hq-fit-out-q4`; Fatima `instagram/organic minimal-home-look`; Mahnoor `youtube/organic study-room-makeover`; Owais `facebook/cpc reception-counter-boost`; Mariam `google/cpc 6-city-rollout`) → demo shows 8/12 attributed, win rate 60%, won PKR 45,760,000, pipeline PKR 36,015,000.
- **Verification** — tsc rc=0 · lint rc=0 (34 pre-existing warnings) · build ✓ · e2e **52/52** at that time → **59/59** with the practice-workspace + coverage asserts (2026-11-08) · browser smoke 6/6 · rehearsal unchanged **68/68** (no RLS touched) · demo-mode backed (works identically in Bagisto/demo).
- **Not done (flagged)** — pixel go-live (owner decision); ad-spend storage; win-rate quote-conversion tie (kept lead-verdict-only); e2e asserts content only (no click-throughs of the page).

### DONE 2026-11-08 — Backlog #7 (v1): Interior projects practice workspace (branch `arena/be885bad-woodex-reimagined`; this PR)

- **`/admin/projects` gains a per-row Practice workspace** (Ruler icon; dialog `ProjectPracticeDialog`) — BOQ (**planned cost only**: rows · qty · unit · rate · section subtotals · planned-grand-total Rs 7,477,500 for the seeded Grooming Lounge), **Milestones** (Not-started/In-progress/Blocked/Done badges; overall progress = Done 1 / In-progress 0.5; seeded 3/8 done → 50%), **Files** (metadata-only; simulated "uploads"; owner decisions needed for real Storage), **Overview** (planned cost · milestones x/y · roll-up · next due).
- **Rides `projects.payload` — zero migration.** Hosted `projects(id text PK, payload jsonb)` absorbs the new `practice` key transparently (adapter merges arbitrary payload keys); hosted activation remains owner-gated. BOQ = planned cost — **actuals/variance deliberately out** (needs costing-model decision). **Production/dispatch tab out of v1** (largest remaining chunk — needs owner scoping). Demo seeds: Gents Grooming Lounge id 7 (full) + DHA Corporate Tower id 1 (all-done close-out) — both rows show a live workspace button.
- **Verification** — tsc rc=0 · lint rc=0 (34 pre-existing warnings) · build ✓ · e2e **54/54** (+2: workspace opens with seeded Rs 7,477,500 planned cost; Files tab lists the seeded drawing) · browser smoke 9/9 (trusted-click harness — Radix tabs ignore synthetic `.click()`) · rehearsal unchanged **68/68** (no RLS touched).
- **Not done (flagged)** — production/dispatch tab; BOQ actuals/variance; real file storage (Supabase Storage bucket + RLS, owner-gated hosted step); costing model; mobile form ergonomics; no e2e click-through into BOQ row editing (assert only what is stable).

### DONE 2026-11-08 — E2E coverage pass: client-merge, kanban DnD, BOQ recompute (branch `arena/be885bad-woodex-reimagined`; this PR)

- **Closes the last browser-coverage flags** — merge-review page now asserted in-CI (seeded Bilal email-collision pair renders; retired CLI-1007 audit row visible), kanban synthetic HTML5 drag moves a card New→Quoted, BOQ tab activates, and editing the first Qty (3,500→4,000) recomputes the planned total (Rs 7,567,500). e2e **59/59** (+5 vs 54/54 at the practice-workspace slice). tsc rc=0 · lint rc=0 · build ✓ · rehearsal unchanged **68/68** (no RLS).

### DONE 2026-11-08 — Housekeeping sweep (branch `arena/be885bad-woodex-reimagined`; this PR)

- **The last agent-code-sized, no-owner-input-needed item on the upgrade registry is closed.** `src/` contains zero `console.log`/`info`/`debug`/`trace`/`table`/`dir` calls (only deliberate `console.error`/`console.warn` error paths). `.node-version` deliberately **not** added — CI is intentionally unpinned (`oven-sh/setup-bun@v2`); README now carries a toolchain note instead (Node 20+ for the e2e/rehearsal Node scripts; Bun for install/build; sitemap regeneration is the only Bun-dependent build step).
- **Stale docs fixed** — README: e2e 33→**59** checks, a11y description now matches enforcement (report-only locally; critical/serious = 0 in CI), the "sitemap.xml deliberately omitted until a generator exists" paragraph (false since the generator landed) replaced with the current build-time generation truth. UPGRADE-TODO.md: A4 marked superseded by P3.1 · B4 pending-registry line corrected (DONE 2026-11-07 — was listed as pending) · PB-1/PB-2 marked done / PB-3+ flagged owner-gated · housekeeping checkbox closed with evidence · Verification-gate section carries a 2026-11-08 sync note (59/59 · rehearsal 68/68 · branch ref historical). Docs-only; no `src/` changes.

### DONE 2026-11-08 — Lint debt sweep: last react-hooks warning eliminated (branch `arena/9b72a091-woodex-reimagined`; this PR)

- **`src/pages/Shop.tsx` no longer trips `react-hooks/exhaustive-deps`** — the category→URL sync effect was writing `searchParams` **in place** (mutating the shared `URLSearchParams` instance) and unconditionally replacing the history entry on every category selection. It now builds a fresh `URLSearchParams`, and skips the navigation entirely when nothing would change (no-op on mount/re-renders). The intentional dep omission (effect must react only to `selectedCategory`; URL→state sync is owned by the `[searchParams]` effect) is documented inline with a targeted `eslint-disable-next-line` naming the exact reason — browser Back/Forward semantics unchanged.
- **Warnings 34 → 33.** The remainder are all `react-refresh/only-export-components` (33×): the accepted shadcn/ui + pages-builder pattern of co-locating cva variants/hooks/contexts with components — dev-HMR-only concern, zero runtime impact, deliberately kept (shadcn upstream compat). Nothing is swept under `--max-warnings`; 0 errors, genuinely.
- Gates: tsc rc=0 · lint rc=0 · build ✓ · e2e **59/59** · rehearsal unchanged **68/68** (no RLS). Environment note: the sandbox re-wiped `node_modules`/`dist`/`/tmp/bin` again — `npm ci` (throttled flags) + the /tmp bun shim (dispatcher: `run generate-sitemap` → prebuilt bundle; `bun run <bin>` → `node_modules/.bin/<bin>`) were recreated; verified end-to-end by the green e2e.

### DONE 2026-11-08 — Admin accessibility sweep: 47/47 routes, zero axe violations (branch `arena/f36111a5-woodex-reimagined`; this PR)

- **The admin rail is axe-clean and now CI-gated.** `e2e/a11y.mjs` no longer stops at the 7 public routes: it signs in through the demo gate once, then scans 40 static `/admin/*` routes (47 total; the parameterised print routes stay smoke-covered, not axe-covered). CI's existing `bun run e2e:a11y -- --fail` step now fails on any critical/serious admin violation; locally the scan stays report-only. **Result: 0 violations across 47 routes** (was 6 critical + 2 serious on the first 12-route pass, plus 9 more surfaced by the full 40-route census: 7 serious + 2 moderate + 1 minor — all fixed at the root, none suppressed, no `--max-warnings` games).
- **Root-cause fixes:** (1) panel-less Radix `Tabs` used as filter chips on **10 admin pages** (Orders, Leads, Customers, Inventory, Materials, BulkEditor, Bundles, Collections, PriceLists, SalesChannels) emitted `aria-controls` pointing at never-rendered panels — converted to `ToggleGroup type="single"` (`radiogroup` semantics); (2) `SelectTrigger` is `role=combobox` (nameFrom: author), so the visible placeholder never counted as an accessible name — explicit `aria-label` on the three unlabeled filter triggers (Leads status, Products category/stock); (3) `aria-label` on a plain `<div>` hex swatch → `role="img"` (Materials); icon-only `<th>` gains `sr-only` text (BulkEditor); `aria-label="Reload"` vs visible text "Refresh" aligned (Invoices).
- **Contrast AA repairs:** `bg-hon-green text-white` (≈3.4:1 — real AA fail) → `bg-accent text-accent-foreground` (≈4.9:1) in admin + storefront `TradeBanner` + `QuoteTemplateDesigner`; `text-amber-600` → `text-amber-700` (Inventory low-stock); "lost" lead badge → `bg-secondary text-foreground`; received-transfers rows `opacity-70` (crushed every child below 4.5:1) → `bg-secondary/40`; Media active-folder row white-on-15%-tint text → `text-foreground`.
- **Landmarks & charts:** sidebar `<nav>` labelled "Admin navigation"; the two complementary `<aside>`s labelled "Admin sidebar" / "Admin sidebar (mobile)" (`landmark-unique`); recharts pie sectors (`path[role="img"]`, `svg-img-alt`) now carry per-`Cell` `aria-label` with name + value.
- **Process honesty:** the housekeeping sweep (`38b7a68`) silently lost one README hunk (the "Other scripts" line + toolchain note) — two parallel same-file `edit_file` calls raced, last write won, and no one re-read the file. Found during this sweep (a doc claimed a README update that was not there) and corrected here: README now carries the 59-checks line, the 47-route a11y line, and the toolchain note, verified by grep.
- Gates: tsc rc=0 · lint rc=0 (33 accepted react-refresh warnings) · build ✓ · e2e **59/59** · rehearsal unchanged **68/68** · **a11y `--fail`: 0/47**.

### DONE 2026-11-08 — Backlog #7 follow-ons: Production tab · job-costing ledger · private file bucket (branch `arena/bb75f43e-woodex-reimagined`; this PR)

- **Stage 1 — Production tab (payload-only, zero migration).** Per-job five fixed stages (Material prep → Fabrication → Finishing → QC → Dispatch) with per-stage % complete + note and a derived done/in-progress/pending badge; QC gate block (pending/passed/failed select · defect note · inspected-by/at) and a dispatch block (date · vehicle · driver · driver phone · challan ref). QC is **informational** in this slice (enforcement would need a hosted migration). Seeds: Gents Grooming Lounge mid-production (mat-prep 100 · fabrication 75 · finishing 15 · QC pending) · DHA Corporate Tower close-out (all 100 · QC passed by Site engineer 2024-06-02 · dispatch 2024-05-28 · challan `DC-2024-0181` · vehicle WDX-Delivery-04). Demo mirror only — rides `projects.payload`. e2e **61→63/63** (+2).
- **Stage 2 — BOQ actuals + variance (migration `20261107000013_project_actuals.sql` → numbering `0013`, owner-approved costing model `full_ledger`).** Relational ledger: `project_cost_codes` (per-project master; `boq_section` joins payload BOQ sections by name; shop codes LABOR/SUBCON/MISC carry none) + `project_actuals` (amount **GENERATED** `qty*rate`; `source` po|labor|subcontract|manual; `po_ref` free text; composite FK `(project_id, cost_code)` RESTRICT so codes with actuals cannot vanish; `ON DELETE CASCADE` from the job). RLS: read `crm.manage`|`finance.manage` · write `crm.manage` · viewer/anon none. New **Actuals tab** in the practice workspace: planned (payload BOQ) vs actual (ledger) per cost code + grand total, variance chips, cost-code add/delete (delete blocked while actuals reference — FK RESTRICT surfaced as the raw message), inline actual-line add/delete, source select with PO ref. **PO→BOQ allocation stays manual** (owner decision). Demo mirrors the ledger in-memory with seeded lines: Grooming Lounge **Rs 4,958,000** spend vs Rs 7,477,500 plan (walnut +8.8% over BOQ rate) · DHA Tower **Rs 31,845,000** vs Rs 29,925,000 planned (**+Rs 1,920,000 / +6.4%**). Generated DB types hand-extended under the documented no-egress procedure (regenerate to reconcile). Bagisto = 501 stubs. Rehearsal **68 → 82/82** (+14 asserts incl. generated amount, FK RESTRICT, cap matrix).
- **Stage 3 — Real file storage posture (migration `0014`, owner-approved `crm_manage`).** Private `projects` bucket (**50 MB cap**, no MIME allowlist) + `storage.objects` RLS: `crm.manage` read/insert/update/delete only — finance.manage/viewer/anon get **nothing** (deliberately narrower posture). The Files tab gains a real **Upload file** path that exists only under `VITE_API_MODE=supabase` (object `<projectId>/<ts>-<sanitized-name>`; content sniffed into the drawing/image/document/model kind; 50 MB guard client-side); demo keeps simulated metadata-only uploads untouched; Bagisto = 501. Files list now carries optional `storagePath` on payload metadata. Rehearsal storage stub + suite → **93/93** (+11).
- **Migration numbering note:** `0013` = actuals ledger · `0014` = storage bucket+RLS · ad-spend storage stays queued as **`0015`** (owner decision recorded; build starts only after this lands, as its own slice).
- Gates: tsc rc=0 · lint rc=0 (33 accepted warnings) · build ✓ · e2e **63/63** · rehearsal **93/93** · **a11y `--fail` 0/47**.
- **Not done (flagged)** — hosted apply of 0013/0014 (**owner-gated**; needs the deploy runbook, not executed here — this sandbox has no Supabase egress); signed-URL download links in the files list (needs the apply first); QC enforcement of dispatch; PO→BOQ auto-allocation; zone-rate flip (needs the rate sheet — one-UPDATE slice); ad-spend storage (0015).

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
