-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Production / QC records, audit trail and revision checks (candidate)
-- Isolated local candidate — NOT applied to any hosted or staging database.
-- Requires owner review of: who may record a QC inspection, whether the same
-- person may inspect their own production, retention of the audit trail, and
-- legacy payloads that already hold a passed QC value without an inspection.
--
-- Adds:
--   * projects.revision      — optimistic-concurrency token for payload writes
--   * project_qc_inspections — append-only, identity-stamped QC records; the
--                              only way to newly set a passed QC result
--   * project_production_events — append-only audit of production payload changes
--   * project_qc_record()     — capability-checked inspection RPC
--   * project_practice_save() — revision-checked practice save; server derives QC
-- Extends the 00021 dispatch gate: a *new* pass must be backed by a recorded
-- inspection, so a direct payload write can no longer self-approve.
--
-- Separation of duties (owner decision, 2026-11-08): the person who last changed
-- the production STAGES cannot record the QC pass themselves (`42501`). Another
-- `page.manage` holder must inspect. Recording a FAILURE is still allowed for the
-- stage editor, because flagging your own work is not self-approval. QC-only and
-- dispatch-only writes do not make someone the last stage editor.
--
-- Known limits (documented, not solved here):
--   * Two `page.manage` holders are now required to pass any job whose stages were
--     edited since the last pass. Single-staff sites either hold a second
--     capability or accept that dispatch waits — an operational cost, not a bug.
--   * Dispatching does not update orders, stock, installation or warranty.
--   * Historical unchanged `passed` values (no inspection) remain readable and
--     editable elsewhere; they are never silently rewritten by this migration.
--
-- Rollback (no rows are rewritten by this migration):
--   drop trigger if exists project_qc_audit on public.projects;
--   drop trigger if exists project_revision_bump on public.projects;
--   drop function if exists public.project_practice_save(text, jsonb, integer);
--   drop function if exists public.project_qc_record(text, text, text);
--   drop function if exists public.log_project_production_change();
--   drop function if exists public.bump_project_revision();
--   drop table if exists public.project_production_events;
--   drop table if exists public.project_qc_inspections;
--   alter table public.projects drop column if exists production_updated_by;
--   alter table public.projects drop column if exists revision;
--   -- then re-run 20261108000021 to restore the earlier, narrower gate.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.projects add column if not exists revision integer not null default 0;
alter table public.projects add column if not exists production_updated_by uuid;

-- ── revision token ───────────────────────────────────────────────────────────
-- Every payload write bumps the revision. Clients send the revision they read;
-- a mismatch is rejected instead of silently overwriting a colleague copy.
--
-- `production_updated_by` records the last person who changed the production
-- STAGES (not QC, not dispatch), so separation of duties can be enforced: the
-- person who last moved the stages may not record the QC pass themselves.
create or replace function public.bump_project_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  previous_stages jsonb;
begin
  if tg_op = 'INSERT' then
    new.revision := 0;
  else
    new.revision := coalesce(old.revision, 0) + 1;
    previous_stages := old.payload #> '{practice,production,stages}';
  end if;
  if (new.payload #> '{practice,production,stages}') is distinct from previous_stages then
    new.production_updated_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists project_revision_bump on public.projects;
create trigger project_revision_bump before insert or update of payload on public.projects
for each row execute function public.bump_project_revision();

-- ── QC inspections (append-only) ─────────────────────────────────────────────
create table if not exists public.project_qc_inspections (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  result text not null check (result in ('passed', 'failed')),
  notes text not null default '' check (char_length(notes) <= 2000),
  inspected_by uuid not null,
  inspected_by_email text not null default '',
  -- project revision created by this inspection (set after the payload write)
  revision integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists project_qc_inspections_project_idx
  on public.project_qc_inspections (project_id, created_at desc);

alter table public.project_qc_inspections enable row level security;
drop policy if exists project_qc_inspections_read on public.project_qc_inspections;
create policy project_qc_inspections_read on public.project_qc_inspections for select to authenticated
  using (public.has_cap('page.manage') or public.has_cap('crm.manage') or public.has_cap('finance.manage'));
-- No client insert/update/delete policy: records are only written through the
-- capability-checked SECURITY DEFINER RPC below. The function owner (postgres /
-- Supabase migration role) is not subject to RLS, and this note documents why
-- an empty insert policy is intentional rather than an oversight.
revoke all on public.project_qc_inspections from anon, authenticated;
grant select on public.project_qc_inspections to authenticated;

-- ── production audit trail (append-only) ─────────────────────────────────────
create table if not exists public.project_production_events (
  id bigserial primary key,
  project_id text not null references public.projects(id) on delete cascade,
  actor uuid,
  action text not null,
  revision integer not null default 0,
  qc_result text,
  dispatch_vehicle text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists project_production_events_project_idx
  on public.project_production_events (project_id, created_at desc);

alter table public.project_production_events enable row level security;
drop policy if exists project_production_events_read on public.project_production_events;
create policy project_production_events_read on public.project_production_events for select to authenticated
  using (public.has_cap('page.manage') or public.has_cap('crm.manage') or public.has_cap('finance.manage'));
revoke all on public.project_production_events from anon, authenticated;
grant select on public.project_production_events to authenticated;

create or replace function public.log_project_production_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  old_prod jsonb;
  new_prod jsonb;
  change_action text;
begin
  if tg_op = 'UPDATE' then old_prod := old.payload #> '{practice,production}'; end if;
  new_prod := new.payload #> '{practice,production}';
  if tg_op = 'UPDATE' and new_prod is not distinct from old_prod then return new; end if;
  if new_prod is null or new_prod = 'null'::jsonb then
    change_action := 'production_removed';
  elsif tg_op = 'INSERT' then
    change_action := 'production_created';
  elsif (new_prod #>> '{qc,result}') is distinct from (old_prod #>> '{qc,result}') then
    change_action := 'qc_changed';
  elsif (new_prod -> 'dispatch') is distinct from (old_prod -> 'dispatch') then
    change_action := 'dispatch_changed';
  else
    change_action := 'production_updated';
  end if;
  insert into public.project_production_events
    (project_id, actor, action, revision, qc_result, dispatch_vehicle, detail)
  values (
    new.id, auth.uid(), change_action, coalesce(new.revision, 0),
    new_prod #>> '{qc,result}', new_prod #>> '{dispatch,vehicle}',
    jsonb_build_object(
      'previousQc', coalesce(old_prod #>> '{qc,result}', ''),
      'newQc', coalesce(new_prod #>> '{qc,result}', '')
    )
  );
  return new;
end;
$$;

drop trigger if exists project_qc_audit on public.projects;
create trigger project_qc_audit after insert or update of payload on public.projects
for each row execute function public.log_project_production_change();

-- ── QC gate: a new pass must come from a recorded inspection ─────────────────
create or replace function public.enforce_project_dispatch_qc()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  production jsonb := new.payload #> '{practice,production}';
  old_production jsonb;
  stages jsonb;
  dispatch jsonb;
  qc_result text;
  latest_inspection text;
  stage jsonb;
  entry record;
  dispatch_present boolean := false;
begin
  if tg_op = 'UPDATE' then
    old_production := old.payload #> '{practice,production}';
    if production is not distinct from old_production then
      return new;
    end if;
  end if;
  if production is null or production = 'null'::jsonb then return new; end if;
  if jsonb_typeof(production) <> 'object' then
    raise exception 'Project production must be an object' using errcode = '23514';
  end if;
  dispatch := production -> 'dispatch';
  if dispatch is not null and dispatch <> 'null'::jsonb then
    if jsonb_typeof(dispatch) <> 'object' then
      raise exception 'Project dispatch must be an object' using errcode = '23514';
    end if;
    for entry in select value from jsonb_each(dispatch) loop
      if entry.value <> 'null'::jsonb and
         (jsonb_typeof(entry.value) <> 'string' or btrim(entry.value #>> '{}') <> '') then
        dispatch_present := true;
      end if;
    end loop;
  end if;
  stages := production -> 'stages';
  if stages is not null and stages <> 'null'::jsonb then
    if jsonb_typeof(stages) <> 'array' then
      raise exception 'Project production stages must be an array' using errcode = '23514';
    end if;
    for stage in select value from jsonb_array_elements(stages) loop
      if jsonb_typeof(stage) <> 'object' then
        raise exception 'Project production stage must be an object' using errcode = '23514';
      end if;
      if stage ->> 'stage' = 'dispatch' and stage ? 'pct' and stage -> 'pct' <> 'null'::jsonb then
        if jsonb_typeof(stage -> 'pct') <> 'number' then
          raise exception 'Dispatch progress must be numeric' using errcode = '23514';
        end if;
        if (stage ->> 'pct')::numeric > 0 then dispatch_present := true; end if;
      end if;
    end loop;
  end if;
  qc_result := production #>> '{qc,result}';
  -- A pass may be recorded once, by inspection. Historical unchanged passes
  -- (old value already 'passed') remain editable so legacy payloads do not
  -- break; this function never invents or rewrites a pass by itself.
  if qc_result = 'passed' then
    select i.result into latest_inspection
      from public.project_qc_inspections i
      where i.project_id = new.id
      order by i.created_at desc, i.id desc
      limit 1;
    if coalesce(latest_inspection, '') <> 'passed'
       and coalesce(old_production #>> '{qc,result}', '') <> 'passed' then
      raise exception 'QC can only be marked passed by recording an inspection' using errcode = '23514';
    end if;
  end if;
  if dispatch_present and qc_result is distinct from 'passed' then
    raise exception 'Recorded QC must be passed before dispatch details or progress can be saved' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_project_dispatch_qc() from public, anon, authenticated;

-- ── RPC: record a QC inspection ──────────────────────────────────────────────
create or replace function public.project_qc_record(
  p_project_id text,
  p_result text,
  p_notes text default ''
)
returns table (
  id uuid,
  project_id text,
  result text,
  notes text,
  inspected_by_email text,
  revision integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_notes text := btrim(coalesce(p_notes, ''));
  v_revision integer;
  v_production jsonb;
  v_last_stage_editor uuid;
  v_id uuid;
  v_new_revision integer;
begin
  perform public.require_cap('page.manage');
  if p_result is null or p_result not in ('passed', 'failed') then
    raise exception 'QC result must be passed or failed' using errcode = '22023';
  end if;
  if char_length(v_notes) > 2000 then
    raise exception 'QC notes are limited to 2000 characters' using errcode = '22001';
  end if;
  select p.revision, p.payload #> '{practice,production}', p.production_updated_by
    into v_revision, v_production, v_last_stage_editor
    from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if v_production is null or v_production = 'null'::jsonb or jsonb_typeof(v_production) <> 'object' then
    raise exception 'Record the production stages before a QC inspection' using errcode = '23514';
  end if;
  -- Separation of duties: a pass is an independent check, so the person who
  -- last changed the stages cannot also sign it off. Recording a FAILURE is
  -- still allowed for that person — flagging your own work is not self-approval.
  if p_result = 'passed' and v_last_stage_editor is not null and v_last_stage_editor = auth.uid() then
    raise exception 'You last changed the production stages — another person must record the pass.'
      using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  insert into public.project_qc_inspections
    (project_id, result, notes, inspected_by, inspected_by_email, revision)
  values
    (p_project_id, p_result, v_notes, auth.uid(), coalesce(v_email, ''), v_revision)
  returning project_qc_inspections.id into v_id;
  update public.projects
    set payload = jsonb_set(payload, '{practice,production,qc}', jsonb_build_object(
          'result', p_result,
          'defectNote', case when p_result = 'failed' then v_notes else '' end,
          'inspectedBy', coalesce(v_email, ''),
          'inspectedAt', to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD')
        ), true),
        updated_at = now()
    where projects.id = p_project_id
    returning projects.revision into v_new_revision;
  update public.project_qc_inspections set revision = v_new_revision where project_qc_inspections.id = v_id;
  return query
    select i.id, i.project_id, i.result, i.notes, i.inspected_by_email, i.revision, i.created_at
    from public.project_qc_inspections i where i.id = v_id;
end;
$$;
revoke all on function public.project_qc_record(text, text, text) from public, anon;
grant execute on function public.project_qc_record(text, text, text) to authenticated;

-- ── RPC: save the practice workspace with revision + derived QC ──────────────
create or replace function public.project_practice_save(
  p_project_id text,
  p_practice jsonb,
  p_expected_revision integer default null
)
returns table (practice jsonb, revision integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision integer;
  v_practice jsonb;
  v_latest jsonb;
  v_old_qc jsonb;
  v_new_revision integer;
begin
  perform public.require_cap('page.manage');
  if p_practice is null or jsonb_typeof(p_practice) <> 'object' then
    raise exception 'Practice must be an object' using errcode = '23514';
  end if;
  select p.revision, p.payload #> '{practice,production,qc}'
    into v_revision, v_old_qc
    from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if p_expected_revision is not null and v_revision <> p_expected_revision then
    raise exception 'This job changed elsewhere (revision %, your copy %). Reload before saving.',
      v_revision, p_expected_revision using errcode = '40001';
  end if;
  select jsonb_build_object(
      'result', i.result,
      'defectNote', i.notes,
      'inspectedBy', i.inspected_by_email,
      'inspectedAt', to_char((i.created_at at time zone 'utc')::date, 'YYYY-MM-DD'))
    into v_latest
    from public.project_qc_inspections i
    where i.project_id = p_project_id
    order by i.created_at desc, i.id desc
    limit 1;
  -- Legacy tolerance: an existing passed value with no inspection is kept
  -- rather than silently cleared. New passes still require an inspection.
  if v_latest is null and coalesce(v_old_qc ->> 'result', '') = 'passed' then
    v_latest := v_old_qc;
  end if;
  v_practice := p_practice;
  if jsonb_typeof(v_practice -> 'production') = 'object' then
    v_practice := jsonb_set(v_practice, '{production,qc}',
      coalesce(v_latest, '{"result":"pending","defectNote":"","inspectedBy":"","inspectedAt":""}'::jsonb), true);
  end if;
  update public.projects
    set payload = jsonb_set(payload, '{practice}', v_practice, true), updated_at = now()
    where id = p_project_id
    returning projects.revision into v_new_revision;
  return query
    select (select p.payload -> 'practice' from public.projects p where p.id = p_project_id), v_new_revision;
end;
$$;
revoke all on function public.project_practice_save(text, jsonb, integer) from public, anon;
grant execute on function public.project_practice_save(text, jsonb, integer) to authenticated;
