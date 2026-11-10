-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · QC pass is an owner decision (candidate)
-- Isolated local candidate — NOT applied to any hosted or staging database.
--
-- Why: 00022 gave QC to `page.manage`, which is right for *recording* an
-- inspection but wrong for *signing off* a job. The owner decided on 2026-11-09
-- that a pass is an owner decision (D-04: "Owners only"), while a failure stays
-- with the people doing the work — flagging your own defect is not approval.
--
-- Changes exactly one branch of `project_qc_record`:
--   passed  -> requires my_role() = 'owner'
--   failed  -> unchanged, still page.manage
-- Everything else (separation of duties, revision bump, audit row, dispatch
-- gate, payload derivation) is untouched — this file re-creates the function
-- with the original body and one added guard.
--
-- Deliberate limits:
--   * The separation-of-duties rule still applies to owners: an owner who last
--     edited the stages cannot pass their own work either.
--   * The capability layer is unchanged; `page.manage` still governs reading
--     the QC trail and saving the practice workspace.
--
-- Rollback: re-run the function from 20261108000022_project_qc_records.sql.
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- Owner decision D-04 (2026-11-09): only an owner may sign a job off.
  -- Flagging your own work as failed is not an approval, so failures stay open
  -- to anyone who can work the job (page.manage).
  if p_result = 'passed' and public.my_role() is distinct from 'owner' then
    raise exception 'Only an owner may record a QC pass — ask an owner to inspect it.'
      using errcode = '42501';
  end if;
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
