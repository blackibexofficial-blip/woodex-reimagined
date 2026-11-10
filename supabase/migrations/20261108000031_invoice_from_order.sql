-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Invoice from an order, and the receivables register (candidate)
-- Isolated local candidate — NOT applied to any hosted or staging database.
--
-- Why: quotes can become invoices (`quote_invoice_snapshot`), but a *job* — an
-- order that went through production — could not. The workshop therefore had
-- no path from "job finished" to "raise the bill", and no way to see what is
-- owed without reading the invoices table row by row in the browser.
--
-- Adds:
--   * `invoice_from_order(bigint)` — raises the invoice for an order, exactly
--     once. Idempotent: a second call returns the invoice that already exists.
--     The invoice is built to *match the order total*, with the residual
--     carried as tax, so the 00030 arithmetic guard is satisfied by
--     construction rather than by trusting two numbers to agree.
--   * `invoice_register(integer)` — one row per invoice with the balance,
--     derived state, days overdue and the order it came from.
--
-- Rules:
--   * one active invoice per order (progress billing is a later decision);
--   * an order total of zero is refused — there is nothing to bill;
--   * an order whose numbers cannot be reconciled is refused rather than
--     silently rounded;
--   * the register is read-only: it computes, it never writes;
--   * `p_days_ahead` is bounded 0–365.
--
-- Deliberate limits:
--   * No partial/progress invoices, no retainer, no credit notes.
--   * No emailing, no PDF, no payment gateway — the document stays in the app.
--   * Currency is whatever the order used; multi-currency needs D-05.
--
-- Rollback:
--   drop function if exists public.invoice_register(integer);
--   drop function if exists public.invoice_from_order(bigint);
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.invoice_from_order(p_order_id bigint)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders;
  inv public.invoices;
  v_subtotal numeric;
  v_discount numeric;
  v_shipping numeric;
  v_tax numeric;
begin
  perform public.require_cap('finance.manage');
  if p_order_id is null then
    raise exception 'An order is required' using errcode = '22023';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order % not found', p_order_id using errcode = 'P0002';
  end if;

  -- Idempotency: one active invoice per order.
  select * into inv from public.invoices
   where order_id = p_order_id and status <> 'Cancelled'
   order by id limit 1;
  if found then
    return inv;
  end if;

  if round(coalesce(o.total, 0), 2) <= 0 then
    raise exception 'Order % has nothing to bill (total %)', p_order_id, o.total
      using errcode = '23514';
  end if;

  v_subtotal := round(greatest(coalesce(o.subtotal, 0), 0), 2);
  v_discount := round(greatest(coalesce(o.discount_amount, 0), 0), 2);
  v_shipping := round(greatest(coalesce(o.shipping, 0), 0), 2);
  if v_discount > v_subtotal then
    raise exception 'Order % has a discount (%) larger than its subtotal (%)',
      p_order_id, v_discount, v_subtotal using errcode = '23514';
  end if;
  -- The invoice must equal the order total, so the difference rides as tax.
  v_tax := round(coalesce(o.total, 0) - (v_subtotal - v_discount + v_shipping), 2);
  if v_tax < 0 then
    raise exception 'Order % carries a total (%) below its own subtotal, discount and shipping — correct the order first',
      p_order_id, o.total using errcode = '23514';
  end if;

  insert into public.invoices (
    order_id, customer, items, subtotal, discount, tax, shipping, total, status, due, notes
  ) values (
    p_order_id, o.customer, coalesce(o.items, '[]'::jsonb), v_subtotal, v_discount, v_tax, v_shipping,
    round(coalesce(o.total, 0), 2), 'Issued', o.due, null
  )
  returning * into inv;

  insert into public.invoice_events (invoice_id, action, detail, actor)
  values (inv.id, 'created', jsonb_build_object('orderId', p_order_id, 'total', inv.total), auth.uid());
  insert into public.order_events (order_id, kind, note, actor)
  values (p_order_id, 'invoiced', 'invoice ' || coalesce(inv.ref, inv.id::text),
          coalesce(auth.uid()::text, 'rpc'));

  return inv;
end
$$;
revoke all on function public.invoice_from_order(bigint) from public, anon;
grant execute on function public.invoice_from_order(bigint) to authenticated;

create or replace function public.invoice_register(p_days_ahead integer default 30)
returns table (
  invoice_id bigint,
  ref text,
  customer text,
  order_id bigint,
  total numeric,
  paid numeric,
  balance numeric,
  status text,
  state text,
  due date,
  days_overdue integer,
  days_to_due integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days_ahead, 30), 0), 365);
begin
  perform public.require_cap('finance.manage');
  return query
    select
      i.id,
      i.ref,
      i.customer,
      i.order_id,
      round(i.total, 2),
      round(i.paid, 2),
      round(greatest(i.total - i.paid, 0), 2),
      i.status,
      case
        when i.status = 'Cancelled' then 'cancelled'
        when round(i.paid, 2) >= round(i.total, 2) and i.total > 0 then 'paid'
        when i.due is not null and i.due::date < current_date then 'overdue'
        when i.due is not null and i.due::date <= current_date + v_days then 'due soon'
        else 'open'
      end,
      i.due::date,
      case when i.due is not null and i.due::date < current_date and i.paid < i.total
           then current_date - i.due::date else 0 end,
      case when i.due is not null and i.due::date >= current_date
           then i.due::date - current_date else 0 end
    from public.invoices i
    order by
      case
        when i.status = 'Cancelled' then 4
        when round(i.paid, 2) >= round(i.total, 2) and i.total > 0 then 3
        when i.due is not null and i.due::date < current_date then 1
        else 2
      end,
      i.due nulls last,
      i.id;
end
$$;
revoke all on function public.invoice_register(integer) from public, anon;
grant execute on function public.invoice_register(integer) to authenticated;
