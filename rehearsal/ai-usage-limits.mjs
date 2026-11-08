/* Isolated PGlite regression for AI usage limits. Never connects to Supabase. */
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
  const user1 = '11111111-1111-4111-8111-111111111111';
  const user2 = '22222222-2222-4222-8222-222222222222';
  const reserve = (uid, limit=2, global=3) => scalar('select public.ai_usage_reserve($1::uuid,$2::integer,$3::integer)', [uid,limit,global]);
  for (const name of ['anon','authenticated']) {
    await role(name, user1);
    check(`${name} cannot reserve usage`, await denied(() => reserve(user1)));
    check(`${name} cannot read counters`, await denied(() => q('select * from public.ai_usage_windows')));
    check(`${name} cannot modify counters`, await denied(() => q("insert into public.ai_usage_windows values ('fake',now(),0)")));
  }
  await role('service_role');
  check('service role cannot read counters directly', await denied(() => q('select * from public.ai_usage_windows')));
  let invalid = 0;
  for (const args of [[null,2,3],[user1,0,3],[user1,1001,3],[user1,2,0],[user1,2,100001],[user1,null,3]]) {
    try { await reserve(...args); } catch (e) { if (e.code === '22023') invalid++; }
  }
  check('invalid limits and missing user fail closed', invalid === 6);
  check('first request allowed', await reserve(user1) === true);
  check('second request allowed', await reserve(user1) === true);
  check('user quota prevents third request', await reserve(user1) === false);
  check('different user has independent quota', await reserve(user2) === true);
  check('global quota blocks even an eligible user', await reserve(user2) === false);
  await db.exec('reset role');
  check('denials consume no global or user quota', Number(await scalar("select attempts from public.ai_usage_windows where bucket='global'")) === 3 && Number(await scalar("select attempts from public.ai_usage_windows where bucket=$1", ['user:'+user1])) === 2 && Number(await scalar("select attempts from public.ai_usage_windows where bucket=$1", ['user:'+user2])) === 1);
  await q("update public.ai_usage_windows set started_at=clock_timestamp()-interval '25 hours' where bucket='global'");
  await role('service_role');
  check('global expiry alone does not bypass user quota', await reserve(user1) === false);
  await db.exec('reset role');
  await q("update public.ai_usage_windows set started_at=clock_timestamp()-interval '11 minutes' where bucket=$1", ['user:'+user1]);
  await role('service_role');
  check('both expired windows reopen on next accepted request', await reserve(user1) === true);
  await db.exec('reset role');
  check('expired windows reset to one attempt', Number(await scalar("select attempts from public.ai_usage_windows where bucket='global'")) === 1 && Number(await scalar("select attempts from public.ai_usage_windows where bucket=$1",['user:'+user1])) === 1);
  await role('service_role');
  const parallel = await Promise.all(Array.from({length:10},()=>reserve(user2,100,5)));
  check('parallel calls do not exceed global limit in local PGlite', parallel.filter(Boolean).length === 4);
  await db.exec('reset role');
  check('parallel counter remains at global limit', Number(await scalar("select attempts from public.ai_usage_windows where bucket='global'")) === 5);
  await q("update public.ai_usage_windows set started_at=clock_timestamp()-interval '25 hours' where bucket='global'");
  await q("update public.ai_usage_windows set started_at=clock_timestamp()-interval '11 minutes' where bucket=$1", ['user:'+user2]);
  await role('service_role');
  const userParallel = await Promise.all(Array.from({length:10},()=>reserve(user2,2,100)));
  check('parallel calls do not exceed per-user limit in local PGlite', userParallel.filter(Boolean).length === 2);
  await db.exec('reset role');
  check('per-user parallel counter remains at user limit', Number(await scalar("select attempts from public.ai_usage_windows where bucket=$1",['user:'+user2])) === 2);
  console.log(`\n${passed} passed, ${failed} failed (local PGlite; hosted concurrency verification required)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await db.close(); }
