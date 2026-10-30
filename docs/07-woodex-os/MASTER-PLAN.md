# WOODEX OS + Storefront — Master Plan (v2)

**Version:** 2.0 · **Date:** 31 October 2026 · **Supersedes:** v1.0 (written before the OS source was readable)
**Inputs:** [`OS-BASELINE.md`](./OS-BASELINE.md) (measured), [`PLATFORM-EVALUATION.md`](./PLATFORM-EVALUATION.md) (engine comparison), [`COMMERCE-DOMAIN.md`](./COMMERCE-DOMAIN.md) (schema + endpoints), [`openapi.yaml`](./openapi.yaml) (contract)

---

## 1. Executive summary

WOODEX already owns two strong assets:

1. **A 73,582-line Laravel 13 / Livewire 4 operating system** (682 files, 98 tables, 180 test files) that runs
   quotations, invoices, advances, double-entry accounting, CRM, projects, WhatsApp/Telegram and the website.
2. **A finished storefront** (this repo: 23 routes, 148 products, dual cart/quote funnels) with **no API to call**.

The missing piece is a **Commerce domain inside WOODEX OS** plus a **storefront API** — not another platform.

**Decision**

| # | Decision | Rationale |
|---|---|---|
| D1 | **Build Commerce as a new domain inside WOODEX OS**, not a second application | The OS already owns quotes, invoices, payments, the ledger, CRM and messaging. A second engine would duplicate the money path — the one place duplication is unacceptable. |
| D2 | **Reuse the Sales domain for B2B** (online RFQ → existing `Quote` → advance invoice) | The quotation machine (versions, approvals, milestones, 75/25 advances, PDFs) is already built and tested. |
| D3 | **Add Cart → Order → Fulfilment for B2C**, posting an `Invoice` and `Payment` through existing actions | Money never bypasses the audited ledger. |
| D4 | **Ship one API façade:** `api/storefront/v1` (public, read-mostly) + webhooks | One contract for the storefront, a future mobile app and the e-commerce agent. |
| D5 | **Bagisto stays a reference, not a dependency** (see §3.4) | It cannot be embedded in an existing Laravel app without owning it; on Hostinger shared hosting it would also break the no-SSH/no-worker constraints. |
| D6 | **The e-commerce agent is built on the existing Bot/Assistant + MCP bridge**, with commerce tools added | Reuses BotKnowledge, Automation and the `wx_mcp_` tooling already shipped. |

**Effort:** 16–20 weeks with two developers; storefront live on real data in ~5–6 weeks; B2C checkout in ~10; agent in ~14.

---

## 2. Current state

| Asset | Status |
|---|---|
| WOODEX OS (`woodex420/woodexinterior`) | ✅ Public, cloned, measured — see [`OS-BASELINE.md`](./OS-BASELINE.md) |
| Storefront (this repo) | ✅ 23/23 routes render, builds clean, dev server live |
| Storefront API | 🟡 Contract drafted, **not implemented** |
| Commerce data model | ❌ Does not exist in the OS (no products, carts, orders, stock) |
| B2B quote engine | ✅ Exists and is audited (Sales domain) |
| Payments | 🟡 Manual/bank/COD in OS; no online gateway |
| E-commerce agent | 🟡 Bot + MCP foundations exist; no commerce tools |
| CI | ❌ No workflows in the OS repo |

---

## 3. The decision that matters

### 3.1 Options considered

| | **A. Native Commerce domain in OS** *(recommended)* | **B. Bagisto as a sidecar service** | **C. Bagisto as the base platform** |
|---|---|---|---|
| What it means | New `app/Domain/Commerce` inside the existing Laravel app; storefront talks to OS | Separate Bagisto 2.5 app (own MySQL + admin) synced with OS over API | Port WOODEX OS modules into Bagisto |
| Money flows | One system: cart → invoice → payment → ledger | Two systems; orders must sync into OS invoices | Rewrite accounting/CRM |
| Quote flow | Reuses the audited `Quote` domain | Bagisto RFQ duplicates the OS quote engine | Discards existing engine |
| Hosting | Same Hostinger shared hosting | Second app + DB + queue; needs more than shared hosting | Same |
| Admin | Same admin, new screens | Two admins, two logins | One admin, everything rebuilt |
| Time to first order | ~10 weeks | ~8–10 weeks + ongoing sync maintenance | 6–9 months |
| Risk | Medium (we build commerce) | High (dual-write, reconciliation, drift) | Very high |
| Verdict | ✅ **Do this** | ⚠️ Only if the OS were absent | ❌ Do not |

### 3.2 Why not simply "install Bagisto as you recommended"

Bagisto is a **complete Laravel application**, not a composable package you `composer require` into another app.
Adopting it means one of:

- moving the whole business onto Bagisto (Option C — losing 73k lines of accounting, CRM, website builder), or
- running it beside the OS (Option B — two catalogs, two admins, two sources of truth for customers and money).

On Hostinger shared hosting (no SSH, cron-only queues, no Redis, no Elasticsearch) a second Laravel app with
Bagisto's dependency and index footprint is also an operational gamble.

### 3.3 What we keep from Bagisto anyway

Its **domain design** is excellent and free (MIT). We mirror its proven patterns inside the Commerce domain:

- product → configurable variants (attributes: series, finish, colour, size)
- price lists / customer-group pricing for B2B tiers
- cart → checkout → order → invoice → shipment → return state machine
- inventory sources + stock movements
- RFQ → quotation negotiation (already stronger in WOODEX OS)

### 3.4 If the business insists on Bagisto

It remains a valid **future headless engine**: run it on its own VPS as `shop-api.woodex.pk`, make it the
cart/checkout engine only, and keep OS as system of record. Gate it behind a Phase-4 decision after commerce is
live and measured; do not start there.

---

## 4. Target architecture

```
                    ┌─────────────────────────────────────────────────────┐
  visitor ─────────▶│ Storefront — React 18 SPA (this repo)               │
                    │ catalog · configurator · quote basket · cart        │
                    └───────────────┬─────────────────────────────────────┘
                                    │  /api/storefront/v1  (JSON, cached, ETag)
┌───────────────────────────────────▼─────────────────────────────────────┐
│ WOODEX OS — Laravel 13 · Livewire 4 · PHP 8.4 · Hostinger               │
│                                                                         │
│  ┌─ NEW: Commerce ───────────────────────────────────────────────────┐  │
│  │ Product · ProductVariant · ProductMedia · PriceList · Collection  │  │
│  │ Cart · CartItem · Order · OrderItem · Shipment · Return           │  │
│  │ InventorySource · StockMovement · ShowroomPackage                 │  │
│  └───────────────┬───────────────────────────────────────────────────┘  │
│                  │ events (OrderPlaced …)                               │
│  ┌───────────────▼──────────────┐  ┌──────────────────────────────────┐ │
│  │ Sales (existing, audited)     │  │ Accounts (existing)              │ │
│  │ Quote · Invoice · Payment     │─▶│ JournalEntry · Ledger            │ │
│  │ advances · milestones · PDF   │  │ BankAccount · Period close       │ │
│  └───────────────┬──────────────┘  └──────────────────────────────────┘ │
│                  │                                                       │
│  ┌───────────────▼──────────────┐  ┌──────────────────────────────────┐ │
│  │ CRM (existing)               │  │ Conversations (existing)         │ │
│  │ Lead · Contact · Company     │  │ WhatsApp · Telegram · web chat   │ │
│  └──────────────────────────────┘  └──────────────────────────────────┘ │
│  ┌──────────────────────────────┐  ┌──────────────────────────────────┐ │
│  │ Website (existing)           │  │ Assistant / Bot (existing)       │ │
│  │ pages · theme · SEO          │  │ + NEW commerce tools             │ │
│  └──────────────────────────────┘  └──────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                   MySQL 8 · local storage · cron scheduler
                   Safepay / JazzCash / easypaisa (P3) · SMTP · Meta WhatsApp
```

**Non-negotiables**

1. Commerce **never** writes `payments`, `journal_*` or `invoices` directly — it calls the existing Sales/Accounts
   actions (`RaiseAdvanceInvoice`, `RecordPayment`, `AllocatePayment`).
2. Every order state change emits an event + an `ActivityLog` row + an outbound webhook (existing `WebhookEvent`).
3. The storefront is read-only against the API except for: lead capture, quote submission, cart, checkout, chat.
4. Online payment confirmation comes from a **signature-verified webhook**, never from the browser redirect.

---

## 5. Domain model (new tables)

Full DDL, indexes and acceptance tests: [`COMMERCE-DOMAIN.md`](./COMMERCE-DOMAIN.md).

```
commerce_products        id, sku, slug, name, description, short_description, category_id, series_id,
                         brand_line, is_active, is_featured, is_new, is_best_seller, lead_time_days,
                         tax_class, meta_title, meta_description, published_at
commerce_variants        id, product_id, sku, name, price_minor, compare_at_minor, cost_minor,
                         weight_g, dimensions, is_default, is_active
commerce_attributes      id, code, name, type (select|color|text), unit
commerce_attribute_values id, attribute_id, value, hex
commerce_variant_values  variant_id, attribute_value_id
commerce_media           id, product_id, path, alt, position, is_cover
commerce_categories      id, parent_id, slug, name, position, image_path
commerce_collections     id, slug, name, type (series|room_package|curated)
commerce_collection_items collection_id, product_id, position
commerce_price_lists     id, code, name, currency, company_id(nullable), starts_at, ends_at
commerce_prices          id, price_list_id, variant_id, amount_minor
commerce_inventory       id, variant_id, source_id, on_hand, reserved
commerce_stock_movements id, variant_id, source_id, qty, reason, reference, created_by
commerce_carts           id, token, customer_id(nullable), currency, status, expires_at
commerce_cart_items      id, cart_id, variant_id, qty, unit_price_minor, note
commerce_orders          id, number, cart_id, customer_id, company_id, status, payment_status,
                         subtotal_minor, discount_minor, shipping_minor, tax_minor, total_minor,
                         advance_paid_minor, balance_due_minor, invoice_id, placed_at
commerce_order_items     id, order_id, variant_id, name_snapshot, qty, unit_price_minor, line_total_minor
commerce_shipments       id, order_id, carrier, tracking, status, shipped_at, delivered_at
commerce_returns         id, order_id, reason, status, refund_minor
```

**Reuse map**

| Commerce need | Existing OS asset |
|---|---|
| Order → invoice | `App\Domain\Sales\Actions\CreateManualInvoice` / `IssueInvoice` |
| Advance / balance | `RaiseAdvanceInvoice`, `RaiseMilestoneInvoice` |
| Payment capture | `RecordPayment`, `VerifyPayment`, `AllocatePayment` |
| Ledger posting | Accounts `JournalEntry` actions |
| Numbering | `NumberSequence` → `WO-2026-0001` |
| Customer identity | `Contact` (+ `Company` for B2B) |
| Notifications | Conversations (WhatsApp/Telegram) + Mailables |
| Audit | `ActivityLog`, `IntegrationLog`, `WebhookEvent` |
| Media | Spatie MediaLibrary (already installed) |
| Money | `App\Support\Money` (minor units) + `brick/math` |

---

## 6. Money and order flows

### 6.1 B2C — cart to cash

```
cart → checkout → order(placed) ──▶ Invoice (draft → issued)
                        │                 │
                        ├─ COD/bank ──────┴─▶ Payment (manual, verified by staff)
                        └─ online ───────────▶ PaymentIntent → gateway redirect
                                                     │
                                              webhook (HMAC verified)
                                                     │
                                     Payment(recorded) → AllocatePayment → Ledger
```

Rules: guest checkout allowed; stock reserved at order placement and released on cancel/timeout;
refunds create a `commerce_returns` row and a credit note through Sales (never a delete).

### 6.2 B2B — RFQ to production (reuse, don't reinvent)

```
storefront "Request quote" ─▶ POST /api/storefront/v1/quotes
                              └─▶ CaptureLead (CRM)  +  CreateQuote (Sales)
                                   │
                    admin revises / approves / sends (existing screens)
                                   │
                    RaiseAdvanceInvoice (75%) ─▶ Payment ─▶ manufacturing (Projects)
                                   │
                    balance invoice (25%) ─▶ delivery ─▶ closed
```

The OS already has `QuoteMilestone`, `QuoteVersion`, `SendQuoteByWhatsApp`, `AcceptQuote` and PDF designs — the
commerce work here is an **inbound endpoint and a customer-facing status page**, not a new quote engine.

### 6.3 Payments (phased)

| Phase | Methods |
|---|---|
| P2 | Bank transfer (with proof upload — exists), Cash on delivery |
| P3 | **Safepay** (cards, wallets, Raast) as primary; JazzCash + easypaisa direct |
| later | Installments / B2B credit terms (already modelled in Accounts) |

Start merchant onboarding in P0 — Safepay/JazzCash approval takes 2–4 weeks.

---

## 7. API surface

Canonical contract: [`openapi.yaml`](./openapi.yaml) — retargeted to `/api/storefront/v1`, matching the OS's
existing `api/public/*` conventions (throttled, stateless, no session cookies).

| Group | Endpoints | Auth |
|---|---|---|
| Catalog | `/products`, `/products/{slug}`, `/categories`, `/series`, `/materials`, `/room-packages` | public, cached |
| Content | `/posts`, `/posts/{slug}`, `/services`, `/projects`, `/showrooms` | public, cached |
| Quote | `POST /quotes`, `GET /quotes/{no}?token=`, `POST /quotes/{no}/accept`, `GET /quotes/{no}/pdf` | token |
| Cart | `POST /carts`, `PATCH /carts/{id}/items`, `GET /carts/{id}` | cart token |
| Checkout | `POST /checkout`, `GET /orders/{no}?token=` | cart token / order token |
| Payments | `POST /payments/intents`, `POST /webhooks/{gateway}` | idempotency key / HMAC |
| Leads | `POST /leads`, `POST /newsletter` | throttled |
| Agent | `POST /agent/ask`, `POST /agent/tools/{tool}` | bearer (MCP) |

Implementation notes:
- Laravel **route middleware** `throttle:storefront-*`, `ETag` + `Cache-Control` on catalog, `Idempotency-Key`
  on writes.
- Responses use the existing `api/public` JSON conventions; no API version bump of existing endpoints.
- Reuse the existing `AuthenticateMcpBridge` for agent tooling; extend the read-only tool list with commerce tools.

---

## 8. E-commerce agent ("complete with e-commerce agent")

Build **on** the existing Assistant/Bot domain — do not add a new AI stack.

| Capability | Tools exposed to the agent | Channel |
|---|---|---|
| Product discovery | `search_products`, `get_product`, `compare_products`, `check_stock` | Web chat widget, WhatsApp, Telegram |
| Quote drafting | `draft_quote`, `add_quote_items`, `price_quote` (rules-based), `send_quote_for_approval` | Staff-side assistant |
| Order support | `order_status`, `track_shipment`, `payment_status` | Customer chat |
| Lead capture | `capture_lead`, `book_site_visit` | All |
| Content | `search_content`, `get_faq` | Website chat |
| Handoff | `escalate_to_human` → Conversations inbox | All |

**Guardrails**

- Prices come from the price-list service, never generated by the model; the agent may quote only within
  configured discount limits, otherwise it drafts for human approval.
- Every tool call writes `BotUsage` + `ActivityLog`; a transcript is retained in `Conversations`.
- No payment execution, refunds, or stock edits by the agent.
- Hard handoff on: custom manufacturing, > configured discount, complaints, legal/credit terms.
- Urdu/English detection with the same answer policy; template-only outbound on WhatsApp (policy compliance).

---

## 9. Admin screens (Livewire, same design system)

| Screen | Route | Reuses |
|---|---|---|
| Products | `/admin/commerce/products` | MediaLibrary, data table patterns, permission gates |
| Product editor | `/admin/commerce/products/{id}` | Livewire form + media picker |
| Categories & collections | `/admin/commerce/taxonomy` | nested set |
| Price lists | `/admin/commerce/prices` | Sales rate book |
| Inventory | `/admin/commerce/inventory` | stock movements, alerts |
| Orders | `/admin/commerce/orders` | invoice actions, payment recording |
| Shipments & returns | `/admin/commerce/fulfilment` | Projects delivery |
| Storefront settings | `/admin/commerce/settings` | Spatie Settings |

All screens sit behind new permissions (`commerce.view`, `commerce.manage`, `commerce.pricing`, `commerce.fulfil`)
and appear in the existing admin navigation.

---

## 10. Frontend integration (this repo)

| Step | Work | Gate |
|---|---|---|
| 1 | `src/lib/api/` typed client (`VITE_API_BASE_URL`), error normalisation, retries | unit tests |
| 2 | `VITE_DATA_SOURCE=static\|api` repository switch; static stays default | site never breaks |
| 3 | Migrate reads in order: Shop → ProductDetail → Series → RoomPackages → Projects → Materials → Blog → Services | parity check per page |
| 4 | Quote basket → `POST /quotes`; cart → server cart; checkout page → `POST /checkout` | e2e |
| 5 | SEO: prerender 23 routes now; evaluate Next.js ISR in Phase 4 | crawl diff |
| 6 | Auth (optional): OTP email/WhatsApp for order history | — |

---

## 11. Delivery plan — parallel tracks

The owner selected "everything in parallel". That is achievable **only with ≥3 people**; the dependency graph below
is what actually allows it.

```
P0  Foundations ──────────────────────────────────────────────┐ (2 wks)
     ├─ Track A: Commerce schema + models + seeders ───────────┤
     ├─ Track B: Storefront API (catalog read) ────────────────┤
     ├─ Track C: Frontend API client + repository switch ──────┤
     └─ Track D: Payments onboarding + WhatsApp templates ─────┘
P1  Catalog live (5–6 wks): A+B+C → storefront reads OS data
     ├─ Track E: Bagisto-pattern cart/order domain ────────────┐
     ├─ Track F: Checkout + invoice/payment bridge ────────────┤
     └─ Track G: Admin commerce screens ───────────────────────┘
P2  B2C live (10 wks): cart → checkout → invoice → payment (bank/COD)
P3  Online payments (12–13 wks): Safepay/JazzCash/easypaisa + webhooks
P4  B2B self-serve (14 wks): RFQ portal, quote acceptance, advance payment, status page
P5  Agent (15–17 wks): commerce tools, WhatsApp/web channels, guardrails, dashboards
P6  Hardening & launch (18–20 wks): e2e, load, backups, DR, training, cutover
```

| Team shape | Calendar | Realistic parallel tracks |
|---|---|---|
| 1 developer (solo) | 32–40 weeks | Sequential; agent last |
| 2 developers | 20–24 weeks | 2 tracks |
| **3 developers (1 Laravel, 1 frontend, 1 Laravel/QA)** | **16–20 weeks** | **4 tracks — matches "all in parallel"** |
| 4+ | 14–16 weeks | diminishing returns on shared hosting |

**Critical path:** commerce schema → catalog API → frontend switch → cart/order → payment bridge. Everything else
(agent, CMS, SEO, admin polish) can run beside it.

---

## 12. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | Commerce writes bypass audited financial actions | **Critical** | Enforce via architecture test: no writes to `payments`/`journal_*` outside Sales/Accounts actions |
| 2 | Hostinger shared hosting limits (memory, cron-only queue) | High | Measure early in P0; keep payloads small, cache aggressively; move to VPS if limits hit |
| 3 | Existing OS open items (F05, reconciliation, certification) resurface | High | Freeze those areas; commerce adds tables/routes only; no edits to frozen documents |
| 4 | Payment gateway onboarding delays | High | Start in P0; bank/COD first |
| 5 | Parallel tracks conflict in the same repo | Medium | Domain boundaries + feature branches + daily merge; tests as the contract |
| 6 | Scope creep (marketplace, multi-currency, multi-vendor) | High | Explicitly out of scope for v1 |
| 7 | SEO regression when the storefront switches to API | High | Prerender + crawl diff before/after |
| 8 | Secrets exposure (historical) | Critical | Rotate all keys before any payment credential is added |

---

## 13. Security

- New permissions for every commerce route; `AdminRouteAccessTest` extended.
- Cart/order tokens are unguessable, expiring, single-purpose; no customer enumeration.
- Webhook HMAC verification + replay window; idempotency keys on all writes.
- No card data touches the server (hosted gateway only).
- Stock and price changes are audited (`ActivityLog`), and pricing changes require `commerce.pricing`.
- Backups: existing Spatie Backup schedule extended to commerce tables; restore test in P6.

---

## 14. Decisions still open

1. **Architecture:** native Commerce domain (recommended) vs Bagisto sidecar vs Bagisto-first.
2. **Catalog depth at launch:** simple price + images, or full variant matrix (series × finish × colour × size)?
3. **Payments at launch:** bank + COD only, or block launch on Safepay/JazzCash approval?
4. **Agent autonomy:** read-only answers, or may it draft quotes (never send) in v1?
5. **Team:** how many developers, and is there a hard launch date?
6. **Storefront SEO:** prerender the SPA, or schedule the Next.js migration now?
