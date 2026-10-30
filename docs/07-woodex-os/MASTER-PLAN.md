# WOODEX OS — Master Plan

**Version:** 1.0 (proposal) · **Date:** 31 October 2026
**Scope:** Turn the WOODEX storefront into a live commerce platform backed by a Laravel **WOODEX OS**, adopting an open-source commerce engine instead of building one from scratch.
**Companion docs:** [`PLATFORM-EVALUATION.md`](./PLATFORM-EVALUATION.md) · [`openapi.yaml`](./openapi.yaml) · [`REPO-INTAKE.md`](./REPO-INTAKE.md)

---

## 1. Executive summary

WOODEX already owns a credible storefront (this repo: 23 routes, 148 products, dual cart/quote funnels) and
three unfinished backends (Supabase, Express+SQLite, a private Laravel OS). The missing piece is not UI or
ideas — it is **one system of record** plus an **API contract** the storefront can trust.

**Recommendation**

1. **Make WOODEX OS the single system of record** — Laravel 13 / PHP 8.4 / MySQL 8.
2. **Adopt Bagisto 2.5 (MIT) as the commerce core** inside it, plus the **free Bagisto B2B suite** for
   company accounts, RFQ, quotation negotiation, credit limits and purchase orders.
3. **Build only what is genuinely WOODEX** as custom Laravel packages: 75/25 quote advances, custom
   manufacturing jobs, projects/portfolio, room packages, materials library, showroom appointments,
   WhatsApp hub, Pakistan payments, KPI dashboard.
4. **Publish one API façade `/api/v1`** (REST + webhooks) consumed by the storefront, the admin and a future
   mobile app. The storefront stops importing `src/data/*` and reads the API instead.
5. **Decommission** the Supabase/Express experiments after a one-time data migration — not before.

**Why not Medusa:** it is an excellent engine, but it is Node/Postgres, its B2B quotes/companies are a
starter template you must own, and its RBAC/SSO are paid Enterprise features. It would add a second runtime
beside the Laravel OS the business has already chosen. Details and evidence: [`PLATFORM-EVALUATION.md`](./PLATFORM-EVALUATION.md).

**Effort:** ~19–21 weeks with two developers (1 Laravel, 1 React), ~8–10 months solo. Phase 1 delivers a
live, API-driven storefront in ~6 weeks.

---

## 2. Status and the one blocker

| Item | Status |
|---|---|
| Storefront (this repo) | ✅ Runs, builds, 23/23 routes render |
| API contract | 🟡 Drafted in [`openapi.yaml`](./openapi.yaml) — not implemented |
| WOODEX OS source (`woodex420/woodexinterior`) | ❌ **Unreachable (404)** — see below |
| Legacy Supabase backend | ✅ Readable, 45 tables / 32 edge functions — migration source |
| Commerce engine | ⬜ Chosen (Bagisto 2.5) — not installed |
| Secrets hygiene | 🔴 Historical secret exposure — rotate first |

### Unblocking the OS repo (pick one)

| Option | What you do | What I can do next |
|---|---|---|
| **A. Make it public** | GitHub → repo → Settings → Danger Zone → Change visibility | Clone, inventory routes/models/migrations, produce the import diff |
| **B. Grant access** | Add `blackibexofficial-blip` as a collaborator (read) | Same as A |
| **C. Send an archive** | Upload a zip (or `git bundle`) into this workspace | Same as A, offline |
| **D. Proceed without it** | Confirm the plan below | I generate a new Laravel skeleton and port modules as they are described |

An SSH host-key fingerprint cannot substitute for A–C: it authenticates a *host*, and this environment can
only reach GitHub over HTTPS with the token it already has.

---

## 3. Current state — verified inventory

### 3.1 Repositories

| Repo | Stack | What is real | Role in the plan |
|---|---|---|---|
| `blackibexofficial-blip/woodex-reimagined` (this) | React 18 · Vite 5 · TS · Tailwind 3 | 23 routes, 148 products, cart + quote contexts, all static data | **Storefront** to wire to the API |
| `woodex420/woodex` @ `woodex-admin` | React + Vite | 13 admin pages, 5,350 LOC, Supabase Auth | **UX reference** for OS screens |
| ↳ `supabase/` | PostgreSQL + Deno | 45 tables, 106 RLS policies, 32 edge functions (26 never called) | **Data source** to migrate |
| `woodex420/woodex-2030` @ `arena/01a10a97…` | Express + `node:sqlite` + 2 React apps | Working API with leads/quotes/orders, 55 tests | **Reference implementation** of the flows |
| `woodex420/woodex-2030` @ `arena/01a1087c…` | Docs | Oct-2026 master plan (37 KB) | Historical context |
| `woodex-int/*`, `agent.woodex` | Next.js + Sanity | Marketing site / CMS experiments | Not in scope |
| `woodex420/woodexinterior` | **unknown** | **unreadable** | WOODEX OS — import blocked |

### 3.2 Data we must carry over

From the Supabase schema: `profiles`, `admin_users`, `user_permissions`, `products`, `product_variants`,
`categories`, `inventory`, `stock_movements`, `media_assets`, `pricing_rules`, `customers`,
`customer_addresses`, `customer_interactions`, `b2b_companies`, `b2b_users`, `quotations`, `quotation_items`,
`quotation_activities`, `quotation_templates`, `orders`, `order_items`, `order_status_history`, `cart_items`,
`deliveries`, `delivery_zones`, `returns`, `whatsapp_*` (7 tables), `virtual_rooms`, `collaboration_sessions`,
`room_packages`, `blog_posts`, `services`, `testimonials`, `faqs`, `analytics_daily`.

Plus the storefront's static content: 148 products, 28 subcategories, 5 series, 16 materials, 7 services,
6 blog posts, 7 projects, 6 room packages, 25 SEO blocks.

---

## 4. Target architecture

```
                     ┌───────────────────────────────────────────────┐
  customer  ────────▶│ Storefront  (React 18 SPA → Next.js in P3)    │
                     │ • catalog, configurator, quote basket, cart   │
                     └───────────────┬───────────────────────────────┘
                                     │ HTTPS · /api/v1 (REST, JSON)
                     ┌───────────────▼───────────────────────────────┐
  staff     ────────▶│ WOODEX OS  — Laravel 13 · PHP 8.4             │
                     │ ┌───────────────────────────────────────────┐ │
                     │ │ Commerce core — Bagisto 2.5 (MIT)         │ │
                     │ │ catalog · inventory · cart · checkout ·   │ │
                     │ │ orders · invoices · shipments · RMA       │ │
                     │ ├───────────────────────────────────────────┤ │
                     │ │ B2B suite — bagisto/b2b-suite (MIT)       │ │
                     │ │ companies · users · RFQ · quotations ·    │ │
                     │ │ credit · purchase orders · req. lists     │ │
                     │ ├───────────────────────────────────────────┤ │
                     │ │ WOODEX modules (custom packages)          │ │
                     │ │ quote advances · manufacturing · projects │ │
                     │ │ showrooms · materials · WhatsApp · KPIs   │ │
                     │ └───────────────────────────────────────────┘ │
                     │  Sanctum auth · queues · scheduler · outbox   │
                     └───────┬───────────────┬───────────────┬───────┘
                             │               │               │
                     ┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼────────┐
                     │ MySQL 8      │ │ Redis       │ │ Object storage│
                     │ (system of   │ │ cache+queue │ │ products, PDFs│
                     │  record)     │ │             │ │ (S3 / R2)     │
                     └──────────────┘ └─────────────┘ └───────────────┘
                             │
        ┌────────────────────┴──────────────────────────────┐
        │ Integrations: Safepay/JazzCash/easypaisa, WhatsApp │
        │ Cloud API, SMTP (Resend/Brevo), Google Analytics 4 │
        └────────────────────────────────────────────────────┘
```

**Principles**

1. One database, one auth system, one deploy.
2. The storefront never talks to the database; only to `/api/v1`.
3. Every write that has a side effect (payment, WhatsApp, PDF) goes through a queued job with retries and an
   audit row — never inline in a request.
4. Money is integer PKR paisa-free (whole rupees) stored as `BIGINT`; never floats.
5. Every public endpoint is cacheable and rate-limited.

---

## 5. Domain model

### 5.1 Mapping legacy tables → new home

| Legacy (Supabase) | New home | Notes |
|---|---|---|
| `products`, `product_variants` | Bagisto `products` + configurable variants | Series → attribute; material/colour → variant axes |
| `categories` | Bagisto `categories` (nested set) | 2 groups / 28 subcategories preserved |
| `inventory`, `stock_movements` | Bagisto inventory + inventory sources | Add Lahore workshop + showroom sources |
| `pricing_rules` | Bagisto catalog/cart rules + price lists | B2B tier pricing via company catalogs |
| `customers`, `customer_addresses` | Bagisto `customers` + addresses | Guest checkout allowed for B2C |
| `b2b_companies`, `b2b_users` | `bagisto/b2b-suite` companies/users/roles | Credit limits + sales reps native |
| `quotations`, `quotation_items`, `quotation_activities` | WOODEX `quotes` module **+ B2B suite RFQ** | Keep both: RFQ for self-serve, OS quotes for sales-led |
| `orders`, `order_items`, `order_status_history` | Bagisto orders + custom status timeline | 75/25 advance tracked on the order |
| `deliveries`, `delivery_zones` | Bagisto shipments + custom zones | Installation team scheduling in OS |
| `returns` | Bagisto RMA | |
| `whatsapp_*` (7) | WOODEX `whatsapp` module | Cloud API webhook + templates + conversation store |
| `virtual_rooms`, `collaboration_sessions`, `room_packages` | WOODEX `showroom` + `packages` modules | Bundle products for packages |
| `blog_posts`, `services`, `testimonials`, `faqs` | WOODEX `content` module (CMS) | Must stay SEO-addressable |
| `analytics_daily` | OS `metrics` module (materialised) | Dashboard KPIs |

### 5.2 WOODEX-specific tables (new)

```
companies(id, name, ntn, credit_limit, payment_terms, sales_rep_id, status, ...)      -- provided by b2b-suite
quotes(id, no, company_id, customer_id, status, currency, subtotal, discount, tax,
       total, advance_pct, advance_amount, balance_amount, valid_until, pdf_path,
       accepted_at, converted_order_id)
quote_items(id, quote_id, product_id, variant_id, description, qty, unit_price, line_total)
quote_events(id, quote_id, actor, action, payload_json, created_at)                   -- audit trail
manufacturing_jobs(id, order_id, bom_id, stage, workshop, started_at, due_at, qc_status)
bom_items(id, job_id, material_id, qty, unit, wastage_pct)
materials(id, name, family, hex, brightness, image_path, cost_per_sqft)
projects(id, slug, client, category, location, sqft, cover_path, body, published_at)
showrooms(id, name, city, address, phone, map_url, hours_json)
appointments(id, showroom_id, customer_id, slot_at, status, notes)
whatsapp_messages(id, wa_id, direction, template, body, status, meta_json)
notifications(id, channel, recipient, template, payload_json, sent_at, error)
```

---

## 6. Commerce flows

### 6.1 B2B: quote-first (the 60% revenue path)

```
Enquiry/lead ─▶ RFQ (self-serve) or OS quote (sales-led)
   │                 │
   │                 ├─ draft ─▶ submitted ─▶ under_review ─▶ negotiated (n×)
   │                 └─ approval (company admin / sales manager)
   ▼                                            │
accepted ─▶ proforma invoice ─▶ 75% advance ─▶ manufacturing job ─▶ QC
   │                                                              │
   └────────────── balance invoice (25%) ◀── shipped ◀── installed ◀┘
```

**State machine (quotes):** `draft → submitted → under_review → negotiated → accepted | rejected | expired → converted_to_order`.
**Rules:** quote number `WQ-YYYY-####`; validity default 14 days; every mutation writes a `quote_events` row;
PDF regenerated on state change and stored in object storage; WhatsApp + email notification on send/accept.

### 6.2 B2C: cart → checkout

`cart → checkout → payment (Safepay/JazzCash/easypaisa | bank transfer | COD) → order → fulfilment → delivery`.
Guest checkout allowed; online payment optional per payment method; webhook reconciliation is the source of
truth for paid status, never the browser redirect.

### 6.3 Pakistan payments

| Method | Provider | Phase | Notes |
|---|---|---|---|
| Cards + wallets + Raast | **Safepay** | P3 | Best PK coverage; start merchant onboarding in Phase 0 (2–4 weeks) |
| JazzCash / easypaisa | direct or via Safepay | P3 | Wallet-heavy buyers |
| Bank transfer | manual + receipt upload | P1 | Already the business norm; admin marks received |
| Cash on delivery | manual | P1 | B2C only, city-restricted zones |

Never store card data — hosted redirect only (PCI scope stays with the PSP).

---

## 7. API contract

Full draft: [`openapi.yaml`](./openapi.yaml). Summary:

| Area | Endpoints |
|---|---|
| Catalog | `GET /products`, `/products/{slug}`, `/categories`, `/series`, `/materials` |
| Merchandising | `GET /room-packages`, `/projects`, `/projects/{slug}`, `/showrooms` |
| Content | `GET /posts`, `/posts/{slug}`, `/services`, `/services/{slug}`, `/faqs` |
| Quote | `POST /quotes` · `GET /quotes/{no}?token=` · `POST /quotes/{no}/accept` · `GET /quotes/{no}/pdf` |
| Cart & checkout | `POST /carts` · `PATCH /carts/{id}/items` · `POST /checkout` · `GET /orders/{no}` |
| Payments | `POST /payments/intents` · `POST /webhooks/{gateway}` |
| Leads | `POST /leads` · `POST /newsletter` |
| Auth | `POST /auth/register\|login\|refresh\|logout` (Sanctum) |
| B2B | `GET/POST /company/users`, `/company/requisition-lists`, `/company/quotes` |
| Admin | `/admin/*` (role-guarded): products, quotes, orders, jobs, content, KPIs |

**Conventions**

- `Authorization: Bearer <sanctum token>`; public catalog is anonymous + cacheable (`ETag`, `Cache-Control: public, s-maxage=300`).
- Envelope: `{ "data": …, "meta": { "page", "per_page", "total" } }`; errors: `{ "error": { "code", "message", "fields" } }`.
- Money: integer PKR. Dates: ISO-8601 UTC.
- `Idempotency-Key` required on `POST /quotes`, `/checkout`, `/payments/intents`.
- Public quote URLs carry an unguessable `token`; no customer enumeration.
- Rate limits: 60 rpm anonymous, 300 rpm authenticated, 5 rpm on lead/quote creation per IP.

### 7.1 Frontend integration (this repo)

1. Add `src/lib/api/` — typed client (`VITE_API_BASE_URL`), retries, error normalisation.
2. Introduce a **repository switch**: `VITE_DATA_SOURCE=static|api`. Static stays the default until the API
   passes contract tests, so the site never breaks mid-migration.
3. Replace page-level imports of `src/data/*` with repository calls (Shop, ProductDetail, Series,
   RoomPackages, Projects, Materials, Blog, Services in that order).
4. Move cart/quote contexts to **server-backed carts** (keep localStorage as an optimistic cache only).
5. Auth: passwordless email or OTP for B2C; company invite flow for B2B.
6. SEO: pre-render the 23 static routes (`vite-plugin-prerender` or React Snap) as an interim step; migrate the
   storefront to Next.js App Router (ISR) in Phase 3 if organic traffic is a priority.

---

## 8. WOODEX OS admin scope

| Module | Screens | Replaces |
|---|---|---|
| Overview | KPIs: revenue, quotes won, pipeline value, production load, low stock | Supabase `DashboardPage` |
| Catalog | products, variants, attributes, media, price lists | `ProductsPage` |
| Quotes | pipeline board, negotiation thread, PDF, convert-to-order | `QuotationsPage` |
| Orders | order detail, advance/balance, invoices, shipments, returns | `OrdersPage`, `ReturnsPage` |
| Manufacturing | job board by stage (cut → edge → assemble → finish → QC → pack) | *(new)* |
| Customers & B2B | companies, users, credit, statements | `CustomersPage` |
| Inventory | sources, stock movements, purchase suggestions | `InventoryPage` |
| Content | blog, services, projects, FAQs, SEO fields | *(new)* |
| Showrooms | locations, appointments, leads by showroom | `ShowroomPage` |
| WhatsApp | inbox, templates, automations, campaign results | `WhatsAppPage` |
| Analytics | funnel, top products, quote win-rate, delivery SLA | `AnalyticsPage` |
| Settings | users, roles, permissions, taxes, zones, payment methods | `SettingsPage` |

Roles: **Super Admin · Sales Manager · Sales Rep · Production Manager · Store Keeper · Content Editor ·
Accountant (read-only finance)**. Every role change is audited.

---

## 9. Security & compliance

| Risk | Action | Owner | When |
|---|---|---|---|
| Secrets committed to public repos (Stripe, Supabase service-role, WhatsApp, DB URLs) | Rotate everything; purge history with `git filter-repo`; add `gitleaks` to CI | Owner | **Week 1** |
| Supabase RLS assumptions lost on MySQL | Re-implement authorisation as Laravel policies + Gates; write authorisation tests for every admin route | Dev | P1 |
| Service-role keys in browser builds | Forbid; only public keys client-side; server proxies privileged calls | Dev | P1 |
| Card data | Hosted payment pages only; no PAN storage | Dev | P3 |
| WhatsApp consent / spam | Opt-in records, template-based messaging, rate limits, unsubscribe | Dev | P2 |
| Customer PII | Encrypt backups, retention policy, access log, least-privilege DB users | Dev | P1 |
| Quote PDF tampering | Signed URLs, short TTL, server-side regeneration | Dev | P2 |
| Dependency CVEs | `composer audit` + `npm audit` in CI, Dependabot | Dev | P1 |

---

## 10. Delivery plan

Assumes **1 senior Laravel developer + 1 React developer**; a solo developer should multiply by ~2.2.

| Phase | Duration | Deliverables | Acceptance criteria |
|---|---:|---|---|
| **P0 — Foundations** | 2 wks | Repo access + intake, secret rotation, staging server, MySQL 8 + Redis, CI skeleton, data audit | Secrets rotated; staging deploys on push; schema diff documented |
| **P1 — Commerce base** | 4 wks | Bagisto 2.5 installed in OS, 148 products + 5 series + 28 subcategories + 16 materials seeded, media on object storage, `/api/v1` catalog read-only, storefront switched to API | Storefront renders entirely from API; Lighthouse ≥ 90; product parity report = 100% |
| **P2 — Quote engine** | 4 wks | B2B suite, quote state machine, per-company pricing, PDF, 75/25 proforma, WhatsApp + email notifications, quote portal | A real quote can be created, negotiated, accepted, converted to an order with 75% advance recorded — end-to-end, audited |
| **P3 — B2C commerce** | 4 wks | Cart/checkout API, Pakistan payments, COD/bank transfer, orders, invoices, shipments, RMA, customer accounts | Test payment (sandbox) completes; webhook reconciles; order appears in OS; refund path works |
| **P4 — OS operations** | 3 wks | Manufacturing jobs, projects/portfolio CMS, showrooms + appointments, inventory sources, KPI dashboard, role permissions | Production manager can run a job from order to QC; dashboard shows live KPIs |
| **P5 — Hardening & launch** | 2–3 wks | Automated tests (feature + contract + e2e), load test, backups/DR, monitoring, staff training, cutover & decommission Supabase | Backups restore successfully; error budget met; staff sign-off; legacy read-only |

**Total: 19–21 weeks.** Storefront is live on the API after **P1 (~6 weeks)**; the quote engine — the actual
revenue path — lands at **~10 weeks**.

### 10.1 Cross-cutting workstreams (run in parallel, not as phases)

- **Data migration** — Postgres → MySQL ETL script, with reconciliation counts and a dry-run report per table.
- **Design system** — reuse the storefront tokens (HON-inspired white/charcoal/leaf green) for OS admin.
- **SEO** — prerender now, ISR later; Product + Breadcrumb + FAQ JSON-LD; sitemap generated from the API.
- **Testing** — Pest (Laravel), contract tests against `openapi.yaml`, Playwright for the 5 critical journeys.

---

## 11. Infrastructure & running cost

| Component | Spec | Est. monthly (USD) |
|---|---|---:|
| App server | 4 vCPU / 8 GB (Hetzner/Contabo) | 20–40 |
| MySQL | managed or same box (start same box) | 0–30 |
| Redis | same box or managed | 0–15 |
| Object storage + CDN | Cloudflare R2 / S3 (~20 GB media + PDFs) | 2–8 |
| Email | Resend/Brevo (transactional) | 0–20 |
| WhatsApp Cloud API | per-conversation pricing | 10–50 |
| Backups + monitoring | S3 + Sentry/UptimeRobot | 0–15 |
| **Total** | | **≈ $35–180** |

Domain, SSL (Let's Encrypt) and CI (GitHub Actions) are free at this scale. No licence fees on this path.

---

## 12. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | OS repo never accessible → rebuild blind | Medium | High | Choose Option A/B/C; otherwise P0 becomes reverse-engineering the business rules from Supabase + interviews |
| 2 | Bagisto 2.5 is young (Laravel 13 / PHP 8.4) | Medium | Medium | Pin versions, stage upgrades, avoid exotic extensions, keep payment logic in own module |
| 3 | B2B suite branch (`3.0`) compatibility gaps | Medium | Medium | Spike in P1 week 1; if unstable, port its RFQ models into a WOODEX package (contingency: +3 weeks) |
| 4 | Postgres → MySQL migration subtly loses data | Medium | High | Row-count + checksum reconciliation; dry runs; keep Supabase read-only for 60 days |
| 5 | Payment onboarding (Safepay/JazzCash) takes weeks | High | Medium | Start merchant applications in P0; ship bank transfer + COD first |
| 6 | SEO regressions during SPA → API migration | Medium | High | Prerender + sitemap in P1; crawl diff before/after; keep URL structure frozen |
| 7 | Scope creep (marketplace, multi-currency, AI) | High | Medium | Lock P1–P3 scope; park extras in a backlog with dates |
| 8 | Solo-developer bus factor | High | High | Document every custom module, seeders + tests, deploy runbook |

---

## 13. Open decisions (needed before P1)

1. **OS repo access** — public / collaborator / archive / rebuild.
2. **Engine** — Bagisto embedded (recommended) vs Medusa vs fully custom.
3. **Storefront future** — keep Vite SPA (fast) vs migrate to Next.js (better SEO) and when.
4. **Database of record** — MySQL (Bagisto requirement) as the single source, retiring Postgres/Supabase?
5. **Team & date** — who builds it, and what is the hard launch date (Ramadan/seasonal fit-out cycles matter)?
6. **Launch priority** — B2B quote engine first, B2C payments first, or OS operations first?

---

## 14. Next 10 working days

| Day | Task | Output |
|---|---|---|
| 1 | Rotate all leaked secrets; enable secret scanning on every repo | Rotation log |
| 2 | Grant OS repo access (or send archive); run intake checklist | `REPO-INTAKE` filled |
| 3 | Answer §13 decisions | Signed-off plan v1.1 |
| 4 | Provision staging (Laravel 13, MySQL 8, Redis, storage, SSL) | Staging URL |
| 5–6 | Install Bagisto 2.5 + b2b-suite on staging; spike RFQ flow | Working demo store |
| 7 | Design MySQL schema for WOODEX modules; review against Supabase inventory | ERD + migration list |
| 8 | Build Postgres → MySQL ETL dry run on products/categories | Parity report |
| 9 | Implement `/api/v1` catalog read endpoints + OpenAPI validation in CI | Passing contract tests |
| 10 | Switch storefront to API behind `VITE_DATA_SOURCE=api` on staging | Live staging storefront |
