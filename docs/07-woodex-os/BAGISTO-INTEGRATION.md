# Bagisto × WOODEX OS — How the Commerce System Lives with the Master Backend

**Decision (locked by the owner):** e-commerce runs on **Bagisto** (`github.com/bagisto/bagisto`, MIT, Laravel).
WOODEX OS is the **master backend** — CRM, sales, projects, accounts, content, AI.
Neither is replaced. This document defines exactly who owns what, and where they meet.

---

## 1. Why Bagisto fits this stack

| Requirement | Bagisto | Why it wins here |
|---|---|---|
| Language / framework | **PHP 8.4 / Laravel 13** | Identical to WOODEX OS. One skill set, one deploy model, one ops story |
| Licence | **MIT** | No per-order fee, no seat fee |
| Completeness | Catalog, variants, cart, checkout, taxes, shipping, promotions, refunds, invoices, multi-store, multi-currency, B2B-ish price rules | "Complete e-commerce" without building it |
| Hosting | Classic PHP + MySQL, no Node runtime | Only option that physically fits shared hosting |
| Admin | Mature, order/fulfilment-oriented | Staff get a real back office from day one |
| Upgrade path | Laravel package ecosystem | Same migrations/queue/cache idioms as the OS |

Rejected alternatives, briefly: **Medusa** (Node ≥ 22 runtime — impossible on shared, and the OS isn't Node);
**nextjs-commerce** (a Next.js storefront that would *replace* our React storefront and needs Node SSR — used only
as an API-shape reference).

---

## 2. The integration options — and the one we take

### Option A — Bagisto as a **separate site on the same account**, OS as master *(CHOSEN)*

```
                     ┌──────────────────────────────┐
  storefront SPA ───►│  WOODEX OS  (admin. / www.)  │──► Puck pages, CMS, CRM, quotes,
  (React, prerender) │  /api/storefront/v1  (BFF)   │    projects, accounts, AI agent
                     └───────────┬──────────────────┘
                                 │  server-to-server HTTPS (signed)
                     ┌───────────▼──────────────────┐
                     │  Bagisto  (shop.woodex.pk)   │  catalog, stock, price, cart,
                     │  REST/GraphQL API + admin    │  checkout, orders, invoices, refunds
                     └──────────────────────────────┘
```

- **No shared database.** No shared `vendor/`. No shared route table. Two clean boundaries.
- The storefront **never** talks to Bagisto directly — only to the OS BFF, so the OS can inject pricing rules,
  B2B terms, showroom stock and quote context.
- Deploy, rollback and upgrade each app independently. Bagisto upgrades never touch OS code.

### Option B — OS owns the catalog, Bagisto gets a read-only mirror *(rejected)*
Two writers, one truth. Every price edit becomes a sync bug. Also loses Bagisto's promotions/variants UI.

### Option C — Vendor Bagisto packages into the OS monolith *(rejected)*
Both apps ship `users`, `customers`, `addresses`, `admin` route prefixes, `media` and their own migrations.
Merging means rewriting Bagisto's service providers and stubbing dozens of tables — a fork we would own forever on a
hosting plan that can't even run a queue worker. **Do not attempt.**

---

## 3. Ownership matrix — one writer per fact

| Fact | **Owner** | Mirror / consumer |
|---|---|---|
| Product, SKU, variant, attributes, media | **Bagisto** | OS caches for pages/search |
| Price (list), promotions, coupons, tax, shipping rates | **Bagisto** | OS reads via BFF |
| B2B price list, negotiated quote price | **WOODEX OS** (Sales/CRM) | pushed onto the order at checkout |
| Stock / inventory | **Bagisto** | OS shows availability, never writes |
| Cart, checkout, payment capture | **Bagisto** | — |
| Order record, invoice, refund, fulfilment | **Bagisto** | mirrored to OS for 360° customer view |
| Customer account (login, address book) | **Bagisto** | OS mirrors; OS staff can see orders |
| Lead, deal, project, site visit, showroom appointment | **WOODEX OS** | — |
| Quotation (E-Quotation), advance/milestone invoices | **WOODEX OS** | "Convert to order" hands the cart to Bagisto |
| Page, blog, FAQ, showroom page, SEO | **WOODEX OS** (Puck) | — |
| Warranty registration & claims | **WOODEX OS** | links to the order id |
| Support tickets | **WOODEX OS** (Conversations) | — |
| Distributor / dealer applications | **WOODEX OS** (CRM pipeline) | account type pushed to Bagisto customer group |
| AI agent memory, tool calls, guardrails | **WOODEX OS** | — |
| Auth session for shop | **Bagisto** | OS trusts a signed token from the BFF |

**Rule of thumb:** if money changes hands, Bagisto owns it. If a person, a promise or a page is involved, the OS owns it.

---

## 4. The BFF — one API for the storefront

The React storefront already calls `/api/storefront/v1/*`. That namespace stays; **its implementation changes** from
"OS tables" to "OS + Bagisto adapter". Nothing in the SPA changes shape.

| BFF endpoint | OS does | Bagisto does |
|---|---|---|
| `GET /catalog/products` | tenant/visibility rules, Puck merchandising blocks | source of products, filters, facets |
| `GET /catalog/products/{slug}` | CMS blocks, showroom availability, warranty copy | price, stock, variants, reviews |
| `GET /catalog/categories` | page mapping | category tree |
| `POST /cart` · `PATCH /cart/items` | attaches quote/session context | cart lines, price calc |
| `POST /checkout/session` | address prefill from CRM | creates checkout, applies shipping/tax |
| `POST /checkout/place` | writes the order mirror + opens the CRM record | payment, order creation |
| `GET /orders/{id}` | joins project/support/warranty data | order status, invoices |
| `POST /quotes/{id}/convert-to-order` | reads the OS quote | seeds a cart from quote lines |
| `POST /webhooks/bagisto` | **receives** order/invoice/refund events | emits via Bagisto events |
| `POST /webhooks/payment` | verifies HMAC, marks quote paid | — |

**Adapter contract** (`app/Domain/Commerce/Contracts/CommerceGateway.php` in the OS — an *interface only*, not a
re-implementation): `products()`, `product()`, `stock()`, `cartCreate()`, `cartAdd()`, `checkout()`, `order()`,
`customer()`, `refund()`. One implementation: `BagistoGateway`. A `NullGateway` keeps local dev working without Bagisto.

> This is the single most important architectural boundary in the plan. The OS holds an *interface*; Bagisto holds the
> *engine*. A future swap (e.g. to a hosted commerce API) touches one class, not the storefront.

### Sync flows

1. **Catalog pull** — cron every 10 min: Bagisto products changed since `last_synced_at` → OS `catalog_cache`
   (id, sku, slug, name, price, stock, images, attributes). Products render from the cache, never live.
2. **Price/stock invalidation** — Bagisto webhook → OS busts that product's cache. TTL fallback 10 min.
3. **Order placed** — Bagisto webhook `sales.order.save.after` → OS creates an `OrderMirror`, links/creates the customer,
   opens a project-ready record, notifies staff, feeds the AI agent's context.
4. **Payment captured** — webhook → OS marks the linked quotation/invoice paid (double-entry hit in Accounts).
5. **Quote → order** — staff clicks *Convert* in OS → BFF builds a Bagisto cart from quote lines → returns a checkout URL.
6. **Customer** — first purchase creates the Bagisto customer; OS links by email + phone, never duplicates a person.
7. **Refund / cancellation** — Bagisto webhook → OS reverses the accounting entry and reopens the deal.

**Idempotency everywhere:** every webhook carries `X-Bagisto-Event-Id`; the OS stores it in `commerce_events` and drops
duplicates. Sync never blocks a checkout.

---

## 5. Commerce tables added to the OS (all mirrors, never sources)

| Table | Purpose |
|---|---|
| `commerce_events` | raw webhook log + idempotency keys |
| `commerce_products` | cached catalog rows (slug, sku, price, stock, payload JSON) |
| `commerce_orders` | order mirror: number, customer, totals, status, currency |
| `commerce_order_lines` | line items incl. the OS quote line they came from |
| `commerce_customers` | link table `person_id ↔ bagisto_customer_id` |
| `commerce_sync_runs` | last run, counts, errors per flow |

No `cart`, `checkout`, `payment`, `invoice` tables in the OS. Those stay in Bagisto.

---

## 6. Where the storefront actually renders

| Page type | Renderer | Why |
|---|---|---|
| Home, collection, showroom, material, FAQ, brand, landing | **Puck → OS Blade** | SEO, cached, CMS-editable |
| Product detail | **OS Blade**, hydrated from the catalog cache | ~200 pages, indexable, no Node |
| Cart, checkout, account, order tracking | **React SPA** | Interactive, no SEO value, calls the BFF |
| Blog / insight article | **Puck → OS Blade** | SEO |
| Quote request / custom design / B2B application | **React SPA** (multi-step) | Form-heavy, then lands in CRM |

The SPA is no longer the whole site — it is the **transaction layer**. Marketing surfaces are server-rendered by the OS.
That is what makes the site indexable on shared hosting with no Node.

---

## 7. Bagisto configuration for this business

- **One store, one currency (PKR)**, multi-currency ready (USD for exports later).
- **Channels:** `PK` (retail) and `B2B` (dealer group with price lists).
- **Customer groups:** Retail, Dealer, Architect, Corporate — drives visible pricing.
- **Attributes added:** material, colour family, finish, dimensions, lead time, warranty months, showroom(s),
  is-customisable, MOQ (dealer), made-to-order flag.
- **Configurable products** for size/material variants; **simple products** for accessories (matches the "launch simple"
  decision — simple first, configurable enabled where it earns its keep).
- **Inventory:** single source, safety stock per warehouse (Lahore, Karachi, online).
- **Shipping:** flat + weight bands initially; courier API later.
- **Payments:** **Bank transfer (manual verification) + COD** on day one; **Safepay** (cards/wallets/Raast) and
  **JazzCash/easypaisa** as plugins in parallel, each behind a feature flag. All hosted redirects — no card data on our host.
- **Returns/warranty:** RMA in Bagisto for returns; **warranty claims live in the OS** because they involve service jobs.

---

## 8. Risks and their mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Bagisto won't install cleanly on shared hosting | **Blocking** | **Gate H0** — prove it in week 1 before any UI work |
| Large Composer install OOMs in the Git hook | Blocks deploy | Run once via SSH; or commit a lockfile-pinned `vendor/`; or install locally and upload |
| Two apps competing for 30 entry processes | Slow checkout at peak | Cache catalog at the BFF; static marketing pages are file-cached; monitor 508s |
| API surface mismatch between Bagisto versions | Rework | Pin the Bagisto version; wrap in `BagistoGateway`; contract tests |
| Double data entry (product made in both systems) | Drift | Products **only** in Bagisto; OS product pages read the cache |
| Webhook loss on shared (no queue daemon) | Missed orders | Cron every minute drains `commerce_events`; nightly reconciliation job compares order counts |
| Bagisto upgrade breaks the adapter | Outage | Contract test suite in CI against a pinned Bagisto container |

---

## 9. Definition of done for the commerce workstream

- [ ] Bagisto live at `shop.woodex.pk`, catalog imported, 3 warehouses, PKR + tax configured
- [ ] BFF serves catalog from cache; product page reachable and indexable at `woodex.pk/products/{slug}`
- [ ] Guest and registered checkout complete end-to-end with bank transfer and COD
- [ ] Safepay live in production, JazzCash/easypaisa behind flags
- [ ] Order webhook → OS order mirror → Accounts entry, within 60 s, idempotent
- [ ] Quote → cart → order path used by a real salesperson on a real customer
- [ ] Refund in Bagisto reverses the OS ledger entry
- [ ] Nightly reconciliation reports zero unexplained drift for 14 consecutive days
- [ ] Load test: 30 concurrent checkouts, zero 508s, p95 < 1.5 s
