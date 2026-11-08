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
  // Storage stub — mirrors the subset of Supabase Storage's built-in schema our migration touches.
  await db.exec(`create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id) on delete cascade, name text not null, owner text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), metadata jsonb, unique (bucket_id, name));
    alter table storage.objects enable row level security;`);
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

  // ── 0011 compare_at_in_payload ─────────────────────────────────────────
  await asRole(db, 'authenticated', E);
  await db.query(`select public.product_update_payload('test-convert-chair', '{"compareAtPrice": 1500}'::jsonb)`);
  await db.exec('reset role');
  const pl1 = await db.query(`select payload->>'compareAtPrice' as v from public.products where id = 'test-convert-chair'`);
  ok('0011: compareAtPrice rides the document RPC (1500)', pl1.rows[0]?.v === '1500');

  await asRole(db, 'authenticated', E);
  await db.query(`select public.product_update_payload('test-convert-chair', '{"compareAtPrice": null}'::jsonb)`);
  await db.exec('reset role');
  const pl2 = await db.query(`select payload->'compareAtPrice' as v from public.products where id = 'test-convert-chair'`);
  ok('0011: compareAtPrice clears with JSON null', pl2.rows[0]?.v === null);

  let priceRejected = false;
  try { await asRole(db, 'authenticated', E); await db.query(`select public.product_update_payload('test-convert-chair', '{"price": 5}'::jsonb)`); } catch { priceRejected = true; }
  await db.exec('reset role');
  ok('0011: price stays RPC-only (document path still rejected)', priceRejected);

  let badCompareAt = false;
  try { await asRole(db, 'authenticated', E); await db.query(`select public.product_update_payload('test-convert-chair', '{"compareAtPrice": "not-a-number"}'::jsonb)`); } catch { badCompareAt = true; }
  await db.exec('reset role');
  ok('0011: compareAtPrice must be a non-negative number or null', badCompareAt);

  let salesDenied = false;
  try { await asRole(db, 'authenticated', S); await db.query(`select public.product_update_payload('test-convert-chair', '{"compareAtPrice": 1500}'::jsonb)`); } catch { salesDenied = true; }
  await db.exec('reset role');
  ok('0011: sales may NOT merge product payload (catalog.manage required)', salesDenied);

  // ── quotation platform (0001 quote tables + quote.manage) ──────────────
  await asRole(db, 'authenticated', S);
  await db.query(`insert into public.quote_templates (id, name, template) values ('rehearsal-tpl', 'Rehearsal', $1::jsonb) on conflict (id) do update set template = excluded.template`, [JSON.stringify({ brandColor: '#318b45', header: [], footer: [] })]);
  await db.exec('reset role');
  const tplRead = await db.query(`select count(*)::int as c from public.quote_templates where id = 'rehearsal-tpl'`);
  ok('quotation: sales may upsert + read a template (quote.manage)', first(tplRead) === 1);

  let editorTplWritten = false;
  try { await asRole(db, 'authenticated', E); await db.query(`insert into public.quote_templates (id, name, template) values ('rehearsal-tpl-2', 'Nope', '{}'::jsonb)`); editorTplWritten = true; } catch { /* denied */ }
  await db.exec('reset role');
  ok('quotation: editor may NOT write templates (quote.manage required)', editorTplWritten === false);

  await asRole(db, 'authenticated', V);
  const verViewer = await db.query(`select count(*)::int as c from public.quote_versions`);
  await db.exec('reset role');
  ok('quotation: viewer sees 0 version rows (quote.manage required)', first(verViewer) === 0);

  const qIns = await db.query(`insert into public.quotes (customer, items) values ('Rehearsal Customer', '[]'::jsonb) returning id`);
  const qId = first(qIns);
  await asRole(db, 'authenticated', S);
  await db.query(`insert into public.quote_versions (quote_id, version, snapshot, action) values ($1, 1, $2::jsonb, 'create')`, [qId, JSON.stringify({ items: [], total: 0, status: 'draft' })]);
  await db.exec('reset role');
  const verSales = await db.query(`select count(*)::int as c from public.quote_versions where quote_id = $1`, [qId]);
  ok('quotation: sales may record a version snapshot', first(verSales) === 1);

  // ── invoice ledger (0001 invoices/payments + RPCs) ─────────────────────
  const qInvIns = await db.query(`insert into public.quotes (customer, items, total) values ('Invoice Rehearsal', '[]'::jsonb, 50000) returning id`);
  const qInvId = first(qInvIns);
  await asRole(db, 'authenticated', S);
  await db.query(`select public.quote_invoice_snapshot($1::bigint)`, [qInvId]);
  await db.exec('reset role');
  const invLookup = await db.query(`select id, status, paid::int as paid from public.invoices where quote_id = $1`, [qInvId]);
  ok('invoice: sales may snapshot a quote to an Issued invoice', invLookup.rows.length === 1 && invLookup.rows[0]?.status === 'Issued');
  const invPk = invLookup.rows[0]?.id;

  await asRole(db, 'authenticated', S);
  await db.query(`select public.quote_invoice_snapshot($1::bigint)`, [qInvId]);
  await db.exec('reset role');
  const invReplay = await db.query(`select count(*)::int as c from public.invoices where quote_id = $1`, [qInvId]);
  ok('invoice: snapshot is idempotent (replay keeps one invoice)', first(invReplay) === 1);

  let salesPay = false;
  try { await asRole(db, 'authenticated', S); await db.query(`select public.invoice_apply_payment($1::bigint, 50000, 'Bank transfer', 'TX-R1')`, [invPk]); salesPay = true; } catch { /* denied */ }
  await db.exec('reset role');
  ok('invoice: sales may NOT post a payment (finance.manage required)', salesPay === false);

  await asRole(db, 'authenticated', F);
  await db.query(`select public.invoice_apply_payment($1::bigint, 20000, 'Bank transfer', 'TX-R2')`, [invPk]);
  await db.exec('reset role');
  const invPart = await db.query(`select status, paid::int as paid from public.invoices where quote_id = $1`, [qInvId]);
  ok('invoice: partial payment flips Issued → Partially paid', invPart.rows[0]?.status === 'Partially paid' && Number(invPart.rows[0]?.paid) === 20000);

  await asRole(db, 'authenticated', F);
  await db.query(`select public.invoice_apply_payment($1::bigint, 30000, 'Bank transfer', 'TX-R3')`, [invPk]);
  await db.exec('reset role');
  const invPaid = await db.query(`select status from public.invoices where quote_id = $1`, [qInvId]);
  ok('invoice: full payment flips Partially paid → Paid', invPaid.rows[0]?.status === 'Paid');

  await asRole(db, 'authenticated', V);
  const invViewer = await db.query(`select count(*)::int as c from public.invoices where quote_id = $1`, [qInvId]);
  await db.exec('reset role');
  ok('invoice: viewer sees 0 invoice rows (quote.manage/finance.manage required)', first(invViewer) === 0);

  // ── tasks (0001 tasks table; crm.manage only, NO delete policy) ─────────
  await asRole(db, 'authenticated', S);
  await db.query(`insert into public.tasks (client_id, title, due, owner, priority) values (null, 'Rehearsal follow-up', now() + interval '1 day', 'You', 'normal')`);
  await db.exec('reset role');
  const taskSales = await db.query(`select count(*)::int as c from public.tasks where title = 'Rehearsal follow-up'`);
  ok('tasks: sales may create a task and read it back', first(taskSales) === 1);

  await asRole(db, 'authenticated', V);
  const taskViewer = await db.query(`select count(*)::int as c from public.tasks where title = 'Rehearsal follow-up'`);
  await db.exec('reset role');
  ok('tasks: viewer sees 0 task rows (crm.manage required)', first(taskViewer) === 0);

  let editorTask = false;
  try { await asRole(db, 'authenticated', E); await db.query(`insert into public.tasks (title) values ('Editor attempt')`); editorTask = true; } catch { /* denied */ }
  await db.exec('reset role');
  ok('tasks: editor may NOT create a task (lacks crm.manage)', editorTask === false);

  // ── admin_overview (0001 RPC; open-quote casing fixed by 0012) ─────────
  await asRole(db, 'authenticated', S);
  const ovBefore = (await db.query(`select (public.admin_overview()->>'open_quotes')::int as openq, (public.admin_overview()->>'pipeline_value')::numeric as pv`)).rows[0];
  await db.query(`insert into public.quotes (customer, items, total, status) values
    ('Overview Rehearsal A', '[]'::jsonb, 10000, 'draft'),
    ('Overview Rehearsal B', '[]'::jsonb, 20000, 'review'),
    ('Overview Rehearsal C', '[]'::jsonb, 40000, 'sent'),
    ('Overview Rehearsal D', '[]'::jsonb, 80000, 'converted')`);
  const ovAfter = (await db.query(`select (public.admin_overview()->>'open_quotes')::int as openq, (public.admin_overview()->>'pipeline_value')::numeric as pv`)).rows[0];
  await db.exec('reset role');
  ok('overview: open_quotes counts app-written lowercase statuses (draft/review/sent; converted excluded)', ovAfter.openq - ovBefore.openq === 3);
  ok('overview: pipeline_value moves by the same open set (10000+20000+40000)', Number(ovAfter.pv) - Number(ovBefore.pv) === 70000);

  let viewerOverview = false;
  try { await asRole(db, 'authenticated', V); await db.query(`select public.admin_overview()`); viewerOverview = true; } catch { /* denied */ }
  await db.exec('reset role');
  ok('overview: viewer (no cap) is denied (42501)', viewerOverview === false);

  // ── client_merge (0001 clients + client_links; client_merge RPC; crm.manage) ──
  const insInto = await db.query(`insert into public.clients (name, email, email_norm, kind, source) values ('Merge Twin A', 'twin@example.com', 'twin@example.com', 'business', 'site-visit') returning id`);
  const insFrom = await db.query(`insert into public.clients (name, email, email_norm, kind, source) values ('Merge Twin B', 'TWIN@example.com', 'twin@example.com', 'business', 'site-visit') returning id`);
  const intoId = first(insInto), fromId = first(insFrom);
  await db.query(`insert into public.client_links (client_id, entity, entity_id) values ($1::bigint, 'lead', 424242)`, [fromId]);
  await asRole(db, 'authenticated', S);
  await db.query(`select public.client_merge($1::bigint, $2::bigint)`, [intoId, fromId]);
  await db.exec('reset role');
  const afterMerge = await db.query(`select (select merged_into::int from public.clients where id = $1) as merged, (select client_id::int from public.client_links where entity = 'lead' and entity_id = 424242) as link_client`, [fromId]);
  ok('merge: sales may merge duplicates (links re-pointed, loser tombstoned)', Number(afterMerge.rows[0]?.merged) === intoId && Number(afterMerge.rows[0]?.link_client) === intoId);

  let viewerMerge = false;
  try { await asRole(db, 'authenticated', V); await db.query(`select public.client_merge($1::bigint, $2::bigint)`, [intoId, fromId]); viewerMerge = true; } catch { /* denied */ }
  await db.exec('reset role');
  ok('merge: viewer may NOT merge clients (crm.manage required)', viewerMerge === false);

  await asRole(db, 'authenticated', V);
  const viewerClients = await db.query(`select count(*)::int as c from public.clients where id in ($1::bigint, $2::bigint)`, [intoId, fromId]);
  await db.exec('reset role');
  ok('merge: viewer sees 0 client rows (crm.manage required)', first(viewerClients) === 0);

  // ── site_visits (0001 site_visits table; crm.manage read/insert/update only; NO delete) ──
  const svInsLead = await db.query(`insert into public.leads (name) values ('Visit Rehearsal') returning id`);
  const svLeadId = first(svInsLead);
  const svInsClient = await db.query(`insert into public.clients (name, email_norm, kind, source) values ('Visit Rehearsal Client', 'visit-rehearsal@example.com', 'business', 'site-visit') returning id`);
  const svClientId = first(svInsClient);
  const svRef = `SV-REH-${Date.now()}`;
  await asRole(db, 'authenticated', S);
  await db.query(`insert into public.site_visits (ref, lead_id, client_id, scheduled_at, address, owner, status) values ($1, $2::bigint, $3::bigint, now() + interval '2 days', 'Rehearsal Site 9, Lahore', 'You', 'Scheduled')`, [svRef, svLeadId, svClientId]);
  await db.exec('reset role');
  const svSales = await db.query(`select count(*)::int as c from public.site_visits where ref = $1`, [svRef]);
  ok('site visits: sales may schedule a visit (plain RLS — no reminder RPC yet)', first(svSales) === 1);

  await asRole(db, 'authenticated', V);
  const svViewer = await db.query(`select count(*)::int as c from public.site_visits where ref = $1`, [svRef]);
  await db.exec('reset role');
  ok('site visits: viewer sees 0 visit rows (crm.manage required)', first(svViewer) === 0);

  await asRole(db, 'authenticated', S);
  await db.query(`update public.site_visits set status = 'Completed', outcome = 'Measured — booked for fit-out', updated_at = now() where ref = $1`, [svRef]);
  await db.exec('reset role');
  const svOutcome = await db.query(`select status, outcome from public.site_visits where ref = $1`, [svRef]);
  ok('site visits: sales may record the visit outcome (status → Completed)', svOutcome.rows[0]?.status === 'Completed' && String(svOutcome.rows[0]?.outcome ?? '').startsWith('Measured'));

  // ── 0013 project cost codes + actuals ledger ───────────────────────────
  await db.exec(`insert into public.projects (id, payload) values ('rehearsal-actuals-job', '{"practice":{"boq":[]}}'::jsonb) on conflict (id) do update set payload = excluded.payload`);
  const ccIns = await db.query(`insert into public.project_cost_codes (project_id, code, boq_section, description) values ('rehearsal-actuals-job', 'JNR', 'Joinery & panelling', 'Joinery works') returning id`);
  const ccId = first(ccIns);
  ok('0013 fresh project + superuser cost-code seed for fixture', ccId >= 1001);

  await asRole(db, 'authenticated', S);
  const salesCc = await db.query(`insert into public.project_cost_codes (project_id, code, boq_section, description) values ('rehearsal-actuals-job', 'LAB', null, 'Site labour') returning id`);
  await db.exec('reset role');
  ok('0013 sales may insert cost codes (crm.manage)', first(salesCc) >= 1001);

  let finCcIns = false;
  try { await asRole(db, 'authenticated', F); await db.query(`insert into public.project_cost_codes (project_id, code) values ('rehearsal-actuals-job', 'FIN')`); } catch { finCcIns = true; }
  await db.exec('reset role');
  ok('0013 finance may NOT insert cost codes', finCcIns);

  await asRole(db, 'authenticated', F);
  const finCcRead = await db.query(`select count(*)::int as c from public.project_cost_codes where project_id = 'rehearsal-actuals-job'`);
  await db.exec('reset role');
  ok('0013 finance may READ cost codes', first(finCcRead) >= 1);

  await asRole(db, 'authenticated', V);
  const vCc = await db.query(`select count(*)::int as c from public.project_cost_codes where project_id = 'rehearsal-actuals-job'`);
  await db.exec('reset role');
  ok('0013 viewer sees 0 cost codes (crm.manage/finance.manage required)', first(vCc) === 0);

  await asRole(db, 'authenticated', S);
  const actIns = await db.query(`insert into public.project_actuals (project_id, cost_code, description, qty, unit, rate, source, po_ref) values ('rehearsal-actuals-job', 'JNR', 'Walnut stock + veneer', 42, 'sqft', 3100, 'po', 'PO-1001') returning id, amount`);
  await db.exec('reset role');
  const actRow = actIns.rows[0] ?? {};
  ok('0013 sales may insert actuals (amount GENERATED as qty*rate = 130,200)', Number(actRow.id) >= 1001 && Number(actRow.amount) === 130200);

  let finActIns = false;
  try { await asRole(db, 'authenticated', F); await db.query(`insert into public.project_actuals (project_id, cost_code, description) values ('rehearsal-actuals-job', 'JNR', 'finance intrusion')`); } catch { finActIns = true; }
  await db.exec('reset role');
  ok('0013 finance may NOT insert actuals', finActIns);

  await asRole(db, 'authenticated', S);
  const actUpd = await db.query(`update public.project_actuals set note = 'veneer pressing batch 2' where cost_code = 'JNR' and project_id = 'rehearsal-actuals-job' returning id`);
  await db.exec('reset role');
  ok('0013 sales may update actuals', (actUpd.affectedRows ?? actUpd.rows?.length ?? 0) >= 1);

  await asRole(db, 'authenticated', F);
  const finActUpd = await db.query(`update public.project_actuals set note = 'finance edit' where project_id = 'rehearsal-actuals-job'`);
  await db.exec('reset role');
  ok('0013 finance UPDATE affects 0 rows', (finActUpd.affectedRows ?? 0) === 0);

  await asRole(db, 'authenticated', V);
  const vAct = await db.query(`select count(*)::int as c from public.project_actuals where project_id = 'rehearsal-actuals-job'`);
  await db.exec('reset role');
  ok('0013 viewer sees 0 actual rows (crm.manage/finance.manage required)', first(vAct) === 0);

  await asRole(db, 'authenticated', F);
  const finActRead = await db.query(`select count(*)::int as c from public.project_actuals where project_id = 'rehearsal-actuals-job'`);
  await db.exec('reset role');
  ok('0013 finance may READ actuals', first(finActRead) === 1);

  let badCode = false;
  try { await asRole(db, 'authenticated', S); await db.query(`insert into public.project_actuals (project_id, cost_code) values ('rehearsal-actuals-job', 'NOPE')`); } catch { badCode = true; }
  await db.exec('reset role');
  ok('0013 actuals FK rejects unknown cost codes', badCode);

  let restrictBlocks = false;
  try { await asRole(db, 'authenticated', S); await db.query(`delete from public.project_cost_codes where project_id = 'rehearsal-actuals-job' and code = 'JNR'`); } catch { restrictBlocks = true; }
  await db.exec('reset role');
  ok('0013 cost code referenced by actuals cannot be deleted (FK RESTRICT)', restrictBlocks);

  const projDel = await db.query(`delete from public.projects where id = 'rehearsal-actuals-job'`);
  ok('0013 project delete cascades its codes + actuals', (projDel.affectedRows ?? 0) === 1);

  // ── 0014 projects storage bucket (private, 50 MB cap, crm.manage only) ──
  const bucket = await db.query(`select public, file_size_limit::int as cap from storage.buckets where id = 'projects'`);
  ok('0014 projects bucket exists, private, 50 MB cap', bucket.rows[0]?.public === false && Number(bucket.rows[0]?.cap) === 52428800);

  await asRole(db, 'authenticated', S);
  const sIns = await db.query(`insert into storage.objects (bucket_id, name) values ('projects', 'rehearsal-job/drawing.dwg') returning id`);
  await db.exec('reset role');
  ok('0014 sales may upload into the projects bucket (crm.manage)', !!first(sIns));

  await asRole(db, 'authenticated', S);
  const sRead = await db.query(`select count(*)::int as c from storage.objects where bucket_id = 'projects' and name = 'rehearsal-job/drawing.dwg'`);
  await db.exec('reset role');
  ok('0014 sales may read the projects bucket', first(sRead) === 1);

  await asRole(db, 'authenticated', F);
  const fRead = await db.query(`select count(*)::int as c from storage.objects where bucket_id = 'projects'`);
  await db.exec('reset role');
  ok('0014 finance sees 0 storage rows (storage posture is crm.manage only)', first(fRead) === 0);

  let fIns = false;
  try { await asRole(db, 'authenticated', F); await db.query(`insert into storage.objects (bucket_id, name) values ('projects', 'rehearsal-job/fin.dwg')`); } catch { fIns = true; }
  await db.exec('reset role');
  ok('0014 finance may NOT upload into the projects bucket', fIns);

  await asRole(db, 'authenticated', F);
  const fDelR = await db.query(`delete from storage.objects where bucket_id = 'projects'`);
  await db.exec('reset role');
  ok('0014 finance DELETE affects 0 storage rows', (fDelR.affectedRows ?? 0) === 0);

  await asRole(db, 'authenticated', V);
  const vRead = await db.query(`select count(*)::int as c from storage.objects where bucket_id = 'projects'`);
  await db.exec('reset role');
  ok('0014 viewer sees 0 storage rows', first(vRead) === 0);

  let vIns = false;
  try { await asRole(db, 'authenticated', V); await db.query(`insert into storage.objects (bucket_id, name) values ('projects', 'rehearsal-job/viewer.dwg')`); } catch { vIns = true; }
  await db.exec('reset role');
  ok('0014 viewer may NOT upload into the projects bucket', vIns);

  await asRole(db, 'anon', V);
  let aRead = -1;
  try { const ar = await db.query(`select count(*)::int as c from storage.objects where bucket_id = 'projects'`); aRead = first(ar) === null ? 0 : 0; } catch { aRead = -1; }
  await db.exec('reset role');
  ok('0014 anon has no storage access', aRead === -1 || aRead === 0);

  let otherIns = false;
  try { await asRole(db, 'authenticated', S); await db.query(`insert into storage.objects (bucket_id, name) values ('not-projects', 'x.dwg')`); } catch { otherIns = true; }
  await db.exec('reset role');
  ok('0014 projects policies do not leak into other buckets (no policy = deny)', otherIns);

  await asRole(db, 'authenticated', S);
  const sDel = await db.query(`delete from storage.objects where bucket_id = 'projects' and name = 'rehearsal-job/drawing.dwg' returning id`);
  await db.exec('reset role');
  ok('0014 sales may delete job files (crm.manage)', (sDel.affectedRows ?? sDel.rows?.length ?? 0) === 1);

  const pass = results.filter(r => r[1]).length, fail = results.length - pass;
  console.log(`\nFRESH REHEARSAL (test:rehearsal): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
