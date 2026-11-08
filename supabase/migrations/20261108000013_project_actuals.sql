-- 20261108000013_project_actuals — Interior practice: relational actual-cost ledger.
-- Plan: the PLANNED BOQ stays inside projects.payload (jsonb, unchanged — see the
-- practice-workspace slice). This migration is the ACTUAL side, owner-approved
-- costing model ("full job-costing ledger", 2026-11-08):
--   project_cost_codes — per-project cost-code master. Codes align to BOQ sections
--     when the work is measurable against the BOQ (boq_section = payload section
--     name, free text join — payload is jsonb, no FK possible); shop codes such as
--     LABOR / SUBCON / MISC carry no BOQ section.
--   project_actuals — actual cost lines. amount is GENERATED (qty * rate); source
--     is explicit (po | labor | subcontract | manual); po_ref links to a purchase
--     order ref as free text (POs live in public.purchase_orders by ref text).
-- Cap model (mirrors tasks posture — crm-managed working data, finance read-only):
--   read   authenticated: has_cap('crm.manage') OR has_cap('finance.manage')
--   write  authenticated (insert/update/delete): has_cap('crm.manage')
--   anon: nothing.
-- DELETE is allowed deliberately: actuals are measurement lines (working drafts),
-- not financial documents — the no-deletes posture stays reserved for invoices /
-- payments / returns documents.
-- Rollback: drop table public.project_actuals, public.project_cost_codes; revert this file.
-- Rehearsed under pglite (migrations 0001–0013 apply clean on a fresh database).
-- The hosted project has NOT executed this file (no Supabase egress in the authoring
-- environment).

create table if not exists public.project_cost_codes (
  id bigint generated always as identity (start with 1001) primary key,
  project_id text not null references public.projects(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
  boq_section text,
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (project_id, code)
);
create index if not exists idx_project_cost_codes_project on public.project_cost_codes(project_id);

create table if not exists public.project_actuals (
  id bigint generated always as identity (start with 1001) primary key,
  project_id text not null references public.projects(id) on delete cascade,
  cost_code text not null,
  description text not null default '',
  qty numeric(12,2) not null default 1 check (qty >= 0),
  unit text not null default 'lot',
  rate numeric(14,2) not null default 0 check (rate >= 0),
  amount numeric(14,2) generated always as (qty * rate) stored,
  source text not null default 'manual' check (source in ('po','labor','subcontract','manual')),
  po_ref text,
  incurred_on date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint project_actuals_code_fkey foreign key (project_id, cost_code)
    references public.project_cost_codes (project_id, code) on delete restrict
);
create index if not exists idx_project_actuals_project on public.project_actuals(project_id);
create index if not exists idx_project_actuals_code on public.project_actuals(project_id, cost_code);

alter table public.project_cost_codes enable row level security;
alter table public.project_actuals enable row level security;
grant select, insert, update, delete on public.project_cost_codes to authenticated;
grant select, insert, update, delete on public.project_actuals to authenticated;
grant usage on sequence public.project_cost_codes_id_seq to authenticated;
grant usage on sequence public.project_actuals_id_seq to authenticated;

create policy project_cost_codes_read on public.project_cost_codes for select to authenticated
  using (public.has_cap('crm.manage') or public.has_cap('finance.manage'));
create policy project_cost_codes_insert on public.project_cost_codes for insert to authenticated
  with check (public.has_cap('crm.manage'));
create policy project_cost_codes_update on public.project_cost_codes for update to authenticated
  using (public.has_cap('crm.manage')) with check (public.has_cap('crm.manage'));
create policy project_cost_codes_delete on public.project_cost_codes for delete to authenticated
  using (public.has_cap('crm.manage'));

create policy project_actuals_read on public.project_actuals for select to authenticated
  using (public.has_cap('crm.manage') or public.has_cap('finance.manage'));
create policy project_actuals_insert on public.project_actuals for insert to authenticated
  with check (public.has_cap('crm.manage'));
create policy project_actuals_update on public.project_actuals for update to authenticated
  using (public.has_cap('crm.manage')) with check (public.has_cap('crm.manage'));
create policy project_actuals_delete on public.project_actuals for delete to authenticated
  using (public.has_cap('crm.manage'));
