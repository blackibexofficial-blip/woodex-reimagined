# 07 · Admin Integration — Storefront ↔ Bagisto

How the WOODEX storefront and the built-in `/admin` panel connect to the Laravel backend
(Bagisto), what is already wired in this repo, and what remains to go live.

Related: `backend/README.md` (server provisioning), `backend/bagisto.env.example` (backend env).

---

## 1. Architecture

```
┌─────────────────────────── this repo (Vite + React SPA) ──────────────────────────┐
│                                                                                  │
│  STOREFRONT (/, /shop, …)                      ADMIN (/admin/*)                  │
│  reads catalogue from src/data/*      ──────►   own auth gate (demo)              │
│  (static today; adapter-ready)                  own layout (no storefront chrome) │
│                                          │                                        │
│                        src/api/  ◄───────┘  adapter factory (getAdminApi)         │
│                        ┌──────────────┬──────────────┐                            │
│                        │ demo adapter  │ bagisto      │                           │
│                        │ (localStorage)│ REST client  │                           │
│                        └──────────────┴──────┬───────┘                            │
└──────────────────────────────────────────────│──────────────────────────────────┘
                                                │ HTTPS
                                ┌───────────────▼────────────────┐
                                │ Bagisto (Laravel) on subdomain  │
                                │  /api/shop/…  X-STOREFRONT-KEY  │
                                │  /api/admin/… Bearer id|token   │
                                │  Admin web UI + Vue dashboard   │
                                └───────────────┬────────────────┘
                                                │
                                            MySQL 8 / MariaDB
```

## 2. What exists today

| Piece | Location | Status |
|---|---|---|
| Typed env config (single source) | `src/config/env.ts` | ✅ done |
| Domain types + adapter contract | `src/api/types.ts` | ✅ done |
| Demo dataset (localStorage, seeded from real catalogue) | `src/api/demo/db.ts` | ✅ live |
| Bagisto REST client (Shop + Admin) | `src/api/bagisto/admin.ts` | ✅ written, activates with `VITE_API_MODE=bagisto` |
| Adapter factory | `src/api/index.ts` → `getAdminApi()` | ✅ done |
| Admin panel UI (dashboard, products, orders, customers, leads, inventory + delivery zones, content, settings) | `src/admin/**` | ✅ live at `/admin` · inventory & delivery zones land with the fulfilment upgrade (demo-backed; Bagisto WMS stubbed) |
| Storefront → admin order capture (checkout) | `Checkout.tsx` → `createOrder` | ✅ verified E2E (WDX-1065 test order) |
| Storefront → admin lead capture (quotation + contact forms) | `Quotation.tsx` / `Contact.tsx` → `createLead` | ✅ verified E2E |
| Backend deployment bundle + runbook | `backend/` | ✅ docs + Docker reference |
| Server-side Bagisto itself | VPS / cPanel | ⏳ you provision (see `backend/README.md`) |
| Leads (quote/B2B) live endpoint | custom Laravel package | ⏳ roadmap (§6) — creates work today via demo/outbox |

## 3. Environment variables

| Variable | Example | Purpose |
|---|---|---|
| `VITE_API_MODE` | `demo` (default) · `bagisto` | Selects the adapter. `static` is reserved for storefront reads. |
| `VITE_BAGISTO_API_URL` | `https://admin.woodex.pk` | Base URL of the Bagisto site (no trailing slash). |
| `VITE_BAGISTO_STOREFRONT_KEY` | `pk_storefront_…` | Public Shop API key (rate-limited, read-mostly). |
| `VITE_BAGISTO_ADMIN_TOKEN` | `3\|abc…` | **SECRET.** Integration token for `/api/admin/*`. Private previews only — see §5. |
| `VITE_BAGISTO_CHANNEL` / `VITE_BAGISTO_LOCALE` / `VITE_BAGISTO_CURRENCY` | `default` / `en` / `PKR` | Store context sent with API calls. |
| `VITE_ADMIN_EMAIL` / `VITE_ADMIN_PASSWORD` | `admin@woodex.pk` / … | Demo `/admin` gate only. Not an auth boundary. Set `VITE_ADMIN_DEMO_HINT=1` to print them on the login screen (off by default). |
| `VITE_SUPABASE_*` | … | Supabase project. Enables the "Sign in with Supabase" tab on `/admin/login`; full backend in `backend/supabase/`. Storefront runtime stays backend-free without it. |

> After pulling admin DB schema changes, reset the demo DB once (`/admin/settings` → *Reset demo
> data*) so categories/media re-seed — existing browsers keep their old `woodex.admin.db.v1`.

`.env.example` documents every variable. Real values for shared servers live in cPanel's env
or your CI secrets — never commit them.

## 4. Mapping: panel action → adapter → Bagisto endpoint

| Storefront action | Adapter method | Bagisto (bagisto-api) endpoint |
|---|---|---|
| Checkout "Place Order" | `createOrder()` | `POST /api/shop/checkout` (best-effort single-shot; verify on staging). Failure → local outbox `woodex.outbox.orders.v1` |
| Quotation / Contact submit | `createLead()` | `POST /api/shop/woodex/leads` (custom package, §6). Failure → local outbox `woodex.outbox.leads.v1` |
| Dashboard KPIs | `getDashboardStats()` | `GET /api/admin/sales/orders` (aggregated client-side; swap for `/reports/*` when confirmed on your version) |
| Revenue chart (30d) | `getRevenueSeries()` | `GET /api/admin/reports/sales/*` (instance-dependent) |
| Products list/edit | `listProducts` / `updateProduct` | `GET/PUT /api/admin/catalog/products[/{id}]` |
| Orders list/detail/status | `listOrders` / `getOrder` / `updateOrderStatus` | `GET /api/admin/sales/orders[/{id}]`, `POST …/{id}/cancel` or `…/state` |
| Customers | `listCustomers` / `getCustomer` | `GET /api/admin/customers/customers[/{id}]` |
| Content (blog/services) | — | Blog: `bagisto/blog` package (optional). Services stay code-managed for now. |
| Store settings | `getSettings` / `saveSettings` | Read: `GET /api/admin/core/config/all`. Write: use Bagisto admin → Configuration. |
| Quote/B2B leads | `listLeads` / `updateLeadStatus` | ❌ no core table — see §6 |

| Categories admin | `listCategories` / `createCategory` / `updateCategory` / `deleteCategory` | ❌ not wired — manage in Bagisto admin → Catalog → Categories (UI shows actionable 501) |
| Media library | `listMediaAssets` / `addMediaAsset` / `deleteMediaAsset` | ❌ demo-only — Bagisto equivalents (storage disk + media API) unwired (UI shows actionable 501) |

Payload shapes are mapped in `mapProduct` / `mapOrder` / `mapCustomer` (`src/api/bagisto/admin.ts`).
Field names in bagisto-api have shifted between 2.x releases — **verify one response per resource
in Swagger (`/api/admin/docs`) after install and adjust the mappers if something looks off.**
Only those three functions usually need touching.

## 5. Security — the one rule that matters

> The Admin API integration token is a master key. In a public build, anyone can extract it.

Acceptable:
- **Private preview / staging only**: ship `VITE_BAGISTO_ADMIN_TOKEN` for your eyes only.
- **Production**: put a tiny proxy in front of Bagisto — e.g. a Laravel route or Node/Express
  middleware on the same host — that attaches `Authorization: Bearer id|token` server-side and
  exposes only the operations the React admin needs. The browser then calls the proxy with the
  staff member's own session (or your existing SSO). The token never leaves the server.
- Always: `APP_DEBUG=false`, IP allowlist on the Integration token, HTTPS only.

The storefront key (`pk_storefront_…`) is designed to be public — it is rate-limited and
read-oriented. Rotating either is one click in Bagisto admin.

## 6. Leads (quote requests & B2B)

The storefront forms (**quotation basket, contact**) now capture leads through the same adapter:
in demo mode they persist to the local demo DB; in bagisto mode they POST to
`/api/shop/woodex/leads` (custom package) and **fall back to the local outbox
(`woodex.outbox.leads.v1`) if the endpoint is missing/unreachable — enquiries are never lost.**

For a full in-admin pipeline you still want the custom Laravel package:
1. **Custom Laravel package** `woodex/leads` inside Bagisto: tables `quote_requests`,
   `b2b_enquiries`; REST endpoints `GET/PATCH /api/admin/woodex/leads[/{id}]` (+ the storefront
   `POST /api/shop/woodex/leads`). ~1 day. Keeps everything in one admin.
2. Keep leads in Supabase (it is already connected): point `/admin/leads` at Supabase tables with
   RLS for staff-read — clean split, zero PHP.
3. Stay in demo mode for leads only (current default) — fully working, browser-local.

The adapter interface already isolates this — whichever you pick implements
`listLeads`/`updateLeadStatus`/`createLead`; no UI changes.

## 7. Go-live checklist (rehearse on staging first)

1. Provision Bagisto + MySQL (see `backend/README.md` §3–§4), run acceptance tests §5.
2. Export `src/data/products.ts` → Bagisto CSV import; verify categories, images, stock.
3. Create Integration token (all permissions or least-privilege custom) with IP allowlist.
4. Local `.env`: `VITE_API_MODE=bagisto` + URL + keys → `bun run build`.
5. Upload `dist/` to the storefront docroot; verify SPA fallback (`public/.htaccess` ships in this repo and is copied into `dist/` — see backend/README §8 for the Nginx equivalent).
6. `/admin` → Settings page shows all four green integration rows; dashboard shows real totals.
7. Rollback anytime: rebuild with `VITE_API_MODE=demo` (storefront never depends on the backend to render).

## 8. Data model mapping (Woodex → Bagisto)

| Woodex (`src/data`) | Bagisto | Notes |
|---|---|---|
| `products[].id` (`chair-…` strings) | numeric `product_id` (keep SKU = Woodex id) | CSV import maps id→sku. |
| `products[].category` (slug) | category slug | create identical slugs. |
| `products[].images[]` | product images | upload to `storage/app/public/product`. |
| `inStock` + pseudo stock | `is_in_stock` + `inventories.qty` | demo seeds stock from a hash; replace with real qty. |
| `rating`, `reviews` | reviews count / average rating | Bagisto reviews populate organically. |
| Cart (`CartContext`) | Shop API cart (`POST /api/shop/cart/…`) | swap `CartContext` internals when live (same interface, async). |
| Checkout (`Contact`/`Checkout` forms) | Shop API checkout (customer address/payment) | COD first; JazzCash/Easypaisa via Bagisto payment packages. |

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `/admin` loads but dashboard shows demo zeros with `VITE_API_MODE=bagisto` | `VITE_BAGISTO_API_URL` wrong or browser mixed-content blocked; check DevTools → Network. |
| 403 on every Admin API call | Integration token missing/inactive/IP-blocked (Bagisto → Settings → Integration). |
| 419 / CSRF | You called Admin API as a browser session; it expects Bearer tokens. Check headers. |
| Products show `id: ""` | Field-name drift in your bagisto-api version — inspect `/api/admin/catalog/products?per_page=1` and adjust `mapProduct`. |
| Leads always empty in bagisto mode | Expected — see §6. Not an error. |

## 10. Supabase path (alternative backend, imported module)

The reference admin (`woodex420/woodex` → `user_input_files/woodex-admin-dashboard`, "minimax
phase 4") talks to Supabase: email/password auth via `admin_users`, products/categories/media
tables, and an edge function for dashboard stats. That backend contract is vendored here at
**`backend/supabase/`** — 15 timestamped migrations, 36 table definitions (reference), and 32
edge functions (orders, quotations, inventory, WhatsApp CRM, provisioning), plus a deploy guide
(`backend/supabase/README.md`).

What this repo does with it today:

- `/admin/login` offers **Supabase Auth** next to the demo gate when `VITE_SUPABASE_URL` +
  `VITE_SUPABASE_PUBLISHABLE_KEY` are set. Create the first admin with
  `supabase functions deploy create-admin-user` (see the deploy guide).
- The `/admin` pages themselves stay on the adapter layer: demo (offline) or Bagisto. The
  reference app's direct table wiring was deliberately NOT ported — it bypasses the adapter
  seam and its `slate-900/blue-600` theme conflicts with the storefront's design system.
- Slug note: the reference calls its stats function slug `analytics`; the shipped folder is
  `analytics-aggregator`. Deploy-time detail only — this repo's dashboard is adapter-driven.
- The reference app also commits `woodex-admin-dashboard/pnpm-lock.yaml`-style artifacts and a
  `link:/tmp/pnpm-store` path dependency; those were not imported.

Go live with Supabase instead of Bagisto: apply `backend/supabase/migrations/` (lexical order),
deploy the edge functions, set `VITE_SUPABASE_*` in `.env`, and replace the relevant adapter
methods in `src/api/` with Supabase implementations (the types in `src/api/types.ts` already
describe everything the UI needs).

### Job-costing ledger & project file bucket (this repo's migrations 0013/0014)

`supabase/migrations/` (0001–0014, apply in lexical order on top of the converged schema) now ends with:

- **`20261107000013_project_actuals.sql`** — `project_cost_codes` + `project_actuals` (relational
  job-costing ledger behind the projects Practice workspace → **Actuals** tab). Planned BOQ still lives
  in `projects.payload`; `boq_section` on a cost code joins the payload by section name. RLS: read
  `crm.manage`|`finance.manage`, write `crm.manage`, viewer/anon nothing. `amount` is GENERATED
  (`qty*rate`). PO→BOQ allocation is manual (owner decision).
- **`20261108000014_storage_projects_bucket.sql`** — private `projects` bucket (50 MB cap) +
  `storage.objects` RLS: `crm.manage` read/write only — finance.manage/viewer/anon get nothing.
  The Files tab shows a real **Upload** control only under `VITE_API_MODE=supabase`.

Both files are **rehearsed offline under pglite** (`npm run test:rehearsal` — 93/93) but have **NOT**
been applied to the hosted project (no Supabase egress in the authoring environment). Hosted apply is
an owner-gated deploy step: apply 0013 then 0014, regenerate
`src/integrations/supabase/types.ts` (`supabase gen types typescript --local` replaces the hand-extended
blocks), and only then enable real uploads/variance there. Demo mode is unaffected either way.

Practice-workspace additions on top of 0013/0014 (same PR): the Production tab gates dispatch client-side —
with QC not passed, the dispatch stage/date/vehicle/driver/phone/challan inputs are disabled, a `role=status`
banner explains why, and saving workspace state that carries dispatch data is refused until QC passes
(server-side enforcement would need a hosted payload trigger — owner sign-off required). The Files tab
renders a signed-URL download button (2-minute TTL) for files whose `storagePath` points into the private
bucket, visible only under `VITE_API_MODE=supabase`.

## 10. Phased roadmap

- **Phase 1 ✅** this integration + offline `/admin` demo.
- **Phase 2** staging Bagisto, catalogue import, token hardening.
- **Phase 3** production cutover (`VITE_API_MODE=bagisto`), leads package or Supabase-leads path.
- **Phase 4** optional TailAdmin staff shell (`staff.woodex.pk`) if bespoke reporting is needed;
  multi-language (ur/en) via Bagisto locales; abandoned-cart automation.
