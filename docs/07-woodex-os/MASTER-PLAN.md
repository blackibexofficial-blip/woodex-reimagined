# Reimagin OS — Master Plan (v3, locked)

**Date:** 31 October 2026 · **Status:** approved direction, ready for build
**Name:** **Reimagin OS** = WOODEX OS (Laravel backend) + Commerce domain + Puck page builder + Storefront API
**Hosting:** **Hostinger shared hosting** (PHP only, no SSH, no Node runtime, no Redis) — not a VPS
**Team:** 3 developers · **Target:** 16–20 weeks

> Companion documents: [`HOSTINGER-RUNTIME.md`](./HOSTINGER-RUNTIME.md) (shared-hosting engineering rules) ·
> [`PUCK-BUILDER.md`](./PUCK-BUILDER.md) (live page builder) · [`COMMERCE-DOMAIN.md`](./COMMERCE-DOMAIN.md) (schema/actions/tests) ·
> [`openapi.yaml`](./openapi.yaml) (storefront contract) · [`OS-BASELINE.md`](./OS-BASELINE.md) (what the OS already has)

---

## 1. Locked decisions

| # | Decision | Consequence |
|---|---|---|
| L1 | **Hosting stays Hostinger shared** | No Node/Socket/Redis at runtime. Queues via cron, cache in files/DB, admin assets pre-built and uploaded. |
| L2 | **Reuse WOODEX OS as the master backend** | Laravel 13 / Livewire 4 / Fortify / Spatie stack unchanged; commerce, builder and API are added as domains. |
| L3 | **Commerce built natively inside the OS** | Reuses audited Sales (quotes, invoices, advances, payments) and Accounts (ledger). No second app, no sync. |
| L4 | **Simple products at launch** | One default variant per product; the variant table exists so finish/colour/size can be switched on later without migration. |
| L5 | **Bank transfer + COD first; Safepay in parallel** | Online cards/wallets land when the merchant account approves (2–4 weeks); no launch dependency. |
| L6 | **Puck (`@puckeditor/core`) as the live page builder** | React editor served as a static admin app; **published pages render in PHP/Blade** so SEO survives shared hosting. |
| L7 | **Agent is autonomous within limits** | Policy engine with order-value, discount, category and stock limits; anything beyond routes to human approval. |
| L8 | **No Supabase migration** | Catalog + content seed from this repo; customers, quotes and orders start fresh in the OS. Supabase becomes read-only archive. |
| L9 | **3 developers, 4 parallel tracks** | Laravel-commerce, frontend, and OS/builder+QA. | 

---

## 2. What "Reimagin OS" is

```
                         ┌──────────────────────────────────────────────┐
  public visitor ───────▶│ Storefront  (React 18 SPA, this repo)        │
                         │  • Puck-rendered marketing pages (SSR in PHP)│
                         │  • catalog · configurator · quote · cart     │
                         └───────────────┬──────────────────────────────┘
                                         │ /api/storefront/v1
┌────────────────────────────────────────▼─────────────────────────────────┐
│ REIMAGIN OS — Laravel 13 · Livewire 4 · PHP 8.4 · Hostinger shared       │
│                                                                          │
│  Commerce (new)      Sales (existing)        Accounts (existing)         │
│  products/orders ──▶ quotes·invoices·advances ──▶ ledger (double entry)  │
│                                                                          │
│  CRM (existing)      Conversations (existing)   Assistant/Bot (existing) │
│  leads·companies     WhatsApp·Telegram·web chat  + commerce tools        │
│                                                                          │
│  Website (existing)  +  Puck Studio (new)                                │
│  SEO·theme·redirects    live editor, PHP renderer, drafts, revisions     │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                    MySQL 8 · local disk (outside webroot) · cron
```

**The one architectural rule that keeps this honest:** commerce and the agent never write `payments`,
`journal_*` or `invoices` directly. They call the existing Sales/Accounts actions. An architecture test fails
the build if that rule breaks.

---

## 3. Hostinger shared hosting — the real constraints

Full runbook: [`HOSTINGER-RUNTIME.md`](./HOSTINGER-RUNTIME.md). Summary of what the plan assumes:

| Constraint | Design response |
|---|---|
| No SSH | Deploy via hPanel **Git**, Composer hook already in the repo (`tools/deploy/after-composer.php`), migrations/seeders through a **protected web installer route** or cron. |
| No Node runtime | Puck editor and storefront are **built locally/CI** and uploaded as static assets; PHP never executes JS build steps. |
| No Redis | `CACHE_STORE=file` (or `database`), `SESSION_DRIVER=database`, `QUEUE_CONNECTION=database`. |
| No long-running workers | Cron every minute: `queue:work --stop-when-empty --max-time=50` + `schedule:run`. Long jobs (PDF, image conversion, WhatsApp sends) are chunked. |
| Memory / execution limits | No image processing in a request; MediaLibrary conversions queued; PDF generation chunked and cached. |
| No WebSockets | Polling only — the OS already polls for chat; Puck preview saves via normal HTTP. |
| Single MySQL instance | Lean queries, explicit indexes, no cross-domain N+1; nightly backup to `~/woodex-os/backups` + offsite download. |
| Storage outside webroot | Uploads live in `~/woodex-os/<site>/`; public media served through a signed/allow-listed route with long cache headers. |
| Disk quota | Product images pre-sized to 3 variants (thumb/ card / zoom) + WebP; source originals retained only when needed. |

**Rule of thumb:** if a feature needs a background daemon, it is redesigned as cron + idempotent job, or it is
out of scope for v1.

---

## 4. Commerce scope (simple products)

Launch catalog: **148 products**, one default variant each, categories (2 groups / 28 subcategories), 5 series,
16 materials, 6 room packages, all seeded from this repo's TypeScript data by an idempotent artisan command
([`COMMERCE-DOMAIN.md`](./COMMERCE-DOMAIN.md) §5).

Included at launch:
- Catalog API (list, filter, sort, search, pagination, ETag caching)
- Product page data (images, specs, features, colours as presentation attributes)
- Cart (guest token, stock reservation, price snapshot)
- Checkout → `Order` → `Invoice` (through Sales actions) → `Payment` (bank proof / COD)
- Admin: products, categories, collections, inventory, orders, fulfilment, storefront settings
- Quote bridge: storefront quote request → CRM `Lead` + Sales `Quote` (the existing quote engine does the rest)

Deliberately **out of scope for v1:** variants matrix, B2B company price lists, multi-currency, marketplace,
returns automation (manual RMA only), gift cards, reviews moderation.

---

## 5. Live page builder (Puck)

Design in [`PUCK-BUILDER.md`](./PUCK-BUILDER.md). The three decisions that make it work on shared hosting:

1. **Editor is a static React app** inside the admin (`/admin/studio`), authenticated by the existing session —
   no Node server, no SSR editor.
2. **Published pages render server-side in PHP** from the stored Puck JSON, through a Blade component registry.
   Google sees full HTML; the browser gets zero required JS for content pages.
3. **Blocks bind to live data by query, not by copy** — a `ProductGrid` block stores `{category, limit, sort}`
   and the PHP renderer resolves products at request time from cache. Prices can never go stale inside a page.

Registry (v1): Hero · RichText · CategoryTiles · ProductGrid · ProductCarousel · SeriesTabs · RoomPackages ·
MaterialsShowcase · ProjectGallery · Testimonials · LogoCloud · Stats · FAQ · CTA · QuoteForm · ContactForm ·
VideoEmbed · Spacer.

---

## 6. E-commerce agent (autonomous within limits)

Built on the existing **Bot / BotKnowledge / Automation** domains and the existing MCP bridge — not a new stack.

| Capability | Policy |
|---|---|
| Answer product, stock, delivery, warranty questions | free |
| Recommend products / build a basket | free |
| Create a quote or draft order | allowed up to **PKR 250,000** or **10% discount**, whichever is lower |
| Confirm an order | allowed if within the same limits **and** stock is reserved successfully |
| Anything above, custom manufacturing, credit terms, complaints | **hard handoff** to Conversations inbox with full transcript |
| Payments, refunds, stock edits, price changes | never |

Every tool call writes `BotUsage` + `ActivityLog` and keeps the transcript in `Conversations`. Policies live in
settings (editable by the owner, not in code). Channels: website chat widget, WhatsApp, staff Telegram.

KPIs: containment rate, assisted revenue, quote→order conversion, escalation reason mix, first-response time.

---

## 7. Delivery plan — 3 developers, 4 tracks

```
Week 1-2   P0  Foundations
               ├─ A: commerce migrations + models + seeders + import command
               ├─ B: storefront API skeleton (catalog read) + OpenAPI contract tests
               ├─ C: frontend API client + data-source switch (static ⇄ api)
               └─ D: Puck Studio shell + component registry parity (TS ⇄ Blade)
Week 3-6   P1  Catalog live
               storefront reads Reimagin OS for products, categories, series, materials,
               projects, posts; SEO prerender; parity report = 100%
Week 7-10  P2  B2C commerce
               cart → checkout → order → invoice → bank/COD payment → fulfilment; admin screens
Week 9-13  P3  Payments + Quote bridge (parallel)
               Safepay (cards/wallets/Raast) when approved · storefront quote → Lead + Quote
Week 11-16 P4  Puck Studio GA + Agent
               live editing, drafts/publish/rollback, page templates, agent tools + policy engine
Week 15-18 P5  Hardening
               e2e, load on shared hosting, backups/restore drill, permissions audit, training
```

| Track | Owner | Weeks 1–6 | Weeks 7–12 | Weeks 13–18 |
|---|---|---|---|---|
| A — Laravel / commerce | Dev 1 | schema, catalog services, API | cart, checkout, invoice bridge | orders admin, fulfilment, hardening |
| B — Frontend | Dev 2 | API client, page migrations, prerender | cart/checkout UI, quote flow | Puck block components, studio UX |
| C — Builder / OS | Dev 3 | Puck shell, registry, PHP renderer | page templates, preview/publish | versions, media picker, permissions |
| D — Agent / QA | shared | contract tests, CI | payment webhooks, e2e | agent tools, policy engine, load test |

**Gates (non-negotiable).** G1 catalog parity 100% · G2 one real order end-to-end with a bank payment recorded
in the ledger · G3 Safepay sandbox → production approval · G4 published page editable in Puck, rendered in PHP,
Lighthouse ≥ 90 · G5 agent completes a capped order and escalates an over-limit one · G6 restore drill passes.

---

## 8. Risks specific to this plan

| # | Risk | Mitigation |
|---|---|---|
| 1 | Shared-hosting CPU throttles checkout bursts | Cache catalog aggressively, keep checkout ≤ 6 queries, measure in P2 with a 50-concurrent test |
| 2 | Cron queue latency (up to 60 s) | Anything user-facing runs synchronously or uses polling with optimistic UI; only PDF/email/WhatsApp go to queue |
| 3 | Puck registry drifts between TS and PHP | One JSON registry file is the source of truth; a test asserts both sides expose identical block schemas |
| 4 | No Node at runtime | Editor assets versioned in the repo; a CI job builds them and fails if stale |
| 5 | Image storage growth | Enforce 3 sizes + WebP, quota alarm in System health |
| 6 | Agent over-reach | Hard caps in the policy engine, dry-run mode for 2 weeks before autonomy |
| 7 | Parallel tracks colliding in one repo | Domain folders + feature branches + daily merge; API contract tests as the arbiter |
| 8 | Historical secrets | Rotate before payment credentials are added |

---

## 9. What exists vs what we build

| Area | Existing | To build |
|---|---|---|
| Auth, roles, permissions | ✅ Fortify + Spatie | new commerce permissions |
| Quotes, invoices, advances, ledger | ✅ audited | storefront quote endpoint + customer status page |
| CRM, WhatsApp/Telegram, chat widget | ✅ | order notifications, agent tools |
| Website pages, SEO, redirects, theme | ✅ Livewire builder | **Puck Studio + PHP renderer** |
| Products, carts, orders, stock | ❌ | **Commerce domain** |
| Storefront API | ❌ | **`api/storefront/v1`** |
| Online payments | ❌ | **Safepay + wallet drivers, webhooks** |
| Agent | 🟡 Bot + MCP foundations | **commerce tools + policy engine** |

---

## 10. First two weeks, concretely

| Day | Deliverable |
|---|---|
| 1 | Rotate historical secrets; freeze the OS's open financial items; create the `commerce` feature branch |
| 2 | Commerce migrations 1–21 reviewed against the existing schema; architecture test stub added |
| 3 | Import command seeds 148 products / 28 categories / 5 series / 16 materials on staging |
| 4 | `api/storefront/v1/products` + `/categories` green against `openapi.yaml` |
| 5 | Storefront `src/lib/api/` + `VITE_DATA_SOURCE=api` switch working on staging |
| 6–7 | Parity report page-by-page; fix gaps; Lighthouse baseline recorded |
| 8 | Puck Studio shell at `/admin/studio` with 3 blocks (Hero, RichText, ProductGrid) |
| 9 | PHP renderer for those 3 blocks; published page served with no JS |
| 10 | Demo: edit a page in Puck → publish → storefront shows it; catalog served from the OS |

Decision checkpoints after day 10: registry parity, API contract tests, and a real staging order.
