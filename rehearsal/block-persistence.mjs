/* Isolated PGlite regression for the block persistence contract
   (M6 BLD-003, migration 00038). Synthetic fixtures only.
   Every block must survive save → journal → publish → revert with the same
   identity, the same props and the same order — and a document the storefront
   would refuse must be refused at save time, not stored and discovered later. */
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
const asObj = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
/** Canonical JSON: jsonb reorders object keys, so compare sorted renderings. */
const canon = (value) => JSON.stringify(value, (_key, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
    : v);
async function errorCode(fn) {
  try { await fn(); return null; } catch (e) { return e.code ?? e.message; }
}
const editor = '11111111-1111-1111-1111-111111111111';
const sales = '33333333-3333-3333-3333-333333333333';
const blob = (n) => 'x'.repeat(n);
const save = (id, blocks, extra = {}) => {
  const { title = 'Contract page', revision = null, seo = '{}' } = extra;
  return q("select * from public.page_save($1,$2, null, null, '{}'::jsonb, $3::jsonb, $4::jsonb, $5)",
    [id, title, JSON.stringify(blocks), seo, revision]);
};
const blocksOf = (snapshot) => asObj(snapshot).blocks;
const idsOf = (blocks) => blocks.map((b) => b?.props?.id);
// `page_snapshot` is internal by design (revoked from every application role), so
// the suite reads it the way the API does — from the owner — and proves the staff
// path separately through `page_preview`.
const pageSnap = async (id) => {
  await role('postgres');
  const blocks = blocksOf(await scalar('select public.page_snapshot($1)', [id]));
  await role('authenticated', editor);
  return blocks;
};
const asPostgres = async (sql, args = []) => {
  await role('postgres');
  const value = await scalar(sql, args);
  await role('authenticated', editor);
  return value;
};

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
  await q("insert into public.pages(slug,title,kind,seo,theme) values ('contract','Contract page','page','{}'::jsonb,'{}'::jsonb)");
  const pageId = Number(await scalar("select id from public.pages where slug='contract'"));

  // ── 1. authored ids survive a save ──────────────────────────────────────
  const authored = [
    { type: 'Heading', props: { id: 'hero-title', title: 'Office furniture, made in Lahore', level: 'h1' } },
    { type: 'FeatureGrid', props: { id: 'grid-1', items: [{ title: 'A', body: 'one' }, { title: 'B', body: 'two' }] } },
    { type: 'FaqAccordion', props: { id: 'faq_2026', items: [{ q: 'Lead time?', a: '4 weeks' }] } },
  ];
  await role('authenticated', editor);
  await save(pageId, authored);
  let stored = await pageSnap(pageId);
  check('a save keeps every authored id', idsOf(stored).join(',') === 'hero-title,grid-1,faq_2026');
  check('a save keeps every block type', stored.map((b) => b.type).join(',') === 'Heading,FeatureGrid,FaqAccordion');
  check('a save keeps nested props intact',
    canon(stored[1].props.items) === canon(authored[1].props.items));
  check('blocks come back in authored order',
    stored.map((b) => b.props.id).join(',') === authored.map((b) => b.props.id).join(','));
  check('sort is contiguous from zero',
    (await q('select sort from public.page_blocks where page_id=$1 order by sort', [pageId])).rows.map((r) => Number(r.sort)).join(',') === '0,1,2');

  // ── 2. identity is stable on every later read ───────────────────────────
  const again = await pageSnap(pageId);
  check('re-reading the page does not churn block ids', idsOf(again).join(',') === idsOf(stored).join(','));
  check('the mirrored block_id column agrees with props.id',
    (await q('select block_id from public.page_blocks where page_id=$1 order by sort', [pageId])).rows.map((r) => r.block_id).join(',')
      === 'hero-title,grid-1,faq_2026');

  // ── 3. a client that sends no ids gets stable ones ──────────────────────
  await save(pageId, [{ type: 'Paragraph', props: { text: 'first' } }, { type: 'Paragraph', props: { text: 'second' } }]);
  const generated = await pageSnap(pageId);
  check('a block saved without an id gets a deterministic one', idsOf(generated).join(',') === 'b0,b1');
  check('the generated id is written into props, not just the mirror',
    generated.every((b) => typeof b.props.id === 'string' && b.props.id.length > 0));
  check('the generated id survives the next read', idsOf(await pageSnap(pageId)).join(',') === 'b0,b1');
  check('the generated id keeps the block content intact',
    generated[0].props.text === 'first' && generated[1].props.text === 'second');

  // ── 4. the journal, the publish and the revert all agree ────────────────
  await save(pageId, authored);
  const rev = Number(await scalar('select revision from public.pages where id=$1', [pageId]));
  await q('select * from public.page_publish($1, true, $2)', [pageId, rev]);
  const live = asObj(await scalar("select public.published_page('contract')"));
  check('publishing keeps authored ids in the public document', idsOf(live.blocks).join(',') === 'hero-title,grid-1,faq_2026');

  await save(pageId, [{ type: 'Paragraph', props: { id: 'later-edit', text: 'draft moved on' } }]);
  const liveAfterDraft = asObj(await scalar("select public.published_page('contract')"));
  check('a later draft save cannot change the published ids', idsOf(liveAfterDraft.blocks).join(',') === 'hero-title,grid-1,faq_2026');
  check('the published snapshot is a frozen copy of what was published',
    JSON.stringify(liveAfterDraft.blocks) === JSON.stringify(live.blocks));
  check('the draft really did move on', idsOf(await pageSnap(pageId)).join(',') === 'later-edit');

  // ── 5. revert restores identities, not just content ─────────────────────
  await role('postgres');
  const journal = (await q('select version, snapshot from public.page_versions where page_id=$1 order by version', [pageId])).rows;
  await role('authenticated', editor);
  const authoredVersion = journal.find((row) => idsOf(asObj(row.snapshot).blocks ?? []).includes('hero-title'));
  check('the journal kept the authored document', Boolean(authoredVersion));
  await q('select * from public.page_revert($1, $2)', [pageId, Number(authoredVersion.version)]);
  check('revert restores every authored id', idsOf(await pageSnap(pageId)).join(',') === 'hero-title,grid-1,faq_2026');
  check('revert restores the block order', idsOf(await pageSnap(pageId)).join(',') === 'hero-title,grid-1,faq_2026');
  check('revert does not touch the live page',
    idsOf(asObj(await scalar("select public.published_page('contract')")).blocks).join(',') === 'hero-title,grid-1,faq_2026');

  // ── 6. documents the storefront would refuse are refused here ───────────
  const beforeRefusals = {
    revision: Number(await scalar('select revision from public.pages where id=$1', [pageId])),
    versions: Number(await asPostgres('select count(*) from public.page_versions where page_id=$1', [pageId])),
    ids: idsOf(await pageSnap(pageId)).join(','),
  };
  const refusals = [
    ['a block with no type', [{ props: { id: 'x1' } }]],
    ['a blank type', [{ type: '   ', props: { id: 'x2' } }]],
    ['a type that is not an identifier', [{ type: 'Heading; drop table pages', props: {} }]],
    ['props that are not an object', [{ type: 'Heading', props: 'not-an-object' }]],
    ['a duplicate block id', [{ type: 'Heading', props: { id: 'dup' } }, { type: 'Paragraph', props: { id: 'dup' } }]],
    ['an id the storefront rejects', [{ type: 'Heading', props: { id: 'bad id!' } }]],
    ['a block that is not an object', ['just-a-string']],
    ['201 blocks', Array.from({ length: 201 }, (_, i) => ({ type: 'Spacer', props: { id: `s${i}` } }))],
    ['a payload over 512 KB', [{ type: 'RichText', props: { id: 'big', html: blob(560000) } }]],
  ];
  for (const [label, blocks] of refusals) {
    check(`refuses ${label} with 22023`, (await errorCode(() => save(pageId, blocks))) === '22023');
  }
  const afterRefusals = {
    revision: Number(await scalar('select revision from public.pages where id=$1', [pageId])),
    versions: Number(await asPostgres('select count(*) from public.page_versions where page_id=$1', [pageId])),
    ids: idsOf(await pageSnap(pageId)).join(','),
  };
  check('a refused save leaves the revision alone', afterRefusals.revision === beforeRefusals.revision);
  check('a refused save writes no journal entry', afterRefusals.versions === beforeRefusals.versions);
  check('a refused save leaves the blocks alone', afterRefusals.ids === beforeRefusals.ids);

  // ── 7. the edges that must still work ───────────────────────────────────
  await save(pageId, []);
  check('an empty page is a valid document', (await pageSnap(pageId)).length === 0);
  await save(pageId, [{ type: 'A', props: {} }]);
  check('a single-letter type is still a type', (await pageSnap(pageId))[0].type === 'A');
  await save(pageId, [{ type: 'Heading', props: { id: 'a-b_C-9' } }]);
  check('ids with dashes and underscores are accepted', idsOf(await pageSnap(pageId)).join(',') === 'a-b_C-9');
  await save(pageId, [{ type: 'Heading', props: { id: 'x'.repeat(120) } }]);
  check('a 120-character id is the longest allowed', idsOf(await pageSnap(pageId))[0].length === 120);

  // ── 8. permissions and rollback ─────────────────────────────────────────
  await role('authenticated', sales);
  check('a sales seat still cannot save a page', ['42501', 'P0001'].includes(String(await errorCode(() => save(pageId, authored)))));
  const kept = (await pageSnap(pageId)).length;
  await role('postgres');
  await db.exec('drop function if exists public.page_save(bigint, text, text, text, jsonb, jsonb, jsonb, integer);');
  check('rollback leaves the stored blocks intact',
    kept === Number(await scalar('select count(*) from public.page_blocks where page_id=$1', [pageId])));
  check('rollback keeps the mirrored identity column',
    (await q('select block_id from public.page_blocks where page_id=$1', [pageId])).rows.every((r) => typeof r.block_id === 'string' && r.block_id.length > 0));
  check('rollback removes the save path', (await errorCode(() => save(pageId, authored))) !== null);
} catch (e) {
  console.log(`FAIL  block persistence suite crashed -- ${e.message}`);
  failed++;
}
console.log(`\nBlock persistence: ${passed} passed, ${failed} failed (local PGlite; no hosted pages)`);
await db.close();
process.exit(failed ? 1 : 0);
