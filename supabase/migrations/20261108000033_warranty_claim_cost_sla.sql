-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Warranty claims: cost, replacement stock, SLA and assignment
-- (candidate) — M5 PROD-004 / PROD-005.
-- Isolated local candidate — NOT applied to any hosted or staging database.
--
-- Why: the claim chain stops at "resolved". Three gaps the workshop feels:
--
--   1. Nobody can say what a claim cost us, or whether we repaired it, replaced
--      it or refunded it — so warranty work is invisible in the numbers.
--   2. A replacement hands over real goods and never touched inventory, so the
--      shelf count drifted every time we honoured a warranty.
--   3. A claim had no owner and no clock: no way to answer "who is dealing with
--      this, and is it late?".
--
-- Adds:
--   * `project_warranties.sla_days` (default 7, 1–90) — the promise per job;
--   * `project_warranty_claims.cost`, `.resolution_kind`, `.assigned_to`,
--     `.due_on` (stamped at open from the warranty's SLA);
--   * `project_warranty_claim_update(...)` — now carries cost / kind /
--     replacement, and posting a replacement decrements stock atomically;
--   * `project_warranty_claim_assign(claim, user)` — a real owner for the claim;
--   * `internal_stock_move(...)` — the one internal helper that moves stock on
--     behalf of a definer RPC without demanding `catalog.manage`;
--   * `project_warranty_register(...)` — adds `sla_breached` (open claims past
--     due), `next_claim_due` and the assignee's email.
--
-- Rules:
--   * a replacement needs a product and a positive quantity, and is refused when
--     stock is short (the shelf count never goes negative or silently clamps);
--   * stock only moves for `resolution_kind = 'replacement'`;
--   * a cost needs a kind, so the ledger never carries an unexplained number;
--   * a closed claim cannot be reassigned;
--   * the assignee must be an existing staff seat (`user_roles`), not any uuid.
--
-- Deliberate limits:
--   * No supplier recovery, no claim-to-invoice credit note (that needs D-05),
--     no photo evidence (that needs the storage policies, 00014).
--   * `resolution_kind` is a fixed list; a new kind is a migration, not a typo.
--   * SLA is calendar days, not working hours.
--
-- Rollback:
--   drop function if exists public.project_warranty_register(integer);
--   drop function if exists public.staff_seats(text);
--   drop function if exists public.project_warranty_open(text, integer, text, text, integer);
--   drop function if exists public.project_post_dispatch(text);
--   drop function if exists public.project_warranty_claim_assign(uuid, uuid);
--   drop function if exists public.project_warranty_claim_update(uuid, text, text, numeric, text, jsonb);
--   drop function if exists public.internal_stock_move(text, integer, text, text);
--   alter table public.project_warranty_claims
--     drop column if exists cost, drop column if exists resolution_kind,
--     drop column if exists assigned_to, drop column if exists due_on;
--   alter table public.project_warranties drop column if exists sla_days;
--   -- then re-run 00026 and 00027 to restore the previous signatures.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── columns ────────────────────────────────────────────────────────────────
alter table public.project_warranties
  add column if not exists sla_days integer not null default 7;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_warranties_sla_days_check'
  ) then
    alter table public.project_warranties
      add constraint project_warranties_sla_days_check check (sla_days between 1 and 90);
  end if;
end
$$;

alter table public.project_warranty_claims
  add column if not exists cost numeric(12,2) not null default 0,
  add column if not exists resolution_kind text,
  add column if not exists assigned_to uuid,
  add column if not exists due_on date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'project_warranty_claims_cost_check'
  ) then
    alter table public.project_warranty_claims
      add constraint project_warranty_claims_cost_check check (cost >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'project_warranty_claims_kind_check'
  ) then
    alter table public.project_warranty_claims
      add constraint project_warranty_claims_kind_check
      check (resolution_kind is null or resolution_kind in ('repair', 'replacement', 'refund', 'goodwill', 'none'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'project_warranty_claims_assignee_fkey'
  ) then
    alter table public.project_warranty_claims
      add constraint project_warranty_claims_assignee_fkey
      foreign key (assigned_to) references auth.users(id) on delete set null;
  end if;
end
$$;

-- Existing claims get the default promise so the register has a clock to read.
update public.project_warranty_claims c
   set due_on = c.opened_on + 7
 where c.due_on is null;

-- ── the promise: an SLA set when the warranty is opened ────────────────────
drop function if exists public.project_warranty_open(text, integer, text, text);

create or replace function public.project_warranty_open(
  p_project_id text,
  p_months integer,
  p_coverage text default '',
  p_exclusions text default '',
  p_sla_days integer default 7
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
  if p_sla_days is null or p_sla_days < 1 or p_sla_days > 90 then
    raise exception 'The claim SLA must be between 1 and 90 days' using errcode = '22023';
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

  v_starts := v_installed;
  begin
    insert into public.project_warranties (project_id, months, coverage, exclusions, starts_on, ends_on, sla_days, created_by)
    values (p_project_id, p_months, v_coverage, v_exclusions, v_starts, (v_starts + (p_months || ' months')::interval)::date - 1, p_sla_days, auth.uid())
    returning * into v_row;
  exception when unique_violation then
    raise exception 'This job already has an active warranty' using errcode = '23505';
  end;

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (p_project_id, auth.uid(), 'warranty_opened',
          coalesce((select revision from public.projects where id = p_project_id), 0),
          jsonb_build_object('months', p_months, 'slaDays', p_sla_days,
                             'startsOn', v_row.starts_on, 'endsOn', v_row.ends_on));
  return v_row;
end
$$;
revoke all on function public.project_warranty_open(text, integer, text, text, integer) from public, anon;
grant execute on function public.project_warranty_open(text, integer, text, text, integer) to authenticated;

-- ── post-dispatch projection now carries the promise ───────────────────────
drop function if exists public.project_post_dispatch(text);

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
  warranty_sla_days integer,
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
           w.id, w.months, w.coverage, w.exclusions, w.starts_on, w.ends_on, w.sla_days,
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
    left join lateral (
      select * from public.project_warranties w
      where w.project_id = p.id
      order by (w.cancelled_at is null) desc, w.created_at desc
      limit 1
    ) w on true
    where p.id = p_project_id;
end
$$;
revoke all on function public.project_post_dispatch(text) from public, anon;
grant execute on function public.project_post_dispatch(text) to authenticated;

-- ── the internal stock helper ──────────────────────────────────────────────
create or replace function public.internal_stock_move(
  p_product_id text,
  p_delta integer,
  p_reason text,
  p_note text default null
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  p_row public.products;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'A stock movement needs a non-zero quantity' using errcode = '22023';
  end if;
  if p_reason not in ('inbound', 'outbound', 'return', 'damage', 'adjustment', 'grn', 'transfer-out', 'transfer-in', 'sale') then
    raise exception 'Unknown stock movement reason %', p_reason using errcode = '22023';
  end if;
  update public.products
     set stock_qty = stock_qty + p_delta,
         in_stock = (stock_qty + p_delta) > 0,
         updated_at = now()
   where id = p_product_id
   returning * into p_row;
  if not found then
    raise exception 'Product % not found', p_product_id using errcode = 'P0002';
  end if;
  if p_row.stock_qty < 0 then
    raise exception 'Not enough stock for % — % would take it to %', p_product_id, p_delta, p_row.stock_qty
      using errcode = '23514';
  end if;
  insert into public.stock_movements (product_id, delta, reason, note, actor)
  values (p_product_id, p_delta, p_reason, p_note, coalesce(auth.uid()::text, 'rpc'));
  return p_row;
end
$$;
revoke all on function public.internal_stock_move(text, integer, text, text) from public, anon, authenticated;

-- ── opening a claim stamps the clock ───────────────────────────────────────
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
  v_warranty public.project_warranties;
  v_row public.project_warranty_claims;
  v_summary text := btrim(coalesce(p_summary, ''));
  v_details text := btrim(coalesce(p_details, ''));
  v_opened date := coalesce(p_opened_on, current_date);
begin
  perform public.require_cap('page.manage');
  if char_length(v_summary) = 0 then
    raise exception 'A claim needs a summary' using errcode = '22023';
  end if;
  if char_length(v_summary) > 200 then
    raise exception 'Claim summaries are limited to 200 characters' using errcode = '22001';
  end if;
  if char_length(v_details) > 2000 then
    raise exception 'Claim details are limited to 2000 characters' using errcode = '22001';
  end if;
  if v_opened > current_date then
    raise exception 'A claim cannot be opened in the future' using errcode = '22023';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  select * into v_warranty
    from public.project_warranties w
   where w.project_id = p_project_id
     and w.cancelled_at is null
     and w.starts_on <= v_opened
     and w.ends_on >= v_opened
   order by w.created_at desc
   limit 1;
  if not found then
    raise exception 'No live warranty covers this job on that date' using errcode = '23514';
  end if;

  insert into public.project_warranty_claims (project_id, warranty_id, summary, details, opened_on, due_on, opened_by, updated_by)
  values (p_project_id, v_warranty.id, v_summary, v_details, v_opened, v_opened + v_warranty.sla_days, auth.uid(), auth.uid())
  returning * into v_row;

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (p_project_id, auth.uid(), 'warranty_claim_opened',
          coalesce((select revision from public.projects where id = p_project_id), 0),
          jsonb_build_object('claimId', v_row.id, 'dueOn', v_row.due_on));
  return v_row;
end
$$;
revoke all on function public.project_warranty_claim_open(text, text, text, date) from public, anon;
grant execute on function public.project_warranty_claim_open(text, text, text, date) to authenticated;

-- ── update now carries cost, kind and the replacement ──────────────────────
drop function if exists public.project_warranty_claim_update(uuid, text, text);

create or replace function public.project_warranty_claim_update(
  p_claim_id uuid,
  p_status text,
  p_resolution text default '',
  p_cost numeric default null,
  p_resolution_kind text default null,
  p_replacement jsonb default null
)
returns public.project_warranty_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.project_warranty_claims;
  v_resolution text := btrim(coalesce(p_resolution, ''));
  v_kind text := nullif(btrim(coalesce(p_resolution_kind, '')), '');
  v_cost numeric := p_cost;
  v_allowed boolean;
  v_product text;
  v_qty integer;
begin
  perform public.require_cap('page.manage');
  if p_status is null or p_status not in ('scheduled', 'resolved', 'rejected') then
    raise exception 'Claim status must be scheduled, resolved or rejected' using errcode = '22023';
  end if;
  if char_length(v_resolution) > 2000 then
    raise exception 'Resolution is limited to 2000 characters' using errcode = '22001';
  end if;
  if v_kind is not null and v_kind not in ('repair', 'replacement', 'refund', 'goodwill', 'none') then
    raise exception 'Resolution kind must be repair, replacement, refund, goodwill or none' using errcode = '22023';
  end if;
  if v_cost is not null and v_cost < 0 then
    raise exception 'A claim cost cannot be negative' using errcode = '22023';
  end if;
  if v_cost is not null and v_cost <> round(v_cost, 2) then
    raise exception 'A claim cost carries at most two decimals' using errcode = '22023';
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

  -- Money and stock only move on resolution, and only with a named reason.
  if p_status <> 'resolved' and (coalesce(p_cost, 0) > 0 or p_replacement is not null) then
    raise exception 'A cost or a replacement can only be recorded when the claim is resolved'
      using errcode = '22023';
  end if;
  if p_status = 'resolved' and (coalesce(v_cost, 0) > 0 or p_replacement is not null) and v_kind is null then
    raise exception 'Say what the resolution was (repair, replacement, refund, goodwill)'
      using errcode = '22023';
  end if;
  if p_replacement is not null and v_kind is distinct from 'replacement' then
    raise exception 'Stock only moves for a replacement resolution' using errcode = '23514';
  end if;

  if p_replacement is not null then
    v_product := btrim(coalesce(p_replacement ->> 'productId', p_replacement ->> 'product_id', ''));
    v_qty := coalesce((p_replacement ->> 'qty')::integer, 0);
    if v_product = '' or v_qty <= 0 then
      raise exception 'A replacement needs a product and a positive quantity' using errcode = '22023';
    end if;
    perform public.internal_stock_move(v_product, -v_qty, 'outbound', 'claim ' || p_claim_id::text);
  end if;

  update public.project_warranty_claims c
    set status = p_status,
        resolution = v_resolution,
        resolution_kind = coalesce(v_kind, c.resolution_kind),
        cost = coalesce(v_cost, c.cost),
        closed_at = case when p_status in ('resolved', 'rejected') then now() else null end,
        updated_by = auth.uid(),
        updated_at = now()
    where c.id = p_claim_id
    returning * into v_row;

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (v_row.project_id, auth.uid(), 'warranty_claim_status',
          coalesce((select revision from public.projects where id = v_row.project_id), 0),
          jsonb_build_object(
            'claimId', v_row.id,
            'status', p_status,
            'cost', v_row.cost,
            'kind', v_row.resolution_kind,
            'replacement', p_replacement
          ));
  return v_row;
end
$$;
revoke all on function public.project_warranty_claim_update(uuid, text, text, numeric, text, jsonb) from public, anon;
grant execute on function public.project_warranty_claim_update(uuid, text, text, numeric, text, jsonb) to authenticated;

-- ── assignment ─────────────────────────────────────────────────────────────
create or replace function public.project_warranty_claim_assign(p_claim_id uuid, p_user uuid)
returns public.project_warranty_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.project_warranty_claims;
begin
  perform public.require_cap('page.manage');
  if p_user is null then
    raise exception 'Choose who owns the claim' using errcode = '22023';
  end if;
  select * into v_row from public.project_warranty_claims c where c.id = p_claim_id for update;
  if not found then
    raise exception 'Claim not found' using errcode = 'P0002';
  end if;
  if v_row.status in ('resolved', 'rejected') then
    raise exception 'This claim is closed — it cannot be reassigned' using errcode = '23514';
  end if;
  if not exists (select 1 from public.user_roles r where r.user_id = p_user) then
    raise exception 'That person has no staff seat in this workspace' using errcode = '23514';
  end if;

  update public.project_warranty_claims c
     set assigned_to = p_user,
         updated_by = auth.uid(),
         updated_at = now()
   where c.id = p_claim_id
  returning * into v_row;

  insert into public.project_production_events (project_id, actor, action, revision, detail)
  values (v_row.project_id, auth.uid(), 'warranty_claim_assigned',
          coalesce((select revision from public.projects where id = v_row.project_id), 0),
          jsonb_build_object('claimId', v_row.id, 'assignedTo', p_user));
  return v_row;
end
$$;
revoke all on function public.project_warranty_claim_assign(uuid, uuid) from public, anon;

-- ── who can own a claim ────────────────────────────────────────────────────
-- The claim owner must be a real seat. Emails live in auth.users, so the list
-- is a guarded definer read rather than a client join.
create or replace function public.staff_seats(p_role text default null)
returns table (user_id uuid, email text, role text, name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_cap('page.manage');
  if p_role is not null and p_role not in ('owner', 'editor', 'sales', 'viewer') then
    raise exception 'Unknown role: %', p_role using errcode = '22023';
  end if;
  return query
    select r.user_id, coalesce(u.email, ''), r.role, coalesce(pr.name, '')
      from public.user_roles r
      left join auth.users u on u.id = r.user_id
      left join public.user_profiles pr on pr.user_id = r.user_id
     where p_role is null or r.role = p_role
     order by r.role, coalesce(u.email, '');
end
$$;
revoke all on function public.staff_seats(text) from public, anon;
grant execute on function public.staff_seats(text) to authenticated;
grant execute on function public.project_warranty_claim_assign(uuid, uuid) to authenticated;

-- ── the register gains the SLA clock and the assignee ──────────────────────
drop function if exists public.project_warranty_register(integer);

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
  updated_at timestamptz,
  sla_breached integer,
  next_claim_due date,
  assigned_to text
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
           p.updated_at,
           coalesce(claims.sla_breached, 0),
           claims.next_due,
           claims.assignee
      from public.projects p
      left join warranty w on w.project_id = p.id
      left join lateral (
        select count(*) filter (where c.status in ('open', 'scheduled'))::integer as open_count,
               count(*)::integer as total_count,
               count(*) filter (where c.status in ('open', 'scheduled') and c.due_on < current_date)::integer as sla_breached,
               min(c.due_on) filter (where c.status in ('open', 'scheduled')) as next_due,
               (select u.email from auth.users u
                 where u.id = (
                   select c2.assigned_to
                     from public.project_warranty_claims c2
                    where c2.project_id = p.id and c2.status in ('open', 'scheduled')
                      and c2.assigned_to is not null
                    order by c2.due_on nulls last
                    limit 1
                 )) as assignee
          from public.project_warranty_claims c
         where c.project_id = p.id
      ) claims on true
      left join public.project_handovers d on d.project_id = p.id and d.kind = 'delivery'
      left join public.project_handovers i on i.project_id = p.id and i.kind = 'installation'
     where w.id is not null or coalesce(claims.total_count, 0) > 0
     order by
       case
         when coalesce(claims.sla_breached, 0) > 0 then 0
         when w.id is null then 4
         when w.cancelled_at is not null then 3
         when w.ends_on < current_date then 2
         else 1
       end,
       w.ends_on nulls last,
       claims.next_due nulls last,
       p.id;
end
$$;
revoke all on function public.project_warranty_register(integer) from public, anon;
grant execute on function public.project_warranty_register(integer) to authenticated;
