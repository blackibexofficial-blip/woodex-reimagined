-- 20261107000010_convert_draft_order — draft → order, server-authoritative.
--
-- Approved by owner 2026-11-07 ("Approved — build it (full spec)" — see
-- docs/08-master-plan/CONVERT-DRAFT-ORDER-DESIGN.md). NOT executed on any
-- hosted project (no Supabase egress in the authoring environment); rehearsed
-- offline via npm run test:rehearsal (pglite) — migrations 0001–0010 + seed.
--
-- Price authority model (deliberately asymmetric, mirrors 0003/0004):
--   * order_submit  — ANONYMOUS checkouts: catalogue prices inside the txn.
--   * quote_convert — approved commercial artifact: quoted prices authoritative.
--   * convert_draft_order — draft is an approved STAFF artifact, but its stored
--     totals are DISPLAY CACHES on purpose. Default line price = CURRENT
--     catalogue price (stock and existence FOR UPDATE'd). The ONLY way to
--     change a line price is an explicit negotiated override per line,
--     supplied by a staff actor holding order.manage (has_cap gate), recorded
--     as part of the same transaction (audited in order_events). Client-side
--     draft totals/line prices NEVER reach the order.
--
--   * Lines without a catalogue product (freehand lines) are allowed ONLY with
--     an explicit negotiated override — their price is the stated deal, and
--     stock/existence checks do not apply (no product row exists).
--
-- Atomicity: one transaction; any shortfall/missing product/zero-stock = full
-- rollback; draft flips to 'converted' and stamps converted_order_id inside
-- the SAME transaction (double-click replay → 'already-converted', never a
-- duplicate order).
--
-- Shipping: delivery_zones lookup (0007) on the draft's city — 'default' row,
-- then constants — free_at_subtotal NULL = never FREE.

create or replace function public.convert_draft_order(
  p_draft_id bigint,
  p_negotiated_lines jsonb default '[]'::jsonb,
  p_payment_method text default 'cod'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_d public.draft_orders;
  v_line jsonb;
  v_line_key int;
  v_override numeric(12,2);
  v_override_found boolean;
  v_pid text;
  v_qty int;
  v_price numeric(12,2);
  v_name text;
  v_row record;
  v_items jsonb := '[]'::jsonb;
  v_subtotal numeric(12,2) := 0;
  v_shipping numeric(12,2);
  v_total numeric(12,2);
  v_zone_fee numeric(12,2);
  v_zone_free_at numeric(12,2);
  v_zone_found boolean := false;
  v_payment text;
  v_order_id bigint;
  v_ref text;
  v_draft_ref text;
  v_actor text := coalesce(auth.uid()::text, 'rpc');
  v_overrides_note text;
  -- fallback constants (display mirror: src/config/shipping.ts)
  c_fee constant numeric(12,2) := 2500;
  c_free_at constant numeric(12,2) := 50000;
begin
  if not public.has_cap('order.manage') then
    raise exception 'convert_draft_order: requires order.manage' using errcode = '42501';
  end if;

  v_payment := coalesce(nullif(trim(p_payment_method), ''), 'cod');
  if v_payment not in ('cod','bank-transfer','easypaisa','jazzcash','card') then
    raise exception 'convert_draft_order: unknown payment method %', v_payment;
  end if;

  if p_negotiated_lines is not null and jsonb_typeof(p_negotiated_lines) <> 'array' then
    raise exception 'convert_draft_order: p_negotiated_lines must be a jsonb array of {"line": <int>, "price": <number>}';
  end if;
  p_negotiated_lines := coalesce(p_negotiated_lines, '[]'::jsonb);

  select * into v_d from public.draft_orders where id = p_draft_id for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  v_draft_ref := coalesce(v_d.ref, 'DRF-' || lpad(v_d.id::text, 4, '0'));
  if v_d.status = 'converted' then
    return json_build_object('ok', false, 'reason', 'already-converted',
                             'orderRef', v_d.converted_order_id);
  end if;
  if v_d.items is null or jsonb_typeof(v_d.items) <> 'array' or jsonb_array_length(v_d.items) = 0 then
    raise exception 'convert_draft_order: draft has no lines';
  end if;
  if v_d.customer is null or btrim(v_d.customer) = '' then
    raise exception 'convert_draft_order: draft has no customer';
  end if;

  -- ── lines: catalogue reprice (default) or audited negotiated override ─────
  for v_line, v_line_key in select x.value, x.ord - 1 from jsonb_array_elements(v_d.items) with ordinality as x(value, ord) loop
    v_qty := coalesce(nullif(v_line->>'quantity', '')::int, 0);
    if v_qty < 1 then
      raise exception 'convert_draft_order: line % has quantity < 1', v_line_key + 1;
    end if;

    select (elem->>'price')::numeric into v_override
      from jsonb_array_elements(p_negotiated_lines) elem
     where (elem->>'line')::int = v_line_key
     limit 1;
    v_override_found := found;
    if v_override_found then
      if v_override is null or v_override < 0 then
        raise exception 'convert_draft_order: override for line % must be a non-negative number', v_line_key + 1;
      end if;
    end if;

    v_pid := nullif(v_line->>'id', '');
    v_name := nullif(v_line->>'name', '');
    select id, name, price, stock_qty, sku into v_row
      from public.products
     where id = v_pid
     for update;

    if found then
      if v_row.stock_qty < v_qty then
        raise exception 'out of stock: % (have %, need %)', v_row.name, v_row.stock_qty, v_qty;
      end if;
      v_price := coalesce(v_override, v_row.price);
      v_name := v_row.name;
      v_subtotal := v_subtotal + v_price * v_qty;
      v_items := v_items || jsonb_build_object(
        'id', v_row.id, 'name', v_row.name, 'price', v_price,
        'quantity', v_qty, 'sku', v_row.sku,
        'negotiated', v_override_found);
      update public.products
         set stock_qty = stock_qty - v_qty,
             in_stock = (stock_qty - v_qty) > 0,
             updated_at = now()
       where id = v_row.id;
      insert into public.stock_movements(product_id, delta, reason, note, actor)
      values (v_row.id, -v_qty, 'sale', 'draft convert ' || v_draft_ref, v_actor);
    else
      -- freehand / unknown catalogue line: ONLY with an explicit negotiated override
      if not v_override_found then
        raise exception 'convert_draft_order: line % ("%") is not a catalogue product — set a negotiated price to include it',
          v_line_key + 1, coalesce(v_name, coalesce(v_pid, 'unnamed'));
      end if;
      if v_name is null then
        raise exception 'convert_draft_order: negotiated line % needs a name', v_line_key + 1;
      end if;
      v_price := v_override;
      v_subtotal := v_subtotal + v_price * v_qty;
      v_items := v_items || jsonb_build_object(
        'id', coalesce(v_pid, 'free-' || (v_line_key + 1)), 'name', v_name, 'price', v_price,
        'quantity', v_qty, 'sku', null,
        'negotiated', true);
    end if;
  end loop;

  -- ── shipping: delivery zones (0007), same lookup as order_submit ─────────
  select dz.fee, dz.free_at_subtotal into v_zone_fee, v_zone_free_at
    from public.delivery_zones dz
   where dz.active and lower(trim(dz.city)) = lower(trim(coalesce(v_d.city, '')))
   order by dz.created_at asc nulls last, dz.id asc
   limit 1;
  if found then
    v_zone_found := true;
  else
    select dz.fee, dz.free_at_subtotal into v_zone_fee, v_zone_free_at
      from public.delivery_zones dz
     where dz.active and dz.city = 'default'
     order by dz.created_at asc nulls last, dz.id asc
     limit 1;
    if found then
      v_zone_found := true;
    else
      v_zone_fee := c_fee;
      v_zone_free_at := c_free_at;
    end if;
  end if;
  v_shipping := case when v_zone_free_at is not null and v_subtotal >= v_zone_free_at then 0 else v_zone_fee end;
  v_total := v_subtotal + v_shipping;

  insert into public.orders (ref, customer, items, total, subtotal, shipping, payment_method,
                             customer_email, customer_phone, address, city,
                             stage, status, owner, sales_channel_id)
  values (null, v_d.customer, v_items, v_total, v_subtotal, v_shipping, v_payment,
          v_d.customer_email, v_d.customer_phone, v_d.address, v_d.city,
          'intake', 'open', 'unassigned', 'ch-manual')
  returning id into v_order_id;
  v_ref := 'WDX-' || lpad(v_order_id::text, 4, '0');
  update public.orders set ref = v_ref, updated_at = now() where id = v_order_id;

  select string_agg('#' || ((elem->>'line')::int + 1) || '=Rs ' || (elem->>'price'), ', ')
    into v_overrides_note
    from jsonb_array_elements(p_negotiated_lines) elem;

  insert into public.order_events(order_id, kind, note, actor)
  values (v_order_id, 'stage:intake',
          'Converted from draft ' || v_draft_ref
            || coalesce(' — negotiated: ' || v_overrides_note, ''), v_actor);

  update public.draft_orders
     set status = 'converted',
         converted_order_id = v_ref,
         updated_at = now()
   where id = v_d.id;

  return json_build_object(
    'ok', true, 'id', v_ref, 'ref', v_ref,
    'draftRef', v_draft_ref, 'replay', false,
    'subtotal', v_subtotal, 'shipping', v_shipping, 'total', v_total,
    'items', v_items, 'status', 'intake',
    'customerName', v_d.customer, 'customerEmail', v_d.customer_email, 'customerPhone', v_d.customer_phone,
    'address', v_d.address, 'city', v_d.city,
    'paymentMethod', v_payment, 'placedAt', now(), 'channelId', 'ch-manual');
end $$;

revoke execute on function public.convert_draft_order(bigint, jsonb, text) from public, anon;
grant execute on function public.convert_draft_order(bigint, jsonb, text) to authenticated;
