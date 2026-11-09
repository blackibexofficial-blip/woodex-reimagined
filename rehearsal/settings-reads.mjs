/* Isolated PGlite regression for settings read projection. Never connects to Supabase. */
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
  const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  for (let i = 0; i < roles.length; i++) {
    await q('insert into auth.users(id,email) values ($1,$2)', [uid(i+1),`${roles[i]}@example.test`]);
    await q('insert into public.user_roles(user_id,role) values ($1,$2)', [uid(i+1),roles[i]]);
  }
  const store = {storeName:'Synthetic store',phone:'03000000000',tagline:{private:'nested'},taxRate:5,storeLogo:'data:image/png;base64,dGVzdA==',team:['Alice',{secret:'nested'},'Bob'],aiOfflineDraftsEnabled:false,privateKey:'SECRET',privateNested:{secret:'NESTED'}};
  await q("insert into public.app_settings(key,value) values ('store',$1::jsonb),('internal','{\"token\":\"secret\"}'::jsonb)",[JSON.stringify(store)]);
  await role('authenticated',uid(1));
  const ownerValue = await scalar('select public.staff_store_settings()');
  check('owner gets original settings including unknown fields', JSON.stringify(ownerValue) === JSON.stringify(await scalar("select value from public.app_settings where key='store'")) && ownerValue.privateNested.secret === 'NESTED');
  check('owner can read both raw settings rows', Number(await scalar('select count(*) from public.app_settings')) === 2);
  for (const [i, roleName] of [[2,'editor'],[3,'sales'],[4,'finance']]) {
    await role('authenticated',uid(i));
    check(`${roleName} cannot read raw settings`, Number(await scalar('select count(*) from public.app_settings')) === 0);
    const result = await scalar('select public.staff_store_settings()');
    check(`${roleName} receives allowed store fields`, result.storeName === store.storeName && result.phone === store.phone && result.taxRate === 5 && result.storeLogo === store.storeLogo);
    check(`${roleName} excludes unknown and nested values`, !('privateKey' in result) && !('privateNested' in result) && !('tagline' in result));
    const crmExpected = roleName === 'sales';
    check(`${roleName} CRM settings are ${crmExpected ? 'type-filtered' : 'not exposed'}`, crmExpected ? JSON.stringify(result.team) === '["Alice","Bob"]' && result.aiOfflineDraftsEnabled === false : !('team' in result) && !('aiOfflineDraftsEnabled' in result));
    let insertDenied = false;
    try { await q("insert into public.app_settings(key,value) values ('injected','{}'::jsonb)"); } catch (e) { insertDenied = e.code === '42501'; }
    check(`${roleName} cannot write settings`, insertDenied);
    check(`${roleName} cannot call owner save RPC`, await denied(() => q("select public.owner_save_store_settings('{}'::jsonb)")));
  }
  for (const [name, user] of [['viewer',uid(5)],['unassigned',uid(99)]]) {
    await role('authenticated',user);
    check(`${name} cannot read raw settings`, Number(await scalar('select count(*) from public.app_settings')) === 0);
    check(`${name} cannot call projection`, await denied(() => q('select public.staff_store_settings()')));
    check(`${name} cannot call owner save RPC`, await denied(() => q("select public.owner_save_store_settings('{}'::jsonb)")));
  }
  await role('anon');
  check('anon cannot call projection', await denied(() => q('select public.staff_store_settings()')));
  check('anon cannot call owner save RPC', await denied(() => q("select public.owner_save_store_settings('{}'::jsonb)")));
  let anonHidden = false;
  try { anonHidden = Number(await scalar('select count(*) from public.app_settings')) === 0; } catch (e) { anonHidden = e.code === '42501'; }
  check('anon cannot read raw settings', anonHidden);
  await role('authenticated',uid(1));
  const partial = await scalar("select public.owner_save_store_settings($1::jsonb)", [JSON.stringify({storeName:'Updated synthetic',privateKey:'attacker-supplied'})]);
  check('partial owner save preserves unknown and omitted settings', partial.storeName === 'Updated synthetic' && partial.privateKey === 'SECRET' && partial.privateNested.secret === 'NESTED' && partial.storeLogo === store.storeLogo && JSON.stringify(partial.team) === JSON.stringify(store.team));
  const cleared = await scalar("select public.owner_save_store_settings($1::jsonb)", [JSON.stringify({storeLogo:null,team:['Test member'],aiOfflineDraftsEnabled:true})]);
  check('explicit null removes logo while valid team and flag save', !('storeLogo' in cleared) && JSON.stringify(cleared.team) === '["Test member"]' && cleared.aiOfflineDraftsEnabled === true);
  let invalidCount = 0;
  for (const invalid of [{storeName:{secret:'bad'}},{team:['ok',{secret:'bad'}]},{taxRate:'not-number'},{aiOfflineDraftsEnabled:'yes'},[]]) {
    try { await q('select public.owner_save_store_settings($1::jsonb)',[JSON.stringify(invalid)]); } catch (e) { if (e.code === '22023') invalidCount++; }
  }
  check('invalid known setting types fail without changing stored data', invalidCount === 5 && JSON.stringify(await scalar("select value from public.app_settings where key='store'")) === JSON.stringify(cleared));
  await db.exec('reset role');
  await q("delete from public.app_settings where key='store'");
  await role('authenticated',uid(3));
  const empty = await scalar('select public.staff_store_settings()');
  check('missing store row returns an empty object', empty && Object.keys(empty).length === 0);
  await role('authenticated',uid(1));
  const created = await scalar("select public.owner_save_store_settings('{\"storeName\":\"New synthetic\"}'::jsonb)");
  check('owner can create missing settings row', created.storeName === 'New synthetic');
  await db.exec('reset role');
  await q("update public.app_settings set value='[1,2]'::jsonb where key='store'");
  await role('authenticated',uid(3));
  let malformed = false;
  try { await q('select public.staff_store_settings()'); } catch (e) { malformed = e.code === '22023'; }
  check('malformed stored settings fail closed', malformed);
  await db.exec('reset role');
  await q("update public.user_roles set role='viewer' where user_id=$1",[uid(3)]);
  await role('authenticated',uid(3));
  check('revoked CRM role is denied on the next call', await denied(() => q('select public.staff_store_settings()')));
  console.log(`\n${passed} passed, ${failed} failed (local PGlite; hosted verification required)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await db.close(); }
