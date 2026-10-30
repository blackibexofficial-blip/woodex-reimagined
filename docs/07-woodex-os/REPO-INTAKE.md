> **Historical record.** The intake decisions below were superseded by `MASTER-PLAN.md` v6.
> Kept as the method record for how the OS was measured.

# WOODEX OS — Repo Intake Checklist

Use this the moment read access to `woodex420/woodexinterior` exists (or a zip is supplied). The goal is to
answer one question: **is WOODEX OS a foundation to extend, or a reference to mine?**

## 0. Access

- [ ] Public repo **or** `blackibexofficial-blip` added as read collaborator **or** archive dropped in this workspace
- [ ] Branch confirmed: `arena/8be318a2-woodexinterior` (or `main` if that branch is gone)
- [ ] Record the commit SHA being analysed in every downstream document

## 1. Ten-minute triage

| Question | How to check | Why it matters |
|---|---|---|
| Laravel version? | `composer.json` → `laravel/framework` | Bagisto 2.5 needs Laravel 13 / PHP 8.4 |
| Which admin stack? | `app/Filament`, `routes/nova.php`, `resources/views`, Vue/React assets in `public/` | Decides whether OS admin survives or is replaced by Bagisto admin |
| Database engine? | `.env.example` → `DB_CONNECTION` | MySQL vs Postgres changes the whole migration plan |
| Multi-tenant? | `stancl/tenancy`, `tenant_id` columns | WOODEX is single-tenant — tenancy would be dead weight |
| Auth? | `config/auth.php`, Sanctum/Passport/Breeze/Jetstream | Must unify with storefront tokens |
| Existing commerce? | models for Product/Cart/Order/Payment | If it already has commerce, we integrate rather than replace |
| Tests? | `phpunit.xml`, `tests/` | Tells us how safe refactoring is |
| Queue/scheduler? | `config/queue.php`, `app/Console/Kernel.php`, `routes/console.php` | Needed for PDFs, WhatsApp, payment webhooks |

## 2. Deep inventory (produce a table per item)

- [ ] **Routes** — `php artisan route:list --json` → save as `docs/intake/routes.csv`
- [ ] **Models** — `app/Models/*` → list table, relationships, casts, global scopes
- [ ] **Migrations** — `database/migrations/*` → run `php artisan schema:dump --prune` on a copy
- [ ] **Live schema** — `mysqldump --no-data` (or `pg_dump -s`) from a **staging** database, never production
- [ ] **Controllers / services / jobs** — map business rules, especially anything about quotations, pricing, advances
- [ ] **Roles & permissions** — seeders, policies, gates
- [ ] **Integrations** — search for `safepay|jazzcash|easypaisa|payfast|stripe|whatsapp|meta|twilio|resend|smtp|s3`
- [ ] **Scheduled jobs** — what runs nightly, who depends on it
- [ ] **Storage** — local disk vs S3 buckets, file counts and sizes
- [ ] **Front-end assets** — is there a separate admin SPA? Which design system?

## 3. Decision matrix (fill in, then choose)

| Finding | Consequence |
|---|---|
| Clean Laravel 10/11 app, no commerce, custom admin | **Adopt** as WOODEX OS base; add Bagisto as a module set or run commerce in a sibling app |
| Laravel 13 / PHP 8.4 already | Ideal — Bagisto 2.5 drops in |
| Laravel ≤ 9 or abandoned packages | Upgrade or rebuild; budget 2–3 weeks |
| Filament or Nova admin | Keep the UI, wire it to Bagisto models, or replace screens with Bagisto admin |
| Existing order/quote logic | Port rules into WOODEX modules; **do not** fork Bagisto core |
| Postgres | Either migrate to MySQL (Bagisto requirement) or keep Postgres for OS and run MySQL for commerce — two DBs, more ops |
| Committed secrets | Rotate + purge before any push |

## 4. Port order after intake

1. Auth + users + roles (must exist before anything else)
2. Products/categories/media (seed the 148-product catalog)
3. Quotation engine (the revenue path)
4. Orders, advances, invoices
5. Inventory + deliveries
6. Content (blog, services, projects, FAQs)
7. WhatsApp + notifications
8. Analytics/KPIs

## 5. Output of this exercise

A single page — **`docs/intake/OS-BASELINE.md`** — containing:

- Laravel/PHP/DB versions, package list with abandon flags
- Route count by domain, model count, migration count
- A table: **feature → exists / partial / missing → plan (reuse / port / rebuild)**
- A diff against the target architecture in `MASTER-PLAN.md`
- A revised phase estimate with the delta called out explicitly
