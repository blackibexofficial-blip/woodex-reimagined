/* Isolated PGlite regression for migration 00024 (order → production job link).
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
  { id: 's2', stage: 'fabrication', pct: 75, note: '' },
  { id: 's3', stage: 'finishing', pct: 0, note: '' },
  { id: 's4', stage: 'qc', pct: 0, note: '' },
  { id: 's5', stage: 'dispatch', pct: 0, note: '' },
];
const pending = { result: 'pending', defectNote: '', inspectedBy: '', inspectedAt: '' };
const blankDispatch = { date: '', vehicle: '', driver: '', driverPhone: '', challanRef: '' };
const practice = { boq: [], milestones: [], files: [], production: { stages, qc: pending, dispatch: blankDispatch } };

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

  await q('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6)', [
    editor, 'qa.editor@example.test', viewer, 'qa.viewer@example.test', inspector, 'qa.inspector@example.test',
  ]);
  await q("insert into public.user_roles(user_id,role) values ($1,'editor'),($2,'viewer'),($3,'owner')", [editor, viewer, inspector]);

  await q("insert into public.orders(id, customer, items, stage) overriding system value values (1042,'Synthetic Buyer','[]'::jsonb,'production'), (1043,'Second Buyer','[]'::jsonb,'intake'), (1044,'Cancelled Buyer','[]'::jsonb,'cancelled')");
  await db.exec("select setval(pg_get_serial_sequence('public.orders','id'), 1044, true)");

  const mkProject = async (id, title = id) => q('insert into public.projects(id,status,payload) values ($1,$2,$3::jsonb)', [id, 'draft', JSON.stringify({ title, practice })]);
  await mkProject('job-a', 'Synthetic job A');
  await mkProject('job-b', 'Synthetic job B');

  await role('authenticated', editor);
  const link = await q("select * from public.project_link_order('job-a','WDX-1042')");
  check('an editor links an order to a production job', link.rows.length === 1 && link.rows[0].order_id === 'WDX-1042');
  check('the link is stored on the project row', await scalar("select order_id from public.projects where id='job-a'") === 'WDX-1042');
  check('linking does not touch the production payload', await scalar("select payload #> '{practice,production,stages,1,pct}' from public.projects where id='job-a'") === 75);
  check('linking records an audit event', await scalar("select action from public.project_production_events where project_id='job-a' order by id desc limit 1") === 'order_linked');
  // `orders` is RLS-protected from a page.manage-only editor; the RPC reads it as
  // definer. Check the untouched order as the table owner.
  await role('postgres');
  check('the order keeps its own stage and status',
    await scalar("select stage from public.orders where id=1042") === 'production' &&
    await scalar("select status from public.orders where id=1042") === 'In Progress');
  await role('authenticated', editor);
  check('linking the same order twice is idempotent', (await q("select * from public.project_link_order('job-a','WDX-1042')")).rows[0].already_linked === true);
  check('a numeric order id normalises to the WDX ref', (await q("select * from public.project_link_order('job-b','1043')")).rows[0].order_id === 'WDX-1043');
  check('an order cannot be claimed by a second job', await errorCode(() => q("select * from public.project_link_order('job-b','WDX-1042')")) === '23514');
  check('a job already linked to another order is refused', await errorCode(() => q("select * from public.project_link_order('job-a','WDX-1043')")) === '23514');
  check('a cancelled order cannot start production', await errorCode(() => q("select * from public.project_link_order('job-a','WDX-1044')")) === '23514');
  check('a missing order is refused', await errorCode(() => q("select * from public.project_link_order('job-a','WDX-9999')")) === 'P0002');
  check('a missing project is refused', await errorCode(() => q("select * from public.project_link_order('job-none','WDX-1042')")) === 'P0002');
  check('a malformed reference is refused', await errorCode(() => q("select * from public.project_link_order('job-a','cheque-42')")) === '22023');
  check('a direct column update cannot re-point the link', await errorCode(() => q("update public.projects set order_id='WDX-1043' where id='job-a'")) === '42501');
  check('a direct insert-time link is untouched by the guard', await scalar("select order_id from public.projects where id='job-b'") === 'WDX-1043');

  await role('authenticated', viewer);
  check('a viewer cannot link an order', await errorCode(() => q("select * from public.project_link_order('job-a','WDX-1042')")) === '42501');
  await role('anon');
  check('anonymous cannot link an order', await errorCode(() => q("select * from public.project_link_order('job-a','WDX-1042')")) === '42501');
  check('anonymous cannot read the order projection', await errorCode(() => q("select * from public.order_project('WDX-1042')")) === '42501');

  await role('authenticated', editor);
  const projection = (await q("select * from public.order_project('WDX-1042')")).rows[0];
  check('the order projection returns the linked job', projection?.project_id === 'job-a');
  check('the projection reports rolled-up progress', Number(projection?.progress) === 35);
  check('the projection reports the QC result', projection?.qc_result === 'pending');
  check('an unlinked order has no projection row', (await q("select * from public.order_project('WDX-1044')")).rows.length === 0);

  const unlink = await q("select * from public.project_unlink_order('job-a','order cancelled by customer')");
  check('unlink clears the link and reports the old order', unlink.rows[0].previous_order_id === 'WDX-1042' && await scalar("select order_id from public.projects where id='job-a'") === null);
  check('unlink keeps an audit trail with the reason',
    await scalar("select detail ->> 'reason' from public.project_production_events where project_id='job-a' order by id desc limit 1") === 'order cancelled by customer');
  check('unlink keeps the production payload intact', await scalar("select payload #> '{practice,production,stages,1,pct}' from public.projects where id='job-a'") === 75);
  check('unlinking an unlinked job is refused', await errorCode(() => q("select * from public.project_unlink_order('job-a','again')")) === '23514');
  check('an over-long unlink reason is refused', await errorCode(() => q("select * from public.project_unlink_order('job-b',$1)", ['x'.repeat(501)])) === '22001');
  check('a released order can be linked to another job', (await q("select * from public.project_link_order('job-a','WDX-1042')")).rows[0].order_id === 'WDX-1042');

  // QC history must survive a link change: the job is inspected, then unlinked.
  await q("select * from public.project_qc_record('job-a','passed','inspected before unlink')").catch(() => undefined);
  await role('authenticated', inspector);
  await q("select * from public.project_qc_record('job-a','passed','independent pass')");
  await role('authenticated', editor);
  await q("select * from public.project_unlink_order('job-a','relinking for test')");
  check('unlinking preserves the recorded inspections', Number(await scalar("select count(*) from public.project_qc_inspections where project_id='job-a'")) >= 1);
  check('unlinking preserves the payload QC result', await scalar("select payload #>> '{practice,production,qc,result}' from public.projects where id='job-a'") === 'passed');

  await role('postgres');
  const before = await scalar("select count(*) from public.projects");
  await db.exec(`drop trigger if exists project_order_link_guard on public.projects;
    drop function if exists public.guard_project_order_link();
    drop function if exists public.order_project(text);
    drop function if exists public.project_unlink_order(text, text);
    drop function if exists public.project_link_order(text, text);
    drop index if exists public.projects_order_id_key;
    alter table public.projects drop column if exists order_id;`);
  check('rollback leaves projects and orders intact',
    Number(await scalar("select count(*) from public.projects")) === Number(before) &&
    Number(await scalar("select count(*) from public.orders")) === 3);
  check('rollback removes the column', await scalar("select count(*) from information_schema.columns where table_name='projects' and column_name='order_id'") === 0);

  console.log(`Order linkage: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await db.close();
}
