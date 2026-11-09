/* Local synthetic demo regression for the warranty register page (candidate 00027).
   Never reaches a hosted provider. */
import {launchBrowser} from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8080';
const browser=await launchBrowser();let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
const day=(n)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
try {
  const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const seeded=await page.evaluate(async ({deliveryOn,installOn})=>{
    localStorage.clear();
    const session=(email)=>localStorage.setItem('woodex.admin.session',JSON.stringify({email,name:email.split('@')[0],signedInAt:new Date().toISOString()}));
    session('production@example.test');
    const api=(await import('/src/api/index.ts')).getAdminApi();
    const blankStages=[
      {id:'s1',stage:'material_prep',pct:100,note:''},
      {id:'s2',stage:'fabrication',pct:100,note:''},
      {id:'s3',stage:'finishing',pct:100,note:''},
      {id:'s4',stage:'qc',pct:0,note:''},
      {id:'s5',stage:'dispatch',pct:0,note:''},
    ];
    const pendingPractice={boq:[],milestones:[],files:[],production:{stages:blankStages,qc:{result:'pending',defectNote:'',inspectedBy:'',inspectedAt:''},dispatch:{date:'',vehicle:'',driver:'',driverPhone:'',challanRef:''}}};
    const seedProject=(await api.listProjects()).find(p=>p.practice?.production?.qc?.result==='pending');
    const seedTitle=seedProject?.title;
    // Second job created here so the register has two independent warranties.
    const created=await api.createProject({title:'Register job two',client:'Synthetic Buyer',category:'Interior',active:false});
    await api.saveProjectPractice(created.id,JSON.parse(JSON.stringify(pendingPractice)),0);
    const ids=[seedProject.id,created.id];
    const titles=[seedTitle,created.title];
    const out=[];
    for(const [i,id] of ids.entries()){
      session('qc@example.test');
      await api.recordProjectQcInspection({projectId:id,result:'passed',notes:'ready'});
      session('production@example.test');
      const fresh=(await api.listProjects()).find(p=>p.id===id);
      const practice=JSON.parse(JSON.stringify(fresh.practice));
      practice.production.dispatch={date:deliveryOn,vehicle:`VAN-${i+1}`,driver:'I',driverPhone:'1',challanRef:'C'};
      practice.production.stages=practice.production.stages.map(s=>s.stage==='dispatch'?{...s,pct:100}:s);
      await api.saveProjectPractice(id,practice,fresh.revision);
      await api.recordProjectHandover({projectId:id,kind:'delivery',happenedOn:deliveryOn,lead:'Imran',signedBy:'S'});
      await api.recordProjectHandover({projectId:id,kind:'installation',happenedOn:installOn,lead:'Bilal',signedBy:'S'});
      await api.openProjectWarranty({projectId:id,months:i===0?24:2,coverage:'Structure',exclusions:'Water'});
      if(i===0) await api.openProjectWarrantyClaim({projectId:id,summary:'Frame cracked',details:'Two chairs'});
      out.push({id,title:titles[i]});
    }
    return out;
  },{deliveryOn:day(-20),installOn:day(-16)});

  await page.goto(`${base}/admin/warranty-register`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('table',{timeout:30000});
  const text=()=>page.evaluate(()=>document.body.textContent);
  check('the register lists both warranted jobs',(await page.$$('tbody tr')).length>=2);
  check('the register shows the live warranty states',(await text()).includes('active'));
  check('the counts summary is populated',await page.$eval('[aria-label="Active warranties"]',e=>Number(e.textContent))>=2);
  check('an expiring warranty is flagged inside 60 days',(await text()).includes('day')&&(await page.$$('[aria-label="Warranty state active"]')).length>=2);
  check('open claims are counted',await page.$eval('[aria-label="Open claims"]',e=>Number(e.textContent))>=1);

  const row=(id)=>page.$(`[data-testid="warranty-row-${id}"]`);
  check('each warranted job has a row',Boolean(await row(seeded[0].id)) && Boolean(await row(seeded[1].id)));
  const firstRowText=await page.$eval(`[data-testid="warranty-row-${seeded[0].id}"]`,e=>e.textContent);
  check('the row shows the claim count',firstRowText.includes('1 open'));
  check('the row links back to the workspace',firstRowText.includes('Open workspace'));

  await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Filter the warranty register"] button')].find(b=>b.textContent.trim()==='Open claims').click());
  await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length===1,{timeout:10000});
  check('the open-claims filter narrows the list',(await page.$$('tbody tr')).length===1);
  await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Filter the warranty register"] button')].find(b=>b.textContent.trim()==='Expired').click());
  await page.waitForFunction(()=>document.body.textContent.includes('Nothing matches this filter'),{timeout:10000});
  check('an empty filter explains itself',(await text()).includes('Nothing matches this filter'));
  await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Filter the warranty register"] button')].find(b=>b.textContent.trim()==='All').click());
  await page.waitForFunction(()=>document.querySelectorAll('tbody tr').length>=2,{timeout:10000});
  check('returning to All restores every row',(await page.$$('tbody tr')).length>=2);

  // Patch the stored dates, then reload so the demo module re-reads localStorage
  // (a live module instance keeps its own memory copy — see PROD-ENV-01).
  await page.evaluate(id=>{
    const raw=localStorage.getItem('woodex.admin.db.v1');const db=JSON.parse(raw);
    const w=(db.warranties??[]).find(w=>w.projectId===id&&!w.cancelledAt);
    w.endsOn='2001-01-01'; w.startsOn='2000-01-01';
    localStorage.setItem('woodex.admin.db.v1',JSON.stringify(db));
  },seeded[1].id);
  await page.goto(`${base}/admin/warranty-register`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector(`[data-testid="warranty-row-${seeded[1].id}"]`,{timeout:30000});
  check('an expired warranty is derived from its dates',
    await page.$eval(`[data-testid="warranty-row-${seeded[1].id}"]`,e=>e.textContent.includes('expired')));
  const guard=await page.evaluate(async()=>{try{await (await import('/src/api/index.ts')).getAdminApi().listWarrantyRegister(-5);return 'allowed';}catch(e){return e instanceof Error?e.message:String(e);}});
  check('the reminder window is validated',String(guard).includes('between 0 and 365'));

  check('no uncaught browser errors',errors.length===0);if(errors.length)console.error(errors);
  console.log(`Warranty register: ${passed} passed, ${failed} failed (local synthetic demo)`);if(failed)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
