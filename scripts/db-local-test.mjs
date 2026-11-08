/**
 * WOODEX · local tested database — a PERSISTENT, file-backed Postgres (pglite)
 * with all migrations 0001–0014 + supabase/seed.sql applied and verified.
 *
 * Unlike `npm run test:rehearsal` (ephemeral, in-memory, adversarial RLS matrix),
 * this creates an on-disk test DB you can re-open and inspect, and proves the
 * full migration chain + seed apply clean on a real (local) database file.
 *
 * Run:   npm run test:db            (apply if empty · verify always)
 *        npm run test:db -- --reset (wipe and rebuild from scratch)
 *
 * The DB lives at .local-db/woodex-test/ (gitignored — never committed).
 * NOT a Supabase replacement and NOT hosted — hosted apply is owner-gated
 * (see docs/07-admin-integration §10 for the runbook).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_DIR = path.join(ROOT, '.local-db', 'woodex-test');
const MIGDIR = path.join(ROOT, 'supabase', 'migrations');
const SEED = path.join(ROOT, 'supabase', 'seed.sql');
const RESET = process.argv.includes('--reset');

async function loadPGlite() {
  try {
    return await import('@electric-sql/pglite');
  } catch {
    console.log('[db] @electric-sql/pglite missing — bootstrapping (npm --no-save)…');
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '@electric-sql/pglite@^0.5.15'], { stdio: 'inherit' });
    if (r.status !== 0) { console.error('[db] bootstrap install failed — check npm registry reachability'); process.exit(2); }
    return import('@electric-sql/pglite');
  }
}

const AUTH_STUB = `create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.test_uid', true), '')::uuid $$;`;
const STORAGE_STUB = `create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now(), updated_at timestamptz not null default now());
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id) on delete cascade, name text not null, owner text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), metadata jsonb, unique (bucket_id, name));
  alter table storage.objects enable row level security;`;

const results = [];
const ok = (n, c, extra = '') => { results.push([n, !!c]); console.log((c ? 'PASS' : 'FAIL') + '  ' + n + (extra ? '  — ' + extra : '')); };

(async () => {
  if (RESET && fs.existsSync(DB_DIR)) fs.rmSync(DB_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(DB_DIR), { recursive: true });

  const { PGlite } = await loadPGlite();
  const fresh = !fs.existsSync(path.join(DB_DIR, 'PG_VERSION')) && !fs.existsSync(DB_DIR);
  const db = new PGlite(DB_DIR);

  if (fresh) {
    console.log('[db] fresh database at .local-db/woodex-test — applying stubs + migrations + seed…');
    await db.exec(AUTH_STUB);
    await db.exec(STORAGE_STUB);
    const migs = fs.readdirSync(MIGDIR).filter(f => f.endsWith('.sql')).sort();
    for (const f of migs) {
      try { await db.exec(fs.readFileSync(path.join(MIGDIR, f), 'utf8')); }
      catch (e) { console.error('MIGRATION FAIL ' + f + ': ' + e.message); process.exit(2); }
    }
    console.log(`[db] migrations applied CLEAN (${migs.length} files)`);
    await db.exec(fs.readFileSync(SEED, 'utf8'));
    console.log('[db] seed applied CLEAN');
    await db.exec(`create table if not exists public._woodex_db_meta (key text primary key, value text not null);
      alter table public._woodex_db_meta enable row level security;
      insert into public._woodex_db_meta(key, value) values ('applied_at', now()::text) on conflict (key) do update set value = excluded.value`);
  } else {
    console.log('[db] existing database reused — verification only (use --reset to rebuild)');
  }

  /* ── verification report ─────────────────────────────────────────────── */
  const q = async (sql, params) => (await db.query(sql, params)).rows;

  const tables = await q(`select count(*)::int as c from pg_tables where schemaname = 'public'`);
  ok('public schema has the full table set (>= 40)', tables[0].c >= 40, `${tables[0].c} tables`);

  const noRls = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`);
  ok('every public table has row level security enabled', noRls.length === 0, noRls.length ? 'missing: ' + noRls.map(r => r.relname).join(', ') : 'all tables RLS-protected');

  const products = await q(`select count(*)::int as c from public.products`);
  ok('seed: catalogue loaded (148 products)', products[0].c === 148, `${products[0].c} products`);
  const categories = await q(`select count(*)::int as c from public.categories`);
  ok('seed: categories loaded (19)', categories[0].c === 19, `${categories[0].c} categories`);
  const series = await q(`select count(*)::int as c from public.series`);
  ok('seed: series loaded (5)', series[0].c === 5, `${series[0].c} series`);

  const hasCap = await q(`select proname from pg_proc where proname = 'has_cap'`);
  ok('has_cap() helper exists (RLS capability model)', hasCap.length === 1);

  const genCol = await q(`select is_generated from information_schema.columns where table_name = 'project_actuals' and column_name = 'amount'`);
  ok('project_actuals.amount is GENERATED (qty × rate)', genCol[0]?.is_generated === 'ALWAYS');

  const policies = await q(`select count(*)::int as c from pg_policies where tablename in ('project_actuals', 'project_cost_codes')`);
  ok('actuals ledger RLS policies present (8)', policies[0].c === 8, `${policies[0].c} policies`);

  const bucket = await q(`select public::text || ' / ' || file_size_limit::text as s from storage.buckets where id = 'projects'`);
  ok('projects bucket exists — private, 50 MB cap', bucket[0]?.s === 'false / 52428800', String(bucket[0]?.s));

  const bucketPolicies = await q(`select count(*)::int as c from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'projects_bucket_%'`);
  ok('storage bucket policies present (4: read/insert/update/delete)', bucketPolicies[0].c === 4, `${bucketPolicies[0].c} policies`);

  const meta = await q(`select value from public._woodex_db_meta where key = 'applied_at'`);
  ok('db meta marker present (fresh apply recorded)', !!meta[0]?.value, meta[0]?.value);

  const fail = results.filter(r => !r[1]).length;
  console.log(`\nLOCAL TEST DB ${fail === 0 ? 'READY' : 'INCOMPLETE'} — .local-db/woodex-test (${results.length - fail}/${results.length} checks passed)`);
  if (fail === 0) console.log('Inspect with any pglite client pointed at that directory, or rebuild with: npm run test:db -- --reset');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
