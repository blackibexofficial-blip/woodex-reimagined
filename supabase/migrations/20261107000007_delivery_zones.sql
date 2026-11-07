-- 20261107000007_delivery_zones — delivery-fee machinery (DECISION BRIEF option B,
-- "machinery-first" rollout). ZERO behaviour change vs migration 0005: every seeded
-- row carries fee=2500 and free_at_subtotal=50000 — exactly the constants mirrored by
-- src/config/shipping.ts and the storefront checkout.
--
-- IMPORTANT — table shape: public.delivery_zones ALREADY EXISTS (created in migration
-- 0001 as catalog-metadata for the admin, CMS-managed: public read, authenticated write
-- under catalog.manage, columns id/name/city/postal_codes/eta_days). 0007 therefore
-- ALTERS that table additively instead of creating its own — a separate price table
-- was deliberately rejected (two zone models in one schema = drift forever).
--
-- What this adds to the existing table:
--   tier             'hub' | 'major' | 'default' (informational)
--   fee              numeric(12,2) >= 0 — charged when subtotal < free_at_subtotal
--   free_at_subtotal numeric(12,2)      — FREE delivery at/above this subtotal;
--                    NULL = never FREE (fee always charged)
--   active           inactive rows are ignored by the lookup
--   updated_at       stamped on rate edits
--
-- Lookup order inside order_submit: exact city (case-insensitive, trimmed,
-- deterministic earliest-created row wins on duplicates) → 'default' row →
-- historic constants (2500 / 50,000) if even 'default' is missing/inactive.
-- An inactive/missing default row keeps production behaving like today.
--
-- Seeded rows clone CURRENT production behaviour across all 12 dropdown cities plus
-- 'default'. Rates become data: owner flips them with an UPDATE (SQL at current
-- volume; the admin screen stays a HOLD item). Quote-converted orders untouched
-- (quotes carry their own shipping, migration 0004). Public SELECT stays as 0001
-- defined it — fee data is not secret. Rollback: set every fee back to 2500/50000,
-- or revert this migration; historical orders keep their stored shipping.
--
-- Rehearsed under pglite (migrations 0001–0007 apply clean on a fresh database).
-- The hosted project has NOT executed this file (no Supabase egress in the authoring
-- environment).

alter table public.delivery_zones
  add column if not exists tier text not null default 'major' check (tier in ('hub', 'major', 'default')),
  add column if not exists fee numeric(12,2) not null default 2500 check (fee >= 0),
  add column if not exists free_at_subtotal numeric(12,2) default 50000,
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();
comment on column public.delivery_zones.free_at_subtotal is
  'FREE delivery at/above this PKR subtotal; NULL = never FREE (fee always charged).';
comment on column public.delivery_zones.tier is
  'hub = launch metro (Lahore/Karachi/Islamabad/Rawalpindi); major = other dropdown cities; default = fallback row for unknown cities.';

-- Seed = CURRENT production behaviour, byte-identical across every row.
insert into public.delivery_zones (id, name, city, tier, fee, free_at_subtotal, active) values
  ('zone-lahore',      'Lahore',      'lahore',      'hub',     2500, 50000, true),
  ('zone-karachi',     'Karachi',     'karachi',     'hub',     2500, 50000, true),
  ('zone-islamabad',   'Islamabad',   'islamabad',   'hub',     2500, 50000, true),
  ('zone-rawalpindi',  'Rawalpindi',  'rawalpindi',  'hub',     2500, 50000, true),
  ('zone-faisalabad',  'Faisalabad',  'faisalabad',  'major',   2500, 50000, true),
  ('zone-multan',      'Multan',      'multan',      'major',   2500, 50000, true),
  ('zone-peshawar',    'Peshawar',    'peshawar',    'major',   2500, 50000, true),
  ('zone-quetta',      'Quetta',      'quetta',      'major',   2500, 50000, true),
  ('zone-sialkot',     'Sialkot',     'sialkot',     'major',   2500, 50000, true),
  ('zone-gujranwala',  'Gujranwala',  'gujranwala',  'major',   2500, 50000, true),
  ('zone-hyderabad',   'Hyderabad',   'hyderabad',   'major',   2500, 50000, true),
  ('zone-bahawalpur',  'Bahawalpur',  'bahawalpur',  'major',   2500, 50000, true),
  ('zone-default',     'Default',     'default',     'default', 2500, 50000, true)
on conflict (id) do nothing;

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
  v_rate_key text;
  v_count int;
  v_shipping numeric(12,2);
  v_zone_fee numeric(12,2);
  v_zone_free_at numeric(12,2);
  v_zone_found boolean := false;
  -- fallback constants (display mirror: src/config/shipping.ts). The live policy
  -- is delivery_zones; constants only guard a missing/inactive 'default' row.
  c_fee constant numeric(12,2) := 2500;
  c_free_at constant numeric(12,2) := 50000;
begin
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    raise exception 'order_submit: p_customer must be a jsonb object';
  end if;

  -- rate limit (replay-respecting: idempotent retries don't count twice?? they DO count —
  -- the bucket is caller-scoped and 20/10min is the abuse budget for the whole channel)
  v_rate_key := nullif(left(regexp_replace(coalesce(p_customer->>'rateKey', ''), '[^A-Za-z0-9._-]', '', 'g'), 64), '');
  v_rate_key := coalesce(v_rate_key, 'anon');
  insert into public.order_rate_limits as rl (key, bucket_time, count)
  values (v_rate_key, now(), 1)
  on conflict (key) do update
     set count = case when rl.bucket_time < now() - interval '10 minutes' then 1 else rl.count + 1 end,
         bucket_time = case when rl.bucket_time < now() - interval '10 minutes' then now() else rl.bucket_time end
  returning rl.count into v_count;
  if v_count > 20 then
    raise exception 'rate limit exceeded' using errcode = '42501';
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
  v_city  := nullif(trim(p_customer->>'city'), '');   -- stored as sent; the zone lookup lower/trims both sides
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

  -- delivery fee: delivery_zones lookup → 'default' row → constants.
  -- free_at_subtotal NULL = never FREE (fee always charged).
  select dz.fee, dz.free_at_subtotal into v_zone_fee, v_zone_free_at
    from public.delivery_zones dz
   where dz.active and lower(trim(dz.city)) = lower(trim(coalesce(v_city, '')))
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

  insert into public.orders (ref, customer, items, total, subtotal, shipping, payment_method,
                             customer_email, customer_phone, address, city,
                             stage, status, owner, client_ref, sales_channel_id)
  values (null, v_name, v_items, v_subtotal + v_shipping, v_subtotal, v_shipping, v_payment,
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
    'subtotal', v_subtotal, 'shipping', v_shipping, 'total', v_subtotal + v_shipping,
    'items', v_items, 'status', 'intake',
    'customerName', v_name, 'customerEmail', v_email, 'customerPhone', v_phone,
    'address', v_address, 'city', v_city,
    'paymentMethod', v_payment, 'placedAt', now(), 'channelId', v_channel);
end $$;
grant execute on function public.order_submit(jsonb, jsonb, text, text) to anon, authenticated;
