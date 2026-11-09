-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Production payload shape guard (candidate)
-- Isolated local candidate — NOT applied to any hosted or staging database.
--
-- Why: production rides the project JSON payload, so an older client, import or
-- partial API write can store a shape the workspace cannot read. The UI now
-- repairs such rows, but nothing stopped a new malformed write from arriving.
-- This guard rejects NEW or CHANGED malformed production/practice structures so
-- a save fails instead of quietly corrupting the job.
--
-- Deliberate tolerance: a row whose production block is unchanged is not
-- validated, so historical partial rows stay editable elsewhere and can be
-- repaired by the workspace (whose save writes a complete record). Nothing is
-- rewritten by this migration.
--
-- Not a business rule: it checks structure only. Stage names must be one of the
-- five canonical keys, percentages must be numbers 0-100, QC results must be
-- pending/passed/failed, and the practice collections must be arrays. It does
-- not decide who may make the change (00021/00022) or whether progress is true.
--
-- Rollback:
--   drop trigger if exists project_production_shape_guard on public.projects;
--   drop function if exists public.enforce_project_production_shape();
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.enforce_project_production_shape()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  practice jsonb := new.payload -> 'practice';
  previous_practice jsonb;
  production jsonb;
  previous_production jsonb;
  collection text;
  stage jsonb;
  seen_stages text[] := array[]::text[];
  qc jsonb;
  dispatch jsonb;
  entry record;
  dispatch_key text;
  known_dispatch text[] := array['date', 'vehicle', 'driver', 'driverPhone', 'challanRef'];
begin
  if practice is not null and practice <> 'null'::jsonb and jsonb_typeof(practice) <> 'object' then
    raise exception 'Project practice must be an object' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then previous_practice := old.payload -> 'practice'; end if;
  -- Collections are validated only when this write changes them, so historical
  -- rows with odd shapes stay editable until the workspace repairs them.
  foreach collection in array array['boq', 'milestones', 'files'] loop
    if practice ? collection
       and (practice -> collection) is distinct from (previous_practice -> collection)
       and jsonb_typeof(practice -> collection) not in ('array', 'null') then
      raise exception 'Project practice field % must be an array', collection using errcode = '23514';
    end if;
  end loop;

  production := practice -> 'production';
  if production is null or production = 'null'::jsonb then return new; end if;
  if tg_op = 'UPDATE' then
    previous_production := old.payload #> '{practice,production}';
    -- Only validate what this write changes; historical rows stay repairable.
    if production is not distinct from previous_production then return new; end if;
  end if;
  if jsonb_typeof(production) <> 'object' then
    raise exception 'Project production must be an object' using errcode = '23514';
  end if;

  if production ? 'stages' and production -> 'stages' <> 'null'::jsonb then
    if jsonb_typeof(production -> 'stages') <> 'array' then
      raise exception 'Project production stages must be an array' using errcode = '23514';
    end if;
    for stage in select value from jsonb_array_elements(production -> 'stages') loop
      if jsonb_typeof(stage) <> 'object' then
        raise exception 'Each production stage must be an object' using errcode = '23514';
      end if;
      if stage ->> 'stage' is null
         or (stage ->> 'stage') not in ('material_prep', 'fabrication', 'finishing', 'qc', 'dispatch') then
        raise exception 'Unknown production stage %', coalesce(stage ->> 'stage', '(missing)') using errcode = '23514';
      end if;
      if (stage ->> 'stage') = any(seen_stages) then
        raise exception 'Duplicate production stage %', stage ->> 'stage' using errcode = '23514';
      end if;
      seen_stages := seen_stages || (stage ->> 'stage');
      if stage ? 'pct' and stage -> 'pct' <> 'null'::jsonb then
        if jsonb_typeof(stage -> 'pct') <> 'number' then
          raise exception 'Production percentage must be a number' using errcode = '23514';
        end if;
        if (stage ->> 'pct')::numeric < 0 or (stage ->> 'pct')::numeric > 100 then
          raise exception 'Production percentage must be between 0 and 100' using errcode = '23514';
        end if;
      end if;
      if stage ? 'note' and stage -> 'note' <> 'null'::jsonb and jsonb_typeof(stage -> 'note') <> 'string' then
        raise exception 'Production stage note must be text' using errcode = '23514';
      end if;
      if stage ? 'id' and stage -> 'id' <> 'null'::jsonb and jsonb_typeof(stage -> 'id') <> 'string' then
        raise exception 'Production stage id must be text' using errcode = '23514';
      end if;
    end loop;
  end if;

  qc := production -> 'qc';
  if qc is not null and qc <> 'null'::jsonb then
    if jsonb_typeof(qc) <> 'object' then
      raise exception 'Project QC must be an object' using errcode = '23514';
    end if;
    if qc ? 'result' and qc -> 'result' <> 'null'::jsonb then
      if (qc ->> 'result') not in ('pending', 'passed', 'failed') then
        raise exception 'QC result must be pending, passed or failed' using errcode = '23514';
      end if;
    end if;
    foreach dispatch_key in array array['defectNote', 'inspectedBy', 'inspectedAt'] loop
      if qc ? dispatch_key and qc -> dispatch_key <> 'null'::jsonb and jsonb_typeof(qc -> dispatch_key) <> 'string' then
        raise exception 'QC field % must be text', dispatch_key using errcode = '23514';
      end if;
    end loop;
  end if;

  dispatch := production -> 'dispatch';
  if dispatch is not null and dispatch <> 'null'::jsonb then
    if jsonb_typeof(dispatch) <> 'object' then
      raise exception 'Project dispatch must be an object' using errcode = '23514';
    end if;
    for entry in select key, value from jsonb_each(dispatch) loop
      if entry.key = any(known_dispatch) then
        if entry.value <> 'null'::jsonb and jsonb_typeof(entry.value) <> 'string' then
          raise exception 'Dispatch field % must be text', entry.key using errcode = '23514';
        end if;
      elsif jsonb_typeof(entry.value) = 'object' then
        -- Unknown keys are tolerated for forward compatibility, but not as a
        -- place to smuggle nested documents into the dispatch block.
        raise exception 'Unknown dispatch field % must be a plain value', entry.key using errcode = '23514';
      end if;
    end loop;
  end if;

  return new;
end;
$$;
revoke all on function public.enforce_project_production_shape() from public, anon, authenticated;

drop trigger if exists project_production_shape_guard on public.projects;
create trigger project_production_shape_guard before insert or update of payload on public.projects
for each row execute function public.enforce_project_production_shape();
