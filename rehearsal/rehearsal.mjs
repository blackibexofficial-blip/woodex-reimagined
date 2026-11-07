/**
 * WOODEX · rehearsal — offline rehearsal of the Supabase migrations.
 *
 * Applies supabase/migrations 0001…NNNN to a FRESH pglite (in-memory Postgres)
 * and re-seeds from supabase/seed.sql, then asserts the RLS capability matrix
 * for the staff/money surfaces (draft orders, exchanges, claims,
 * record_order_event, singleton pages, delivery zones) plus role switching
 * through a local auth stub (`auth.users`, `auth.uid()`).
 *
 * Run: npm run test:rehearsal
 *
 * NOT a substitute for a hosted rehearsal — but it proves the DDL applies
 * clean and the cap story holds, deterministically, offline.
 * No Supabase egress is needed or used. The JWT stub is deliberately tiny
 * (`app.test_uid` GUC) and is only used here, never by the app.
 */
/**
 * @electric-sql/pglite is deliberately NOT a repo dependency: the project keeps
 * two lockfiles (bun.lock for CI installs + package-lock.json for npm tooling)
 * and the bun lock cannot be regenerated in this sandboxed authoring
 * environment. Instead the script bootstraps pglite on first run
 * (`npm install --no-save`) and reuses node_modules afterwards. CI never runs
 * this — it's a local gate (`npm run test:rehearsal`).
 */
async function loadPGlite() {
  try {
    return await import('@electric-sql/pglite');
  } catch { /* fall through to bootstrap */ }
  console.log('[rehearsal] @electric-sql/pglite missing — bootstrapping (npm --no-save)…');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '@electric-sql/pglite@^0.5.15'], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('[rehearsal] bootstrap install failed — check npm registry reachability');
    process.exit(2);
  }
  return import('@electric-sql/pglite');
}
const { PGlite } = await loadPGlite();

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGDIR = path.join(ROOT, 'supabase', 'migrations');
const MIGS = fs.readdirSync(MIGDIR).filter(f => f.endsWith('.sql')).sort();

const results = [];
const first = (r) => r?.rows?.[0] ? Object.values(r.rows[0])[0] : null;
const ok = (n, c) => { results.push([n, !!c]); console.log((c ? 'PASS' : 'FAIL') + '  ' + n); };
const asRole = async (db, roleName, uid) => { await db.exec(`set role ${roleName}`); await db.exec(`select set_config('app.test_uid', '${uid}', false)`); };

(async () => {
  const db = new PGlite();
  await db.exec(`create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid', true), '')::uuid $$;`);
  for (const f of MIGS) {
    try { await db.exec(fs.readFileSync(path.join(MIGDIR, f), 'utf8')); }
    catch (e) { console.log('MIGRATION FAIL ' + f + ': ' + e.message); process.exit(2); }
  }
  console.log(`MIGRATIONS ${MIGS[0]?.slice(0, 12)}… applied CLEAN (${MIGS.length} files)`);
  try { await db.exec(fs.readFileSync(path.join(ROOT, 'supabase/seed.sql'), 'utf8')); console.log('SEED APPLIED CLEAN'); }
  catch (e) { console.log('SEED FAIL: ' + e.message); process.exit(2); }

  const t = await db.query(`select table_name from information_schema.tables where table_schema='public' and table_name in ('draft_orders','exchanges','claims')`);
  ok('A1 all three wave tables exist', t.rows.length === 3);
  for (const tbl of ['draft_orders','exchanges','claims']) {
    const r = await db.query(`select relrowsecurity from pg_class where relname='${tbl}'`);
    ok(`RLS enabled on ${tbl}`, r.rows[0]?.relrowsecurity === true);
  }
  const d = await db.query(`insert into public.draft_orders (customer) values ('Rehearsal Draft') returning id`);
  ok('0008 draft identity starts at 1001', first(d) >= 1001);
  const e1 = await db.query(`insert into public.exchanges (customer) values ('Rehearsal Exchange') returning id`);
  ok('0009 exchange identity starts at 1001', first(e1) >= 1001);
  const c1 = await db.query(`insert into public.claims (customer, product_name, issue, type) values ('Rehearsal Claim','Teak Chair','Armrest loose','damage') returning id`);
  ok('0009 claim identity starts at 1001', first(c1) >= 1001);
  await db.exec(`delete from public.draft_orders; delete from public.exchanges; delete from public.claims;`);

  await db.exec(`
    insert into auth.users (id, email) values
      ('11111111-1111-1111-1111-111111111111','sales@example.com'),
      ('22222222-2222-2222-2222-222222222222','finance@example.com'),
      ('33333333-3333-3333-3333-333333333333','editor@example.com'),
      ('44444444-4444-4444-4444-444444444444','viewer@example.com');
    insert into public.user_roles (user_id, role) values
      ('11111111-1111-1111-1111-111111111111','sales'),
      ('22222222-2222-2222-2222-222222222222','finance'),
      ('33333333-3333-3333-3333-333333333333','editor'),
      ('44444444-4444-4444-4444-444444444444','viewer');`);
  const S = '11111111-1111-1111-1111-111111111111', F = '22222222-2222-2222-2222-222222222222', E = '33333333-3333-3333-3333-333333333333', V = '44444444-4444-4444-4444-444444444444';

  let finInsDraft = false;
  try { await asRole(db, 'authenticated', F); await db.query(`insert into public.draft_orders (customer) values ('finance intrusion')`); } catch { finInsDraft = true; }
  await db.exec('reset role');
  ok('0008 finance may NOT insert drafts', finInsDraft);

  await asRole(db, 'authenticated', S);
  const dIns = await db.query(`insert into public.draft_orders (customer, status) values ('Sec Draft','draft') returning id`);
  const dId = first(dIns);
  await db.exec('reset role');
  ok('0008 sales may insert drafts', dId >= 1001);

  await asRole(db, 'authenticated', F);
  const fUpd = await db.query(`update public.draft_orders set shipping = 0 where id = $1`, [dId]);
  const fDel = await db.query(`delete from public.draft_orders where id = $1`, [dId]);
  await db.exec('reset role');
  ok('0008 finance UPDATE affects 0 rows', (fUpd.affectedRows ?? 0) === 0);
  ok('0008 finance DELETE affects 0 rows', (fDel.affectedRows ?? 0) === 0);

  await asRole(db, 'authenticated', V);
  const vRows = await db.query(`select count(*)::int as c from public.draft_orders`);
  await db.exec('reset role');
  ok('0008 viewer sees 0 draft rows', first(vRows) === 0);

  let badDraft = false;
  try { await asRole(db, 'authenticated', S); await db.query(`insert into public.draft_orders (customer, status) values ('X','bogus')`); } catch { badDraft = true; }
  await db.exec('reset role');
  ok('0008 status CHECK rejects unknown states', badDraft);

  await asRole(db, 'authenticated', S);
  const eIns = await db.query(`insert into public.exchanges (customer, status) values ('Sec Exchange','requested') returning id`);
  const eId = first(eIns);
  await db.exec(`set role authenticated; select set_config('app.test_uid', '${S}', false)`);
  const adv = await db.query(`update public.exchanges set status = 'approved' where id = $1`, [eId]);
  const advRows = adv.affectedRows ?? 0;
  await db.exec('reset role');
  ok('0009 sales insert + status advance works', eId >= 1001 && advRows === 1);

  await asRole(db, 'authenticated', F);
  const fExUpd = await db.query(`update public.exchanges set difference_settled = false where id = $1`, [eId]);
  await db.exec('reset role');
  ok('0009 finance UPDATE affects 0 rows', (fExUpd.affectedRows ?? 0) === 0);

  let finExIns = false;
  try { await asRole(db, 'authenticated', F); await db.query(`insert into public.exchanges (customer) values ('finance intrusion')`); } catch { finExIns = true; }
  await db.exec('reset role');
  ok('0009 finance may NOT insert exchanges', finExIns);

  await asRole(db, 'authenticated', S);
  const cIns = await db.query(`insert into public.claims (customer, product_name, issue, type) values ('Sec Claim','Teak Chair','Armrest loose','damage') returning id`);
  const cId = first(cIns);
  await db.exec('reset role');
  ok('0009 sales may insert claims', cId >= 1001);

  let badClaim = false;
  try { await asRole(db, 'authenticated', S); await db.query(`insert into public.claims (customer, product_name, issue, type) values ('X','P','nope','cosmic')`); } catch { badClaim = true; }
  await db.exec('reset role');
  ok('0009 claim type CHECK rejects unknown types', badClaim);

  let finClIns = false;
  try { await asRole(db, 'authenticated', F); await db.query(`insert into public.claims (customer, product_name, issue, type) values ('finance intrusion','P','nope','damage')`); } catch { finClIns = true; }
  await db.exec('reset role');
  ok('0009 finance may NOT insert claims', finClIns);

  const o = await db.query(`insert into public.orders (customer, items) values ('Rehearsal Order','[]'::jsonb) returning id`);
  const oId = first(o);
  await asRole(db, 'authenticated', S);
  await db.query(`select public.record_order_event($1, 'Rehearsal note via RPC', 'note')`, [oId]);
  await db.exec('reset role');
  const evCount = await db.query(`select count(*)::int as c from public.order_events where order_id = $1 and note like 'Rehearsal%'`, [oId]);
  ok('0009 record_order_event appends for order.manage', first(evCount) === 1);

  let finEv = false;
  try { await asRole(db, 'authenticated', F); await db.query(`select public.record_order_event($1, 'finance must not', 'note')`, [oId]); } catch { finEv = true; }
  await db.exec('reset role');
  ok('0009 record_order_event denies finance', finEv);

  let anonEv = false;
  try { await asRole(db, 'anon', V); await db.query(`select public.record_order_event($1, 'anon must not', 'note')`, [oId]); } catch { anonEv = true; }
  await db.exec('reset role');
  ok('0009 record_order_event denied for anon', anonEv);

  let directIns = false;
  try { await asRole(db, 'authenticated', S); await db.query(`insert into public.order_events (order_id, kind, note) values ($1, 'note', 'direct insert should fail')`, [oId]); } catch { directIns = true; }
  await db.exec('reset role');
  ok('order_events direct INSERT denied for authenticated', directIns);

  await asRole(db, 'authenticated', E);
  await db.query(`insert into public.warranty_page (id, content) values ('warranty', $1::jsonb) on conflict (id) do update set content = excluded.content`, [JSON.stringify({ hero: { title: 'Rehearsal warranty' }, steps: [] })]);
  const rt = await db.query(`select content->'hero'->>'title' as t from public.warranty_page where id = 'warranty'`);
  await db.exec('reset role');
  ok('Wave 3 singleton upsert+read roundtrip (page.manage)', first(rt) === 'Rehearsal warranty');

  await asRole(db, 'authenticated', S);
  const salesUpd = await db.query(`update public.warranty_page set content = '{}'::jsonb where id = 'warranty'`);
  await db.exec('reset role');
  ok('Wave 3 sales without page.manage updates 0 rows', (salesUpd.affectedRows ?? 0) === 0);
  await db.exec(`delete from public.warranty_page where id = 'warranty'`);

  const zones = await db.query(`select count(*)::int as c from public.delivery_zones`);
  ok('0007 delivery zones seeded (>=13 rows)', first(zones) >= 13);

  // ── 0010 convert_draft_order ───────────────────────────────────────────
  await db.exec(`insert into public.products (id, payload, price, stock_qty, sku, in_stock)
    values ('test-convert-chair', '{"name":"Test Convert Chair"}'::jsonb, 1000, 5, 'TEST-001', true)
    on conflict (id) do update set payload = excluded.payload, price = 1000, stock_qty = 5, in_stock = true`);

  await asRole(db, 'authenticated', S);
  const mk = await db.query(`insert into public.draft_orders (customer, city, items, shipping) values ('Convert Me', 'lahore', $1::jsonb, 2500) returning id`,
    [JSON.stringify([{ id: 'test-convert-chair', name: 'Test Convert Chair', price: 1, quantity: 2 }, { id: null, name: 'Mystery line', price: 99, quantity: 1 }])]);
  const cnvId = first(mk);
  await db.exec('reset role');

  let convFail = false;
  try { await asRole(db, 'authenticated', S); await db.query(`select public.convert_draft_order($1::bigint)`, [cnvId]); } catch { convFail = true; }
  await db.exec('reset role');
  ok('0010: freehand line without override aborts the conversion', convFail);
  const cnv1 = await db.query(`select status from public.draft_orders where id = $1`, [cnvId]);
  ok('0010: aborted conversion leaves the draft untouched', first(cnv1) === 'draft');
  const stockAfterFail = await db.query(`select stock_qty from public.products where id = 'test-convert-chair'`);
  ok('0010: aborted conversion does not decrement stock', first(stockAfterFail) === 5);

  await db.exec(`update public.products set stock_qty = 1 where id = 'test-convert-chair'`);
  let stockShort = false;
  try { await asRole(db, 'authenticated', S); await db.query(`select public.convert_draft_order($1::bigint)`, [cnvId]); } catch { stockShort = true; }
  await db.exec('reset role');
  ok('0010: stock shortfall aborts the whole conversion', stockShort);
  const stockShortAfter = await db.query(`select stock_qty from public.products where id = 'test-convert-chair'`);
  ok('0010: stock shortfall rolls back completely', first(stockShortAfter) === 1);
  await db.exec(`update public.products set stock_qty = 5 where id = 'test-convert-chair'`);

  let finDenied = false;
  try { await asRole(db, 'authenticated', F); await db.query(`select public.convert_draft_order($1::bigint)`, [cnvId]); } catch { finDenied = true; }
  await db.exec('reset role');
  ok('0010: finance may NOT convert (order.manage required)', finDenied);

  await asRole(db, 'authenticated', S);
  const conv = await db.query(`select public.convert_draft_order($1::bigint, $2::jsonb, $3)`, [cnvId, JSON.stringify([{ line: 1, price: 777 }]), 'cod']);
  await db.exec('reset role');
  const convRow = conv.rows[0]?.convert_draft_order ?? conv.rows[0];
  const convObj = typeof convRow === 'string' ? JSON.parse(convRow) : convRow;
  ok('0010: conversion succeeds with negotiated override', convObj?.ok === true && typeof convObj?.ref === 'string');
  const ref = convObj?.ref;
  const dAfter = await db.query(`select status, converted_order_id from public.draft_orders where id = $1`, [cnvId]);
  ok('0010: draft flips to converted atomically', dAfter.rows[0]?.status === 'converted' && typeof dAfter.rows[0]?.converted_order_id === 'string');
  const orderRow = await db.query(`select items, shipping, subtotal, total from public.orders where ref = $1`, [ref]);
  const itemsOut = orderRow.rows[0]?.items ?? [];
  ok('0010: catalogue lines reprice to current catalogue price', itemsOut?.[0]?.price === 1000);
  ok('0010: negotiated override is applied + flagged', itemsOut?.[1]?.price === 777 && itemsOut?.[1]?.negotiated === true);
  ok('0010: order has zone shipping (lahore, subtotal below free threshold)', Number(orderRow.rows[0]?.shipping) === 2500);
  ok('0010: subtotal/total computed from authoritative prices', Number(orderRow.rows[0]?.subtotal) === 2777 && Number(orderRow.rows[0]?.total) === 5277);
  const stockFinal = await db.query(`select stock_qty from public.products where id = 'test-convert-chair'`);
  ok('0010: catalogue line stock decremented (5 → 3)', first(stockFinal) === 3);
  const replay = await db.query(`select public.convert_draft_order($1::bigint)`, [cnvId]);
  const replayRow = replay.rows[0]?.convert_draft_order ?? replay.rows[0];
  const replayObj = typeof replayRow === 'string' ? JSON.parse(replayRow) : replayRow;
  ok('0010: replay returns already-converted with the original ref', replayObj?.reason === 'already-converted' && replayObj?.orderRef === ref);
  const evCount2 = await db.query(`select count(*)::int as c from public.order_events where order_id = (select id from public.orders where ref = $1) and kind = 'stage:intake' and note like 'Converted from draft%'`, [ref]);
  ok('0010: conversion journaled in order_events with negotiated audit', first(evCount2) === 1);

  const pass = results.filter(r => r[1]).length, fail = results.length - pass;
  console.log(`\nFRESH REHEARSAL (test:rehearsal): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
