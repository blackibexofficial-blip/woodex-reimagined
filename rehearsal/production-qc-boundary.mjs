/* Isolated PGlite regression for the 00021 dispatch gate (00022/00023 are
   tested separately in production-qc-records.mjs / production-shape-guard.mjs).
   No hosted data. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
async function loadPGlite() {
  try { return await import('@electric-sql/pglite'); }
  catch {
    const {spawnSync}=await import('node:child_process');
    const r=spawnSync('npm',['install','--no-save','--no-audit','--no-fund','@electric-sql/pglite@^0.5.15'],{stdio:'inherit'});
    if(r.status!==0)throw Error('PGlite is required');return import('@electric-sql/pglite');
  }
}
const {PGlite}=await loadPGlite(), db=new PGlite();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
const q=(sql,args=[])=>db.query(sql,args);
const role=async (name,id='')=>db.exec(`reset role; select set_config('app.test_uid','${id}',false); set role ${name}`);
try {
  await db.exec(`create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(),email text);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.test_uid',true),'')::uuid$$;
    create schema storage; create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[],created_at timestamptz default now(),updated_at timestamptz default now());
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner text,created_at timestamptz default now(),updated_at timestamptz default now(),metadata jsonb);
    alter table storage.objects enable row level security;`);
  const dir=path.join(root,'supabase/migrations'), candidate='20261108000021_project_dispatch_qc_guard.sql';
  // 00022/00023 build the revision + shape layer this suite deliberately omits, and
  // 00034 (the revision guard) needs 00022's `revision` column to exist.
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')&&f!==candidate&&!f.startsWith('20261108000022')&&!f.startsWith('20261108000023')&&!f.startsWith('20261108000034')).sort()) await db.exec(fs.readFileSync(path.join(dir,f),'utf8'));
  const legacy={title:'Legacy',practice:{production:{qc:{result:'pending'},dispatch:{vehicle:'OLD-VEHICLE'},stages:[]}}};
  await q("insert into public.projects(id,status,payload) values ('legacy','draft',$1::jsonb)",[JSON.stringify(legacy)]);
  await db.exec(fs.readFileSync(path.join(dir,candidate),'utf8'));
  const editor='11111111-1111-1111-1111-111111111111',viewer='22222222-2222-2222-2222-222222222222';
  await q('insert into auth.users(id,email) values ($1,$2),($3,$4)',[editor,'editor@example.test',viewer,'viewer@example.test']);
  await q("insert into public.user_roles(user_id,role) values ($1,'editor'),($2,'viewer')",[editor,viewer]);
  const production={stages:[{id:'dispatch-test',stage:'dispatch',pct:0,note:''}],qc:{result:'pending',defectNote:'',inspectedBy:'',inspectedAt:''},dispatch:{date:'',vehicle:'',driver:'',driverPhone:'',challanRef:''}};
  await q("insert into public.projects(id,status,payload) values ('qc-test','draft',$1::jsonb)",[JSON.stringify({title:'Synthetic QC test',practice:{boq:[],milestones:[],files:[],production}})]);
  await role('authenticated',viewer);
  let viewerDenied=false;try{const r=await q("update public.projects set payload=jsonb_set(payload,'{title}',to_jsonb('not allowed'::text)) where id='qc-test' returning id");viewerDenied=r.rows.length===0;}catch(e){viewerDenied=e.code==='42501';}
  check('viewer cannot update a project under local RLS',viewerDenied);
  await role('authenticated',editor);
  const neutral=await q("update public.projects set payload=jsonb_set(payload,'{title}',to_jsonb('allowed edit'::text)) where id='qc-test' returning id");
  check('authorized editor may update non-production fields',neutral.rows.length===1);
  let rejected=false;
  try{await q("update public.projects set payload=jsonb_set(payload,'{practice,production,dispatch,vehicle}',to_jsonb('TEST-VEHICLE'::text)) where id='qc-test'");}
  catch(e){if(['23514','42501','P0001'].includes(e.code))rejected=true;else throw e;}
  const data=(await q("select payload#>>'{practice,production,dispatch,vehicle}' as vehicle, payload#>>'{practice,production,qc,result}' as qc from public.projects where id='qc-test'")).rows[0];
  check('server rejects dispatch details while QC remains pending',rejected && data?.vehicle==='' && data?.qc==='pending');
  if(!rejected)console.log('  Reproduced: authorized editor directly stored a vehicle while QC was pending.');
  const unchanged=await q("update public.projects set payload=jsonb_set(payload,'{title}',to_jsonb('Legacy title'::text)) where id='legacy' returning id");
  check('unchanged historical production data does not block unrelated edits',unchanged.rows.length===1);
  let legacyRejected=false;try{await q("update public.projects set payload=jsonb_set(payload,'{practice,production,dispatch,vehicle}',to_jsonb('NEW-VEHICLE'::text)) where id='legacy'");}catch(e){legacyRejected=e.code==='23514';}
  check('changed invalid legacy dispatch is rejected',legacyRejected);
  const valid=production=>({title:'Synthetic',practice:{boq:[],milestones:[],files:[],production}});
  const insert=async (id,prod)=>{try{await q('insert into public.projects(id,status,payload) values ($1,$2,$3::jsonb)',[id,'draft',JSON.stringify(valid(prod))]);return true;}catch(e){if(e.code==='23514')return false;throw e;}};
  check('pending QC with blank dispatch fields is accepted',await insert('pending-blank',production));
  check('whitespace and null dispatch entries are treated as blank',await insert('blank-values',{qc:{result:'pending'},dispatch:{vehicle:'  ',driver:null},stages:[]}));
  check('missing QC cannot save dispatch data',!(await insert('missing-qc',{dispatch:{vehicle:'TEST'},stages:[]})));
  check('failed QC cannot save dispatch data',!(await insert('failed-qc',{qc:{result:'failed'},dispatch:{vehicle:'TEST'},stages:[]})));
  check('positive dispatch progress is rejected when QC is pending',!(await insert('dispatch-pct',{qc:{result:'pending'},dispatch:{},stages:[{stage:'dispatch',pct:20}]})));
  check('duplicate dispatch stages cannot hide later progress',!(await insert('duplicate-stage',{qc:{result:'pending'},dispatch:{},stages:[{stage:'dispatch',pct:0},{stage:'dispatch',pct:20}]})));
  check('nonnumeric dispatch progress is rejected',!(await insert('bad-pct',{qc:{result:'pending'},dispatch:{},stages:[{stage:'dispatch',pct:'1'}]})));
  check('malformed stage list and malformed dispatch object are rejected',!(await insert('bad-stages',{stages:{},dispatch:{}})) && !(await insert('bad-dispatch',{stages:[],dispatch:[]})));
  check('unknown populated dispatch fields count as dispatch data',!(await insert('unknown-dispatch',{qc:{result:'pending'},dispatch:{futureField:{nested:true}},stages:[]})));
  check('passed recorded QC permits dispatch details and progress',await insert('passed-qc',{qc:{result:'passed'},dispatch:{vehicle:'TEST'},stages:[{stage:'dispatch',pct:100}]}));
  let rollback=false;try{await q("update public.projects set payload=jsonb_set(payload,'{practice,production,qc,result}',to_jsonb('failed'::text)) where id='passed-qc'");}catch(e){rollback=e.code==='23514';}
  const retained=(await q("select payload#>>'{practice,production,qc,result}' as qc, payload#>>'{practice,production,dispatch,vehicle}' as vehicle from public.projects where id='passed-qc'")).rows[0];
  check('failed QC transition is rejected atomically while dispatch data remains',rollback && retained.qc==='passed' && retained.vehicle==='TEST');
  check('projects without production data remain valid',await insert('without-production',undefined));
  const selfApprove=await q("update public.projects set payload=jsonb_set(jsonb_set(payload,'{practice,production,qc,result}',to_jsonb('passed'::text)),'{practice,production,dispatch,vehicle}',to_jsonb('SELF-APPROVED'::text)) where id='pending-blank' returning payload");
  check('known limitation: editor can self-record a pass and dispatch in one write',selfApprove.rows[0]?.payload?.practice?.production?.dispatch?.vehicle==='SELF-APPROVED');
  await role('anon');
  let directCallDenied=false;try{await q('select public.enforce_project_dispatch_qc()');}catch(e){directCallDenied=e.code==='42501';}
  check('anonymous cannot execute trigger function directly',directCallDenied);
  await role('postgres');
  await db.exec('drop trigger project_dispatch_qc_guard on public.projects; drop function public.enforce_project_dispatch_qc()');
  await role('authenticated',editor);
  const rollbackUpdate=await q("update public.projects set payload=jsonb_set(payload,'{practice,production,dispatch,vehicle}',to_jsonb('ROLLBACK-TEST'::text)) where id='qc-test' returning id");
  check('isolated rollback removes the new check without deleting project data',rollbackUpdate.rows.length===1);
  await role('postgres'); await db.exec(fs.readFileSync(path.join(dir,candidate),'utf8'));
  await db.exec(fs.readFileSync(path.join(dir,candidate),'utf8'));
  await role('authenticated',editor);
  let reapplied=false;try{await q("update public.projects set payload=jsonb_set(payload,'{practice,production,dispatch,vehicle}',to_jsonb('BLOCKED-AFTER-REAPPLY'::text)) where id='qc-test'");}catch(e){reapplied=e.code==='23514';}
  check('migration reapplication reinstates guard without rewriting legacy records',reapplied && (await q("select payload#>>'{practice,production,dispatch,vehicle}' as vehicle from public.projects where id='qc-test'")).rows[0]?.vehicle==='ROLLBACK-TEST');
  console.log(`Production QC boundary: ${passed} passed, ${failed} failed (local PGlite; no hosted claims)`);if(failed)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1;}finally{await db.close();}
