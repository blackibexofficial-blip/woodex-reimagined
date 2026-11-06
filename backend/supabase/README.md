# WoodEx Supabase backend (imported module)

This folder vendors the complete Supabase backend contract for the WoodEx admin —
imported from `woodex420/woodex` (`user_input_files/woodex-admin-dashboard` + repo-root
`supabase/`, the same "minimax phase 4" backend our admin upgrade targets). It is the
schema + edge functions the admin's real-data path expects.

Nothing in this folder runs by itself. The live app keeps working fully client-side in
**demo mode**; these files are what you deploy when you are ready to point the admin at a
real Supabase project.

```
backend/supabase/
├── migrations/   15 timestamped SQL migrations (CMS + e-commerce schema, indexes, RLS,
│                 inventory management, WhatsApp CRM) — apply in lexical order
├── tables/       36 reference CREATE TABLE definitions (per-table, convenient for
│                 inspection or manual setup; migrations are the source of truth)
└── functions/    32 Deno edge functions (see list below)
```

> Security note: the import was secret-scanned — no keys were copied. All functions read
> credentials via `Deno.env`. If `woodex420/woodex` was ever made public with real keys
> committed, rotate those keys now.

## 1. Create + link a Supabase project

```bash
# install CLI if needed
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
```

## 2. Apply the schema

Option A (recommended — Supabase CLI): copy `migrations/` into your linked project's
`supabase/migrations/` and run `supabase db push`.

Option B (manual): paste each file under `migrations/` into the Supabase SQL editor in
filename order (they are timestamp-prefixed, so lexical order is correct). Use `tables/`
to diff or to bootstrap individual tables.

Verify afterwards:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;   -- expect ~60+ tables incl.
-- products, categories, orders, order_items, customers, quotations, admin_users,
-- inventory, media_assets, analytics_daily, whatsapp_*, b2b_*
```

## 3. Deploy edge functions

```bash
for dir in backend/supabase/functions/*/; do
  supabase functions deploy "$(basename "$dir")" --project-ref <your-project-ref>
done
```

Secrets used (set with `supabase secrets set KEY=...`):

| Secret | Used by | Needed for |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 29 functions | server-side DB access (auto-provided on hosted Supabase; set it yourself for self-hosted) |
| `STRIPE_SECRET_KEY` | create-payment-intent | online card payments |
| `SENDGRID_API_KEY` | (notifications) | email delivery |
| `ADMIN_EMAIL`, `ADMIN_PHONE` | order-notifications | where order alerts are sent |
| `SUPABASE_URL` | 29 functions | auto-provided on hosted Supabase |

WhatsApp functions additionally expect your WhatsApp Business provider env vars if you
wire them to a real provider; as shipped they log + persist state and can be completed
against Meta's Cloud API.

> `analytics-aggregator` is the intake the admin dashboard stats/free tier are built
> around. NOTE: reference app called it as edge function slug `analytics` — when
> deploying, either deploy it also under that slug (`supabase functions deploy analytics
> --import-map ...` from a renamed copy) or update the caller to `analytics-aggregator`.
> In this repo the admin dashboard reads from the adapter layer instead, so the slug is
> only relevant to the reference app being retired.

## 4. Create the first admin user

```bash
supabase functions invoke create-admin-user --body '{"email":"you@woodex.pk","password":"..."}'
```

or insert into `admin_users` directly (see `tables/admin_users.sql`). The reference
"setup wizard" (`/setup`) does the equivalent from the browser on first run.

## 5. Point the web app at it

Set in `.env` (root of this repo):

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-or-publishable-key>
```

The storefront and admin keep working without this — demo/local data is the default.
With it set, storefront forms (order, quote, contact) write through the adapter and the
admin login page offers **Sign in with Supabase** alongside the demo gate.

## Edge functions inventory

Payments & orders: `create-payment-intent`, `order-notifications`, `order-status-updater`,
`return-processor`
Quotations: `quotation-calculator`, `quotation-generator`, `quotation-pdf-generator`,
`quotation-notifications`, `quotation-crm-sync`, `quotation-status-updater`,
`pricing-calculator`, `delivery-calculator`
Inventory & stock: `inventory-sync`, `inventory-tracker`, `stock-alerts`
Analytics: `analytics-aggregator`, `whatsapp-analytics-aggregator`, `whatsapp-journey-tracker`
WhatsApp CRM: `whatsapp-chat-messages`, `whatsapp-crm-trigger`, `whatsapp-campaign-sender`,
`whatsapp-message-handler`, `whatsapp-appointment-booking`
Provisioning: `create-admin-user`, `create-bucket-{products,media-library,product-images,
blog,quotations,services,testimonials,customer-documents}-temp`

Bucket-creation functions are one-shot helpers ("-temp") — run them once, then delete
them (`supabase functions delete create-bucket-...-temp`).
