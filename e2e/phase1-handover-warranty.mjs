/* Local synthetic demo regression for delivery/installation handover and the
   warranty record (candidate 00025). Never reaches a hosted provider. */
import {launchBrowser} from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8080';
const browser=await launchBrowser();let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
const day=(n)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
try {
  const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const prepared=await page.evaluate(async()=>{
    localStorage.clear();
    localStorage.setItem('woodex.admin.session',JSON.stringify({email:'qc@example.test',name:'QC',signedInAt:new Date().toISOString()}));
    const api=(await import('/src/api/index.ts')).getAdminApi();
    const projects=await api.listProjects();
    const target=projects.find(p=>p.practice?.production?.qc?.result==='pending');
    const other=projects.find(p=>p.id!==target.id&&p.practice?.production?.qc?.result==='pending');
    if(!target) throw new Error('No pending-QC seed project');
    await api.recordProjectQcInspection({projectId:target.id,result:'passed',notes:'ready for handover'});
    const fresh=(await api.listProjects()).find(p=>p.id===target.id);
    const practice=JSON.parse(JSON.stringify(fresh.practice));
    practice.production.dispatch={date:new Date().toISOString().slice(0,10),vehicle:'TEST-VAN',driver:'Imran',driverPhone:'03001234567',challanRef:'CH-1'};
    practice.production.stages=practice.production.stages.map(s=>s.stage==='dispatch'?{...s,pct:100}:s);
    await api.saveProjectPractice(target.id,practice,fresh.revision);
    return {title:target.title,id:target.id,otherId:other?.id??null};
  });
  await page.goto(`${base}/admin/projects`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(title=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')===`Practice workspace for ${title}`),{timeout:30000},prepared.title);
  await page.evaluate(title=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===`Practice workspace for ${title}`).click(),prepared.title);
  await page.waitForSelector('[role="dialog"]');
  const openTab=async name=>{const t=await page.evaluateHandle(name=>[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent.trim().startsWith(name)),name);await t.asElement().click();await t.dispose();};
  await openTab('Handover');
  await page.waitForSelector('[aria-label="Delivery handover"]');
  const text=()=>page.evaluate(()=>document.querySelector('[role="dialog"]').textContent);
  check('handover tab starts empty',(await text()).includes('Not recorded.'));
  check('installation is blocked before delivery',(await text()).includes('Record the delivery first'));

  /** Dates must not be typed segment-by-segment (a mistyped year is a real risk),
   *  so set the controlled value through the native setter + input event. */
  const fill=async (label,value)=>page.evaluate((l,v)=>{
    const el=document.querySelector(`[role="dialog"] input[aria-label="${l}"]`);
    if(!el) throw new Error(`Missing input ${l}`);
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
    setter.call(el,v);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));
  },label,value);
  await fill('Handover date',day(-6));
  await fill('Handover lead','Imran');
  await fill('Handover signed by','S. Khan');
  await fill('Handover notes','Delivered and checked on site');
  await page.click('[role="dialog"] button[aria-label="Record handover"]');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Delivery handover"]')?.textContent.includes('Imran'),{timeout:15000});
  check('delivery is recorded with its lead and signature',(await text()).includes('Delivered and checked on site')&&(await text()).includes('signed by S. Khan'));

  await page.waitForFunction(()=>document.querySelector('[role="dialog"] input[aria-label="Handover date"]')!==null,{timeout:10000});
  await fill('Handover date',day(-2));
  await fill('Handover lead','Bilal');
  await fill('Handover signed by','S. Khan');
  await fill('Handover notes','Installed and levelled');
  await page.click('[role="dialog"] button[aria-label="Record handover"]');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Installation handover"]')?.textContent.includes('Bilal'),{timeout:15000});
  check('installation is recorded after delivery',(await text()).includes('Installed and levelled'));

  await fill('Warranty months','24');
  await fill('Warranty coverage','Structure and hardware');
  await fill('Warranty exclusions','Water damage, misuse');
  await page.click('[role="dialog"] button[aria-label="Open warranty"]');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Warranty"]')?.textContent.toLowerCase().includes('active'),{timeout:15000});
  check('the warranty opens as active',(await page.evaluate(()=>document.querySelector('[role="dialog"] [aria-label="Warranty state"]').textContent.trim()))==='active');
  check('the warranty shows its coverage and exclusion text',(await text()).includes('Structure and hardware')&&(await text()).includes('Water damage, misuse'));

  const stored=await page.evaluate(async id=>{
    const raw=localStorage.getItem('woodex.admin.db.v1');const db=JSON.parse(raw);
    return {handovers:(db.handovers??[]).filter(h=>h.projectId===id),warranties:(db.warranties??[]).filter(w=>w.projectId===id),events:(db.productionEvents??[]).filter(e=>e.projectId===id).map(e=>e.action)};
  },prepared.id);
  check('both handovers are stored for the job',stored.handovers.length===2&&stored.handovers.some(h=>h.kind==='delivery')&&stored.handovers.some(h=>h.kind==='installation'));
  check('the warranty starts on the installation date',stored.warranties[0]?.startsOn===day(-2));
  check('handover, warranty actions reach the audit trail',['handover_recorded','warranty_opened'].every(a=>stored.events.includes(a)));

  await fill('Warranty cancellation reason','Customer cancelled the contract');
  await page.click('[role="dialog"] button[aria-label="Cancel warranty"]');
  await page.waitForFunction(()=>document.querySelector('[role="dialog"] [aria-label="Warranty state"]')?.textContent.trim()==='cancelled',{timeout:15000});
  check('cancelling keeps the record and the reason',(await text()).includes('Customer cancelled the contract'));
  const afterCancel=await page.evaluate(async id=>{const raw=localStorage.getItem('woodex.admin.db.v1');const db=JSON.parse(raw);return (db.warranties??[]).filter(w=>w.projectId===id);},prepared.id);
  check('the cancelled warranty stays in the store',afterCancel.length===1&&Boolean(afterCancel[0].cancelledAt));
  check('cancelling is audited',(await page.evaluate(async id=>{const raw=localStorage.getItem('woodex.admin.db.v1');const db=JSON.parse(raw);return (db.productionEvents??[]).filter(e=>e.projectId===id).map(e=>e.action);},prepared.id)).includes('warranty_cancelled'));

  const guards=await page.evaluate(async ({id,otherId})=>{
    const api=(await import('/src/api/index.ts')).getAdminApi();
    const out={};
    try{await api.recordProjectHandover({projectId:id,kind:'delivery',happenedOn:new Date().toISOString().slice(0,10)});out.duplicate='allowed';}catch(e){out.duplicate=e instanceof Error?e.message:String(e);}
    try{await api.recordProjectHandover({projectId:id,kind:'installation',happenedOn:'2999-01-01'});out.future='allowed';}catch(e){out.future=e instanceof Error?e.message:String(e);}
    if(otherId){try{await api.recordProjectHandover({projectId:otherId,kind:'delivery',happenedOn:new Date().toISOString().slice(0,10)});out.noQc='allowed';}catch(e){out.noQc=e instanceof Error?e.message:String(e);}}
    try{await api.openProjectWarranty({projectId:id,months:0});out.months='allowed';}catch(e){out.months=e instanceof Error?e.message:String(e);}
    return out;
  },{id:prepared.id,otherId:prepared.otherId});
  check('a duplicate delivery is refused',String(guards.duplicate).includes('already exists'));
  check('a future handover date is refused',String(guards.future).includes('future'));
  check('a job without a QC pass cannot be handed over',!prepared.otherId||String(guards.noQc).includes('passed QC'));
  check('a zero-month warranty is refused',String(guards.months).includes('between 1 and 120'));

  check('no uncaught browser errors',errors.length===0);if(errors.length)console.error(errors);
  console.log(`Handover & warranty: ${passed} passed, ${failed} failed (local synthetic demo)`);if(failed)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
