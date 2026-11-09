/* Isolated PGlite regression for AI role capability. Never connects to Supabase. */
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
  const roles = ['owner','editor','sales','finance','viewer'];
  for (let i = 0; i < roles.length; i++) {
    const uid = `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
    await q('insert into auth.users(id,email) values ($1,$2)', [uid, `${roles[i]}@example.test`]);
    await q('insert into public.user_roles(user_id,role) values ($1,$2)', [uid,roles[i]]);
  }
  for (let i = 0; i < roles.length; i++) {
    const uid = `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;
    await role('authenticated', uid);
    const expected = ['owner','sales'].includes(roles[i]);
    check(`${roles[i]} crm.manage = ${expected}`, await scalar("select public.has_cap('crm.manage')") === expected);
  }
  await role('authenticated','00000000-0000-4000-8000-999999999999');
  check('authenticated unassigned user is denied', await scalar("select public.has_cap('crm.manage')") === false);
  await role('anon');
  check('anonymous has no crm.manage', await scalar("select public.has_cap('crm.manage')") === false);
  await db.exec('reset role');
  await q("update public.user_roles set role='viewer' where role='sales'");
  await role('authenticated','00000000-0000-4000-8000-000000000003');
  check('revoked sales role is denied on next lookup', await scalar("select public.has_cap('crm.manage')") === false);
  console.log(`\n${passed} passed, ${failed} failed (local PGlite roles)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await db.close(); }
