/* Isolated PGlite regression for migration 00026 (warranty claims).
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
  await q("insert into public.user_roles(user_id,role) values ($1,'editor'),($2,'editor'),($3,'viewer')", [editor, inspector, viewer]);

  const mk = async (id) => q('insert into public.projects(id,status,payload) values ($1,$2,$3::jsonb)', [id, 'draft', JSON.stringify({
    title: id, practice: { boq: [], milestones: [], files: [], production: { stages, qc: pending, dispatch: noDispatch } },
  })]);
  for (const id of ['job-a', 'job-b', 'job-c', 'job-d']) await mk(id);

  await role('authenticated', inspector);
  for (const id of ['job-a', 'job-b', 'job-c', 'job-d']) await q("select * from public.project_qc_record($1,'passed','ready')", [id]);
  await role('authenticated', editor);
  const fullStages = stages.map((st) => ({ ...st, pct: 100 }));
  for (const id of ['job-a', 'job-b', 'job-c', 'job-d']) {
    await q("select * from public.project_practice_save($1,$2::jsonb,$3)", [id, JSON.stringify({
      boq: [], milestones: [], files: [], production: { stages: fullStages, qc: pending, dispatch: { date: day(-40), vehicle: 'VAN', driver: 'I', driverPhone: '1', challanRef: 'C' } },
    }), Number(await scalar('select revision from public.projects where id = $1', [id]))]);
    await q("select * from public.project_handover_record($1,'delivery',$2,'Imran','','S')", [id, day(-35)]);
    await q("select * from public.project_handover_record($1,'installation',$2,'Bilal','','S')", [id, day(-30)]);
    // job-d keeps its handovers but gets no warranty, to test the "none" path.
    if (id !== 'job-d') await q('select * from public.project_warranty_open($1,$2)', [id, 12]);
  }
  // job-b: warranty cancelled; job-c: warranty already expired; job-d: no warranty at all.
  await q("select * from public.project_warranty_cancel('job-b','customer cancelled')");
  // Simulate an old warranty that already expired (no RPC rewrites dates on purpose).
  await role('postgres');
  await q("update public.project_warranties set starts_on = $1, ends_on = $2 where project_id='job-c'", [day(-800), day(-770)]);
  await role('authenticated', editor);

  const claim = (await q("select * from public.project_warranty_claim_open('job-a','Seat frame cracked','Two chairs, customer reported on site')")).rows[0];
  check('a claim opens against a live warranty', claim?.status === 'open' && claim?.summary === 'Seat frame cracked');
  check('the claim records who opened it', claim?.opened_by === editor);
  check('opening a claim is audited', await scalar("select action from public.project_production_events where project_id='job-a' order by id desc limit 1") === 'warranty_claim_opened');
  check('a blank summary is refused', await errorCode(() => q("select * from public.project_warranty_claim_open('job-a','   ')")) === '22023');
  check('an over-long summary is refused', await errorCode(() => q("select * from public.project_warranty_claim_open('job-a',$1)", ['x'.repeat(201)])) === '22001');
  check('over-long details are refused', await errorCode(() => q("select * from public.project_warranty_claim_open('job-a','ok',$1)", ['x'.repeat(2001)])) === '22001');
  check('a future-dated claim is refused', await errorCode(() => q("select * from public.project_warranty_claim_open('job-a','ok','',  $1)", [day(3)])) === '22023');
  check('a claim against a cancelled warranty is refused', await errorCode(() => q("select * from public.project_warranty_claim_open('job-b','ok')")) === '23514');
  check('a claim against an expired warranty is refused', await errorCode(() => q("select * from public.project_warranty_claim_open('job-c','ok')")) === '23514');
  check('a claim without any warranty is refused', await errorCode(() => q("select * from public.project_warranty_claim_open('job-d','ok')")) === '23514');
  check('a claim on a missing project is refused', await errorCode(() => q("select * from public.project_warranty_claim_open('job-none','ok')")) === 'P0002');
  check('a claim cannot predate the warranty start', await errorCode(() => q("select * from public.project_warranty_claim_open('job-a','ok','',$1)", [day(-400)])) === '23514');

  const scheduled = (await q("select * from public.project_warranty_claim_update($1,'scheduled')", [claim.id])).rows[0];
  check('a claim can be scheduled', scheduled?.status === 'scheduled');
  check('scheduling is audited', await scalar("select detail ->> 'status' from public.project_production_events where action='warranty_claim_status' order by id desc limit 1") === 'scheduled');
  check('resolving without a note is refused', await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','  ')", [claim.id])) === '22023');
  const resolved = (await q("select * from public.project_warranty_claim_update($1,'resolved','Frames replaced under warranty')", [claim.id])).rows[0];
  check('a claim resolves with a resolution note', resolved?.status === 'resolved' && resolved?.resolution === 'Frames replaced under warranty');
  check('resolving stamps the closure time', resolved?.closed_at !== null);
  check('a resolved claim is terminal', await errorCode(() => q("select * from public.project_warranty_claim_update($1,'scheduled')", [claim.id])) === '23514');
  check('an unknown status is refused', await errorCode(() => q("select * from public.project_warranty_claim_update($1,'approved','x')", [claim.id])) === '22023');
  check('a missing claim is refused', await errorCode(() => q("select * from public.project_warranty_claim_update(gen_random_uuid(),'scheduled')")) === 'P0002');
  check('an over-long resolution is refused', await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved',$2)", [claim.id, 'x'.repeat(2001)])) === '22001');

  const second = (await q("select * from public.project_warranty_claim_open('job-a','Hinge loose')")).rows[0];
  const rejected = (await q("select * from public.project_warranty_claim_update($1,'rejected','Not covered — water damage')", [second.id])).rows[0];
  check('a claim can be rejected straight from open', rejected?.status === 'rejected');
  check('rejecting keeps the reason', rejected?.resolution === 'Not covered — water damage');
  check('the claims are readable by staff', Number(await scalar("select count(*) from public.project_warranty_claims where project_id='job-a'")) === 2);

  // Cancelling the warranty does not rewrite existing claims.
  await q("select * from public.project_warranty_cancel('job-a','contract ended')");
  check('cancelling the warranty keeps its claims', Number(await scalar("select count(*) from public.project_warranty_claims where project_id='job-a'")) === 2);

  await role('authenticated', viewer);
  check('a viewer cannot open a claim', await errorCode(() => q("select * from public.project_warranty_claim_open('job-d','ok')")) === '42501');
  check('a viewer cannot read claims', Number(await scalar("select count(*) from public.project_warranty_claims")) === 0);
  await role('anon');
  check('anonymous cannot open a claim', await errorCode(() => q("select * from public.project_warranty_claim_open('job-a','ok')")) === '42501');

  await role('postgres');
  const claims = Number(await scalar('select count(*) from public.project_warranty_claims'));
  await db.exec(`drop function if exists public.project_warranty_claim_update(uuid, text, text);
    drop function if exists public.project_warranty_claim_open(text, text, text, date);
    drop table if exists public.project_warranty_claims;`);
  check('rollback removes the claims table', await scalar("select to_regclass('public.project_warranty_claims')") === null);
  check('rollback keeps projects, warranties and audit rows',
    Number(await scalar('select count(*) from public.projects')) === 4 &&
    Number(await scalar('select count(*) from public.project_warranties')) >= 3 &&
    Number(await scalar("select count(*) from public.project_production_events where action like 'warranty_claim%'")) >= claims);

  console.log(`Warranty claims: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.close();
}
