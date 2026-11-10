/* Isolated PGlite regression for migration 00030 (invoice money integrity).
   Synthetic fixtures only; no hosted project is contacted. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function loadPGlite() {
  try { return await import('@electric-sql/pglite'); }
  catch {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '@electric-sql/pglite@^0.5.15'], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('Could not install local PGlite test dependency');
    return import('@electric-sql/pglite');
  }
}
const { PGlite } = await loadPGlite();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
let passed = 0, failed = 0;
const check = (name, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (condition) passed++; else failed++;
};
const q = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) => Object.values((await q(sql, args)).rows[0] ?? {})[0];
const role = (name, uid = '') => db.exec(`reset role; select set_config('app.test_uid', '${uid}', false); set role ${name}`);
async function errorCode(fn) {
  try { await fn(); return null; } catch (e) { return e.code ?? e.message; }
}
const owner = '55555555-5555-5555-5555-555555555555';
const finance = '77777777-7777-7777-7777-777777777777';
const editor = '11111111-1111-1111-1111-111111111111';
const viewer = '22222222-2222-2222-2222-222222222222';
const year = new Date().toISOString().slice(0, 4);

try {
  await db.exec(`create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid', true), '')::uuid$$;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner text, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
    alter table storage.objects enable row level security;`);
  const dir = path.join(ROOT, 'supabase/migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try { await db.exec(fs.readFileSync(path.join(dir, file), 'utf8')); }
    catch (e) { throw new Error(`${file}: ${e.message}`); }
  }
  await q('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6),($7,$8)', [
    owner, 'qa.owner@example.test', finance, 'qa.finance@example.test',
    editor, 'qa.editor@example.test', viewer, 'qa.viewer@example.test',
  ]);
  await q("insert into public.user_roles(user_id,role) values ($1,'owner'),($2,'finance'),($3,'editor'),($4,'viewer')", [owner, finance, editor, viewer]);

  // ── numbering ─────────────────────────────────────────────────────────────
  await role('postgres');
  const first = (await q("insert into public.invoices(customer,items,subtotal,total) values ('Synthetic customer','[]'::jsonb,1000,1000) returning *")).rows[0];
  check('a blank ref is numbered INV-YYYY-NNNNNN', new RegExp(`^INV-${year}-000001$`).test(String(first.ref)));
  const second = (await q("insert into public.invoices(customer,items,subtotal,total) values ('Second','[]'::jsonb,500,500) returning *")).rows[0];
  check('numbering increments', String(second.ref) === `INV-${year}-000002`);
  const explicitRef = (await q("insert into public.invoices(ref,customer,items,subtotal,total) values ('MANUAL-1','Third','[]'::jsonb,10,10) returning *")).rows[0];
  check('an explicit ref is kept', String(explicitRef.ref) === 'MANUAL-1');
  check('duplicate refs are refused',
    (await errorCode(() => q("insert into public.invoices(ref,customer,items,subtotal,total) values ('MANUAL-1','Dup','[]'::jsonb,10,10)"))) === '23505');

  // ── arithmetic guard ──────────────────────────────────────────────────────
  check('a new invoice must start unpaid',
    (await errorCode(() => q("insert into public.invoices(customer,items,subtotal,total,paid) values ('x','[]'::jsonb,100,100,50)"))) === '23514');
  check('totals that do not balance are refused',
    (await errorCode(() => q("insert into public.invoices(customer,items,subtotal,total) values ('x','[]'::jsonb,100,90)"))) === '23514');
  check('negative amounts are refused',
    (await errorCode(() => q("insert into public.invoices(customer,items,subtotal,total) values ('x','[]'::jsonb,-100,-100)"))) === '23514');
  check('a discount larger than the subtotal is refused',
    (await errorCode(() => q("insert into public.invoices(customer,items,subtotal,discount,total) values ('x','[]'::jsonb,100,150,-50)"))) === '23514');
  const balanced = (await q("insert into public.invoices(customer,items,subtotal,discount,tax,shipping,total) values ('Balanced','[]'::jsonb,1000,100,90,60,1050) returning *")).rows[0];
  check('a balanced invoice with discount, tax and shipping is accepted', Number(balanced.total) === 1050);

  // ── paid is derived ───────────────────────────────────────────────────────
  await role('authenticated', owner);
  const paid1 = (await q('select * from public.invoice_apply_payment($1,$2)', [Number(first.id), 400])).rows[0];
  check('a payment re-derives paid', Number(paid1.paid) === 400);
  check('a partial payment sets the status', String((await scalar('select status from public.invoices where id=$1', [Number(first.id)]))) === 'Partially paid');
  const paid2 = (await q('select * from public.invoice_apply_payment($1,$2)', [Number(first.id), 600])).rows[0];
  check('the final payment settles the invoice', Number(paid2.paid) === 1000 && String(paid2.status) === 'Paid');
  check('the payment ledger holds both rows', Number(await scalar('select count(*) from public.payments where invoice_id=$1', [Number(first.id)])) === 2);

  // ── overpayment ───────────────────────────────────────────────────────────
  check('a payment beyond the balance is refused',
    (await errorCode(() => q('select * from public.invoice_apply_payment($1,$2)', [Number(first.id), 1]))) === '23514');
  check('the refused payment is not stored', Number(await scalar('select count(*) from public.payments where invoice_id=$1', [Number(first.id)])) === 2);
  check('a payment larger than the invoice total is refused',
    (await errorCode(() => q('select * from public.invoice_apply_payment($1,$2)', [Number(second.id), 900]))) === '23514');
  check('a zero payment is refused',
    (await errorCode(() => q('select * from public.invoice_apply_payment($1,$2)', [Number(second.id), 0]))) === '22023');
  check('a negative payment is refused',
    (await errorCode(() => q('select * from public.invoice_apply_payment($1,$2)', [Number(second.id), -50]))) === '22023');
  check('a payment for a missing invoice is reported clearly',
    (await errorCode(() => q('select * from public.invoice_apply_payment($1,$2)', [999999, 10]))) === 'P0002');
  check('a blank payment method is refused',
    (await errorCode(() => q("select * from public.invoice_apply_payment($1,$2,'  ')", [Number(second.id), 10]))) === '22023');

  // ── direct writes to paid are closed ─────────────────────────────────────
  // App roles hold SELECT only on invoices (creation is RPC-only), so the door
  // is shut twice: no table grant, and the guard behind it.
  check('an app role cannot update an invoice row directly',
    (await errorCode(() => q("update public.invoices set status='Paid' where id=$1", [Number(second.id)]))) === '42501');
  check('paid stays at zero after the refused update',
    Number(await scalar('select paid from public.invoices where id=$1', [Number(second.id)])) === 0);

  // Even a role that can update the table (postgres here, service role on
  // Supabase) cannot move `paid` or break the arithmetic.
  await role('postgres');
  check('paid cannot be edited directly even by a privileged role',
    (await errorCode(() => q('update public.invoices set paid=9999 where id=$1', [Number(second.id)]))) === '23514');
  check('the arithmetic guard also covers updates',
    (await errorCode(() => q('update public.invoices set total=1 where id=$1', [Number(second.id)]))) === '23514');
  check('an unrelated edit still passes the guard',
    (await errorCode(() => q("update public.invoices set notes='called the customer' where id=$1", [Number(second.id)]))) === null);
  await role('authenticated', owner);

  // ── removal of a payment re-derives ──────────────────────────────────────
  await role('postgres');
  await q('delete from public.payments where invoice_id=$1 and amount=600', [Number(first.id)]);
  const afterDelete = (await q('select * from public.invoices where id=$1', [Number(first.id)])).rows[0];
  check('deleting a payment lowers paid', Number(afterDelete.paid) === 400);
  check('deleting a payment reopens the status', String(afterDelete.status) === 'Partially paid');

  // ── void ──────────────────────────────────────────────────────────────────
  await role('authenticated', owner);
  check('an invoice with money on it cannot be voided',
    (await errorCode(() => q("select * from public.invoice_void($1,'wrong customer')", [Number(first.id)]))) === '23514');
  check('a reason is required to void',
    (await errorCode(() => q("select * from public.invoice_void($1,'x')", [Number(second.id)]))) === '22023');
  const voided = (await q("select * from public.invoice_void($1,'raised against the wrong quote')", [Number(second.id)])).rows[0];
  check('an unpaid invoice can be voided', String(voided.status) === 'Cancelled');
  check('the void reason reaches the invoice notes', String(voided.notes).includes('wrong quote'));
  check('voiding writes an audit row',
    Number(await scalar("select count(*) from public.invoice_events where invoice_id=$1 and action='voided'", [Number(second.id)])) === 1);
  check('a cancelled invoice cannot be voided twice',
    (await errorCode(() => q("select * from public.invoice_void($1,'again')", [Number(second.id)]))) === '23514');
  check('a cancelled invoice takes no payments',
    (await errorCode(() => q('select * from public.invoice_apply_payment($1,$2)', [Number(second.id), 10]))) === '23514');

  // ── permissions ───────────────────────────────────────────────────────────
  await role('authenticated', finance);
  check('finance can record a payment', (await errorCode(() => q('select * from public.invoice_apply_payment($1,$2)', [Number(balanced.id), 50]))) === null);
  check('finance can void an unpaid invoice',
    (await errorCode(() => q("select * from public.invoice_void($1,'duplicate of the previous invoice')", [Number(balanced.id)]))) === '23514');
  await role('authenticated', editor);
  check('an editor cannot record a payment',
    (await errorCode(() => q('select * from public.invoice_apply_payment($1,$2)', [Number(first.id), 10]))) === '42501');
  check('an editor cannot void an invoice',
    (await errorCode(() => q("select * from public.invoice_void($1,'editor tries')", [Number(first.id)]))) === '42501');
  await role('authenticated', viewer);
  check('a viewer sees no invoices', Number(await scalar('select count(*) from public.invoices')) === 0);
  await role('anon');
  check('anonymous cannot record a payment',
    (await errorCode(() => q('select * from public.invoice_apply_payment($1,$2)', [Number(first.id), 10]))) === '42501');
  check('anonymous reads no payment rows', Number(await scalar('select count(*) from public.payments')) === 0);

  // ── audit trail is read-only for app roles ───────────────────────────────
  await role('authenticated', finance);
  check('finance cannot forge an invoice event',
    (await errorCode(() => q("insert into public.invoice_events(invoice_id,action) values ($1,'paid')", [Number(first.id)]))) === '42501');
  await role('authenticated', editor);
  check('an editor cannot read the invoice audit trail',
    Number(await scalar('select count(*) from public.invoice_events')) === 0);

  // ── rollback leaves the money rows alone ─────────────────────────────────
  await role('postgres');
  const beforeRollback = {
    invoices: Number(await scalar('select count(*) from public.invoices')),
    payments: Number(await scalar('select count(*) from public.payments')),
    paid: Number(await scalar('select paid from public.invoices where id=$1', [Number(first.id)])),
  };
  await db.exec(`drop trigger if exists invoice_money_guard on public.invoices;
    drop trigger if exists invoice_numbering on public.invoices;
    drop trigger if exists payments_sync_invoice on public.payments;
    drop function if exists public.invoice_paid_from_payments();
    drop function if exists public.sync_invoice_totals(integer);
    drop function if exists public.enforce_invoice_money();
    drop function if exists public.assign_invoice_ref();
    drop function if exists public.invoice_void(bigint, text);
    drop table if exists public.invoice_events;
    drop index if exists public.invoices_ref_key;`);
  check('rollback keeps the invoices and payments',
    Number(await scalar('select count(*) from public.invoices')) === beforeRollback.invoices &&
    Number(await scalar('select count(*) from public.payments')) === beforeRollback.payments);
  check('rollback keeps the derived paid value',
    Number(await scalar('select paid from public.invoices where id=$1', [Number(first.id)])) === beforeRollback.paid);
} catch (e) {
  console.log(`FAIL  invoice money suite crashed -- ${e.message}`);
  failed++;
}
console.log(`\nInvoice money integrity: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);
await db.close();
process.exit(failed ? 1 : 0);
