/* Isolated PGlite regression for Phase 1 Phase 1 workflows. Never connects to Supabase. */
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
  const owner = '11111111-1111-1111-1111-111111111111';
  const editor = '22222222-2222-2222-2222-222222222222';
  const sales = '33333333-3333-3333-3333-333333333333';
  const viewer = '44444444-4444-4444-4444-444444444444';
  await db.exec(`insert into auth.users(id,email) values ('${owner}','owner@example.test'),('${editor}','editor@example.test'),('${sales}','sales@example.test'),('${viewer}','viewer@example.test');
    insert into public.user_roles(user_id,role) values ('${owner}','owner'),('${editor}','editor'),('${sales}','sales'),('${viewer}','viewer');
    insert into public.pages(slug,title) values ('permission-test','Test page');
    insert into public.products(id,payload,price,stock_qty) values ('phase1-product','{"name":"Test"}',100,10);`);
  const pageId = await scalar("select id from public.pages where slug='permission-test'");
  for (const [name, uid, expected] of [['owner',owner,true],['editor',editor,true],['sales',sales,false],['viewer',viewer,false],['unassigned','55555555-5555-5555-5555-555555555555',false]]) {
    await role('authenticated', uid);
    check(`${name} page.manage capability = ${expected}`, await scalar("select public.has_cap('page.manage')") === expected);
    if (expected) {
      await q('select public.page_publish($1,true)', [pageId]);
      await q('select public.page_publish($1,false)', [pageId]);
      check(`${name} can publish and unpublish`, true);
    } else check(`${name} denied publish`, await denied(() => q('select public.page_publish($1,true)', [pageId])));
  }
  await role('anon');
  check('anonymous cannot publish', await denied(() => q('select public.page_publish($1,true)', [pageId])));
  await db.exec('reset role');
  const statuses = ['draft','review','approval','sent','revised','declined','accepted','converted'];
  const ids = {};
  for (const status of statuses) {
    ids[status] = await scalar(`insert into public.quotes(customer,items,status,details) values ('Synthetic', '[{"id":"phase1-product","name":"Test","quantity":2,"price":100}]', $1, '{"discountPct":10,"shipping":5}') returning id`, [status]);
  }
  await role('authenticated', viewer);
  check('viewer cannot convert even accepted quote', await denied(() => q('select public.quote_convert($1)', [String(ids.accepted)])));
  await role('authenticated', editor);
  check('editor cannot convert even accepted quote', await denied(() => q('select public.quote_convert($1)', [String(ids.accepted)])));
  await role('anon');
  check('anonymous cannot convert accepted quote', await denied(() => q('select public.quote_convert($1)', [String(ids.accepted)])));
  await role('authenticated', sales);
  for (const status of statuses.slice(0,6)) {
    const result = await scalar('select public.quote_convert($1)', [String(ids[status])]);
    check(`${status} conversion rejected`, result?.ok === false && result.reason === 'not-accepted');
  }
  await db.exec('reset role');
  check('rejected conversions create no orders, events, or movements', Number(await scalar('select count(*) from public.orders')) === 0 && Number(await scalar('select count(*) from public.order_events')) === 0 && Number(await scalar('select count(*) from public.stock_movements')) === 0);
  check('rejected conversions leave stock, status, audit and version unchanged', Number(await scalar("select stock_qty from public.products where id='phase1-product'")) === 10 && Number(await scalar("select count(*) from public.quotes where status in ('draft','review','approval','sent','revised','declined') and version=1 and audit='[]'::jsonb")) === 6);
  await role('authenticated', sales);
  const result = await scalar('select public.quote_convert($1)', [String(ids.accepted)]);
  check('sales converts accepted quote with negotiated totals', result?.ok === true && Number(result.subtotal) === 200 && Number(result.total) === 185 && Number(result.discountAmount) === 20);
  const replay = await scalar('select public.quote_convert($1)', [String(ids.accepted)]);
  check('converted replay returns existing order reference', replay?.reason === 'already-converted' && replay.orderRef === result.ref);
  const priorConverted = await scalar('select public.quote_convert($1)', [String(ids.converted)]);
  check('existing converted quote remains replay, not new conversion', priorConverted?.reason === 'already-converted');
  await db.exec('reset role');
  check('accepted conversion creates one order, event and stock movement', Number(await scalar('select count(*) from public.orders')) === 1 && Number(await scalar('select count(*) from public.order_events')) === 1 && Number(await scalar('select count(*) from public.stock_movements')) === 1);
  check('accepted conversion deducts stock once and updates quote', Number(await scalar("select stock_qty from public.products where id='phase1-product'")) === 8 && await scalar('select status from public.quotes where id=$1', [ids.accepted]) === 'converted' && Number(await scalar('select version from public.quotes where id=$1', [ids.accepted])) === 2);
  const insufficient = await scalar(`insert into public.quotes(customer,items,status) values ('Synthetic', '[{"id":"phase1-product","name":"Test","quantity":1,"price":100},{"id":"phase1-product","name":"Test","quantity":99,"price":100}]', 'accepted') returning id`);
  await role('authenticated', sales);
  let outOfStock = false;
  try { await q('select public.quote_convert($1)', [String(insufficient)]); } catch (e) { outOfStock = /out of stock/.test(e.message); }
  await db.exec('reset role');
  check('out-of-stock conversion rolls back without order or stock changes', outOfStock && Number(await scalar('select count(*) from public.orders')) === 1 && Number(await scalar('select count(*) from public.stock_movements')) === 1 && Number(await scalar("select stock_qty from public.products where id='phase1-product'")) === 8 && await scalar('select status from public.quotes where id=$1', [insufficient]) === 'accepted');
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await db.close(); }
