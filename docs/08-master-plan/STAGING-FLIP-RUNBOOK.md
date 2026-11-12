# STAGING-FLIP RUNBOOK — V5 go-live gate (owner action, Step 4)

Audience: the owner / release operator. **The agent environment that built this has no
egress to Supabase — nothing below has been executed against any hosted project.**
Local evidence that IS available right now:

- `npm run test:rehearsal` → **93 passed, 0 failed** on a fresh pglite — every migration
  `0001…0014` applies clean, catalogue seed applies, RLS matrix for draft orders,
  exchanges/claims, actuals, projects bucket and roles holds (run it again to reproduce).
- `npm run test:ai-eval` → 19/19 (offline sales-agent engine) · `npm run test:payments` → 15/15.
- Demo build (this branch) verified end-to-end via Playwright: e2e 108/108, a11y 0/54.

Every step below is mandatory before the storefront index flips to live data.

Project ref (from `supabase/config.toml`): `ewbflgbshdstfxqretay` — **treat this as the
LIVE project; do the flip against a STAGING copy first and keep prod untouched until §7 passes.**

## 0. Prerequisites (owner)
- A staging Supabase project (free tier is fine) with its own ref + API keys.
- `psql` or the Supabase SQL Editor, and `supabase` CLI logged in.
- A verified backup/restore path you trust (staging is disposable; prod is not).

> **2026-11-13 update — staging creation BLOCKED by plan limit.** Attempting to
> create `woodex-reimagined-staging` (free plan, ap-southeast-1, org `woodex`)
> was rejected: org member `blackibexofficial-blip` has reached the **2 active
> free project** limit. The account currently exposes exactly one project —
> "woodex commad center" (`azdexktqvobrhwjiskrq`, ap-southeast-1,
> ACTIVE_HEALTHY) — which the owner has not positively identified (treated as
> production until ruled otherwise). Note also that `supabase/config.toml`
> references `ewbflgbshdstfxqretay`, a ref that does **not** exist in this
> account. Owner decision required: upgrade the org to Pro (unlocks free staging
> + branches), pause ANOTHER free project (owner action — I will not choose or
> pause projects unilaterally), use a database branch of the existing project
> (only if it is not production-critical and branching is plan-enabled), or skip
> staging (hosted stays UNVERIFIED).

## 1. Apply migrations IN ORDER on staging (SQL Editor or `supabase db push`)
`supabase/migrations/` in lexicographic order — 14 files:

```
20261107000001_agency_os_convergence.sql     20261107000008_draft_orders.sql
20261107000002_page_rpcs.sql                 20261107000009_exchanges_claims.sql
20261107000003_order_submit.sql              20261107000010_convert_draft_order.sql
20261107000004_quote_convert.sql             20261107000011_compare_at_in_payload.sql
20261107000005_shipping_and_rate_limit.sql   20261107000012_admin_overview_quote_status_case.sql
20261107000006_lead_rate_limit.sql           20261108000013_project_actuals.sql
20261107000007_delivery_zones.sql            20261108000014_storage_projects_bucket.sql
```

All 14 are written to be safe on a fresh/converged project (idempotent objects). Do not
reorder, do not skip 0012 (admin_overview casing is load-bearing for the analytics page).

## 2. Apply the catalogue seed ONCE, after migrations
```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
# or paste into the SQL Editor in one go
```
`stock_qty` IS A PLACEHOLDER (100 / 0). Real stock must be reconciled before ANY customer
is charged — see §6.

## 3. Prove the DDL offline, then smoke the staging project
```bash
npm run test:rehearsal        # offline proof — must print 93 passed, 0 failed
STAGING_SUPABASE_URL=https://<staging-ref>.supabase.co \
STAGING_SUPABASE_SERVICE_ROLE_KEY=<service-role JWT> \
node scripts/staging-smoke.mjs
```
`staging-smoke.mjs` is **read-only** (GET only). It re-derives the table set from the
migration files (55 public tables), checks REST reachability, per-table reads with the
service role, and seed counts (`products`/`categories`/`series` > 0). A FAIL anywhere
means stop — fix the staging project, not this script.

## 4. RLS sign-in check (the part a script cannot prove)
On staging, with a **staff** account created in Supabase Auth:
1. Sign in; confirm the admin dashboard reads (`admin_overview` answers, KPIs render).
2. Confirm anon/unauthenticated requests to staff RPCs return 4xx (network tab:
   `admin_overview` without Authorization must be denied).
3. Confirm a viewer-role user cannot read `project_actuals` / `projects` storage rows.
4. Confirm the projects bucket is private and capped at 50 MB.

## 5. Rehearse the flip in a Vercel/preview deploy
Set on the **preview** env (never prod inline): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`,
`VITE_API_MODE=supabase` — the supabase adapter is wired in code (`src/api/supabase.ts`) but has
**never been executed against a hosted project**; the preview walk is its first real run.
Expect surfaces that 501-gate or throw `SupabaseUnsupportedError` (unwired features, below);
log every one you hit — that list is the cutover fix-list, not a surprise.

**What the flip does — and does NOT do.** `VITE_API_MODE=supabase` re-points only the
**admin** plane: the admin adapter (`src/api/supabase.ts`) and the staff sign-in path
(`loginWithSupabase`, Supabase Auth email+password). The **public storefront keeps rendering
the bundled 148-product seed catalogue** (`@/data/products`) — flipping the preview will NOT
make the storefront serve live catalogue rows, and the money path on the storefront still
cannot charge anyone. Do not read a clean preview walk as "the store is live".

**Known unwired surfaces in supabase mode** (by design — these throw
`SupabaseUnsupportedError` or are absent, not faked): companies (B2B master), page folders,
delivery-zone ETA/COD config, `assignMediaToProduct`, `createProduct` / `duplicateProduct` /
`deleteProduct` / `importProductsCsv` (catalogue authoring goes through seed/migrations),
`getChannelSales` (no channel attribution column yet), `resetDemoData` (never destructive),
invoice operations (EF-first; no AdminApi methods). If any of these throw during the walk,
that is the designed behaviour — record it, don't "fix" it during the flip.
Walk the money-path checklist: login → orders → quote WI-10204 prints (75/25 callout,
policy wording, acceptance block) → chat bubble → lead capture → invoice flow.

## 6. Before ANY real charge
- Stocktake: reconcile `products.stock_qty` per SKU (staging smoke only proves rows exist).
- Payment gateway rehearsal in the gateway's sandbox mode (see CREDENTIAL-BLOCKED.md §1).
- Delivery zones: confirm the staging `delivery_zones` rows and courier rates.
- Rotate the service-role key out of this terminal when done (`supabase secrets` / dashboard).

## 7. Flip decision
Only the owner decides. The agent does not deploy, does not apply migrations to prod,
does not edit prod env vars. When the owner says "flip", §1–§6 evidence is the gate.

## 8. Rollback
Preview env: point `VITE_SUPABASE_*` back at the previous values (or remove them → demo
mode ships). Database: restore the pre-flip backup; do NOT hand-edit prod rows to undo
the seed. Migrations are additive-only by design; if one misbehaved, roll forward with a
new migration — never edit an applied file in place.

## 9. What stays UNVERIFIED after this runbook
Hosted behaviour under real traffic, hosted RLS under concurrent staff sessions, webhook
retries, and the AI copilot hosted path — all until observed in staging with the owner.
