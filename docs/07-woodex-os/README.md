# WOODEX OS — Planning Pack

Planning documents for turning the WOODEX frontend into a complete commerce platform backed by **WOODEX OS (Laravel)**.

| Document | Purpose |
|---|---|
| [`MASTER-PLAN.md`](./MASTER-PLAN.md) | The full plan: current state, target architecture, phases, effort, risks, decisions |
| [`PLATFORM-EVALUATION.md`](./PLATFORM-EVALUATION.md) | Deep comparison: Bagisto 2.5 vs Medusa v2 vs Bagisto Headless vs custom Laravel — with evidence |
| [`openapi.yaml`](./openapi.yaml) | The API contract the reimagined storefront needs (v1 draft) |
| [`OS-BASELINE.md`](./OS-BASELINE.md) | Measured audit of the WOODEX OS codebase (Laravel 13 / Livewire 4) |
| [`COMMERCE-DOMAIN.md`](./COMMERCE-DOMAIN.md) | Schema, actions, endpoints and acceptance tests for the new Commerce domain |
| [`REPO-INTAKE.md`](./REPO-INTAKE.md) | Intake checklist (now completed — kept as the method record) |

## Status of the requested import

**Resolved on 2026-10-31.** The repository `woodex420/woodexinterior` (branch `arena/8be318a2-woodexinterior`,
HEAD `c437cad`) became public during this session and was cloned and analysed. Earlier probes returned 404:

| Probe | Result at the time |
|---|---|
| `git ls-remote` / `gh api repos/woodex420/woodexinterior` | `Repository not found` |
| `codeload.github.com/.../arena/8be318a2-woodexinterior` | `404` |
| repo listings for `woodex420`, `woodex-int` | no `woodexinterior` entry |

An SSH host-key fingerprint authenticates a host, not a private repository, so it could not substitute for access.

## What the OS turned out to be

A mature **Laravel 13 + Livewire 4** application — 682 PHP files, 73,582 lines, 98 tables, 117 Livewire
components, 180 test files — running quotations, invoices, advances, double-entry accounting, CRM, projects,
WhatsApp/Telegram and a website builder on Hostinger shared hosting. It has **no commerce layer** (no products,
carts, orders or stock), which is exactly what this plan adds.

Supporting repositories also reviewed:

- `woodex420/woodex` @ `woodex-admin` — 13-page React admin + Supabase schema (45 tables, 106 RLS policies, 32 edge functions)
- `woodex420/woodex-2030` @ `arena/01a10a97-woodex-2030` — Express + SQLite API monorepo with dashboard, storefront, tests
- `woodex420/woodex-2030` @ `arena/01a1087c-woodex-2030` — the October 2026 master plan and docs
- `blackibexofficial-blip/woodex-reimagined` — this storefront (23 routes, 148 products)
- `medusajs/medusa`, `bagisto/bagisto`, `bagisto/b2b-ecommerce`, `bagisto/nextjs-commerce` — platform evaluation

## ⚠️ Do this before anything else

Public repositories in this account have contained **live payment and integration secrets** (previously
flagged in the 2026-10-05 plan). Rotate every key that has ever been committed — Stripe, Supabase
service-role, WhatsApp/Meta, mail, database URLs — and purge history with `git filter-repo`. A plan is
worthless if the credentials leak first.
