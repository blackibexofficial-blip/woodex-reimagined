# Reimagin OS — Master Plan v5

**One storefront. Two Laravel backends. One page builder. One AI agent. One shared host.**

| | |
|---|---|
| **Frontend** | `woodex-reimagined` — React 18 + Vite + TS + Tailwind, 23 routes, 148 products, currently **0 API calls** |
| **Master backend** | **WOODEX OS** — Laravel 13 · PHP 8.4 · Livewire 4.4, 682 files, 98 tables, 180 tests |
| **Commerce engine** | **Bagisto 2.5** — Laravel 13 · PHP 8.4 · MySQL 8 (MIT) |
| **Page builder** | **Puck 0.24** (`@puckeditor/core`, MIT) — JSON pages, React editor, `<Render>` |
| **AI** | OS agent — 7 tools today, 14 at launch, guardrailed |
| **Hosting** | **Hostinger shared. No VPS.** 2 cores · ~1.5 GB RAM · 30 entry processes · 3 GB DB |
| **Team** | 3 developers |
| **Calendar** | **P0–P5, 24 weeks**, public launch at **week 16** |

> v4 proposed replacing Bagisto with a hand-built commerce domain. **That is withdrawn.** Bagisto is the commerce
> engine. This document is how it lives with the OS on a shared host — see `BAGISTO-INTEGRATION.md`.

---

## 1. Decisions, locked

| # | Decision | Consequence |
|---|---|---|
| D1 | **Bagisto is commerce** — catalog, cart, checkout, orders, invoices, refunds | OS never writes prices or stock |
| D2 | **Bagisto runs as a second site** (`shop.woodex.pk`), not vendored into the OS | Two deploys, one API boundary, no merge debt |
| D3 | **WOODEX OS is master** for people, quotes, projects, content, AI | The 360° customer view lives here |
| D4 | **Os owns the storefront API** (`/api/storefront/v1`) as a BFF | The SPA never talks to Bagisto directly |
| D5 | **Puck replaces the file-based builder** | One builder for pages, blog, showrooms, materials, FAQ |
| D6 | **Marketing is server-rendered** (OS Blade), commerce is SPA | Indexable without Node on the host |
| D7 | **Hostinger shared hosting** | No Node runtime, no Redis, no workers, no websockets |
| D8 | **Gate H0**: prove Bagisto installs before building UI | Week 1, cheap, de-risks everything |
| D9 | Launch catalogue **simple products**, PKR, bank + COD | Safepay/JazzCash behind flags |
| D10 | **Seed data only**; no Supabase migration | Import from CSV/Bagisto importer |
| D11 | AI agent acts autonomously **within limits**, always logged | Human approval for money/refunds |

---

## 2. System map

```
                       ┌─────────────────────────────────────────────┐
   visitor ───────────►│  woodex.pk  —  storefront                   │
                       │  · marketing pages   → OS Blade + Puck JSON │
                       │  · product pages     → OS Blade (cached)    │
                       │  · cart/checkout     → React SPA            │
                       └───────────────┬─────────────────────────────┘
                                       │ BFF  /api/storefront/v1
                       ┌───────────────▼─────────────────────────────┐
                       │  WOODEX OS  (admin.woodex.pk)               │
                       │  CRM · Sales · Projects · Accounts ·        │
                       │  Conversations · Website/Puck · AI Agent    │
                       └───────┬─────────────────────────┬───────────┘
                               │ signed HTTPS            │ cron
                       ┌───────▼──────────────┐  ┌───────▼─────────┐
                       │  BAGISTO             │  │  MySQL ×2       │
                       │  shop.woodex.pk      │  │  OS + Bagisto   │
                       │  catalog · cart ·    │  │  (no shared      │
                       │  checkout · orders   │  │   tables)       │
                       └──────────────────────┘  └─────────────────┘
```

**Boundary rule:** money → Bagisto. People, promises, pages → OS.

---

## 3. The three workstreams

### A — Commerce (Bagisto + storefront integration) · 2 devs weeks 1–16

| A# | Deliverable | Week |
|---|---|---|
| A1 | **Gate H0** — Bagisto installs, one product, one order on the real account | 1 |
| A2 | Bagisto configured: PKR, tax, 3 warehouses, customer groups, attributes | 2 |
| A3 | Catalog import (148 products → Bagisto CSV importer), images, categories | 2–3 |
| A4 | `CommerceGateway` interface + `BagistoGateway` + `NullGateway` | 3 |
| A5 | BFF catalog endpoints + `commerce_products` cache + invalidation webhook | 4–5 |
| A6 | Product/category pages server-rendered from cache, indexable | 5–6 |
| A7 | Cart + checkout SPA wired to Bagisto through the BFF | 6–8 |
| A8 | Payments: bank transfer + COD live; Safepay integrated behind flag | 8–10 |
| A9 | Order webhooks → `commerce_orders` mirror → Accounts entry | 9–10 |
| A10 | Account area: orders, invoices, addresses, tracking | 10–12 |
| A11 | **Quote → cart → order** path (from OS Sales) | 12–13 |
| A12 | Refunds, cancellations, RMA, reconciliation job | 13–14 |
| A13 | JazzCash / easypaisa; multi-currency; export channel | 14–16 |
| A14 | Load test: 30 concurrent checkouts, zero 508, p95 < 1.5 s | 15 |

### B — OS parity modules (the nine gaps) · 1.5 devs weeks 5–20

| B# | Feature | Week | Tables |
|---|---|---|---|
| B1 | **E-Quotation public** (draft, signed link, accept, PDF, WhatsApp) | 5–7 | +1 |
| B2 | **FAQ** — wire existing `ContentEntry` | 6 | 0 |
| B3 | **Support cases** — public intake → Conversations + SLA | 7–8 | +2 |
| B4 | **Showrooms + appointments** → CRM visits | 9–11 | +2 |
| B5 | **Materials & colours** + Bagisto attribute bridge | 10–12 | +3 |
| B6 | **Warranty** registration + claims → service jobs | 12–15 | +3 |
| B7 | **Custom Design** brief → Project + Quote draft | 14–16 | +2 |
| B8 | **Distributors** application pipeline + Bagisto group sync | 15–17 | +2 |
| B9 | **Markets** pages + enquiry pipeline | 17–18 | +2 |
| B10 | Admin screens, permissions, reports for all of the above | 8–20 | — |

*Full spec: `FEATURE-PARITY.md`.*

### C — CMS, Puck builder, AI · 1.5 devs weeks 1–20

| C# | Deliverable | Week |
|---|---|---|
| C1 | Puck Studio embedded in the OS admin (`/admin/studio`), auth via OS session | 2–4 |
| C2 | Page schema v1: components, tokens, breakpoints, versioning, preview | 4–6 |
| C3 | **`pages` / `page_blocks` served** — render Puck JSON through Blade, cached | 5–7 |
| C4 | Component library vs. the 142 legacy pages (M0–M7 migration groups) | 6–10 |
| C5 | Media library, asset variants, focal points | 8–9 |
| C6 | Blog/insights on Puck + `ContentEntry` (testimonials, logos, FAQ) | 9–11 |
| C7 | SEO: sitemap, canonical, JSON-LD (Product, FAQPage, LocalBusiness), redirects | 10–12 |
| C8 | Migrate all 142 static pages, keep 301s | 11–16 |
| C9 | **AI agent** — 14 tools (catalog, order status, quote draft, appointment, warranty, ticket, page draft, translate…) | 8–18 |
| C10 | Agent guardrails: allow-list, spend caps, approval gates, full audit log | 12–14 |
| C11 | Agent surfaces: admin copilot, site chat, WhatsApp, email triage | 14–18 |
| C12 | Roles, audit trail, backups drill, staging subdomain | 18–20 |

---

## 4. Phases

| Phase | Weeks | Goal | Exit gate |
|---|---|---|---|
| **P0 — Prove the ground** | 1–2 | H0 Bagisto gate; hosting topology; repos; CI | Bagisto + OS both live on the account |
| **P1 — Commerce spine** | 3–7 | Catalog in Bagisto, BFF, product pages, Puck Studio v0 | A product page renders from Bagisto data, editable copy |
| **P2 — Sell** | 8–12 | Cart, checkout, bank+COD, orders, accounts, quotations | **First real online order** |
| **P3 — Launch** | 13–16 | Payments, all nine public surfaces, 142 pages migrated, SEO | **Public launch, week 16** |
| **P4 — Depth** | 17–20 | Warranties, dealer pricing, markets, AI agent live | Dealer onboarded; agent handles 40% of tickets |
| **P5 — Harden** | 21–24 | Load, security, DR drill, docs, handover | 14 days zero drift; runbooks written |

Beyond the launch gate: GA4 + Search Console + WhatsApp Business API + abandoned-cart flow.

---

## 5. Team of 3

| Dev | Weeks 1–8 | Weeks 9–16 | Weeks 17–24 |
|---|---|---|---|
| **A — Commerce** | H0, Bagisto setup, import, gateway, BFF | Cart, checkout, payments, orders | Refunds, reconciliation, load, multi-currency |
| **B — OS/domain** | Quotations, FAQ, support cases, admin patterns | Showrooms, materials, warranty, custom design | Distributors, markets, reports |
| **C — CMS/AI** | Puck Studio, schema, render pipeline | Component library, 142-page migration, SEO | AI agent tools, guardrails, hardening |
| **Shared** | Code review, contract tests, staging | Launch checklist, content ops | Runbooks, handover |

Nothing is single-owner: every module has a reader and a writer.
Contract tests between OS ↔ Bagisto are written by **B**, executed in **A**'s CI.

---

## 6. Data

| System | Tables added | Notes |
|---|---|---|
| Bagisto | catalog, orders, invoices (its own schema) | never modified — config + attributes only |
| OS — commerce mirrors | `commerce_products`, `commerce_orders`, `commerce_order_lines`, `commerce_customers`, `commerce_events`, `commerce_sync_runs` | 6 |
| OS — parity modules | locations, appointments, materials, variants, warranties, claims, cases, dealer_applications, markets, enquiries, design_requests, quote shares | ≈ 13–16 |
| OS — CMS | `pages`, `page_blocks` (exist), `content_entries` (exists), `page_revisions`, `redirects` | reuse first |

**Migration policy:** additive only. No data migration from Supabase. Seed data is generated, reviewable, and
re-runnable (`php artisan db:seed --class=DemoSeeder`).

---

## 7. AI agent

**Today:** 7 read-only tools. **At launch:** 14, all scoped to one customer and one session.

| Tool group | Tools | Guardrail |
|---|---|---|
| Catalog | search, detail, stock, compare | read-only |
| Orders | status, invoice, tracking | customer-scoped, no PII echo |
| Sales | draft quotation, book appointment | draft only — a human sends |
| Service | open ticket, check warranty, raise claim | claim ≤ auto-approve limit |
| Content | draft page section, rewrite for SEO, translate | publish requires approval |
| Ops | summarise ticket, suggest reply | never auto-sends money messages |

**Hard limits:** no refunds, no price changes, no customer deletion, no email to a customer without approval above a
threshold. Every call is logged with input, output, tokens and decision. Cost cap per conversation and per day.
Escalation to a human is a first-class outcome, not a failure.

---

## 8. Risks (ranked by expected damage)

| # | Risk | Prob | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Bagisto can't run on shared** | Med | **Fatal to plan** | Gate H0 week 1; fallbacks in `HOSTINGER-CAPACITY.md` §2 |
| R2 | Two apps exceed 30 entry processes at peak | Med | Slow checkout | Page cache, BFF catalog cache, 3-size images, monitor 508 |
| R3 | Bagisto's API surface differs from the adapter's assumptions | High | Rework | Pin version, contract tests, thin gateway |
| R4 | 142-page migration stalls on bespoke layouts | High | Launch slip | Component library first; migrate top 30, 301 the rest |
| R5 | Quote → order handoff creates duplicate customers | Med | Data mess | Link on email+phone, single `commerce_customers` link table |
| R6 | Composers OOM in the Git deploy hook | Med | Deploy pain | Pre-built `vendor` fallback, SSH step, lockfile pinned |
| R7 | Scope creep from "complete CMS" | High | Everything slips | P0–P3 scope frozen at 9 gaps + 142 pages; new asks go to P5 |
| R8 | AI agent hallucinating order data | Med | Trust | Tools return structured rows only; no free-text generation over DB |

---

## 9. Budget

| Line | Monthly |
|---|---|
| Hostinger shared (Business) | $4–9 |
| Domain + SSL | ~$1 |
| Email (transactional) | $0–15 |
| WhatsApp Business API | usage |
| Gateway fees | 2–3 % of online revenue |
| **Infra floor** | **≈ $10–25/mo** |

If H0 fails and a managed cloud box is needed: **+$10–20/mo**. Still not a VPS in the owner's sense, still one bill.

---

## 10. Launch checklist (week 16)

- [ ] Product page indexable, in sitemap, JSON-LD valid
- [ ] Guest checkout: bank transfer and COD, both completing
- [ ] Order confirmation email + WhatsApp
- [ ] 40 real orders reconciled with zero unexplained drift
- [ ] All nine public surfaces submit to the OS (no toast-only forms)
- [ ] Puck: 30 marketing pages editable by a non-developer, one-click publish + rollback
- [ ] 301 map for every legacy URL; no 404 spikes in Search Console
- [ ] Staging subdomain deploys the same commit as production
- [ ] Backup restores into a scratch folder in under 30 minutes
- [ ] Admin runbook: refund, cancel, re-send invoice, edit order, restore page

---

## 11. Explicitly out of scope (v5)

Multi-vendor marketplace · mobile apps · ERP payroll/HR · POS · subscription billing · full PIM · BI warehouse ·
custom SSO · email marketing automation suite · loyalty program · live chat with agents beyond polling ·
VPS/Kubernetes/Redis/Node runtime.

---

## 12. What must be answered before code starts

See `OPEN-QUESTIONS.md`. Four answers block week 1: **Bagisto account shape**, **who pays for what** (gateway/KYC),
**catalog ownership during import**, and **launch date flexibility**.
