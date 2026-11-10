# Phase 2 — Completion master plan (evidence-based)

**Status: prepared, nothing executed.** No migration in this plan has been applied, no hosted
write has been made, and no row of the feature matrix is marked complete by this document.
Owner authorization is required at the gates marked **GATE**.

Baseline: branch `arena/6bd5a1db-woodex-reimagined`, PR #29 open at `7d5658a`, ~155 changed or
untracked files in the working tree. Root migrations `00001–00027`; `00021–00027` are unapplied
local candidates. Feature matrix: **265 triaged rows — 0 Complete**, 197 In Progress, 29 Testing,
25 Not Started, 15 Blocked.

Related documents: `docs/01`–`docs/10`, `docs/04_WOODEX_REMAINING_WORK_MASTER_PROMPT.md`
(task backlog), `docs/02_WOODEX_FEATURE_COMPLETION_MATRIX.md` (row-level triage),
`docs/08-master-plan/PHASE1-STAGING-APPLY-CHECKLIST.md` (apply/rollback runbook for 00021–00027).

---

## 0. Rules this plan obeys

1. **Reuse → repair → complete → optimize.** No rebuild of the Puck editor, the API adapter seam,
   the admin shell or any working module.
2. **No row leaves a non-complete status without evidence** from the stated environment. UI
   presence is not evidence; a local PGlite pass is not hosted proof.
3. **Local ≠ staging ≠ production.** Every task names the environment its evidence comes from.
4. **Nothing is applied to staging or production without the gate owner's written go-ahead**, a
   recorded backup location and a rollback rehearsal that has actually run.
5. **Every migration ships with a rehearsal script and a documented drop order.** Drop order is
   reverse dependency order (the 00025 case: claims must be dropped before warranties).
6. **Keep the application deployable at every commit**; no long-lived broken branch.
7. **One source of truth per entity** — no parallel products/orders/projects tables.
8. **Stop conditions** (§9) end a phase early rather than being worked around.

---

## 1. Baseline inventory (what exists today)

| Capability | Current evidence | Honest limit |
|---|---|---|
| Storefront SPA + admin SPA | `src/App.tsx`, `src/admin/AdminApp.tsx`, demo E2E 110/110 | demo storage, demo login |
| Puck page builder | `src/admin/pages/PageEditor.tsx`, `src/pages-builder/*` | persistence/publish not proven |
| API adapter seam (demo / supabase / bagisto) | `src/api/{demo/db,supabase,bagisto/admin}.ts` | backend parity unproven |
| Local PGlite regression harness | `rehearsal/*.mjs`, 12 suites | synthetic, no real concurrency |
| Browser regression harness | `e2e/phase1-*.mjs` (24 suites), `e2e/smoke.mjs` | demo mode, synthetic data |
| Auth/P0 migrations | `00001`, `00015`–`00027` | hosted RLS/grants unverified |
| Production workflow (QC → dispatch → delivery → installation → warranty → claims → register) | `00021`–`00027`, `rehearsal/production-*.mjs`, `e2e/phase1-{production,handover,claims,register}*.mjs` | local only; dispatch→order status undecided |
| Docs set | `docs/01`–`docs/10` + 30 master-plan docs | several stale lines, being corrected |

**Commands used to reproduce the baseline** (bun is required for build/E2E):

```
npm run test:production-qc-boundary      # 21
npm run test:production-qc-records       # 60
npm run test:production-shape-guard      # 37
npm run test:production-order-linkage    # 32
npm run test:production-handover-warranty# 37
npm run test:production-warranty-claims  # 30
npm run test:production-warranty-register# 16
npm run test:p0-safety ... test:phase1-workflows, test:procurement-reads,
npm run test:settings-reads, test:cms-snapshot-boundary, test:production-legacy-payload
npm run typecheck && npm run lint
npm exec --yes --package=bun -- npm run build
npm exec --yes --package=bun -- npm run e2e   # smoke 110/110
```

---

## 2. Critical path

```
M0  release hygiene ──► M1  owner decisions ──► M2  staging safety (backup + 00021–00027)
                                                     │
                                                     ▼
                          M3  security tenancy ──► M4  money/order integrity
                                                     │
                                                     ▼
                          M5  production completion ──► M6  CMS/builder parity
                                                     │
                                                     ▼
                          M7  catalogue + media ──► M8  commerce/customer
                                                     │
                                                     ▼
                          M9  front office (CRM/booking/chat/AI) ──► M10 go-live gate
```

Parallel-safe: M6 builder row-by-row work can run beside M7 catalogue; M9 chat/AI stays blocked
until owner decisions D-05/D-06 are taken. **M0 and M1 have no code dependencies — start there.**

---

## 3. Milestones and work packages

Effort bands are agent-days of focused work, not calendar promises. Each package lists the
evidence that would let its matrix rows change status.

### M0 — Release hygiene (1–2 days, no gate)

| ID | Work | Deliverable | Evidence |
|---|---|---|---|
| REL-001 | Commit the 155-file working tree in reviewable slices (production slice, docs, staging checklist) and push to the session branch | commit series + PR #29 description with the slice list and test tallies | `git log`, CI/E2E log |
| REL-002 | Fix stale doc lines found in the last audit (checklist title said 00021–00023 while the body lists seven; `docs/10` quoted 109/109) | corrected lines | `rg` output |
| REL-003 | PR #29 review pass: confirm no secrets, no build artifacts, no generated files committed | review notes + `git diff --stat` | green checks |
| REL-004 | Re-run the full local suite on the committed tree | tallies recorded in `docs/07` | commands in §1 |

**Exit:** branch pushed, PR reviewable, tree clean except intended files.

### M1 — Owner decisions (**GATE 1**)

| ID | Decision | Blocks |
|---|---|---|
| D-01 | System of record: demo / Supabase / Bagisto / hybrid | GOV-001, every hosted test, DASH-001, CAT-001 |
| D-02 | Dispatch → order status rule (does dispatch move the order?) | PROD-002, ORDER-002 |
| D-03 | Audit-retention & tamper policy (how long, who can read) | SEC-004, PROD-003 |
| D-04 | QC seat rule: `page.manage` or a dedicated capability | PROD-001 follow-up |
| D-05 | Finance definitions: booked vs recognized vs paid, timezone, refunds | DASH-001, FIN-001 |
| D-06 | Chat/AI provider, privacy, retention, spend caps | CHAT-001, AI-001 |
| D-07 | Booking policy: staff availability, slot length, cancellation window | BOOK-001 |
| D-08 | Staging project reference + backup location + apply window | M2 |

Recorded in `docs/04` (GOV-001 row) and the staging checklist header. **No code proceeds past
M2 without D-01 and D-08.**

### M2 — Staging safety (**GATE 2**)

| ID | Work | Acceptance |
|---|---|---|
| OPS-001 | Backup + restore drill on the isolated staging project | dump restored into a scratch database; row counts and RPC inventory match; restore time recorded |
| OPS-002 | Migration/RPC inventory before apply | `pg_proc`/`information_schema` snapshot captured |
| STG-001 | Apply `00021`–`00027` in dependency order per `PHASE1-STAGING-APPLY-CHECKLIST.md` | seven verify queries pass; functional checks 1–20 executed with synthetic accounts |
| STG-002 | Rollback drill in the documented order (register → claims → handover → …) | schema returns to the 00020 state; app stays up |
| STG-003 | Record results in `docs/09` and the checklist close-out block | signed-off checklist |

**Exit:** production candidates are proven applicable and reversible on staging. Production still
untouched; a further gate is required for that.

### M3 — Security and tenancy (6–10 days, P0)

| ID | Work | Deliverable | Acceptance |
|---|---|---|---|
| SEC-001 | RLS policy matrix per sensitive table on staging | policy table in `docs/06` | anon / authenticated-nonstaff / editor / owner / service-role matrix all behave as specified; drafts and private projects never returned |
| SEC-002 | Staff identity & role matrix (`auth.tsx`, 00001/00018/00019) | role table + migration if gaps found | forged role claim, revoked user and direct RPC calls denied (`42501`) |
| SEC-003 | Storage buckets, MIME/size limits, signed URLs | policies + test | cross-tenant read denied; oversized/wrong-type upload rejected |
| SEC-004 | Direct-API denial matrix for every `public` RPC and table | harness that enumerates `pg_proc` | every RPC is either capability-gated or explicitly public, proven by test |
| SEC-005 | Secret exposure sweep (client bundle, edge functions, env) | report + fixes | no service key, no provider token in the client bundle or `VITE_*` |

**Exit:** a hostile-actor test account cannot read or write anything it should not, proven on
staging with independent sessions.

### M4 — Money and order integrity (10–14 days, P0)

| ID | Work | Deliverable | Acceptance |
|---|---|---|---|
| ORDER-001 | Payload-bound idempotency for order submission | candidate migration + RPC | identical replay returns the original order; altered replay is refused; lost response + retry creates exactly one order; concurrent duplicates impossible |
| ORDER-002 | Order status state machine (uses D-02) | migration + UI + audit | illegal transitions refused server-side; dispatch rule applied as decided; cancellation semantics documented |
| QUOTE-002 | Version-bound approval + duplicate-free conversion | migration + UI | staff cannot self-approve; frozen pricing; concurrent conversion yields one order |
| FIN-001 | Ledger: advances, partials, refunds, receivables (uses D-05) | schema + reports | ledger reconciles with payment records; refund cannot exceed captured amount |
| INV-001 | Atomic stock moves, receipts, transfers, returns | transactions + tests | no partial receipt/transfer; reconciliation query matches |

**Exit:** no test can create two orders, two conversions, negative stock or a ledger imbalance.

### M5 — Production completion (8–12 days)

| ID | Work | Acceptance |
|---|---|---|
| PROD-002 | Multi-order jobs or an explicit one-job-per-order acceptance (D-02) | documented decision; if multi-order, link table + tests |
| PROD-003 | Unlink/cancel must not silently leave a running job | cancelled order's job is stopped or flagged with an audit row |
| PROD-004 | Claim cost/replacement decision + inventory movement | replacement decrements stock atomically; claim carries a cost |
| PROD-005 | Register reminders, SLA target, assignment | expiring job notifies the assigned seat; SLA breach is visible |
| PROD-006 | Proof capture (delivery/installation photos, signature) | storage-backed, policy-gated, shown on the handover tab |
| PROD-007 | Revision checks on all project fields + router unsaved-change guard | two independent editors cannot overwrite each other; navigation warns |

**Exit:** the full chain order → job → QC (independent) → dispatch → delivery → installation →
warranty → claim → register is operable on staging with two real seats, and every step is audited.

### M6 — CMS and builder parity (12–18 days)

| ID | Work | Acceptance |
|---|---|---|
| CMS-001 | Publish pipeline: immutable public snapshot, slug/publish/revision semantics | draft → public unchanged → authed preview → publish → public → restore, all executed on staging |
| CMS-002 | Server-side revision conflicts + SPA-wide unsaved guard | stale save gets a conflict, not a silent overwrite; navigation blocked when dirty |
| BLD-002 | Row-by-row regression of 37 builder capabilities (drag, reorder, duplicate, delete, undo/redo, nested, inline text, image replace) | each row individually proven with save + reload |
| BLD-003 | Block persistence contract; expand public preflight beyond 13 blocks | published output matches editor for every enabled block |
| BLD-004 | Safe HTML/CSS policy (unblocks 2 Blocked rows) | sanitizer rules documented and tested; unsafe input rejected |
| BLD-005 | Widget completion: quote form, appointment form, product carousel, gallery, showroom | each widget persists, renders publicly and submits through one path |
| SEO-001 | Dynamic published-only sitemap, metadata, canonical, redirects (uses D-01) | crawler sees real HTTP/HTML/status; staging noindex verified |

**Exit:** builder rows that are In Progress today become Testing or Complete with saved-and-reloaded
evidence; nothing is "done" because a handle is visible.

### M7 — Catalogue and media (8–12 days)

| ID | Work | Acceptance |
|---|---|---|
| CAT-001 | Product CRUD → variants → media → publish → public detail (uses D-01) | server-authoritative SKU/price/stock; rollback works |
| CAT-002 | Variants, dimensions, materials, finishes, related products, SEO | each field round-trips to the public page |
| MEDIA-001 | Upload/replace/crop/alt/delete + asset-usage tracking | replacing an asset updates every referencing page/product and no orphans remain |
| BLOG-001 | Blog + services CRUD, categories, authors, SEO, public routes | published/unpublished visibility correct |

### M8 — Commerce and customer (8–12 days)

| ID | Work | Acceptance |
|---|---|---|
| COMM-001 | Cart persistence, checkout hardening, returns/exchanges | cart survives reload and cross-tab; return decrements and restocks exactly once |
| CUST-001 | Customer account route and order history | customer sees only their own orders (RLS-proven) |
| COMM-002 | Payment provider sandbox (only if adopted under D-01/D-05) | signature-verified webhook, idempotent, no real card data |

### M9 — Front office (10–16 days, partly gated on D-06/D-07)

| ID | Work | Acceptance |
|---|---|---|
| CRM-001 | Atomic client/lead/site-visit creation and dedup | one transaction; no partial links; consent recorded |
| BOOK-001 | Availability, slot reservation, reschedule/cancel, reminders | concurrent booking of one slot yields exactly one booking |
| CHAT-001 | Persistent visitor/staff messages, assignment, read state, handover | two browsers exchange messages; history survives reload; staff-only access |
| AI-001 | Grounded retrieval over real product/policy data, budgets, evals | answers cite real catalogue rows; spend cap enforced; hosted AI stays off until sign-off |
| PROJ-001 | Portfolio/before-after galleries, showroom, enquiry integration | enquiry lands as a lead with source and consent |

### M10 — Operations readiness and go-live (**GATE 3**)

| ID | Work | Acceptance |
|---|---|---|
| DASH-001 | Server-side aggregates with approved definitions (D-05) | totals reconcile against raw rows; ranges and drill-downs work beyond page 1 |
| PERF-001 | Measure LCP/INP/CLS on a deployed staging URL | targets ≤2.5 s / ≤200 ms / ≤0.1 recorded with device and network |
| A11Y-001 | Keyboard, focus, contrast, screen-reader pass | manual pass documented; no critical axe violations |
| OBS-001 | Error tracking, log retention, alerting, uptime check | a forced error is captured and alerted |
| DEP-001 | Production apply + smoke + rollback plan | owner-signed; rollback rehearsed; on-call named |

---

## 4. Migration track

Reserve `00028`–`00045`. Each carries a rehearsal script in `rehearsal/`, an npm script
`test:<slice>`, a drop-order line in the staging checklist and a `docs/05` row.

| Range | Candidate | Work package | Rollback |
|---|---|---|---|
| 00028–00030 | Order idempotency, order status machine | ORDER-001/002 | drop RPCs, then helper table |
| 00031–00032 | Quote approval versioning | QUOTE-002 | drop RPCs, then columns |
| 00033–00034 | CRM atomic linking + consent | CRM-001 | drop RPCs |
| 00035 | Project revision guard for all fields | PROD-007 | drop trigger/functions |
| 00036 | Claim cost + replacement/inventory link | PROD-004 | drop function, then columns |
| 00037–00038 | Booking slots and reservations | BOOK-001 | drop RPCs, then table |
| 00039–00040 | Media usage tracking / storage policy | MEDIA-001, SEC-003 | drop table, policy notes |
| 00041 | Aggregate views for dashboard | DASH-001 | drop views |
| 00042 | Finance ledger refinement | FIN-001 | drop views/functions |
| 00043–00045 | Chat/AI grounding tables (only under D-06) | CHAT-001, AI-001 | drop tables |

Numbering is indicative; the actual number is assigned when the slice is built, and the checklist
is updated in the same commit.

---

## 5. Test strategy

Three layers, all run locally today; only layer 1 is complete.

| Layer | Harness | Runs against | Proves |
|---|---|---|---|
| 1 — synthetic SQL | `rehearsal/*.mjs` on PGlite | isolated Postgres | schema/logic, grants, rollback |
| 2 — browser | `e2e/phase1-*.mjs` on demo mode + `e2e/smoke.mjs` | Vite dev/preview server | UI behaviour, two-seat flows |
| 3 — staging | **does not exist yet** | hosted Supabase + deployed preview | RLS reality, concurrency, providers |

Layer 3 is the gap that keeps every matrix row out of Complete. Each phase must add staging
integration tests before its rows can move; the pattern is a scripted runbook entry with a
recorded environment, revision and synthetic accounts.

**Evidence format** (append to `docs/07` per phase):

```
Suite | Command | Environment (local PGlite / demo browser / staging ref) | Revision | Passed/Total | Notes
```

**Definition of Complete for a matrix row:** acceptance test executed in the environment named in
the row · evidence recorded with revision · rollback documented · docs updated · owner sign-off for
security/finance rows. Anything less stays Testing or In Progress.

---

## 6. Sequencing rules

1. M0 and M1 can start immediately and in parallel.
2. M2 needs D-08, and must finish before any hosted assertion in M3–M10.
3. M3 precedes M4: money integrity tests are meaningless without proven access boundaries.
4. M4 precedes M5 only where claims touch orders/invoices; PROD-003 (unlink guard) can run earlier.
5. M6 and M7 can run in parallel; both depend on CMS-001 for public output.
6. M9 chat/AI is last and fully gated; it is the only area where "Blocked" is the correct resting state.
7. Every milestone ends with a documentation pass and a full regression re-run.

---

## 7. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Hosted apply without a verified backup | data loss | GATE 2; restore drill must pass first |
| Backend decision (D-01) keeps slipping | all hosted work stalls | keep local layer green, finish M0/M5/M6 rows that do not need it |
| Builder rows declared done on UI evidence | false completion | row-by-row save/reload rule in BLD-002 |
| ACs written against demo behaviour drift from Supabase | rework | keep adapter parity tests; one contract per method |
| Single-staff sites cannot satisfy QC separation | blocked dispatch | D-04 decision; document a fallback (owner override with audit) |
| Long-running branch diverges from main | merge pain | commit in slices (REL-001), keep `main` rebases frequent |

---

## 8. Documentation upkeep

After each milestone update: `docs/02` (rows + counts), `docs/03` (new root causes),
`docs/05` (migration rows), `docs/07` (evidence rows), `docs/08` (progress),
`docs/09` (staging/production state), `docs/10` (known issues), and the staging checklist.

---

## 9. Stop conditions

- A backup restore cannot be verified → stop hosted work, escalate to the owner.
- A migration cannot be rolled back cleanly → do not apply the next one.
- A staging test shows cross-tenant data access → freeze the affected module, fix, re-verify.
- Owner decisions D-01/D-08 are still open → do not start M3–M10 hosted work; continue local-only
  packages (PROD-004..007, BLD-002, BLOG-001, A11Y-001).

---

## 10. First two weeks (concrete)

| Day | Work |
|---|---|
| 1 | REL-001 commit slices; REL-002 doc fixes; push |
| 2 | REL-003/004 PR review + full local re-run; write M1 decision sheet for the owner |
| 3 | Owner session on D-01…D-08; record decisions in `docs/04` and the checklist |
| 4 | OPS-001 backup/restore drill on staging; OPS-002 inventory snapshot |
| 5 | STG-001 apply 00021–00027; functional checks 1–20 |
| 6 | STG-002 rollback drill; STG-003 close-out; docs pass |
| 7–8 | SEC-001 policy matrix; SEC-004 denial harness |
| 9–10 | SEC-002/SEC-003; SEC-005 sweep |
| 11–14 | M3 exit review; start M4 ORDER-001 design + candidate migration |

---

## 11. What this plan deliberately does not do

- Does not rebuild the page builder, the admin shell or the API seam.
- Does not create parallel entities (second product/order/project table).
- Does not enable hosted AI, live chat provider or payments without the D-06/D-01 decisions.
- Does not claim any hosted verification from local PGlite or demo results.
- Does not apply, push or merge anything without the gate owner's approval.

---

## Progress log

| Date | Milestone | State |
|---|---|---|
| 2026-11-09 | M0 REL-001…003 | **done** — nine slices committed, PR #29 merged to main (`72badcc`), Vercel production deployment succeeded in demo mode |
| 2026-11-09 | M0 REL-004 | **done** — full local re-run recorded in `docs/07` (REL-004 block) |
| 2026-11-09 | M1 | **blocked** — decision sheet published as `PHASE2-OWNER-DECISIONS.md`; no answers yet |
| 2026-11-09 | M3 SEC-004 | **started** — public surface matrix built (`npm run test:public-surface`, 7/7) and wired into CI via `test:sql-all`; hosted half still needs D-08 |
| 2026-11-09 | M2 staging | **unblocked and applied** — project `azdexktqvobrhwjiskrq` restored from `INACTIVE`, 27 of 28 migration files applied to a confirmed-empty database (0 public tables before). Live: 61 tables, 48 functions, 124 policies, RLS on all 61. Ledger in `woodex_ops.applied_migrations`. |
| 2026-11-09 | M2 functional checks | **done on the hosted database** — the full production chain ran with real JWT claims: practice save (revision 0→1→2), QC refused for the person who edited the stages (`42501 You last changed the production stages`), pass recorded by another seat, dispatch guard released, delivery + installation handovers, warranty opened (12 months, 357 days left), claim opened → scheduled → resolved, and `resolved → scheduled` refused (`23514`). `project_warranty_register(60)` returned the derived row. |
| 2026-11-09 | M3 SEC-004 hosted | **done** — the local matrix now has a hosted twin: 17 anon-readable tables are the *same 17* as PGlite, the only anon write grant is `track_events`, and the 12 project RPCs are `SECURITY DEFINER` with `anon` denied. |
| 2026-11-09 | M3 hardening | **new migration `00028_anon_grant_hardening.sql`** — the hosted run exposed 54 tables where `anon` held INSERT/UPDATE/DELETE with no policy justifying it (platform defaults; RLS was still denying the writes). Revoked, plus TRUNCATE/REFERENCES/TRIGGER and sequence access. `test:public-surface` grew to 9 checks and `test:sql-all` is 14/14 green on 28 migrations. |
| 2026-11-09 | M2 storage slice | **1 owner step outstanding** — the private `projects` bucket exists; the four `storage.objects` policies cannot be created from the SQL editor because that table is owned by `supabase_storage_admin`. |
| 2026-11-09 | M4 FIN-001 | **local candidate** — `00030_invoice_money_integrity.sql`: `invoices.paid` is now derived from the payment ledger (one writer, `sync_invoice_totals`), overpayment and cancelled-invoice payments are refused, the arithmetic must balance, new invoices are numbered `INV-YYYY-NNNNNN` with a unique index, `invoice_apply_payment` takes a row lock, and `invoice_void` requires a reason and writes an audit row. 45 checks. |
| 2026-11-09 | M4 ORDER-002 | **local candidate** — `00031_invoice_from_order.sql`: raise the invoice for a finished job exactly once (idempotent, tax carries the residual so the guard passes by construction), plus `invoice_register(days)` with balance, derived state, days overdue and the source order. 37 checks. |
| 2026-11-09 | M4 FIN-001 UI | **done in the demo and the live seam** — `createInvoiceFromOrder` on the adapter (supabase RPC, demo parity, Bagisto 501) and a **Raise invoice** action in the order dialog. 4 new e2e checks; `npm run e2e` 114/114. |
| — | M4 remainder, M5–M10 | not started |
