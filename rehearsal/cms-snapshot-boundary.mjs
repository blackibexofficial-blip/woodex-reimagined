/* CMS public snapshot boundary tests; isolated local PGlite, never hosted. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let PGlite;
try { ({ PGlite } = await import('@electric-sql/pglite')); }
catch {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '@electric-sql/pglite@^0.5.15'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Could not install local PGlite test dependency');
  ({ PGlite } = await import('@electric-sql/pglite'));
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
let passed = 0, failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const q = (text, args = []) => db.query(text, args);
const scalar = async (text, args = []) => Object.values((await q(text, args)).rows[0] ?? {})[0];
const role = (name, uid = '') => db.exec(`reset role; select set_config('app.test_uid', '${uid}', false); set role ${name}`);
const read = slug => scalar('select public.storefront_page_snapshot($1)', [slug]);
const editor = '11111111-1111-1111-1111-111111111111';
const viewer = '22222222-2222-2222-2222-222222222222';

try {
  await db.exec(`create schema auth;
    create table auth.users(id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid', true), '')::uuid$$;
    create schema storage;
    create table storage.buckets(id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner text, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
    alter table storage.objects enable row level security;`);
  const dir = path.join(root, 'supabase/migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    try { await db.exec(fs.readFileSync(path.join(dir, file), 'utf8')); }
    catch (e) { throw new Error(`${file}: ${e.message}`); }
  }
  await db.exec(`insert into auth.users(id,email) values ('${editor}','editor@example.test'),('${viewer}','viewer@example.test');
    insert into public.user_roles(user_id,role) values ('${editor}','editor'),('${viewer}','viewer');
    insert into public.pages(slug,title,kind,seo,theme) values ('first','Published title','page','{"title":"Published SEO","description":"Public description","noindex":true,"focusKeyphrase":"internal","strictGate":true}'::jsonb,'{}'::jsonb);
    insert into public.page_blocks(page_id,type,props,sort) select id,'Heading','{"text":"Published content"}',0 from public.pages where slug='first';`);
  const id = await scalar("select id from public.pages where slug='first'");

  await role('anon');
  check('missing page returns null', await read('missing') === null);
  check('draft never returned', await read('first') === null);

  await role('authenticated', editor);
  await q('select public.page_publish($1,true)', [id]);
  await q(`select public.page_save($1,'Private draft title','Draft SEO','Draft description','{}'::jsonb,'[{"type":"Heading","props":{"text":"PRIVATE DRAFT"}}]'::jsonb,'{"noindex":false}'::jsonb)`, [id]);
  await q("update public.pages set slug='draft-slug' where id=$1", [id]);

  await role('anon');
  let page = await read('first');
  check('published slug remains available after draft slug changes', page?.slug === 'first');
  check('draft slug is not publicly routable', await read('draft-slug') === null);
  check('published title and content remain unchanged after draft save', page?.title === 'Published title' && page?.blocks?.[0]?.props?.text === 'Published content');
  check('published SEO preserved, internal SEO controls excluded', page?.seo?.title === 'Published SEO' && page?.seo?.noindex === true && !('strictGate' in page.seo) && !('focusKeyphrase' in page.seo));
  check('raw draft text absent from response', !JSON.stringify(page).includes('PRIVATE DRAFT') && !JSON.stringify(page).includes('Private draft title'));
  check('top-level projection includes no nested snapshot or unknown keys', Object.keys(page).sort().join(',') === 'blocks,id,published_at,seo,seo_desc,seo_title,slug,theme,title');

  await role('authenticated', viewer);
  check('viewer receives same public snapshot rather than draft', (await read('first'))?.title === 'Published title');
  await role('authenticated', editor);
  check('editor also receives snapshot from public RPC', (await read('first'))?.title === 'Published title');
  await q('select public.page_publish($1,true)', [id]);
  await role('anon');
  check('republishing moves snapshot to new slug', await read('first') === null && (await read('draft-slug'))?.title === 'Private draft title');
  await role('authenticated', editor);
  await q('select public.page_revert($1,1)', [id]);
  await role('anon');
  check('restore modifies draft, not the public snapshot', (await read('draft-slug'))?.title === 'Private draft title');
  await role('authenticated', editor);
  await q('select public.page_publish($1,false)', [id]);
  await role('anon');
  check('unpublished snapshot becomes unavailable', await read('draft-slug') === null);

  await role('postgres');
  await db.exec(`insert into public.pages(slug,title,kind,status,published_snapshot) values
    ('chrome-draft','Chrome','chrome','Published','{"id":100,"slug":"chrome-only","title":"Chrome","blocks":[]}'::jsonb),
    ('bad-draft','Broken','page','Published','{"id":101,"slug":"bad","title":"Broken","blocks":{}}'::jsonb),
    ('badblock-draft','Broken block','page','Published','{"id":102,"slug":"badblock","title":"Broken","blocks":[{"type":"Heading","props":null}]}'::jsonb),
    ('dup-a','A','page','Published','{"id":103,"slug":"same","title":"A","blocks":[]}'::jsonb),
    ('dup-b','B','page','Published','{"id":104,"slug":"same","title":"B","blocks":[]}'::jsonb),
    ('extra-draft','C','page','Published','{"id":105,"slug":"extra","title":"C","secret":"x","seo":{"noindex":true,"secret":"x"},"blocks":[{"type":"Heading","props":{},"internal":"x"}]}'::jsonb),
    ('invalid-seo','D','page','Published','{"id":106,"slug":"invalid-seo","title":"D","seo":{"noindex":"yes"},"blocks":[]}'::jsonb);`);
  await role('anon');
  check('chrome snapshot is excluded', await read('chrome-only') === null);
  check('invalid blocks shape fails closed', await read('bad') === null);
  check('invalid block fails closed', await read('badblock') === null);
  check('duplicate published slugs fail closed', await read('same') === null);
  page = await read('extra');
  check('legacy extraneous snapshot and block metadata not projected', page && !JSON.stringify(page).includes('secret') && !JSON.stringify(page).includes('internal'));
  check('SEO noindex retained in projection', page?.seo?.noindex === true);
  check('invalid noindex fails closed', (await read('invalid-seo'))?.seo?.noindex === true);
  check('public role has no execute privilege through PUBLIC', !(await scalar("select has_function_privilege('public','public.storefront_page_snapshot(text)','execute')")));
} finally {
  await db.close();
}
console.log(`\nCMS snapshot boundary: ${passed}/${passed + failed} passed`);
if (failed) process.exitCode = 1;
