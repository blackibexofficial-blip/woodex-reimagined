-- ═══════════════════════════════════════════════════════════════════════════
-- WOODEX · Invoice money integrity (candidate)
-- Isolated local candidate — NOT applied to any hosted or staging database.
--
-- Why: invoices and payments exist (00001) and the UI reads them, but the
-- database never enforced the money. Three holes, all reachable today:
--
--   1. `invoices.paid` was written by hand. `invoice_apply_payment` re-derived
--      it, but the `invoices_update` policy also lets any finance.manage user
--      UPDATE `paid` directly — so the ledger could disagree with the payment
--      rows and nothing noticed.
--   2. Nothing stopped an overpayment: paying 10x the total set paid=10x and
--      flipped the status to 'Paid'.
--   3. `invoice_apply_payment` read the invoice with no lock, so two payments
--      landing together could each compute the same `paid` and lose one.
--
-- Adds:
--   * `invoice_ref_seq` + a trigger that numbers new invoices INV-YYYY-NNNNNN
--     when `ref` is blank, with a unique index on the result;
--   * a guard trigger on `invoices` — the arithmetic must balance
--     (subtotal - discount + tax + shipping = total), every amount is >= 0,
--     and a new invoice starts unpaid;
--   * `invoice_paid_from_payments()` — `paid` is derived from the payment rows
--     on every insert/update/delete (and the overpayment check lives here, so
--     no code path can slip past it);
--   * `sync_invoice_totals(integer)` — the only writer allowed to touch `paid`;
--   * `invoice_apply_payment(...)` re-created with a row lock, an existence
--     check and a balance check;
--   * `invoice_void(integer, text)` + `invoice_events` for a reason and an
--     audit trail (refused while money is recorded against the invoice).
--
-- Rules:
--   * a payment may never take `paid` past `total` (23514);
--   * a cancelled invoice cannot take payments (23514);
--   * `paid` on a fresh invoice must be 0 (23514);
--   * refunds/credits are NOT modelled here — that needs the D-05 decision.
--
-- Rollback:
--   drop trigger if exists invoice_money_guard on public.invoices;
--   drop trigger if exists invoice_numbering on public.invoices;
--   drop trigger if exists payments_sync_invoice on public.payments;
--   drop function if exists public.enforce_invoice_money();
--   drop function if exists public.assign_invoice_ref();
--   drop function if exists public.invoice_paid_from_payments();
--   drop function if exists public.sync_invoice_totals(integer);
--   drop function if exists public.invoice_void(integer, text);
--   drop table if exists public.invoice_events;
--   drop index if exists invoices_ref_key; drop sequence if exists invoice_ref_seq;
-- ═══════════════════════════════════════════════════════════════════════════

-- ── numbering ──────────────────────────────────────────────────────────────
create sequence if not exists public.invoice_ref_seq start 1;

create or replace function public.assign_invoice_ref()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.ref is null or btrim(new.ref) = '' then
    new.ref := 'INV-' || to_char(coalesce(new.created_at, now()), 'YYYY') || '-'
               || lpad(nextval('public.invoice_ref_seq')::text, 6, '0');
  end if;
  return new;
end
$$;
revoke all on function public.assign_invoice_ref() from public, anon, authenticated;

drop trigger if exists invoice_numbering on public.invoices;
create trigger invoice_numbering before insert on public.invoices
for each row execute function public.assign_invoice_ref();

create unique index if not exists invoices_ref_key on public.invoices(ref) where ref is not null;

-- ── arithmetic guard ───────────────────────────────────────────────────────
create or replace function public.enforce_invoice_money()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  diff numeric;
begin
  if new.subtotal < 0 or new.discount < 0 or new.tax < 0 or new.shipping < 0 or new.total < 0 then
    raise exception 'Invoice amounts cannot be negative' using errcode = '23514';
  end if;
  if new.discount > new.subtotal then
    raise exception 'The discount (%) is larger than the subtotal (%)', new.discount, new.subtotal
      using errcode = '23514';
  end if;
  diff := round(new.subtotal - new.discount + new.tax + new.shipping, 2);
  if diff <> round(new.total, 2) then
    raise exception 'Invoice totals do not balance: subtotal % - discount % + tax % + shipping % = %, but total is %',
      new.subtotal, new.discount, new.tax, new.shipping, diff, new.total
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and new.paid <> 0 then
    raise exception 'A new invoice starts unpaid — record a payment instead' using errcode = '23514';
  end if;
  -- `paid` is derived. Only sync_invoice_totals() may change it.
  if tg_op = 'UPDATE' and new.paid is distinct from old.paid
     and coalesce(current_setting('woodex.invoice_sync', true), '') <> 'on' then
    raise exception 'Invoice paid is derived from the payment ledger — record a payment instead'
      using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function public.enforce_invoice_money() from public, anon, authenticated;

drop trigger if exists invoice_money_guard on public.invoices;
create trigger invoice_money_guard before insert or update on public.invoices
for each row execute function public.enforce_invoice_money();

-- ── paid is derived from payments ──────────────────────────────────────────
create or replace function public.sync_invoice_totals(p_invoice_id integer)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
  n_paid numeric;
begin
  select coalesce(sum(amount), 0) into n_paid
    from public.payments where invoice_id = p_invoice_id;
  perform set_config('woodex.invoice_sync', 'on', true);
  update public.invoices
     set paid = n_paid,
         status = case
                    when status = 'Cancelled' then 'Cancelled'
                    when n_paid >= total and total > 0 then 'Paid'
                    when n_paid > 0 then 'Partially paid'
                    else 'Issued'
                  end,
         updated_at = now()
   where id = p_invoice_id
  returning * into inv;
  perform set_config('woodex.invoice_sync', 'off', true);
  return inv;
end
$$;
revoke all on function public.sync_invoice_totals(integer) from public, anon, authenticated;

create or replace function public.invoice_paid_from_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id integer := coalesce(new.invoice_id, old.invoice_id);
  v_total numeric;
  v_paid numeric;
begin
  select i.total into v_total from public.invoices i where i.id = v_invoice_id for update;
  if v_total is null then
    raise exception 'Invoice % not found', v_invoice_id using errcode = 'P0002';
  end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = v_invoice_id;
  if v_paid > v_total then
    raise exception 'Payments would reach % against an invoice total of % — record the excess as a separate invoice or credit',
      v_paid, v_total using errcode = '23514';
  end if;
  perform public.sync_invoice_totals(v_invoice_id);
  return null;
end
$$;
revoke all on function public.invoice_paid_from_payments() from public, anon, authenticated;

drop trigger if exists payments_sync_invoice on public.payments;
create trigger payments_sync_invoice after insert or update or delete on public.payments
for each row execute function public.invoice_paid_from_payments();

-- ── payment application, re-created with locks and checks ──────────────────
create or replace function public.invoice_apply_payment(
  p_invoice_id bigint,
  p_amount numeric,
  p_method text default 'Bank transfer',
  p_reference text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
  v_method text := btrim(coalesce(p_method, ''));
begin
  perform public.require_cap('finance.manage');
  if p_amount is null or p_amount <= 0 then
    raise exception 'A payment must be greater than zero' using errcode = '22023';
  end if;
  if v_method = '' then
    raise exception 'A payment needs a method' using errcode = '22023';
  end if;
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;
  if inv.status = 'Cancelled' then
    raise exception 'This invoice is cancelled — it cannot take payments' using errcode = '23514';
  end if;
  if round(p_amount, 2) > round(inv.total - inv.paid, 2) then
    raise exception 'The payment (%) is larger than the outstanding balance (%)',
      round(p_amount, 2), round(inv.total - inv.paid, 2) using errcode = '23514';
  end if;
  insert into public.payments (invoice_id, amount, method, reference)
  values (p_invoice_id, round(p_amount, 2), v_method, nullif(btrim(coalesce(p_reference, '')), ''));
  select * into inv from public.invoices where id = p_invoice_id;
  return inv;
end
$$;
revoke all on function public.invoice_apply_payment(bigint, numeric, text, text) from public, anon;
grant execute on function public.invoice_apply_payment(bigint, numeric, text, text) to authenticated;

-- ── void with a reason and an audit row ────────────────────────────────────
create table if not exists public.invoice_events (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references public.invoices(id) on delete cascade,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoice_events_invoice on public.invoice_events(invoice_id, created_at desc);
alter table public.invoice_events enable row level security;

drop policy if exists invoice_events_read on public.invoice_events;
create policy invoice_events_read on public.invoice_events for select to authenticated
  using (public.has_cap('finance.manage') or public.has_cap('order.manage'));
-- No INSERT/UPDATE/DELETE policy: the trail is written only through the RPC.
grant select on public.invoice_events to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.invoice_events from anon, authenticated;

create or replace function public.invoice_void(p_invoice_id bigint, p_reason text)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_cap('finance.manage');
  if char_length(v_reason) < 4 then
    raise exception 'Give a reason for voiding the invoice' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'The reason is limited to 500 characters' using errcode = '22001';
  end if;
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % not found', p_invoice_id using errcode = 'P0002';
  end if;
  if inv.status = 'Cancelled' then
    raise exception 'This invoice is already cancelled' using errcode = '23514';
  end if;
  if inv.paid > 0 then
    raise exception 'Reverse the recorded payments (%) before voiding this invoice', inv.paid
      using errcode = '23514';
  end if;
  update public.invoices
     set status = 'Cancelled',
         notes = btrim(coalesce(notes || E'\n', '') || 'Voided: ' || v_reason),
         updated_at = now()
   where id = p_invoice_id
  returning * into inv;
  insert into public.invoice_events (invoice_id, action, detail, actor)
  values (p_invoice_id, 'voided', jsonb_build_object('reason', v_reason), auth.uid());
  return inv;
end
$$;
revoke all on function public.invoice_void(bigint, text) from public, anon;
grant execute on function public.invoice_void(bigint, text) to authenticated;
