-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Delivery / installation handover + warranty (candidate)
-- Isolated local candidate — NOT applied to any hosted or staging database.
--
-- Why: dispatch data is recorded, but nothing proves the job was handed over,
-- installed or covered. A warranty that exists only in a WhatsApp message is not a
-- record, and it cannot be tied to the QC pass that allowed dispatch.
--
-- Adds:
--   * project_handovers   — append-only delivery and installation records
--   * project_warranties  — one active warranty per job, with dates and coverage
--   * project_handover_record()      — capability-checked handover RPC
--   * project_warranty_open()        — opens a warranty from the installation date
--   * project_warranty_cancel()      — cancels with a reason, keeps the row
--   * project_post_dispatch()        — read projection (dates + computed state)
--   * audit rows in project_production_events for every action
--
-- Rules enforced here (structure and sequence, not commercial truth):
--   * a handover requires a recorded QC pass and stored dispatch data;
--   * installation requires a recorded delivery;
--   * one delivery and one installation per job;
--   * a warranty opens only after installation, 1–120 months, one active at a time;
--   * state is derived from dates, never typed by a client.
--
-- Deliberate limits (documented, not solved here):
--   * No proof files: the record carries a name and notes, no photos/signature.
--   * No order status change, no customer notification, no claim workflow.
--   * Warranty terms (coverage/exclusions) are free text approved by staff.
--   * Records are append-only for application roles; a database owner can alter them.
--
-- Rollback:
--   drop function if exists public.project_post_dispatch(text);
--   drop function if exists public.project_warranty_cancel(text, text);
--   drop function if exists public.project_warranty_open(text, integer, text, text);
--   drop function if exists public.project_handover_record(text, text, date, text, text, text);
--   drop table if exists public.project_warranties;
--   drop table if exists public.project_handovers;
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.project_handovers (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('delivery', 'installation')),
  happened_on date not null,
  lead text not null default '',
  notes text not null default '' check (char_length(notes) <= 2000),
  signed_by text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (project_id, kind)
);
create index if not exists project_handovers_project_idx
  on public.project_handovers (project_id, happened_on desc);

alter table public.project_handovers enable row level security;
drop policy if exists project_handovers_read on public.project_handovers;
create policy project_handovers_read on public.project_handovers for select to authenticated
  using (public.has_cap('page.manage') or public.has_cap('crm.manage') or public.has_cap('finance.manage'));
revoke all on public.project_handovers from anon, authenticated;
grant select on public.project_handovers to authenticated;

create table if not exists public.project_warranties (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  months integer not null check (months between 1 and 120),
  coverage text not null default '' check (char_length(coverage) <= 2000),
  exclusions text not null default '' check (char_length(exclusions) <= 2000),
  starts_on date not null,
  ends_on date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text not null default '',
  check (ends_on >= starts_on),
  check (cancelled_at is null or char_length(cancel_reason) <= 500)
);
create unique index if not exists project_warranties_active_key
  on public.project_warranties (project_id) where cancelled_at is null;
create index if not exists project_warranties_project_idx
  on public.project_warranties (project_id, created_at desc);

alter table public.project_warranties enable row level security;
drop policy if exists project_warranties_read on public.project_warranties;
create policy project_warranties_read on public.project_warranties for select to authenticated
  using (public.has_cap('page.manage') or public.has_cap('crm.manage') or public.has_cap('finance.manage'));
revoke all on public.project_warranties from anon, authenticated;
grant select on public.project_warranties to authenticated;

-- ── RPC: record a delivery or installation handover ────────────────────────
create or replace function public.project_handover_record(
  p_project_id text,
  p_kind text,
  p_happened_on date,
  p_lead text default '',
  p_notes text default '',
  p_signed_by text default ''
)
returns public.project_handovers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_production jsonb;
  v_dispatch jsonb;
  v_qc text;
  v_delivery date;
  v_lead text := btrim(coalesce(p_lead, ''));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_signed text := btrim(coalesce(p_signed_by, ''));
  v_row public.project_handovers;
begin
  perform public.require_cap('page.manage');
  if p_kind is null or p_kind not in ('delivery', 'installation') then
    raise exception 'Handover kind must be delivery or installation' using errcode = '22023';
  end if;
  if p_happened_on is null then
    raise exception 'Handover date is required' using errcode = '22023';
  end if;
  if p_happened_on > current_date then
    raise exception 'Handover date cannot be in the future' using errcode = '22023';
  end if;
  -- Typed dates can be nonsense (a mistyped year): bound them to the business era.
  if p_happened_on < date '2000-01-01' then
    raise exception 'Handover date looks wrong (%)', p_happened_on using errcode = '22023';
  end if;
  if char_length(v_notes) > 2000 then
    raise exception 'Notes are limited to 2000 characters' using errcode = '22001';
  end if;
  if char_length(v_lead) > 120 or char_length(v_signed) > 120 then
    raise exception 'Names are limited to 120 characters' using errcode = '22001';
  end if;

  select p.payload #> '{practice,production}', p.payload #>> '{practice,production,qc,result}'
    into v_production, v_qc
    from public.projects p where p.id = p_project_id for update;
  if not found then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if v_qc is distinct from 'passed' then
    raise exception 'Record a passed QC inspection before the handover' using errcode = '23514';
  end if;
  v_dispatch := v_production -> 'dispatch';
  if v_dispatch is null
     or (coalesce(btrim(v_dispatch ->> 'vehicle'), '') = ''
         and coalesce(btrim(v_dispatch ->> 'date'), '') = ''
         and coalesce(btrim(v_dispatch ->> 'challanRef'), '') = '') then
    raise exception 'Store the dispatch details before the handover' using errcode = '23514';
  end if;

  if p_kind = 'installation' then
    select h.happened_on into v_delivery
      from public.project_handovers h
      where h.project_id = p_project_id and h.kind = 'delivery';
    if v_delivery is null then
      raise exception 'Record the delivery before the installation' using errcode = '23514';
    end if;
    if p_happened_on < v_delivery then
      raise exception 'Installation cannot predate the delivery (%)', v_delivery using errcode = '23514';
    end if;
  end if;

  begin
    insert into public.project_handovers (project_id, kind, happened_on, lead, notes, signed_by, created_by)
    values (p_project_id, p_kind, p_happened_on, v_lead, v_notes, v_signed, auth.uid())
    returning * into v_row;
  exception when unique_violation then
    raise exception 'A % record already exists for this job', p_kind using errcode = '23505';
  end;

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (p_project_id, auth.uid(), 'handover_recorded',
          coalesce((select revision from public.projects where id = p_project_id), 0),
          jsonb_build_object('kind', p_kind, 'happenedOn', p_happened_on));
  return v_row;
end;
$$;
revoke all on function public.project_handover_record(text, text, date, text, text, text) from public, anon;
grant execute on function public.project_handover_record(text, text, date, text, text, text) to authenticated;

-- ── RPC: open a warranty from the installation date ────────────────────────
create or replace function public.project_warranty_open(
  p_project_id text,
  p_months integer,
  p_coverage text default '',
  p_exclusions text default ''
)
returns public.project_warranties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installed date;
  v_coverage text := btrim(coalesce(p_coverage, ''));
  v_exclusions text := btrim(coalesce(p_exclusions, ''));
  v_starts date;
  v_row public.project_warranties;
begin
  perform public.require_cap('page.manage');
  if p_months is null or p_months < 1 or p_months > 120 then
    raise exception 'Warranty months must be between 1 and 120' using errcode = '22023';
  end if;
  if char_length(v_coverage) > 2000 or char_length(v_exclusions) > 2000 then
    raise exception 'Warranty text is limited to 2000 characters' using errcode = '22001';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  select h.happened_on into v_installed
    from public.project_handovers h
    where h.project_id = p_project_id and h.kind = 'installation';
  if v_installed is null then
    raise exception 'Record the installation before opening a warranty' using errcode = '23514';
  end if;

  -- The warranty runs from the actual installation date, not from the day someone
  -- typed it in: an old installation therefore shows as expired rather than being
  -- quietly renewed.
  v_starts := v_installed;
  begin
    insert into public.project_warranties (project_id, months, coverage, exclusions, starts_on, ends_on, created_by)
    values (p_project_id, p_months, v_coverage, v_exclusions, v_starts, (v_starts + (p_months || ' months')::interval)::date - 1, auth.uid())
    returning * into v_row;
  exception when unique_violation then
    raise exception 'This job already has an active warranty' using errcode = '23505';
  end;

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (p_project_id, auth.uid(), 'warranty_opened',
          coalesce((select revision from public.projects where id = p_project_id), 0),
          jsonb_build_object('months', p_months, 'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on));
  return v_row;
end;
$$;
revoke all on function public.project_warranty_open(text, integer, text, text) from public, anon;
grant execute on function public.project_warranty_open(text, integer, text, text) to authenticated;

-- ── RPC: cancel (the row stays for history) ────────────────────────────────
create or replace function public.project_warranty_cancel(
  p_project_id text,
  p_reason text default ''
)
returns public.project_warranties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_row public.project_warranties;
begin
  perform public.require_cap('page.manage');
  if char_length(v_reason) > 500 then
    raise exception 'Reason is limited to 500 characters' using errcode = '22001';
  end if;
  update public.project_warranties w
    set cancelled_at = now(), cancel_reason = v_reason
    where w.project_id = p_project_id and w.cancelled_at is null
    returning * into v_row;
  if not found then
    raise exception 'This job has no active warranty' using errcode = '23514';
  end if;
  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (p_project_id, auth.uid(), 'warranty_cancelled',
          coalesce((select revision from public.projects where id = p_project_id), 0),
          jsonb_build_object('reason', v_reason));
  return v_row;
end;
$$;
revoke all on function public.project_warranty_cancel(text, text) from public, anon;
grant execute on function public.project_warranty_cancel(text, text) to authenticated;

-- ── read projection: dates + derived warranty state ────────────────────────
create or replace function public.project_post_dispatch(p_project_id text)
returns table (
  project_id text,
  delivery_id uuid,
  delivery_on date,
  delivery_lead text,
  delivery_notes text,
  delivery_signed_by text,
  delivery_created_at timestamptz,
  installation_id uuid,
  installation_on date,
  installation_lead text,
  installation_notes text,
  installation_signed_by text,
  installation_created_at timestamptz,
  warranty_id uuid,
  warranty_months integer,
  warranty_coverage text,
  warranty_exclusions text,
  warranty_starts_on date,
  warranty_ends_on date,
  warranty_cancelled_at timestamptz,
  warranty_cancel_reason text,
  warranty_created_at timestamptz,
  warranty_state text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_cap('page.manage') or public.has_cap('crm.manage') or public.has_cap('finance.manage')) then
    raise exception 'Missing capability: page.manage, crm.manage or finance.manage' using errcode = '42501';
  end if;
  return query
    select p.id,
           d.id, d.happened_on, d.lead, d.notes, d.signed_by, d.created_at,
           i.id, i.happened_on, i.lead, i.notes, i.signed_by, i.created_at,
           w.id, w.months, w.coverage, w.exclusions, w.starts_on, w.ends_on,
           w.cancelled_at, w.cancel_reason, w.created_at,
           case
             when w.id is null then 'none'
             when w.cancelled_at is not null then 'cancelled'
             when w.ends_on < current_date then 'expired'
             else 'active'
           end
    from public.projects p
    left join public.project_handovers d on d.project_id = p.id and d.kind = 'delivery'
    left join public.project_handovers i on i.project_id = p.id and i.kind = 'installation'
    -- Show the current warranty if there is one, otherwise the most recent cancelled
    -- one, so the UI can say "cancelled" instead of "none".
    left join lateral (
      select * from public.project_warranties w
      where w.project_id = p.id
      order by (w.cancelled_at is null) desc, w.created_at desc
      limit 1
    ) w on true
    where p.id = p_project_id;
end;
$$;
revoke all on function public.project_post_dispatch(text) from public, anon;
grant execute on function public.project_post_dispatch(text) to authenticated;
