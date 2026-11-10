/* Isolated PGlite regression for migration 00027 (warranty register).
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
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const stages = [
  { id: 's1', stage: 'material_prep', pct: 100, note: '' },
  { id: 's2', stage: 'fabrication', pct: 100, note: '' },
  { id: 's3', stage: 'finishing', pct: 100, note: '' },
  { id: 's4', stage: 'qc', pct: 0, note: '' },
  { id: 's5', stage: 'dispatch', pct: 0, note: '' },
];
const pending = { result: 'pending', defectNote: '', inspectedBy: '', inspectedAt: '' };
const noDispatch = { date: '', vehicle: '', driver: '', driverPhone: '', challanRef: '' };

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

  const mk = async (id) => q('insert into public.projects(id,status,payload) values ($1,$2,$3::jsonb)', [id, 'draft', JSON.stringify({
    title: id.toUpperCase(), practice: { boq: [], milestones: [], files: [], production: { stages, qc: pending, dispatch: noDispatch } },
  })]);
  for (const id of ['job-live', 'job-soon', 'job-expired', 'job-cancelled', 'job-claimless']) await mk(id);

  await role('authenticated', inspector);
  for (const id of ['job-live', 'job-soon', 'job-expired', 'job-cancelled', 'job-claimless']) await q("select * from public.project_qc_record($1,'passed','ready')", [id]);
  await role('authenticated', editor);
  const fullStages = stages.map((st) => ({ ...st, pct: 100 }));
  for (const id of ['job-live', 'job-soon', 'job-expired', 'job-cancelled', 'job-claimless']) {
    await q("select * from public.project_practice_save($1,$2::jsonb,$3)", [id, JSON.stringify({
      boq: [], milestones: [], files: [], production: { stages: fullStages, qc: pending, dispatch: { date: day(-60), vehicle: 'VAN', driver: 'I', driverPhone: '1', challanRef: 'C' } },
    }), Number(await scalar('select revision from public.projects where id = $1', [id]))]);
    await q("select * from public.project_handover_record($1,'delivery',$2,'Imran','','S')", [id, day(-55)]);
    await q("select * from public.project_handover_record($1,'installation',$2,'Bilal','','S')", [id, day(-50)]);
  }
  // Warranty windows: live (long), expiring soon, expired, cancelled, none.
  await q('select * from public.project_warranty_open($1,$2)', ['job-live', 24]);
  await q('select * from public.project_warranty_open($1,$2)', ['job-soon', 12]);
  await q('select * from public.project_warranty_open($1,$2)', ['job-expired', 12]);
  await q('select * from public.project_warranty_open($1,$2)', ['job-cancelled', 12]);
  await q("select * from public.project_warranty_cancel('job-cancelled','contract ended')");
  await role('postgres');
  await q("update public.project_warranties set starts_on=$1, ends_on=$2 where project_id='job-soon'", [day(-330), day(20)]);
  await q("update public.project_warranties set starts_on=$1, ends_on=$2 where project_id='job-expired'", [day(-800), day(-700)]);
  await role('authenticated', editor);

  // Claims: two open on job-live (one scheduled), one resolved on job-expired.
  await q("select * from public.project_warranty_claim_open('job-live','Frame cracked')");
  const scheduled = (await q("select * from public.project_warranty_claim_open('job-live','Hinge loose')")).rows[0];
  await q("select * from public.project_warranty_claim_update($1,'scheduled')", [scheduled.id]);

  const rows = (await q('select * from public.project_warranty_register(60)')).rows;
  check('the register lists only jobs with a warranty or a claim', rows.length === 4 && !rows.some((r) => r.project_id === 'job-claimless'));
  check('the register derives states', rows.find((r) => r.project_id === 'job-live')?.warranty_state === 'active' &&
    rows.find((r) => r.project_id === 'job-expired')?.warranty_state === 'expired' &&
    rows.find((r) => r.project_id === 'job-cancelled')?.warranty_state === 'cancelled');
  check('days left is derived from the end date', Number(rows.find((r) => r.project_id === 'job-soon')?.days_left) === 20);
  check('an expired warranty has negative days left', Number(rows.find((r) => r.project_id === 'job-expired')?.days_left) < 0);
  check('expiring soon is flagged inside the window', rows.find((r) => r.project_id === 'job-soon')?.expiring_soon === true);
  check('a long warranty is not flagged', rows.find((r) => r.project_id === 'job-live')?.expiring_soon === false);
  check('open claims count open and scheduled', Number(rows.find((r) => r.project_id === 'job-live')?.open_claims) === 2);
  check('resolved claims are counted as total only', Number(rows.find((r) => r.project_id === 'job-expired')?.total_claims) === 0 &&
    Number(rows.find((r) => r.project_id === 'job-live')?.total_claims) === 2);
  check('the register carries the handover dates and dispatch vehicle', rows.find((r) => r.project_id === 'job-live')?.dispatch_vehicle === 'VAN');
  // Active first, soonest expiry first (so the job needing attention is on top).
  check('the register is ordered active (soonest expiry first), expired, cancelled',
    rows[0].project_id === 'job-soon' && rows[1].project_id === 'job-live' &&
    rows[2].project_id === 'job-expired' && rows[3].project_id === 'job-cancelled');
  check('a smaller window flags fewer jobs', (await q('select * from public.project_warranty_register(7)')).rows.find((r) => r.project_id === 'job-soon')?.expiring_soon === false);
  check('the window is bounded', await errorCode(() => q('select * from public.project_warranty_register(-1)')) === '22023');
  check('a zero-day window is allowed', (await q('select * from public.project_warranty_register(0)')).rows.length === 4);

  await role('authenticated', viewer);
  check('a viewer cannot read the register', await errorCode(() => q('select * from public.project_warranty_register(60)')) === '42501');
  await role('anon');
  check('anonymous cannot read the register', await errorCode(() => q('select * from public.project_warranty_register(60)')) === '42501');

  await role('postgres');
  await db.exec('drop function if exists public.project_warranty_register(integer);');
  check('rollback removes the projection only', await errorCode(() => q('select * from public.project_warranty_register(60)')) !== null &&
    Number(await scalar('select count(*) from public.project_warranties')) >= 4 &&
    Number(await scalar('select count(*) from public.projects')) === 5);

  console.log(`Warranty register: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.close();
}
