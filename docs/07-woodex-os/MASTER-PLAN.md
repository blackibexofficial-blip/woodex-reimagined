# Reimagin OS — Master Plan v6

**One application. One admin. One database. One page builder. One AI agent.**

| | |
|---|---|
| **Application** | **WOODEX OS** — Laravel 13 · PHP 8.4 · Livewire 4.4 · MySQL 8 |
| **Commerce** | Bagisto's complete feature set, built as `App\Domain\Commerce` **inside** the OS |
| **Page builder** | **Puck 0.24** (`@puckeditor/core`, MIT) — the only builder |
| **Frontend** | React 18 + Vite + TS storefront (23 routes, 148 products, 0 API calls today) |
| **AI** | OS agent — 7 tools today, 14 at launch |
| **Hosting** | **Hostinger shared. No VPS.** |
| **Team** | 3 developers |
| **Calendar** | **28 weeks**, public launch **week 20** |

> **v6 supersedes v5.** v5 ran Bagisto as a second site on a subdomain. The owner rejected that: **no Bagisto engine,
> one master admin.** Commerce is now a first-class domain inside WOODEX OS, with Bagisto as the reference
> implementation — feature set, semantics and MIT-licensed algorithms. Spec: `COMMERCE-IN-OS.md`.

---

## 1. Decisions, locked

| # | Decision | Consequence |
|---|---|---|
| D1 | **One app**: WOODEX OS is the master admin | One deploy, one DB, one login, one audit log |
| D2 | **Bagisto is not run** — not as a site, not as vendored packages | No second runtime, no API bridge, no sync drift |
| D3 | Commerce is `App\Domain\Commerce`, feature parity with Bagisto's matrix | 34 tables, 14 admin screens, `COMMERCE-IN-OS.md` |
| D4 | Money = integer paisa + `Money` value object; totals in one `CartCalculator` | Golden tests guard every pricing change |
| D5 | **Puck is the only page builder**, embedded in the OS admin | 142 legacy pages migrate; component registry is the contract |
| D6 | Marketing server-rendered (Blade), transaction surfaces SPA | Indexable without Node on the host |
| D7 | **Hostinger shared** — no Node, no Redis, no workers, no websockets | Cron queues, file cache, polling |
| D8 | **Vertical-slice gate at week 3**: one product → cart → COD order on real infra | Cheapest possible proof of the money path |
| D9 | Launch: simple + configurable products, PKR, bank + COD; gateways behind flags | Safepay parallel, JazzCash later |
| D10 | Seed data only; no Supabase migration | CSV import from the existing 148 products |
| D11 | AI agent autonomous **within limits**, every call logged | Human approval for refunds and price changes |

---

## 2. System map

```
                    ┌──────────────────────────────────────────────────────┐
  visitor ─────────►│  woodex.pk — storefront                              │
                    │  marketing/product pages → Blade + Puck JSON         │
                    │  cart/checkout/account   → React SPA                 │
                    └───────────────────────┬──────────────────────────────┘
                                            │ /api/storefront/v1
                    ┌───────────────────────▼──────────────────────────────┐
                    │  WOODEX OS — admin.woodex.pk                         │
                    │                                                      │
                    │  Commerce    Catalog · Cart · Checkout · Orders ·    │
                    │              Invoices · Payments · Refunds · RMA ·   │
                    │              Promotions · Shipping · Tax · Stock     │
                    │  Sales       Quotations · Advances · Milestones      │
                    │  Accounts    double-entry ledger                     │
                    │  CRM         people · companies · deals · pipeline   │
                    │  Projects    custom design · installs · service      │
                    │  Inbox       conversations · AI agent                │
                    │  Website     Puck pages · blog · FAQ · showrooms     │
                    └───────────────────────┬──────────────────────────────┘
                                            │
                                     ┌──────▼──────┐
                                     │  MySQL 8    │  one database, 132 tables
                                     └─────────────┘
```

No subdomain for commerce. No second Laravel app. No BFF — the API is the OS's own route file.

---

## 3. The three workstreams

### A — Commerce domain · 2 devs, weeks 1–20

| A# | Deliverable | Week |
|---|---|---|
| A1 | `Money`, `CartCalculator` skeleton, 14 golden fixtures, sum-invariant property test | 1–2 |
| A2 | Catalog schema: products, translations, attributes, options, categories, brands, media | 2–4 |
| A3 | Variants, per-group prices, inventory sources (Lahore / Karachi / online) | 4–5 |
| A4 | **Vertical slice on real infra**: product → cart → COD order → invoice | 5–6 |
| A5 | Admin: Products, Categories, Attributes, Inventory (Livewire, permissioned) | 5–8 |
| A6 | Cart + checkout: guest/registered, addresses, recalculation API | 7–9 |
| A7 | Orders: states, history, admin edit with audit, invoices + PDF | 8–10 |
| A8 | Payments: bank transfer verification queue, COD caps, `payment_events` idempotency | 9–10 |
| A9 | Tax (PK rates, inclusive/exclusive), shipping zones & methods, free-over threshold | 10–12 |
| A10 | Storefront wiring: catalog API, product pages, cart/checkout SPA flows | 10–13 |
| A11 | Customer accounts: register, login, address book, order history, invoices | 12–13 |
| A12 | **Quotation → order** (one click, line prices preserved) | 13–14 |
| A13 | Promotions: cart rules, catalog rules, coupons, usage limits | 14–16 |
| A14 | Refunds (full/partial, line-level), returns/RMA, restock | 15–17 |
| A15 | Reports: sales, tax, stock valuation, coupons, abandoned carts | 17–19 |
| A16 | Load test: 30 concurrent checkouts, zero oversell, p95 < 1.5 s | 19 |
| A17 | Safepay live; CSV import/export; multi-currency; channels | 17–20 |

*Full spec, schema and pipeline: `COMMERCE-IN-OS.md`.*

### B — CMS, Puck builder, content · 1 dev + ½, weeks 1–20

| B# | Deliverable | Week |
|---|---|---|
| B1 | Puck Studio embedded at `/admin/studio`, auth via OS session | 2–4 |
| B2 | Registry v1: 26 blocks, one schema, two consumers (editor + Blade renderer) | 4–6 |
| B3 | **Serve `pages` / `page_blocks`** — Puck JSON → Blade, cached, preview tokens | 5–7 |
| B4 | Commerce-bound blocks: product grid, category tiles, materials, showroom map, quote CTA | 7–9 |
| B5 | Media library, variants, focal points, alt-text enforcement | 8–9 |
| B6 | Blog/insights + `content_entries` (FAQ, testimonials, logos) actually served | 9–11 |
| B7 | SEO: sitemap, canonical, JSON-LD (Product, FAQPage, LocalBusiness, Breadcrumb), redirects | 10–12 |
| B8 | Migrate the 142 static pages (M0–M7 groups), 301 map | 11–16 |
| B9 | Inline editing from the storefront ("edit this page"), draft/publish/rollback | 14–16 |
| B10 | Content ops: scheduled publish, translations, roles | 17–20 |

*Spec: `PUCK-BUILDER.md`.*

### C — Parity modules, AI, hardening · 1 dev + ½, weeks 6–28

| C# | Feature | Week |
|---|---|---|
| C1 | **E-Quotation public** — basket → numbered PDF → signed link → accept | 6–8 |
| C2 | **FAQ** — wire the existing `ContentEntry` (already a table, served by nothing) | 6 |
| C3 | **Support cases** — public intake → Conversations + SLA + case number | 8–9 |
| C4 | **Showrooms + appointments** → CRM visits, staff calendar | 9–11 |
| C5 | **Materials & colours** → bound to the commerce attribute system | 10–12 |
| C6 | **Warranty** registration + claims → service jobs on order lines | 12–15 |
| C7 | **Custom design** brief → Project + quote draft | 14–16 |
| C8 | **Distributors** application → CRM pipeline → customer group = Dealer | 15–17 |
| C9 | **Markets** pages + enquiry pipeline | 17–18 |
| C10 | AI agent: 14 tools (catalog, order status, quote draft, appointment, warranty, ticket, page draft, translate) | 12–20 |
| C11 | Guardrails: allow-list, spend caps, approval gates, full audit | 16–20 |
| C12 | Load, security review, backup/restore drill, runbooks, handover | 21–28 |

*Spec: `FEATURE-PARITY.md`.*

---

## 4. Phases

| Phase | Weeks | Goal | Exit gate |
|---|---|---|---|
| **P0 Foundations** | 1–2 | Money, cart calculator, schema skeleton, admin patterns, Puck spike | Golden totals green in CI |
| **P1 Catalog** | 3–6 | Products, variants, stock, admin screens, product pages | **Vertical slice: a real COD order** |
| **P2 Sell** | 7–12 | Cart, checkout, orders, invoices, payments, tax, shipping | First 10 real orders |
| **P3 Complete** | 13–17 | Promotions, refunds, RMA, quote→order, accounts, reports | 14 golden cases pass in production-shaped data |
| **P4 Launch** | 18–20 | Nine parity surfaces, 142 pages, SEO, Safepay | **Public launch, week 20** |
| **P5 Depth** | 21–24 | AI agent live, multi-currency, channels, reviews, import/export | Agent resolves 40 % of tickets |
| **P6 Harden** | 25–28 | Load, security, DR drill, docs, handover | Zero unexplained drift 14 days |

**Scope at launch (week 20):** complete commerce for simple + configurable products, all nine storefront surfaces,
30+ Puck pages, bank + COD + Safepay.
**Complete at week 28:** everything in `COMMERCE-IN-OS.md` §2 except the explicitly excluded list.

---

## 5. Team of 3

| Dev | Weeks 1–10 | Weeks 11–20 | Weeks 21–28 |
|---|---|---|---|
| **A — Commerce core** | Money, cart calculator, catalog, variants, stock, checkout | Orders, payments, tax, shipping, promotions, refunds | Multi-currency, reports, performance |
| **B — Commerce admin + storefront** | Admin screens, catalog API, product pages | Cart/checkout SPA, accounts, quote→order | Import/export, reviews, wishlist |
| **C — CMS, Puck, AI** | Puck Studio, registry, page rendering | 142-page migration, commerce blocks, SEO | AI agent tools, guardrails, hardening |

**Review rules:** every pricing/tax/refund change is reviewed by a second dev and must keep the 14 golden totals green.
No one owns a domain alone.

---

## 6. Data

| Area | Tables | Note |
|---|---|---|
| Commerce | **34** (`commerce_*`) | `COMMERCE-IN-OS.md` §3 |
| Parity modules | ~15 | showrooms, materials, warranty, cases, dealer, markets, design |
| CMS | 4–6 | `pages`, `page_blocks`, `page_revisions`, `redirects`; reuse `content_entries` |
| Existing OS | 98 | untouched except nullable link columns |

132 tables total at completion. Additive migrations only. `php artisan migrate` stays forward-only; no data import
from Supabase; the 148 products arrive via CSV.

---

## 7. AI agent

**Today:** 7 read-only tools. **At launch:** 14, scoped to one customer and one session.

| Group | Tools | Guardrail |
|---|---|---|
| Catalog | search, detail, stock, compare | read-only |
| Orders | status, invoice, tracking | customer-scoped, no PII echo |
| Sales | draft quotation, book appointment | draft only — a human sends |
| Service | open ticket, check warranty, raise claim | claim ≤ auto-approve limit |
| Content | draft page section, rewrite for SEO, translate | publish requires approval |
| Ops | summarise ticket, suggest reply | never auto-sends money messages |

**Hard limits:** no refunds, no price changes, no deletions, no customer email above threshold without approval.
Every call logged with input, output, tokens, decision. Cost cap per conversation and per day. Escalation is a
first-class outcome.

---

## 8. Risks (ranked)

| # | Risk | Prob | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Money bug** in totals/tax/refund | Med | Severe — wrong invoices, chargebacks | Ported Bagisto pipeline, 14 golden fixtures, invariant property test, dual review, no float |
| R2 | Commerce scope is larger than expected | **High** | Launch slip | Feature matrix is the contract; §8 exclusions explicit; launch at week 20 with core, complete at 28 |
| R3 | Admin screens become the bottleneck | High | Slip | Livewire patterns established in P0; screens built in parallel from week 5 |
| R4 | 142-page migration stalls on bespoke layouts | High | Slip | Component library first; migrate top 30, 301 the rest |
| R5 | Shared-host limits under checkout load | Med | Slow/500s | Page cache, catalog cache, row locks kept short, load test at week 19 |
| R6 | Oversell under concurrency | Med | Angry customers | `SELECT … FOR UPDATE`, parallel-order test in CI |
| R7 | Scope creep from "complete CMS" | High | Everything slips | P0–P4 scope frozen; new asks → P5 backlog |
| R8 | AI hallucinating order data | Med | Trust | Tools return structured rows only; no free-text over DB |

**R1 is the risk that matters.** Everything else costs time; a money bug costs the business.

---

## 9. Budget

| Line | Monthly |
|---|---|
| Hostinger shared (Business) | $4–9 |
| Domain + SSL | ~$1 |
| Transactional email | $0–15 |
| WhatsApp Business API | usage |
| Gateway fees | 2–3 % of online revenue |
| **Infra floor** | **≈ $10–25/mo** |

No second hosting slot, no headless service, no Redis add-on. If the account outgrows shared, the same codebase
moves to a bigger box unchanged — that is the dividend of a single app.

---

## 10. Launch checklist (week 20)

- [ ] Guest checkout completes with COD and with bank transfer
- [ ] Product page indexable, in sitemap, JSON-LD valid
- [ ] Order confirmation email + WhatsApp
- [ ] 40 real orders reconciled to the paisa
- [ ] All nine public surfaces submit to the OS (no toast-only forms)
- [ ] 30 marketing pages editable by a non-developer with publish + rollback
- [ ] 301 map for every legacy URL; no 404 spike in Search Console
- [ ] Refund of a real order reconciles and restocks
- [ ] Backup restores into a scratch folder in under 30 minutes
- [ ] Runbook: refund, cancel, re-send invoice, edit order, restore page

---

## 11. Explicitly out of scope

Multi-vendor marketplace · downloadable/virtual products at launch · multi-store per domain · Elasticsearch ·
gift cards · loyalty points · subscription billing · POS · payroll/HR · BI warehouse · custom SSO · mobile apps ·
websockets · VPS/Kubernetes/Redis/Node runtime.

---

## 12. What must be true before code starts

Nothing blocks week 1 — the six decisions in `OPEN-QUESTIONS.md` were skipped and their recommended defaults are
adopted. The only one that can still change the shape of the build is **Q6 (hard launch date)**: with a hard date,
week 20 ships core commerce and weeks 21–28 complete it.
