/* Local synthetic regression: the production workspace must survive partial or
   invalid stored payloads instead of crashing, and must let the user rewrite a
   complete record. Never reaches a hosted provider.

   Demo state is read from localStorage (the demo store's source of truth) rather
   than by importing the module, so the test is not affected by Vite HMR giving
   a long-lived dev server more than one module instance. */
import {launchBrowser} from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8080';
const DB_KEY='woodex.admin.db.v1';
const browser=await launchBrowser();let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try {
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
    localStorage.clear();
    localStorage.setItem('woodex.admin.session',JSON.stringify({email:'production@example.test',name:'Tester',signedInAt:new Date().toISOString()}));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.goto(`${base}/admin/projects`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(key=>!!localStorage.getItem(key),{timeout:30000},DB_KEY);

  const ids=await page.evaluate(key=>{
    const db=JSON.parse(localStorage.getItem(key));
    const malformed=(db.projects||[]).find(p=>p.practice&&p.practice.production);
    const valid=(db.projects||[]).find(p=>p.id!==malformed.id&&p.practice&&p.practice.production);
    const bad={boq:null,milestones:{nope:true},files:'not-a-list',production:{qc:{result:'passed'},stages:[{id:'x',stage:'fabrication',pct:250,note:7},{id:'y',stage:'unknown_stage',pct:50},{id:'z',stage:'fabrication',pct:10}]}};
    const badRow=db.projects.find(p=>p.id===malformed.id);
    badRow.practice=bad;
    const goodRow=db.projects.find(p=>p.id===valid.id);
    goodRow.practice={...goodRow.practice,production:{...goodRow.practice.production,dispatch:{date:'',vehicle:'',driver:'',driverPhone:'',challanRef:''}}};
    localStorage.setItem(key,JSON.stringify(db));
    return {malformed:malformed.id,malformedTitle:badRow.title,valid:valid.id,validTitle:goodRow.title};
  },DB_KEY);

  await page.reload({waitUntil:'domcontentloaded'});
  await page.goto(`${base}/admin/projects`,{waitUntil:'domcontentloaded'});
  const openWorkspace=async title=>{
    await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')===`Practice workspace for ${t}`),{timeout:30000},title);
    await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===`Practice workspace for ${t}`).click(),title);
    await page.waitForSelector('[role="dialog"]');
    const tab=await page.evaluateHandle(()=>[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent.includes('Production')));
    await tab.asElement().click();await tab.dispose();
    await page.waitForSelector('input[aria-label="Fabrication note"]');
  };
  const body=async()=>(await page.evaluate(()=>document.querySelector('[role="dialog"]')?.textContent??''))||'';
  const stored=async id=>page.evaluate(({key,id})=>{
    const db=JSON.parse(localStorage.getItem(key));
    const row=(db.projects||[]).find(p=>p.id===id);
    return row?{practice:row.practice,revision:row.revision}:null;
  },{key:DB_KEY,id});

  await openWorkspace(ids.malformedTitle);
  const opened=await body();
  check('a partial production payload still opens the workspace', errors.length===0);
  check('all five shop-floor stages render', ['Material prep','Fabrication','Finishing','QC inspection','Dispatch'].every(s=>opened.includes(s)));
  check('invalid percentages are clamped to 100', await page.$eval('input[aria-label="Fabrication percent"]',e=>e.value)==='100');
  check('the repair notice explains that blanks were filled', opened.includes('Some stored production values were incomplete or invalid'));
  check('dispatch inputs exist even though the payload had none', !!(await page.$('input[aria-label="Dispatch date"]')));
  check('a passed QC with no recorded inspection is still shown as passed', opened.includes('No inspection recorded yet'));

  await page.click('input[aria-label="Fabrication note"]');
  await page.keyboard.type('recovered record');
  await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('Unsaved changes'),{timeout:10000});
  await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='Save workspace').click());
  await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('All changes saved'),{timeout:15000});
  const saved=(await stored(ids.malformed))?.practice;
  check('saving rewrites a complete five-stage production block', Array.isArray(saved?.production?.stages) && saved.production.stages.length===5);
  check('the edit made while repairing is kept', saved?.production?.stages?.find(st=>st.stage==='fabrication')?.note==='recovered record');
  check('saving rewrites a complete dispatch object', saved?.production?.dispatch && ['date','vehicle','driver','driverPhone','challanRef'].every(k=>k in saved.production.dispatch));
  check('invalid BoQ/milestone/file shapes become empty lists', Array.isArray(saved?.boq) && saved.boq.length===0 && Array.isArray(saved?.milestones) && Array.isArray(saved?.files));
  check('the repaired QC value is preserved, not silently reset', saved?.production?.qc?.result==='passed');
  check('the stored revision advances when the repair is saved', (await stored(ids.malformed))?.revision>1);
  check('no crash occurred while opening or saving the repaired job', errors.length===0);

  await page.evaluate(()=>[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='Close').click());
  await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'),{timeout:10000});
  await openWorkspace(ids.validTitle);
  check('a valid payload shows no repair notice', !(await body()).includes('Some stored production values were incomplete or invalid'));
  check('no uncaught browser errors in the whole run', errors.length===0);if(errors.length)console.error(errors);
  console.log(`Production legacy payload: ${passed} passed, ${failed} failed (local synthetic demo)`);if(failed)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
