/* Isolated PGlite regression for the publish pipeline + authenticated preview
   (M6 CMS-001, migration 00036). Synthetic fixtures only; no hosted project is
   contacted. Proves the chain locally: draft → public unchanged → authed preview
   → publish → public → restore. */
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
const pick = async (sql, args = []) => (await q(sql, args)).rows[0];
const asObj = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const textOf = (snap) => asObj(snap)?.blocks?.[0]?.props?.text ?? null;
const publicText = async (slug) => textOf(await scalar('select public.published_page($1)', [slug]));
const previewText = async (slug) => textOf(await scalar('select public.page_preview($1)', [slug]));

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
  await q("insert into public.pages(slug,title,kind,seo,theme) values ('launch','Launch page','page','{}'::jsonb,'{}'::jsonb)");
  const pageId = Number(await scalar("select id from public.pages where slug='launch'"));

  // ── step 1: draft only, nothing public ───────────────────────────────────
  await role('authenticated', editor);
  await q("select * from public.page_save($1,'Launch v1', null, null, '{}'::jsonb, $2::jsonb, '{}'::jsonb, 0)", [pageId, blocks('Draft one')]);
  await role('anon');
  check('a draft page is not public', (await scalar("select public.published_page('launch')")) === null);
  check('an anonymous visitor cannot preview the draft',
    (await errorCode(() => q("select public.page_preview('launch')"))) === '42501');

  // ── step 2: the authenticated preview ────────────────────────────────────
  await role('authenticated', editor);
  const preview = await pick("select public.page_preview('launch') as snap");
  check('a member of staff can preview the draft', textOf(preview.snap) === 'Draft one');
  check('the preview says the page is a draft', String(asObj(preview.snap).status) === 'draft');
  check('the preview carries the revision the editor holds', Number(asObj(preview.snap).revision) === 1);
  check('the preview never carries a published snapshot', asObj(preview.snap).published_at === null);
  check('an unknown slug previews as nothing', (await scalar("select public.page_preview('nope')")) === null);
  await role('authenticated', sales);
  check('sales cannot preview a draft',
    (await errorCode(() => q("select public.page_preview('launch')"))) === '42501');
  await role('authenticated', viewer);
  check('a viewer cannot preview a draft',
    (await errorCode(() => q("select public.page_preview('launch')"))) === '42501');

  // ── step 3: publish ──────────────────────────────────────────────────────
  await role('authenticated', editor);
  const rev = Number(await scalar("select revision from public.pages where id=$1", [pageId]));
  await q("select * from public.page_publish($1, true, $2)", [pageId, rev]);
  await role('anon');
  check('publishing makes the page public', (await publicText('launch')) === 'Draft one');
  check('the public read carries no draft-only columns',
    Object.keys(asObj(await scalar("select public.published_page('launch')"))).sort().join(',') === 'blocks,id,kind,published_at,seo,seo_desc,seo_title,slug,theme,title');

  // ── step 4: a later draft never leaks into the public page ───────────────
  await role('authenticated', editor);
  const rev2 = Number(await scalar("select revision from public.pages where id=$1", [pageId]));
  await q("select * from public.page_save($1,'Launch v2', null, null, '{}'::jsonb, $2::jsonb, '{}'::jsonb, $3)", [pageId, blocks('Draft two'), rev2]);
  await role('anon');
  check('a draft save leaves the public page untouched', (await publicText('launch')) === 'Draft one');
  await role('authenticated', editor);
  check('the authenticated preview shows the newer draft', (await previewText('launch')) === 'Draft two');

  // ── step 5: unpublish hides it again, the draft survives ─────────────────
  const rev3 = Number(await scalar("select revision from public.pages where id=$1", [pageId]));
  await q("select * from public.page_publish($1, false, $2)", [pageId, rev3]);
  await role('anon');
  check('unpublishing removes the public page', (await scalar("select public.published_page('launch')")) === null);
  await role('authenticated', editor);
  check('the draft is still previewable after unpublishing', (await previewText('launch')) === 'Draft two');

  // ── step 6: republish, then restore an earlier draft ─────────────────────
  const rev4 = Number(await scalar("select revision from public.pages where id=$1", [pageId]));
  await q("select * from public.page_publish($1, true, $2)", [pageId, rev4]);
  await role('anon');
  check('republishing serves the current draft', (await publicText('launch')) === 'Draft two');

  await role('authenticated', editor);
  // Version 2 is the journal entry taken before the "Draft two" save, i.e. "Draft one".
  const v2 = asObj(await scalar("select snapshot from public.page_versions where page_id=$1 and version=2", [pageId]));
  check('the journal kept the earlier draft', textOf(v2) === 'Draft one');
  await q('select * from public.page_revert($1, 2)', [pageId]);
  check('restoring puts the earlier draft back in the editor', (await previewText('launch')) === 'Draft one');
  await role('anon');
  check('restoring does not touch the live page', (await publicText('launch')) === 'Draft two');

  await role('authenticated', editor);
  const rev5 = Number(await scalar("select revision from public.pages where id=$1", [pageId]));
  await q("select * from public.page_publish($1, true, $2)", [pageId, rev5]);
  await role('anon');
  check('publishing the restored draft makes it live', (await publicText('launch')) === 'Draft one');

  // ── step 7: slug semantics ───────────────────────────────────────────────
  await role('authenticated', editor);
  await q("update public.pages set slug='launch-2026' where id=$1", [pageId]);
  await role('anon');
  check('the published slug keeps serving after a draft rename', (await publicText('launch')) === 'Draft one');
  check('the new draft slug is not public by itself', (await scalar("select public.published_page('launch-2026')")) === null);
  await role('authenticated', editor);
  check('the preview resolves the renamed draft by its old published slug', (await previewText('launch')) === 'Draft one');
  check('the preview resolves the renamed draft by its new slug', (await previewText('launch-2026')) === 'Draft one');

  // ── rollback ─────────────────────────────────────────────────────────────
  await role('postgres');
  const before = {
    public: await publicText('launch'),
    draft: String(await scalar("select title from public.pages where id=$1", [pageId])),
  };
  await db.exec('drop function if exists public.page_preview(text);');
  check('rollback keeps the live page and the draft',
    (await publicText('launch')) === before.public &&
    String(await scalar("select title from public.pages where id=$1", [pageId])) === before.draft);
  check('rollback removes the preview path', (await errorCode(() => q("select public.page_preview('launch')"))) !== null);
} catch (e) {
  console.log(`FAIL  publish pipeline suite crashed -- ${e.message}`);
  failed++;
}
console.log(`\nCMS publish pipeline: ${passed} passed, ${failed} failed (local PGlite; no hosted pages)`);
await db.close();
process.exit(failed ? 1 : 0);
