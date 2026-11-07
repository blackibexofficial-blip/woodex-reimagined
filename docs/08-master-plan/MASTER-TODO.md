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
| Migrations 0001 (agency_os_convergence), 0002 (page RPCs), 0003 (order_submit), 0004 (quote_convert), 0005 (shipping + order rate limit), 0006 (lead rate limit) — applied in order, immutable | rehearsal 36/36 | `supabase/migrations/` |
| Quote price authority = negotiated lines (documented in 0004 header; never re-list-price without owner sign-off) | slice 8 | `0004_quote_convert.sql` |
| 0005 grant matrix: PUBLIC EXECUTE revoked where required; 0006 rebuilt with explicit revoke + defensive `create role service_role` | rehearsal 28/28 → 36/36 | `20261107000006_lead_rate_limit.sql` |
| CI un-red: Lint (listCustomers/getCustomer types, `Record<string,never>` args) — **main green since #12 merge** | run 42390795619 | PR #12 |
| Lead-capture abuse guard (EF: x-forwarded-for key, limiter RPC pre-insert, 429, fail-open logged) | slice 10 | `lead-capture/index.ts` |
| Catalogue seed — 19 categories, 5 series, 148 products, 18 same-origin images; **placeholder stock kept as loud caveat**; idempotent ON CONFLICT | slice 11 (merged #12) | `supabase/seed.sql`, `public/images/seed/` |
| Anti-abuse decision brief (WAF vs Upstash vs Turnstile vs monitoring) | PR #13 (open — see pending) | `docs/08-master-plan/ANTI-ABUSE-DECISION.md` |
| Zone-rate shipping decision brief (recommendation: option B formula-first, seeded at current behaviour) | commit `799691b` | `docs/08-master-plan/ZONE-RATE-DECISION.md` |
| Turnstile anti-bot gate — EFs verify pre-RPC; action-pinned; fail-open when unconfigured, **fail-closed 503 on transport error**; demo/preview builds render nothing; 8/8 `node --test` | slice 12 (PR #14 open — see pending) | `_shared/turnstile.mjs`, EFs, `src/lib/turnstile.ts` |
| Aborts-on-misconfig posture for optional gates; consent contract (`lead-privacy-v1`) byte-locked across clients/EF | slices 3–12 | runbook + EFs |
| Rehearsal harness rebuilt (`/tmp/pglite-hub/run-next.mjs`) — **36/36 PASS** (migrations + seed double-apply + seeded end-to-end order, Rs 52,000 → FREE delivery, stock 100→99). Figures 68/68 & 68/75 **permanently retired** | current | rehearsal harness |
| E2E smoke **42/42 PASS** · eslint 0 errors (34 pre-existing warnings) · tsc rc=0 · build green | per push | CI / local |
| Order intake dual guards: EF → RPC ordering (limiter/challenge before writes) | slices 9/10/12 | EFs |
| `mcp/index.ts` bundler churn reverted before every commit; `sitemap.xml` churn reverted | practice | repo |

**Do not reopen without fresh owner words:** quote pricing authority, dual-source
shipping constants, consent version (`lead-privacy-v1`), seed placeholder-stock
caveat, migration 0001–0006 contents, retired rehearsal figures.

### PENDING — merge / deploy / activate (owner actions, in order)

1. `OWNER` **Merge PR #13** (anti-abuse brief — docs-only). Ships `ANTI-ABUSE-DECISION.md`; required before #14 references resolve.
2. `OWNER` **Merge PR #14** (Turnstile slice 12 + zone-rate brief + this file if merged after this commit). CI green (run 42391538539).
3. `OWNER` **Merge PR #11** (mcp bundler steady-state) if still wanted.
4. `OWNER` **Apply the CI hunk** from `docs/08-master-plan/CI-TURNSTILE-STEP.md` (App lacks `workflows` scope) so CI runs the Turnstile verifier tests.
5. `OWNER` **Hosted deploy** via `docs/08-master-plan/HOSTED-DEPLOY-RUNBOOK.md`: migrations 0001→0006 in order → **§1a seed** → deploy EFs → set env (`VITE_API_MODE=supabase`, `VITE_TURNSTILE_SITE_KEY`) → **physical stocktake before any real order** (placeholder `stock_qty` = 100/0 is fiction) → smoke §6 (incl. Turnstile path) → §8 sign-off.
6. `OWNER` **Turnstile activation**: create site/secret pair → `supabase secrets set TURNSTILE_SECRET=…` → `VITE_TURNSTILE_SITE_KEY=…` → redeploy EFs → rebuild web. Until both sides set, gate is inert (fail-open) — checkout unchanged.

### PENDING — decisions required (owner; I prepare, you call)

7. `DECISION` **Zone-rate pricing** — pick A (keep flat) or B (city-tiered zones, machinery-first, all-2500 seed → owner flips rates when ops supplies the sheet; migration 0007). See `ZONE-RATE-DECISION.md` §5 questions (tier boundaries, free-threshold global vs per-tier, admin screen now/later, rate owner).
8. `DECISION` **WAF / Upstash** — brief recommends Turnstile (done) + monitoring now; WAF proxy **held in reserve**; Upstash deferred behind explicit **fail-open vs fail-closed** call. Also name the **monitoring alert recipient** (unused so far).
9. `DECISION` **Stocktake** — when and who counts the physical inventory before go-live (feeds `seed.sql` stock or a post-seed `UPDATE`).

### PENDING — engineering slices (agent-ready once authorised)

10. `READY` **Zone-rate slice** (if B approved): migration `20261107000007_delivery_zones.sql` (table + all-2500 seed incl. `default` row), `order_submit` re-definition with city lookup (replay unchanged), `src/config/shipping.ts` re-seeded from same snapshot, rehearsal extended, runbook/plan updated.
11. `READY` **Wave 2 — draft orders** (if authorised): `draft_orders` table + admin draft-orders screen + adapter wiring; rehearsal; **convertDraftOrder → server-side reprice boundary** stays design-faithful (no client prices trusted).
12. `READY` **Wave 3 — singleton resets** (homepage/singleton content reset in supabase adapter) with rehearsal coverage.
13. `BLOCKED` **Wave 2b — exchanges / claims backend** — tables do not exist yet; requires schema decision (partially blocked by Wave 2).
14. `BLOCKED` **`convertDraftOrder` EF wiring** — conversion must reprice via order-submit path; blocked on 11.

### HOLD — deliberately parked

15. `HOLD` **Zone-rate admin screen** — SQL edits acceptable at current volume; revisit when ops edits zones weekly.
16. `HOLD` **True courier-API freight pricing** (PostEx/Leopards/TCS) — rejected at this stage (no contracts/SLA data; not verifiable in sandbox). Trigger: real freight invoices in hand.
17. `HOLD` **Zone-rate for quote-converted orders** — intentionally quote-shipping; do not migrate.
18. `HOLD` **"68/75" rehearsal figure / pre-reset harness** — retired; never cite.

---

## Track B — woodex-2030 dashboard (`woodex420/woodex-2030`, `apps/dashboard`)

Analysis 2026-11-07, all 23 pages cross-checked against their data source
(full report in chat; this section is the actionable remainder).

### FROZEN / HOLD — do not reopen

- Live modules wired to `/api/*` with realtime refresh: **Catalog, ProductDetail, ProductEditor, Orders, OrderDetail, Invoices (incl. payments + quote→invoice), Clients, CRM (leads + site-visits), Quotations (list/builder/versions), Tasks, Inbox (omnichannel WhatsApp/email/phone), Marketing, Ecommerce, Operations (+ ReturnsPanel), Website (page builder), ThemeStudio, TeamCard (Settings — live `/api/users`).** These work; leave them alone.
- `Placeholder.tsx` pattern is the correct empty-state for unbuilt modules — reuse, don't redesign.

### PENDING — prioritised (greatest first)

| P | Item | File(s) | Effort | Depends on |
|---|---|---|---|---|
| 1 | **Analytics page is 100% mock** — campaigns, conversionTrend, leadSources, revenueSeries hardcoded (`money(4642000)`, `trend: 18.2`); date-range Select inert; Export = `window.print()`. Zero backend calls. | `Analytics.tsx` | M (backend `/api/analytics` first, then wire) | Backend endpoint decision |
| 2 | **Projects module is 100% mock** — projects/boq/milestones/projectFiles fiction; "New project wizard (Phase 4)" is a toast stub; BOQs and zones shown as data. | `Projects.tsx` | L | Phase 4 scope sign-off |
| 3 | **Live dashboard leaks mock rows** — `OpsStatusRow` stage bars + pipeline bars from mock; `ActivityFeed` splices mock activity into the real feed (`[...live, ...activity].slice(0,7)`); revenue line chart on mock `revenueSeries`. | `components/dashboard.tsx`, `Dashboard.tsx` | S–M | `/api/stats` extension or mock deletion |
| 4 | **Settings governance toggles don't persist** — fake "Setting saved" toast; workspace fields uncontrolled; hardcoded team list duplicates live TeamCard (drift risk). | `Settings.tsx` | S | Settings persistence endpoint |
| 5 | **`/support` placeholder route** — visible dead end in the Service nav; "Phase 4 (Business Pack)". | `App.tsx`, `Placeholder.tsx` | M–L | Phase 4 |
| 6 | **Category administration not modeled** — ProductEditor datalist is derived from products only; no category CRUD. | `ProductEditor.tsx` | M | Category schema decision |
| 7 | **Demo credentials printed on Login** (`admin`/`admin`) | `Login.tsx` | S | Remove before any shared deploy |
| 8 | **Revenue chart in Dashboard on mock series** | `Dashboard.tsx:20` | S | Same as #3 |

### Track B HOLD

- **Phase 4 Business Pack** (Support/After-Sales, Projects BOQ) — parked until owner signs Phase 4 scope. Trigger: Phase 4 kick-off.
- **UIComponents page** — internal UI-kit showcase; keep but consider removing from production nav. Trigger: nav/usage review.
- **Login retry loop** ("API hot-restarting") — preview-watcher oriented; harmless for the dev target. Trigger: production auth hardening pass.

---

## MASTER ORDER OF WORK — greatest-complete first

1. **Track A #1→#4** (merges 13/14/11 + CI hunk) — unblocks the truth-in-main and CI coverage. *Owner, ~30 min.*
2. **Track A #9 + #5 (stocktake, then deploy)** — only now may real money move. Everything above this line protects launch honesty.
3. **Track A #6 Turnstile activation** (30 min, both keys) — checkout fraud gate goes live.
4. **Track A #7 zone-rate decision** — if "B", I build migration 0007 (one focused slice; the only open money-path engineering).
5. **Track A #8 WAF/Upstash + monitoring recipient** — closes the anti-abuse loop; I then write the Upstash slice only if you approve fail-closed/open explicitly.
6. **Track A #10→#14** (0007 / Wave 2 draft orders / Wave 3 singleton resets / exchanges backend) — next code phases, in this order.
7. **Track B #1 (Analytics)** — biggest lie-per-pixel in the 2030 panel; first Track B code item once its backend shape is agreed.
8. **Track B #3 → #4 → #7 → #2/#5/#6/#8** — mixed truth cleanup, settings honesty, login hygiene, then Phase 4 scope.

### Completed this cycle (for the record — frozen)

PR #10 (checkout+admin money path, merged), PR #12 (CI un-red + migration 0006 + catalogue seed, **merged 2026-11-07**), PR #13 (anti-abuse brief, open), PR #14 (Turnstile slice + zone-rate brief + this master plan, open), rehearsal 36/36, e2e 42/42, catalogue seed, zone-rate brief.

*Track B figures come from read-only API/content inspection on 2026-11-07 (no repo writes made). Track A evidence lives in the repo: `supabase/migrations/*`, `docs/08-master-plan/*`. Nothing anywhere has run against a hosted Supabase project — every "works" above means "rehearsed + typechecked + e2e", not "deployed and proven".*
