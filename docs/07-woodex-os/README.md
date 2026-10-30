# Reimagin OS — Planning Pack (v6)

**One application. One admin. One database. One page builder. One AI agent.**

| Component | Choice |
|---|---|
| Application | **WOODEX OS** — Laravel 13 · PHP 8.4 · Livewire 4.4 |
| Commerce | Bagisto's complete feature set, built **inside** the OS (`App\Domain\Commerce`) |
| Page builder | **Puck 0.24** (`@puckeditor/core`, MIT) — the only builder |
| Frontend | React 18 + Vite + TS, 23 routes, 148 products, **0 API calls today** |
| AI | OS agent — 7 tools today, 14 at launch |
| Hosting | **Hostinger shared — no VPS** |
| Team / calendar | 3 devs · **28 weeks**, public launch **week 20** |

> **v6 supersedes v5.** v5 ran Bagisto as a second site on `shop.woodex.pk`. The owner rejected that — *no Bagisto
> engine, one master admin*. Commerce is now a first-class domain inside WOODEX OS, with Bagisto as the reference
> implementation: its feature set, its semantics, and its MIT-licensed algorithms for the money pipeline.
> Nothing else changes: Puck still replaces the file-based builder, and the nine missing storefront features are
> still OS modules.

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 1 | [`MASTER-PLAN.md`](./MASTER-PLAN.md) | The plan: architecture, 3 workstreams, 7 phases, team, risks, budget, launch checklist |
| 2 | [`COMMERCE-IN-OS.md`](./COMMERCE-IN-OS.md) | **The commerce build spec** — 30-capability matrix, 34 tables, the totals pipeline, 14 admin screens, ported algorithms, acceptance suite |
| 3 | [`HOSTINGER-CAPACITY.md`](./HOSTINGER-CAPACITY.md) | **Exactly what the shared plan allows** — PHP, MySQL, cron, Composer; no Node/Redis/workers; capacity math and Gate G1 |
| 4 | [`FEATURE-PARITY.md`](./FEATURE-PARITY.md) | The nine frontend gaps measured against the OS: Showrooms, Materials, Warranty, Support, Distributors, FAQ, Markets, Custom Design, E-Quotation |
| 5 | [`WEEK-1-KICKOFF.md`](./WEEK-1-KICKOFF.md) | **Start here on Monday** — day-by-day: hosting facts, money pipeline, schema, Puck spike, Gate G0 |
| 6 | [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) | Six decisions (owner skipped — recommended defaults adopted) |
| 7 | [`PUCK-BUILDER.md`](./PUCK-BUILDER.md) | Puck Studio, block registry, data binding, 142-page migration M0–M7 |
| 8 | [`HOSTINGER-RUNTIME.md`](./HOSTINGER-RUNTIME.md) | Operating rules: env, deploy, cron queues, storage, runbooks |
| 9 | [`OS-BASELINE.md`](./OS-BASELINE.md) | Measured audit of the WOODEX OS codebase |
| 10 | [`FRONTEND-API.md`](./FRONTEND-API.md) | API inventory: 11 today → 48 target |
| 11 | [`ADMIN-UI-AUDIT.md`](./ADMIN-UI-AUDIT.md) | Screenshot vs code: control-centre IA, nav deltas, undefined `Preview Owner` |
| 12 | [`PLATFORM-EVALUATION.md`](./PLATFORM-EVALUATION.md) | Bagisto vs Medusa vs headless vs custom — the evidence behind the decision |
| 13 | [`openapi.yaml`](./openapi.yaml) | Storefront API contract — **48 paths**, incl. coupons, shipping, availability, warranty, support, dealers, markets, custom design |
| 14 | [`REPO-INTAKE.md`](./REPO-INTAKE.md) | Intake method record (historical) |

## Built so far

| Piece | Where | State |
|---|---|---|
| `Money`, `CartCalculator`, 14 golden fixtures, invariant property test | `platform/app/Domain/Commerce/` · `platform/tests/` | ✅ **16 tests, 13,371 assertions green** |
| Admin map, three key screens, storefront gap map | `docs/07-woodex-os/mockups/` | ✅ |

## The three findings that shape everything

1. **The frontend has zero `fetch()` calls.** Every form — quotation, showroom visit, warranty, dealer application,
   contact — ends in a toast. The work is not porting pages; it is giving designed surfaces a backend that remembers.
2. **One Laravel app is the only shape shared hosting can carry well.** No Node runtime, no Redis, no workers. A
   second app would split 30 entry processes across two boots for no benefit.
3. **The OS is the mature half.** 98 tables, double-entry accounting, quotations with revision sequences, projects,
   an inbox, 180 tests. Commerce is the addition; the storefront just has to be connected.

## Status of the import

`woodex420/woodexinterior` (branch `arena/8be318a2-woodexinterior`, HEAD `c437cad`) became public in an earlier
session, was cloned to `/home/user/refs/woodexinterior`, and is the measured baseline for every claim about the OS.
