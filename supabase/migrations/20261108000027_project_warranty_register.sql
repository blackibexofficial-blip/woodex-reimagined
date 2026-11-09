-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Warranty register (candidate)
-- Isolated local candidate — NOT applied to any hosted or staging database.
--
-- Why: warranties and claims exist (00025/00026), but nothing lists them. A
-- workshop cannot see which jobs are still under warranty, which expire this
-- month, or which have open claims — so the data is recorded and then ignored.
--
-- Adds:
--   * project_warranty_register(p_days_ahead) — one row per job that has a
--     warranty or a claim, with the derived state, days remaining and claim counts
--
-- Rules:
--   * read-only projection: it computes, it never writes;
--   * state is derived exactly as in 00025 (`none|active|expired|cancelled`);
--   * `open_claims` counts `open` and `scheduled` claims only;
--   * `expiring_soon` is a flag, not a filter, so the UI can decide;
--   * `p_days_ahead` is bounded 0–365.
--
-- Deliberate limits:
--   * No cost, no SLA/response-time target, no assignment or reminders.
--   * A job with no warranty and no claim is not listed (use the projects page).
--
-- Rollback:
--   drop function if exists public.project_warranty_register(integer);
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.project_warranty_register(p_days_ahead integer default 60)
returns table (
  project_id text,
  title text,
  order_id text,
  warranty_id uuid,
  warranty_state text,
  warranty_starts_on date,
  warranty_ends_on date,
  days_left integer,
  expiring_soon boolean,
  open_claims integer,
  total_claims integer,
  delivery_on date,
  installation_on date,
  dispatch_vehicle text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_cap('page.manage') or public.has_cap('crm.manage') or public.has_cap('finance.manage')) then
    raise exception 'Missing capability: page.manage, crm.manage or finance.manage' using errcode = '42501';
  end if;
  if p_days_ahead is null or p_days_ahead < 0 or p_days_ahead > 365 then
    raise exception 'The reminder window must be between 0 and 365 days' using errcode = '22023';
  end if;

  return query
    with warranty as (
      select w.*
        from public.project_warranties w
        join (
          select w2.project_id as pid, max(w2.created_at) as created_at
            from public.project_warranties w2
           group by w2.project_id
        ) latest on latest.pid = w.project_id and latest.created_at = w.created_at
    )
    select p.id,
           coalesce(p.payload #>> '{title}', ''),
           p.order_id,
           w.id,
           case
             when w.id is null then 'none'
             when w.cancelled_at is not null then 'cancelled'
             when w.ends_on < current_date then 'expired'
             else 'active'
           end,
           w.starts_on,
           w.ends_on,
           case when w.id is null then null else (w.ends_on - current_date) end,
           case
             when w.id is null or w.cancelled_at is not null then false
             when w.ends_on < current_date then false
             else (w.ends_on - current_date) <= p_days_ahead
           end,
           coalesce(claims.open_count, 0),
           coalesce(claims.total_count, 0),
           d.happened_on,
           i.happened_on,
           nullif(p.payload #>> '{practice,production,dispatch,vehicle}', ''),
           p.updated_at
      from public.projects p
      left join warranty w on w.project_id = p.id
      left join lateral (
        select count(*) filter (where c.status in ('open', 'scheduled'))::integer as open_count,
               count(*)::integer as total_count
          from public.project_warranty_claims c
         where c.project_id = p.id
      ) claims on true
      left join public.project_handovers d on d.project_id = p.id and d.kind = 'delivery'
      left join public.project_handovers i on i.project_id = p.id and i.kind = 'installation'
     where w.id is not null or coalesce(claims.total_count, 0) > 0
     order by
       case
         when w.id is null then 4
         when w.cancelled_at is not null then 3
         when w.ends_on < current_date then 2
         else 1
       end,
       w.ends_on nulls last,
       p.id;
end;
$$;
revoke all on function public.project_warranty_register(integer) from public, anon;
grant execute on function public.project_warranty_register(integer) to authenticated;
