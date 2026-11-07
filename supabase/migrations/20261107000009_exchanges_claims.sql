-- 20261107000009_exchanges_claims — Wave 2b: exchanges (RMA ↔ replacement) + warranty/damage claims.
-- Tables for the two surfaces that shipped in the demo adapter with no converged
-- schema. Sibling to public.returns (RMA) — mirrors its shape and cap model.
-- Cap model (same as 0008 draft orders — order ops with financial content):
--   read   authenticated: has_cap('order.manage') OR has_cap('finance.manage')
--   insert/update/delete authenticated: has_cap('order.manage')
--   anon: nothing.
-- incoming/outgoing jsonb = line snapshots (AdminExchangeItem[]: id, name, image?, quantity, price).
-- price_difference = outgoing total − incoming total (positive = customer pays).
-- Stock effects live in the admin adapter via inventory_apply (catalog.manage
-- required — same constraint and UX as the returns restock path).
--
-- record_order_event(p_order_id, p_note, p_kind default 'note') — security-definer
-- helper so staff adapters can append to the order timeline (order_events has no
-- direct INSERT grant by design; server flows keep writing via RPCs).
--   requires order.manage; note clamped to 500 chars, kind to 40.
--
-- Rollback: drop table public.exchanges, public.claims, function public.record_order_event;
-- revert this file.
-- Rehearsed under pglite (migrations 0001–0009 apply clean on a fresh database).
-- The hosted project has NOT executed this file (no Supabase egress in the authoring
-- environment).

create table if not exists public.exchanges (
  id bigint generated always as identity (start with 1001) primary key,
  ref text unique,
  order_id bigint references public.orders(id) on delete set null,
  return_id bigint references public.returns(id) on delete set null,
  customer text not null,
  customer_email text,
  customer_phone text,
  city text,
  incoming jsonb not null default '[]'::jsonb check (jsonb_typeof(incoming) = 'array'),
  outgoing jsonb not null default '[]'::jsonb check (jsonb_typeof(outgoing) = 'array'),
  reason text,
  status text not null default 'requested' check (status in ('requested','approved','shipped','completed','rejected')),
  price_difference numeric(12,2) not null default 0,
  difference_settled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_exchanges_status on public.exchanges(status);
create index if not exists idx_exchanges_order on public.exchanges(order_id);
create index if not exists idx_exchanges_return on public.exchanges(return_id);

create table if not exists public.claims (
  id bigint generated always as identity (start with 1001) primary key,
  ref text unique,
  order_id bigint references public.orders(id) on delete set null,
  customer text not null,
  customer_email text,
  customer_phone text,
  city text,
  product_name text not null,
  product_id text references public.products(id) on delete set null,
  type text not null check (type in ('warranty','damage','defect')),
  issue text not null,
  status text not null default 'reported' check (status in ('reported','assessing','approved','rejected','resolved')),
  assessment_note text,
  resolution_note text,
  resolution_cost numeric(12,2) check (resolution_cost is null or resolution_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_claims_status on public.claims(status);
create index if not exists idx_claims_order on public.claims(order_id);

alter table public.exchanges enable row level security;
alter table public.claims enable row level security;
grant select, insert, update, delete on public.exchanges to authenticated;
grant select, insert, update, delete on public.claims to authenticated;
grant usage on sequence public.exchanges_id_seq to authenticated;
grant usage on sequence public.claims_id_seq to authenticated;

create policy exchanges_read on public.exchanges for select to authenticated
  using (public.has_cap('order.manage') or public.has_cap('finance.manage'));
create policy exchanges_insert on public.exchanges for insert to authenticated
  with check (public.has_cap('order.manage'));
create policy exchanges_update on public.exchanges for update to authenticated
  using (public.has_cap('order.manage')) with check (public.has_cap('order.manage'));
create policy exchanges_delete on public.exchanges for delete to authenticated
  using (public.has_cap('order.manage'));

create policy claims_read on public.claims for select to authenticated
  using (public.has_cap('order.manage') or public.has_cap('finance.manage'));
create policy claims_insert on public.claims for insert to authenticated
  with check (public.has_cap('order.manage'));
create policy claims_update on public.claims for update to authenticated
  using (public.has_cap('order.manage')) with check (public.has_cap('order.manage'));
create policy claims_delete on public.claims for delete to authenticated
  using (public.has_cap('order.manage'));

create or replace function public.record_order_event(p_order_id bigint, p_note text, p_kind text default 'note')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_cap('order.manage') then
    raise exception 'record_order_event: requires order.manage' using errcode = '42501';
  end if;
  if p_order_id is null then
    raise exception 'record_order_event: order id is required';
  end if;
  insert into public.order_events(order_id, kind, note, actor)
  values (
    p_order_id,
    left(coalesce(nullif(trim(p_kind), ''), 'note'), 40),
    left(coalesce(nullif(trim(p_note), ''), ''), 500),
    coalesce(auth.uid()::text, 'rpc')
  );
end $$;
revoke execute on function public.record_order_event(bigint, text, text) from public, anon;
grant execute on function public.record_order_event(bigint, text, text) to authenticated;
