# WOODEX — the Laravel admin already exists: audit and reconciliation plan

> **Report only. Nothing in this document has been built, applied or deployed.**
> Written 2026-11-11 on branch `arena/12c61b6f-woodex-reimagined` against
> `main` = `5fd8d31`.
>
> **Why it exists.** The owner shared `Woodex-v1.0.0-part1-of-2.zip` (63 MB) on Google
> Drive. This sandbox has no network route to Google (`curl` to `drive.google.com`,
> `drive.usercontent.google.com` and `gstatic.com` all return `http=000`), so the
> archive could not be downloaded. The same platform is public at
> **`github.com/woodex420/woodexinterior`** (branch `master`, pushed 2026-11-11,
> 136 MB) and this audit is of that source — `platform/`, `docs/`, `tools/`.
> **If the zip differs from that repo, the analysis below must be re-done.**
>
> **Supersedes** the build-from-scratch assumption in
> `LARAVEL-ADMIN-MASTER-PLAN.md` §1–§17 and the convergence recommendation in its §18.
> Both remain useful as cost models; neither reflects what already exists.

---

## 1. Headline

There are **three** WOODEX codebases, and the Laravel one is the most complete:

| # | Codebase | Shape | Measured |
|---|---|---|---|
| A | `woodex420/woodexinterior` → `platform/` | **Laravel 13.36 + Livewire 4.4 + Pest 5**, PHP 8.4 | **83 migrations**, 508 domain files, 137 Livewire components, 243 Blade views, **216 test files**, 40 controllers, public builder assets, 23 planning docs, Docker test harness, Hostinger runbook |
| B | `woodex420/woodex-2030` | React 19 dashboard + storefront + **Node 22 API** (SQLite/Postgres) | 41 dashboard pages / 12,548 lines, 8,912-line API, 71 endpoints, 18 migrations + rollback, 43 scripts, 4 Playwright flows |
| C | `blackibexofficial-blip/woodex-reimagined` (this repo) | React SPA + **Supabase/Postgres** | 50 admin pages / 18,748 lines, 13,744-line typed adapter, 38 migrations, RLS on 61 tables, 24 SQL suites, 123 browser checks, Puck studio |

**The Laravel tier the master plan proposed to build — auth, roles, audit, CRM, sales,
quotations, invoices, accounts, projects, website studio, conversations, automation,
integrations — is already built in A.** Planning to build it again would be the single
most expensive mistake available on this project.

---

## 2. What `platform/` actually contains (evidence)

**Stack** (`platform/composer.json`): `laravel/framework ^13.36`, `php ^8.4.1`,
`livewire/livewire ^4.4`, `laravel/fortify ^1.41`, `spatie/laravel-permission ^8.3`,
`spatie/laravel-activitylog ^5.1`, `spatie/laravel-medialibrary ^11.23`,
`spatie/laravel-backup ^10.3`, `spatie/laravel-settings ^3.9`,
`barryvdh/laravel-dompdf ^3.1`, `brick/math ^1.0`; dev: `pestphp/pest ^5.3`,
`larastan`, `pint`.

**Domain layer** — `app/Domain/` (508 files), one folder per business area:
`Accounts, Automation, Bot, Conversations, Crm, Marketing, Projects, Sales, System,
Website, Assistant`.

**Admin UI** — `app/Livewire/Admin/` (137 components): `Dashboard`, `MyDay`, `Hubs`,
`GlobalSearch`, `NotificationBell`, `Reports`, `Crm/*`, `Sales/*`, `Accounts/*`,
`Projects/*`, `Website/*`, `Marketing/*`, `Automation/*`, `Conversations/*`,
`OperationsControl`, `System/*`, plus shared `Concerns/` (saved views, attachments,
notification inbox, conversation history) and `Forms/CompanyForm`.

**Schema** — 83 migrations (`platform/database/migrations/`), including: users/2FA,
permissions, activity log, media, settings, notifications, system, CRM, sales, projects
and billing, CRM automation, website (pages, blocks with `block_key`, page templates,
content entries, theme tokens, saved sections, navigation with mega-menu, legacy
redirects, pagespeed runs, page canvas), invoices→payments, project updates, project
handover items, portal access codes, conversations, canned replies, WhatsApp templates,
MCP access tokens, Google accounts, scheduled task runs, document libraries, accounts,
payment-method accounts, estimates, automations, automation sequences, bot tables,
monthly reports, Telegram pending messages, reply SLA, social posts, project expenses,
integration connections, recurring invoices, vendors, bills, bill payments, recurring
expenses, expenses, input tax account, outbound webhooks, furniture documents, document
designs/PDF design.

**Integrations** — `app/Integrations/{Connectors, Google, Mcp, Support, Telegram,
Turnstile, Webhooks, WhatsApp}` (62 files).

**Public API** — `platform/routes/api.php`: a deliberately narrow *public* JSON surface
(leads with throttle, chat widget open/send/poll, legacy site bridge, MCP HTTP bridge) —
not a general admin API. The admin is Livewire-rendered, not JSON-driven.

**Website Studio** — `app/Domain/Website/{Builder, Studio, Seo, Speed, Conversion,
Import, Contracts, Services}` plus `public/builder/*` (a bespoke JS builder:
`builder.js`, `blocks.js`, `templates-v26.js`, `seo-analyzer.js`), `BlockLibrary`,
`GlobalSection`, `ThemeBridge`, `SiteWideReplace`, `StalePageException`.

**Operations & evidence culture** — `platform/STATE.md` (241,817 chars) and
`PROJECT_STATUS.md` (49,114 chars) record **108 revisions** with named reports,
`ox-pending.md` as the open queue, `docs/audit/*` reports, `tools/docker` (MySQL
phpunit config), `tools/release` (manual QA + backup/restore checklist),
`tools/mcp-bridge` with its own tests, `docs/06-DEPLOYMENT-HOSTINGER.md`,
`docs/14-PENDING-TASKS.md`, `docs/16-MASTER-PENDING-LIST.md`, `docs/21-OPERATING-SYSTEM-AUDIT.md`.

**Tests** — 216 files under `tests/` (195 Feature, 16 Unit), including
`AdminRouteAccessTest`, `OwnerTwoFactorPolicyTest`, `ApprovalEditSafetyTest`,
`PaymentIntegrityTest`, `QuotationSafetyTest`, `ConsentSafetyTest`,
`ConversationDraftSafetyTest`, `PaymentIntegrityTest`, `ClientPortalTest`,
`PublicLeadApiTest`, `InstallerTest`, `ResumableMigrationsTest`,
`SystemHealthTest`, `Website/*` (37 files), `Sales/*` (28), `Telegram/*` (7).
The names alone show the safety concerns we have been building in this repo.

---

## 3. Coverage against the spec's 15 module groups

| Spec module | In `platform/` | Evidence | Gap |
|---|---|---|---|
| Overview / Dashboard | **Present** | `Admin/Dashboard`, `MyDay`, `Hubs`, `Reports`, overview tests | — |
| Approvals | **Present (verify scope)** | `ApprovalEditSafetyTest`, approval flows inside Sales/Projects | confirm unified queue |
| Reports | **Present** | `ReportsKitTest`, `monthly_reports`, `Reports` components | export permissions to verify |
| CRM | **Present** | `Domain/Crm/*`, `LeadsIndexTest`, `LeadShowTest`, `CompaniesTest`, `ContactsTest`, `PipelineBoardTest`, `TasksAndVisitsTest`, `LeadCsvImportTest` | — |
| Sales | **Present** | `QuotesTest`, `QuoteBuilderTest`, `QuoteSendingTest`, `EstimateToQuoteTest`, `PaymentsTest`, `AdvanceInvoiceTest`, `recurring invoices`, PDFs via dompdf | credit notes: verify |
| Commerce (catalogue/orders/delivery) | **Partial** | `Website/Import`, `Furniture documents`, `item_images`, document library | no product/order/fulfilment engine; storefront is content-led |
| Procurement | **Absent** | no PO, receipt, supplier-invoice tables or domain | full build (we have Postgres specs in this repo) |
| Production | **Absent** | only `ProductionSeeder` (seed data, not a module) | full build |
| Inventory / warehouses | **Absent** | no stock ledger, warehouse, transfer, reservation | full build |
| Accounts | **Present** | `Domain/Accounts/{Actions,Enums,Reports,Services,Models}`, vendors, bills, expenses, recurring, input tax, `PaymentIntegrityTest` | — |
| Projects / portal | **Present** | `Projects/{Actions,Services,Policies,Mail}`, handover items, portal access codes, `ClientPortalTest`, `ProjectCostsTest`, `ChangeRequestsBoardTest` | — |
| Inbox / Conversations | **Present** | `Conversations/*`, WhatsApp + Telegram + Google + MCP, `ConversationHistoryWindowsTest`, `CannedRepliesTest`, SLA | — |
| Automation | **Present** | `Automation/{Actions,Listeners,Models,Enums}`, `automation_sequences`, `SequenceEngineTest`, `OnConsentSafetyTest` | — |
| Marketing | **Present** | `Marketing/{Models,Social}`, `social_posts`, `SocialPlannerTest` | campaigns/attribution depth to verify |
| Website Studio | **Present (different builder)** | `Website/{Builder,Studio,Seo,Speed,Conversion}`, 37 Website tests, bespoke `public/builder/*` | see §5 (Puck vs theirs) |
| System | **Present** | permissions, 2FA, activity log, settings, backup (spatie), health, installer, import, audit, `SystemHealthTest`, `ResumableMigrationsTest` | — |
| Warranty / claims | **Absent** | none | build (this repo has the local spec: migrations 00021–00027 + suites) |

**Read that table twice.** The platform is strong exactly where this repo and 2030 are
weak (commercial operations, accounts, communications, automation), and absent exactly
where they are strong (procurement, inventory, production, warranty/claims). That is a
complementary split, not a competitive one.

---

## 4. What each codebase is good for

| Asset | Best source | Why |
|---|---|---|
| Commercial + accounts + CRM + inbox + automation + website studio | **A (`platform/`)** | built, migrated, tested, documented, Hostinger runbook exists |
| Procurement, inventory, production/QC, warranty/claims **behaviour** | **C (this repo)** | 38 migrations with RLS, capability guards, revision tokens, 24 suites — a written, tested specification to port |
| Agency-OS UI breadth (41 pages, stock/reservations/credit-notes/production dashboards) | **B (2030)** | fastest reference for screens and flows on those four domains |
| Visual page builder | **C (Puck studio)** vs **A (bespoke JS builder)** | decide by comparison, §5 |
| Publish/revision contract | **C** | revision tokens, published snapshots, preview permission, published-only sitemap — proven by 26+31+39+19+30 checks |
| Test corpus & bug classes | **C + B** | 24 SQL suites, 123 browser checks, 43 Node scripts — translate the cases, don't re-derive them |

---

## 5. The one genuine architecture question: Puck vs the platform's builder

| | This repo (Puck v0.19) | Platform (`public/builder/*` + `Domain/Website/Builder`) |
|---|---|---|
| Component model | React components, typed fields, 40 sections + 17 elements | JS builder with block library, templates, global sections, canvas |
| Persistence | `pages` + `page_blocks` (+ revision tokens, published snapshot) | `pages`, `page_blocks` with `block_key`, `page_templates`, `saved_sections`, theme tokens, canvas HTML |
| Public safety | `preparePublicDocument` — 13 of 57 block types accepted, rejects HTML/CSS | server-rendered Blade; safety boundary is the server, not a preflight |
| Verification | 39-check persistence suite, publish pipeline suites, sitemap suite | 37 `Website/*` tests incl. `ThemeTokensTest`, `SiteWideReplace`, page-speed runs |

**Recommendation:** do not merge builders now. Keep the platform's builder as the
authority for the live site (it is server-rendered, already wired to their pages and
templates), and treat this repo's Puck work as a **candidate replacement** to be
evaluated only after Phase 2 of the reconciliation — the publish/revision contract is the
portable part, not the React editor. Merging two builders before the domains are settled
would double the surface that has to be re-tested.

---

## 6. Recommendation

1. **Adopt A (`platform/`) as the production authority** for commercial operations,
   accounts, CRM, projects/portal, conversations, automation, marketing and website
   content. It is the only codebase that satisfies the owner's spec §2.6 (Laravel + MySQL)
   and it already implements most of §7.
2. **Freeze B (`2030`).** It duplicates A's commercial surface in a second stack. Harvest
   its four missing operational screens as UI reference; do not deploy it.
3. **Keep C (this repo) as a specification and test corpus**, not as a parallel product:
   port its procurement/inventory/production/warranty behaviour into A as Laravel domain
   modules, and translate its suites into Pest. Its Supabase tier stops taking new
   business domains from today.
4. **Stop the Laravel build plan.** `LARAVEL-ADMIN-MASTER-PLAN.md` §1–§17 is now a cost
   model for building what already exists; §18's convergence advice is superseded.
5. **Answer the storefront question separately** — Blade (A) vs React (B/C) — after the
   operational gaps close. Both React storefronts exist; A's is server-rendered and
   already SEO-wired.

---

## 7. Reconciliation work packages

| ID | Work | Effort | Exit evidence |
|---|---|---|---|
| **RA-1** | Verify A end-to-end in Docker (`tools/docker/compose.yaml`, `phpunit.mysql.xml`): `composer install`, `pint --test`, `phpstan`, `pest` (216 files), plus `tools/mcp-bridge` tests | 2–3 d | quoted pass tallies per suite, committed to A's `STATE.md` |
| **RA-2** | Publish a **capability matrix** for A against spec §7 (the §3 table above, verified against code, not names) | 2 d | matrix committed in A's docs |
| **RA-3** | **Procurement** domain in A: suppliers, POs, lines, goods receipts, supplier invoices, matching exceptions — ported from this repo's migrations and 2030's API shapes | 10–14 d | migrations + Pest per rule; no partial receipt possible |
| **RA-4** | **Inventory** domain in A: warehouses, stock ledger, balances, transfers, reservations, adjustments | 10–14 d | ledger reconciles to balances; concurrent reservation test |
| **RA-5** | **Production/QC** domain in A: jobs, stages, materials/BOM, QC separation, dispatch, handover evidence | 12–16 d | QC signer ≠ stage mover enforced server-side |
| **RA-6** | **Warranty/claims/register** domain in A: port migrations 00021–00027 semantics (claim cost, replacement stock movement, SLA, register) | 8–10 d | claim decrements stock atomically; SLA visible |
| **RA-7** | Port the **publish/revision contract** into A's Website domain where it is weaker: revision tokens on save/publish, immutable published snapshot, preview permission, published-only sitemap index | 5–8 d | draft→preview→publish→revert round trip with two accounts |
| **RA-8** | Translate this repo's 24 SQL suites + 123 browser checks into Pest/Playwright cases in A, marking each as ported or obsolete | 10–12 d | parity table; no behaviour lost in the move |
| **RA-9** | **Data migration** Supabase/Postgres → A's MySQL: per-domain extract/load/reconcile, one writer at a time | 8–12 d | row and money parity per domain |
| **RA-10** | Retire duplicates: archive B; freeze this repo's commercial admin pages; document what remains authoritative where | 2 d | a one-page ownership map |

**Total: 69–93 agent-days** — and unlike the 100–135 d build plan, **most of it lands on
the four missing operational domains**, not on re-implementing CRM or quotations.

---

## 8. Sequenced first steps

1. **RA-1** — prove A builds and its 216 tests pass in a clean environment. Without that,
   every other number in this document is a guess.
2. **RA-2** — verify the §3 table in code (I inferred from file names; approvals scope,
   credit notes and marketing depth need reading, not guessing).
3. **RA-7** — close the publish/revision gap early; it is the highest-risk behaviour in
   the platform (public content correctness) and the cheapest to port because the
   contract is already written and tested here.
4. **RA-3 → RA-6** — the four operational domains, one at a time, each with its own
   rehearsal evidence.
5. **RA-8/RA-9** — port the test corpus and migrate data only after the domains exist;
   migrating data into a schema that is still moving is how reconciliations rot.

---

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Three codebases, one business | divergent records, double work | one authority (A) declared in writing; B frozen; C demoted to spec |
| The 63 MB zip differs from `woodexinterior@master` | this audit targets the wrong tree | owner confirms; if different, re-run the audit on the archive |
| `master` at 136 MB and 108 revisions of uncommitted-by-agent history | stale clone / hidden work | RA-1 runs on a fresh clone with a quoted commit SHA |
| Two builders (Puck vs platform) | duplicated editor work | §5: keep the platform's, evaluate Puck later |
| Tests claim coverage that does not run in shared hosting | false confidence | RA-1 in Docker with MySQL, not SQLite |
| Data migration into a moving schema | corrupt reconciliation | RA-9 last; per-domain freeze windows |

---

## 10. What I need from the owner to continue

1. **Confirm the canonical source**: is `woodex420/woodexinterior@master` (branch `master`,
   commit at 2026-11-11) the same tree as `Woodex-v1.0.0-part1-of-2.zip`? If not, attach
   the archive **in this chat** (attachments reach the workspace) or push it to a public
   GitHub repo — Google Drive is unreachable from this sandbox.
2. **Permission to work in that repository** (I can read it; commits need it added to this
   session's GitHub access).
3. **Which database is live today** — Hostinger MySQL for `platform/`, or still Supabase
   for the React app? This decides RA-9's direction.
4. **Whether the storefront stays Blade or moves to React** — the answer changes RA-7's
   scope, not its urgency.
5. **Confirmation of the four missing domains as the priority** (procurement, inventory,
   production/QC, warranty/claims) — that is where I would spend the next four sprints.
