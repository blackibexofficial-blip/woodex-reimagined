-- Require accepted status for new conversions; retain existing converted replay semantics.
-- This is a status gate, not evidence of independent customer approval.
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
  -- The quote row is locked: reject every state except accepted (including NULL) before side effects.
  if lower(v_q.status) is distinct from 'accepted' then
    return json_build_object('ok', false, 'reason', 'not-accepted');
  end if;
  if v_q.items is null or jsonb_typeof(v_q.items) <> 'array' or jsonb_array_length(v_q.items) = 0 then
    raise exception 'quote_convert: quote has no lines';
  end if;

  -- Accepted quote prices are authoritative; stock is rechecked under lock.
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
