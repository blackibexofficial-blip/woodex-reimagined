# Phase 1 — Staging apply checklist: production/QC/order/handover/claim/register candidates 00021–00027

**Status: prepared, not executed.** Nothing in this document has been run against a
hosted database. No `supabase db push`, no SQL editor write and no service-role call
has been made from this workspace.

Scope: `20261108000021_project_dispatch_qc_guard.sql`,
`20261108000022_project_qc_records.sql`,
`20261108000023_project_production_shape_guard.sql`,
`20261108000024_project_order_linkage.sql`,
`20261108000025_project_handover_warranty.sql`,
`20261108000026_project_warranty_claims.sql`,
`20261108000027_project_warranty_register.sql` — all seven are local candidates
verified only in isolated PGlite.

Owner decisions already taken (2026-11-08): a QC pass must be recorded by someone
other than the person who last changed the production stages. Still open before a
production change: audit-trail retention/tamper requirements, what to do with legacy
`passed` values that have no inspection, and whether a dedicated QC role replaces
`page.manage` for both seats.

---

## 1. Authorisation and preconditions

- [ ] Named owner approval for a **staging-only** apply, with a date/time window.
- [ ] Staging project reference recorded here: `________________`.
- [ ] Confirmed this is **not** the production project; production credentials are
  not used at any step.
- [ ] Staff informed that staging production jobs may briefly reject saves.
- [ ] Current `main`/release commit recorded: `________________`.
- [ ] Backup storage location outside the repository recorded: `________________`.
- [ ] Two synthetic staging accounts exist: one editor/production seat and one
  second `page.manage` holder for the QC seat.
- [ ] `page.manage` capability confirmed on both, and the expected capability set for
  an ordinary editor confirmed (they must *not* be able to pass their own work).

## 2. Backup and restore drill (before any DDL)

- [ ] `supabase db dump --project-ref <staging> -f staging-schema-$(date +%F).sql`
- [ ] Data dump: `supabase db dump --project-ref <staging> --data-only -f staging-data-$(date +%F).sql`
  (or `pg_dump` with the connection string; prefer a custom-format archive).
- [ ] Record `sha256sum` of both files and store them with the change record.
- [ ] **Restore the backup into a scratch database and verify it**: row counts of
  `projects`, `orders`, `quotes`, `leads` and `user_roles` match the source, and the
  admin panel loads against the restored copy.
- [ ] Only continue when the restore drill passes. A backup that has never been
  restored is not a backup.

## 3. Preflight inspection (read-only)

Run against staging and save the output with the change record.

```sql
-- 1. Baseline counts
select 'projects' t, count(*) from public.projects
union all select 'orders', count(*) from public.orders
union all select 'quotes', count(*) from public.quotes;

-- 2. What already exists (must be empty on a clean staging)
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'projects'
  and column_name in ('revision', 'production_updated_by');
select to_regclass('public.project_qc_inspections') as inspections,
       to_regclass('public.project_production_events') as events;

-- 3. Triggers already on projects — ordering matters
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid = 'public.projects'::regclass and not tgisinternal;

-- 4. Policies and grants that could interact
select policyname, cmd, roles, qual from pg_policies where tablename = 'projects';
select proname, prosecdef, proacl from pg_proc
where proname in ('project_qc_record', 'project_practice_save');

-- 5. Payload shapes that the guard will now validate when they change
select id,
       jsonb_typeof(payload #> '{practice,production,stages}') as stages_type,
       jsonb_array_length(coalesce(payload #> '{practice,production,stages}', '[]'::jsonb)) as stage_count,
       payload #>> '{practice,production,qc,result}' as qc
from public.projects
where payload #> '{practice,production}' is not null
order by id;
```

- [ ] Any pre-existing `revision`/`production_updated_by` column or QC table means the
  migrations were partially applied before — stop and reconcile instead of re-running.
- [ ] Every project whose `stages` is not an array, whose stage names are not in the
  five canonical keys, or whose percentages are outside 0–100 is listed in the change
  record: those rows stay editable for non-production fields but **cannot receive an
  inspection until they are opened and saved** in the workspace (00023 behaviour).
- [ ] Existing triggers on `projects` are reviewed: `project_revision_bump` must run
  before `project_production_shape_guard` (alphabetical order already ensures this),
  and any hosted trigger that writes `payload` must be checked for compatibility.
- [ ] Service-role consumers of `projects.payload` are listed; they bypass RLS but not
  the triggers.

## 4. Apply order (one file at a time)

Apply with `supabase db push` (or the SQL editor) **one migration at a time**, and
run the matching verification before the next file.

| Step | File | Expected |
|---|---|---|
| 1 | `00021_project_dispatch_qc_guard.sql` | trigger `project_dispatch_qc_guard` created; a save with populated dispatch while QC is pending fails with `23514` |
| 2 | `00022_project_qc_records.sql` | columns + two tables + two RPCs; `production_updated_by` stamps on stage edits; self-pass fails with `42501` |
| 3 | `00023_project_production_shape_guard.sql` | trigger `project_production_shape_guard` created; a malformed stage name fails with `23514` |
| 4 | `00024_project_order_linkage.sql` | `projects.order_id` column, unique index, two link RPCs, `order_project()`; a cancelled order and a second job for the same order are refused |
| 5 | `00025_project_handover_warranty.sql` | two tables, three RPCs, `project_post_dispatch()`; a handover before the QC pass is refused, a warranty without installation is refused |
| 6 | `00026_project_warranty_claims.sql` | claims table + two RPCs; a claim on a job without a live warranty is refused, a resolved claim cannot be reopened |
| 7 | `00027_project_warranty_register.sql` | function only, no schema change; the register lists warranted jobs with derived states and claim counts |

Verification after each step (use synthetic jobs only — never a real customer job):

```sql
-- after 00021
select tgname from pg_trigger where tgrelid = 'public.projects'::regclass;

-- after 00022
select column_name from information_schema.columns
 where table_name = 'projects' and column_name in ('revision','production_updated_by');
select proname, prosecdef from pg_proc
 where proname in ('project_qc_record','project_practice_save');
select relrowsecurity from pg_class where relname in ('project_qc_inspections','project_production_events');
-- grants: authenticated may select, nobody may insert/update/delete directly
select has_table_privilege('authenticated','public.project_qc_inspections','insert') as anon_insert,
       has_table_privilege('authenticated','public.project_qc_inspections','select') as auth_select;

-- after 00023
select tgname from pg_trigger where tgrelid = 'public.projects'::regclass and tgname like '%shape%';

-- after 00024
select column_name from information_schema.columns
 where table_name = 'projects' and column_name = 'order_id';
select indexname from pg_indexes
 where tablename = 'projects' and indexname = 'projects_order_id_key';
select proname, prosecdef from pg_proc
 where proname in ('project_link_order','project_unlink_order','order_project');

-- after 00025
select to_regclass('public.project_handovers') as handovers,
       to_regclass('public.project_warranties') as warranties;
select proname, prosecdef from pg_proc
 where proname in ('project_handover_record','project_warranty_open','project_warranty_cancel','project_post_dispatch');

-- after 00026
select to_regclass('public.project_warranty_claims') as claims;
select proname, prosecdef from pg_proc
 where proname in ('project_warranty_claim_open','project_warranty_claim_update');

-- after 00027
select proname, prosecdef from pg_proc where proname = 'project_warranty_register';
```

- [ ] Each migration applied exactly once; no manual edits to a migration after it ran.
- [ ] Migration history in the staging project lists all three files.

## 5. Functional verification on staging (synthetic data only)

With the two synthetic accounts:

1. [ ] Editor creates a job, sets the five stages, saves → `production_updated_by`
   equals the editor's uid.
2. [ ] Editor attempts `project_qc_record(...,'passed')` → `42501`, no row in
   `project_qc_inspections`, `projects.revision` unchanged, payload QC still pending.
3. [ ] Editor records `failed` with a note → accepted, note stored, dispatch locked.
4. [ ] QC holder records `passed` → accepted; payload QC shows the QC holder's email;
   `production_updated_by` still the editor.
5. [ ] Editor fills dispatch and saves → accepted (pass exists) and `dispatch_changed`
   appears in `project_production_events`.
6. [ ] A direct `update public.projects set payload = ...` that sets `qc.result` to
   `passed` without an inspection → still refused (`23514`).
7. [ ] A save with `stages` missing/unknown/duplicated or `pct` 250 → refused (`23514`).
8. [ ] A legacy job with a partial production block still opens, shows the repair
   notice, blocks an inspection until saved once, then accepts the repaired save.
9. [ ] Editor cannot rewrite `project_qc_inspections` or `project_production_events`
   through PostgREST (they may only select).
10. [ ] Admin panel loads production/QC history; no console errors; no 500s in logs.
11. [ ] Start a job from a `processing` order: it is created inactive, `order_id` holds
    `WDX-<n>`, the payload does **not** contain an order id, and the projects list shows
    the order badge.
12. [ ] A second job for the same order is refused; a cancelled order is refused; a
    direct `update public.projects set order_id=…` is refused (`42501`).
13. [ ] `select * from public.order_project('WDX-<n>')` returns progress/QC; an
    `order.manage`-only user can read it and a `page.manage`-only user cannot read the
    order row itself (RLS), which is expected.
14. [ ] Unlink keeps the job, stages and inspections, and writes `order_unlinked`.
15. [ ] On a job that has passed QC and stored dispatch: record a delivery, then an
    installation (installation before delivery is refused), then open a warranty —
    it must start on the installation date and show `active`; cancel it and confirm
    the row is kept with `cancelled`.
16. [ ] A handover on a job without a QC pass is refused; a future date and an
    impossible year (`1107-…`) are refused; a second delivery is refused.
17. [ ] `select * from public.project_post_dispatch('<job>')` returns the dates and the
    derived state; an `order.manage`-only user cannot read it.
18. [ ] Open a claim on the live warranty; schedule it, then resolve it with a note.
    A resolve without a note, a claim on an expired/cancelled/absent warranty, and a
    reopen of a resolved claim are all refused.
19. [ ] Cancel the warranty and confirm the existing claims are still readable.
20. [ ] Open `/admin/warranty-register` as a `page.manage` user: warranted jobs list
    with derived states, days left, the 60-day flag and open-claim counts; a viewer
    account cannot call the projection. A job with no warranty and no claim is absent.

## 6. Rollback (rehearse before applying, in this order)

```sql
drop function if exists public.project_warranty_register(integer);
drop function if exists public.project_warranty_claim_update(uuid, text, text);
drop function if exists public.project_warranty_claim_open(text, text, text, date);
drop table if exists public.project_warranty_claims;

drop function if exists public.project_post_dispatch(text);
drop function if exists public.project_warranty_cancel(text, text);
drop function if exists public.project_warranty_open(text, integer, text, text);
drop function if exists public.project_handover_record(text, text, date, text, text, text);
drop table if exists public.project_warranties;
drop table if exists public.project_handovers;

drop trigger if exists project_order_link_guard on public.projects;
drop function if exists public.guard_project_order_link();
drop function if exists public.order_project(text);
drop function if exists public.project_unlink_order(text, text);
drop function if exists public.project_link_order(text, text);
drop index if exists public.projects_order_id_key;
alter table public.projects drop column if exists order_id;

drop trigger if exists project_production_shape_guard on public.projects;
drop function if exists public.enforce_project_production_shape();

drop trigger if exists project_qc_audit on public.projects;
drop trigger if exists project_revision_bump on public.projects;
drop function if exists public.project_practice_save(text, jsonb, integer);
drop function if exists public.project_qc_record(text, text, text);
drop function if exists public.log_project_production_change();
drop function if exists public.bump_project_revision();
drop table if exists public.project_production_events;
drop table if exists public.project_qc_inspections;
alter table public.projects drop column if exists production_updated_by;
alter table public.projects drop column if exists revision;
-- then restore 00021 if a narrower gate is wanted:
--   re-run 20261108000021_project_dispatch_qc_guard.sql
```

- [ ] Rollback rehearsed on the **restored scratch copy**, not on staging.
- [ ] Project/order/quote row counts identical before and after the rollback drill.
- [ ] Understand what is lost: inspection history, the production audit trail and the
  stored `revision` values are dropped; project payloads are untouched. Dropping
  `order_id` removes the order links (jobs and orders survive) — export the links first
  if they must be restored. Dropping the handover/warranty tables deletes delivery,
  installation, warranty and claim history — export it before rollback.
- [ ] If only 00023 needs to go, drop that trigger/function alone — the 00021/00022
  behaviour stays.
- [ ] Note: dropping `project_qc_audit` after `bump_project_revision` is fine, but never
  drop the bump trigger while a client is saving with revision checks (40001 storms).

## 7. Failure handling

- **A migration fails mid-file.** Supabase applies each file in a transaction, so the
  file is either wholly applied or not applied; read the error, fix forward with a new
  file, do not hand-edit the failed one. If a partial state is suspected, run section 3
  again and reconcile before retrying.
- **Trigger blocks an unexpected write.** Capture the failing statement, the actor and
  the error code; decide whether the writer is a legacy path (fix the writer) or a
  legitimate shape the guard rejects (new migration), not by disabling the trigger.
- **RPC behaves differently from PGlite.** Most likely `search_path`, function owner or
  a missing `auth.users` grant. Check `prosecdef`, `proowner` and run the function as
  the authenticated role once.
- **Staff react to the two-person rule.** Expected: a job edited today cannot be passed
  by the same person. Do not exempt the rule ad hoc; if the owner wants an exception
  path it must be a reviewed migration with an audit entry.

## 8. Sign-off

- [ ] Backup hashes and restore evidence attached.
- [ ] Preflight output attached.
- [ ] Apply log (file, timestamp, operator) attached.
- [ ] Section 5 screenshots/results attached.
- [ ] Rollback drill result attached.
- [ ] Owner sign-off recorded, with the date, and the decision list from
  `PHASE1-PRODUCTION-QC-WORKSPACE.md` acknowledged.

**Still not covered by this checklist:** production deployment, real concurrency
between two simultaneous editors (revision checks are exercised, not proven under
load), retention/export of the audit trail, and the legacy-pass backfill decision.
