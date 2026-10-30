# Commerce Inside WOODEX OS — Absorbing the Bagisto Feature Set

**Decision (owner, 31 Oct 2026):** Bagisto does **not** run as a separate engine or site. WOODEX OS is the single
master admin. Bagisto's **complete e-commerce feature set** is built into the OS, and Puck is the only page builder.

This document is the build spec: what "complete" means, the schema, the money pipeline, the admin screens, and how it
is proven correct.

---

## 1. What "add Bagisto into the OS" means — precisely

There are three possible readings. We take the third, and this is why.

| Reading | What it is | Verdict |
|---|---|---|
| **A. Run Bagisto as a site** | Separate app, subdomain, its own admin | ❌ **Rejected by the owner** — two admins, two codebases |
| **B. Vendor Bagisto's packages into the monolith** | `bagisto/*` via path repos, its Blade admin inside our app | ❌ Not viable: it *is* the engine, it ships `users`/`customers`/`admin` route prefixes that collide with the OS, and its service providers assume they own the app |
| **C. Absorb the capability, not the code** | A first-class `App\Domain\Commerce` in the OS, whose **feature set is Bagisto's**, whose **algorithms are ported from Bagisto's MIT source** where they're subtle, whose **UI is the OS's Livewire admin** | ✅ **This is the plan** |

So: **one app, one admin, one database, one deploy.** Bagisto is the *reference implementation* for catalog,
cart, checkout, pricing, tax, promotions and RMA — its MIT licence lets us copy the hard parts (tax calculation,
cart totals, coupon rules) into our own classes with attribution. We do not copy its UI, its route table, or its
migration history.

**What that buys us:** no second hosting slot, no API bridge, no sync drift, no duplicated customers, and no
"which admin do I open?" question. **What it costs us:** we own the code — so §9 mitigates that with ported
algorithms and golden tests rather than invention.

---

## 2. The feature set we are absorbing (Bagisto's checklist)

Every row is a shipped capability in Bagisto 2.5. Our column says where it lands in the OS.

| # | Capability | In the OS | Phase |
|---|---|---|---|
| 1 | Product types: simple, configurable, bundle, virtual, downloadable | simple + configurable at launch; bundle/virtual later | C1 |
| 2 | Categories (nested, multi-level, per-channel) | `categories` + translations | C1 |
| 3 | Attributes & attribute families, swatch options | `attributes`, `attribute_options`, `product_attribute_values` | C1 |
| 4 | Variants generated from variant attributes (size/finish) | `product_variants` + generator | C2 |
| 5 | Inventory per source/warehouse, reservations, low-stock alerts | `inventory_sources`, `inventory_items` | C1 |
| 6 | Tax categories, zones, rates, inclusive/exclusive | `tax_*` + calculator | C2 |
| 7 | Price per customer group / channel | `product_group_prices` | C2 |
| 8 | Catalog rules (auto discounts by attribute/time) | `catalog_rules` | C3 |
| 9 | Cart rules + coupons (min spend, per-customer, usage caps) | `cart_rules`, `coupons` | C3 |
| 10 | Guest + registered checkout, address book | `carts`, `cart_addresses`, `customer_addresses` | C2 |
| 11 | Shipping methods & zones (flat, free-over, weight band) | `shipping_*` | C2 |
| 12 | Orders, statuses, history, admin edits with audit | `orders`, `order_items`, `order_status_history` | C2 |
| 13 | Invoices, partial invoices, PDF | `invoices` + existing OS PDF pipeline | C2 |
| 14 | Payments: offline (bank/COD) + gateway, partial capture | `payments`, `payment_events` | C2 |
| 15 | Refunds (full/partial, line-level) | `refunds`, `refund_items` | C2 |
| 16 | Returns / RMA | `returns`, `return_items` — merged with Warranty | C4 |
| 17 | Shipments & tracking | `shipments`, `shipment_items` | C3 |
| 18 | Customer groups (Retail/Dealer/Architect/Corporate) | `customer_groups` | C1 |
| 19 | Multi-currency with per-currency prices | `currencies`, `exchange_rates` | C3 |
| 20 | Channels (web / B2B / export) with own currency+locale | `channels` | C3 |
| 21 | CMS pages & blocks | **Puck** (not Bagisto's) | C1 |
| 22 | SEO per product/category (meta, slug, canonical) | translation columns + OS sitemap | C1 |
| 23 | Product reviews & ratings | `product_reviews` | C4 |
| 24 | Wishlist / compare | `wishlists` | C4 |
| 25 | Import/export CSV (products, stock, prices) | extend OS import utilities | C3 |
| 26 | Reports: sales, tax, stock valuation, abandoned carts | Livewire report screens | C3 |
| 27 | ACL & roles for commerce screens | reuse OS permissions | C1 |
| 28 | Events / webhooks (order placed, paid, shipped) | Laravel events + OS automation rules | C2 |
| 29 | B2B: company accounts, RFQ, credit limits, tier prices | **already native** in OS quotations/CRM — bind them | C4 |
| 30 | Storefront REST consumed by the SPA | `/api/storefront/v1` **served by the OS itself** | C2 |

Rows 29 and 30 are the reason this architecture is *better* for this business than Bagisto standalone: the OS already
has the RFQ/quote/credit engine that Bagisto sells as a separate B2B suite.

---

## 3. Schema — `app/Domain/Commerce`

~34 tables, all prefixed `commerce_` to keep them visible against the OS's 98 existing tables. Money is
`BIGINT` **minor units** (paisa), never float. Every table has `created_at`/`updated_at`.

### Catalog
```
commerce_products        id, sku, type(simple|configurable|bundle|virtual), status, visibility,
                         channel_id, brand_id, tax_category_id, featured, customisable,
                         lead_time_days, warranty_months, created_by
commerce_product_translations  product_id, locale, name, slug, summary, description,
                         meta_title, meta_description  [UNIQUE(product_id,locale), UNIQUE(slug,locale)]
commerce_attributes      id, code, type(select|text|number|bool|multiselect), is_filterable,
                         is_variant, is_required, position
commerce_attribute_options  attribute_id, code, label, swatch_type, swatch_value, position
commerce_attribute_values  product_id, attribute_id, option_id NULL, value_text, value_number
commerce_attributes_map  attribute_id, product_id  (which family a product uses)
commerce_categories      id, parent_id, position, status, channel_id
commerce_category_translations  category_id, locale, name, slug, description, meta_*
commerce_product_categories     product_id, category_id
commerce_brands          id, name, slug, logo, description
commerce_product_media   product_id, variant_id NULL, path, alt, position, is_primary
commerce_product_variants  id, product_id, sku, price_minor, cost_minor, weight_g,
                         barcode, status, position
commerce_variant_options variant_id, attribute_id, option_id
commerce_product_group_prices  variant_id, customer_group_id, price_minor, starts_at, ends_at
```

### Inventory & tax
```
commerce_inventory_sources  id, code, name, city, is_pickup, priority
commerce_inventory_items    variant_id, source_id, qty, reserved, low_stock_threshold
commerce_tax_categories     id, code, name
commerce_tax_zones          id, name, country, province, city, postcode_pattern
commerce_tax_rates          tax_zone_id, tax_category_id, rate_bp (basis points), is_inclusive, priority
```

### Customers
```
commerce_customers       id, person_id (FK CRM), email UNIQUE, phone, password_hash NULL,
                         customer_group_id, channel_id, is_guest, email_verified_at, status
commerce_customer_groups id, code, name, discount_bp, tax_class, is_b2b
commerce_customer_addresses customer_id, label, name, phone, line1, line2, city, province,
                         postcode, country, is_default_shipping, is_default_billing
commerce_wishlists       customer_id, variant_id
commerce_product_reviews product_id, customer_id, rating, title, body, status, verified_purchase
```

### Cart & checkout
```
commerce_carts           id, token UNIQUE (guest), customer_id NULL, channel_id, currency,
                         status(active|converted|abandoned), coupon_code NULL, subtotal_minor,
                         discount_minor, shipping_minor, tax_minor, grand_total_minor,
                         shipping_method_id NULL, expires_at
commerce_cart_items      cart_id, variant_id, qty, unit_price_minor, line_discount_minor,
                         line_tax_minor, line_total_minor, meta JSON
commerce_cart_addresses  cart_id, type(shipping|billing), name, phone, line1, line2, city,
                         province, postcode, country
```

### Orders & money
```
commerce_orders          id, number UNIQUE (WDX-…), customer_id NULL, cart_id, channel_id,
                         currency, fx_rate_bp, status, payment_status, fulfilment_status,
                         subtotal_minor, discount_minor, shipping_minor, tax_minor,
                         grand_total_minor, paid_minor, refunded_minor, coupon_code,
                         placed_at, cancelled_at, notes, source(web|admin|quote)
commerce_order_items     order_id, variant_id, sku, name, qty, unit_price_minor,
                         line_discount_minor, line_tax_minor, line_total_minor, meta JSON
commerce_order_addresses order_id, type, same columns as cart_addresses
commerce_order_status_history order_id, from_status, to_status, note, actor_id, created_at
commerce_invoices        id, number, order_id, status, issued_at, due_at, total_minor, pdf_path
commerce_invoice_items   invoice_id, order_item_id, qty, amount_minor
commerce_payments        id, order_id, invoice_id NULL, gateway(bank|cod|safepay|jazzcash),
                         reference, amount_minor, status(pending|paid|failed|refunded),
                         paid_at, payload JSON
commerce_payment_events  gateway, event_id UNIQUE, payload, processed_at   ← idempotency
commerce_refunds         id, order_id, payment_id, amount_minor, reason, status, refunded_at, actor_id
commerce_refund_items    refund_id, order_item_id, qty, amount_minor
commerce_shipments       id, order_id, carrier, tracking_number, shipped_at, delivered_at
commerce_shipment_items  shipment_id, order_item_id, qty
commerce_returns         id, order_id, number, status, reason, opened_at, closed_at
commerce_return_items    return_id, order_item_id, qty, condition, resolution
```

### Pricing rules & shipping
```
commerce_catalog_rules   id, name, conditions JSON, discount_type, amount, starts_at, ends_at, priority
commerce_cart_rules      id, name, conditions JSON, actions JSON, stop_further_rules, priority
commerce_coupons         id, cart_rule_id, code UNIQUE, usage_limit, per_customer_limit,
                         usage_count, starts_at, ends_at
commerce_coupon_usages   coupon_id, customer_id NULL, cart_id, used_at
commerce_shipping_zones  id, name
commerce_shipping_zone_locations zone_id, country, province, city
commerce_shipping_methods id, zone_id, code(flat|free_over|weight_band|cod), label,
                         base_rate_minor, free_over_minor, bands JSON, is_cod, position
```

### Platform
```
commerce_channels        id, code, name, currency, locale, customer_group_id, is_active
commerce_currencies      code, symbol, rate_bp, is_base, updated_at
commerce_sequences       key, prefix, next, padding        (order/invoice/RMA numbers)
commerce_activity_log    subject_type, subject_id, action, actor_id, diff JSON
```

**34 tables.** All additive — no existing OS table is altered except new FK columns on `people`/`companies`
(`commerce_customer_id`, nullable).

---

## 4. The money pipeline (the part that must be exactly right)

Order of operations, identical to Bagisto's semantics, evaluated server-side in one `CartCalculator`:

```
1  line unit price      = variant price, overridden by group price / catalog rule
2  line subtotal        = unit × qty
3  catalog discounts    = applied per line, allocated proportionally, rounded half-up
4  cart rule discounts  = evaluated on the post-catalog subtotal; distributed across lines
                          proportionally to their subtotal, remainder to the largest line
5  shipping             = method rate for zone + weight + cart value
6  tax                  = per line, on (subtotal − discounts), by tax zone/category,
                          inclusive rates extracted, exclusive rates added
7  grand total          = Σ(line totals) + shipping + tax on shipping − discounts
```

**Invariants enforced by tests, not by convention:**
- `Σ line_total + shipping + tax = grand_total` — always, for every fixture.
- No float anywhere; `Money` value object wrapping integer paisa + currency.
- Rounding: half-up per line; **the remainder is never dropped**, it is pushed to the largest line so the sum
  invariant holds to the paisa.
- A coupon that makes a line negative is capped at the line subtotal, never at zero-crossing.
- Recalculating an unchanged cart is deterministic (same input → byte-identical totals).

**Concurrency:** stock is decremented inside the placement transaction with
`SELECT … FOR UPDATE` on `commerce_inventory_items`; failure rolls back the order. On shared hosting the
concurrency ceiling is ~30 entry processes, so row locks are held for milliseconds, not seconds.

**Idempotency:** every payment callback writes `commerce_payment_events(event_id UNIQUE)` first; a duplicate is
acknowledged and ignored. Placing an order accepts an `Idempotency-Key` and returns the same order number on retry.

---

## 5. Admin — inside the existing OS, one navigation

New **Commerce** group in `App\Support\AdminNavigation`, matching the existing visual language (Livewire 4 + Blade,
no new JS framework):

| Screen | What it does |
|---|---|
| **Dashboard** | today's orders, revenue, AOV, low stock, abandoned carts, pending refunds |
| **Products** | list/filter, inline price+stock edit, media, variants, translations, SEO panel |
| **Attributes** | families, options, swatches |
| **Categories** | drag-order tree, per-channel visibility |
| **Inventory** | per-warehouse grid, bulk adjust, low-stock alerts, stock valuation |
| **Orders** | list → detail: items, addresses, totals breakdown, timeline, invoice, refund, shipment |
| **Invoices** | issue, PDF, mark paid, credit note |
| **Payments** | offline verification queue (bank transfers), gateway events, reconciliation |
| **Refunds & Returns** | approve with reason, line-level, restock toggle |
| **Promotions** | cart/catalog rules builder, coupons, usage report |
| **Shipping & Tax** | zones, methods, rates, tax matrix |
| **Customers** | groups, price tier, addresses, orders, quotes, tickets — the 360° view |
| **Reports** | sales by day/product/category, tax, stock, coupons, CSAT |
| **Settings** | channels, currencies, sequences, low-stock thresholds |

**Every commerce screen lives under the same sidebar as CRM/Sales/Projects/Website.** That is the point of this
architecture: one admin, one search, one permission model, one audit log.

---

## 6. Storefront — how the SPA and the Blade pages consume it

The API is the OS's own `routes/storefront.php` — **no proxy, no BFF, no second hop.**

| Surface | Renderer | Data |
|---|---|---|
| Home, category, collection, showroom, materials, FAQ, blog, market | Blade + Puck | `commerce_products` via `CatalogService` (cached 5 min) |
| Product detail | Blade | product + variants + stock + reviews + related |
| Cart / checkout / account / order tracking | React SPA | `POST /carts`, `/checkout`, `/orders/{n}` |
| Quote request | React SPA | existing OS Sales quote actions |
| Custom design brief | React SPA | existing OS Projects intake |

Cart identity: guest cart by signed cookie token → merged into the customer cart on login. The SPA never stores
prices; every total shown comes from `POST /carts/{id}/recalculate`.

---

## 7. Payments, tax, shipping for this business

| Area | Launch | Later |
|---|---|---|
| Bank transfer | manual verification queue in admin, 24 h SLA | auto-match by amount + reference |
| Cash on delivery | per-zone availability, cap PKR 150,000 | courier remittance reconciliation |
| Card/wallet | Safepay (cards, wallets, Raast) — hosted redirect, HMAC webhook | JazzCash / easypaisa |
| Tax | PK sales tax, configurable per category, exclusive pricing | export zero-rating per tax zone |
| Shipping | flat + free-over + weight bands, per city zone | courier API + live rates |

No card data touches our server: redirect flow + webhook verification only. This matters more on shared hosting,
where the server is not PCI-isolated.

---

## 8. Deliberately not absorbed

Multi-vendor marketplace · downloadable/virtual products at launch · multi-store per domain · Bagisto's Granular/
Elasticsearch search stack · its Vue admin · its RMA visual workflow designer · wishlist sharing · gift cards.

These are recorded as *not planned*, not as *missing* — see `MASTER-PLAN.md` §11.

---

## 9. Porting from Bagisto, honestly

| Bagisto source (MIT) | What we port | Why |
|---|---|---|
| `Cart` / `CartItem` / `Cart::$total` pipeline | order of operations, discount distribution, rounding | This is 8 years of edge cases; re-deriving it is how money bugs happen |
| `Tax\...\Calculator` | inclusive vs exclusive extraction, zone matching priority | Tax is regulated and unforgiving |
| `CartRule` / `CatalogRule` condition trees | condition/action JSON shape and evaluation order | Reuses a proven rule DSL instead of inventing one |
| `Coupon` validation | per-customer limits, stacking, stop-further-rules | Prevents discount abuse |
| `Inventory` reservation model | decrement-on-place + restore-on-cancel semantics | Prevents overselling |
| `Price` / `Currency` conversion | basis-point rates, rounding | Deterministic FX |

**Licence:** MIT — derivative code must retain the copyright notice. We add an `ATTRIBUTION.md` in
`app/Domain/Commerce/` listing each ported file and its upstream commit. This is a legal requirement, not a courtesy.

**What we never port:** controllers, Blade admin views, route files, migrations, service providers, the Vue admin.

---

## 10. Proof — the acceptance suite

| Test | Fixture |
|---|---|
| **Golden totals** (14 cases) | `01_simple` · `02_qty_gt_one` · `03_group_price` · `04_catalog_rule` · `05_cart_rule` · `06_coupon_capped` · `07_free_shipping_threshold` · `08_tax_inclusive` · `09_tax_exclusive` · `10_mixed_tax_rates` · `11_taxed_shipping` · `12_discount_split_remainder` · `13_rounding_half_up` · `14_zero_price_line` — all in `platform/tests/fixtures/commerce/totals/` |
| **Sum invariant** | property test: 1,000 random carts → `Σ lines + shipping + tax = grand total` |
| **Oversell** | 10 parallel orders for 1 unit → exactly 1 succeeds |
| **Idempotency** | same webhook 5× → one payment; same `Idempotency-Key` 3× → one order |
| **Refund math** | partial refund cannot exceed captured amount; restock optional |
| **Coupon abuse** | per-customer limit, expiry, min-spend, stacking refusal |
| **Round-trip** | create order → invoice → ship → refund → reports reconcile to zero |
| **Load** | 30 concurrent checkouts, p95 < 1.5 s, zero 5xx |

CI runs all of these on every push. **Commerce does not ship without the golden totals green.**

**Status (T1–T2 done):** `Money`, `CartCalculator` and the 14 fixtures are implemented and green —
**16 tests, 13,371 assertions**, including the 1,000-cart property run. See `platform/README.md`.

---

## 11. Risks of owning the code — and the mitigations

| Risk | Mitigation |
|---|---|
| Money bugs | Ported pipeline + 14 golden fixtures + invariant property test + code review by a second dev on every pricing change |
| Scope creep ("Bagisto has X") | Feature matrix in §2 is the contract; anything not listed goes to the backlog, not the sprint |
| Shared-host concurrency | Row locks in short transactions; page cache; 30-process budget measured in week 1 |
| Promotion engine complexity | Ship only flat/percentage + min-spend at launch; condition trees land in C3 |
| Bus-factor | Attribution doc + ADRs per commerce decision, so a new dev can trace "why is the total this" |
| A future migration to real Bagisto | `CatalogService`/`CartCalculator`/`PaymentGateway` interfaces keep the domain swappable |

---

## 12. Definition of done

- [ ] 34 commerce tables migrated, seeded, and covered by factories
- [ ] Admin: all 14 screens, permissioned, audited
- [ ] A guest can buy a simple product end-to-end with COD and with bank transfer
- [ ] A registered dealer sees dealer prices automatically
- [ ] A configurable product (size × finish) sells correctly with per-variant stock
- [ ] Coupon + free-shipping threshold computes correctly in all 14 golden cases
- [ ] Partial refund reconciles to the paisa and restocks the variant
- [ ] A quotation converts to an order with one click, preserving line prices
- [ ] 30 concurrent checkouts, zero oversell, zero 5xx
- [ ] Every marketing page that shows a product reads live catalog data through Puck binding
