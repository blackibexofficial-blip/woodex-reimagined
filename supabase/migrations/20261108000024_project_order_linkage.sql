-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Order → production job linkage (candidate)
-- Isolated local candidate — NOT applied to any hosted or staging database.
--
-- Why: production jobs are free-standing rows in `projects`; an order knows its
-- courier and status but nothing connects the two, so a workshop job can exist for
-- no order and an order can ship with no production record.
--
-- Adds:
--   * projects.order_id — nullable link to `orders` (one job per order by default)
--   * partial unique index so an order cannot be claimed by two jobs
--   * project_link_order() / project_unlink_order() — capability-checked RPCs
--   * order_project() — read projection for the orders page (no JSON parsing there)
--   * a guard trigger so a payload patch cannot re-point an existing link
--   * an audit row in project_production_events for link/unlink
--
-- Deliberate limits (documented, not solved here):
--   * Dispatch does NOT change the order status; staff still decide that.
--   * Cancelling an order does not delete or unlink the job automatically.
--   * `orders.id` is numeric while the admin UI speaks `WDX-<n>` refs, so the link
--     stores the normalised ref (`WDX-1042`) and the RPC resolves it.
--   * `orders` is referenced by convention, not a hard foreign key, because a
--     cascade delete would destroy QC and inspection history. The RPC checks that
--     the order exists and is not cancelled.
--   * The guard trigger is an accident barrier, not a privilege boundary: the RPC
--     marks its own transaction, and a service-role client could set the same mark.
--
-- Rollback:
--   drop trigger if exists project_order_link_guard on public.projects;
--   drop function if exists public.guard_project_order_link();
--   drop function if exists public.order_project(text);
--   drop function if exists public.project_unlink_order(text, text);
--   drop function if exists public.project_link_order(text, text);
--   drop index if exists public.projects_order_id_key;
--   alter table public.projects drop column if exists order_id;
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.projects add column if not exists order_id text;
create unique index if not exists projects_order_id_key
  on public.projects (order_id) where order_id is not null;

-- ── guard: links only move through the RPC ──────────────────────────────────
create or replace function public.guard_project_order_link()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if (new.order_id is not distinct from old.order_id) then return new; end if;
  if coalesce(current_setting('woodex.order_link', true), '') = 'on' then return new; end if;
  raise exception 'The order link can only be changed through project_link_order() / project_unlink_order()'
    using errcode = '42501';
end;
$$;

drop trigger if exists project_order_link_guard on public.projects;
create trigger project_order_link_guard before update of order_id on public.projects
for each row execute function public.guard_project_order_link();

-- ── RPC: link an order to a production job ──────────────────────────────────
create or replace function public.project_link_order(
  p_project_id text,
  p_order_id text
)
returns table (project_id text, order_id text, already_linked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_stage text;
  v_project_exists boolean;
  v_num bigint;
  v_ref text;
begin
  perform public.require_cap('page.manage');
  if p_project_id is null or btrim(p_project_id) = '' then
    raise exception 'Project is required' using errcode = '22023';
  end if;
  if p_order_id is null or btrim(p_order_id) = '' then
    raise exception 'Order is required' using errcode = '22023';
  end if;

  select true, p.order_id into v_project_exists, v_current
    from public.projects p where p.id = p_project_id for update;
  if v_project_exists is not true then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  p_order_id := btrim(p_order_id);
  if p_order_id ~ '^WDX-[0-9]+$' then
    v_num := substring(p_order_id from 5)::bigint;
  elsif p_order_id ~ '^[0-9]+$' then
    v_num := p_order_id::bigint;
  else
    raise exception 'Order reference must look like WDX-<number>' using errcode = '22023';
  end if;
  v_ref := 'WDX-' || v_num;

  select o.stage into v_stage from public.orders o where o.id = v_num;
  if v_stage is null then
    raise exception 'Order % not found', v_ref using errcode = 'P0002';
  end if;
  if v_stage = 'cancelled' then
    raise exception 'Order % is cancelled and cannot start production', v_ref using errcode = '23514';
  end if;
  p_order_id := v_ref;

  if v_current is not null and v_current <> p_order_id then
    raise exception 'This job is already linked to order %', v_current using errcode = '23514';
  end if;
  if v_current = p_order_id then
    return query select p_project_id, p_order_id, true;
    return;
  end if;

  perform set_config('woodex.order_link', 'on', true);
  update public.projects set order_id = p_order_id, updated_at = now() where id = p_project_id;
  perform set_config('woodex.order_link', '', true);

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (p_project_id, auth.uid(), 'order_linked', coalesce((select revision from public.projects where id = p_project_id), 0),
          jsonb_build_object('orderId', p_order_id));
  return query select p_project_id, p_order_id, false;
end;
$$;
revoke all on function public.project_link_order(text, text) from public, anon;
grant execute on function public.project_link_order(text, text) to authenticated;

-- ── RPC: unlink (history is kept) ───────────────────────────────────────────
create or replace function public.project_unlink_order(
  p_project_id text,
  p_reason text default ''
)
returns table (project_id text, previous_order_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_project_exists boolean;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_cap('page.manage');
  select true, p.order_id into v_project_exists, v_current
    from public.projects p where p.id = p_project_id for update;
  if v_project_exists is not true then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if v_current is null then
    raise exception 'This job is not linked to an order' using errcode = '23514';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Reason is limited to 500 characters' using errcode = '22001';
  end if;

  perform set_config('woodex.order_link', 'on', true);
  update public.projects set order_id = null, updated_at = now() where id = p_project_id;
  perform set_config('woodex.order_link', '', true);

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (p_project_id, auth.uid(), 'order_unlinked',
          coalesce((select revision from public.projects where id = p_project_id), 0),
          jsonb_build_object('orderId', v_current, 'reason', v_reason));
  return query select p_project_id, v_current;
end;
$$;
revoke all on function public.project_unlink_order(text, text) from public, anon;
grant execute on function public.project_unlink_order(text, text) to authenticated;

-- ── read projection for the orders page ────────────────────────────────────
create or replace function public.order_project(p_order_id text)
returns table (
  project_id text,
  order_id text,
  title text,
  progress numeric,
  qc_result text,
  dispatch_vehicle text,
  dispatch_date text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_cap('page.manage') or public.has_cap('order.manage')) then
    raise exception 'Missing capability: page.manage or order.manage' using errcode = '42501';
  end if;
  return query
    select p.id,
           p.order_id,
           coalesce(p.payload #>> '{title}', ''),
           coalesce((
             select round(avg(greatest(0, least(100, coalesce((s ->> 'pct')::numeric, 0)))), 0)
             from jsonb_array_elements(
               case when jsonb_typeof(p.payload #> '{practice,production,stages}') = 'array'
                    then p.payload #> '{practice,production,stages}' else '[]'::jsonb end
             ) s
           ), 0),
           nullif(p.payload #>> '{practice,production,qc,result}', ''),
           nullif(p.payload #>> '{practice,production,dispatch,vehicle}', ''),
           nullif(p.payload #>> '{practice,production,dispatch,date}', ''),
           p.updated_at
    from public.projects p
    where p.order_id = p_order_id
    limit 1;
end;
$$;
revoke all on function public.order_project(text) from public, anon;
grant execute on function public.order_project(text) to authenticated;
