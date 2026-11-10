/* Isolated PGlite regression for migration 00032 (purchase-order totals guard,
   goods receiving and stock movement). Synthetic fixtures only; no hosted DB. */
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
const editor = '11111111-1111-1111-1111-111111111111';
const sales = '33333333-3333-3333-3333-333333333333';
const finance = '77777777-7777-7777-7777-777777777777';

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
    owner, 'qa.owner@example.test', editor, 'qa.editor@example.test',
    sales, 'qa.sales@example.test', finance, 'qa.finance@example.test',
  ]);
  await q("insert into public.user_roles(user_id,role) values ($1,'owner'),($2,'editor'),($3,'sales'),($4,'finance')", [owner, editor, sales, finance]);

  await role('postgres');
  await q("insert into public.suppliers(id,name) values ('sup-1','Synthetic Timber Co')");
  await q("insert into public.products(id,payload,stock_qty) values ('p-1',$1::jsonb,10),('p-2',$2::jsonb,4)",
    [JSON.stringify({ name: 'Oak panel' }), JSON.stringify({ name: 'Brass handle' })]);

  const lines = [
    { productId: 'p-1', name: 'Oak panel', qty: 10, unitCost: 500 },
    { productId: 'p-2', name: 'Brass handle', qty: 20, unitCost: 50 },
    { name: 'Assembly labour', qty: 2, unitCost: 1000 },
  ];
  const mkPo = async (id, items, total, status = 'Draft') => q(
    'insert into public.purchase_orders(id,supplier_id,status,items,total) values ($1,$2,$3,$4::jsonb,$5)',
    [id, 'sup-1', status, JSON.stringify(items), total],
  );

  // ── totals guard ─────────────────────────────────────────────────────────
  check('lines and total that agree are accepted', (await errorCode(() => mkPo('po-1', lines, 8000))) === null);
  check('a total that disagrees with the lines is refused',
    (await errorCode(() => mkPo('po-bad', lines, 7000))) === '23514');
  check('a line without a unit cost is refused',
    (await errorCode(() => mkPo('po-nocost', [{ name: 'Panel', qty: 2 }], 1000))) === '23514');
  check('a zero quantity is refused',
    (await errorCode(() => mkPo('po-zero', [{ name: 'Panel', qty: 0, unitCost: 10 }], 0))) === '23514');
  check('a negative quantity is refused',
    (await errorCode(() => mkPo('po-neg', [{ name: 'Panel', qty: -2, unitCost: 10 }], -20))) === '23514');
  check('a negative unit cost is refused',
    (await errorCode(() => mkPo('po-negcost', [{ name: 'Panel', qty: 2, unitCost: -10 }], -20))) === '23514');
  check('lines that are not an array are refused',
    (await errorCode(() => q("insert into public.purchase_orders(id,supplier_id,items,total) values ('po-shape','sup-1','{}'::jsonb,0)"))) === '23514');
  check('a purchase order cannot start as Received',
    (await errorCode(() => mkPo('po-instant', lines, 8000, 'Received'))) === '23514');
  check('changing the lines without the total is refused',
    (await errorCode(() => q("update public.purchase_orders set items=$1::jsonb where id='po-1'", [JSON.stringify(lines.slice(0, 2))]))) === '23514');
  check('changing the total without the lines is refused',
    (await errorCode(() => q("update public.purchase_orders set total=1 where id='po-1'"))) === '23514');
  check('a consistent edit of both is accepted',
    (await errorCode(() => q("update public.purchase_orders set items=$1::jsonb, total=6000 where id='po-1'", [JSON.stringify(lines.slice(0, 2))]))) === null);

  // ── sending, then receiving ──────────────────────────────────────────────
  await q("update public.purchase_orders set status='Sent' where id='po-1'");
  await role('authenticated', editor);
  const sentOk = await errorCode(() => q("select * from public.purchase_order_receive('po-1', $1::jsonb, 'partial delivery')", [
    JSON.stringify([{ line: 0, qty: 4 }]),
  ]));
  check('an editor with catalog.manage can receive goods', sentOk === null);
  const afterPartial = (await q("select * from public.purchase_orders where id='po-1'")).rows[0];
  check('a partial receipt sets the Partial status', String(afterPartial.status) === 'Partial');
  check('a partial receipt does not stamp received_at', afterPartial.received_at === null);
  check('the receipt is written to the ledger',
    Number(await scalar("select count(*) from public.purchase_order_receipts where po_id='po-1'")) === 1);
  check('the ledger stores the normalised lines',
    Number(await scalar("select (lines->0->>'qty')::numeric from public.purchase_order_receipts where po_id='po-1'")) === 4);
  check('receiving a product line raises stock',
    Number(await scalar("select stock_qty from public.products where id='p-1'")) === 14);
  check('the stock movement carries the grn reason',
    Number(await scalar("select count(*) from public.stock_movements where product_id='p-1' and reason='grn'")) === 1);
  check('the movement is traced to the purchase order',
    String(await scalar("select note from public.stock_movements where product_id='p-1'")) === 'PO po-1');

  const ln = (await q("select * from public.purchase_order_lines('po-1')")).rows;
  check('line status reports what was received', Number(ln.find((l) => l.line_index === 0).received) === 4);
  check('line status reports what is outstanding', Number(ln.find((l) => l.line_index === 0).remaining) === 6);
  check('untouched lines stay fully outstanding', Number(ln.find((l) => l.line_index === 1).remaining) === 20);

  check('over-receiving a line is refused',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-1', $1::jsonb)", [JSON.stringify([{ line: 0, qty: 99 }])]))) === '23514');
  check('a receipt for a missing line is refused',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-1', $1::jsonb)", [JSON.stringify([{ line: 7, qty: 1 }])]))) === '22023');
  check('a zero-quantity receipt is refused',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-1', $1::jsonb)", [JSON.stringify([{ line: 0, qty: 0 }])]))) === '23514');
  check('an empty receipt is refused',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-1', '[]'::jsonb)"))) === '22023');
  check('a refused receipt leaves the ledger alone',
    Number(await scalar("select count(*) from public.purchase_order_receipts where po_id='po-1'")) === 1);

  // ── the last delivery closes the order ───────────────────────────────────
  check('receiving everything outstanding is accepted',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-1')"))) === null);
  const done = (await q("select * from public.purchase_orders where id='po-1'")).rows[0];
  check('a full receipt marks the order Received', String(done.status) === 'Received');
  check('a full receipt stamps received_at', done.received_at !== null);
  check('the labour line received without touching stock',
    Number(await scalar("select stock_qty from public.products where id='p-1'")) === 10 + 10 &&
    Number(await scalar("select stock_qty from public.products where id='p-2'")) === 4 + 20);
  check('every delivery writes its own movements',
    Number(await scalar("select count(*) from public.stock_movements where reason='grn'")) === 3);
  check('a fully received order takes no more goods',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-1')"))) === '23514');

  // ── hand-set status cannot skip the paperwork ────────────────────────────
  await role('postgres');
  await mkPo('po-2', [{ name: 'Panel', qty: 5, unitCost: 100 }], 500);
  await q("update public.purchase_orders set status='Sent' where id='po-2'");
  check('marking an order Received with goods outstanding is refused',
    (await errorCode(() => q("update public.purchase_orders set status='Received' where id='po-2'"))) === '23514');

  // ── draft and cancelled orders ───────────────────────────────────────────
  await role('authenticated', editor);
  await q("insert into public.suppliers(id,name) values ('sup-2','Second Supplier') on conflict do nothing");
  await q("insert into public.purchase_orders(id,supplier_id,items,total) values ('po-3','sup-2',$1::jsonb,1000)", [JSON.stringify([{ name: 'Veneer', qty: 10, unitCost: 100 }])]);
  check('a draft purchase order cannot receive goods',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-3')"))) === '23514');
  check('cancelling needs a reason',
    (await errorCode(() => q("select * from public.purchase_order_cancel('po-3','x')"))) === '22023');
  const cancelled = (await q("select * from public.purchase_order_cancel('po-3','supplier cancelled the line')")).rows[0];
  check('a purchase order can be cancelled before goods arrive', String(cancelled.status) === 'Cancelled');
  check('the cancellation reason reaches the notes', String(cancelled.notes).includes('supplier cancelled the line'));
  check('a cancelled order cannot be cancelled twice',
    (await errorCode(() => q("select * from public.purchase_order_cancel('po-3','again and again')"))) === '23514');
  check('a cancelled order cannot receive goods',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-3')"))) === '23514');
  check('a missing purchase order is reported clearly',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-none')"))) === 'P0002');

  // ── receipts are RPC-only ────────────────────────────────────────────────
  check('a receipt ledger row cannot be forged directly',
    (await errorCode(() => q("insert into public.purchase_order_receipts(po_id,lines) values ('po-1','[]'::jsonb)"))) === '42501');
  check('the receipt ledger cannot be edited',
    (await errorCode(() => q("update public.purchase_order_receipts set note='x' where po_id='po-1'"))) === '42501');

  // ── permissions ──────────────────────────────────────────────────────────
  await role('authenticated', sales);
  check('sales cannot receive goods',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-2')"))) === '42501');
  await role('authenticated', finance);
  check('finance cannot receive goods',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-2')"))) === '42501');
  check('finance can read the receipt ledger',
    Number(await scalar("select count(*) from public.purchase_order_receipts where po_id='po-1'")) === 2);
  await role('authenticated', '99999999-9999-9999-9999-999999999999');
  check('a staff member with no procurement role cannot read the lines',
    (await errorCode(() => q("select * from public.purchase_order_lines('po-1')"))) === '42501');
  await role('anon');
  check('anonymous cannot receive goods',
    (await errorCode(() => q("select * from public.purchase_order_receive('po-2')"))) === '42501');
  check('anonymous cannot read the receipt ledger',
    (await errorCode(() => q('select count(*) from public.purchase_order_receipts'))) === '42501');

  // ── rollback leaves the orders and stock alone ───────────────────────────
  await role('postgres');
  const before = {
    pos: Number(await scalar('select count(*) from public.purchase_orders')),
    stock: Number(await scalar("select stock_qty from public.products where id='p-1'")),
    movements: Number(await scalar('select count(*) from public.stock_movements')),
  };
  await db.exec(`drop trigger if exists purchase_order_totals_guard on public.purchase_orders;
    drop function if exists public.purchase_order_receive(text, jsonb, text);
    drop function if exists public.purchase_order_cancel(text, text);
    drop function if exists public.purchase_order_lines(text);
    drop function if exists public.enforce_purchase_order_totals();
    drop table if exists public.purchase_order_receipts;`);
  check('rollback keeps the purchase orders',
    Number(await scalar('select count(*) from public.purchase_orders')) === before.pos);
  check('rollback keeps the stock levels and movements',
    Number(await scalar("select stock_qty from public.products where id='p-1'")) === before.stock &&
    Number(await scalar('select count(*) from public.stock_movements')) === before.movements);
} catch (e) {
  console.log(`FAIL  purchase order suite crashed -- ${e.message}`);
  failed++;
}
console.log(`\nPurchase order integrity: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);
await db.close();
process.exit(failed ? 1 : 0);
