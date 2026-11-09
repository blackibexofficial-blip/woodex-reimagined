-- Local candidate: enforce the existing UI's recorded-QC-before-dispatch rule
-- for NEW or CHANGED production payloads only. This is not an independent QC
-- approval: a project editor can still record "passed" themselves. No data is
-- rewritten. Existing unchanged legacy payloads remain editable elsewhere.
-- Review legacy shapes, role matrix and approval requirements on isolated
-- staging before deployment. Rollback: DROP TRIGGER project_dispatch_qc_guard
-- ON public.projects; DROP FUNCTION public.enforce_project_dispatch_qc();

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
  -- Projects without production data remain valid. Removing production data
  -- is not protected by this limited check; a separate audit/retention policy
  -- must be designed before this can be treated as a complete workflow.
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
      -- Null and empty/whitespace strings are blank. Any other JSON value is
      -- conservatively considered dispatch data, including unknown fields.
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
  if dispatch_present and qc_result is distinct from 'passed' then
    raise exception 'Recorded QC must be passed before dispatch details or progress can be saved' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_project_dispatch_qc() from public, anon, authenticated;
drop trigger if exists project_dispatch_qc_guard on public.projects;
create trigger project_dispatch_qc_guard before insert or update of payload on public.projects
for each row execute function public.enforce_project_dispatch_qc();
