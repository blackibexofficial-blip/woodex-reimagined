/* Isolated PGlite regression for migration 00022 (QC records, audit trail and
   revision checks). Synthetic fixtures only; no hosted project is contacted. */
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
const sales = '33333333-3333-3333-3333-333333333333';
const viewer = '22222222-2222-2222-2222-222222222222';
const inspector = '44444444-4444-4444-4444-444444444444';
const owner = '55555555-5555-5555-5555-555555555555';
const owner2 = '66666666-6666-6666-6666-666666666666';
const blankStages = [
  { id: 's1', stage: 'material_prep', pct: 100, note: '' },
  { id: 's2', stage: 'fabrication', pct: 60, note: 'CNC booked' },
  { id: 's3', stage: 'finishing', pct: 0, note: '' },
  { id: 's4', stage: 'qc', pct: 0, note: '' },
  { id: 's5', stage: 'dispatch', pct: 0, note: '' },
];
const blankDispatch = { date: '', vehicle: '', driver: '', driverPhone: '', challanRef: '' };
const practiceWith = (qc, dispatch = blankDispatch, stages = blankStages) => ({
  boq: [], milestones: [], files: [],
  production: { stages, qc, dispatch },
});

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

  await q('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6),($7,$8),($9,$10),($11,$12)', [
    editor, 'qa.editor@example.test', sales, 'qa.sales@example.test', viewer, 'qa.viewer@example.test',
    inspector, 'qa.inspector@example.test', owner, 'qa.owner@example.test', owner2, 'qa.owner2@example.test',
  ]);
  await q("insert into public.user_roles(user_id,role) values ($1,'editor'),($2,'sales'),($3,'viewer'),($4,'editor'),($5,'owner'),($6,'owner')", [editor, sales, viewer, inspector, owner, owner2]);
  await q("insert into public.projects(id,status,payload) values ('job-a','draft',$1::jsonb)", [
    JSON.stringify({ title: 'Synthetic job A', practice: practiceWith({ result: 'pending', defectNote: '', inspectedBy: '', inspectedAt: '' }) }),
  ]);
  // Simulate a row written before this layer existed: the gate is bypassed only
  // inside this fixture so the tolerance path can be exercised.
  await db.exec('alter table public.projects disable trigger project_dispatch_qc_guard');
  await q("insert into public.projects(id,status,payload) values ('job-legacy','draft',$1::jsonb)", [
    JSON.stringify({ title: 'Synthetic legacy', practice: practiceWith({ result: 'passed', defectNote: '', inspectedBy: 'Legacy sheet', inspectedAt: '2025-01-02' }, { ...blankDispatch, vehicle: 'OLD-VAN' }) }),
  ]);
  await db.exec('alter table public.projects enable trigger project_dispatch_qc_guard');

  // ── permissions ───────────────────────────────────────────────────────────
  await role('anon');
  check('anonymous cannot execute project_qc_record', (await errorCode(() => q("select * from public.project_qc_record('job-a','passed','x')"))) === '42501');
  check('anonymous cannot execute project_practice_save', (await errorCode(() => q("select * from public.project_practice_save('job-a','{}'::jsonb,0)"))) === '42501');
  check('anonymous is denied inspection reads', (await errorCode(() => q('select count(*) from public.project_qc_inspections'))) === '42501');
  check('anonymous is denied production audit reads', (await errorCode(() => q('select count(*) from public.project_production_events'))) === '42501');

  await role('authenticated', viewer);
  check('viewer cannot record an inspection', (await errorCode(() => q("select * from public.project_qc_record('job-a','passed','x')"))) === '42501');
  check('viewer cannot save the practice workspace', (await errorCode(() => q("select * from public.project_practice_save('job-a','{}'::jsonb,0)"))) === '42501');
  check('viewer reads no inspections', Number(await scalar('select count(*) from public.project_qc_inspections')) === 0);

  await role('authenticated', sales);
  check('sales cannot record a QC inspection', (await errorCode(() => q("select * from public.project_qc_record('job-a','passed','x')"))) === '42501');
  check('sales cannot save the practice workspace', (await errorCode(() => q("select * from public.project_practice_save('job-a','{}'::jsonb,0)"))) === '42501');

  await role('authenticated', editor);
  check('editor cannot insert an inspection directly', (await errorCode(() => q("insert into public.project_qc_inspections(project_id,result,inspected_by) values ('job-a','passed',auth.uid())"))) === '42501');
  check('editor sees the inspection table as empty before recording', Number(await scalar('select count(*) from public.project_qc_inspections')) === 0);

  // ── direct payload self-approval is closed ────────────────────────────────
  const directPass = await errorCode(() => q("update public.projects set payload=jsonb_set(payload,'{practice,production,qc,result}',to_jsonb('passed'::text)) where id='job-a'"));
  check('direct payload write cannot self-approve QC', directPass === '23514');
  check('QC stays pending after the rejected self-approval', await scalar("select payload#>>'{practice,production,qc,result}' from public.projects where id='job-a'") === 'pending');

  // ── revision checks ───────────────────────────────────────────────────────
  const revisionBefore = Number(await scalar("select revision from public.projects where id='job-a'"));
  const saved = await q("select * from public.project_practice_save('job-a',$1::jsonb,$2)", [JSON.stringify(practiceWith({ result: 'pending' })), revisionBefore]);
  check('editor saves with the current revision', saved.rows.length === 1 && Number(saved.rows[0].revision) === revisionBefore + 1);
  check('revision bumps on each practice save', Number(await scalar("select revision from public.projects where id='job-a'")) === revisionBefore + 1);
  const staleCode = await errorCode(() => q("select * from public.project_practice_save('job-a',$1::jsonb,$2)", [JSON.stringify(practiceWith({ result: 'pending' })), revisionBefore]));
  check('stale revision is rejected instead of overwriting', staleCode === '40001');
  check('stale rejection leaves the stored payload intact', await scalar("select payload#>>'{practice,production,stages,1,note}' from public.projects where id='job-a'") === 'CNC booked');

  // ── owners only may pass (D-04) ──────────────────────────────────────────
  const editorPass = await errorCode(() => q("select * from public.project_qc_record('job-a','passed','editor tries to sign off')"));
  check('an editor cannot record a QC pass', editorPass === '42501');
  const editorFail = await errorCode(() => q("select * from public.project_qc_record('job-a','failed','editor flags a defect')"));
  check('an editor may still record a failure', editorFail === null);

  // ── separation of duties (applies to owners too) ─────────────────────────
  const editedStages = blankStages.map((st) => st.stage === 'fabrication' ? { ...st, pct: 75 } : { ...st });
  const revBeforeStageEdit = Number(await scalar("select revision from public.projects where id='job-a'"));
  await q("select * from public.project_practice_save('job-a',$1::jsonb,$2)", [JSON.stringify(practiceWith({ result: 'pending' }, blankDispatch, editedStages)), revBeforeStageEdit]);
  check('a stage edit records the editor as the last stage editor',
    await scalar("select production_updated_by::text from public.projects where id='job-a'") === editor);
  const inspectionsBeforeSelfPass = Number(await scalar("select count(*) from public.project_qc_inspections where project_id='job-a'"));
  const revBeforeSelfPass = Number(await scalar("select revision from public.projects where id='job-a'"));
  const qcBeforeSelfPass = await scalar("select payload#>>'{practice,production,qc,result}' from public.projects where id='job-a'");
  const editorSelfPass = await errorCode(() => q("select * from public.project_qc_record('job-a','passed','my own work')"));
  check('the last stage editor cannot record the pass', editorSelfPass === '42501');
  check('the refused self-pass stores nothing and leaves the stored QC alone',
    Number(await scalar("select count(*) from public.project_qc_inspections where project_id='job-a'")) === inspectionsBeforeSelfPass &&
    await scalar("select payload#>>'{practice,production,qc,result}' from public.projects where id='job-a'") === qcBeforeSelfPass &&
    Number(await scalar("select revision from public.projects where id='job-a'")) === revBeforeSelfPass);

  await role('authenticated', owner);
  const ownerPass = await errorCode(() => q("select * from public.project_qc_record('job-a','passed','independent check')"));
  check('an owner can record the pass', ownerPass === null);
  check('the pass does not rewrite the stage-editor stamp',
    await scalar("select production_updated_by::text from public.projects where id='job-a'") === editor);

  const ownerStageEdit = await q("select * from public.project_practice_save('job-a',$1::jsonb,$2)", [
    JSON.stringify(practiceWith({ result: 'passed' }, blankDispatch, editedStages.map((st) => st.stage === 'fabrication' ? { ...st, pct: 80 } : st))),
    Number(await scalar("select revision from public.projects where id='job-a'")),
  ]);
  check('an owner can save stages too', ownerStageEdit.rows.length === 1);
  const ownerSelfPass = await errorCode(() => q("select * from public.project_qc_record('job-a','passed','still me')"));
  check('an owner cannot pass after editing the stages themselves', ownerSelfPass === '42501');
  const ownerSelfFail = await errorCode(() => q("select * from public.project_qc_record('job-a','failed','owner flags own defect')"));
  check('an owner may still flag their own work as failed', ownerSelfFail === null);

  await role('authenticated', owner2);
  const secondOwnerPass = await errorCode(() => q("select * from public.project_qc_record('job-a','passed','second owner signs off')"));
  check('a second owner can pass after the roles swap', secondOwnerPass === null);
  check('the second owner is not the stored stage editor',
    await scalar("select production_updated_by::text from public.projects where id='job-a'") === owner);

  // ── inspection recording ──────────────────────────────────────────────────
  await role('postgres');
  await q("insert into public.projects(id,status,payload) values ('job-empty','draft',$1::jsonb)", [JSON.stringify({ title: 'No production yet' })]);
  await role('authenticated', owner2);
  check('inspection without production data is refused', (await errorCode(() => q("select * from public.project_qc_record('job-empty','passed','x')"))) === '23514');
  check('invalid inspection result is refused', (await errorCode(() => q("select * from public.project_qc_record('job-a','approved','x')"))) === '22023');
  check('over-long inspection notes are refused', (await errorCode(() => q("select * from public.project_qc_record('job-a','passed',$1)", ['x'.repeat(2001)]))) === '22001');

  const inspectionsBeforePass = Number(await scalar("select count(*) from public.project_qc_inspections where project_id='job-a'"));
  const inspection = (await q("select * from public.project_qc_record('job-a','passed','Final inspection — brass edges clean')")).rows[0];
  check('a second owner records an identity-stamped pass', inspection?.result === 'passed' && inspection?.inspected_by_email === 'qa.owner2@example.test');
  check('inspection revision matches the stored project revision', Number(inspection?.revision) === Number(await scalar("select revision from public.projects where id='job-a'")));
  check('payload QC is derived from the inspection', await scalar("select payload#>>'{practice,production,qc,result}' from public.projects where id='job-a'") === 'passed');
  check('payload inspector identity comes from auth, not the client', await scalar("select payload#>>'{practice,production,qc,inspectedBy}' from public.projects where id='job-a'") === 'qa.owner2@example.test');
  check('inspection history is readable by the editor', Number(await scalar("select count(*) from public.project_qc_inspections where project_id='job-a'")) === inspectionsBeforePass + 1);

  const revNow = Number(await scalar("select revision from public.projects where id='job-a'"));
  const savedWithDispatch = await q("select * from public.project_practice_save('job-a',$1::jsonb,$2)", [
    JSON.stringify(practiceWith({ result: 'pending', defectNote: 'client-supplied', inspectedBy: 'forged', inspectedAt: '2000-01-01' }, { ...blankDispatch, vehicle: 'TEST-VAN', driver: 'Imran' })),
    revNow,
  ]);
  check('a client cannot downgrade a recorded pass through save', await scalar("select payload#>>'{practice,production,qc,result}' from public.projects where id='job-a'") === 'passed');
  check('client-supplied inspector fields are ignored', await scalar("select payload#>>'{practice,production,qc,inspectedBy}' from public.projects where id='job-a'") === 'qa.owner2@example.test');
  check('dispatch data saves once a pass is recorded', Number(savedWithDispatch.rows.length) === 1 && await scalar("select payload#>>'{practice,production,dispatch,vehicle}' from public.projects where id='job-a'") === 'TEST-VAN');

  // failed inspection while dispatch data exists must roll back atomically
  const inspectionsBefore = Number(await scalar("select count(*) from public.project_qc_inspections where project_id='job-a'"));
  const revBeforeFailed = Number(await scalar("select revision from public.projects where id='job-a'"));
  const failedCode = await errorCode(() => q("select * from public.project_qc_record('job-a','failed','Veneer chip found')"));
  check('failed inspection with stored dispatch data is refused', failedCode === '23514');
  check('refused inspection leaves no orphan record and no revision bump',
    Number(await scalar("select count(*) from public.project_qc_inspections where project_id='job-a'")) === inspectionsBefore &&
    Number(await scalar("select revision from public.projects where id='job-a'")) === revBeforeFailed);

  // clearing dispatch, then failing, is allowed and locks dispatch again
  const revBeforeClear = Number(await scalar("select revision from public.projects where id='job-a'"));
  await q("select * from public.project_practice_save('job-a',$1::jsonb,$2)", [JSON.stringify(practiceWith({ result: 'passed' })), revBeforeClear]);
  await q("select * from public.project_qc_record('job-a','failed','Veneer chip on console 3')");
  check('failed inspection is recorded after dispatch data is cleared', await scalar("select payload#>>'{practice,production,qc,result}' from public.projects where id='job-a'") === 'failed');
  check('failed inspection stores its defect note', await scalar("select payload#>>'{practice,production,qc,defectNote}' from public.projects where id='job-a'") === 'Veneer chip on console 3');
  const revBeforeBlocked = Number(await scalar("select revision from public.projects where id='job-a'"));
  const blockedDispatchSave = await errorCode(() => q("select * from public.project_practice_save('job-a',$1::jsonb,$2)", [
    JSON.stringify(practiceWith({ result: 'passed' }, { ...blankDispatch, vehicle: 'BLOCKED-VAN' })),
    revBeforeBlocked,
  ]));
  check('save with dispatch data is refused while the recorded QC is failed', blockedDispatchSave === '23514');
  check('refused dispatch save leaves the stored vehicle blank', await scalar("select coalesce(payload#>>'{practice,production,dispatch,vehicle}','') from public.projects where id='job-a'") === '');

  // ── legacy tolerance ─────────────────────────────────────────────────────
  const legacyRev = Number(await scalar("select revision from public.projects where id='job-legacy'"));
  const legacySave = await errorCode(() => q("select * from public.project_practice_save('job-legacy',$1::jsonb,$2)", [
    JSON.stringify(practiceWith({ result: 'passed' }, { ...blankDispatch, vehicle: 'OLD-VAN' })),
    legacyRev,
  ]));
  check('legacy passed project without an inspection still saves', legacySave === null);
  check('legacy pass is preserved rather than silently cleared', await scalar("select payload#>>'{practice,production,qc,result}' from public.projects where id='job-legacy'") === 'passed');
  check('legacy project records no inspection', Number(await scalar("select count(*) from public.project_qc_inspections where project_id='job-legacy'")) === 0);

  // ── audit trail ──────────────────────────────────────────────────────────
  const auditCount = Number(await scalar("select count(*) from public.project_production_events where project_id='job-a'"));
  check('production changes are audited', auditCount >= 4);
  check('audit records the actor', await scalar("select count(*) from public.project_production_events where project_id='job-a' and actor=$1", [editor]) > 0);
  check('audit distinguishes QC changes', Number(await scalar("select count(*) from public.project_production_events where project_id='job-a' and action='qc_changed'")) >= 2);
  check('audit distinguishes dispatch changes', Number(await scalar("select count(*) from public.project_production_events where project_id='job-a' and action='dispatch_changed'")) >= 1);
  check('editor can read the audit trail', Number(await scalar("select count(*) from public.project_production_events where project_id='job-a'")) > 0);
  check('editor cannot rewrite the audit trail', (await errorCode(() => q("update public.project_production_events set action='production_updated' where project_id='job-a'"))) === '42501');
  check('editor cannot delete the audit trail', (await errorCode(() => q("delete from public.project_production_events where project_id='job-a'"))) === '42501');
  check('editor cannot forge an inspection row', (await errorCode(() => q("update public.project_qc_inspections set result='passed' where project_id='job-a'"))) === '42501');

  await role('authenticated', viewer);
  check('viewer cannot read the audit detail', Number(await scalar('select count(*) from public.project_production_events')) === 0);

  // ── malformed input ──────────────────────────────────────────────────────
  await role('authenticated', editor);
  check('non-object practice payload is refused', (await errorCode(() => q("select * from public.project_practice_save('job-a','[]'::jsonb,null)"))) === '23514');
  check('missing project is reported', (await errorCode(() => q("select * from public.project_practice_save('no-such-job','{}'::jsonb,null)"))) === 'P0002');
  check('malformed production in a save is refused by the gate', (await errorCode(() => q("select * from public.project_practice_save('job-a',$1::jsonb,null)", [JSON.stringify({ production: { stages: {}, qc: { result: 'pending' }, dispatch: {} } })]))) === '23514');

  // ── rollback leaves data intact ──────────────────────────────────────────
  await role('postgres');
  const beforeDrop = await scalar("select payload#>>'{practice,production,stages,1,note}' from public.projects where id='job-a'");
  await db.exec(`drop trigger if exists project_qc_audit on public.projects;
    drop trigger if exists project_revision_bump on public.projects;
    drop function if exists public.project_practice_save(text, jsonb, integer);
    drop function if exists public.project_qc_record(text, text, text);
    drop function if exists public.log_project_production_change();
    drop function if exists public.bump_project_revision();
    drop table if exists public.project_production_events;
    drop table if exists public.project_qc_inspections;
    alter table public.projects drop column if exists production_updated_by;
    alter table public.projects drop column if exists revision;`);
  check('rollback removes the layer without touching project data',
    await scalar("select payload#>>'{practice,production,stages,1,note}' from public.projects where id='job-a'") === beforeDrop &&
    Number(await scalar("select count(*) from public.projects where id='job-a'")) === 1);

  console.log(`Production QC records: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.close();
}
