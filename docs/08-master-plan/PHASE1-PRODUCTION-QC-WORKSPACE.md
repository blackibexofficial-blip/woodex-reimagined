# Phase 1 — Production / QC workspace safety and dispatch boundary

**Status: local, in progress, 2026-11-08.** All work is in the local working tree on
`arena/6bd5a1db-woodex-reimagined`. No hosted Supabase project, staging schema,
provider, deployment or real customer/production record was read or modified.
`00021`, `00022` and `00023` are review candidates only; they have **not** been
applied anywhere except an isolated local PGlite instance.

## Where production actually lives

There is no separate production page or production table. The production and
manufacturing workflow is the **Production** tab of the existing practice
workspace, opened from `/admin/projects`:

- `src/admin/pages/Projects.tsx` renders `ProjectPracticeDialog` for the selected project.
- `src/admin/pages/ProjectPracticeDialog.tsx` keeps stages (`material_prep`,
  `fabrication`, `finishing`, `qc`, `dispatch`), QC result/notes and dispatch
  fields inside `project.practice.production`.
- `src/api/types.ts` defines `ProjectProduction`; `src/api/supabase.ts` writes the
  whole `projects.payload` JSON through `updateProject` (`mergePayload`), and
  `src/api/demo/db.ts` mirrors it in browser-local demo storage.

Because production shares one JSON payload, a project editor can write any
production/QC value in one request. The UI gate is therefore a usability control,
not an approval record.

## Reproduced local defects (synthetic)

Using a fresh demo Vite server (`4178`) and a monkey-patched adapter that delays
`updateProject`, `e2e/phase1-production-workspace.mjs` reproduced, before repair:

| # | Defect | Evidence before repair |
|---|---|---|
| 1 | A save that started before a later edit cleared the "unsaved" marker on return, so the newer production note looked saved. | "older save leaves newer production edits marked unsaved" failed; stored payload held only the older note. |
| 2 | Closing the dialog with unsaved production edits discarded them without any confirmation. | Dialog closed with the changed note lost; no `beforeunload` warning was registered. |
| 3 | The workspace could be closed (and a second save started) while an upload or save was still in flight. | Found from the same code path: only the save button checked `saving`; the close handler and upload had no shared guard. Post-repair assertion holds. |
| 4 | The QC gate text implied server enforcement. | The dialog said the gate was enforced; an isolated PGlite direct write of a vehicle with `qc.result` pending was accepted. |

Separately, isolated PGlite confirmed that an authenticated editor can bypass the
UI QC rule through a plain `update` of `projects.payload`.

## Local changes

`src/admin/pages/ProjectPracticeDialog.tsx`

- `editRevision` counter increments on every edit; a save captures it before the
  request and only clears "unsaved" (and toasts success) when no newer edit
  arrived. Otherwise it warns that the older snapshot was stored and newer
  changes still need saving, while `onSaved` still refreshes row metadata.
- `saveInFlight` / `uploadInFlight` refs serialize save and upload: no overlapping
  save, no upload during save, no close during either, and the Save button is
  disabled while uploading.
- `requestClose()` uses `window.confirm` for unsaved edits and blocks closing
  during an in-flight operation; the dialog's own `onOpenChange` and the footer
  Close button both route through it. Closing without changes is unchanged.
- A `beforeunload` listener is registered while the workspace is dirty, saving or
  uploading.
- Copy no longer calls the UI gate authoritative: it is labelled a UI check, and
  states that a recorded pass is not independent QC approval and that direct
  requests need server protections and owner sign-off.

`supabase/migrations/20261108000021_project_dispatch_qc_guard.sql` (candidate)

- `before insert or update of payload` trigger on `public.projects`.
- Applies only when the incoming `practice.production` differs from the stored one,
  so historical legacy payloads do not block unrelated edits.
- Rejects dispatch data while `practice.production.qc.result` is not `passed`.
  "Dispatch data" = any non-blank dispatch field (including unknown future keys) or
  any dispatch stage with `pct > 0`; duplicate stage entries are all inspected.
- Rejects malformed production shapes (non-object production/dispatch, non-array
  stages, non-numeric `pct`) instead of silently skipping them.
- Function is `SECURITY INVOKER` by default with `search_path = pg_catalog` and
  execute revoked from `public`/`anon`/`authenticated`.
- Reversible: `drop trigger project_dispatch_qc_guard on public.projects; drop function public.enforce_project_dispatch_qc();`
  No rows are rewritten.

## Local test evidence (synthetic, not hosted)

- `npm run test:production-workspace` — **11/11** against a fresh demo Vite server:
  pending QC keeps dispatch inputs disabled, close is blocked during a pending save,
  an overtaken save leaves newer edits unsaved, stored data matches the sent
  snapshot, `beforeunload` is registered, cancelling close keeps the newer note,
  the later save persists, marking QC passed unlocks dispatch, failing QC blocks the
  save with the stored record untouched, and a passed record persists the vehicle.
- `npm run test:production-qc-boundary` — **21/21** isolated PGlite: viewer cannot
  write projects, editor may edit non-production fields, direct dispatch with
  pending/failed/missing QC is rejected, existing unchanged legacy rows still allow
  unrelated edits, blank/null/whitespace dispatch is allowed, positive progress and
  duplicate stages are rejected, malformed shapes are rejected, passed QC allows
  dispatch, a failed-QC transition with existing dispatch data is rejected atomically,
  projects without production data still insert, the trigger function cannot be
  executed directly by `anon`, and rollback/re-apply leaves records intact.
- Regression reruns: `test:p0-safety` 32/32, `test:phase1-workflows` 28/28,
  `test:cms-snapshot-boundary` 21/21, typecheck, lint (0 errors/35 warnings),
  Bun build, and full demo E2E **110/110** (smoke now asserts the production
  workspace unload warning).

## Second slice — QC records, audit trail and revision checks (candidate 00022)

The first slice made the interface honest but left the underlying issue: `qc.result`
was still a hand-typed field inside the shared project payload. `00022` moves the
decision to a record:

- **`project_qc_inspections`** — append-only rows with `result`, `notes`,
  `inspected_by` (`auth.uid()`), `inspected_by_email` (read from `auth.users`,
  never from the client), the project revision the record produced, and a UTC
  timestamp. Application roles can `select` (with `page.manage`, `crm.manage` or
  `finance.manage`) and cannot insert/update/delete; writes happen only through
  `project_qc_record()`.
- **`project_qc_record(p_project_id, p_result, p_notes)`** — `SECURITY DEFINER`,
  `require_cap('page.manage')` (the same capability that already edits projects),
  validates result/notes, locks the project row, requires an existing production
  block, inserts the inspection, then writes the QC block into the payload
  (`result`, `defectNote`, `inspectedBy`, `inspectedAt`) and stamps the record with
  the resulting revision. If the payload write is refused (for example a failed
  inspection while dispatch details are stored), the whole transaction rolls back
  and no inspection row survives.
- **`project_practice_save(p_project_id, p_practice, p_expected_revision)`** —
  locks the row, rejects a stale `revision` with `40001`, and **derives** the QC
  block from the latest inspection, ignoring client-supplied QC values. Legacy
  rows that already hold `passed` without an inspection keep that value instead of
  being silently cleared; they can never be used to create a *new* pass.
- **`project_production_events`** — append-only audit written by a trigger:
  actor, action (`production_created|production_updated|qc_changed|
  dispatch_changed|production_removed`), revision, resulting QC and vehicle, and
  the previous/next QC value. Read-only for application roles.
- **`projects.revision` + `production_updated_by`** — every payload write bumps
  the revision; the workspace sends the revision it read, so a colleague's save is
  no longer silently overwritten.
- The extended `enforce_project_dispatch_qc()` keeps the dispatch rule and adds:
  a **new** `passed` value requires a recorded inspection. A direct payload write
  can therefore no longer self-approve.

Client wiring: `AdminApi.saveProjectPractice`, `listProjectQcInspections`,
`recordProjectQcInspection` and `listProjectProductionEvents` are implemented in
the Supabase adapter (RPC + tables), mirrored in the demo store, and rejected
explicitly by the Bagisto adapter. The Production tab now shows the recorded QC
state, an inspection form, the last three inspections and a revision-conflict
banner with "Reload latest". A failed inspection relocks the dispatch block, and a
"Clear dispatch details" action resolves the otherwise deadlocked draft.

### Verified locally (still synthetic)

- `rehearsal/production-qc-records.mjs` — **50/50** in isolated PGlite: anonymous,
  viewer and sales denial; direct pass rejected; stale revision rejected without
  overwriting; inspection identity from auth; client QC fields ignored; dispatch
  saves after a pass; failed inspection refused atomically while dispatch data
  exists; audit rows created and not editable/deletable by an editor; legacy
  tolerance; malformed input; clean rollback.
- `e2e/phase1-production-workspace.mjs` — **25/25** in the demo browser: the whole
  record/save/conflict flow, including the delayed-save and close protections, the
  self-approval warning/disabled pass button and the second-seat pass.
- Reruns: P0 32/32, quote workflows 28/28, procurement 38/38, settings 36/36, CMS
  boundary 21/21, typecheck, lint (0 errors/35 warnings), Bun build, demo E2E
  110/110.

### Policy decisions

**Decided by the owner (2026-11-08):** a QC pass must come from someone other than
the person who last changed the production stages. Implemented as *inspector ≠ last
stage editor*: candidate 00022 stamps `production_updated_by` whenever the stages
change and `project_qc_record` refuses a pass from that actor (`42501`). A failure
from that actor is still allowed. The demo store mirrors the rule and ships a second
login seat (`VITE_ADMIN_QC_EMAIL`, defaults to `qc@woodex.test`) so the flow can be
demonstrated and tested end to end.

Consequences accepted with that decision: both seats still hold `page.manage` (there
is no dedicated QC role), and at a single-staff site a job whose stages were just
edited waits for a second capability holder before it can pass and dispatch.

### Decisions still required (do not deploy without them)

Apply/rollback steps for the three candidates are written up in
`PHASE1-STAGING-APPLY-CHECKLIST.md` (prepared, not executed: no hosted writes).
2. **Retention and tamper evidence.** Rows are append-only for application roles
   but a database owner or service role can still alter them. Off-box retention,
   hashing or export cadence is undecided.
3. **Legacy passes.** Existing `passed` values without an inspection are preserved;
   the owner must decide whether to backfill inspections, re-inspect, or accept
   them as historical.
4. **Dispatch semantics.** Dispatch still does not update orders, stock,
   installation or warranty records.
5. **Deployment.** The migrations, RPC grants, `revision` column and trigger order
   with any existing hosted triggers must be verified on isolated staging with a
   verified backup and a rehearsed rollback (see the SQL comment block for the
   exact rollback statements).

## Third slice — partial/legacy payload recovery

Production shares one JSON payload, so a row written by an older client, an import
or a partial API call can lack `stages`, `dispatch` or whole practice arrays. The
previous `clone()` mapped `practice.boq`, `production.stages` and spread
`production.dispatch` unconditionally, so such a job crashed the Production tab
with `TypeError: Cannot read properties of null (reading 'map')` — the user could
not even fix or save it.

`src/lib/projectPractice.ts` now normalises the payload structurally:

- `stages` must be an array; unknown stage keys, duplicates and non-canonical
  entries are dropped, missing canonical stages are added at 0, percentages are
  clamped to 0–100, and notes are coerced to text.
- `qc.result` must be one of `pending|passed|failed`, otherwise `pending`; the
  other QC fields become text.
- `dispatch` becomes the five known string fields; missing keys become blank.
- `boq`, `milestones` and `files` fall back to arrays and each row is sanitised.

The dialog shows a repair notice on the Production tab when anything had to be
filled, and saving writes the complete record. The demo adapter writes normalised
data but returns the stored shape from `listProjects`, so the workspace — like
the Supabase path — is the place that reports repairs.

Verified locally: `e2e/phase1-production-legacy-payload.mjs` **15/15** (partial
payload opens with all five stages, percentage clamped to 100, notice shown,
dispatch inputs present, edit survives save, stored record complete, revision
advances, valid payload shows no notice, no page errors). Re-runs: workspace
20/20, typecheck, lint (0 errors/35 warnings), Bun build, demo E2E 110/110.

Limitations: repair is informational, not a data-quality gate; unknown stage keys
and extra production fields are dropped on save; there is no server-side schema
validation of these payload fields, so an API client can still store a partial
shape (which the UI will then repair on the next open). Any row that had to be
repaired should be reviewed against the audit trail before it is trusted.

## Fourth slice — server-side structural guard (candidate 00023)

The UI repair from the previous slice stopped the crash but nothing stopped a new
malformed payload from being written. `00023` adds a `BEFORE INSERT OR UPDATE OF
payload` trigger that validates structure only:

- practice must be an object; `boq`, `milestones` and `files` must be arrays when a
  write changes them (JSON `null` is treated as absent);
- production must be an object; `stages` must be an array of objects whose `stage`
  is one of the five canonical keys, with no duplicates, numeric `pct` between
  0–100, and text `id`/`note` when present;
- `qc` must be an object with `result` in `pending|passed|failed` and text
  `defectNote`/`inspectedBy`/`inspectedAt`;
- `dispatch` must be an object; the five known fields must be text when present;
  unknown keys are tolerated for forward compatibility, but only as plain values,
  so nested objects cannot be smuggled into the dispatch block.

Deliberate tolerance: a row whose production block is unchanged is not validated,
so historical partial rows stay editable for unrelated fields and can be repaired
by the workspace save (which writes a complete record). After a repair the job can
accept inspections again.

Verified locally: `rehearsal/production-shape-guard.mjs` **37/37** in isolated
PGlite — malformed stages, percentages, notes, QC and dispatch are rejected; JSON
null collections and complete blocks are accepted; a legacy malformed row still
allows a title edit, blocks malformed production edits and inspections until
repaired, and accepts the repair save; rollback restores the prior behaviour
without touching data. Reruns: QC boundary 21/21, QC records 50/50, P0 32/32,
quote workflows 28/28, procurement 38/38, settings 36/36, CMS 21/21, typecheck,
lint (0 errors/35 warnings), Bun build, demo E2E 110/110.

Limits: it is structure, not truth — a valid-looking percentage can still be
wrong, unknown dispatch keys allow arbitrary flat text, the guard is unapplied,
and existing malformed rows are only repaired when someone opens and saves them.
Dependency: because the guard validates the whole production block when it
changes, an inspection cannot be recorded on a malformed legacy row until that row
is repaired — an intentional but operationally visible coupling that should be
explained to staff if these migrations are adopted.

## Fifth slice — separation of duties (owner decision, 2026-11-08)

Policy: the person who last changed the production stages cannot record the QC pass.

- **Server (candidate 00022).** `bump_project_revision` stamps
  `projects.production_updated_by` only when `{practice,production,stages}` actually
  changes, so QC-only and dispatch-only writes do not qualify. `project_qc_record`
  refuses a `passed` result from that actor with `42501` before writing anything: no
  inspection row, no revision bump, QC stays pending. A `failed` result from the same
  actor is accepted — flagging your own work is not self-approval.
- **Demo parity.** The demo adapter stamps the same field and refuses the same pass
  with the same message. A second demo login (`VITE_ADMIN_QC_EMAIL`, default
  `qc@woodex.test`, password defaults to `VITE_ADMIN_PASSWORD`) makes the two-person
  flow demonstrable; the workspace shows a self-approval warning and disables the
  pass button when you are the stage editor, and the login screen prints both seats
  only when `VITE_ADMIN_DEMO_HINT=1`.
- **Evidence.** QC records/audit suite **60/60** (adds: stage edit stamps the editor;
  self-pass refused with nothing stored and QC still pending; self-failure allowed;
  a second holder passes; a pass does not rewrite the stamp; roles swap cleanly).
  Demo workspace suite **25/25** (adds: warning visible, pass button disabled,
  demo refuses a self-pass, second seat passes and is stamped as inspector).
  Reruns: QC boundary 21/21, shape guard 37/37, P0 32/32, quote workflows 28/28,
  procurement 38/38, settings 36/36, CMS 21/21, legacy payload 15/15, typecheck,
  lint (0 errors/35 warnings), Bun build, demo E2E 110/110.
- **Limits.** Both seats use `page.manage`; there is no dedicated QC role. A
  single-staff site cannot pass a job it just edited, which delays dispatch by
  design. Nothing is deployed; Supabase behaviour is unverified.

## Sixth slice — order → production job linkage (candidate 00024)

Separate write-up: `PHASE1-ORDER-TO-PROJECT-LINKAGE.md`. In short: `projects.order_id`
with a partial unique index, capability-checked link/unlink RPCs that write
`project_production_events` rows, an `order_project()` projection for the orders page,
and a guard trigger so a patch cannot re-point a link. The UI starts an inactive job
from a processing order and shows progress/QC in both directions. Dispatch does not
change the order status — that remains an owner decision.

Evidence: `rehearsal/production-order-linkage.mjs` **32/32** and
`e2e/phase1-order-project-linkage.mjs` **16/16**; the other production suites and the
demo E2E were re-run afterwards (25/25, 15/15, 60/60, 37/37, 21/21, 110/110).

## Seventh slice — delivery, installation and warranty (candidate 00025)

Separate write-up is not needed; the rules are in the migration header. Sequence is
enforced server-side: **QC pass → dispatch details → delivery → installation →
warranty**. One delivery and one installation per job, no future and no pre-2000
dates, one active warranty (1–120 months) running from the installation date, and a
cancel that keeps the row. Warranty state is always derived
(`none|active|expired|cancelled`), never typed, and every action writes a
`project_production_events` row. The workspace gains a **Handover** tab with the two
records, the warranty form and an audited cancel.

Evidence: `rehearsal/production-handover-warranty.mjs` **37/37** and
`e2e/phase1-handover-warranty.mjs` **17/17**; all earlier production suites re-ran
unchanged.

Limits: no proof photos or customer signature capture, no scheduling, no claim
workflow, no customer-facing warranty document, and a handover date is bounded
(2000+) rather than validated against the real job.

## Eighth slice — warranty claims (candidate 00026)

A warranty you can claim against. `project_warranty_claims` stores the summary
(≤200), details (≤2000), status (`open|scheduled|resolved|rejected`), the claim date
and the resolution. Opening is only allowed against a **live** warranty — cancelled
warranties, expired warranties, claims dated before the start and future dates are
all refused — and transitions are explicit: `open → scheduled|resolved|rejected`,
`scheduled → resolved|rejected`, terminal afterwards, with a resolution note required
to resolve or reject (≥ 3 characters). Every open/transition writes a
`project_production_events` row, and cancelling the warranty does not rewrite
existing claims.

The workspace **Handover** tab gains a claims panel: open a claim while the warranty
is active, then schedule/resolve/reject inline with a resolution note.

Evidence: `rehearsal/production-warranty-claims.mjs` **30/30** and
`e2e/phase1-warranty-claims.mjs` **16/16**; all earlier production suites re-ran
unchanged.

Limits: a claim does not decide cost or replacement, does not move inventory, is not
linked to an order/invoice, and there is no customer-facing tracking.

## Ninth slice — warranty register (candidate 00027)

The claim and warranty data becomes workable. `project_warranty_register(days_ahead)`
is a read-only projection: one row per job with a warranty or a claim, carrying the
derived state (`none|active|expired|cancelled`), days remaining (negative when
expired), an `expiring_soon` flag inside a 0–365 day window, open/total claim counts,
the handover dates and the dispatch vehicle. Nothing is stored — the register cannot
drift from the records.

A new admin page `/admin/warranty-register` shows summary counters (active, expiring
in 60 days, open claims), filters by state or open claims, and links back to the
workspace. Ordering puts the soonest expiry first so the top of the list is the work.

Evidence: `rehearsal/production-warranty-register.mjs` **16/16** and
`e2e/phase1-warranty-register.mjs` **14/14**; all earlier production suites re-ran
unchanged.

Limits: no reminders or notifications, no SLA targets, no assignment or export, and
a job without a warranty or a claim is not listed.

## Known limitations — do not overstate

1. **Separation is enforced, independence is still thin.** The last stage editor
   cannot record the pass (`42501`), but both seats hold `page.manage`, so anyone
   with that capability can inspect anything — it is a two-person rule, not a
   dedicated QC role. At a single-staff site the same rule blocks dispatch until a
   second capability holder signs in. Unapplied and unverified in Supabase.
2. **Audit trail is not tamper-proof.** Application roles cannot rewrite it; the
   database owner/service role still can. No retention or export exists.
3. **Not deployed or staged.** Hosted policy state, existing permissive policies,
   legacy payload shapes, trigger ordering and service-role consumers are unknown.
4. **Structure is validated, truth is not.** Candidate 00023 rejects malformed
   new shapes but accepts any stage percentage or note, and unknown dispatch keys
   as plain text. Existing malformed rows are repaired only when opened and saved,
   and cannot receive an inspection until then.
5. **Concurrency is bounded.** The practice save path checks `projects.revision`,
   but other project field writes and the demo store do not participate, and SPA
   router navigation is still not blocked.
6. **Uploads are separate.** Demo uploads are simulated; hosted storage depends on
   the private bucket from migration 0014 and its policies, which are unverified.
7. **No cost/inventory/order coupling.** Dispatch does not update order status or
   stock. Order→job linkage is implemented locally (candidate 00024), as are the
   delivery/installation handover, a per-job warranty (candidate 00025) and claims
   against a live warranty (candidate 00026) — but there are no proof files, no
   claim cost/inventory handling, no order-status automation, and nothing is
   verified on a hosted database.

## Required before any hosted change

The inspection policy is now decided and implemented locally (inspector ≠ last stage
editor); what remains is retention/tamper requirements for the audit trail, what
happens to legacy passes, a dedicated QC role if the owner wants one, and the
operational staffing consequence above. Then verify on isolated staging using
`docs/08-master-plan/PHASE1-STAGING-APPLY-CHECKLIST.md`:
real RLS and function grants, trigger ordering with any hosted triggers, legacy
payloads, service-role consumers, a verified backup, a rehearsed rollback and
two-client concurrency. Do not imply the local candidates are a complete or
approved QC control.
