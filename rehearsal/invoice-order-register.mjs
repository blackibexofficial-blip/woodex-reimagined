/* Isolated PGlite regression for migration 00031 (invoice from an order +
   receivables register). Synthetic fixtures only; no hosted project. */
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
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString(); };

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

  await role('postgres');
  const mkOrder = async (customer, subtotal, discount, shipping, total, due = null) => (await q(
    "insert into public.orders(customer,items,subtotal,discount_amount,shipping,total,due) values ($1,'[]'::jsonb,$2,$3,$4,$5,$6) returning *",
    [customer, subtotal, discount, shipping, total, due],
  )).rows[0];

  const paidOrder = await mkOrder('Synthetic paid job', 2000, 100, 50, 2100, day(7));
  const overOrder = await mkOrder('Synthetic overdue job', 1500, 0, 0, 1500, day(-10));
  const soonOrder = await mkOrder('Synthetic due-soon job', 900, 0, 0, 900, day(3));
  const zeroOrder = await mkOrder('Synthetic zero job', 0, 0, 0, 0);
  const upsideOrder = await mkOrder('Synthetic broken job', 1000, 0, 0, 500);

  // ── invoice_from_order ────────────────────────────────────────────────────
  await role('authenticated', finance);
  const inv1 = (await q('select * from public.invoice_from_order($1)', [Number(paidOrder.id)])).rows[0];
  check('an order raises an invoice', Number(inv1.order_id) === Number(paidOrder.id));
  check('the invoice carries the customer', String(inv1.customer) === 'Synthetic paid job');
  check('the invoice matches the order total', Number(inv1.total) === 2100);
  check('the residual rides as tax so the arithmetic balances',
    Number(inv1.subtotal) - Number(inv1.discount) + Number(inv1.tax) + Number(inv1.shipping) === Number(inv1.total));
  check('the tax residual is exactly the order total minus its own parts', Number(inv1.tax) === 150);
  check('the invoice is issued, not paid', String(inv1.status) === 'Issued' && Number(inv1.paid) === 0);
  check('the invoice inherits the order due date', inv1.due !== null);
  const inv1again = (await q('select * from public.invoice_from_order($1)', [Number(paidOrder.id)])).rows[0];
  check('a second call returns the same invoice', Number(inv1again.id) === Number(inv1.id));
  check('only one invoice exists for the order',
    Number(await scalar('select count(*) from public.invoices where order_id=$1', [Number(paidOrder.id)])) === 1);
  check('raising an invoice writes an invoice event',
    Number(await scalar("select count(*) from public.invoice_events where invoice_id=$1 and action='created'", [Number(inv1.id)])) === 1);
  check('the order timeline records the invoice',
    Number(await scalar("select count(*) from public.order_events where order_id=$1 and kind='invoiced'", [Number(paidOrder.id)])) === 1);

  check('an order with nothing to bill is refused',
    (await errorCode(() => q('select * from public.invoice_from_order($1)', [Number(zeroOrder.id)]))) === '23514');
  check('an order whose total is below its own parts is refused',
    (await errorCode(() => q('select * from public.invoice_from_order($1)', [Number(upsideOrder.id)]))) === '23514');
  check('a missing order is reported clearly',
    (await errorCode(() => q('select * from public.invoice_from_order($1)', [999999]))) === 'P0002');
  check('no invoice exists for the refused orders',
    Number(await scalar('select count(*) from public.invoices where order_id in ($1,$2)', [Number(zeroOrder.id), Number(upsideOrder.id)])) === 0);

  // ── register ──────────────────────────────────────────────────────────────
  const invOver = (await q('select * from public.invoice_from_order($1)', [Number(overOrder.id)])).rows[0];
  const invSoon = (await q('select * from public.invoice_from_order($1)', [Number(soonOrder.id)])).rows[0];
  await q('select * from public.invoice_apply_payment($1,$2)', [Number(inv1.id), 2100]);

  const rows = (await q('select * from public.invoice_register(30)')).rows;
  const byId = (id) => rows.find((r) => Number(r.invoice_id) === Number(id));
  check('the register lists every invoice', rows.length === 3);
  check('a settled invoice reads as paid', byId(inv1.id)?.state === 'paid');
  check('a settled invoice has no balance', Number(byId(inv1.id)?.balance) === 0);
  check('an invoice past its due date reads as overdue', byId(invOver.id)?.state === 'overdue');
  check('overdue days are counted', Number(byId(invOver.id)?.days_overdue) === 10);
  check('an invoice due inside the window reads as due soon', byId(invSoon.id)?.state === 'due soon');
  check('days to due are counted', Number(byId(invSoon.id)?.days_to_due) === 3);
  check('the balance is the outstanding amount', Number(byId(invOver.id)?.balance) === 1500);
  check('overdue rows sort before due-soon rows', Number(rows[0].invoice_id) === Number(invOver.id));
  check('paid rows sort last', Number(rows[rows.length - 1].invoice_id) === Number(inv1.id));
  check('a zero-day window stops calling anything due soon',
    (await q('select * from public.invoice_register(0)')).rows.find((r) => Number(r.invoice_id) === Number(invSoon.id))?.state === 'open');
  check('the window is bounded rather than trusted',
    (await errorCode(() => q('select * from public.invoice_register(100000)'))) === null);
  check('the register carries the order the invoice came from', Number(byId(invOver.id)?.order_id) === Number(overOrder.id));

  // ── permissions ───────────────────────────────────────────────────────────
  await role('authenticated', editor);
  check('an editor cannot raise an invoice',
    (await errorCode(() => q('select * from public.invoice_from_order($1)', [Number(soonOrder.id)]))) === '42501');
  check('an editor cannot read the receivables register',
    (await errorCode(() => q('select * from public.invoice_register(30)'))) === '42501');
  await role('authenticated', viewer);
  check('a viewer cannot read the receivables register',
    (await errorCode(() => q('select * from public.invoice_register(30)'))) === '42501');
  await role('anon');
  check('anonymous cannot raise an invoice',
    (await errorCode(() => q('select * from public.invoice_from_order($1)', [Number(soonOrder.id)]))) === '42501');
  check('anonymous cannot read the register',
    (await errorCode(() => q('select * from public.invoice_register(30)'))) === '42501');

  await role('authenticated', owner);
  check('an owner can raise an invoice', (await errorCode(() => q('select * from public.invoice_from_order($1)', [Number(upsideOrder.id)]))) === '23514');

  // ── a cancelled invoice can be replaced ──────────────────────────────────
  await role('authenticated', finance);
  await q("select * from public.invoice_void($1,'raised against the wrong order terms')", [Number(invSoon.id)]);
  const replacement = (await q('select * from public.invoice_from_order($1)', [Number(soonOrder.id)])).rows[0];
  check('a cancelled invoice does not block a new one for the same order', Number(replacement.id) !== Number(invSoon.id));
  check('the cancelled invoice still reads as cancelled in the register',
    (await q('select * from public.invoice_register(30)')).rows.find((r) => Number(r.invoice_id) === Number(invSoon.id))?.state === 'cancelled');

  // ── rollback leaves invoices in place ────────────────────────────────────
  await role('postgres');
  const before = Number(await scalar('select count(*) from public.invoices'));
  await db.exec(`drop function if exists public.invoice_register(integer);
    drop function if exists public.invoice_from_order(bigint);`);
  check('rollback keeps every invoice', Number(await scalar('select count(*) from public.invoices')) === before);
} catch (e) {
  console.log(`FAIL  invoice order suite crashed -- ${e.message}`);
  failed++;
}
console.log(`\nInvoice from order + register: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);
await db.close();
process.exit(failed ? 1 : 0);
