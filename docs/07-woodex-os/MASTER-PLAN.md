# Reimagin OS — Master Plan (v4)

**Date:** 31 October 2026 · **Status:** upgraded from v3 after the admin screenshot audit and the module-by-module code review
**Name:** **Reimagin OS** = WOODEX OS (Laravel backend) + **Puck Studio** (replaces the file-based frontend) + **Commerce** + **Storefront API**
**Hosting:** Hostinger **shared hosting** (no SSH, no Node, no Redis) · **Team:** 3 developers · **Target:** 18–22 weeks

> Companion docs: [`ADMIN-UI-AUDIT.md`](./ADMIN-UI-AUDIT.md) (screenshot vs code) · [`PUCK-BUILDER.md`](./PUCK-BUILDER.md) (frontend v1 replacement) ·
> [`FRONTEND-API.md`](./FRONTEND-API.md) (complete API inventory + integration) · [`COMMERCE-DOMAIN.md`](./COMMERCE-DOMAIN.md) · [`HOSTINGER-RUNTIME.md`](./HOSTINGER-RUNTIME.md) ·
> [`OS-BASELINE.md`](./OS-BASELINE.md) · [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) · [`openapi.yaml`](./openapi.yaml)

---

## 1. What changed in v4

| # | Change | Why |
|---|---|---|
| 1 | **Puck Studio is now a core pillar, not an add-on** | `SiteRouter` states *“A page is a file”*: 142 public pages are raw HTML edited by hand. Nothing data-driven (prices, products, stock) can ever live in them. |
| 2 | **The Page Builder and Content modules are explicitly replaced** | Builder edits whole HTML documents (`SaveHtmlFile`); Blog/Portfolio publish by writing HTML shells (`ArticleFile`); `pages`, `page_blocks`, `content_entries` tables are dead weight. |
| 3 | **Admin IA gets a defined target** | Screenshot = revision 49 target: `Website` heading with 6 entries, SEO merged. Code still has 7 loose tools + a separate SEO agent. |
| 4 | **`Preview Owner` is flagged as undefined** | It exists in the screenshot but **nowhere in `app/`**. Must be specified before it is built. |
| 5 | **Frontend API work is staged S0–S5 with contract-first CI** | Only 11 public endpoints exist today; none catalog-shaped. |
| 6 | **Timeline corrected to 18–22 weeks** | Builder replacement (142 pages, parity-gated) runs alongside commerce. |
| 7 | **Storefront work is gated on answers** | Per instruction: questions first — see [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md). |

---

## 2. Ground truth (measured)

### WOODEX OS — `woodex420/woodexinterior` @ `c437cad`

| | |
|---|---:|
| PHP files / lines in `platform/app` | 682 / **73,582** |
| Livewire components / domain models | 117 / 81 |
| Migrations / tables | 82 / **98** |
| Admin route definitions | **106** |
| Test files | 180 *(repo reports 1,722 passing)* |
| Public pages served as static files | **142** |
| Public JSON endpoints | **11** (leads, chat ×3, legacy bridge ×3, MCP ×2, bridge reads ×3) |
| MCP tools (read-only) | **7** |
| Commerce tables | **0** |

### Storefront — this repo

23 routes · 148 products · 28 subcategories · 5 series · 16 materials · 6 posts · 7 projects · dual cart + quote
funnels · **no API client** (`src/data/*` is the only source).

---

## 3. Module status matrix (from the screenshot + code)

| Module (sidebar) | State | Evidence | v4 work |
|---|---|---|---|
| **Reports** | ✅ done | `Reports` Livewire, `ReportRange`, period presets | add commerce KPIs |
| **CRM** | ✅ done | Leads, Contacts, Tasks & Visits, scoring, assignment, SLA, activity feed | lead source = storefront |
| **Sales** | ✅ done | Estimations, Quotes (+versions, approvals, milestones), Invoices, Payments, Documents, PDFs | storefront quote intake |
| **Accounts** | ✅ done | CoA, Journals, Trial balance, P&L, Payables, Expenses, Periods, Payment methods | order → invoice → ledger |
| **Projects** | ✅ done | Projects, Board, Client portal, Handovers | installation scheduling for orders |
| **Inbox** | ✅ done | Conversations (WhatsApp/Telegram/web chat), Chat Bot | **agent activity screen** |
| **Automation** | ✅ done | Automations, Sequences, WhatsApp templates | order/quote triggers |
| **Marketing** | 🟡 partial | Social posting screen | campaign landing pages (Puck) |
| **Pages & Builder** | 🔴 **file-based** | 142 HTML docs, `SaveHtmlFile` | **replace with Puck Studio** |
| **Content** | 🔴 **file-based** | Blog/Portfolio write HTML shells | **rebuild on Puck bodies** |
| **Website** | 🟡 tools only | Media, SEO (+SEO agent separate), Speed, Site health, Theme, Settings | merge SEO tabs, add heading |
| **System** | ✅ done | Settings, Access & team, Connections, Platform | commerce permissions |
| **Commerce** | ❌ **absent** | no products/carts/orders/stock | **build (P4–P6)** |

---

## 4. Locked decisions

| # | Decision |
|---|---|
| L1 | **Hostinger shared hosting** — no Node/Redis/Socket at runtime; cron queues; static preview build of Studio |
| L2 | **WOODEX OS is the master backend** — no second app, no second database |
| L3 | **Commerce is a native domain** in the OS (reuses Sales invoices/payments + Accounts ledger) |
| L4 | **Puck Studio replaces the file-based frontend** for Pages & Builder and Content |
| L5 | **Simple products at launch** (one default variant), variant tables present for later |
| L6 | **Bank transfer + COD first**, Safepay/wallets in parallel; no launch dependency |
| L7 | **Agent autonomous within limits** — caps enforced server-side, hard handoff beyond them |
| L8 | **No Supabase data migration** — catalog + content seeded from this repo; customers/quotes start fresh |
| L9 | **3 developers, 4 parallel tracks** |
| L10 | **Storefront integration starts only after the open questions are answered** |

---

## 5. Target architecture

```
                          ┌──────────────────────────────────────────────┐
 public visitor ─────────▶│ Storefront (React 18 SPA, this repo)         │
                          │  reads /api/storefront/v1 · renders pages     │
                          └───────────────┬──────────────────────────────┘
                                          │
┌─────────────────────────────────────────▼──────────────────────────────────┐
│ REIMAGIN OS — Laravel 13 · Livewire 4 · PHP 8.4 · Hostinger shared         │
│                                                                             │
│  Commerce (NEW)        Sales (existing)        Accounts (existing)          │
│  products · carts  ──▶ quotes · invoices ────▶ ledger · periods             │
│  orders · stock        payments · PDFs                                      │
│                                                                             │
│  Website (existing)    Puck Studio (NEW)       Content (rebuilt)           │
│  media · seo · theme   JSON pages · PHP render posts · studies · forms     │
│                                                                             │
│  CRM · Inbox · Automation · Marketing (existing) + Agent (extended)         │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
        MySQL 8 · file cache · cron queue · storage outside webroot
```

**The rule that keeps it honest:** Commerce and the Agent never write `payments`, `journal_*` or `invoices`
directly — they call the existing, audited Sales/Accounts actions. An architecture test fails the build on violation.

---

## 6. Workstream A — replace the file-based frontend (Puck)

Full design: [`PUCK-BUILDER.md`](./PUCK-BUILDER.md). Summary of the commitment:

| Item | Detail |
|---|---|
| Editor | `@puckeditor/core` 0.24.0 (MIT), static bundle at `/admin/studio` |
| Storage | `pages.builder='puck'` + `puck_data` JSON; `page_versions` for rollback; `source_file` keeps the v1 origin |
| Render | PHP Blade block registry; **full HTML, zero required JS** |
| Blocks | 10 ported from the existing 18 `BlockType` cases + **8 new data-bound commerce blocks** |
| Migration | 7 groups: pilot 6 → core 5 → 48 cost guides → 20 cities → 54 specialists → blog/portfolio → retire file writer |
| Rule | **No URL changes, site never dark, every group reversible, DOM parity report required** |
| Content | `content_entries` (already in schema, unused) becomes the blog/portfolio backbone |
| Gate | v1 vs v2 rendered-DOM parity + Lighthouse ≥ 90 on each group |

**Why this unlocks commerce:** product pages, category landing pages and campaign pages become *blocks over live
data* instead of hand-written HTML.

---

## 7. Workstream B — Commerce

[`COMMERCE-DOMAIN.md`](./COMMERCE-DOMAIN.md) for DDL/actions/tests.

| Layer | Content |
|---|---|
| Data | 21 additive migrations (products, variants, attributes, media, categories, collections, price lists, inventory, movements, carts, items, orders, items, shipments, returns) |
| Reuse | invoice raising, payment recording, allocation, ledger posting, numbering, contacts, notifications, media, money helper |
| Admin | Commerce group in the sidebar: Overview · Products · Categories & collections · Inventory · Orders · Shipments & returns · Pricing · Storefront settings |
| Storefront | catalog read API + cart + checkout + bank/COD → invoice → payment |
| Payments | Safepay (cards/wallets/Raast), JazzCash, easypaisa; webhooks HMAC-verified; replay window; refunds via credit note |

---

## 8. Workstream C — frontend API (contract-first)

[`FRONTEND-API.md`](./FRONTEND-API.md) — 11 existing endpoints documented, 30 target paths, 14 advanced features
(ETag caching, idempotency, public tokens, OTP auth, rate limits, outbound webhooks, MySQL fulltext search, media
derivatives, server-driven blocks, SEO/JSON-LD, i18n, server-side analytics, agent tools, observability).

Stages: **S0** contract + mock + CI → **S1** catalog read → **S2** quote write → **S3** cart/checkout → **S4** payments
→ **S5** agent + auth. The storefront switches per page behind `VITE_DATA_SOURCE=static|api`.

---

## 9. Delivery plan — 3 devs, 4 tracks, 18–22 weeks

```
W1-2    P0 Foundations      secrets rotation · branches · commerce migrations · API contract + mock
                            · Puck registry skeleton · nav/UX deltas (A1-A4)
W3-6    P1 Catalog          products/categories/series/materials/content seeded and served
                            · storefront reads API · pilot 6 pages converted to Puck (G1, G2)
W7-10   P2 Commerce core    cart · checkout · order · invoice bridge · bank/COD · admin screens (G3)
W9-13   P3 Builder rollout  core pages · 48 guides · 20 cities · Content on Puck bodies (G4)
W11-14  P4 Payments         Safepay sandbox→prod · wallets · webhooks · refunds (G5)
W13-16  P5 Agent            commerce tools · policy engine · agent activity screen · WhatsApp/web (G6)
W15-18  P6 Specialists      remaining 54 pages converted · ArticleFile retired (G7)
W17-22  P7 Hardening        e2e · load on shared hosting · restore drill · permissions audit · training (G8)
```

| Track | Dev | P0–P1 | P2–P3 | P4–P7 |
|---|---|---|---|---|
| **A** Laravel / commerce | 1 | schema, catalog services, read API | cart/checkout, invoice bridge | payments, orders admin |
| **B** Laravel / builder | 2 | Puck shell, registry, PHP renderer | page migration M1–M4, content | M5–M7, retire file writer |
| **C** Frontend | 3 | API client, `DATA_SOURCE` switch | catalog pages on API, cart/checkout UI | Puck blocks, storefront pages |
| **D** QA / agent | shared | contract CI, parity harness | payment webhooks e2e | agent tools, policy, load test |

**Gates** — G1 catalog parity 100% · G2 pilot pages DOM-identical to v1 · G3 one real order invoice posted to the
ledger · G4 Content publishes via Puck with unchanged URLs · G5 gateway sandbox then production approval ·
G6 agent completes a capped order and escalates an over-limit one · G7 zero pages still `builder='file'` ·
G8 restore drill + 50-concurrent checkout test pass.

**Critical path:** commerce schema → catalog API → storefront switch → cart/checkout → payments.
Builder migration is parallel and independently shippable.

---

## 10. Effort

| Shape | Calendar | Note |
|---|---|---|
| 3 developers (recommended) | **18–22 weeks** | 4 tracks; matches “all in parallel” |
| 2 developers | 26–32 weeks | builder and commerce serialise at the end |
| 1 developer | 44–52 weeks | not recommended with payments in scope |

Running cost stays as in v3 (≈ $35–80/month on shared hosting; no licence fees — Puck and all OS packages are MIT).

---

## 11. Risks (v4 additions in bold)

| # | Risk | Mitigation |
|---|---|---|
| 1 | **Page migration breaks SEO/URLs** | URL freeze, DOM parity gate, per-group rollback, sitemap diff |
| 2 | **Puck registry drifts TS vs PHP** | single JSON registry + parity test in CI |
| 3 | **Builder replacement stalls while commerce races ahead** | builder is its own track with weekly shippable groups |
| 4 | Commerce writes bypass audited finance | architecture test; code review rule |
| 5 | Shared-hosting CPU under checkout bursts | ≤6 queries per checkout; 50-concurrent test in P2 |
| 6 | **Cron-only queue delays emails/PDFs** | anything a customer waits for is synchronous |
| 7 | **`Preview Owner` built wrong (real impersonation without audit)** | specify first; read-only, audited, banner |
| 8 | Payment onboarding delay | bank/COD first; gateway is additive |
| 9 | Historical secrets | rotate before payment keys |
| 10 | Scope creep (marketplace, multi-currency) | explicit out-of-scope list per phase |

---

## 12. Next 10 working days

| Day | Deliverable |
|---|---|
| 1 | Rotate secrets; create `commerce` + `studio` branches; freeze OS open financial items |
| 2 | Commerce migrations 1–21 drafted + architecture test stub |
| 3 | `openapi.yaml` frozen; mock server; CI schema check |
| 4 | Catalog import command seeds 148 products / 28 categories / 5 series / 16 materials |
| 5 | `GET /api/storefront/v1/products` + `/categories` green |
| 6 | Storefront `src/lib/api/` + `VITE_DATA_SOURCE` switch on staging |
| 7 | Puck Studio shell at `/admin/studio` with Hero + RichText + ProductGrid |
| 8 | PHP renderer for those three blocks; a page served with no JS |
| 9 | Pilot conversion of 1 real page (e.g. `/commercial-interior/`) + parity report |
| 10 | Demo: edit → publish → storefront shows it; catalog served from the OS; order draft raised |

---

## 13. Open questions (storefront)

Recorded in [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) and asked directly. **No storefront build starts before
these are answered** — the answers change the workstream C shape, the SEO strategy and the checkout design.
