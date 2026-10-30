# Reimagin OS — Planning Pack (v5)

**One storefront. Two Laravel backends. One page builder. One AI agent. One shared host.**

| Component | Choice |
|---|---|
| Frontend | `woodex-reimagined` — React 18 + Vite + TS, 23 routes, 148 products, **0 API calls today** |
| Master backend | **WOODEX OS** — Laravel 13 · PHP 8.4 · Livewire 4.4 |
| Commerce | **Bagisto 2.5** — Laravel 13 · MySQL 8 · MIT |
| Page builder | **Puck 0.24** (`@puckeditor/core`, MIT) |
| AI | OS agent — 7 tools today, 14 at launch |
| Hosting | **Hostinger shared — no VPS** |
| Team / calendar | 3 devs · **24 weeks**, launch at **week 16** |

> **v4 correction:** v4 recommended a native `app/Domain/Commerce` instead of Bagisto. **Withdrawn.** Bagisto is the
> commerce engine; see `BAGISTO-INTEGRATION.md`.

## Read in this order

| # | Document | What it answers |
|---|---|---|
| 1 | [`MASTER-PLAN.md`](./MASTER-PLAN.md) | The plan: architecture, 3 workstreams, phases, team, risks, budget, launch checklist |
| 2 | [`HOSTINGER-CAPACITY.md`](./HOSTINGER-CAPACITY.md) | **Exactly what the shared plan allows** — PHP, MySQL, cron, Composer, no Node/Redis/workers — plus the two-app capacity math and **Gate H0** |
| 3 | [`BAGISTO-INTEGRATION.md`](./BAGISTO-INTEGRATION.md) | How Bagisto and WOODEX OS coexist: three options, the chosen one, ownership matrix, BFF contract, sync flows |
| 4 | [`FEATURE-PARITY.md`](./FEATURE-PARITY.md) | The nine frontend gaps measured against the OS: Showrooms, Materials, Warranty, Support, Distributors, FAQ, Markets, Custom Design, E-Quotation |
| 5 | [`WEEK-1-KICKOFF.md`](./WEEK-1-KICKOFF.md) | **Start here on Monday** — day-by-day Gate H0: hosting facts, Bagisto install, smoke test, two-app load test, go/no-go |
| 6 | [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) | Six decisions (Q1 hosting fallback … Q6 launch date). *Owner skipped — recommended defaults adopted* |
| 7 | [`PUCK-BUILDER.md`](./PUCK-BUILDER.md) | Puck Studio replacing the file-based builder; 142-page migration groups M0–M7 |
| 8 | [`HOSTINGER-RUNTIME.md`](./HOSTINGER-RUNTIME.md) | Operating rules on shared hosting: env, deploy, cron queues, storage, budgets, runbooks |
| 9 | [`OS-BASELINE.md`](./OS-BASELINE.md) | Measured audit of the WOODEX OS codebase |
| 10 | [`FRONTEND-API.md`](./FRONTEND-API.md) | API inventory: 11 today → 30 target, S0–S5 staging |
| 11 | [`ADMIN-UI-AUDIT.md`](./ADMIN-UI-AUDIT.md) | Screenshot vs code: control-centre IA, nav deltas, undefined `Preview Owner` |
| 12 | [`PLATFORM-EVALUATION.md`](./PLATFORM-EVALUATION.md) | Why Bagisto over Medusa / headless / custom — with evidence |
| 13 | [`openapi.yaml`](./openapi.yaml) | The storefront API contract — **45 paths**, incl. warranty, support, dealer, markets, custom design, Bagisto webhooks |
| 14 | [`REPO-INTAKE.md`](./REPO-INTAKE.md) | Intake checklist (completed — method record) |
| — | [`COMMERCE-DOMAIN.md`](./COMMERCE-DOMAIN.md) | **WITHDRAWN** — the rejected native-commerce proposal, kept as a record |

## The three findings that shape everything

1. **The frontend has zero `fetch()` calls.** Every form — quotation, showroom visit, warranty, dealer application,
   contact — ends in a toast. The work is not porting pages; it is giving designed surfaces a backend that remembers.
2. **Bagisto is the only commerce engine that can physically run here.** Laravel + MySQL, no Node runtime. Medusa
   needs Node 22. `nextjs-commerce` would replace the storefront and needs Next SSR.
3. **The OS is the mature half.** 98 tables, double-entry accounting, quotations with revision sequences, projects,
   an inbox, 180 tests. The storefront is the smaller build — it just has to be *connected*.

## Status of the import

`woodex420/woodexinterior` (branch `arena/8be318a2-woodexinterior`, HEAD `c437cad`) became public during the earlier
session, was cloned to `/home/user/refs/woodexinterior`, and is the measured baseline for every claim about the OS.
