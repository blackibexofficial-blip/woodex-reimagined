-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Warranty claims (candidate)
-- Isolated local candidate — NOT applied to any hosted or staging database.
--
-- Why: 00025 can open a warranty, but nothing can be claimed against it, so a
-- customer complaint still lives in WhatsApp and no one can say which jobs are
-- costing money after delivery.
--
-- Adds:
--   * project_warranty_claims — one row per claim, status and resolution
--   * project_warranty_claim_open()   — only against a LIVE warranty
--   * project_warranty_claim_update() — explicit status transitions only
--   * a read policy for staff capabilities
--   * audit rows in project_production_events for open/transition
--
-- Rules enforced here:
--   * a claim requires an active warranty (not cancelled, not expired);
--   * summary is required, details optional, both length bounded;
--   * transitions are open → scheduled → resolved|rejected, open → resolved|rejected,
--     and resolved/rejected are terminal;
--   * resolving or rejecting requires a resolution note (≥ 3 characters).
--
-- Deliberate limits (documented, not solved here):
--   * No cost/replacement decision, no inventory movement, no customer portal.
--   * A claim is not linked to an order/invoice; cost stays in the job actuals flow.
--   * Claims survive the warranty being cancelled later — history is not rewritten.
--
-- Rollback:
--   drop function if exists public.project_warranty_claim_update(uuid, text, text);
--   drop function if exists public.project_warranty_claim_open(text, text, text, date);
--   drop table if exists public.project_warranty_claims;
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.project_warranty_claims (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  warranty_id uuid not null references public.project_warranties(id) on delete cascade,
  summary text not null check (char_length(btrim(summary)) between 1 and 200),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'scheduled', 'resolved', 'rejected')),
  opened_on date not null,
  resolution text not null default '' check (char_length(resolution) <= 2000),
  closed_at timestamptz,
  opened_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_warranty_claims_project_idx
  on public.project_warranty_claims (project_id, created_at desc);

alter table public.project_warranty_claims enable row level security;
drop policy if exists project_warranty_claims_read on public.project_warranty_claims;
create policy project_warranty_claims_read on public.project_warranty_claims for select to authenticated
  using (public.has_cap('page.manage') or public.has_cap('crm.manage') or public.has_cap('finance.manage'));
revoke all on public.project_warranty_claims from anon, authenticated;
grant select on public.project_warranty_claims to authenticated;

-- ── RPC: open a claim against a live warranty ──────────────────────────────
create or replace function public.project_warranty_claim_open(
  p_project_id text,
  p_summary text,
  p_details text default '',
  p_opened_on date default null
)
returns public.project_warranty_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary text := btrim(coalesce(p_summary, ''));
  v_details text := btrim(coalesce(p_details, ''));
  v_on date := coalesce(p_opened_on, current_date);
  v_warranty public.project_warranties;
  v_row public.project_warranty_claims;
begin
  perform public.require_cap('page.manage');
  if v_summary = '' then
    raise exception 'A claim needs a short summary' using errcode = '22023';
  end if;
  if char_length(v_summary) > 200 then
    raise exception 'Claim summary is limited to 200 characters' using errcode = '22001';
  end if;
  if char_length(v_details) > 2000 then
    raise exception 'Claim details are limited to 2000 characters' using errcode = '22001';
  end if;
  if v_on > current_date then
    raise exception 'A claim cannot be dated in the future' using errcode = '22023';
  end if;
  if v_on < date '2000-01-01' then
    raise exception 'Claim date looks wrong (%)', v_on using errcode = '22023';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  select * into v_warranty
    from public.project_warranties w
    where w.project_id = p_project_id and w.cancelled_at is null;
  if not found then
    raise exception 'This job has no active warranty to claim against' using errcode = '23514';
  end if;
  if v_warranty.ends_on < current_date then
    raise exception 'The warranty expired on %', v_warranty.ends_on using errcode = '23514';
  end if;
  if v_on < v_warranty.starts_on then
    raise exception 'A claim cannot predate the warranty start (%)', v_warranty.starts_on using errcode = '23514';
  end if;

  insert into public.project_warranty_claims (project_id, warranty_id, summary, details, opened_on, opened_by)
  values (p_project_id, v_warranty.id, v_summary, v_details, v_on, auth.uid())
  returning * into v_row;

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (p_project_id, auth.uid(), 'warranty_claim_opened',
          coalesce((select revision from public.projects where id = p_project_id), 0),
          jsonb_build_object('claimId', v_row.id, 'summary', v_summary));
  return v_row;
end;
$$;
revoke all on function public.project_warranty_claim_open(text, text, text, date) from public, anon;
grant execute on function public.project_warranty_claim_open(text, text, text, date) to authenticated;

-- ── RPC: move a claim through an explicit transition ───────────────────────
create or replace function public.project_warranty_claim_update(
  p_claim_id uuid,
  p_status text,
  p_resolution text default ''
)
returns public.project_warranty_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.project_warranty_claims;
  v_resolution text := btrim(coalesce(p_resolution, ''));
  v_allowed boolean;
begin
  perform public.require_cap('page.manage');
  if p_status is null or p_status not in ('scheduled', 'resolved', 'rejected') then
    raise exception 'Claim status must be scheduled, resolved or rejected' using errcode = '22023';
  end if;
  if char_length(v_resolution) > 2000 then
    raise exception 'Resolution is limited to 2000 characters' using errcode = '22001';
  end if;

  select * into v_row from public.project_warranty_claims c where c.id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found' using errcode = 'P0002';
  end if;

  v_allowed := case
    when v_row.status = 'open' then p_status in ('scheduled', 'resolved', 'rejected')
    when v_row.status = 'scheduled' then p_status in ('resolved', 'rejected')
    else false
  end;
  if not v_allowed then
    raise exception 'Cannot move a claim from % to %', v_row.status, p_status using errcode = '23514';
  end if;
  if p_status in ('resolved', 'rejected') and char_length(v_resolution) < 3 then
    raise exception 'Resolving or rejecting a claim needs a resolution note' using errcode = '22023';
  end if;

  update public.project_warranty_claims c
    set status = p_status,
        resolution = v_resolution,
        closed_at = case when p_status in ('resolved', 'rejected') then now() else null end,
        updated_by = auth.uid(),
        updated_at = now()
    where c.id = p_claim_id
    returning * into v_row;

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (v_row.project_id, auth.uid(), 'warranty_claim_status',
          coalesce((select revision from public.projects where id = v_row.project_id), 0),
          jsonb_build_object('claimId', v_row.id, 'status', p_status));
  return v_row;
end;
$$;
revoke all on function public.project_warranty_claim_update(uuid, text, text) from public, anon;
grant execute on function public.project_warranty_claim_update(uuid, text, text) to authenticated;
