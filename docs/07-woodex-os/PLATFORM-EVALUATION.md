# Platform Evaluation — What Should Power WOODEX Commerce?

> **v6 note (31 Oct 2026):** the owner ruled out running Bagisto as a separate engine. The analysis below stands as the
> evidence base; its conclusion is now: **build commerce natively inside WOODEX OS using Bagisto as the reference
> implementation** (feature matrix + MIT-licensed algorithms). See `COMMERCE-IN-OS.md`.

**Date:** 31 Oct 2026 · **Subject:** choosing the commerce engine and where it runs.
**Analysed commits/versions:** Bagisto `2.5.0` (06 Oct 2026), `bagisto/b2b-ecommerce` branch `3.0`, `bagisto/bagisto-api` (28 Oct 2026), Medusa `v2.22.2` (30 Oct 2026), `medusajs/b2b-starter-medusa`, `bagisto/nextjs-commerce`.

---

## Verdict update — after reading WOODEX OS (31 Oct 2026)

The comparison below stands on its own merits, but the recommendation changes once the target application is
known. WOODEX OS is a **73,582-line custom Laravel 13 / Livewire 4 ERP** that already owns quotations, invoices,
advances, double-entry accounting, CRM and messaging, and runs on **Hostinger shared hosting without SSH**.

- Bagisto is a *complete application*, not an embeddable package. Adopting it means either replacing WOODEX OS
  (losing the audited financial spine) or running a second app + MySQL + admin beside it (dual-write risk).
- Therefore: **build the Commerce domain natively in WOODEX OS** and use Bagisto as the **reference design**
  (product/variant model, cart→order→invoice→shipment state machine, price lists, inventory sources).
- Bagisto remains the right answer *if* the commerce engine must be a standalone headless service later
  (e.g. 10k+ SKUs, marketplace, or a Node/PHP split team).

See [`MASTER-PLAN.md`](./MASTER-PLAN.md) §3 for the full decision matrix.

---

## 0. The short answer

| Option | Verdict for WOODEX |
|---|---|
| **Bagisto 2.5 feature set absorbed into WOODEX OS (v6 decision)** | ✅ **Chosen.** Same language as the stated direction (Laravel), MIT, complete commerce (catalog → orders → invoices → RMA), and a **free** B2B suite that already models companies, RFQ, quotation negotiation, credit limits and purchase orders — which is exactly WOODEX's quote-first business. |
| **Medusa v2 + Laravel OS** | ⚠️ Technically superior framework, wrong fit here. It adds a second runtime (Node 22 + Postgres) beside PHP, its B2B quotes/companies are starter-template code you own, and RBAC/SSO are paid Enterprise features. |
| **Bagisto + Next.js storefront** | ✅ Right long-term frontend answer, but it replaces today's React SPA — treat as Phase 3, not Phase 1. |
| **Custom Laravel commerce (Filament/Nova)** | ❌ Builds 6–9 months of undifferentiated work before the first order. Only justified if Bagisto is rejected on technical grounds. |

**Rule:** choose **one** commerce engine. Running Bagisto *and* Medusa, or either one alongside the existing Supabase/Express backends, guarantees a data-consistency project nobody asked for.

---

## 1. What WOODEX actually sells (the requirement that decides this)

From the code and the brand's own docs (`docs/MASTER.md` in this repo):

| Segment | Share | Flow |
|---|---:|---|
| B2B fit-out (corporate, education, healthcare, government, hospitality) | **60%** | Enquiry → site visit → **quotation** → negotiation → 75% advance → production → 25% balance → delivery/installation |
| B2C office & home retail | 25% | Browse → cart → COD/bank transfer → delivery |
| Custom manufacturing | 15% | Design → BOQ → quote → production |

So the money path is **quote-first**, not checkout-first. Any platform choice must model:

1. Company accounts with multiple buyers, roles, credit terms, per-company price lists.
2. Request-for-quote from a cart, merchant repricing, negotiation thread, accept → order.
3. Advance/balance invoicing (75/25), proforma invoices, PDFs, WhatsApp delivery.
4. Furniture attributes: series, material/finish, colour swatches, dimensions, lead time.
5. Room packages (bundles) and project portfolio as merchandising.
6. PKR-only pricing, Pakistani payment rails, Urdu-friendly WhatsApp communication.

---

## 2. Head-to-head

### 2.1 Stack & operations

| | Bagisto 2.5 | Medusa v2 |
|---|---|---|
| Language | PHP 8.4, Laravel 13 | TypeScript, Node ≥ 22.22 |
| Database | **MySQL 8** (`ext-pdo_mysql`) | **PostgreSQL** |
| Runs alongside a Laravel OS | ✅ same runtime, one deploy, shared auth/queue | ❌ second service + second DB + second deploy pipeline |
| Admin UI | Mature Vue admin: orders, invoices, shipments, refunds, inventory, customers, CMS, marketing, reports | Modern React admin: good core commerce, fewer back-office depth features |
| License | **MIT**, no revenue share | Core MIT; **Enterprise Edition** materials (RBAC, SSO) require a commercial agreement |
| Community | 28.3k ★, v2.5.0 shipped Oct 2026 | 37k ★, v2.22.2 shipped 30 Oct 2026 |
| Upgrade risk | Laravel 13/PHP 8.4 is bleeding-edge; pin and stage upgrades | Frequent minor releases; migrations on Postgres |

### 2.2 Commerce completeness (out of the box)

| Capability | Bagisto 2.5 | Medusa v2 |
|---|---|---|
| Products, families, attributes, configurable variants | ✅ | ✅ |
| Categories (nested set), multi-store, multi-channel, locales, currencies | ✅ | ✅ (regions/sales channels) |
| Inventory, sources, stock movements | ✅ | ✅ |
| Cart, checkout, orders, invoices, shipments, **refunds/RMA** | ✅ | ✅ (RMA via custom flows) |
| Cart rules / catalog rules / promotions | ✅ | ✅ (promotions module) |
| Tax, tier pricing, customer groups | ✅ | ✅ (price lists are excellent) |
| CMS pages, sitemap, SEO fields, full-page cache | ✅ | ❌ bring your own |
| Booking products, GDPR, Omnibus price history | ✅ | ❌ / partial |
| Payment providers bundled | Stripe, PayPal, Razorpay, PayU, PhonePe, PayGlocal | Stripe, Adyen (rest via modules) |
| **B2B companies, RFQ, quotations, credit, PO, requisition lists** | ✅ **free `bagisto/b2b-suite` (MIT)** | ⚠️ separate B2B **starter** you fork and maintain |
| RBAC for staff | ✅ core | 💰 Enterprise |

### 2.3 The B2B question — the decisive factor

**Bagisto** publishes a free, MIT-licensed B2B suite with exactly WOODEX's primitives: company registration with admin approval, company users + role-based permissions, **Request for Quote from the cart**, end-to-end **quotation negotiation with messaging** on storefront *and* admin, purchase orders, company credit limits with a ledger and *Pay By Credit* checkout, requisition lists, quick order by SKU/CSV, company catalogs with per-company visibility and tier pricing, sales representatives assigned to companies, and custom company attributes. That is a ~4–6 month build if written from scratch.

**Medusa** keeps company accounts, quotes and approvals in an **official starter template** (`medusajs/b2b-starter-medusa`, MIT) as *custom modules and workflows*: companies, employee spending limits, cart approval, RFQ with merchant repricing, draft orders, bulk add-to-cart. Excellent engineering, but you own and maintain it, it ships with a Next.js storefront, and it lives in the Node stack. Medusa's own docs are candid that credit limits, payment terms, multi-level approvals and customer-specific catalogues remain "you build it".

**Verdict:** WOODEX needs companies + RFQ + credit + POs on day one → Bagisto's free suite removes the largest custom-build risk.

### 2.4 Headless / storefront fit

- **Bagisto** exposes **REST + GraphQL** through `bagisto/bagisto-api` (built on Laravel API Platform). Note: its README targets Bagisto **2.4.10+** — verify 2.5 compatibility before committing.
- **Medusa** exposes REST Store/Admin APIs plus a typed JS SDK; no GraphQL in core.
- **`bagisto/nextjs-commerce`** is the reference storefront: Next 16, React 19, Apollo GraphQL, NextAuth, Tailwind 4, ISR, 100/100 Core Web Vitals claim. Its UI is generic — the WOODEX design would be ported into it, not the other way round.

Our storefront is a Vite SPA. Either engine can feed it over REST. GraphQL gives the SPA fewer round-trips; REST is easier to cache and secure. **Recommendation:** a thin REST façade `/api/v1` owned by WOODEX OS (stable contract, one version, works for web + mobile + WhatsApp bot), with GraphQL available for internal/admin tooling.

### 2.5 Cost of ownership (3-year view)

| Item | Bagisto path | Medusa path |
|---|---|---|
| License | $0 (MIT) | $0 core; Enterprise RBAC/SSO if needed |
| Servers | 1 app VPS + MySQL (can be the same box) | app VPS + Postgres + a Node service + queue worker |
| Skills | PHP/Laravel (already the stated direction) | PHP **and** TypeScript/Node |
| Custom B2B work | Small (extend B2B suite) | Large (own the starter's modules) |
| Upgrade surface | Laravel + Bagisto releases | Medusa minor releases + your modules |
| Paid marketplace add-ons | Avoid; core + free B2B cover the needs | n/a |

### 2.6 Where Medusa would win

If WOODEX standardised on TypeScript end-to-end, wanted a commerce-as-a-service core with best-in-class workflow orchestration, or planned multi-region/multi-currency expansion with a dedicated Node team — Medusa would be the better engine. None of those are true today; the stated backend is Laravel.

---

## 3. Recommended composition

```
WOODEX OS  (Laravel 13 · PHP 8.4 · MySQL 8)
├── Commerce core .............. Bagisto 2.5 (MIT)
│   ├── catalog: families, attributes, configurable products (series, material, colour, size)
│   ├── inventory, price lists, cart rules, tax, multi-store
│   ├── cart → checkout → order → invoice → shipment → refund/RMA
│   └── admin: orders, customers, catalog, CMS, reports
├── B2B suite .................. bagisto/b2b-suite (MIT, free)
│   ├── companies, company users, roles, sales reps
│   ├── RFQ → quotation negotiation → purchase order
│   ├── company credit + Pay By Credit
│   └── requisition lists, quick order, company catalogs
├── WOODEX modules (custom Concord packages)
│   ├── Quote → proforma → 75/25 advance → milestone invoices
│   ├── Custom manufacturing jobs (BOM, materials, workshop stages, QC)
│   ├── Projects / portfolio, room packages, showroom appointments
│   ├── Materials & finishes library bound to product variants
│   ├── WhatsApp hub (Cloud API templates, conversations, nudges)
│   ├── Pakistan payments (Safepay, JazzCash, easypaisa, bank transfer, COD)
│   └── KPI dashboard (quotes won, pipeline, production load, stock alerts)
└── API façade ................. /api/v1 (Sanctum) + webhooks + outbox
```

**Anti-goals:** multi-vendor marketplace (WOODEX is single-vendor — skip the $449 extension), multi-currency at launch, and a second Node service.

---

## 4. Migration reality check

The organisation currently has **three** data homes for the same business:

| Source | Contents | Fate |
|---|---|---|
| Supabase (`woodex420/woodex`) | 45 tables, 106 RLS policies, 32 edge functions (26 never called) | **Extract and migrate** products, customers, quotations, orders, inventory, WhatsApp history, content. Postgres → MySQL transform required. |
| Express + SQLite (`woodex-2030` monorepo) | prototype API + dashboard, 55 tests | Keep as reference/UX prototype; do not run in production |
| `woodex420/woodexinterior` (private, unreadable) | unknown — presumed the Laravel OS | Must be read before any import decision |

**Implication:** the plan must include a one-time data migration and a decommissioning step, or WOODEX will run three systems in parallel and trust none of them.

---

## 5. Sources

- Bagisto repository & `composer.json` (PHP ^8.4, Laravel ^13.0, `ext-pdo_mysql`) — https://github.com/bagisto/bagisto
- Bagisto B2B suite (MIT, RFQ/quotes/credit/PO) — https://github.com/bagisto/b2b-ecommerce
- Bagisto API (REST + GraphQL, API Platform) — https://github.com/bagisto/bagisto-api
- Bagisto Next.js Commerce (Next 16, GraphQL, ISR) — https://github.com/bagisto/nextjs-commerce
- Medusa repository, modules, `ENGINES` Node ≥22.22 — https://github.com/medusajs/medusa
- Medusa licensing (MIT core + Enterprise materials) — https://github.com/medusajs/medusa/blob/develop/LICENSE
- Medusa B2B starter (companies/quotes/approvals as custom modules) — https://github.com/medusajs/b2b-starter-medusa
- Medusa B2B capability matrix — https://medusajs.com/kb/b2b/b2b-ecommerce-platform
- Independent Medusa B2B gap analysis — https://kvytechnology.com/blog/ecommerce/medusa-b2b-module/
- Medusa licensing/RBAC note — https://www.evelumo.com/blog/what-is-medusa-js/
