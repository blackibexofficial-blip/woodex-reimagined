/* Local synthetic demo regression for warranty claims against a live warranty
   (candidate 00026). Never reaches a hosted provider. */
import {launchBrowser} from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8080';
const browser=await launchBrowser();let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
const day=(n)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
try {
  const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const prepared=await page.evaluate(async(deliveryOn,installOn)=>{
    localStorage.clear();
    localStorage.setItem('woodex.admin.session',JSON.stringify({email:'qc@example.test',name:'QC',signedInAt:new Date().toISOString()}));
    const api=(await import('/src/api/index.ts')).getAdminApi();
    const target=(await api.listProjects()).find(p=>p.practice?.production?.qc?.result==='pending');
    const plain=(await api.listProjects()).find(p=>p.id!==target.id&&p.practice?.production?.qc?.result==='pending');
    await api.recordProjectQcInspection({projectId:target.id,result:'passed',notes:'ready'});
    const fresh=(await api.listProjects()).find(p=>p.id===target.id);
    const practice=JSON.parse(JSON.stringify(fresh.practice));
    practice.production.dispatch={date:deliveryOn,vehicle:'VAN',driver:'I',driverPhone:'1',challanRef:'C'};
    practice.production.stages=practice.production.stages.map(s=>s.stage==='dispatch'?{...s,pct:100}:s);
    await api.saveProjectPractice(target.id,practice,fresh.revision);
    await api.recordProjectHandover({projectId:target.id,kind:'delivery',happenedOn:deliveryOn,lead:'Imran',signedBy:'S'});
    await api.recordProjectHandover({projectId:target.id,kind:'installation',happenedOn:installOn,lead:'Bilal',signedBy:'S'});
    await api.openProjectWarranty({projectId:target.id,months:24,coverage:'Structure',exclusions:'Water'});
    return {title:target.title,id:target.id,plainId:plain?.id??null};
  },day(-10),day(-6));
  await page.goto(`${base}/admin/projects`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')===`Practice workspace for ${t}`),{timeout:30000},prepared.title);
  await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===`Practice workspace for ${t}`).click(),prepared.title);
  await page.waitForSelector('[role="dialog"]');
  const t=await page.evaluateHandle(()=>[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent.trim().startsWith('Handover')));await t.asElement().click();await t.dispose();
  await page.waitForSelector('[aria-label="Warranty claims"]');
  const text=()=>page.evaluate(()=>document.querySelector('[role="dialog"]').textContent);
  check('the claims panel starts empty',(await text()).includes('0 recorded'));
  const fill=async(label,value)=>page.evaluate((l,v)=>{const el=document.querySelector(`[role="dialog"] input[aria-label="${l}"]`);if(!el)throw new Error(`Missing ${l}`);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;setter.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));},label,value);
  await fill('Claim summary','Seat frame cracked');
  await fill('Claim details','Two chairs, reported on site');
  await page.click('[role="dialog"] button[aria-label="Open warranty claim"]');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Warranty claims"]')?.textContent.includes('Seat frame cracked'),{timeout:15000});
  check('a claim opens against the live warranty',(await text()).includes('Two chairs, reported on site'));
  check('the new claim starts open',(await page.evaluate(()=>document.querySelector('[aria-label="Warranty claims"]')?.textContent.includes('open')))===true);
  const stored=()=>page.evaluate(async id=>{const raw=localStorage.getItem('woodex.admin.db.v1');const db=JSON.parse(raw);return {claims:(db.warrantyClaims??[]).filter(c=>c.projectId===id),events:(db.productionEvents??[]).filter(e=>e.projectId===id).map(e=>e.action)};},prepared.id);
  const first=await stored();
  check('the claim is stored with its opener',first.claims.length===1&&first.claims[0].openedBy==='qc@example.test');
  check('opening a claim is audited',first.events.includes('warranty_claim_opened'));

  await fill('Claim resolution for Seat frame cracked','Frames replaced under warranty');
  await page.click('[role="dialog"] button[aria-label="Resolve claim Seat frame cracked"]');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Claims"]')!==null&&[...document.querySelectorAll('[aria-label^="Claim "]')].some(li=>li.textContent.includes('resolved')),{timeout:15000}).catch(()=>{});
  await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('Resolution: Frames replaced under warranty'),{timeout:15000});
  check('a claim resolves with its resolution note',(await text()).includes('Frames replaced under warranty'));
  const second=await stored();
  check('the resolved claim records a closure time',second.claims[0].status==='resolved'&&Boolean(second.claims[0].closedAt));
  check('resolving is audited',second.events.includes('warranty_claim_status'));
  check('a resolved claim offers no further actions',!(await page.evaluate(()=>Boolean(document.querySelector('[role="dialog"] button[aria-label="Resolve claim Seat frame cracked"]')))));

  const guards=await page.evaluate(async ({id,plainId})=>{
    const api=(await import('/src/api/index.ts')).getAdminApi();
    const out={};
    try{await api.openProjectWarrantyClaim({projectId:id,summary:'   '});out.blank='allowed';}catch(e){out.blank=e instanceof Error?e.message:String(e);}
    if(!id) out.none='skipped';
    try{await api.openProjectWarrantyClaim({projectId:id,summary:'x',openedOn:'2999-01-01'});out.future='allowed';}catch(e){out.future=e instanceof Error?e.message:String(e);}
    try{await api.updateProjectWarrantyClaim({claimId:'missing-id',status:'scheduled'});out.missing='allowed';}catch(e){out.missing=e instanceof Error?e.message:String(e);}
    const claims=await api.listProjectWarrantyClaims(id);
    try{await api.updateProjectWarrantyClaim({claimId:claims[0].id,status:'scheduled'});out.terminal='allowed';}catch(e){out.terminal=e instanceof Error?e.message:String(e);}
    if(plainId){try{await api.openProjectWarrantyClaim({projectId:plainId,summary:'no warranty here'});out.noWarranty='allowed';}catch(e){out.noWarranty=e instanceof Error?e.message:String(e);}}
    return out;
  },{id:prepared.id,plainId:prepared.plainId});
  check('a blank claim summary is refused',String(guards.blank).includes('short summary'));
  check('a future-dated claim is refused',String(guards.future).includes('future'));
  check('a missing claim cannot be updated',String(guards.missing).includes('Claim not found'));
  check('a resolved claim cannot be reopened',String(guards.terminal).includes('Cannot move a claim from resolved'));
  check('a job without a warranty cannot be claimed',!prepared.plainId||String(guards.noWarranty).includes('no active warranty'));

  const reject=await page.evaluate(async id=>{
    const api=(await import('/src/api/index.ts')).getAdminApi();
    const claim=await api.openProjectWarrantyClaim({projectId:id,summary:'Hinge loose',details:'Third chair'});
    try{await api.updateProjectWarrantyClaim({claimId:claim.id,status:'rejected',resolution:'no'});return 'allowed';}catch(e){return e instanceof Error?e.message:String(e);}
  },prepared.id);
  check('rejecting without a real note is refused',String(reject).includes('needs a resolution note'));

  check('no uncaught browser errors',errors.length===0);if(errors.length)console.error(errors);
  console.log(`Warranty claims: ${passed} passed, ${failed} failed (local synthetic demo)`);if(failed)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
