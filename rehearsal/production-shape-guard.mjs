/* Isolated PGlite regression for migration 00023 (production payload shape).
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
const blankStages = [
  { id: 's1', stage: 'material_prep', pct: 100, note: '' },
  { id: 's2', stage: 'fabrication', pct: 60, note: 'CNC booked' },
  { id: 's3', stage: 'finishing', pct: 0, note: '' },
  { id: 's4', stage: 'qc', pct: 0, note: '' },
  { id: 's5', stage: 'dispatch', pct: 0, note: '' },
];
const blankDispatch = { date: '', vehicle: '', driver: '', driverPhone: '', challanRef: '' };
const pending = { result: 'pending', defectNote: '', inspectedBy: '', inspectedAt: '' };
const practiceWith = (production) => ({ boq: [], milestones: [], files: [], production });

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
  await q('insert into auth.users(id,email) values ($1,$2),($3,$4)', [editor, 'qa.editor@example.test', inspector, 'qa.inspector@example.test']);
  await q("insert into public.user_roles(user_id,role) values ($1,'editor'),($2,'editor')", [editor, inspector]);

  const insert = async (id, payload) => errorCode(() => q('insert into public.projects(id,status,payload) values ($1,$2,$3::jsonb)', [id, 'draft', JSON.stringify(payload)]));

  check('a complete production block is accepted', await insert('job-ok', { title: 'OK', practice: practiceWith({ stages: blankStages, qc: { ...pending }, dispatch: { ...blankDispatch } }) }) === null);
  check('a project without production is accepted', await insert('job-plain', { title: 'Plain' }) === null);
  check('an empty stage list is accepted', await insert('job-empty-stages', { title: 'Empty', practice: practiceWith({ stages: [], qc: { ...pending }, dispatch: { ...blankDispatch } }) }) === null);

  const badStage = (stage) => ({ title: 'Bad', practice: practiceWith({ stages: [stage], qc: { ...pending }, dispatch: { ...blankDispatch } }) });
  check('an unknown stage name is rejected', await insert('bad-stage-name', badStage({ id: 'x', stage: 'polishing', pct: 10, note: '' })) === '23514');
  check('a stage without a name is rejected', await insert('bad-stage-missing', badStage({ id: 'x', pct: 10 })) === '23514');
  check('a duplicate stage is rejected', await insert('bad-stage-dupe', { title: 'Dup', practice: practiceWith({ stages: [{ id: 'a', stage: 'fabrication', pct: 10, note: '' }, { id: 'b', stage: 'fabrication', pct: 20, note: '' }], qc: { ...pending }, dispatch: {} }) }) === '23514');
  check('a percentage above 100 is rejected', await insert('bad-pct-high', badStage({ id: 'x', stage: 'fabrication', pct: 120, note: '' })) === '23514');
  check('a negative percentage is rejected', await insert('bad-pct-low', badStage({ id: 'x', stage: 'fabrication', pct: -5, note: '' })) === '23514');
  check('a text percentage is rejected', await insert('bad-pct-text', badStage({ id: 'x', stage: 'fabrication', pct: '50', note: '' })) === '23514');
  check('a non-text note is rejected', await insert('bad-note', badStage({ id: 'x', stage: 'fabrication', pct: 5, note: 7 })) === '23514');
  check('a non-text stage id is rejected', await insert('bad-id', badStage({ id: 9, stage: 'fabrication', pct: 5, note: '' })) === '23514');
  check('a non-object stage is rejected', await insert('bad-stage-shape', { title: 'Shape', practice: practiceWith({ stages: ['fabrication'], qc: { ...pending }, dispatch: {} }) }) === '23514');
  check('a non-array stage list is rejected', await insert('bad-stages-type', { title: 'Types', practice: practiceWith({ stages: {}, qc: { ...pending }, dispatch: {} }) }) === '23514');

  check('an invalid QC result is rejected', await insert('bad-qc', { title: 'QC', practice: practiceWith({ stages: blankStages, qc: { ...pending, result: 'approved' }, dispatch: {} }) }) === '23514');
  check('a non-object QC block is rejected', await insert('bad-qc-type', { title: 'QC2', practice: practiceWith({ stages: blankStages, qc: 'passed', dispatch: {} }) }) === '23514');
  check('a non-text QC note is rejected', await insert('bad-qc-note', { title: 'QC3', practice: practiceWith({ stages: blankStages, qc: { ...pending, defectNote: 42 }, dispatch: {} }) }) === '23514');

  check('a non-object dispatch block is rejected', await insert('bad-dispatch-type', { title: 'D1', practice: practiceWith({ stages: blankStages, qc: { ...pending }, dispatch: [] }) }) === '23514');
  check('a non-text known dispatch field is rejected', await insert('bad-dispatch-field', { title: 'D2', practice: practiceWith({ stages: blankStages, qc: { ...pending }, dispatch: { ...blankDispatch, vehicle: 12 } }) }) === '23514');
  // Dispatch shape checks run on a job with a recorded pass, because the 00021
  // gate independently refuses populated dispatch data while QC is pending.
  await q("insert into public.projects(id,status,payload) values ('job-passed','draft',$1::jsonb)", [JSON.stringify({ title: 'Passed', practice: practiceWith({ stages: blankStages, qc: { ...pending }, dispatch: { ...blankDispatch } }) })]);
  await role('authenticated', editor);
  await q("select * from public.project_qc_record('job-passed','passed','ready')");
  const updateDispatch = async (dispatch) => errorCode(() => q("update public.projects set payload=jsonb_set(payload,'{practice,production,dispatch}',$1::jsonb) where id='job-passed'", [JSON.stringify(dispatch)]));
  check('an unknown dispatch field holding a plain value is tolerated', (await updateDispatch({ ...blankDispatch, future: 'free text' })) === null);
  check('an unknown dispatch field holding an object is rejected', (await updateDispatch({ ...blankDispatch, future: { nested: true } })) === '23514');
  check('the rejected nested value is not stored', await scalar("select coalesce(payload #>> '{practice,production,dispatch,future}', '') from public.projects where id='job-passed'") === 'free text');
  await role('postgres');

  check('a non-array BOQ object is rejected on write', await insert('bad-boq', { title: 'B', practice: { boq: {}, milestones: [], files: [], production: { stages: blankStages, qc: { ...pending }, dispatch: {} } } }) === '23514');
  check('JSON null collections are tolerated as absent', await insert('ok-null-boq', { title: 'B2', practice: { boq: null, milestones: null, files: null, production: { stages: blankStages, qc: { ...pending }, dispatch: {} } } }) === null);
  check('a non-array milestone list is rejected on write', await insert('bad-milestones', { title: 'M', practice: { boq: [], milestones: {}, files: [], production: { stages: blankStages, qc: { ...pending }, dispatch: {} } } }) === '23514');
  check('a non-array file list is rejected on write', await insert('bad-files', { title: 'F', practice: { boq: [], milestones: [], files: 'none', production: { stages: blankStages, qc: { ...pending }, dispatch: {} } } }) === '23514');

  // Historical rows are inserted with the guard disabled to imitate data that
  // predates this migration.
  await db.exec('alter table public.projects disable trigger project_production_shape_guard');
  await q("insert into public.projects(id,status,payload) values ('job-legacy-shape','draft',$1::jsonb)", [JSON.stringify({
    title: 'Legacy shape',
    practice: { boq: null, milestones: [], files: [], production: { stages: [{ id: 'x', stage: 'polishing', pct: 250, note: 7 }], qc: { ...pending }, dispatch: { ...blankDispatch } } },
  })]);
  await db.exec('alter table public.projects enable trigger project_production_shape_guard');

  await role('authenticated', editor);
  const legacyTitleEdit = await errorCode(() => q("update public.projects set payload=jsonb_set(payload,'{title}',to_jsonb('Renamed'::text)) where id='job-legacy-shape'"));
  check('an unchanged legacy shape does not block unrelated edits', legacyTitleEdit === null);
  const legacyProdEdit = await errorCode(() => q("update public.projects set payload=jsonb_set(payload,'{practice,production,stages,0,pct}',to_jsonb(50)) where id='job-legacy-shape'"));
  check('editing a malformed legacy stage is rejected until repaired', legacyProdEdit === '23514');
  const legacyInspection = await errorCode(() => q("select * from public.project_qc_record('job-legacy-shape','passed','x')"));
  check('an inspection on a malformed legacy payload is rejected', legacyInspection === '23514');

  const repair = await q("select * from public.project_practice_save('job-legacy-shape',$1::jsonb,$2)", [
    JSON.stringify(practiceWith({ stages: blankStages, qc: { ...pending }, dispatch: { ...blankDispatch } })),
    Number(await scalar("select revision from public.projects where id='job-legacy-shape'")),
  ]);
  check('the workspace repair path writes a complete record', repair.rows.length === 1);
  check('the repaired record now has a valid stage list', await scalar("select jsonb_array_length(payload #> '{practice,production,stages}') from public.projects where id='job-legacy-shape'") === 5);
  check('the repaired record clears the invalid collection types', await scalar("select jsonb_typeof(payload #> '{practice,boq}') from public.projects where id='job-legacy-shape'") === 'array');
  check('the repair save makes the editor the stage editor',
    await scalar("select production_updated_by::text from public.projects where id='job-legacy-shape'") === editor);
  check('the repairing editor still cannot pass their own work',
    (await errorCode(() => q("select * from public.project_qc_record('job-legacy-shape','passed','repaired and inspected')"))) === '42501');
  await role('authenticated', inspector);
  check('a repaired job accepts an inspection from another person',
    (await errorCode(() => q("select * from public.project_qc_record('job-legacy-shape','passed','repaired and inspected')"))) === null);

  await role('anon');
  check('anonymous cannot execute the shape function directly', (await errorCode(() => q('select public.enforce_project_production_shape()'))) === '42501');

  // Rollback leaves data intact.
  await role('postgres');
  const before = await scalar("select payload #>> '{practice,production,stages,0,note}' from public.projects where id='job-ok'");
  await db.exec(`drop trigger if exists project_production_shape_guard on public.projects;
    drop function if exists public.enforce_project_production_shape();`);
  check('rollback removes the guard without touching project data',
    await scalar("select payload #>> '{practice,production,stages,0,note}' from public.projects where id='job-ok'") === before &&
    Number(await scalar("select count(*) from public.projects")) >= 5);
  await role('authenticated', editor);
  const afterRollback = await errorCode(() => q("update public.projects set payload=jsonb_set(payload,'{practice,production,stages,1,pct}',to_jsonb(250)) where id='job-ok'"));
  check('after rollback the old (unguarded) behaviour returns, as documented', afterRollback === null);

  console.log(`Production shape guard: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.close();
}
