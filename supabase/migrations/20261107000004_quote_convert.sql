-- 20261107000004_quote_convert — quote→order conversion with the SAME stock
-- atomicity and audit guarantees as order_submit, plus sales_channel_id on
-- orders. 0003 is left untouched; 0004 re-defines order_submit (identical
-- body + sales_channel_id stamped) and adds quote_convert.
--
-- Price authority model (documented, deliberately asymmetric):
--   * order_submit  — ANONIMALLY placed checkouts are priced from the catalogue
--     inside the transaction. The client is fully untrusted.
--   * quote_convert — quotes are an APPROVED COMMERCIAL ARTIFACT produced by an
--     admin (or the consented Quotation basket flow). Their line prices, the
--     discountPct and the shipping fee are legitimately authoritative —
--     re-reading the catalogue would destroy negotiated B2B deals. What is
--     NOT trusted: stock availability (re-verified per line, FOR UPDATE) and
--     the payment method (whitelisted). Client-supplied values never reach it.
--
-- NOT executed on hosted infra from this authoring environment (no Supabase
-- egress); rehearsed under pglite — see docs/08-master-plan §8.1.

alter table public.orders add column if not exists sales_channel_id text;

create or replace function public.order_submit(
  p_lines jsonb,
  p_customer jsonb,
  p_channel_id text default null,
  p_client_ref text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_client_ref text;
  v_existing public.orders;
  v_subtotal numeric(12,2) := 0;
  v_items jsonb := '[]'::jsonb;
  v_line jsonb;
  v_pid text;
  v_qty int;
  v_row record;
  v_name text;
  v_email text;
  v_phone text;
  v_payment text;
  v_city text;
  v_address text;
  v_notes text;
  v_order_id bigint;
  v_ref text;
  v_actor text := coalesce(auth.uid()::text, 'rpc');
  v_channel text := nullif(left(regexp_replace(coalesce(p_channel_id, ''), '[^A-Za-z0-9_-]', '', 'g'), 40), '');
begin
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    raise exception 'order_submit: p_customer must be a jsonb object';
  end if;
  v_client_ref := nullif(left(regexp_replace(coalesce(p_client_ref, ''), '[^A-Za-z0-9_-]', '', 'g'), 64), '');
  if v_client_ref is not null then
    select * into v_existing from public.orders where client_ref = v_client_ref;
    if found then
      return json_build_object(
        'id', v_existing.ref, 'ref', v_existing.ref, 'replay', true,
        'subtotal', v_existing.subtotal, 'shipping', v_existing.shipping, 'total', v_existing.total,
        'items', v_existing.items, 'status', v_existing.status,
        'customerName', v_existing.customer, 'customerEmail', v_existing.customer_email,
        'customerPhone', v_existing.customer_phone, 'address', v_existing.address, 'city', v_existing.city,
        'paymentMethod', v_existing.payment_method, 'placedAt', v_existing.created_at);
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'order_submit: at least one line is required';
  end if;

  v_name  := nullif(trim(p_customer->>'name'), '');
  v_phone := nullif(trim(p_customer->>'phone'), '');
  v_email := nullif(lower(trim(coalesce(p_customer->>'email', ''))), '');
  v_city  := nullif(trim(p_customer->>'city'), '');
  v_address := nullif(trim(coalesce(p_customer->>'address', '')), '');
  v_notes := nullif(trim(coalesce(p_customer->>'notes', '')), '');
  v_payment := coalesce(nullif(trim(p_customer->>'paymentMethod'), ''), 'cod');

  if v_name is null then raise exception 'order_submit: customer name is required'; end if;
  if v_phone is null and v_email is null then raise exception 'order_submit: phone or email is required'; end if;
  if v_payment not in ('cod','bank-transfer','easypaisa','jazzcash','card') then
    raise exception 'order_submit: unknown payment method %', v_payment;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_pid := v_line->>'productId';
    v_qty := coalesce(nullif(v_line->>'quantity', '')::int, 0);
    if v_pid is null or v_qty < 1 then
      raise exception 'order_submit: every line needs a productId and quantity >= 1';
    end if;
    select id, name, price, stock_qty, sku into v_row
      from public.products
     where id = v_pid
       for update;
    if not found then
      raise exception 'order_submit: product % not found', v_pid;
    end if;
    if v_row.stock_qty < v_qty then
      raise exception 'out of stock: % (have %, need %)', v_row.name, v_row.stock_qty, v_qty;
    end if;
    v_subtotal := v_subtotal + v_row.price * v_qty;
    v_items := v_items || jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'price', v_row.price,
      'quantity', v_qty, 'sku', v_row.sku);
    update public.products
       set stock_qty = stock_qty - v_qty,
           in_stock = (stock_qty - v_qty) > 0,
           updated_at = now()
     where id = v_row.id;
    insert into public.stock_movements(product_id, delta, reason, note, actor)
    values (v_row.id, -v_qty, 'sale', 'order submit', v_actor);
  end loop;

  insert into public.orders (ref, customer, items, total, subtotal, shipping, payment_method,
                             customer_email, customer_phone, address, city,
                             stage, status, owner, client_ref, sales_channel_id)
  values (null, v_name, v_items, v_subtotal, v_subtotal, 0, v_payment,
          v_email, v_phone, v_address, v_city,
          'intake', 'open', 'unassigned', v_client_ref, v_channel)
  returning id into v_order_id;
  v_ref := 'WDX-' || lpad(v_order_id::text, 4, '0');
  update public.orders set ref = v_ref, updated_at = now() where id = v_order_id;

  insert into public.order_events(order_id, kind, note, actor)
  values (v_order_id, 'stage:intake', 'order submitted' || coalesce(' · ' || v_notes, ''), v_actor);
  if v_notes is not null then
    insert into public.order_events(order_id, kind, note, actor)
    values (v_order_id, 'note', 'customer: ' || v_notes, v_actor);
  end if;

  return json_build_object(
    'id', v_ref, 'ref', v_ref, 'replay', false,
    'subtotal', v_subtotal, 'shipping', 0, 'total', v_subtotal,
    'items', v_items, 'status', 'intake',
    'customerName', v_name, 'customerEmail', v_email, 'customerPhone', v_phone,
    'address', v_address, 'city', v_city,
    'paymentMethod', v_payment, 'placedAt', now(), 'channelId', v_channel);
end $$;
grant execute on function public.order_submit(jsonb, jsonb, text, text) to anon, authenticated;

create or replace function public.quote_convert(
  p_quote_ref text,
  p_payment_method text default 'cod'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_num bigint;
  v_q public.quotes;
  v_items jsonb := '[]'::jsonb;
  v_line jsonb;
  v_pid text;
  v_qty int;
  v_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_pct numeric(5,2);
  v_shipping numeric(12,2);
  v_discount numeric(12,2);
  v_total numeric(12,2);
  v_exists boolean;
  v_stock int;
  v_name text;
  v_payment text;
  v_order_id bigint;
  v_ref text;
  v_actor text := coalesce(auth.uid()::text, 'rpc');
begin
  if not public.has_cap('quote.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_payment := coalesce(nullif(trim(p_payment_method), ''), 'cod');
  if v_payment not in ('cod','bank-transfer','easypaisa','jazzcash','card') then
    raise exception 'quote_convert: unknown payment method %', v_payment;
  end if;
  v_num := nullif(regexp_replace(coalesce(p_quote_ref, ''), '\D', '', 'g'), '')::bigint;
  if v_num is null then
    return json_build_object('ok', false, 'reason', 'bad-id');
  end if;

  select * into v_q from public.quotes where id = v_num for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not-found');
  end if;
  if lower(v_q.status) = 'converted' then
    return json_build_object('ok', false, 'reason', 'already-converted',
                             'orderRef', v_q.details->>'convertedOrderId');
  end if;
  if v_q.items is null or jsonb_typeof(v_q.items) <> 'array' or jsonb_array_length(v_q.items) = 0 then
    raise exception 'quote_convert: quote has no lines';
  end if;

  -- quoted prices ARE the approved deal (see header); stock is NOT trusted
  for v_line in select * from jsonb_array_elements(v_q.items)
  loop
    v_pid := v_line->>'id';
    v_qty := coalesce(nullif(v_line->>'quantity', '')::int, 0);
    v_price := coalesce(nullif(v_line->>'price', '')::numeric, 0);
    if v_qty < 1 then
      raise exception 'quote_convert: line with quantity < 1';
    end if;
    v_subtotal := v_subtotal + v_price * v_qty;
    v_items := v_items || jsonb_build_object(
      'id', v_pid, 'name', coalesce(v_line->>'name', 'Line'),
      'price', v_price, 'quantity', v_qty, 'sku', v_line->>'sku');
    select true into v_exists from public.products where id = v_pid;
    if coalesce(v_exists, false) then
      select stock_qty into v_stock from public.products where id = v_pid for update;
      if v_stock < v_qty then
        raise exception 'out of stock: % (have %, need %)', v_pid, v_stock, v_qty;
      end if;
      update public.products
         set stock_qty = stock_qty - v_qty,
             in_stock = (stock_qty - v_qty) > 0,
             updated_at = now()
       where id = v_pid;
      insert into public.stock_movements(product_id, delta, reason, note, actor)
      values (v_pid, -v_qty, 'sale', 'quote convert ' || coalesce(v_q.ref, 'QOT-' || v_num), v_actor);
    end if;
  end loop;

  v_pct := least(60, greatest(0, coalesce(nullif(v_q.details->>'discountPct', '')::numeric, 0)));
  v_shipping := coalesce(nullif(v_q.details->>'shipping', '')::numeric, 0);
  v_discount := round(v_subtotal * v_pct / 100);
  v_total := greatest(0, v_subtotal - v_discount + v_shipping);
  if v_total <= 0 then
    raise exception 'quote_convert: quote totals Rs 0 — price the lines before converting';
  end if;

  insert into public.orders (ref, customer, items, total, subtotal, shipping, payment_method,
                             customer_email, customer_phone, address, city,
                             stage, status, owner, client_ref, sales_channel_id,
                             discount_pct, discount_amount)
  values (null, v_q.customer, v_items, v_total, v_subtotal, v_shipping, v_payment,
          v_q.customer_email, v_q.customer_phone, v_q.address, v_q.city,
          'intake', 'open', 'unassigned', null, 'ch-manual',
          v_pct, v_discount)
  returning id into v_order_id;
  v_ref := 'WDX-' || lpad(v_order_id::text, 4, '0');
  update public.orders set ref = v_ref, updated_at = now() where id = v_order_id;

  update public.quotes
     set status = 'converted',
         details = coalesce(details, '{}'::jsonb) || jsonb_build_object('convertedOrderId', v_ref),
         audit = coalesce(audit, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object('at', now(), 'actor', v_actor, 'note', 'converted to ' || v_ref)),
         version = version + 1,
         updated_at = now()
   where id = v_num;

  insert into public.order_events(order_id, kind, note, actor)
  values (v_order_id, 'stage:intake',
          'Converted from quote ' || coalesce(v_q.ref, 'QOT-' || v_num)
            || coalesce(' — ' || v_pct || '% corporate discount', ''), v_actor);

  return json_build_object(
    'ok', true, 'id', v_ref, 'ref', v_ref,
    'quoteRef', coalesce(v_q.ref, 'QOT-' || v_num),
    'subtotal', v_subtotal, 'shipping', v_shipping, 'total', v_total,
    'discountPct', v_pct, 'discountAmount', v_discount,
    'items', v_items, 'status', 'intake',
    'customerName', v_q.customer, 'customerEmail', v_q.customer_email, 'customerPhone', v_q.customer_phone,
    'address', v_q.address, 'city', v_q.city,
    'paymentMethod', v_payment, 'placedAt', now(), 'channelId', 'ch-manual');
end $$;
grant execute on function public.quote_convert(text, text) to authenticated;
