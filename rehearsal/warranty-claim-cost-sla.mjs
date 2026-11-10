/* Isolated PGlite regression for migration 00033 (claim cost, replacement
   stock, SLA and assignment) — M5 PROD-004/005. Synthetic fixtures only. */
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
const owner = '55555555-5555-5555-5555-555555555555';
const editor = '11111111-1111-1111-1111-111111111111';
const sales = '33333333-3333-3333-3333-333333333333';
const viewer = '22222222-2222-2222-2222-222222222222';
const ymd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const stages = [
  { id: 's1', stage: 'material_prep', pct: 0, note: '' },
  { id: 's2', stage: 'fabrication', pct: 0, note: '' },
  { id: 's3', stage: 'finishing', pct: 0, note: '' },
  { id: 's4', stage: 'qc', pct: 0, note: '' },
  { id: 's5', stage: 'dispatch', pct: 0, note: '' },
];
const pending = { result: 'pending', defectNote: '', inspectedBy: '', inspectedAt: '' };
const noDispatch = { date: '', vehicle: '', driver: '', driverPhone: '', challanRef: '' };
const production = (st, qc, dispatch) => ({ boq: [], milestones: [], files: [], production: { stages: st, qc, dispatch } });

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
  await q('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6),($7,$8)', [
    owner, 'qa.owner@example.test', editor, 'qa.editor@example.test',
    sales, 'qa.sales@example.test', viewer, 'qa.viewer@example.test',
  ]);
  await q("insert into public.user_roles(user_id,role) values ($1,'owner'),($2,'editor'),($3,'sales'),($4,'viewer')", [owner, editor, sales, viewer]);
  await q("insert into public.products(id,payload,stock_qty) values ('p-1',$1::jsonb,5)", [JSON.stringify({ name: 'Brass handle' })]);

  // A job that has been through the whole chain, installed 20 days ago.
  await role('postgres');
  await q("insert into public.projects(id,status,payload) values ('job-a','draft',$1::jsonb)", [JSON.stringify({ title: 'Synthetic warranty job', practice: production(stages, pending, noDispatch) })]);
  await role('authenticated', owner);
  await q("select * from public.project_qc_record('job-a','passed','ready')");
  await role('authenticated', editor);
  await q("select * from public.project_practice_save('job-a',$1::jsonb,$2)", [JSON.stringify(production(
    stages.map((st) => ({ ...st, pct: 100 })), pending,
    { date: day(-25), vehicle: 'SYN-VAN', driver: 'Synthetic', driverPhone: '0300', challanRef: 'SYN-CH' },
  )), Number(await scalar("select revision from public.projects where id='job-a'"))]);
  await q("select * from public.project_handover_record('job-a','delivery',$1::date,'Mgr','delivered','Customer')", [day(-22)]);
  await q("select * from public.project_handover_record('job-a','installation',$1::date,'Mgr','installed','Customer')", [day(-20)]);

  // A second, healthy job so the register's ordering can be checked.
  await role('postgres');
  await q("insert into public.projects(id,status,payload) values ('job-b','draft',$1::jsonb)", [JSON.stringify({ title: 'Synthetic healthy job', practice: production(stages, pending, noDispatch) })]);
  await role('authenticated', owner);
  await q("select * from public.project_qc_record('job-b','passed','ready')");
  await role('authenticated', editor);
  await q("select * from public.project_practice_save('job-b',$1::jsonb,$2)", [JSON.stringify(production(
    stages.map((st) => ({ ...st, pct: 100 })), pending,
    { date: day(-25), vehicle: 'SYN-VAN', driver: 'Synthetic', driverPhone: '0300', challanRef: 'SYN-CH' },
  )), Number(await scalar("select revision from public.projects where id='job-b'"))]);
  await q("select * from public.project_handover_record('job-b','delivery',$1::date,'Mgr','delivered','Customer')", [day(-22)]);
  await q("select * from public.project_handover_record('job-b','installation',$1::date,'Mgr','installed','Customer')", [day(-20)]);
  const warrantyB = (await q("select * from public.project_warranty_open('job-b',12)")).rows[0];

  // ── the promise: SLA on the warranty ─────────────────────────────────────
  check('a warranty opened without a promise gets 7 days', Number(warrantyB.sla_days) === 7);
  check('the warranty starts at installation, not today', ymd(warrantyB.starts_on) === day(-20));
  check('an SLA outside 1–90 days is refused',
    (await errorCode(() => q("select * from public.project_warranty_open('job-b',12,'','',0)"))) === '22023');
  const warranty = (await q("select * from public.project_warranty_open('job-a',12,'Structure','Wear',3)")).rows[0];
  check('the warranty keeps the promised 3-day SLA', Number(warranty.sla_days) === 3);
  const dispatch = (await q("select * from public.project_post_dispatch('job-a')")).rows[0];
  check('the post-dispatch projection carries the SLA', Number(dispatch.warranty_sla_days) === 3);

  // ── opening a claim stamps the clock ─────────────────────────────────────
  const claim = (await q("select * from public.project_warranty_claim_open('job-a','Hinge loosened','Two hinges', $1::date)", [day(-10)])).rows[0];
  check('a claim is due according to the warranty SLA', ymd(claim.due_on) === day(-7));
  check('a new claim has no cost yet', Number(claim.cost) === 0);
  check('a new claim has no assignee', claim.assigned_to === null);
  check('a claim opened outside the warranty is refused',
    (await errorCode(() => q("select * from public.project_warranty_claim_open('job-a','Old defect','x',$1::date)", [day(-400)]))) === '23514');

  // A claim reported a week ago and still untouched: this one is over its SLA.
  const overdue = (await q("select * from public.project_warranty_claim_open('job-a','Seat frame cracked','Reported on site', $1::date)", [day(-8)])).rows[0];
  check('the promised SLA drives the next deadline', ymd(overdue.due_on) === day(-5));
  check('an untouched claim is still open', String(overdue.status) === 'open');

  // ── money and kind ───────────────────────────────────────────────────────
  await role('authenticated', editor);
  check('a cost without a kind is refused',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','Hinges replaced', 500)", [claim.id]))) === '22023');
  check('a negative cost is refused',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','Hinges replaced', -100, 'repair')", [claim.id]))) === '22023');
  check('a cost with three decimals is refused',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','Hinges replaced', 100.125, 'repair')", [claim.id]))) === '22023');
  check('an unknown resolution kind is refused',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','Hinges replaced', 100, 'bodge')", [claim.id]))) === '22023');
  check('a cost cannot be attached while merely scheduling',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'scheduled','Visit booked', 100, 'repair')", [claim.id]))) === '22023');
  check('scheduling still works on its own',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'scheduled','Visit booked Tuesday')", [claim.id]))) === null);

  const stockBefore = Number(await scalar("select stock_qty from public.products where id='p-1'"));
  check('a replacement needs a product',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','Swapped out', 0, 'replacement', '{\"qty\":2}'::jsonb)", [claim.id]))) === '22023');
  check('a replacement needs a positive quantity',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','Swapped out', 0, 'replacement', '{\"productId\":\"p-1\",\"qty\":0}'::jsonb)", [claim.id]))) === '22023');
  check('a replacement of an unknown product is refused',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','Swapped out', 0, 'replacement', '{\"productId\":\"nope\",\"qty\":1}'::jsonb)", [claim.id]))) === 'P0002');
  check('a replacement beyond stock is refused',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','Swapped out', 0, 'replacement', '{\"productId\":\"p-1\",\"qty\":99}'::jsonb)", [claim.id]))) === '23514');
  check('the refused replacement left stock untouched',
    Number(await scalar("select stock_qty from public.products where id='p-1'")) === stockBefore);
  check('stock only moves for a replacement kind',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','Repaired', 200, 'repair', '{\"productId\":\"p-1\",\"qty\":1}'::jsonb)", [claim.id]))) === '23514');

  const resolved = (await q("select * from public.project_warranty_claim_update($1,'resolved','Two handles swapped under warranty', 750, 'replacement', $2::jsonb)", [
    claim.id, JSON.stringify({ productId: 'p-1', qty: 2 }),
  ])).rows[0];
  check('a replacement resolution is accepted', String(resolved.status) === 'resolved');
  check('the claim carries its cost', Number(resolved.cost) === 750);
  check('the claim carries its kind', String(resolved.resolution_kind) === 'replacement');
  check('the replacement left the shelf', Number(await scalar("select stock_qty from public.products where id='p-1'")) === stockBefore - 2);
  check('the replacement wrote an outbound movement',
    Number(await scalar("select count(*) from public.stock_movements where reason='outbound' and product_id='p-1'")) === 1);
  check('the movement is traced to the claim',
    String(await scalar("select note from public.stock_movements where reason='outbound'")) === `claim ${claim.id}`);
  check('the audit row records cost, kind and the replacement',
    Number(await scalar("select count(*) from public.project_production_events where action='warranty_claim_status' and detail ? 'replacement'")) >= 1);
  check('a resolved claim is terminal',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'scheduled','again')", [claim.id]))) === '23514');

  // ── assignment ───────────────────────────────────────────────────────────
  const open2 = (await q("select * from public.project_warranty_claim_open('job-a','Drawer runner','stiff runner', current_date)")).rows[0];
  check('a claim can be assigned to a staff seat',
    (await errorCode(() => q("select * from public.project_warranty_claim_assign($1,$2)", [open2.id, editor]))) === null);
  check('the assignee is stored',
    String(await scalar("select assigned_to::text from public.project_warranty_claims where id=$1", [open2.id])) === editor);
  check('an unknown person cannot be assigned',
    (await errorCode(() => q("select * from public.project_warranty_claim_assign($1,$2)", [open2.id, '99999999-9999-9999-9999-999999999999']))) === '23514');
  check('a closed claim cannot be reassigned',
    (await errorCode(() => q("select * from public.project_warranty_claim_assign($1,$2)", [claim.id, editor]))) === '23514');
  const seats = (await q('select * from public.staff_seats()')).rows;
  check('the seat list names every staff seat', seats.length === 4 && seats.some((s) => s.email === 'qa.editor@example.test' && s.role === 'editor'));
  check('the seat list can be filtered by role', (await q("select * from public.staff_seats('owner')")).rows.length === 1);
  check('an unknown role is refused by the seat list',
    (await errorCode(() => q("select * from public.staff_seats('admin')"))) === '22023');
  check('assignment is audited',
    Number(await scalar("select count(*) from public.project_production_events where action='warranty_claim_assigned'")) === 1);

  // ── register reads the clock ─────────────────────────────────────────────
  const register = (await q('select * from public.project_warranty_register(60)')).rows;
  const row = register.find((r) => r.project_id === 'job-a');
  const healthy = register.find((r) => r.project_id === 'job-b');
  check('the register reports the two live claims', Number(row.open_claims) === 2);
  check('the register still counts the resolved claim', Number(row.total_claims) === 3);
  check('the register counts the claim past its SLA', Number(row.sla_breached) === 1);
  check('a healthy job has no breach', Number(healthy.sla_breached) === 0 && Number(healthy.open_claims) === 0);
  check('the register carries the next claim due date', ymd(row.next_claim_due) === day(-5));
  check('the register carries the assignee email', String(row.assigned_to) === 'qa.editor@example.test');
  check('a breached job sorts above a healthy one', register.findIndex((r) => r.project_id === 'job-a') < register.findIndex((r) => r.project_id === 'job-b'));

  // ── permissions ──────────────────────────────────────────────────────────
  await role('authenticated', sales);
  check('sales cannot list the staff seats',
    (await errorCode(() => q('select * from public.staff_seats()'))) === '42501');
  check('sales cannot resolve a claim',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','sales says fixed', 0, 'repair')", [open2.id]))) === '42501');
  check('sales cannot assign a claim',
    (await errorCode(() => q("select * from public.project_warranty_claim_assign($1,$2)", [open2.id, sales]))) === '42501');
  await role('authenticated', viewer);
  check('a viewer cannot assign a claim',
    (await errorCode(() => q("select * from public.project_warranty_claim_assign($1,$2)", [open2.id, viewer]))) === '42501');
  await role('anon');
  check('anonymous cannot resolve a claim',
    (await errorCode(() => q("select * from public.project_warranty_claim_update($1,'resolved','anon', 0, 'repair')", [open2.id]))) === '42501');
  check('anonymous cannot read the claims table',
    (await errorCode(() => q('select count(*) from public.project_warranty_claims'))) === '42501');
  check('anonymous cannot call the register',
    (await errorCode(() => q('select * from public.project_warranty_register(30)'))) === '42501');

  // ── rollback leaves the claims and the shelf alone ───────────────────────
  await role('postgres');
  const before = {
    claims: Number(await scalar('select count(*) from public.project_warranty_claims')),
    stock: Number(await scalar("select stock_qty from public.products where id='p-1'")),
    cost: Number(await scalar('select cost from public.project_warranty_claims where id=$1', [claim.id])),
  };
  await db.exec(`drop function if exists public.staff_seats(text);
    drop function if exists public.project_warranty_claim_assign(uuid, uuid);
    drop function if exists public.project_warranty_claim_update(uuid, text, text, numeric, text, jsonb);
    drop function if exists public.internal_stock_move(text, integer, text, text);
    drop table if exists public.warranty_scratch;`);
  check('rollback keeps the claims and their costs',
    Number(await scalar('select count(*) from public.project_warranty_claims')) === before.claims &&
    Number(await scalar('select cost from public.project_warranty_claims where id=$1', [claim.id])) === before.cost);
  check('rollback keeps the stock deduction that already happened',
    Number(await scalar("select stock_qty from public.products where id='p-1'")) === before.stock);
} catch (e) {
  console.log(`FAIL  warranty claim cost/sla suite crashed -- ${e.message}`);
  failed++;
}
console.log(`\nWarranty claim cost + SLA: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);
await db.close();
process.exit(failed ? 1 : 0);
