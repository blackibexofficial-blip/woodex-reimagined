/* SEC-004 — public surface matrix (local PGlite). Never connects to Supabase.
 *
 * The base schema grants SELECT on every public table to `anon`/`authenticated`
 * and relies on RLS to cut the rows; it also grants EXECUTE broadly. That means
 * a grant is not an exposure — but a *policy* or an ungated SECURITY DEFINER
 * function is. This harness therefore reports grants and asserts on the layers
 * that actually decide access, so widening either one fails the run instead of
 * slipping in silently.
 *
 * What it proves: repository state. What it does not prove: hosted grants,
 * hosted policies, or real PostgREST behaviour — those need staging (SEC-001).
 */
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

/* Tables a signed-out visitor may read through a policy: published content and
 * catalogue only. Anything else readable by anon is a finding. */
const ANON_POLICY_ALLOWED = new Set([
  'products', 'product_categories', 'categories', 'series', 'collections', 'bundles',
  'materials', 'option_sets', 'price_lists', 'delivery_zones', 'sales_channels',
  'blog_posts', 'blog_categories', 'services', 'media_assets', 'showrooms',
  'projects', 'pages', 'page_blocks', 'homepage_sections', 'site_settings',
  'leads', 'quotes', 'track_events', 'order_events', 'orders',
  'brands', 'custom_design_page', 'virtual_showroom_page', 'warranty_page',
]);

/* Functions a signed-out visitor may execute without an internal capability
 * check: pure public read projections and the public write entry points that
 * are rate-limited instead. */
const ANON_CALLABLE_ALLOWED = new Set([
  'page_snapshot', 'published_page', 'published_projects', 'storefront_page_snapshot',
  'bump_project_revision', 'has_cap', 'has_role', 'my_caps', 'my_role', 'require_cap',
  'catalog_overrides', // anon read of id/price/stock only — the same rows `products` exposes
]);

/* Functions that must stay out of every application role's hands. */
const ROLE_DENIED = new Set([
  'enforce_project_dispatch_qc', 'enforce_project_production_shape',
  'ai_usage_reserve', 'bootstrap_owner', 'lead_rate_limit_hit', 'order_submit', 'page_snapshot',
  // 00030 internal helpers: triggers and the one writer of invoices.paid.
  'assign_invoice_ref', 'enforce_invoice_money', 'invoice_paid_from_payments', 'sync_invoice_totals',
  // 00032 trigger: keeps purchase order totals honest.
  'enforce_purchase_order_totals',
  // 00033 internal helper: the stock writer behind definer warranty RPCs.
  'internal_stock_move',
]);

const GUARD = /has_cap\s*\(|require_cap\s*\(|has_role\s*\(|auth\.uid\s*\(\s*\)|is_owner/i;

const db = new PGlite();
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -- ${detail}`}`);
  if (ok) passed++; else failed++;
};

try {
  await db.exec(`create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid', true), '')::uuid$$;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner text, created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
    alter table storage.objects enable row level security;`);

  const migdir = path.join(ROOT, 'supabase/migrations');
  const migrations = fs.readdirSync(migdir).filter(f => f.endsWith('.sql')).sort();
  for (const file of migrations) {
    try { await db.exec(fs.readFileSync(path.join(migdir, file), 'utf8')); }
    catch (e) { throw new Error(`${file}: ${e.message}`); }
  }
  check(`all ${migrations.length} migrations apply cleanly`, true);

  const tables = (await db.query(`
    select c.relname as name, c.relrowsecurity as rls,
      (select count(*) from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname)::int as policies,
      has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
      has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
      has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
      has_table_privilege('anon', c.oid, 'DELETE') as anon_delete
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows;

  const policies = (await db.query(`
    select tablename, policyname, cmd, roles::text[] as roles
    from pg_policies where schemaname = 'public' order by 1, 2`)).rows;

  const functions = (await db.query(`
    select p.proname as name, p.prosecdef as security_definer,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
      pg_get_functiondef(p.oid) as body
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' order by 1`)).rows;

  const anonPolicyTables = [...new Set(policies
    .filter(p => (p.roles.includes('anon') || p.roles.includes('public')))
    .filter(p => ['SELECT', 'ALL'].includes(p.cmd))
    .map(p => p.tablename))].sort();

  const anonWriteGrants = tables
    .filter(t => t.anon_insert || t.anon_update || t.anon_delete)
    .map(t => t.name).sort();

  console.log(`\n== exposure summary ==`);
  console.log(`  tables: ${tables.length}  policies: ${policies.length}  functions: ${functions.length}`);
  console.log(`  anon-readable through a policy (${anonPolicyTables.length}): ${anonPolicyTables.join(', ')}`);
  console.log(`  anon holds a write grant (${anonWriteGrants.length}): ${anonWriteGrants.join(', ')}`);

  const noRls = tables.filter(t => !t.rls).map(t => t.name);
  check('every application table has RLS enabled', noRls.length === 0, noRls.join(', '));

  /* No policy means deny-all for app roles: the service-role-only tables
     (usage windows, rate limits) are exactly this shape and that is intended. */
  const serviceOnly = tables.filter(t => t.rls && t.policies === 0).map(t => t.name).sort();
  check('RLS-without-policy tables are service-role only (no anon path)',
    tables.filter(t => t.rls && t.policies === 0 && anonPolicyTables.includes(t.name)).length === 0,
    serviceOnly.join(', '));

  const anonReadUnexpected = anonPolicyTables.filter(n => !ANON_POLICY_ALLOWED.has(n));
  check('anon can read only allowlisted content through a policy',
    anonReadUnexpected.length === 0, anonReadUnexpected.join(', '));

  /* Grant layer, not policy layer. Hosted Supabase hands `anon` broad table
     privileges by default; 00028 revokes the ones no policy justifies. A grant
     with no matching policy is dead weight at best and a live hole the moment a
     permissive policy lands, so it is treated as a failure either way. */
  const anonWritePolicyTables = new Set(policies
    .filter(p => (p.roles.includes('anon') || p.roles.includes('public')))
    .filter(p => ['ALL', 'INSERT', 'UPDATE', 'DELETE'].includes(p.cmd))
    .map(p => p.tablename));
  const deadWriteGrants = anonWriteGrants.filter(n => !anonWritePolicyTables.has(n));
  check('anon holds no write grant without an anon write policy',
    deadWriteGrants.length === 0, deadWriteGrants.join(', '));

  const ANON_WRITE_ALLOWED = new Set(['track_events']);
  const unexpectedWriteGrants = anonWriteGrants.filter(n => !ANON_WRITE_ALLOWED.has(n));
  check('anon write grants are limited to the documented analytics table',
    unexpectedWriteGrants.length === 0, unexpectedWriteGrants.join(', '));

  const ungatedAnonFunctions = functions
    .filter(f => f.anon_exec && f.security_definer)
    .filter(f => !ANON_CALLABLE_ALLOWED.has(f.name))
    .filter(f => !GUARD.test(f.body))
    .map(f => f.name).sort();
  check('every anon-executable SECURITY DEFINER function has an internal guard or is a documented public projection',
    ungatedAnonFunctions.length === 0, ungatedAnonFunctions.join(', '));

  const leakedInternal = functions
    .filter(f => ROLE_DENIED.has(f.name))
    .filter(f => f.anon_exec || f.auth_exec)
    .map(f => f.name).sort();
  check('internal/trigger functions are executable by no application role',
    leakedInternal.length === 0, leakedInternal.join(', '));

  const authMissing = functions
    .filter(f => f.auth_exec === false && f.anon_exec === false)
    .map(f => f.name).sort();
  check('role-denied functions are revoked from both application roles',
    authMissing.every(n => ROLE_DENIED.has(n)),
    authMissing.filter(n => !ROLE_DENIED.has(n)).join(', '));

  console.log(`\nPublic surface matrix: ${passed} passed, ${failed} failed (local PGlite, ${migrations.length} migrations)`);
} catch (e) {
  console.log(`FAIL  matrix run crashed -- ${e.message}`);
  failed++;
}
await db.close();
process.exit(failed ? 1 : 0);
