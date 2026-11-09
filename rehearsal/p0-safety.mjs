/* Isolated PGlite regression for Phase 1 P0 fixes. Never connects to Supabase. */
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
function check(name, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (condition) passed++; else failed++;
}
async function denied(fn) {
  try { await fn(); return false; } catch (e) { return e.code === '42501'; }
}
async function role(name, uid = '') {
  await db.exec(`reset role; select set_config('app.test_uid', '${uid}', false); set role ${name}`);
}
const q = (sql, args = []) => db.query(sql, args);
const scalar = async (sql, args = []) => Object.values((await q(sql, args)).rows[0] ?? {})[0];

try {
  await db.exec(`create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid', true), '')::uuid$$;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner text, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
    alter table storage.objects enable row level security;`);
  const migdir = path.join(ROOT, 'supabase/migrations');
  for (const file of fs.readdirSync(migdir).filter(f => f.endsWith('.sql')).sort()) {
    try { await db.exec(fs.readFileSync(path.join(migdir, file), 'utf8')); }
    catch (e) { throw new Error(`${file}: ${e.message}`); }
  }
  const editor = '11111111-1111-1111-1111-111111111111';
  const viewer = '22222222-2222-2222-2222-222222222222';
  const sales = '33333333-3333-3333-3333-333333333333';
  await db.exec(`insert into auth.users(id,email) values ('${editor}','editor@example.test'),('${viewer}','viewer@example.test'),('${sales}','sales@example.test');
    insert into public.user_roles(user_id,role) values ('${editor}','editor'),('${viewer}','viewer'),('${sales}','sales');
    insert into public.pages(slug,title) values ('p0-test','Initial draft');
    insert into public.page_blocks(page_id,type,props,sort) select id,'Heading','{"text":"Original draft"}',0 from public.pages where slug='p0-test';
    insert into public.projects(id,status,payload) values
      ('public-project','published','{"title":"Public case","active":true,"sortOrder":10,"furnitureUsed":["Chair",{"secret":"nested"}],"testimonial":{"text":"Good","author":"A","role":"Customer","secret":"private"},"practice":{"boq":[{"rate":999}]},"privateNote":"secret"}'),
      ('private-project','draft','{"title":"Unpublished"}'),
      ('inactive-project','published','{"title":"Inactive","active":false}');
    insert into public.products(id,payload,price,stock_qty) values ('p0-test-product','{"name":"Test item"}',100,5);`);
  const id = await scalar("select id from public.pages where slug='p0-test'");

  await role('anon');
  check('anon cannot call private page_snapshot', await denied(() => q('select public.page_snapshot($1)', [id])));
  check('anon cannot read draft page', Number(await scalar('select count(*) from public.pages where id=$1', [id])) === 0);
  check('anon cannot read draft blocks', Number(await scalar('select count(*) from public.page_blocks where page_id=$1', [id])) === 0);
  check('anon cannot read unpublished page via public RPC', await scalar("select public.published_page('p0-test')") === null);
  check('anon cannot execute order RPC', await denied(() => q(`select public.order_submit('[]'::jsonb,'{}'::jsonb,null,null)`)));
  check('anon cannot read raw project payload', Number(await scalar('select count(*) from public.projects')) === 0);
  const portfolio = (await q('select * from public.published_projects()')).rows;
  check('public portfolio returns only active published projects', portfolio.length === 1 && portfolio[0].id === 'public-project');
  const pub = portfolio[0]?.payload ?? {};
  check('public portfolio retains public fields', pub.title === 'Public case' && pub.furnitureUsed?.[0] === 'Chair');
  check('public portfolio excludes private keys and nested extras', !('practice' in pub) && !('privateNote' in pub) && pub.furnitureUsed.length === 1 && !('secret' in pub.testimonial));

  await role('authenticated', viewer);
  check('viewer cannot read project payload', Number(await scalar('select count(*) from public.projects')) === 0);
  check('viewer cannot call private page_snapshot', await denied(() => q('select public.page_snapshot($1)', [id])));
  check('viewer cannot execute order RPC', await denied(() => q(`select public.order_submit('[]'::jsonb,'{}'::jsonb,null,null)`)));
  check('viewer cannot publish', await denied(() => q('select public.page_publish($1,true)', [id])));

  await role('authenticated', sales);
  check('sales can read private project for CRM work', Number(await scalar("select count(*) from public.projects where id='public-project' and payload ? 'practice'")) === 1);
  check('sales cannot execute direct order RPC', await denied(() => q(`select public.order_submit('[]'::jsonb,'{}'::jsonb,null,null)`)));

  await role('authenticated', editor);
  check('editor can read private project', Number(await scalar("select count(*) from public.projects where id='public-project'")) === 1);
  await q('select public.page_publish($1,true)', [id]);
  await q(`select public.page_save($1,'Edited title',null,null,'{}'::jsonb,'[{"type":"Heading","props":{"text":"Secret changed draft"}}]'::jsonb,'{}'::jsonb)`, [id]);
  check('editor sees current draft', await scalar("select props->>'text' from public.page_blocks where page_id=$1", [id]) === 'Secret changed draft');
  let invalidSave = false;
  try { await q(`select public.page_save($1,'Bad',null,null,'{}'::jsonb,'{}'::jsonb,'{}'::jsonb)`, [id]); } catch (e) { invalidSave = /blocks must be an array/.test(e.message); }
  check('invalid block save is rejected without deleting draft', invalidSave && await scalar("select props->>'text' from public.page_blocks where page_id=$1", [id]) === 'Secret changed draft');
  await q("update public.pages set slug='unpublished-slug' where id=$1", [id]);
  await role('anon');
  check('anon cannot see edited published-page row', Number(await scalar('select count(*) from public.pages where id=$1', [id])) === 0);
  check('anon cannot see edited published-page blocks', Number(await scalar('select count(*) from public.page_blocks where page_id=$1', [id])) === 0);
  const snapshot = await scalar("select public.published_page('p0-test')");
  check('public snapshot remains original after later draft edit', snapshot?.title === 'Initial draft' && snapshot?.blocks?.[0]?.props?.text === 'Original draft');
  check('unpublished slug is not exposed as a public route', await scalar("select public.published_page('unpublished-slug')") === null);

  await role('authenticated', editor);
  await q('select public.page_revert($1,1)', [id]);
  check('restore published version preserves original blocks', await scalar("select props->>'text' from public.page_blocks where page_id=$1", [id]) === 'Original draft');
  const restoredVersion = await scalar("select max(version) from public.page_versions where page_id=$1 and action='revert:1'", [id]);
  check('restore creates a complete block-bearing version', Number(await scalar("select jsonb_array_length(snapshot->'blocks') from public.page_versions where page_id=$1 and version=$2", [id, restoredVersion])) === 1);
  check('restore version captures restored content, not the previous draft', await scalar("select snapshot->'blocks'->0->'props'->>'text' from public.page_versions where page_id=$1 and version=$2", [id, restoredVersion]) === 'Original draft');
  await q('select public.page_publish($1,false)', [id]);
  const unpublishVersion = await scalar("select max(version) from public.page_versions where page_id=$1 and action='unpublish'", [id]);
  await q('select public.page_revert($1,$2)', [id, unpublishVersion]);
  check('new unpublish revision is restorable', await scalar("select props->>'text' from public.page_blocks where page_id=$1", [id]) === 'Original draft');

  // Simulate pre-0015 legacy histories; the migration does not rewrite old rows.
  await db.exec('reset role');
  await q(`insert into public.page_versions(page_id,version,action,who,snapshot) values
    ($1,900,'publish','legacy','{"published_snapshot":{"title":"Legacy publish","blocks":[{"type":"Heading","props":{"text":"Legacy block"}}]}}'::jsonb),
    ($1,901,'unpublish','legacy','{"title":"No blocks","published_snapshot":null}'::jsonb)`, [id]);
  await role('authenticated', editor);
  await q('select public.page_revert($1,900)', [id]);
  check('legacy publish nested snapshot restores blocks', await scalar("select props->>'text' from public.page_blocks where page_id=$1", [id]) === 'Legacy block');
  let badRestore = false;
  try { await q('select public.page_revert($1,901)', [id]); } catch (e) { badRestore = /no recoverable blocks/.test(e.message); }
  check('irrecoverable legacy version is rejected', badRestore);
  check('failed restore preserves current blocks', await scalar("select props->>'text' from public.page_blocks where page_id=$1", [id]) === 'Legacy block');

  await role('service_role');
  const result = await scalar(`select public.order_submit('[{"productId":"p0-test-product","quantity":1}]'::jsonb,'{"name":"Synthetic","phone":"123","city":"Lahore","address":"Test","rateKey":"p0"}'::jsonb,null,'p0-test-ref')`);
  check('trusted service role can create order via RPC', result?.ref && result?.total > 0);
  const replay = await scalar(`select public.order_submit('[{"productId":"p0-test-product","quantity":1}]'::jsonb,'{"name":"Synthetic","phone":"123","rateKey":"p0"}'::jsonb,null,'p0-test-ref')`);
  check('trusted order replay stays idempotent', replay?.replay === true && replay?.ref === result?.ref);
  await db.exec('reset role');
  check('replayed order decrements stock once', Number(await scalar("select stock_qty from public.products where id='p0-test-product'")) === 4);
  console.log(`\nP0 SAFETY: ${passed} passed, ${failed} failed (local PGlite; hosted verification required)`);
  if (failed) process.exitCode = 1;
} catch (e) {
  console.error('P0 SAFETY ERROR:', e);
  process.exitCode = 2;
} finally {
  await db.close();
}
