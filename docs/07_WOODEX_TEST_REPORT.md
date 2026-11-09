# 07 — Test report

Status **in progress**, 2026-11-08. Tests below use synthetic data. PASS means only the stated test cases passed in that environment; it does not certify a complete business feature. Full actual-data-source workflows, real providers, independent real Postgres concurrency, live HTTP/CWV and hosted security tests are **not run**.

## Tests executed during this audit continuation

| Test ID | Steps / expected | Actual | Evidence / boundaries |
|---|---|---|---|
| AUD-TS-01 | Run `npm run typecheck`; expect TypeScript app check succeeds. | **PASS** exit 0. | Current local tree; not Deno/SQL. |
| AUD-LINT-01 | Run `npm run lint`; expect no lint errors. | **PASS** 0 errors, 35 warnings. | Warnings remain; not a security certification. |
| AUD-P0-01 | `npm run test:p0-safety`; expect selected draft, role, restore and order RPC boundaries to hold. | **PASS 32/32**. | Isolated PGlite, synthetic fixtures; real host not tested. |
| AUD-WF-01 | `npm run test:phase1-workflows`; expect page capability matrix and accepted quote gate/rollback. | **PASS 28/28**. | PGlite, not independent real DB connections/customer approval. |
| AUD-PO-01 | `npm run test:procurement-reads`; expect selected role read/write boundary. | **PASS 38/38**. | PGlite; owner field/role approval and real extra policies pending. |
| AUD-SET-01 | `npm run test:settings-reads`; expect restricted raw settings, allowed projections and owner merge. | **PASS 36/36**. | PGlite; two-owner concurrency and host pending. |
| AUD-CMS-01 | `npm run test:cms-snapshot-boundary`; expect only published snapshot and no raw draft, duplicate slug fail closed. | **PASS 21/21**. | PGlite, projection is not content sanitization. |
| AUD-INT-01 | `npm run test:intake-safety`; verify JSON bounds, policy, receipts and Turnstile helper. | **PASS 24/24**. | Node mocks; strict mode not necessarily deployed. |
| AUD-BLD-01 | Render actual ProductRail with seed data, inspect links and open first item; expect `/shop/:id` and product page. | **FAIL before repair:** 1/3 checks passed, 2 failed; `/product/ballmer-executive-desk` led to 404. **PASS after repair:** expanded test 5/5, all 21 distinct cards across three filters led to matching product detail headings. | `npm run test:builder-product-rail`, local demo Vite only, external browser requests blocked. Does not verify hosted data or full editor publishing. |

| AUD-BUILD-01 | `npm exec --yes --package=bun -- npm run build`; expect production build. | **PASS**; stale Browserslist and large chunk warnings. | Local build; generated sitemap/MCP changes restored. |
| AUD-E2E-01 | `npm exec --yes --package=bun -- npm run e2e`; expect demo admin, builder, SEO and chat smoke checks. | **PASS 110/110** after the production-workspace and page-editor unsaved-change dialogs were asserted. | Synthetic demo data; does not establish real provider, financial or security correctness. |


## Page-editor follow-up (local, 2026-11-08)

| ID | Steps / expected | Actual / scope |
|---|---|---|
| EDIT-01 | `WOODEX_TEST_BASE=http://127.0.0.1:4178 npm run test:page-editor-safety` against fresh demo Vite server; delay adapter responses while editing, saving, publishing and restoring. | **PASS 12/12** after repair. Before repair the focused initial test exposed 4 failures (save/publish race, dirty state, browser unload and explicit Back). Synthetic fixtures; demo adapter is monkey-patched to delay operations. Not a real two-client/database concurrency test. |
| EDIT-02 | `WOODEX_TEST_BASE=http://127.0.0.1:4178 npm run test:seo-publish-gate` and `test:builder-product-rail`. | **PASS 10/10 and 5/5**, synthetic demo browser; external requests blocked. |
| EDIT-03 | `npm run typecheck`, `npm run lint`, `npm exec --yes --package=bun -- npm run build`. | **PASS**; lint 35 warnings; stale Browserslist and large build-chunk warnings. Generated sitemap/MCP files restored. |
| EDIT-04 | `npm exec --yes --package=bun -- npm run e2e` after the changes. | **PASS 109/109** after adapting the smoke test to accept and verify the new unsaved-change beforeunload dialog. Two earlier runs timed out during navigation without reporting checks; the blocking dialog was confirmed by the corrected run. Synthetic demo only. |


## Production workspace follow-up (local, 2026-11-08)

| ID | Steps / expected | Actual / scope |
|---|---|---|
| PROD-UI-01 | `WOODEX_TEST_BASE=http://127.0.0.1:4179 npm run test:production-workspace` on a fresh demo Vite server with adapter responses delayed. | **PASS 25/25** after repair. The original failures (overtaken save cleared newer edits, no unload warning, closing discarded unsaved changes) are still covered, plus: the stage editor sees a self-approval warning and a disabled pass button, the demo refuses a self-recorded pass and leaves QC pending, a second demo seat (QC) records the pass, a failed inspection relocks dispatch, a draft with dispatch data cannot be saved while QC is failed and offers a clear action, the demo audit log records entries, and a simulated revision conflict shows a reload banner while keeping the edits, with reload adopting the saved revision. Synthetic fixtures; the demo adapter is monkey-patched. Not a two-client or database concurrency test. |
| PROD-DB-01 | `npm run test:production-qc-boundary`; direct payload write of dispatch data while QC is pending, plus legacy, malformed and rollback cases. (Loads migrations up to 00021 so the narrower layer is tested in isolation.) | **PASS 21/21** with candidate 00021 applied in isolated PGlite. Before 00021 the same write was accepted (recorded as `FAIL` in the first run, then fixed). Its self-approval assertion documents why 00022 was needed and is expected to fail once 00022 is included. |
| PROD-DB-03 | `npm run test:production-shape-guard`; candidate 00023 — insert/update malformed production and practice shapes, confirm unchanged legacy rows stay editable and the workspace repair path succeeds. | **PASS 37/37** in isolated PGlite: unknown/missing/duplicate stages, out-of-range and text percentages, non-text notes/ids, invalid QC result and non-object QC, non-object dispatch, non-text known fields and nested unknown fields are all rejected; JSON-null collections and complete blocks are accepted; a legacy malformed row still allows unrelated edits but blocks malformed production edits and inspections until repaired; the repair save writes a valid record; rollback restores the previous behaviour without touching data. Synthetic fixtures; unapplied, not Supabase/production. |
| PROD-UI-02 | `WOODEX_TEST_BASE=http://127.0.0.1:4178 npm run test:production-legacy-payload`; inject a project whose `practice.production` lacks `stages`/`dispatch`, has an out-of-range percentage, a duplicate and an unknown stage, and whose `boq`/`milestones`/`files` have the wrong shape; open, edit and save it. | **PASS 15/15**. The previous code path is demonstrated to throw `TypeError: Cannot read properties of null (reading 'map')` on the same payload; after the fix the job opens with all five stages, the invalid percentage clamps to 100, a repair notice appears, the edit survives the save, and the stored record becomes a complete five-stage production block with an empty-but-complete dispatch object. Synthetic demo only. |
| PROD-DB-02 | `npm run test:production-qc-records`; candidate 00022 — capability matrix, revision conflict, server-derived QC, separation of duties, inspection/audit append-only rules, failed-inspection atomicity, legacy tolerance and rollback. | **PASS 60/60** in isolated PGlite. Covers anon/viewer/sales denial, direct self-approval rejection, stale-revision rejection without overwriting, inspection identity from `auth.users`, client QC fields ignored, refusal of a failed inspection while dispatch data exists (no orphan row, no revision bump), audit rows for QC/dispatch changes not writable by an editor, separation of duties (a stage edit stamps `production_updated_by`; that user's pass is refused with `42501` and stores nothing; a failure from the same user is allowed; a second `page.manage` holder can pass, and the roles swap cleanly), and a clean rollback that leaves project data intact. Synthetic fixtures; PGlite is not Supabase/production and there is no independent-connection concurrency proof. |
| PROD-DB-04 | `npm run test:production-order-linkage`; candidate 00024 — link/unlink an order to a job, the one-job-per-order index, cancelled/unknown orders, capability denial, a payload-patch re-point attempt, the `order_project()` projection and rollback. | **PASS 32/32** in isolated PGlite. The link is stored on the column (payload untouched), an audit event is written, linking twice is idempotent, `1043` normalises to `WDX-1043`, a second job is refused (`23514`), cancelled/missing orders are refused (`23514`/`P0002`), a direct `order_id` update is refused (`42501`), viewer/anon are denied (`42501`), progress rolls up to 35% for 100/75/0/0/0, unlink keeps inspections and QC, and rollback restores the schema without touching projects or orders. Synthetic data; not Supabase. |
| PROD-UI-03 | `WOODEX_TEST_BASE=http://127.0.0.1:4180 npm run test:order-project-linkage`; demo browser — start a job from an order, inspect the link from both pages, refuse duplicates/cancelled orders, unlink. | **PASS 16/16**. The empty state and "Start production job" create an inactive (non-portfolio) job titled with the order reference; the dialog shows progress/QC/dispatch; the order status is untouched; `order_linked` appears in the demo audit trail; a second job cannot claim the order and a linked job cannot be re-pointed; the Projects table shows an order badge; unlink clears the link, keeps the job and records `order_unlinked`; a cancelled order's button is disabled; no page errors. Synthetic demo only. |
| PROD-DB-05 | `npm run test:production-handover-warranty`; candidate 00025 — handover sequence, date bounds, one delivery/installation per job, warranty window and state, capability denial, rollback. | **PASS 37/37** in isolated PGlite. Delivery is refused without a QC pass, without dispatch details and on a job with no production; future and impossible (`1107-…`) dates are refused (`22023`); installation before delivery or without delivery is refused; a warranty requires installation, 1–120 months, opens on the installation date (`start + months − 1 day`), refuses a second active warranty, shows `expired` for an old installation, keeps a cancelled row with its reason and state `cancelled`; viewer/anon are denied and application roles cannot write the tables directly; rollback removes both tables and keeps projects and audit rows. Synthetic data; not Supabase. |
| PROD-UI-04 | `WOODEX_TEST_BASE=http://127.0.0.1:4182 npm run test:handover-warranty`; demo browser — Handover tab after a passed QC, delivery → installation → warranty → cancel. | **PASS 17/17**. The tab starts empty, installation is blocked before delivery, both handovers store their lead/signature/notes, the warranty opens as `active` with coverage/exclusions from the installation date, cancelling keeps the reason and shows `cancelled`, `handover_recorded`/`warranty_opened`/`warranty_cancelled` reach the audit trail, and duplicate/future/no-QC/zero-month attempts are refused with clear messages. Synthetic demo only. |
| PROD-DB-06 | `npm run test:production-warranty-claims`; candidate 00026 — claim opening against live/expired/cancelled/absent warranties, date bounds, transitions and terminal states, capability denial, rollback. | **PASS 30/30** in isolated PGlite. Opening requires a live warranty: cancelled, expired and absent warranties are refused (`23514`), as are blank/over-long input and future-dated claims; a claim cannot predate the warranty start; scheduling is allowed, resolving without a note is refused (`22023`), a resolved claim is terminal, unknown statuses and missing claims are refused; claims survive the warranty being cancelled; a viewer sees no claims and cannot open one; rollback removes the table and keeps projects, warranties and audit rows. Synthetic data; not Supabase. |
| PROD-UI-05 | `WOODEX_TEST_BASE=http://127.0.0.1:4183 npm run test:warranty-claims`; demo browser — open a claim on a live warranty, resolve it, then probe the refusals. | **PASS 16/16**. The claims panel starts empty, a claim opens with its opener and appears in the audit trail, resolving stores the note and the closure time and removes the action buttons, and blank/future/missing/terminal/no-warranty/no-note attempts are refused with clear messages. Synthetic demo only. |
| PROD-DB-07 | `npm run test:production-warranty-register`; candidate 00027 — register scope, derived states, days left, expiring flag, claim counts, ordering, capability denial and rollback. | **PASS 16/16** in isolated PGlite. Only jobs with a warranty or a claim are listed; `active/expired/cancelled` states, days left, the 60-day `expiring_soon` flag (and a narrower window), open-vs-total claim counts, handover dates and the dispatch vehicle are correct; ordering is soonest-expiry first within the active state; the window is bounded 0–365 (`22023`) and zero is allowed; viewer/anon are denied (`42501`); rollback drops only the projection. Synthetic data; not Supabase. |
| PROD-UI-06 | `WOODEX_TEST_BASE=http://127.0.0.1:4184 npm run test:warranty-register`; demo browser — `/admin/warranty-register` with two warranted jobs, one claim, filters and an expired warranty. | **PASS 14/14**. Both jobs list with their states and claim counts, the summary counters populate, the open-claims filter narrows to one row, an empty filter explains itself, returning to All restores the list, an expired warranty is derived after reload (a live module instance keeps its own copy — PROD-ENV-01), and the window guard rejects a negative value. No page errors. |
| PROD-ENV-01 | Note on local browser tests: after a long-lived Vite dev server has hot-reloaded, a test that imports `/src/api/demo/db.ts` can receive a second module instance with its own in-memory store, so reads disagree with the UI's writes even though `localStorage` is correct. The legacy-payload suite therefore reads demo state from `localStorage` and runs against a freshly started server; both browser suites were re-run on a fresh server for the recorded results. | Confirmed during this phase (a save succeeded in `localStorage` while the imported module still returned the previous value). Not a product defect; a test-harness constraint. |
| SEC-004 | `npm run test:public-surface`; candidate none — audit harness over all 27 migrations in isolated PGlite. | **PASS 7/7**. All migrations apply; every one of 61 application tables has RLS; the 3 policy-less tables are service-role only; 17 content tables are anon-readable through a policy and all are allowlisted public content; `anon` holds write grants on exactly one table (`track_events`); all 48 functions are accounted for; every anon-executable SECURITY DEFINER function has an internal capability/auth guard or is a documented public projection; the internal/trigger functions are revoked from both application roles. Widening any of these fails the run. Repository state only — hosted grants remain unverified. |
| PROD-REG-01 | Rerun `test:p0-safety`, `test:phase1-workflows`, `test:procurement-reads`, `test:settings-reads`, `test:cms-snapshot-boundary`, typecheck, lint, Bun build and full demo E2E. | **PASS** 32/32, 28/28, 38/38, 36/36, 21/21, typecheck clean, 0 lint errors (35 warnings), build OK with large-chunk/Browserslist warnings, E2E 110/110. Re-run after the order-link slice: production workspace 25/25, legacy payload 15/15, QC records 60/60, shape guard 37/37, order link 32/32 PGlite + 16/16 browser, build and E2E still OK. After the handover slice: handover/warranty 37/37 PGlite + 17/17 browser, all earlier suites re-run unchanged. After the claims slice: warranty claims 30/30 PGlite + 16/16 browser, all earlier suites re-run unchanged. After the register slice: warranty register 16/16 PGlite + 14/14 browser, all earlier suites re-run unchanged. Generated sitemap/MCP files restored. |

## Prior immediately preceding dashboard slice (local evidence)

- `test:dashboard-integrity`: **16/16** demo, **17/17** mocked Bagisto, **17/17** mocked Supabase. Tests cover UTC boundaries, cancellations, date filter, incomplete first-page sample, oversized mocked response, empty/error/retry and source warnings. Supabase Auth and adapter calls were intercepted/mocked; no provider/database was contacted. Final one-line accessibility-label adjustment followed these functional tests; typecheck/lint were rerun in this audit.
- `npm exec --yes --package=bun -- npm run build`: **PASS**, large chunks/stale Browserslist warnings. `npm exec --yes --package=bun -- npm run e2e`: **108/108** demo checks passed before the final analytics accessibility-label wording edit. No claim of actual live integration. Temporary build-generated sitemap/MCP changes were restored.
- Historic lead-content local evidence: browser **9/9**, demo lead details **5/5**, CSV unit **4/4**, mocked Deno handler **3/3**. Checkout cart local **9/9**, checkout safety **10/10**, mocked challenge **5/5**, Bagisto order **18/18**. See `PHASE1-LEAD-CONTENT-CONTRACT.md` and `PHASE1-CHECKOUT-CART-PRESERVATION.md` for exact scope. These suites were **not rerun** in this audit continuation.

## REL-004 — full local re-run on the committed tip

Executed 2026-11-09 on branch `arena/6bd5a1db-woodex-reimagined` at `5ceb672`, i.e. the tree whose
history is now committed as nine slices. Servers were started per suite with synthetic keys only;
every suite blocked or mocked external traffic. Nothing here is hosted evidence.

SQL / PGlite (`npm run test:<suite>`): rehearsal 93, p0-safety 32, phase1-workflows 28,
procurement-reads 38, settings-reads 36, cms-snapshot-boundary 21, qc-boundary 21, qc-records 60,
shape-guard 37, order-linkage 32, handover-warranty 37, warranty-claims 30, warranty-register 16.
Node-only: intake-safety 24, payments 15, ai-eval 19. Typecheck clean, lint 0 errors / 35 warnings.

Demo browser (`VITE_API_MODE=demo`, local server): production workspace 25, legacy payload 15,
order link 16, handover 17, claims 16, register 14, page-editor safety 12, dashboard integrity 16,
builder product rail 5, checkout safety 10, manual order 5, cart preservation 9, demo lead 7,
SEO publish gate 10, CMS demo reader 20, CMS document preflight 28.

Mocked-mode browser (server per suite, synthetic URL/key): procurement permissions 10 (`:4177`),
settings permissions 7 (`:4178`), published-page 5 (`:4177`), admin auth UI 15 (`:4180` + `:4181`),
checkout challenge 5 (`:8081`), lead content 9 (`:8084`), Supabase lead challenge 12 (`:8084`),
CMS Supabase reader 15 (`:4181`), CMS mocked Supabase route 11 (`:4188`), CMS reader modes 3/3
(`:4182`/`:4183`/`:4184`), CMS rendering guards 37 (`:4179`), CMS staging route 23 (`:4186`/`:4187`),
CMS staging build 3 (`:4189`). Bagisto adapter: order outcome 18, lead outcome 15 (`:8082`).

Build and smoke: `npm exec --yes --package=bun -- npm run build` exit 0 (large-chunk and stale
Browserslist warnings only); `npm exec --yes --package=bun -- npm run e2e` **110/110**. Generated
`public/sitemap.xml` and `supabase/functions/mcp/index.ts` were restored afterwards.

Two environment traps found while reproducing, both harness issues rather than product defects:

1. The repository's local `.env` supplies `VITE_SUPABASE_URL`, so suites that require an
   **unconfigured** build (`phase1-cms-reader-modes`) only pass when `.env` is temporarily absent.
2. A build produced while `.env` was absent bakes no demo admin credentials, and the smoke suite then
   fails at `#admin-email`. Rebuilding with `.env` present restores 110/110. Never reuse a build made
   in a stripped environment for the smoke suite.

## Required but not yet executed

| Test ID | Required steps / expected | Actual |
|---|---|---|
| CMS-E2E | Restricted staging editor saves synthetic draft; anonymous public remains unchanged, authorized preview shows draft; publish changes public; restore then publish restores old content, no drafts exposed. | **BLOCKED / NOT RUN** — staging and real hosting/auth not approved. |
| PRODUCT-E2E | Synthetic product + images + variants publish to actual staging storefront; verify storage references and permissions. | **NOT RUN**. |
| COMMERCE-E2E | Synthetic cart→checkout→order→payment state; response loss, concurrent stock/retries and approved sandbox settlement. | **NOT RUN**. |
| QUOTE-E2E | Enquiry→structured quote→print/PDF→revision→customer approval→concurrent single conversion. | **NOT RUN**; local gate does not establish customer approval. |
| CRM-E2E | Lead→assignment→follow-up→atomic client link and dedupe; inject failures and concurrent conversion. | **NOT RUN**. |
| AI-E2E | Trusted product retrieval→lead→staff handover with privacy, adversarial tests and budget controls. | **BLOCKED**; keep hosted AI disabled. |
| PROD-E2E | Order→project→design approval→production→QC→delivery→installation→warranty; direct API bypass checks. | **NOT RUN**; only the workspace and recorded-QC dispatch boundary below are covered locally. |
| SEO-E2E | Publish synthetic content; inspect initial HTTP HTML, canonical, schemas, sitemap, robots and redirect status. | **NOT RUN**. |
| SEC-E2E | Real independent anon/nonstaff/authorized sessions, direct PostgREST and storage policy tests; restore backup. | **BLOCKED** pending explicit staging authorization. |
| PERF-01 | Measure actual LCP, INP, CLS on documented device, network, code revision and host; targets 2.5 s, 200 ms, 0.1. | **NOT RUN**; bundle warnings are not CWV measurements. |

No test is marked complete solely because a page is present. Re-run affected suites after each implementation change; update this document with exact commands, revisions and results.
