-- 0012 — admin_overview(): count open quotes with the casing the app actually writes.
-- Context: 0001 defined open_quotes/pipeline_value with Title Case
--   status in ('Draft','Sent','Review')
-- but the app (demo + hosted write path) stores quotes with lowercase lifecycle
--   QuoteStatus = draft|review|approval|sent|revised|accepted|declined|converted
-- and this DB has no casing constraint on quotes.status (default 'Draft' only; every
-- app insert passes status explicitly). Hosted open_quotes would under-count.
-- Fix: identical function, identical guard, identical payload keys; only the two
-- open-quote predicates change. Column default deliberately unchanged (insert path overrides).
-- Still security definer + stable; hosted apply remains owner-gated.
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_cap('order.manage') or public.has_cap('finance.manage') or public.has_cap('crm.manage') or public.my_role() = 'owner') then
    raise exception 'overview is not available to %', public.my_role() using errcode = '42501';
  end if;
  return jsonb_build_object(
    'orders_today', (select count(*) from public.orders where created_at >= date_trunc('day', now())),
    'open_quotes', (select count(*) from public.quotes where status in ('draft','review','approval','sent','revised')),
    'pipeline_value', (select coalesce(sum(total), 0) from public.quotes where status in ('draft','review','approval','sent','revised')),
    'pending_invoices', (select count(*) from public.invoices where status in ('Issued','Partially paid')),
    'overdue_returns', (select count(*) from public.returns where state = 'Requested'),
    'low_stock', (select count(*) from public.products p where p.stock_qty <= coalesce((select low_stock_threshold from public.inventory_meta m where m.product_id = p.id), 5)),
    'new_leads_7d', (select count(*) from public.leads where created_at >= now() - interval '7 days'),
    'published_pages', (select count(*) from public.pages where published_snapshot is not null));
end $$;
