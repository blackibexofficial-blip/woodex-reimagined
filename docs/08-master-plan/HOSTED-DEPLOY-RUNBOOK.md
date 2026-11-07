# Hosted Deploy Runbook — Agency OS money path (owner action)

Audience: the owner / release operator. The agent environment that produced this code
has **no egress to Supabase** (HTTP 000) — nothing here has ever run against a hosted
project. Rehearsal evidence (`pglite`, 68/68) proves the DDL and RPC behavior locally
only. Every step below is mandatory before the storefront is allowed to charge anyone real money.

Project ref (from `supabase/config.toml`): `ewbflgbshdstfxqretay`

## 0. Sanity gates before you start
- You are on branch `arena/bb519cda-woodex-reimagined` and PR #10 is merged into `main`
  (or you are intentionally deploying from this branch).
- Local preview runs in **demo** mode — it does not prove anything about Supabase.

## 1. Apply migrations IN ORDER (SQL Editor or `supabase db push`)
1. `supabase/migrations/20261107000001_agency_os_convergence.sql`
2. `supabase/migrations/20261107000002_page_rpcs.sql`
3. `supabase/migrations/20261107000003_order_submit.sql`
4. `supabase/migrations/20261107000004_quote_convert.sql`

All four are written to be safe on a fresh/converged project. Verify after applying:

```sql
-- objects exist
select to_regprocedure('public.order_submit(jsonb,jsonb,text,text)'),
       to_regprocedure('public.quote_convert(text,text)'),
       to_regprocedure('public.page_publish(text,text,text)');
-- column present
select column_name from information_schema.columns
 where table_schema='public' and table_name='orders' and column_name in ('client_ref','sales_channel_id');
-- seed integrity: orders WDX refs unique-ish, products seeded
select count(*) from public.products;   -- expect the seed catalogue
select count(*) from public.categories;
```

## 2. Deploy edge functions
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
```
Rebuild (`npx vite build --mode production`) and redeploy. Storefront and admin must be
rebuilt with these at build time — `import.meta.env` is baked in.

## 6. Smoke tests (in this order; stop on any failure)
1. **Admin read**: `/admin` → dashboard loads; Orders list; Products (not empty).
2. **Lead capture**: submit the public Contact enquiry form → admin Leads shows it
   (source `storefront`, consent + UTM attributable) — confirms lead-capture `{ok,id}`.
3. **Tracking**: `/order-tracking` with a bogus ref returns "not found" — no data leak.
4. **Order E2E**: place a real (test product, tiny total) order via storefront checkout
   (or `curl order-submit`). Verify: `201 ok:true` → admin Orders shows `WDX-####` with
   **server-recomputed totals**; product `stock_qty` decremented; a `stock_movements`
   `sale` row; `order_events` stage:intake; the quote page shows nothing leaked to anon.
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
- `shipping` is stored as **0** until a zone-rate EF exists; ops treats orders as
  "shipping resolved at dispatch" responsibility. Do not quote delivery fees from totals.
- Customer notes live in `order_events` (staff timeline) — they are **not** visible to the
  storefront and were never intended to be.
- No rate limiting on `order-submit` / `lead-capture` yet — add per-IP counters
  (e.g. Upstash) or a WAF rule before real traffic; monitor both functions meanwhile.
- `convertDraftOrder` and `exchanges/claims` remain unwired by design (Wave 2: tables missing).
- The conversion price authority model (negotiated quote lines) is intentional and documented
  in migration `0004`'s header — do not "fix" it to re-list-price without owner sign-off.
- Local evidence only (68/68 rehearsal). A fresh pair of eyes on this runbook before a
  real-money deploy is strongly advised.
