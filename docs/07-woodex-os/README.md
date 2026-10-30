# WOODEX OS — Planning Pack

Planning documents for turning the WOODEX frontend into a complete commerce platform backed by **WOODEX OS (Laravel)**.

| Document | Purpose |
|---|---|
| [`MASTER-PLAN.md`](./MASTER-PLAN.md) | The full plan: current state, target architecture, phases, effort, risks, decisions |
| [`PLATFORM-EVALUATION.md`](./PLATFORM-EVALUATION.md) | Deep comparison: Bagisto 2.5 vs Medusa v2 vs Bagisto Headless vs custom Laravel — with evidence |
| [`openapi.yaml`](./openapi.yaml) | The API contract the reimagined storefront needs (v1 draft) |
| [`REPO-INTAKE.md`](./REPO-INTAKE.md) | What to extract from the WOODEX OS repo the moment read access exists |

## Status of the requested import

The repository `woodex420/woodexinterior` (branch `arena/8be318a2-woodexinterior`) returns **404** to every
credential available in this environment. Verified on 2026-10-31:

| Probe | Result |
|---|---|
| `git ls-remote https://github.com/woodex420/woodexinterior.git` | `Repository not found` |
| `gh api repos/woodex420/woodexinterior` (token: `blackibexofficial-blip`) | `404 Not Found` |
| `gh repo view woodex420/woodexinterior` | `Could not resolve to a Repository` |
| `codeload.github.com/.../tar.gz/refs/heads/arena/8be318a2-woodexinterior` | `404` |
| Org/user repo listings for `woodex420`, `woodex-int` | no `woodexinterior` entry |
| Search `woodexinterior in:name` | only unrelated `woodex-int/woodex-os` (empty) |

An SSH host-key fingerprint (`SHA256:+PZ1s…`) proves identity of a **host**, not authorisation to read a
private repository. To be usable it needs a host + URL + a key that host accepts, and this sandbox can only
reach `github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org` and
`files.pythonhosted.org`. See §2 of the master plan for the three ways to unblock.

## What was analysed instead

Because the private repo is unreadable, the plan is grounded in the WOODEX repositories that **are**
readable — which turn out to contain most of the intended system:

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
