/* Isolated PGlite regression for procurement read policies. Never connects to Supabase. */
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
function check(name, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (condition) passed++; else failed++;
}
async function denied(fn) {
  try { await fn(); return false; } catch (e) { return e.code === '42501'; }
}
async function role(name, uid = '') {
  await db.exec(`reset role; select set_config('app.test_uid', '${uid}', false); set role ${name}`);
}
const q = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) => Object.values((await q(sql, args)).rows[0] ?? {})[0];

try {
  await db.exec(`create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid', true), '')::uuid$$;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner text, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
    alter table storage.objects enable row level security;`);
  const migdir = path.join(ROOT, 'supabase/migrations');
  for (const file of fs.readdirSync(migdir).filter(f => f.endsWith('.sql')).sort()) {
    try { await db.exec(fs.readFileSync(path.join(migdir, file), 'utf8')); }
    catch (e) { throw new Error(`${file}: ${e.message}`); }
  }
  const roleNames = ['owner','editor','sales','finance','viewer'];
  const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  for (let i = 0; i < roleNames.length; i++) {
    await q('insert into auth.users(id,email) values ($1,$2)', [uid(i+1),`${roleNames[i]}@example.test`]);
    await q('insert into public.user_roles(user_id,role) values ($1,$2)', [uid(i+1),roleNames[i]]);
  }
  await db.exec(`insert into public.products(id,payload,price,stock_qty) values ('proc-test-product','{"name":"Synthetic"}',100,10);
    insert into public.suppliers(id,name,payload) values ('proc-supplier','Synthetic supplier','{"privateNote":"internal"}');
    insert into public.purchase_orders(id,supplier_id,items,total,notes) values ('proc-po','proc-supplier','[]',200,'synthetic cost');
    insert into public.stock_movements(product_id,delta,reason,note) values ('proc-test-product',1,'inbound','synthetic movement');`);
  const tables = ['suppliers','purchase_orders','stock_movements'];
  for (let i = 0; i < roleNames.length; i++) {
    await role('authenticated',uid(i+1));
    const allowed = roleNames[i] !== 'viewer';
    check(`${roleNames[i]} capability = ${allowed}`, await scalar('select public.procurement_read_allowed()') === allowed);
    for (const table of tables) {
      check(`${roleNames[i]} ${table} read ${allowed ? 'allowed' : 'hidden'}`, Number(await scalar(`select count(*) from public.${table}`)) === (allowed ? 1 : 0));
    }
    check(`${roleNames[i]} joined PO supplier is ${allowed ? 'visible' : 'hidden'}`, Number(await scalar(`select count(*) from public.purchase_orders p join public.suppliers s on s.id=p.supplier_id where s.payload->>'privateNote'='internal'`)) === (allowed ? 1 : 0));
  }
  await role('authenticated',uid(99));
  check('unassigned account has no read capability', await scalar('select public.procurement_read_allowed()') === false);
  for (const table of tables) check(`unassigned account cannot read ${table}`, Number(await scalar(`select count(*) from public.${table}`)) === 0);
  await role('anon');
  check('anonymous cannot execute permission helper', await denied(() => q('select public.procurement_read_allowed()')));
  for (const table of tables) {
    let hidden = false;
    try { hidden = Number(await scalar(`select count(*) from public.${table}`)) === 0; } catch (e) { hidden = e.code === '42501'; }
    check(`anonymous cannot read ${table}`, hidden);
  }
  await role('authenticated',uid(4));
  let financeInsertDenied = false;
  try { await q("insert into public.suppliers(id,name) values ('no-finance-write','No')"); } catch (e) { financeInsertDenied = e.code === '42501'; }
  check('finance read does not grant supplier writes', financeInsertDenied);
  await role('authenticated',uid(3));
  let salesInsertDenied = false;
  try { await q("insert into public.suppliers(id,name) values ('no-sales-write','No')"); } catch (e) { salesInsertDenied = e.code === '42501'; }
  check('sales read does not grant supplier writes', salesInsertDenied);
  await role('authenticated',uid(2));
  await q("insert into public.suppliers(id,name) values ('editor-supplier','Editor supplier')");
  await q("insert into public.purchase_orders(id,supplier_id,items) values ('editor-po','editor-supplier','[]')");
  await q("select public.inventory_apply('proc-test-product',1,'inbound','editor test')");
  check('editor can still create suppliers, POs and stock movements', Number(await scalar("select count(*) from public.suppliers where id='editor-supplier'")) === 1 && Number(await scalar("select count(*) from public.purchase_orders where id='editor-po'")) === 1 && Number(await scalar('select count(*) from public.stock_movements')) === 2);
  await role('authenticated',uid(3));
  await q(`insert into public.quotes(customer,items,status) values ('Synthetic', '[{"id":"proc-test-product","name":"Test","quantity":1,"price":100}]','accepted')`);
  const quoteId = await scalar("select max(id) from public.quotes where customer='Synthetic'");
  const conversion = await scalar('select public.quote_convert($1)', [String(quoteId)]);
  check('sales quote conversion can still write stock via trusted RPC', conversion?.ok === true && Number(await scalar('select count(*) from public.stock_movements')) === 3);
  await db.exec('reset role');
  await q("update public.user_roles set role='viewer' where user_id=$1", [uid(3)]);
  await role('authenticated',uid(3));
  check('sales-to-viewer revocation applies on next query', await scalar('select public.procurement_read_allowed()') === false && Number(await scalar('select count(*) from public.suppliers')) === 0);
  console.log(`\n${passed} passed, ${failed} failed (local PGlite; hosted verification required)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await db.close(); }
