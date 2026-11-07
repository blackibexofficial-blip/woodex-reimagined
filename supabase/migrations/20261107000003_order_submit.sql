-- 20261107000003_order_submit — the ONE money-safe order intake path.
--
-- Orders are created ONLY through this function (storefront checkout EF and
-- admin order flows both funnel here). Prices are RE-READ from the catalogue
-- inside the transaction; nothing from the client is trusted. Stock is
-- decremented with SELECT ... FOR UPDATE so two checkouts racing the last unit
-- cannot both win. Replays carrying the same client_ref return the original
-- order instead of duplicating it (checkout retry safety).
--
-- NOT executed on hosted infra from this authoring environment (no Supabase
-- egress); rehearsed under pglite — see docs/08-master-plan §8.1.

alter table public.orders add column if not exists client_ref text;
create unique index if not exists orders_client_ref_unique on public.orders(client_ref) where client_ref is not null;

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
begin
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    raise exception 'order_submit: p_customer must be a jsonb object';
  end if;
  -- idempotency first — a retry must never re-decrement stock
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
                             stage, status, owner, client_ref)
  values (null, v_name, v_items, v_subtotal, v_subtotal, 0, v_payment,
          v_email, v_phone, v_address, v_city,
          'intake', 'open', 'unassigned', v_client_ref)
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
    'paymentMethod', v_payment, 'placedAt', now());
end $$;
-- public checkout path: repricing + stock atomicity are enforced server-side;
-- rate limiting still belongs at the edge (documented) and is not optional in prod.
grant execute on function public.order_submit(jsonb, jsonb, text, text) to anon, authenticated;
