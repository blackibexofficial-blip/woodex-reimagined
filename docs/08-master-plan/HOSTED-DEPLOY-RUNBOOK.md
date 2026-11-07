# Hosted Deploy Runbook — Agency OS money path (owner action)

Audience: the owner / release operator. The agent environment that produced this code
has **no egress to Supabase** (HTTP 000) — nothing here has ever run against a hosted
project. Rehearsal evidence (`pglite`, 36/36, migrations 0001–0006 + catalogue seed,
including idempotent double-apply) proves the DDL and RPC behavior locally only. Every step below is mandatory before the storefront is allowed to charge anyone real money.

Project ref (from `supabase/config.toml`): `ewbflgbshdstfxqretay`

## 0. Sanity gates before you start
- You are deploying from the exact commit the owner approved (this runbook currently
  ships from `arena/68ecf14d-woodex-reimagined` — PRs #11/#12).
- Local preview runs in **demo** mode — it does not prove anything about Supabase.

## 1. Apply migrations IN ORDER (SQL Editor or `supabase db push`)
1. `supabase/migrations/20261107000001_agency_os_convergence.sql`
2. `supabase/migrations/20261107000002_page_rpcs.sql`
3. `supabase/migrations/20261107000003_order_submit.sql`
4. `supabase/migrations/20261107000004_quote_convert.sql`
5. `supabase/migrations/20261107000005_shipping_and_rate_limit.sql`
6. `supabase/migrations/20261107000006_lead_rate_limit.sql`
7. `supabase/migrations/20261107000007_delivery_zones.sql`
8. `supabase/migrations/20261107000008_draft_orders.sql`
9. `supabase/migrations/20261107000009_exchanges_claims.sql`

All nine are written to be safe on a fresh/converged project. Verify after applying:

```sql
-- objects exist
select to_regprocedure('public.order_submit(jsonb,jsonb,text,text)'),
       to_regprocedure('public.quote_convert(text,text)'),
       to_regprocedure('public.page_publish(text,text,text)');
-- column present
select column_name from information_schema.columns
 where table_schema='public' and table_name='orders' and column_name in ('client_ref','sales_channel_id');
-- seed integrity: orders WDX refs unique-ish, products seeded
select count(*) from public.products;   -- expect 148 after §1a seed
select count(*) from public.categories; -- expect 19
select count(*) from public.series;      -- expect 5
```

## 1a. Apply the catalogue seed (ONCE, after migrations)
The repository carries a generated catalogue at `supabase/seed.sql` (~148 products,
19 categories, 5 series, `ON CONFLICT DO NOTHING`, single transaction). Without it the
products table is EMPTY and every storefront order fails with "product not found".

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
# or paste the file into the SQL Editor in one go
```

⚠ **stock_qty IS A PLACEHOLDER (100 for in-stock rows, 0 otherwise).** The catalogue
has no real inventory. Before this storefront charges anyone, run a physical stocktake
and reconcile `stock_qty` per SKU — otherwise checkout will happily sell up to 100
units of everything ever listed. The same warning is repeated in the seed header.

⚠ **SKUs are synthetic** (`WK-<UPPERCASE-PRODUCT-ID>`) — the source catalogue carries
no SKU field. Renaming them later is data-safe (SKU is opaque downstream) but must be a
deliberate data migration, not an ad-hoc edit.

⚠ Images are referenced same-origin under `/images/seed/*.webp`; those files ship in
this repo (`public/images/seed/`) and must be deployed with the app or every product
photo 404s.

Note: 0007 is an additive ALTER of the delivery_zones table created in 0001 (zone machinery for option B of the zone-rate brief). Seeded rows clone CURRENT behavior exactly (Rs 2,500 / FREE at Rs 50,000) — applying it changes nothing until you UPDATE rates.

Note: 0008 (draft orders) and 0009 (exchanges + claims, incl. the record_order_event RPC) add new staff-only surfaces — no storefront behavior change. Identity sequences start at 1001 so draft refs read DRF-1001+.

## 2. Deploy edge functions
The two public intake functions import the shared Turnstile verifier
(`supabase/functions/_shared/turnstile.mjs`) — deploy from this repo as usual; relative
imports bundle automatically. The EF-side gate is inert until TURNSTILE_SECRET is set.
```
supabase functions deploy admin-bootstrap
supabase functions deploy lead-capture     # MUST redeploy — previously returned {ok} only
supabase functions deploy order-tracking
supabase functions deploy order-submit     # public checkout path; verify_jwt=false is intentional
```
`supabase/config.toml` already carries `verify_jwt=false` for the public three
(lead-capture, order-tracking, order-submit, admin-bootstrap). Do **not** add
"auth-required" deploys for them — self-verification happens inside the RPCs.

## 3. Set function secrets
```
supabase secrets set ADMIN_BOOTSTRAP_SECRET='<long random string — NOT committed anywhere>'
# Optional but recommended (slice 12): EFs fail OPEN (log) without it. When set, ALSO set
# VITE_TURNSTILE_SITE_KEY for the web build — configure both sides together.
supabase secrets set TURNSTILE_SECRET='<from Cloudflare Turnstile dashboard>'
```
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are reserved and
auto-injected by the platform; `order-submit` / `lead-capture` need nothing else.

## 4. Bootstrap the first admin (once)
```
curl -sS -X POST "$SUPABASE_URL/functions/v1/admin-bootstrap" \
  -H 'content-type: application/json' \
  -d '{"secret":"<ADMIN_BOOTSTRAP_SECRET>","email":"<owner email>","password":"<strong>","name":"<owner name>"}'
```
Confirm against `supabase/functions/admin-bootstrap/index.ts` for the exact accepted
body before sending; then sign in at `/admin/login` and confirm identity + caps.

## 5. Flip the app
Production/preview env (`.env` / hosting env):
```
VITE_SUPABASE_URL=https://ewbflgbshdstfxqretay.supabase.co
VITE_SUPABASE_PROJECT_ID=ewbflgbshdstfxqretay
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
VITE_API_MODE=supabase
# optional anti-bot (must match TURNSTILE_SECRET on the EFs):
VITE_TURNSTILE_SITE_KEY=<your site key>
```
Rebuild (`npx vite build --mode production`) and redeploy. Storefront and admin must be
rebuilt with these at build time — `import.meta.env` is baked in.

## 6. Smoke tests (in this order; stop on any failure)
1. **Admin read**: `/admin` → dashboard loads; Orders list; Products (not empty).
2. **Lead capture**: submit the public Contact enquiry form → admin Leads shows it
   (source `storefront`, consent + UTM attributable) — confirms lead-capture `{ok,id}`.
3. **Tracking**: `/order-tracking` with a bogus ref returns "not found" — no data leak.
4. **Order E2E**: place a real (test product, tiny total) order via storefront checkout (if Turnstile is configured, the invisible challenge runs automatically — confirm the order still completes)
   (or `curl order-submit`). Verify: `201 ok:true` → admin Orders shows `WDX-####` with
   **server-recomputed totals** and **shipping = Rs 2,500 flat (Rs 0 when subtotal ≥ Rs 50,000)**;
   product `stock_qty` decremented; a `stock_movements` `sale` row; `order_events` stage:intake.
   Twenty rapid repeated submissions from one connection return `429` with a clean error body.
5. **Replay**: repeat the same checkout request (same `clientRef`) → same `WDX-` ref, no double stock decrement (orders count unchanged).
6. **Quote convert**: admin → accepted quote → Convert to order → quoted lines + negotiated
   total; quote flips to `converted`; re-click Convert returns nothing/converted without a new order.
7. **RLS spot checks** (SQL editor): `set role anon; select * from orders;` → 0 rows / permission denied;
   `select public.order_submit('[{"productId":"nope","quantity":1}]', '{"name":"t","phone":"p","city":"c","paymentMethod":"cod"}', null, null);` → error, nothing written.

## 7. Rollback
Revert the deploy: set `VITE_API_MODE=demo` (or the previous `bagisto` config),
rebuild, redeploy. The database keeps everything; orders/quotes remain in Supabase for a
later retry. Rollback does NOT require dropping any migration.

## 8. Known limits / honest gaps after this deploy
- Delivery fee is the **flat rule mirrored from checkout** (Rs 2,500 flat; FREE at ≥ Rs
  50,000 cart subtotal) — enforced server-side, now **looked up from `delivery_zones`
  (migration 0007, seeded byte-identical to the flat rule; Rs 2,500 / FREE at Rs 50,000 everywhere)**
  and mirrored in `src/config/shipping.ts`. Quote-converted orders carry the quote's own shipping instead.
  Zone machinery is live server-side but DORMANT — rates are owner data, not code. Flip them
  with an UPDATE when ops supplies the rate sheet (see `docs/08-master-plan/ZONE-RATE-DECISION.md`;
  recommendation: stay seeded-uniform until then).
- Customer notes live in `order_events` (staff timeline) — they are **not** visible to the
  storefront and were never intended to be.
- `order-submit` now carries a **fixed-window guard inside the RPC**: 20 submissions
  per 10 minutes per caller key (edge `x-forwarded-for`, stamped server-side inside the EF —
  client-sent keys are discarded). It is a spoofable FIRST line, not a sovereign wall, by
  design (the EF must stay lean).
- `lead-capture` now calls service-role RPC `lead_rate_limit_hit` (migration 0006) BEFORE the
  insert: same fixed window — 20 / 10 min per edge caller key; `PUBLIC` execute is revoked,
  only `service_role` may invoke it. On limiter-RPC failure the EF **fails OPEN** (logs) so a
  missing migration degrades to pre-limiter behavior instead of silently dropping leads.
- PRODUCT DECISION STILL OPEN for both: WAF rule or an Upstash-backed global counter before
  real traffic — these guards protect stock counts and lead spam, they are not complete
  anti-abuse systems.
- `convertDraftOrder` and `exchanges/claims` remain unwired by design (Wave 2: tables missing).
- The conversion price authority model (negotiated quote lines) is intentional and documented
  in migration `0004`'s header — do not "fix" it to re-list-price without owner sign-off.
- Seed stock is synthetic (see §1a). Until a stocktake is done, treat every seeded
  `stock_qty` as a lie and every seeded SKU as temporary.
- **Turnstile gate (slice 12):** `order-submit` and `lead-capture` verify the challenge
  BEFORE any RPC/limiter spend (`_shared/turnstile.mjs`, 8/8 `node --test`). Posture: secret
  unset → fail OPEN (log); secret set → token required (invalid → 403); Cloudflare transport
  error → 503 fail-CLOSED. Demo/preview builds render nothing. **NOT verified hosted**
  (egress 000) — verify path is mocked-tests only until you run §2/§3/§5 against the project.
  WAF / Upstash remain OPEN — see `docs/08-master-plan/ANTI-ABUSE-DECISION.md` (this file lands
  via the anti-abuse docs PR; the code here does not depend on it).
- Local evidence only (36/36 rehearsal, seed included). A fresh pair of eyes on this
  runbook before a real-money deploy is strongly advised.
