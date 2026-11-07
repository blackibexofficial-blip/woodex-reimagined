-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Agency OS Convergence — schema + RLS + capabilities (v1)
-- Ports the woodex-2030 engine (25 tables) into the reimagined catalogue and
-- adds the new merchandising/purchasing/singleton surface.
-- Postgres 14+ / Supabase. Apply with `supabase db push` AFTER review.
-- NOT for direct execution on production without the P0 owner gate.
-- ═══════════════════════════════════════════════════════════════════════════

-- Defensive role creation: hosted Supabase already provides these;
-- needed so the migration applies cleanly on a bare rehearsal database.
do $$ begin
  begin create role anon nologin; exception when duplicate_object then null; end;
  begin create role authenticated nologin; exception when duplicate_object then null; end;
end $$;

-- ── Roles helper ─────────────────────────────────────────────────────────────
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','sales','finance','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '', phone text, updated_at timestamptz not null default now()
);
create or replace function public.my_role() returns text
  language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.user_roles where user_id = auth.uid()), 'viewer')
$$;
create or replace function public.has_role(need text) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.my_role() = need or public.my_role() = 'owner'
$$;
-- Capabilities mirror woodex-2030 ROLE_CAPS 1:1
create or replace function public.my_caps() returns text[]
  language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'owner' then array['*']
    when 'editor' then array['page.manage','theme.manage','catalog.manage','media.manage']
    when 'sales' then array['crm.manage','quote.manage','order.manage']
    when 'finance' then array['finance.manage','quote.view-move','order.view-move']
    else array[]::text[]
  end
$$;
create or replace function public.has_cap(need text) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.my_caps() @> array[need] or public.my_caps() @> array['*']
$$;
create or replace function public.require_cap(need text) returns void
  language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_cap(need) then
    raise exception 'role % may not % — an owner can grant it', public.my_role(), need
      using errcode = '42501';
  end if;
end $$;

-- ── Catalogue taxonomy ───────────────────────────────────────────────────────
create table if not exists public.categories (
  id text primary key, name text not null,
  group_ text not null default 'office' check (group_ in ('office','home')),
  parent_id text references public.categories(id) on delete set null,
  sort int not null default 0,
  visible boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.series (
  id text primary key, name text not null, collection_id text,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.collections (
  id text primary key, name text not null,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.brands (
  id text primary key, name text not null,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.option_sets (
  id text primary key, name text not null,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.materials (
  id text primary key, json jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.services (
  id text primary key, json jsonb not null, created_at timestamptz not null default now()
);

-- ── Products & inventory ─────────────────────────────────────────────────────
create table if not exists public.products (
  id text primary key,
  payload jsonb not null,
  name text generated always as (payload->>'name') stored,
  sku text,
  series_id text references public.series(id) on delete set null,
  category_id text references public.categories(id) on delete set null,
  price numeric(12,2) not null default 0,
  stock_qty int not null default 99 check (stock_qty >= 0),
  in_stock boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_products_sku on public.products(sku) where sku is not null;
create index if not exists idx_products_series on public.products(series_id);
create index if not exists idx_products_category on public.products(category_id);

create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  product_id text not null references public.products(id) on delete cascade,
  delta int not null,
  reason text not null check (reason in ('inbound','outbound','return','damage','adjustment','grn','transfer-out','transfer-in','sale')),
  note text, actor text not null default 'system', created_at timestamptz not null default now()
);
create index if not exists idx_stock_movements_product on public.stock_movements(product_id, created_at desc);
create table if not exists public.inventory_meta (
  product_id text primary key references public.products(id) on delete cascade,
  low_stock_threshold int not null default 5,
  location text, last_updated timestamptz not null default now()
);
create table if not exists public.stock_transfers (
  id text primary key, from_zone text not null default 'main', to_zone text not null,
  status text not null default 'Requested' check (status in ('Requested','In transit','Received','Cancelled')),
  items jsonb not null default '[]'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.suppliers (
  id text primary key, name text not null, contact_name text, email text, phone text,
  city text, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.purchase_orders (
  id text primary key, supplier_id text not null references public.suppliers(id),
  status text not null default 'Draft' check (status in ('Draft','Sent','Partial','Received','Cancelled')),
  items jsonb not null default '[]'::jsonb, total numeric(12,2) not null default 0,
  expected_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.delivery_zones (
  id text primary key, name text not null, city text not null,
  postal_codes text[] not null default '{}', eta_days int not null default 2,
  created_at timestamptz not null default now()
);
create table if not exists public.price_lists (
  id text primary key, name text not null, channel text, currency text not null default 'PKR',
  status text not null default 'active' check (status in ('draft','active','archived')),
  items jsonb not null default '[]'::jsonb, payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.bundles (
  id text primary key, name text not null,
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.sales_channels (
  id text primary key, name text not null, kind text not null default 'retail',
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

-- ── CRM & sales workflow ─────────────────────────────────────────────────────
create table if not exists public.leads (
  id bigint generated always as identity primary key, ref text,
  name text not null, company text, interest text, source text,
  contact text, email text, phone text, preferred_channel text,
  status text not null default 'New', owner text, note text,
  contact_consent int not null default 0, is_returning int not null default 0,
  identity_review int not null default 0,
  consent_at timestamptz, consent_version text, landing_path text, referrer text,
  utm_source text, utm_medium text, utm_campaign text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_leads_status_created on public.leads(status, created_at desc);

create table if not exists public.clients (
  id bigint generated always as identity primary key,
  name text not null, company text, email text, email_norm text,
  phone text, phone_norm text, city text,
  tags jsonb not null default '[]'::jsonb, notes text, source text,
  kind text not null default 'retail' check (kind in ('retail','business')),
  merged_into bigint references public.clients(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.client_links (
  client_id bigint not null references public.clients(id) on delete cascade,
  entity text not null, entity_id bigint not null,
  primary key (entity, entity_id)
);

create table if not exists public.quotes (
  id bigint generated always as identity primary key, ref text,
  customer text not null, contact text, lead_id bigint references public.leads(id) on delete set null,
  company text, city text, address text, customer_email text, customer_phone text,
  items jsonb not null, total numeric(12,2) not null default 0,
  status text not null default 'Draft', source text not null default 'storefront',
  note text, audit jsonb not null default '[]'::jsonb, details jsonb not null default '{}'::jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_quotes_status on public.quotes(status);
create table if not exists public.quote_versions (
  id bigint generated always as identity primary key,
  quote_id bigint not null references public.quotes(id) on delete cascade,
  version int not null, snapshot jsonb not null, actor text, action text,
  created_at timestamptz not null default now(),
  unique (quote_id, version)
);
create table if not exists public.quote_templates (
  id text primary key, name text not null, template jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id bigint generated always as identity primary key, ref text,
  customer text not null, items jsonb not null,
  total numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  shipping numeric(12,2) not null default 0,
  payment_method text not null default 'bank-transfer' check (payment_method in ('cod','bank-transfer','easypaisa','jazzcash','card')),
  customer_email text,
  customer_phone text,
  address text,
  city text,
  courier_name text,
  tracking_number text,
  internal_notes text,
  discount_pct numeric(5,2),
  discount_amount numeric(12,2) not null default 0,
  status text not null default 'In Progress', stage text not null default 'production',
  owner text not null default 'You', due timestamptz,
  tracking_token_hash text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_orders_stage on public.orders(stage);
create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  kind text not null, note text, actor text not null default 'system',
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id bigint generated always as identity primary key, ref text,
  quote_id bigint references public.quotes(id) on delete set null,
  order_id bigint references public.orders(id) on delete set null,
  customer text not null, items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0, discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0, shipping numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0, paid numeric(12,2) not null default 0,
  status text not null default 'Issued', due timestamptz, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_invoices_status on public.invoices(status);
create table if not exists public.payments (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'Bank transfer', reference text, note text,
  created_at timestamptz not null default now()
);

create table if not exists public.returns (
  id bigint generated always as identity primary key, ref text,
  order_id bigint references public.orders(id) on delete set null,
  customer text, customer_email text, customer_phone text, city text,
  items jsonb not null default '[]'::jsonb,
  reason text,
  state text not null default 'Requested', refund_amount numeric(12,2) not null default 0,
  resolution text, restock boolean not null default true, inspection_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id bigint generated always as identity primary key,
  client_id bigint references public.clients(id) on delete set null,
  lead_id bigint references public.leads(id) on delete set null,
  quote_id bigint references public.quotes(id) on delete set null,
  order_id bigint references public.orders(id) on delete set null,
  site_visit_id bigint,
  title text not null, due timestamptz, owner text not null default 'You',
  priority text not null default 'normal', done boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.site_visits (
  id bigint generated always as identity primary key, ref text unique not null,
  lead_id bigint not null references public.leads(id),
  client_id bigint not null references public.clients(id),
  scheduled_at timestamptz not null, timezone text not null default 'Asia/Karachi',
  address text not null, owner text not null default 'Unassigned',
  status text not null default 'Scheduled', notes text, outcome text,
  reminder_at timestamptz, reminder_task_id bigint references public.tasks(id) on delete set null,
  audit jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists idx_site_visits_lead on public.site_visits(lead_id, scheduled_at);

-- ── CMS & content singletons ────────────────────────────────────────────────
create table if not exists public.pages (
  id bigint generated always as identity primary key, slug text unique not null,
  title text not null, status text not null default 'Draft',
  seo_title text, seo_desc text, theme jsonb,
  seo jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  published_snapshot jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.page_blocks (
  id bigint generated always as identity primary key,
  page_id bigint not null references public.pages(id) on delete cascade,
  type text not null, props jsonb not null default '{}'::jsonb, sort int not null default 0
);
create index if not exists idx_page_blocks_page on public.page_blocks(page_id, sort);
create table if not exists public.page_versions (
  id bigint generated always as identity primary key,
  page_id bigint not null references public.pages(id) on delete cascade,
  version int not null,
  snapshot jsonb not null, note text, who text not null default 'You',
  action text not null default 'save',
  created_at timestamptz not null default now(),
  unique (page_id, version)
);
create table if not exists public.saved_sections (
  id bigint generated always as identity primary key,
  name text not null, category text not null default 'Custom',
  tags jsonb not null default '[]'::jsonb, block jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.media_assets (
  id text primary key, name text not null, url text not null,
  alt text, width int, height int, size_bytes bigint, mime text,
  folder text,
  created_at timestamptz not null default now()
);
create table if not exists public.track_events (
  id bigint generated always as identity primary key,
  page_id bigint references public.pages(id) on delete set null,
  slug text not null, kind text not null, label text, href text,
  cid text, ref text, utm_source text, utm_medium text, utm_campaign text,
  pct int, created_at timestamptz not null default now()
);
create index if not exists idx_track_slug on public.track_events(slug, kind, created_at desc);

create table if not exists public.blog_posts (
  id text primary key, payload jsonb not null, status text not null default 'Draft',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.projects (
  id text primary key, payload jsonb not null, status text not null default 'published',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.showrooms (
  id text primary key, payload jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.homepage_sections (
  id text primary key default 'home' check (id = 'home'),
  content jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.warranty_page (
  id text primary key default 'warranty' check (id = 'warranty'),
  content jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.custom_design_page (
  id text primary key default 'custom-design' check (id = 'custom-design'),
  content jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.virtual_showroom_page (
  id text primary key default 'virtual-showroom' check (id = 'virtual-showroom'),
  content jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);

-- ── Inbox & messaging ───────────────────────────────────────────────────────
create table if not exists public.conversations (
  id bigint generated always as identity primary key,
  client_id bigint not null unique references public.clients(id) on delete cascade,
  status text not null default 'open', assignee text, priority int not null default 0,
  unread int not null default 0, last_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  channel text not null, direction text not null default 'outbound',
  author text, body text not null, meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_msg_conv on public.messages(conversation_id, id);

-- ── App settings ────────────────────────────────────────────────────────────
create table if not exists public.app_settings (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC / dashboard functions (SECURITY DEFINER, capability-checked)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_cap('order.manage') or public.has_cap('finance.manage') or public.has_cap('crm.manage') or public.my_role() = 'owner') then
    raise exception 'overview is not available to %', public.my_role() using errcode = '42501';
  end if;
  return jsonb_build_object(
    'orders_today', (select count(*) from public.orders where created_at >= date_trunc('day', now())),
    'open_quotes', (select count(*) from public.quotes where status in ('Draft','Sent','Review')),
    'pipeline_value', (select coalesce(sum(total), 0) from public.quotes where status in ('Draft','Sent','Review')),
    'pending_invoices', (select count(*) from public.invoices where status in ('Issued','Partially paid')),
    'overdue_returns', (select count(*) from public.returns where state = 'Requested'),
    'low_stock', (select count(*) from public.products p where p.stock_qty <= coalesce((select low_stock_threshold from public.inventory_meta m where m.product_id = p.id), 5)),
    'new_leads_7d', (select count(*) from public.leads where created_at >= now() - interval '7 days'),
    'published_pages', (select count(*) from public.pages where published_snapshot is not null));
end $$;

create or replace function public.catalog_overrides()
returns table(id text, price numeric, stock_qty int, in_stock boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.price, p.stock_qty, p.in_stock from public.products p
$$;

create or replace function public.product_update(p_id text, p_price numeric default null, p_stock_qty int default null, p_name text default null)
returns public.products language plpgsql security definer set search_path = public as $$
declare p_row public.products;
begin
  perform public.require_cap('catalog.manage');
  update public.products
     set price = coalesce(p_price, price),
         stock_qty = coalesce(p_stock_qty, stock_qty),
         in_stock = case when p_stock_qty is null then in_stock else p_stock_qty > 0 end,
         payload = case when p_name is null then payload else jsonb_set(payload, '{name}', to_jsonb(p_name)) end,
         updated_at = now()
   where id = p_id
  returning * into p_row;
  if not found then raise exception 'product % not found', p_id; end if;
  return p_row;
end $$;

create or replace function public.inventory_apply(p_product_id text, p_delta int, p_reason text, p_note text default null)
returns public.products language plpgsql security definer set search_path = public as $$
declare p_row public.products;
begin
  perform public.require_cap('catalog.manage');
  update public.products
     set stock_qty = greatest(0, stock_qty + p_delta),
         in_stock = (stock_qty + p_delta) > 0,
         updated_at = now()
   where id = p_product_id
  returning * into p_row;
  if not found then raise exception 'product % not found', p_product_id; end if;
  insert into public.stock_movements(product_id, delta, reason, note, actor)
  values (p_product_id, p_delta, p_reason, p_note, coalesce(auth.uid()::text, 'rpc'));
  return p_row;
end $$;

create or replace function public.order_stage(p_order_id bigint, p_stage text, p_note text default null)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  perform public.require_cap('order.manage');
  if p_stage not in ('intake','production','ready','delivered','closed','cancelled') then
    raise exception 'unknown stage %', p_stage;
  end if;
  update public.orders set stage = p_stage, updated_at = now() where id = p_order_id returning * into o;
  if not found then raise exception 'order % not found', p_order_id; end if;
  insert into public.order_events(order_id, kind, note, actor)
  values (p_order_id, 'stage:' || p_stage, p_note, coalesce(auth.uid()::text, 'rpc'));
  return o;
end $$;

create or replace function public.quote_invoice_snapshot(p_quote_id bigint)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare q public.quotes; inv public.invoices;
begin
  perform public.require_cap('quote.manage');
  select * into q from public.quotes where id = p_quote_id;
  if not found then raise exception 'quote % not found', p_quote_id; end if;
  select * into inv from public.invoices where quote_id = p_quote_id;
  if found then return inv; end if;   -- idempotency
  insert into public.invoices (quote_id, customer, items, subtotal, total, status, created_at, updated_at)
  select q.id, q.customer, q.items, q.total, q.total, 'Issued', now(), now()
  returning * into inv;
  insert into public.quote_versions(quote_id, version, snapshot, actor, action)
  values (q.id, q.version, to_jsonb(q), coalesce(auth.uid()::text, 'rpc'), 'convert-to-invoice');
  return inv;
end $$;

create or replace function public.invoice_apply_payment(p_invoice_id bigint, p_amount numeric, p_method text default 'Bank transfer', p_reference text default null)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare inv public.invoices; n_paid numeric;
begin
  perform public.require_cap('finance.manage');
  insert into public.payments(invoice_id, amount, method, reference)
  values (p_invoice_id, p_amount, p_method, p_reference);
  select coalesce(sum(amount), 0) into n_paid from public.payments where invoice_id = p_invoice_id;
  update public.invoices
     set paid = n_paid,
         status = case when n_paid >= total then 'Paid' when n_paid > 0 then 'Partially paid' else 'Issued' end,
         updated_at = now()
   where id = p_invoice_id
  returning * into inv;
  if not found then raise exception 'invoice % not found', p_invoice_id; end if;
  return inv;
end $$;

create or replace function public.client_merge(p_into bigint, p_from bigint)
returns public.clients language plpgsql security definer set search_path = public as $$
declare c public.clients;
begin
  perform public.require_cap('crm.manage');
  update public.client_links set client_id = p_into where client_id = p_from;
  update public.leads set note = coalesce(note,'') || ' | merged into client ' || p_into where id in (select entity_id from public.client_links where entity='lead' and client_id = p_from);
  update public.clients set merged_into = p_into, updated_at = now() where id = p_from;
  select * into c from public.clients where id = p_into;
  if not found then raise exception 'client % not found', p_into; end if;
  return c;
end $$;

-- Bootstrap: creates the FIRST owner role for an existing auth user.
-- Called once from the service-role EF (admin-bootstrap). Not grantable by clients.
create or replace function public.bootstrap_owner(p_user uuid, p_name text default 'Owner')
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.user_roles) = 0 then
    insert into public.user_roles(user_id, role) values (p_user, 'owner')
      on conflict (user_id) do update set role = 'owner';
    insert into public.user_profiles(user_id, name) values (p_user, p_name)
      on conflict (user_id) do nothing;
  else
    raise exception 'bootstrap already completed';
  end if;
end $$;
revoke all on function public.bootstrap_owner(uuid, text) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
grant update (courier_name, tracking_number, internal_notes) on public.orders to authenticated;

-- Grants + RLS. Default for business tables is DENY; every allowance below is
-- intentional and capability-scoped. Inserts that must remain service-role
-- only simply get no INSERT policy.
-- ═══════════════════════════════════════════════════════════════════════════
grant usage on schema public to anon, authenticated;
-- Grant model (outer wall):
--   anon/authenticated: SELECT on all tables (RLS filters rows), INSERT on track_events.
--   authenticated: INSERT/UPDATE/DELETE on the CMS + CRM + catalog-metadata surfaces
--     (RLS capability policies gate every one of these).
--   Ledger tables (products, stock_movements, orders, order_events, invoices, payments)
--     deliberately get NO write grant: they move money and stock only via the
--     capability-checked RPCs below. Service role bypasses all of this (hosted EF).
grant select on all tables in schema public to anon, authenticated;
grant insert on public.track_events to anon, authenticated;
grant select, insert, update, delete on public.categories, public.series, public.collections,
  public.brands, public.option_sets, public.materials, public.services,
  public.inventory_meta, public.stock_transfers, public.suppliers, public.purchase_orders,
  public.delivery_zones, public.price_lists, public.bundles, public.sales_channels,
  public.clients, public.client_links, public.leads, public.quotes, public.quote_versions,
  public.quote_templates, public.returns, public.tasks, public.site_visits,
  public.pages, public.page_blocks, public.page_versions, public.saved_sections,
  public.media_assets, public.blog_posts, public.projects, public.showrooms,
  public.homepage_sections, public.warranty_page, public.custom_design_page, public.virtual_showroom_page,
  public.conversations, public.messages, public.user_roles, public.user_profiles, public.app_settings
  to authenticated;
grant usage on all sequences in schema public to anon, authenticated;

-- enable RLS everywhere
do $$ declare t text;
begin
  foreach t in array array[
    'user_roles','user_profiles','categories','series','collections','brands','option_sets','materials','services',
    'products','stock_movements','inventory_meta','stock_transfers','suppliers','purchase_orders','delivery_zones','price_lists','bundles','sales_channels',
    'leads','clients','client_links','quotes','quote_versions','quote_templates','orders','order_events','invoices','payments','returns','tasks','site_visits',
    'pages','page_blocks','page_versions','saved_sections','media_assets','track_events','blog_posts','projects','showrooms',
    'homepage_sections','warranty_page','custom_design_page','virtual_showroom_page','conversations','messages','app_settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- helper to keep policies terse
-- public read (catalog)
create policy products_read on public.products for select to anon, authenticated using (true);
create policy products_write on public.products for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy taxonomy_read on public.categories for select to anon, authenticated using (true);
create policy taxonomy_write on public.categories for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy series_read on public.series for select to anon, authenticated using (true);
create policy series_write on public.series for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy collections_read on public.collections for select to anon, authenticated using (true);
create policy collections_write on public.collections for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy brands_read on public.brands for select to anon, authenticated using (true);
create policy brands_write on public.brands for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy option_sets_read on public.option_sets for select to anon, authenticated using (true);
create policy option_sets_write on public.option_sets for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy materials_read on public.materials for select to anon, authenticated using (true);
create policy materials_write on public.materials for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy services_read on public.services for select to anon, authenticated using (true);
create policy services_write on public.services for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy bundles_read on public.bundles for select to anon, authenticated using (true);
create policy bundles_write on public.bundles for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy delivery_zones_read on public.delivery_zones for select to anon, authenticated using (true);
create policy delivery_zones_write on public.delivery_zones for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
-- authenticated read only (commercial/internal metadata)
create policy price_lists_read on public.price_lists for select to authenticated using (true);
create policy price_lists_write on public.price_lists for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy sales_channels_read on public.sales_channels for select to authenticated using (true);
create policy sales_channels_write on public.sales_channels for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy suppliers_read on public.suppliers for select to authenticated using (true);
create policy suppliers_write on public.suppliers for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy purchase_orders_read on public.purchase_orders for select to authenticated using (true);
create policy purchase_orders_write on public.purchase_orders for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy stock_transfers_read on public.stock_transfers for select to authenticated using (true);
create policy stock_transfers_write on public.stock_transfers for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy inventory_meta_read on public.inventory_meta for select to authenticated using (true);
create policy inventory_meta_write on public.inventory_meta for all to authenticated using (public.has_cap('catalog.manage')) with check (public.has_cap('catalog.manage'));
create policy stock_movements_read on public.stock_movements for select to authenticated using (true);
create policy stock_movements_insert on public.stock_movements for insert to authenticated with check (public.has_cap('catalog.manage'));
-- leads: public submit, team manage
-- public lead capture goes through the service-role lead-capture Edge Function (
-- P1), which bypasses RLS; no anonymous INSERT policy by design (anti-spam).
create policy leads_insert on public.leads for insert to authenticated with check (true);
create policy leads_read on public.leads for select to authenticated using (public.has_cap('crm.manage'));
create policy leads_update on public.leads for update to authenticated using (public.has_cap('crm.manage')) with check (public.has_cap('crm.manage'));
-- crm
create policy clients_read on public.clients for select to authenticated using (public.has_cap('crm.manage'));
create policy clients_insert on public.clients for insert to authenticated with check (public.has_cap('crm.manage'));
create policy clients_update on public.clients for update to authenticated using (public.has_cap('crm.manage')) with check (public.has_cap('crm.manage'));
create policy client_links_read on public.client_links for select to authenticated using (public.has_cap('crm.manage'));
create policy client_links_write on public.client_links for all to authenticated using (public.has_cap('crm.manage')) with check (public.has_cap('crm.manage'));
create policy tasks_read on public.tasks for select to authenticated using (public.has_cap('crm.manage'));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.has_cap('crm.manage'));
create policy tasks_update on public.tasks for update to authenticated using (public.has_cap('crm.manage')) with check (public.has_cap('crm.manage'));
create policy site_visits_read on public.site_visits for select to authenticated using (public.has_cap('crm.manage'));
create policy site_visits_insert on public.site_visits for insert to authenticated with check (public.has_cap('crm.manage'));
create policy site_visits_update on public.site_visits for update to authenticated using (public.has_cap('crm.manage')) with check (public.has_cap('crm.manage'));
-- quoting / invoicing / orders
create policy quotes_read on public.quotes for select to authenticated using (public.has_cap('quote.manage'));
create policy quotes_insert on public.quotes for insert to authenticated with check (public.has_cap('quote.manage'));
create policy quotes_update on public.quotes for update to authenticated using (public.has_cap('quote.manage')) with check (public.has_cap('quote.manage'));
create policy quote_versions_read on public.quote_versions for select to authenticated using (public.has_cap('quote.manage'));
create policy quote_versions_insert on public.quote_versions for insert to authenticated with check (public.has_cap('quote.manage'));
create policy quote_templates_read on public.quote_templates for select to authenticated using (public.has_cap('quote.manage'));
create policy quote_templates_write on public.quote_templates for all to authenticated using (public.has_cap('quote.manage')) with check (public.has_cap('quote.manage'));
create policy orders_read on public.orders for select to authenticated using (public.has_cap('order.manage') or public.has_cap('finance.manage'));
create policy orders_update on public.orders for update to authenticated using (public.has_cap('order.manage')) with check (public.has_cap('order.manage'));
create policy order_events_read on public.order_events for select to authenticated using (public.has_cap('order.manage') or public.has_cap('finance.manage'));
create policy invoices_read on public.invoices for select to authenticated using (public.has_cap('finance.manage') or public.has_cap('order.manage'));
create policy invoices_update on public.invoices for update to authenticated using (public.has_cap('finance.manage')) with check (public.has_cap('finance.manage'));
create policy payments_read on public.payments for select to authenticated using (public.has_cap('finance.manage'));
create policy payments_insert on public.payments for insert to authenticated with check (public.has_cap('finance.manage'));
create policy returns_read on public.returns for select to authenticated using (public.has_cap('order.manage'));
create policy returns_write on public.returns for all to authenticated using (public.has_cap('order.manage')) with check (public.has_cap('order.manage'));
-- pages & media: public reads snapshots only; editors manage all
create policy pages_public_read on public.pages for select to anon, authenticated using (published_snapshot is not null);
create policy pages_admin_read on public.pages for select to authenticated using (public.has_cap('page.manage'));
create policy pages_admin_write on public.pages for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
create policy page_blocks_read on public.page_blocks for select to anon, authenticated using (exists (select 1 from public.pages p where p.id = page_id and p.published_snapshot is not null));
create policy page_blocks_admin on public.page_blocks for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
create policy page_versions_admin on public.page_versions for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
create policy saved_sections_read on public.saved_sections for select to authenticated using (true);
create policy saved_sections_write on public.saved_sections for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
create policy media_assets_read on public.media_assets for select to anon, authenticated using (true);
create policy media_assets_write on public.media_assets for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
-- tracking: insert-only for everyone, read for owner/marketing aggregate
create policy track_events_insert on public.track_events for insert to anon, authenticated with check (true);
create policy track_events_read on public.track_events for select to authenticated using (public.my_role() = 'owner');
-- editorial content
create policy blog_read on public.blog_posts for select to anon, authenticated using (status = 'published');
create policy blog_admin on public.blog_posts for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
create policy projects_read on public.projects for select to anon, authenticated using (true);
create policy projects_admin on public.projects for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
create policy showrooms_read on public.showrooms for select to anon, authenticated using (true);
create policy showrooms_admin on public.showrooms for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
create policy hp_sections_read on public.homepage_sections for select to anon, authenticated using (true);
create policy hp_sections_write on public.homepage_sections for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
create policy warranty_page_read on public.warranty_page for select to anon, authenticated using (true);
create policy warranty_page_write on public.warranty_page for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
create policy custom_design_page_read on public.custom_design_page for select to anon, authenticated using (true);
create policy custom_design_page_write on public.custom_design_page for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
create policy virtual_showroom_page_read on public.virtual_showroom_page for select to anon, authenticated using (true);
create policy virtual_showroom_page_write on public.virtual_showroom_page for all to authenticated using (public.has_cap('page.manage')) with check (public.has_cap('page.manage'));
-- inbox
create policy conversations_read on public.conversations for select to authenticated using (public.has_cap('crm.manage'));
create policy conversations_write on public.conversations for all to authenticated using (public.has_cap('crm.manage')) with check (public.has_cap('crm.manage'));
create policy messages_read on public.messages for select to authenticated using (public.has_cap('crm.manage'));
create policy messages_insert on public.messages for insert to authenticated with check (public.has_cap('crm.manage'));
-- settings & roles
create policy app_settings_read on public.app_settings for select to authenticated using (true);
create policy app_settings_write on public.app_settings for all to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
create policy user_roles_read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.my_role() = 'owner');
create policy user_roles_write on public.user_roles for all to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
create policy user_profiles_read on public.user_profiles for select to authenticated using (user_id = auth.uid() or public.my_role() = 'owner');
create policy user_profiles_write on public.user_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_profiles_owner on public.user_profiles for all to authenticated using (public.my_role() = 'owner') with check (public.my_role() = 'owner');
