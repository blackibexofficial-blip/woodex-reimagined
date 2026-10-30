# Admin Map & Quick Tasks

Three pictures, no prose. Measured from the OS clone (`c437cad`) and the live storefront
(`sbx-6hrgnvda5zy72gi6.arena.site`).

---

## 1. The admin page map

![Admin page map](./mockups/admin-map.png)

One sidebar. Every dot marked **orange** is a screen this plan adds. Everything unmarked already exists in the OS
today (Sales, Accounts, CRM, Projects, Inbox, Marketing, System).

**New commerce screens (14):** Dashboard · Products · Attributes · Categories · Inventory · Orders · Invoices ·
Payments · Refunds & Returns · Promotions · Shipping & Tax · Customers · Reports · Settings.

**New elsewhere (10):** Cases/Support · Warranties · Claims · RMA · Puck Studio · FAQ library · Showrooms ·
Materials & colours · Markets · Dealer applications · Service jobs.

---

## 2. The three screens that decide whether it works

![Three screens](./mockups/admin-screens.png)

| Screen | Why it is the one to get right |
|---|---|
| **Products** | If the catalog grid is slow or awkward, staff stop using it and every price becomes a ticket |
| **Order detail** | Items, money breakdown, actions and timeline on one page — the whole money story visible at once |
| **Puck Studio** | Blocks on the left, live page in the middle, bindings on the right. Publish writes JSON, not files |

---

## 3. What the storefront shows today vs. what the OS gives it

![Storefront map](./mockups/storefront-map.png)

Nine surfaces, all currently ending in a toast. The right half of each card is the deliverable.

---

## 4. Quick tasks — first six weeks

Ordered. Each row is one shippable thing, not a phase.

| # | Task | Owner | Days | Done when | Status |
|---|---|---|---|---|---|
| **T1** | `Money` value object + `CartCalculator` skeleton | A | 2 | Integer paisa everywhere, no float in the path | ✅ **done** |
| **T2** | 14 golden total fixtures + sum-invariant property test | A | 2 | Tests run red, then green | ✅ **done** — 16 tests / 13,371 assertions |
| **T3** | Commerce catalog tables (11) + factories + seeder | A | 3 | `migrate:fresh --seed` → 20 products, 4 categories |
| **T4** | Admin shell: Commerce group, empty screens, permissions | B | 2 | Sidebar shows 14 screens, unauthorized users blocked |
| **T5** | Products admin: list, filter, search, inline price/stock | B | 4 | Staff edit a price without a developer |
| **T6** | Media pipeline: upload → 3 sizes + WebP, outside web root | B | 2 | One image end-to-end, served with cache headers |
| **T7** | `GET /products`, `/products/{slug}`, `/categories` | B | 2 | Cached 5 min, typed client generated |
| **T8** | Puck Studio at `/admin/studio` behind OS session | C | 3 | Editor opens, drag-drop, saves JSON |
| **T9** | Registry v1: 8 blocks, editor + Blade renderer, parity test | C | 4 | Same JSON → same HTML, CI fails on drift |
| **T10** | Serve `pages` / `page_blocks` at `/p/{slug}`, cached | C | 3 | A page created in Studio renders on the site |
| **T11** | **Vertical slice: product → cart → COD order → invoice** | A+B | 5 | A real order exists in the DB with correct totals |
| **T12** | Load probe: 30 concurrent catalog + 5 checkouts | A | 2 | p95 < 1.5 s, zero 5xx, zero oversell |

**Built:** `platform/app/Domain/Commerce/` (Money, CartLine, DiscountRule, ShippingMethod, CartInput, LineTotal, CartTotals, CartCalculator) + 14 fixtures + runner. Run it with `php platform/tests/run.php`.

**Built:** T1–T7. Next: T8–T10 (Puck), then T11 the vertical slice — product → cart → COD order. **Week 2:** T5–T7. **Week 3:** T8–T10. **Week 4:** T11–T12 → gate.

**T1–T2 are code, not a document.** They live in `platform/` and pass: 16 tests, 13,371 assertions, 1,000 generated carts.

After T12 passes, the remaining work is repetition: 30 more tables, 10 more screens, 18 more blocks, 9 surfaces.

---

## 5. What is deliberately not on this list yet

Checkout UI polish · promotions · RMA depth · multi-currency · AI agent tools · the 142-page migration.
All of it is specified in `MASTER-PLAN.md` §3 and comes after the vertical slice proves the money path.
