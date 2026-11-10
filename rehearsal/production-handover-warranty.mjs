/* Isolated PGlite regression for migration 00025 (delivery/installation + warranty).
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
const editor = '11111111-1111-1111-1111-111111111111';
const inspector = '44444444-4444-4444-4444-444444444444';
const viewer = '22222222-2222-2222-2222-222222222222';
const stages = [
  { id: 's1', stage: 'material_prep', pct: 100, note: '' },
  { id: 's2', stage: 'fabrication', pct: 100, note: '' },
  { id: 's3', stage: 'finishing', pct: 100, note: '' },
  { id: 's4', stage: 'qc', pct: 100, note: '' },
  { id: 's5', stage: 'dispatch', pct: 100, note: '' },
];
const passedQc = { result: 'passed', defectNote: '', inspectedBy: 'qa.inspector@example.test', inspectedAt: '2026-10-01' };
const dispatch = { date: '2026-10-05', vehicle: 'TEST-VAN', driver: 'Imran', driverPhone: '03001234567', challanRef: 'CH-77' };
const practice = { boq: [], milestones: [], files: [], production: { stages, qc: passedQc, dispatch } };
const today = new Date();
const daysAgoISO = (n) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const day = (v) => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const futureISO = (n) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

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
  await q('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6)', [editor, 'qa.editor@example.test', inspector, 'qa.inspector@example.test', viewer, 'qa.viewer@example.test']);
  await q("insert into public.user_roles(user_id,role) values ($1,'editor'),($2,'owner'),($3,'viewer')", [editor, inspector, viewer]);

  const pendingQc = { result: 'pending', defectNote: '', inspectedBy: '', inspectedAt: '' };
  const noDispatch = { date: '', vehicle: '', driver: '', driverPhone: '', challanRef: '' };
  const practiceWith = (qc, dispatch, st = stages) => ({ boq: [], milestones: [], files: [], production: { stages: st, qc, dispatch } });
  // Dispatch/QC stages start at 0 so the 00021 gate accepts the pending fixture.
  const earlyStages = stages.map((st) => st.stage === 'dispatch' || st.stage === 'qc' ? { ...st, pct: 0 } : { ...st });
  const mk = async (id, prod) => q('insert into public.projects(id,status,payload) values ($1,$2,$3::jsonb)', [id, 'draft', JSON.stringify({ title: id, practice: prod })]);
  await mk('job-ready', practiceWith(pendingQc, noDispatch, earlyStages));
  await mk('job-pending-qc', practiceWith(pendingQc, noDispatch, earlyStages));
  await mk('job-no-dispatch', practiceWith(pendingQc, noDispatch, earlyStages));
  await mk('job-empty', { boq: [], milestones: [], files: [] });
  // A real pass must come from an inspection (00021/00022); dispatch can only be
  // stored once QC is passed.
  await role('authenticated', inspector);
  await q("select * from public.project_qc_record('job-ready','passed','ready for delivery')");
  await q("select * from public.project_qc_record('job-no-dispatch','passed','ready for delivery')");
  await role('authenticated', editor);
  await q("select * from public.project_practice_save('job-ready',$1::jsonb,$2)", [
    JSON.stringify(practiceWith(passedQc, dispatch)),
    Number(await scalar("select revision from public.projects where id='job-ready'")),
  ]);

  await role('authenticated', editor);
  const delivery = (await q('select * from public.project_handover_record($1,$2,$3,$4,$5,$6)', ['job-ready', 'delivery', daysAgoISO(20), 'Imran', 'Console delivered in good condition', 'S. Khan'])).rows[0];
  check('a delivery is recorded after the QC pass and dispatch', delivery?.kind === 'delivery' && delivery?.signed_by === 'S. Khan');
  check('the delivery is stamped with the actor', await scalar("select created_by::text from public.project_handovers where project_id='job-ready' and kind='delivery'") === editor);
  check('the delivery is written to the audit trail', await scalar("select action from public.project_production_events where project_id='job-ready' order by id desc limit 1") === 'handover_recorded');
  check('a second delivery record is refused', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3)', ['job-ready', 'delivery', daysAgoISO(19)])) === '23505');
  check('a handover without a QC pass is refused', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3)', ['job-pending-qc', 'delivery', daysAgoISO(5)])) === '23514');
  check('a handover without dispatch details is refused', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3)', ['job-no-dispatch', 'delivery', daysAgoISO(5)])) === '23514');
  check('a job without production cannot be handed over', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3)', ['job-empty', 'delivery', daysAgoISO(5)])) === '23514');
  check('a future handover date is refused', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3)', ['job-ready', 'installation', futureISO(3)])) === '22023');
  check('an impossible handover year is refused', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3)', ['job-ready', 'installation', '1107-11-09'])) === '22023');
  check('an unknown handover kind is refused', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3)', ['job-ready', 'pickup', daysAgoISO(3)])) === '22023');
  check('over-long notes are refused', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3,$4,$5)', ['job-ready', 'installation', daysAgoISO(10), '', 'x'.repeat(2001)])) === '22001');
  check('installation before delivery is refused', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3)', ['job-ready', 'installation', daysAgoISO(30)])) === '23514');
  check('installation on another job without delivery is refused', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3)', ['job-pending-qc', 'installation', daysAgoISO(2)])) === '23514');

  const install = (await q('select * from public.project_handover_record($1,$2,$3,$4,$5,$6)', ['job-ready', 'installation', daysAgoISO(12), 'Bilal', 'Installed and levelled', 'S. Khan'])).rows[0];
  check('installation is recorded after delivery', install?.kind === 'installation');

  const warranty = (await q('select * from public.project_warranty_open($1,$2,$3,$4)', ['job-ready', 12, 'Structure and hardware', 'Water damage, misuse'])).rows[0];
  const installDay = day(install?.happened_on);
  check('a warranty opens from the installation date', day(warranty?.starts_on) === installDay);
  const expectedEnd = (() => {
    const d = new Date(`${installDay}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 12);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  check('the warranty end date is start + months - 1 day', day(warranty?.ends_on) === expectedEnd);
  check('opening a warranty is audited', await scalar("select action from public.project_production_events where project_id='job-ready' order by id desc limit 1") === 'warranty_opened');
  check('a second active warranty is refused', await errorCode(() => q('select * from public.project_warranty_open($1,$2)', ['job-ready', 6])) === '23505');
  check('a warranty without installation is refused', await errorCode(() => q('select * from public.project_warranty_open($1,$2)', ['job-pending-qc', 12])) === '23514');
  check('zero months is refused', await errorCode(() => q('select * from public.project_warranty_open($1,$2)', ['job-ready', 0])) === '22023');
  check('over-long coverage text is refused', await errorCode(() => q('select * from public.project_warranty_open($1,$2,$3)', ['job-ready', 6, 'x'.repeat(2001)])) === '22001');

  const projection = (await q("select * from public.project_post_dispatch('job-ready')")).rows[0];
  check('the projection reports the handover dates', day(projection?.delivery_on) === daysAgoISO(20) && day(projection?.installation_on) === installDay);
  check('the projection reports an active warranty', projection?.warranty_state === 'active' && projection?.warranty_months === 12);
  check('a job with no handover reports none', (await q("select warranty_state from public.project_post_dispatch('job-empty')")).rows[0].warranty_state === 'none');

  const cancelled = (await q("select * from public.project_warranty_cancel('job-ready','customer cancelled the contract')")).rows[0];
  check('cancelling keeps the row and the reason', cancelled?.cancel_reason === 'customer cancelled the contract' && cancelled?.cancelled_at !== null);
  check('cancelling is audited', await scalar("select action from public.project_production_events where project_id='job-ready' order by id desc limit 1") === 'warranty_cancelled');
  check('a cancelled warranty shows as cancelled', (await q("select warranty_state from public.project_post_dispatch('job-ready')")).rows[0].warranty_state === 'cancelled');
  check('cancelling twice is refused', await errorCode(() => q("select * from public.project_warranty_cancel('job-ready','again')")) === '23514');
  check('an over-long cancellation reason is refused', await errorCode(() => q("select * from public.project_warranty_cancel('job-ready',$1)", ['x'.repeat(501)])) === '22001');
  check('a cancelled warranty frees the slot for a new one', (await q('select * from public.project_warranty_open($1,$2)', ['job-ready', 6])).rows[0].months === 6);

  // An old installation produces an already-expired warranty rather than a fresh one.
  const old = daysAgoISO(800);
  await q("select * from public.project_handover_record('job-no-dispatch','delivery',$1)", ['2026-01-01']).catch(() => undefined);
  await role('postgres');
  await q("insert into public.project_handovers(project_id,kind,happened_on,lead,notes,signed_by) values ('job-no-dispatch','delivery',$1,'Imran','','S. Khan'),('job-no-dispatch','installation',$2,'Bilal','','S. Khan')", [old, old]);
  await role('authenticated', editor);
  await q('select * from public.project_warranty_open($1,$2)', ['job-no-dispatch', 12]);
  check('an old installation yields an expired warranty',
    (await q("select warranty_state from public.project_post_dispatch('job-no-dispatch')")).rows[0].warranty_state === 'expired');

  await role('authenticated', viewer);
  check('a viewer cannot record a handover', await errorCode(() => q('select * from public.project_handover_record($1,$2,$3)', ['job-no-dispatch', 'delivery', daysAgoISO(1)])) === '42501');
  check('a viewer cannot read the projection', await errorCode(() => q("select * from public.project_post_dispatch('job-ready')")) === '42501');
  await role('anon');
  check('anonymous cannot open a warranty', await errorCode(() => q('select * from public.project_warranty_open($1,$2)', ['job-ready', 12])) === '42501');
  await role('postgres');
  check('application roles cannot write the warranty table directly', (await errorCode(() => role('authenticated', editor).then(() => q("insert into public.project_warranties(project_id,months,starts_on,ends_on) values ('job-empty',12,current_date,current_date)")))) === '42501');

  await role('postgres');
  const beforeProjects = await scalar("select count(*) from public.projects");
  // 00026 depends on warranties, so its objects go first when rehearsing this
  // migration's rollback in a database that already has the claims layer.
  // 00033 layers a richer update/assign/register on top of these objects.
  await db.exec(`drop function if exists public.project_warranty_register(integer);
    drop function if exists public.project_warranty_claim_assign(uuid, uuid);
    drop function if exists public.project_warranty_claim_update(uuid, text, text, numeric, text, jsonb);
    drop function if exists public.internal_stock_move(text, integer, text, text);
    drop function if exists public.project_warranty_open(text, integer, text, text, integer);
    drop function if exists public.project_post_dispatch(text);
    drop function if exists public.project_warranty_claim_update(uuid, text, text);
    drop function if exists public.project_warranty_claim_open(text, text, text, date);
    drop table if exists public.project_warranty_claims;
    drop function if exists public.project_post_dispatch(text);
    drop function if exists public.project_warranty_cancel(text, text);
    drop function if exists public.project_warranty_open(text, integer, text, text);
    drop function if exists public.project_handover_record(text, text, date, text, text, text);
    drop table if exists public.project_warranties;
    drop table if exists public.project_handovers;`);
  check('rollback leaves projects and audit history intact',
    Number(await scalar("select count(*) from public.projects")) === Number(beforeProjects) &&
    Number(await scalar("select count(*) from public.project_production_events where action like 'handover%' or action like 'warranty%'")) >= 3);
  check('rollback removes both tables',
    await scalar("select to_regclass('public.project_handovers')") === null &&
    await scalar("select to_regclass('public.project_warranties')") === null);

  console.log(`Handover & warranty: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.close();
}
