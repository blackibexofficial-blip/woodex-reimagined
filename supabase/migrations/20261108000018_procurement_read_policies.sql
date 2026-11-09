-- Narrow broad authenticated reads without altering existing rows or writes.
-- Editors manage catalogue/procurement, sales uses PO-to-job workflows, and
-- finance reviews costs. Owners have all capabilities. The owner should review
-- this provisional access matrix before applying it to a hosted database.
create function public.procurement_read_allowed()
returns boolean language sql stable security invoker set search_path = pg_catalog, public as $$
  select public.has_cap('catalog.manage')
      or public.has_cap('crm.manage')
      or public.has_cap('finance.manage')
$$;
revoke execute on function public.procurement_read_allowed() from public, anon;
grant execute on function public.procurement_read_allowed() to authenticated;

drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated
  using (public.procurement_read_allowed());
drop policy if exists purchase_orders_read on public.purchase_orders;
create policy purchase_orders_read on public.purchase_orders for select to authenticated
  using (public.procurement_read_allowed());
drop policy if exists stock_movements_read on public.stock_movements;
create policy stock_movements_read on public.stock_movements for select to authenticated
  using (public.procurement_read_allowed());
