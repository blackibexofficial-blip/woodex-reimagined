/* Isolated PGlite regression for migration 00034 (project revision guard) — M5
   PROD-007. Synthetic fixtures only; no hosted project is contacted. */
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
const owner = '55555555-5555-5555-5555-555555555555';
const editor = '11111111-1111-1111-1111-111111111111';
const sales = '33333333-3333-3333-3333-333333333333';
const viewer = '22222222-2222-2222-2222-222222222222';

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
  await q('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6),($7,$8)', [
    owner, 'qa.owner@example.test', editor, 'qa.editor@example.test',
    sales, 'qa.sales@example.test', viewer, 'qa.viewer@example.test',
  ]);
  await q("insert into public.user_roles(user_id,role) values ($1,'owner'),($2,'editor'),($3,'sales'),($4,'viewer')", [owner, editor, sales, viewer]);

  const practice = { boq: [], milestones: [], files: [] };
  await role('postgres');
  await q("insert into public.projects(id,status,payload) values ('job-a','published',$1::jsonb)", [JSON.stringify({ title: 'Walnut kitchen', client: 'Synthetic', practice })]);

  // ── the token is server-managed ──────────────────────────────────────────
  await role('authenticated', editor);
  check('a fresh project starts at revision 0', Number(await scalar("select revision from public.projects where id='job-a'")) === 0);
  check('a direct payload write still bumps the revision',
    (await errorCode(() => q("update public.projects set payload = payload || '{\"note\":\"direct\"}'::jsonb where id='job-a'"))) === null &&
    Number(await scalar("select revision from public.projects where id='job-a'")) === 1);
  check('a client cannot freeze the revision',
    (await errorCode(() => q("update public.projects set payload = payload, revision = 1 where id='job-a'"))) === null &&
    Number(await scalar("select revision from public.projects where id='job-a'")) === 2);
  check('a payload write cannot rewind the revision',
    (await errorCode(() => q("update public.projects set payload = payload, revision = 0 where id='job-a'"))) === null &&
    Number(await scalar("select revision from public.projects where id='job-a'")) === 3);
  check('a status-only write cannot rewind the revision',
    (await errorCode(() => q("update public.projects set status='archived', revision = 0 where id='job-a'"))) === '40001');
  check('the refused status write changed nothing',
    String(await scalar("select status from public.projects where id='job-a'")) === 'published');

  // ── project_update: validation ───────────────────────────────────────────
  const rev = Number(await scalar("select revision from public.projects where id='job-a'"));
  check('a stale revision is refused',
    (await errorCode(() => q("select * from public.project_update('job-a','{\"title\":\"Stale\"}', 0)"))) === '40001');
  check('the refused write changed nothing',
    String(await scalar("select payload->>'title' from public.projects where id='job-a'")) === 'Walnut kitchen' &&
    Number(await scalar("select revision from public.projects where id='job-a'")) === rev);
  check('a missing project is refused',
    (await errorCode(() => q("select * from public.project_update('job-none','{\"title\":\"x\"}')"))) === 'P0002');
  check('a non-object patch is refused',
    (await errorCode(() => q("select * from public.project_update('job-a','[]'::jsonb)"))) === '22023');
  check('the practice cannot be written through the portfolio RPC',
    (await errorCode(() => q("select * from public.project_update('job-a','{\"practice\":{}}'::jsonb)"))) === '22023');
  check('the order link keeps its own RPC',
    (await errorCode(() => q("select * from public.project_update('job-a','{\"orderId\":\"WDX-1\"}'::jsonb)"))) === '22023');
  check('the revision cannot be hand-set',
    (await errorCode(() => q("select * from public.project_update('job-a','{\"revision\":9}'::jsonb)"))) === '22023');
  check('an unknown status is refused',
    (await errorCode(() => q("select * from public.project_update('job-a','{\"status\":\"live\"}'::jsonb)"))) === '22023');

  // ── project_update: the happy path ───────────────────────────────────────
  const updated = (await q("select * from public.project_update('job-a','{\"title\":\"Walnut kitchen v2\",\"sqft\":\"240\",\"status\":\"draft\"}'::jsonb,$1)", [rev])).rows[0];
  check('the patch is accepted at the revision that was read', String(updated.id) === 'job-a');
  check('the title is merged into the payload', String(updated.payload.title) === 'Walnut kitchen v2');
  check('other payload keys are kept', String(updated.payload.client) === 'Synthetic');
  check('the status follows the patch', String(updated.status) === 'draft');
  check('the revision moves by exactly one', Number(updated.revision) === rev + 1);
  check('updatedAt is restamped', /^\d{4}-\d{2}-\d{2}T/.test(String(updated.payload.updatedAt)));
  check('the status is not duplicated into the payload', updated.payload.status === undefined);
  check('the change is audited',
    String(await scalar("select detail->>'keys' from public.project_production_events where action='project_updated' order by id desc limit 1")).includes('title'));
  check('the audit row carries the new revision',
    Number(await scalar("select revision from public.project_production_events where action='project_updated' order by id desc limit 1")) === rev + 1);
  check('a status-only change still bumps the revision',
    Number((await q("select revision from public.project_update('job-a','{\"status\":\"published\"}'::jsonb,$1)", [rev + 1])).rows[0].revision) === rev + 2);

  // ── two editors ──────────────────────────────────────────────────────────
  const shared = Number(await scalar("select revision from public.projects where id='job-a'"));
  await role('authenticated', owner);
  check('the owner saves first',
    (await errorCode(() => q("select * from public.project_update('job-a','{\"title\":\"Owner copy\"}'::jsonb,$1)", [shared]))) === null);
  await role('authenticated', editor);
  check('the second editor holding the old revision is refused',
    (await errorCode(() => q("select * from public.project_update('job-a','{\"title\":\"Editor copy\"}'::jsonb,$1)", [shared]))) === '40001');
  check('the first save survives',
    String(await scalar("select payload->>'title' from public.projects where id='job-a'")) === 'Owner copy');
  check('the practice save keeps its own revision check',
    (await errorCode(() => q("select * from public.project_practice_save('job-a',$1::jsonb,$2)", [JSON.stringify({ ...practice, boq: [{ id: 'b1', section: 'S', item: 'Top', qty: 1, unit: 'pc', rate: 10 }] }), shared]))) === '40001');

  // ── permissions ──────────────────────────────────────────────────────────
  await role('authenticated', sales);
  check('sales cannot update a project',
    (await errorCode(() => q("select * from public.project_update('job-a','{\"title\":\"sales\"}'::jsonb)"))) === '42501');
  check('sales cannot delete a project',
    (await errorCode(() => q("select * from public.project_delete('job-a')"))) === '42501');
  await role('authenticated', viewer);
  check('a viewer cannot update a project',
    (await errorCode(() => q("select * from public.project_update('job-a','{\"title\":\"viewer\"}'::jsonb)"))) === '42501');
  await role('anon');
  check('anonymous cannot update a project',
    (await errorCode(() => q("select * from public.project_update('job-a','{\"title\":\"anon\"}'::jsonb)"))) === '42501');
  check('anonymous cannot delete a project',
    (await errorCode(() => q("select * from public.project_delete('job-a')"))) === '42501');

  // ── delete behind the token ──────────────────────────────────────────────
  await role('authenticated', editor);
  const beforeDelete = Number(await scalar("select revision from public.projects where id='job-a'"));
  check('a stale delete is refused',
    (await errorCode(() => q("select * from public.project_delete('job-a',$1)", [beforeDelete - 1]))) === '40001');
  check('the refused delete kept the job',
    Number(await scalar("select count(*) from public.projects where id='job-a'")) === 1);
  check('a missing project cannot be deleted',
    (await errorCode(() => q("select * from public.project_delete('job-none')"))) === 'P0002');
  check('a current delete is accepted',
    (await errorCode(() => q("select * from public.project_delete('job-a',$1)", [beforeDelete]))) === null);
  check('the delete removed the row',
    Number(await scalar("select count(*) from public.projects where id='job-a'")) === 0);

  // ── rollback leaves the data alone ───────────────────────────────────────
  await role('postgres');
  await q("insert into public.projects(id,status,payload) values ('job-b','published',$1::jsonb)", [JSON.stringify({ title: 'Keep me', practice })]);
  const kept = Number(await scalar("select revision from public.projects where id='job-b'"));
  await db.exec(`drop trigger if exists project_revision_guard on public.projects;
    drop function if exists public.enforce_project_revision();
    drop function if exists public.project_delete(text, integer);
    drop function if exists public.project_update(text, jsonb, integer);`);
  check('rollback keeps the project and its revision',
    Number(await scalar("select revision from public.projects where id='job-b'")) === kept);
  check('rollback removes the guarded write paths',
    (await errorCode(() => q("select * from public.project_update('job-b','{\"title\":\"x\"}'::jsonb)"))) !== null);
} catch (e) {
  console.log(`FAIL  project revision suite crashed -- ${e.message}`);
  failed++;
}
console.log(`\nProject revision guard: ${passed} passed, ${failed} failed (local PGlite; no hosted projects)`);
await db.close();
process.exit(failed ? 1 : 0);
