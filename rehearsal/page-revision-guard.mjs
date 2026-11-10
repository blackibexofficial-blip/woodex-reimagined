/* Isolated PGlite regression for migration 00035 (page revision guard) — M6 CMS-002.
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
const sales = '33333333-3333-3333-3333-333333333333';
const viewer = '22222222-2222-2222-2222-222222222222';
const blocks = (text) => JSON.stringify([{ type: 'Heading', props: { text } }]);

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
    editor, 'qa.editor@example.test', sales, 'qa.sales@example.test', viewer, 'qa.viewer@example.test',
  ]);
  await q("insert into public.user_roles(user_id,role) values ($1,'editor'),($2,'sales'),($3,'viewer')", [editor, sales, viewer]);

  await role('postgres');
  await q("insert into public.pages(slug,title,kind,seo,theme) values ('home','Home page','page','{}'::jsonb,'{}'::jsonb)");
  await q("insert into public.pages(slug,title,kind,seo,theme,revision) values ('sneaky','Sneaky','page','{}'::jsonb,'{}'::jsonb, 42)");
  const pageId = Number(await scalar("select id from public.pages where slug='home'"));

  // ── the token is server-stamped ──────────────────────────────────────────
  check('a new page starts at revision 0', Number(await scalar("select revision from public.pages where slug='home'")) === 0);
  check('an insert cannot choose its revision', Number(await scalar("select revision from public.pages where slug='sneaky'")) === 0);
  await role('authenticated', editor);
  check('a client cannot set the revision on an update',
    (await errorCode(() => q("update public.pages set title='Hijack', revision=7 where id=$1", [pageId]))) === '40001');
  check('the refused update left the title alone',
    String(await scalar("select title from public.pages where id=$1", [pageId])) === 'Home page');

  // ── save: the happy path ─────────────────────────────────────────────────
  const saved = (await q("select * from public.page_save($1,'Home v2', null, null, '{}'::jsonb, $2::jsonb, '{}'::jsonb, 0)", [pageId, blocks('First draft')])).rows[0];
  check('a save at the revision read is accepted', String(saved.title) === 'Home v2');
  check('the save bumps the revision', Number(saved.revision) === 1);
  check('the save journals a version', Number(await scalar("select max(version) from public.page_versions where page_id=$1", [pageId])) === 1);
  check('the save replaces the block set', String(await scalar("select props->>'text' from public.page_blocks where page_id=$1", [pageId])) === 'First draft');
  check('a save without a revision still works (back-compat)',
    (await errorCode(() => q("select * from public.page_save($1,'Home v3', null, null, '{}'::jsonb, $2::jsonb, '{}'::jsonb)", [pageId, blocks('Second draft')]))) === null);

  // ── save: a stale editor is refused ──────────────────────────────────────
  const rev = Number(await scalar("select revision from public.pages where id=$1", [pageId]));
  const versionsBefore = Number(await scalar("select count(*) from public.page_versions where page_id=$1", [pageId]));
  check('a save from a stale revision is refused',
    (await errorCode(() => q("select * from public.page_save($1,'Stale title', null, null, '{}'::jsonb, $2::jsonb, '{}'::jsonb, 0)", [pageId, blocks('Stale block')]))) === '40001');
  check('the refused save changed no content',
    String(await scalar("select title from public.pages where id=$1", [pageId])) === 'Home v3' &&
    String(await scalar("select props->>'text' from public.page_blocks where page_id=$1", [pageId])) === 'Second draft');
  check('the refused save journalled nothing',
    Number(await scalar("select count(*) from public.page_versions where page_id=$1", [pageId])) === versionsBefore);
  check('the revision did not move on a refused save',
    Number(await scalar("select revision from public.pages where id=$1", [pageId])) === rev);
  check('a non-array block set is refused',
    (await errorCode(() => q("select * from public.page_save($1,'Bad', null, null, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, $2)", [pageId, rev]))) === '22023');
  check('a missing page is refused',
    (await errorCode(() => q("select * from public.page_save(-1,'Ghost', null, null, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, 0)"))) === 'P0002');

  // ── two editors ──────────────────────────────────────────────────────────
  const shared = Number(await scalar("select revision from public.pages where id=$1", [pageId]));
  await role('authenticated', editor);
  check('the first editor saves',
    (await errorCode(() => q("select * from public.page_save($1,'Editor A', null, null, '{}'::jsonb, $2::jsonb, '{}'::jsonb, $3)", [pageId, blocks('A block'), shared]))) === null);
  check('the second editor holding the old revision is refused',
    (await errorCode(() => q("select * from public.page_save($1,'Editor B', null, null, '{}'::jsonb, $2::jsonb, '{}'::jsonb, $3)", [pageId, blocks('B block'), shared]))) === '40001');
  check('the first save survives',
    String(await scalar("select title from public.pages where id=$1", [pageId])) === 'Editor A');

  // ── publish behind the token ─────────────────────────────────────────────
  const publishRev = Number(await scalar("select revision from public.pages where id=$1", [pageId]));
  check('a stale publish is refused',
    (await errorCode(() => q("select * from public.page_publish($1, true, 0)", [pageId]))) === '40001');
  check('the refused publish left the page a draft',
    String(await scalar("select status from public.pages where id=$1", [pageId])) === 'Draft' &&
    (await scalar("select published_snapshot from public.pages where id=$1", [pageId])) === null);
  const published = (await q("select * from public.page_publish($1, true, $2)", [pageId, publishRev])).rows[0];
  check('publishing at the revision read is accepted', String(published.status) === 'Published');
  check('the published snapshot carries the saved blocks',
    String(published.published_snapshot?.blocks?.[0]?.props?.text) === 'A block');
  check('publishing bumps the revision', Number(published.revision) === publishRev + 1);
  check('a draft save after publishing does not leak into the public snapshot',
    (await errorCode(() => q("select * from public.page_save($1,'Draft two', null, null, '{}'::jsonb, $2::jsonb, '{}'::jsonb, $3)", [pageId, blocks('Private'), publishRev + 1]))) === null &&
    String(await scalar("select published_snapshot->'blocks'->0->'props'->>'text' from public.pages where id=$1", [pageId])) === 'A block');
  const unpublishRev = Number(await scalar("select revision from public.pages where id=$1", [pageId]));
  check('unpublishing clears the public snapshot',
    (await errorCode(() => q("select * from public.page_publish($1, false, $2)", [pageId, unpublishRev]))) === null &&
    (await scalar("select published_snapshot from public.pages where id=$1", [pageId])) === null);

  // ── permissions ──────────────────────────────────────────────────────────
  await role('authenticated', sales);
  check('sales cannot save a page',
    (await errorCode(() => q("select * from public.page_save($1,'Sales', null, null, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb)", [pageId]))) === '42501');
  check('sales cannot publish a page',
    (await errorCode(() => q("select * from public.page_publish($1, true)", [pageId]))) === '42501');
  await role('authenticated', viewer);
  check('a viewer cannot save a page',
    (await errorCode(() => q("select * from public.page_save($1,'Viewer', null, null, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb)", [pageId]))) === '42501');
  await role('anon');
  check('anonymous cannot save a page',
    (await errorCode(() => q("select * from public.page_save($1,'Anon', null, null, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb)", [pageId]))) === '42501');
  check('anonymous cannot publish a page',
    (await errorCode(() => q("select * from public.page_publish($1, true)", [pageId]))) === '42501');

  // ── rollback leaves content alone ────────────────────────────────────────
  await role('postgres');
  const kept = {
    title: String(await scalar("select title from public.pages where id=$1", [pageId])),
    blocks: Number(await scalar("select count(*) from public.page_blocks where page_id=$1", [pageId])),
    revision: Number(await scalar("select revision from public.pages where id=$1", [pageId])),
  };
  await db.exec(`drop function if exists public.page_publish(bigint, boolean, integer);
    drop function if exists public.page_save(bigint, text, text, text, jsonb, jsonb, jsonb, integer);
    drop trigger if exists page_revision_stamp on public.pages;
    drop function if exists public.stamp_page_revision();`);
  check('rollback keeps the page, its blocks and its token',
    String(await scalar("select title from public.pages where id=$1", [pageId])) === kept.title &&
    Number(await scalar("select count(*) from public.page_blocks where page_id=$1", [pageId])) === kept.blocks &&
    Number(await scalar("select revision from public.pages where id=$1", [pageId])) === kept.revision);
} catch (e) {
  console.log(`FAIL  page revision suite crashed -- ${e.message}`);
  failed++;
}
console.log(`\nPage revision guard: ${passed} passed, ${failed} failed (local PGlite; no hosted pages)`);
await db.close();
process.exit(failed ? 1 : 0);
