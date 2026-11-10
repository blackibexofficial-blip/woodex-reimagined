-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · M5 PROD-007 — revision checks on every project field (local candidate)
-- ═══════════════════════════════════════════════════════════════════════════
-- 00022 gave the production workspace an optimistic-concurrency token: every
-- payload write bumps `projects.revision`, and `project_practice_save` refuses a
-- stale token. The rest of the project row was still open: the portfolio form,
-- the publish/archive toggle and the delete button wrote the table directly, so
-- two editors (or one editor and a stale tab) could silently overwrite each
-- other's title, status or payload.
--
-- This migration closes that gap:
--   * `project_update(project, patch, expected_revision)` — the only write path
--     for a project's non-practice fields. It checks the revision the caller
--     read, merges the patch into the payload, validates the status, refuses the
--     keys that own their own RPCs (`practice`, `orderId`), and audits the change
--     as `project_updated`;
--   * `project_delete(project, expected_revision)` — delete behind the same
--     token, so a stale tab cannot delete a job someone just worked on;
--   * a guard trigger that refuses a client-supplied revision, so nobody can
--     freeze or rewind the token and make a stale write look fresh.
--
-- Rollback (run in this order):
--   drop trigger if exists project_revision_guard on public.projects;
--   drop function if exists public.enforce_project_revision();
--   drop function if exists public.project_delete(text, integer);
--   drop function if exists public.project_update(text, jsonb, integer);
--   -- then restore the previous client-write paths (00001/00022/00024).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── the token belongs to the server ─────────────────────────────────────────
-- 00022 already bumps the revision on payload writes (`project_revision_bump`,
-- which runs first: triggers fire in name order). This guard only allows the
-- value that trigger produced, so a caller cannot freeze the token or rewind it
-- to make a stale copy look current.
create or replace function public.enforce_project_revision()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 0;
    return new;
  end if;
  if new.revision is distinct from old.revision
     and new.revision is distinct from coalesce(old.revision, 0) + 1 then
    raise exception 'The project revision is stamped by the server, not set by the client'
      using errcode = '40001';
  end if;
  return new;
end
$$;
revoke all on function public.enforce_project_revision() from public, anon, authenticated;

drop trigger if exists project_revision_guard on public.projects;
create trigger project_revision_guard before insert or update on public.projects
for each row execute function public.enforce_project_revision();

-- ── RPC: update the portfolio fields with a revision check ───────────────────
create or replace function public.project_update(
  p_id text,
  p_patch jsonb,
  p_expected_revision integer default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision integer;
  v_payload jsonb;
  v_status text;
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
  v_keys text[];
  v_row public.projects;
begin
  perform public.require_cap('page.manage');
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'A project patch must be a JSON object' using errcode = '22023';
  end if;
  -- These own their own RPCs: practice writes derive QC and enforce separation of
  -- duties; the order link enforces one-job-per-order; the rest are server fields.
  if v_patch ?| array['practice', 'orderId', 'revision', 'createdAt', 'created_at', 'updated_at'] then
    raise exception 'Use the dedicated RPC for practice, order link and server fields'
      using errcode = '22023';
  end if;

  select p.revision into v_revision from public.projects p where p.id = p_id;
  if v_revision is null then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if p_expected_revision is not null and v_revision <> p_expected_revision then
    raise exception 'This project changed elsewhere (revision %, your copy %). Reload before saving again.',
      v_revision, p_expected_revision using errcode = '40001';
  end if;

  if v_patch ? 'status' then
    v_status := v_patch ->> 'status';
    if v_status is null or v_status not in ('draft', 'published', 'archived') then
      raise exception 'A project status must be draft, published or archived' using errcode = '22023';
    end if;
  end if;

  v_patch := v_patch - 'status';
  select coalesce(array_agg(k order by k), array[]::text[]) into v_keys
    from jsonb_object_keys(v_patch) k;

  update public.projects p
     set payload = ((p.payload - 'updatedAt') || v_patch)
                   || jsonb_build_object('updatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
         status = coalesce(v_status, p.status)
   where p.id = p_id
   returning * into v_row;

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (p_id, auth.uid(), 'project_updated', v_row.revision,
          jsonb_build_object('keys', to_jsonb(v_keys),
                             'status', case when v_status is null then null else v_status end));
  return v_row;
end
$$;
revoke all on function public.project_update(text, jsonb, integer) from public, anon;
grant execute on function public.project_update(text, jsonb, integer) to authenticated;

-- ── RPC: delete behind the same token ───────────────────────────────────────
create or replace function public.project_delete(
  p_id text,
  p_expected_revision integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision integer;
begin
  perform public.require_cap('page.manage');
  select p.revision into v_revision from public.projects p where p.id = p_id;
  if v_revision is null then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if p_expected_revision is not null and v_revision <> p_expected_revision then
    raise exception 'This project changed elsewhere (revision %, your copy %). Reload before deleting.',
      v_revision, p_expected_revision using errcode = '40001';
  end if;
  delete from public.projects p where p.id = p_id;
  return true;
end
$$;
revoke all on function public.project_delete(text, integer) from public, anon;
grant execute on function public.project_delete(text, integer) to authenticated;
