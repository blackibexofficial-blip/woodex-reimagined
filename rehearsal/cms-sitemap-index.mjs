/* Isolated PGlite regression for the sitemap's only source of CMS truth
   (M6 SEO-001, migration 00037). Synthetic fixtures only. Proves the index never
   lists a draft, always lists a published page, and follows the published slug
   across a rename. */
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
const asArray = (v) => (typeof v === 'string' ? JSON.parse(v) : v) ?? [];
const index = async () => asArray(await scalar('select public.published_page_index()'));
const slugs = async () => (await index()).map((r) => r.slug).sort();
async function errorCode(fn) {
  try { await fn(); return null; } catch (e) { return e.code ?? e.message; }
}
const editor = '11111111-1111-1111-1111-111111111111';
const sales = '33333333-3333-3333-3333-333333333333';
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
  await q('insert into auth.users(id,email) values ($1,$2),($3,$4)', [editor, 'qa.editor@example.test', sales, 'qa.sales@example.test']);
  await q("insert into public.user_roles(user_id,role) values ($1,'editor'),($2,'sales')", [editor, sales]);

  await role('postgres');
  check('an empty instance indexes nothing', (await slugs()).length === 0);

  // ── drafts never appear ─────────────────────────────────────────────────
  await q("insert into public.pages(slug,title,kind,seo,theme) values ('landing','Landing draft','page','{}'::jsonb,'{}'::jsonb)");
  const pageId = Number(await scalar("select id from public.pages where slug='landing'"));
  await role('authenticated', editor);
  await q("select * from public.page_save($1,'Landing v1', null, null, '{}'::jsonb, $2::jsonb, '{}'::jsonb, 0)", [pageId, blocks('Hi')]);
  await role('anon');
  check('a saved draft is not in the index', (await slugs()).length === 0);

  // ── the index is readable by a stranger ─────────────────────────────────
  check('an anonymous visitor can read the index',
    (await errorCode(() => q('select public.published_page_index()'))) === null);
  check('the index is empty, not null, before anything is published', Array.isArray(await index()) && (await index()).length === 0);

  // ── publishing adds exactly one public URL ──────────────────────────────
  await role('authenticated', editor);
  const rev = Number(await scalar('select revision from public.pages where id=$1', [pageId]));
  await q('select * from public.page_publish($1, true, $2)', [pageId, rev]);
  await role('anon');
  let rows = await index();
  check('publishing adds the page to the index', rows.length === 1 && rows[0].slug === 'landing');
  check('the index entry is a page, not chrome', String(rows[0].kind) === 'page');
  check('the index entry carries a real published date',
    typeof rows[0].published_at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rows[0].published_at));
  check('the index exposes only slug, kind and published_at',
    Object.keys(rows[0]).sort().join(',') === 'kind,published_at,slug');

  // ── a later draft never re-enters the index ─────────────────────────────
  await role('authenticated', editor);
  const rev2 = Number(await scalar('select revision from public.pages where id=$1', [pageId]));
  await q("select * from public.page_save($1,'Landing v2', null, null, '{}'::jsonb, $2::jsonb, '{}'::jsonb, $3)", [pageId, blocks('Later'), rev2]);
  await role('anon');
  check('a later draft save leaves the index unchanged', (await slugs()).join(',') === 'landing');

  // ── a rename does not rewrite a live URL ────────────────────────────────
  await role('authenticated', editor);
  await q("update public.pages set slug='landing-2026' where id=$1", [pageId]);
  await role('anon');
  check('a draft rename keeps the published slug in the index', (await slugs()).join(',') === 'landing');

  // ── unpublish removes the URL ───────────────────────────────────────────
  await role('authenticated', editor);
  const rev3 = Number(await scalar('select revision from public.pages where id=$1', [pageId]));
  await q('select * from public.page_publish($1, false, $2)', [pageId, rev3]);
  await role('anon');
  check('unpublishing removes the page from the index', (await slugs()).length === 0);

  // ── republish serves the renamed slug, once ─────────────────────────────
  await role('authenticated', editor);
  const rev4 = Number(await scalar('select revision from public.pages where id=$1', [pageId]));
  await q('select * from public.page_publish($1, true, $2)', [pageId, rev4]);
  await role('anon');
  rows = await index();
  check('republishing lists the new slug', rows.length === 1 && rows[0].slug === 'landing-2026');
  check('the index lists each page exactly once', rows.filter((r) => r.slug === 'landing-2026').length === 1);

  // ── chrome documents are indexed but marked, so the generator can skip them ──
  await role('postgres');
  await q("insert into public.pages(slug,title,kind,seo,theme) values ('site-header','Header','chrome','{}'::jsonb,'{}'::jsonb)");
  const chromeId = Number(await scalar("select id from public.pages where slug='site-header'"));
  await role('authenticated', editor);
  const chromeRev = Number(await scalar('select revision from public.pages where id=$1', [chromeId]));
  await q('select * from public.page_publish($1, true, $2)', [chromeId, chromeRev]);
  await role('anon');
  const withChrome = await index();
  check('a published chrome document is marked as chrome, not as a page',
    withChrome.some((r) => r.slug === 'site-header' && String(r.kind) === 'chrome'));
  check('the index still lists both published documents', withChrome.length === 2);

  // ── permissions and rollback ────────────────────────────────────────────
  await role('authenticated', sales);
  check('a sales seat can read the index', (await errorCode(() => q('select public.published_page_index()'))) === null);
  await role('postgres');
  const before = (await slugs()).join(',');
  await db.exec('drop function if exists public.published_page_index();');
  check('rollback leaves the pages themselves intact',
    String(await scalar("select count(*) from public.pages where published_snapshot is not null")) === '2');
  check('rollback removes the index path', (await errorCode(() => q('select public.published_page_index()'))) !== null);
  check('the service role keeps a way to rebuild the list',
    Number(await scalar("select count(*) from public.pages where lower(status)='published'")) === Number(before.split(',').length));
} catch (e) {
  console.log(`FAIL  sitemap index suite crashed -- ${e.message}`);
  failed++;
}
console.log(`\nCMS sitemap index: ${passed} passed, ${failed} failed (local PGlite; no hosted pages)`);
await db.close();
process.exit(failed ? 1 : 0);
