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
import { PGlite } from '@electric-sql/pglite';
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

  const pass = results.filter(r => r[1]).length, fail = results.length - pass;
  console.log(`\nFRESH REHEARSAL (test:rehearsal): ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
