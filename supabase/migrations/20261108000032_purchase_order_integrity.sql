-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Purchase-order integrity and goods receiving (candidate)
-- Isolated local candidate — NOT applied to any hosted or staging database.
--
-- Why: `purchase_orders` (00001) was the last unguarded money path. Three holes:
--
--   1. `total` was a typed number. Nothing checked it against the lines, so a
--      purchase order could claim any value and every cost report downstream
--      inherited the lie.
--   2. `status` could be flipped to 'Received' by hand, with `received_at` set
--      to anything. No goods, no audit, no stock movement.
--   3. Receiving did not touch inventory at all, so `products.stock_qty` drifted
--      from what the workshop actually had on the shelf.
--
-- Adds:
--   * a totals guard — every line needs a quantity and a unit cost, quantities
--     are positive, costs are non-negative, and the total must equal
--     Σ(qty × unit cost);
--   * `purchase_order_receipts` — an append-only ledger of what actually arrived,
--     keyed by line index, readable by procurement roles, writable only through
--     the RPC;
--   * `purchase_order_receive(po, lines, note)` — partial receipts allowed, full
--     receipt flips the status and stamps `received_at`, product lines raise a
--     `grn` stock movement through `inventory_apply`;
--   * `purchase_order_cancel(po, reason)` — refused once anything has arrived;
--   * `purchase_order_lines(po)` — per-line qty / received / remaining, which the
--     guard, the RPC and the UI all read from one place;
--   * the guard also refuses a hand-set status of 'Received' while any line still
--     has goods outstanding.
--
-- Rules:
--   * a purchase order starts as 'Draft' (23514 if you insert 'Received');
--   * only 'Sent' or 'Partial' can receive goods (23514 otherwise);
--   * a line cannot be over-received (23514, with the remaining quantity);
--   * a cancelled or fully received order takes no further receipts.
--
-- Deliberate limits:
--   * No supplier invoices, no 3-way match (PO / GRN / bill), no returns to
--     supplier, no price-list integration.
--   * Line shape is strict: `qty` (or `quantity`) and `unitCost` (or
--     `unit_cost`/`price`). Legacy free-form lines must be re-saved once.
--   * Stock is only moved for lines that name a real `productId`; labour and
--     service lines are received without a stock effect.
--
-- Rollback:
--   drop trigger if exists purchase_order_totals_guard on public.purchase_orders;
--   drop function if exists public.enforce_purchase_order_totals();
--   drop function if exists public.purchase_order_receive(text, jsonb, text);
--   drop function if exists public.purchase_order_cancel(text, text);
--   drop function if exists public.purchase_order_lines(text);
--   drop table if exists public.purchase_order_receipts;
-- ═══════════════════════════════════════════════════════════════════════════

-- ── receipts ledger ────────────────────────────────────────────────────────
create table if not exists public.purchase_order_receipts (
  id bigint generated always as identity primary key,
  po_id text not null references public.purchase_orders(id) on delete cascade,
  lines jsonb not null default '[]'::jsonb,
  note text,
  received_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_po_receipts_po on public.purchase_order_receipts(po_id, created_at desc);
alter table public.purchase_order_receipts enable row level security;

drop policy if exists purchase_order_receipts_read on public.purchase_order_receipts;
create policy purchase_order_receipts_read on public.purchase_order_receipts for select to authenticated
  using (public.procurement_read_allowed());
grant select on public.purchase_order_receipts to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.purchase_order_receipts from anon, authenticated;

-- ── one place that knows a line's numbers ──────────────────────────────────
create or replace function public.purchase_order_lines(p_po_id text)
returns table (
  line_index integer,
  label text,
  product_id text,
  qty numeric,
  unit_cost numeric,
  received numeric,
  remaining numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Procurement readers may see lines; everyone else is refused. Service-role
  -- callers (no JWT) skip the check — the trigger runs under the caller's claims.
  if auth.uid() is not null and not public.procurement_read_allowed() then
    raise exception 'role % may not read purchase order lines', public.my_role()
      using errcode = '42501';
  end if;
  return query
  select
    (i.ord - 1)::integer as line_index,
    coalesce(
      nullif(btrim(coalesce(i.l ->> 'name', i.l ->> 'label', '')), ''),
      'Line ' || (i.ord)::text
    ) as label,
    nullif(btrim(coalesce(i.l ->> 'productId', i.l ->> 'product_id', '')), '') as product_id,
    coalesce((i.l ->> 'qty')::numeric, (i.l ->> 'quantity')::numeric, 0) as qty,
    coalesce((i.l ->> 'unitCost')::numeric, (i.l ->> 'unit_cost')::numeric, (i.l ->> 'price')::numeric, 0) as unit_cost,
    coalesce(rec.got, 0) as received,
    greatest(
      coalesce((i.l ->> 'qty')::numeric, (i.l ->> 'quantity')::numeric, 0) - coalesce(rec.got, 0),
      0
    ) as remaining
  from public.purchase_orders po
  cross join lateral jsonb_array_elements(po.items) with ordinality as i(l, ord)
  left join lateral (
    select sum((r.value ->> 'qty')::numeric) as got
      from public.purchase_order_receipts rr
      cross join lateral jsonb_array_elements(rr.lines) as r(value)
     where rr.po_id = po.id
       and (r.value ->> 'line')::integer = (i.ord - 1)::integer
  ) rec on true
  where po.id = p_po_id;
end
$$;
revoke all on function public.purchase_order_lines(text) from public, anon;
grant execute on function public.purchase_order_lines(text) to authenticated;

-- ── totals guard ───────────────────────────────────────────────────────────
create or replace function public.enforce_purchase_order_totals()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_sum numeric := 0;
  v_line jsonb;
  v_qty numeric;
  v_cost numeric;
begin
  if tg_op = 'INSERT' and new.status <> 'Draft' then
    raise exception 'A purchase order starts as Draft — send it when the supplier has it'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT'
     or new.items is distinct from old.items
     or new.total is distinct from old.total then
    if jsonb_typeof(new.items) is distinct from 'array' then
      raise exception 'Purchase order lines must be an array' using errcode = '23514';
    end if;
    for v_line in select value from jsonb_array_elements(new.items) loop
      if jsonb_typeof(v_line) <> 'object' then
        raise exception 'Each purchase order line must be an object' using errcode = '23514';
      end if;
      v_qty := coalesce((v_line ->> 'qty')::numeric, (v_line ->> 'quantity')::numeric, null);
      v_cost := coalesce((v_line ->> 'unitCost')::numeric, (v_line ->> 'unit_cost')::numeric, (v_line ->> 'price')::numeric, null);
      if v_qty is null or v_cost is null then
        raise exception 'Each purchase order line needs a quantity and a unit cost' using errcode = '23514';
      end if;
      if v_qty <= 0 then
        raise exception 'Purchase order quantities must be greater than zero' using errcode = '23514';
      end if;
      if v_cost < 0 then
        raise exception 'A purchase order unit cost cannot be negative' using errcode = '23514';
      end if;
      v_sum := v_sum + (v_qty * v_cost);
    end loop;
    if round(v_sum, 2) <> round(new.total, 2) then
      raise exception 'The lines add up to %, but the purchase order total says %', round(v_sum, 2), round(new.total, 2)
        using errcode = '23514';
    end if;
  end if;

  if new.status = 'Received' and (tg_op = 'UPDATE') then
    if exists (select 1 from public.purchase_order_lines(new.id) l where l.remaining > 0) then
      raise exception 'Record the outstanding goods before marking this purchase order Received'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;
revoke all on function public.enforce_purchase_order_totals() from public, anon, authenticated;

drop trigger if exists purchase_order_totals_guard on public.purchase_orders;
create trigger purchase_order_totals_guard before insert or update on public.purchase_orders
for each row execute function public.enforce_purchase_order_totals();

-- ── receiving ──────────────────────────────────────────────────────────────
create or replace function public.purchase_order_receive(
  p_po_id text,
  p_lines jsonb default null,
  p_note text default ''
)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  po public.purchase_orders;
  v_norm jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_index integer;
  v_qty numeric;
  v_line record;
  v_remaining numeric;
  v_open boolean;
  v_note text := btrim(coalesce(p_note, ''));
begin
  perform public.require_cap('catalog.manage');
  if char_length(v_note) > 500 then
    raise exception 'Notes are limited to 500 characters' using errcode = '22001';
  end if;

  select * into po from public.purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'Purchase order % not found', p_po_id using errcode = 'P0002';
  end if;
  if po.status = 'Draft' then
    raise exception 'Send the purchase order to the supplier before receiving it' using errcode = '23514';
  end if;
  if po.status = 'Cancelled' then
    raise exception 'This purchase order is cancelled' using errcode = '23514';
  end if;
  if po.status = 'Received' then
    raise exception 'This purchase order has already been received in full' using errcode = '23514';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' then
    -- Receive everything that is still outstanding.
    for v_line in select * from public.purchase_order_lines(p_po_id) l where l.remaining > 0 loop
      v_norm := v_norm || jsonb_build_array(jsonb_build_object('line', v_line.line_index, 'qty', v_line.remaining));
    end loop;
    if jsonb_array_length(v_norm) = 0 then
      raise exception 'Nothing is outstanding on this purchase order' using errcode = '23514';
    end if;
  else
    for v_entry in select value from jsonb_array_elements(p_lines) loop
      if jsonb_typeof(v_entry) <> 'object' then
        raise exception 'Each receipt line must be an object' using errcode = '23514';
      end if;
      v_index := (v_entry ->> 'line')::integer;
      v_qty := (v_entry ->> 'qty')::numeric;
      if v_index is null or v_qty is null then
        raise exception 'Each receipt line needs a line index and a quantity' using errcode = '23514';
      end if;
      if v_qty <= 0 then
        raise exception 'Received quantities must be greater than zero' using errcode = '23514';
      end if;
      select * into v_line from public.purchase_order_lines(p_po_id) l where l.line_index = v_index;
      if not found then
        raise exception 'Purchase order line % does not exist', v_index using errcode = '22023';
      end if;
      if v_qty > v_line.remaining then
        raise exception 'Line % has only % outstanding (you sent %)', v_index, v_line.remaining, v_qty
          using errcode = '23514';
      end if;
      v_norm := v_norm || jsonb_build_array(jsonb_build_object('line', v_index, 'qty', v_qty));
    end loop;
    if jsonb_array_length(v_norm) = 0 then
      raise exception 'A receipt needs at least one line' using errcode = '22023';
    end if;
  end if;

  insert into public.purchase_order_receipts (po_id, lines, note, received_by)
  values (p_po_id, v_norm, nullif(v_note, ''), auth.uid());

  -- Goods that name a product move stock; the rest are labour or services.
  for v_entry in select value from jsonb_array_elements(v_norm) loop
    v_index := (v_entry ->> 'line')::integer;
    v_qty := (v_entry ->> 'qty')::numeric;
    select * into v_line from public.purchase_order_lines(p_po_id) l where l.line_index = v_index;
    if v_line.product_id is not null then
      perform public.inventory_apply(v_line.product_id, v_qty::int, 'grn', 'PO ' || p_po_id);
    end if;
  end loop;

  select exists (select 1 from public.purchase_order_lines(p_po_id) l where l.remaining > 0) into v_open;

  update public.purchase_orders
     set status = case when v_open then 'Partial' else 'Received' end,
         received_at = case when v_open then received_at else now() end,
         updated_at = now()
   where id = p_po_id
  returning * into po;

  return po;
end
$$;
revoke all on function public.purchase_order_receive(text, jsonb, text) from public, anon;
grant execute on function public.purchase_order_receive(text, jsonb, text) to authenticated;

-- ── cancelling ─────────────────────────────────────────────────────────────
create or replace function public.purchase_order_cancel(p_po_id text, p_reason text)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  po public.purchase_orders;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_cap('catalog.manage');
  if char_length(v_reason) < 4 then
    raise exception 'Give a reason for cancelling the purchase order' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'The reason is limited to 500 characters' using errcode = '22001';
  end if;
  select * into po from public.purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'Purchase order % not found', p_po_id using errcode = 'P0002';
  end if;
  if po.status = 'Cancelled' then
    raise exception 'This purchase order is already cancelled' using errcode = '23514';
  end if;
  if exists (select 1 from public.purchase_order_receipts r where r.po_id = p_po_id) then
    raise exception 'Goods have already been received against this purchase order — settle it instead of cancelling'
      using errcode = '23514';
  end if;
  update public.purchase_orders
     set status = 'Cancelled',
         notes = btrim(coalesce(notes || E'\n', '') || 'Cancelled: ' || v_reason),
         updated_at = now()
   where id = p_po_id
  returning * into po;
  return po;
end
$$;
revoke all on function public.purchase_order_cancel(text, text) from public, anon;
grant execute on function public.purchase_order_cancel(text, text) to authenticated;
