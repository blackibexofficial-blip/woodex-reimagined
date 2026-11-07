-- 20261107000008_draft_orders — Wave 2: staff-held draft orders.
-- New staff-only surface. Storefront untouched. Convert-to-order DELIBERATELY NOT
-- wired anywhere — per owner 2026-11-07, conversion must reprice via the
-- order-submit path (server-authoritative prices, stock-checked, replay-safe)
-- before orders can leave the draft state; until then drafts are pre-sales
-- shortlists, never customer-facing.
--
-- Cap model (2026-11-07 decision — mirrors orders/quotes):
--   read   authenticated: has_cap('order.manage') OR has_cap('finance.manage')  (finance read-only)
--   insert/update/delete authenticated: has_cap('order.manage')
--   anon: nothing. No public SELECT (drafts carry negotiated prices).
--
-- items jsonb = AdminOrderItem[] snapshot; catalogue lines keep the product id
-- in `id`, free lines get synthetic ids (same convention as the demo adapter).
-- subtotal/shipping/total are stored for display ONLY — conversion MUST reprice
-- server-side; nothing here is money-final.
--
-- Rollback: drop table public.draft_orders; revert this file. No other objects.
-- Rehearsed under pglite (migrations 0001–0008 apply clean on a fresh database).
-- The hosted project has NOT executed this file (no Supabase egress in the authoring
-- environment).

create table if not exists public.draft_orders (
  id bigint generated always as identity (start with 1001) primary key,
  ref text unique,
  customer text not null,
  customer_phone text,
  customer_email text,
  city text,
  address text,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  shipping numeric(12,2) not null default 0 check (shipping >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  channel_id text,
  note text,
  status text not null default 'draft' check (status in ('draft','converted')),
  converted_order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.draft_orders.converted_order_id is
  'WDX-… ref of the order this draft became. Set by conversion only (not wired 2026-11-07).';
comment on column public.draft_orders.total is
  'Display cache (subtotal + shipping). Never authoritative — conversion must reprice.';
create index if not exists idx_draft_orders_status on public.draft_orders(status);
create index if not exists idx_draft_orders_updated on public.draft_orders(updated_at desc);

alter table public.draft_orders enable row level security;
grant select, insert, update, delete on public.draft_orders to authenticated;
grant usage on sequence public.draft_orders_id_seq to authenticated;

create policy draft_orders_read on public.draft_orders for select to authenticated
  using (public.has_cap('order.manage') or public.has_cap('finance.manage'));
create policy draft_orders_insert on public.draft_orders for insert to authenticated
  with check (public.has_cap('order.manage'));
create policy draft_orders_update on public.draft_orders for update to authenticated
  using (public.has_cap('order.manage')) with check (public.has_cap('order.manage'));
create policy draft_orders_delete on public.draft_orders for delete to authenticated
  using (public.has_cap('order.manage'));
