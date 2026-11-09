/* Local synthetic demo production-workspace regression; never reaches a hosted provider. */
import {launchBrowser} from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8080';
const browser=await launchBrowser();let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try {
  const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const project=await page.evaluate(async()=>{localStorage.clear();localStorage.setItem('woodex.admin.session',JSON.stringify({email:'production@example.test',name:'Tester',signedInAt:new Date().toISOString()}));return (await (await import('/src/api/demo/db.ts')).demoAdminApi.listProjects()).find(p=>p.practice?.production?.qc?.result==='pending');});
  if(!project)throw Error('No synthetic pending-QC seed project');
  await page.goto(`${base}/admin/projects`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(title=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')===`Practice workspace for ${title}`),{timeout:30000},project.title);
  await page.evaluate(async()=>{const api=(await import('/src/api/index.ts')).getAdminApi();const originalSave=api.saveProjectPractice.bind(api);window.testStarted=false;window.testHold=false;api.saveProjectPractice=async (...args)=>{if(window.testHold){window.testStarted=true;await new Promise(resolve=>window.testRelease=resolve);window.testHold=false;}return originalSave(...args);};});
  await page.evaluate(title=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===`Practice workspace for ${title}`).click(),project.title);
  await page.waitForSelector('[role="dialog"]');
  const tab=await page.evaluateHandle(()=>[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent.includes('Production')));await tab.asElement().click();await tab.dispose();
  await page.waitForSelector('input[aria-label="Fabrication note"]');
  const stored=()=>page.evaluate(async id=>{const p=(await (await import('/src/api/index.ts')).getAdminApi().listProjects()).find(x=>x.id===id);return p?{practice:p.practice,revision:p.revision}:null;},project.id);
  const setNote=async value=>{await page.click('input[aria-label="Fabrication note"]');await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.type('input[aria-label="Fabrication note"]',value);};
  const click=async text=>{const h=await page.evaluateHandle(text=>[...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()===text),text);if(!h.asElement())throw Error(`Missing ${text}`);await h.asElement().click();await h.dispose();};
  const chooseResult=async text=>{const h=await page.evaluateHandle(()=>document.querySelector('[role="dialog"] button[aria-label="QC inspection result"]'));await h.asElement().click();await h.dispose();await page.waitForSelector('[role="option"]');const label=text.charAt(0).toUpperCase()+text.slice(1);const o=await page.evaluateHandle(label=>[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.trim()===label),label);await o.asElement().click();await o.dispose();};
  const openProductionWorkspace=async()=>{
    await page.waitForFunction(title=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')===`Practice workspace for ${title}`),{timeout:30000},project.title);
    await page.evaluate(title=>[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===`Practice workspace for ${title}`).click(),project.title);
    await page.waitForSelector('[role="dialog"]');
    const t=await page.evaluateHandle(()=>[...document.querySelectorAll('[role="tab"]')].find(e=>e.textContent.includes('Production')));
    await t.asElement().click();await t.dispose();
    await page.waitForSelector('input[aria-label="Fabrication note"]');
  };
  /** Swap the demo seat: QC must be recorded by someone other than the stage editor. */
  const signInAs=async email=>{
    await page.evaluate(email=>localStorage.setItem('woodex.admin.session',JSON.stringify({email,name:'Tester',signedInAt:new Date().toISOString()})),email);
    await page.goto(`${base}/admin/projects`,{waitUntil:'domcontentloaded'});
    await openProductionWorkspace();
  };
  const recordInspection=async (result,notes)=>{
    await chooseResult(result);
    if(notes!==undefined){const h=await page.evaluateHandle(()=>document.querySelector('[role="dialog"] input[aria-label="QC inspection notes"]'));await h.asElement().click();await h.dispose();await page.keyboard.down('Control');await page.keyboard.press('KeyA');await page.keyboard.up('Control');await page.keyboard.type(notes);}
    await click('Record inspection');
    await page.waitForFunction(result=>document.querySelector('[role="dialog"] [aria-label="Recorded QC result"]')?.textContent.trim()===result,null,{timeout:15000}).catch(()=>{});
  };
  check('pending QC locks dispatch inputs in the UI',await page.$eval('input[aria-label="Dispatch date"]',e=>e.matches(':disabled')) && await page.$eval('input[aria-label="Dispatch percent"]',e=>e.disabled));
  check('QC card shows no inspection before one is recorded',(await page.evaluate(()=>document.querySelector('[role="dialog"]').textContent)).includes('No inspection recorded yet'));

  // delayed save: newer edits must stay dirty
  await setNote('First production note');await page.evaluate(()=>{window.testHold=true;window.testStarted=false});await click('Save workspace');await page.waitForFunction(()=>window.testStarted,{timeout:10000});
  await click('Close');
  check('workspace cannot close while a save is pending', !!await page.$('[role="dialog"]'));
  await setNote('Later production note');
  await page.evaluate(()=>window.testRelease());await page.waitForFunction(()=>!window.testHold);
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"] button')].some(b=>b.textContent.trim()==='Save workspace'));
  check('older save leaves newer production edits marked unsaved',await page.evaluate(()=>document.querySelector('[role="dialog"]').textContent.includes('Unsaved changes')));
  check('stored data reflects the sent snapshot', (await stored()).practice.production.stages.find(s=>s.stage==='fabrication').note==='First production note');
  const unload=await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});check('unsaved workspace registers an unload warning',unload);
  let confirmations=0;let dialogMode='dismiss';page.on('dialog',async d=>{confirmations++;if(dialogMode==='accept')await d.accept();else await d.dismiss();});
  await click('Close');
  check('canceling close keeps the workspace open',confirmations>0 && !!await page.$('[role="dialog"]') && await page.$eval('input[aria-label="Fabrication note"]',e=>e.value)==='Later production note');
  await click('Save workspace');await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('All changes saved'));
  check('subsequent save persists the newer production note', (await stored()).practice.production.stages.find(s=>s.stage==='fabrication').note==='Later production note');

  // Separation of duties: the person who moved the stages cannot sign it off.
  await click('Close');
  await openProductionWorkspace();
  check('the stage editor sees the self-approval warning',
    (await page.evaluate(()=>document.querySelector('[role="dialog"]')?.textContent.includes('cannot record the pass yourself')))===true);
  check('the pass button is disabled for the stage editor',
    await page.$eval('[role="dialog"] button[aria-label="Record QC inspection"]',e=>e.disabled));
  const selfPass=await page.evaluate(async id=>{
    try{await (await import('/src/api/index.ts')).getAdminApi().recordProjectQcInspection({projectId:id,result:'passed',notes:'self sign-off'});return 'allowed';}
    catch(e){return e instanceof Error?e.message:String(e);}
  },project.id);
  check('the demo refuses a self-recorded pass', String(selfPass).includes('another person must record the pass'));
  check('the refused pass leaves QC pending', (await stored()).practice.production.qc.result==='pending');
  await click('Close');

  // QC recorded through an inspection by the second seat, not a typed status
  await signInAs('qc@example.test');
  check('a different user can open the job without the warning',
    (await page.evaluate(()=>document.querySelector('[role="dialog"]')?.textContent.includes('cannot record the pass yourself')))===false);
  await recordInspection('passed','Final inspection — edges clean');
  check('recording a passed inspection unlocks dispatch', !(await page.$eval('input[aria-label="Dispatch date"]',e=>e.matches(':disabled'))));
  const afterPass=await stored();
  check('demo derives QC and inspector from the recorded inspection',afterPass.practice.production.qc.result==='passed' && afterPass.practice.production.qc.inspectedBy==='qc@example.test');
  check('inspection history lists the record',(await page.evaluate(()=>document.querySelector('[role="dialog"]').textContent)).includes('Final inspection — edges clean'));

  await page.type('input[aria-label="Vehicle"]','TEST-VEHICLE');
  await recordInspection('failed','Veneer chip found');
  check('a failed inspection relocks dispatch and is recorded',(await stored()).practice.production.qc.result==='failed' && await page.$eval('input[aria-label="Dispatch date"]',e=>e.matches(':disabled')));
  await click('Save workspace');
  await page.waitForFunction(()=>document.body.textContent.includes("QC is not passed — dispatch data can't be saved"),{timeout:10000});
  check('draft dispatch data cannot be saved while QC is not passed', (await stored()).practice.production.dispatch.vehicle==='');
  check('the locked dispatch block offers a way to clear the draft',
    (await page.evaluate(()=>document.querySelector('[role="dialog"]')?.textContent.includes('Clear them to save while QC is not passed'))));
  await page.click('[role="dialog"] button[aria-label="Clear dispatch details"]');
  await page.evaluate(()=>{const e2=document.querySelector('[role="dialog"]');return e2!==null;});
  await click('Save workspace');
  await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('All changes saved'),{timeout:10000});
  check('clearing the draft lets a failed-QC workspace save', (await stored()).practice.production.qc.result==='failed' && (await stored()).practice.production.dispatch.vehicle==='');
  await recordInspection('passed','Reworked and re-inspected');
  await page.type('input[aria-label="Vehicle"]','TEST-VEHICLE');
  await click('Save workspace');await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('All changes saved'));
  check('passed inspection allows dispatch data to persist',(await stored()).practice.production.dispatch.vehicle==='TEST-VEHICLE');

  const events=await page.evaluate(async id=>(await (await import('/src/api/index.ts')).getAdminApi().listProjectProductionEvents(id)).length,project.id);
  check('production audit entries are recorded in the demo store',events>=3);

  // revision conflict handling
  await page.evaluate(async()=>{const api=(await import('/src/api/index.ts')).getAdminApi();const real=api.saveProjectPractice.bind(api);window.__realSave=real;window.__conflictOnce=true;api.saveProjectPractice=async (...args)=>{if(window.__conflictOnce){window.__conflictOnce=false;throw new Error('This job changed elsewhere (revision 99, your copy 98). Reload before saving.');}return real(...args);};});
  await setNote('Conflicting edit');
  await click('Save workspace');
  await page.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('changed elsewhere'),{timeout:10000});
  check('revision conflict shows a reload banner and keeps the edits',await page.$eval('input[aria-label="Fabrication note"]',e=>e.value)==='Conflicting edit');
  dialogMode='accept';
  await page.click('[role="dialog"] button[aria-label="Reload latest workspace"]');
  await page.waitForFunction(()=>document.querySelector('[role="dialog"]')?.textContent.includes('All changes saved'),{timeout:10000});
  check('reload discards the conflicting draft and adopts the saved revision',await page.$eval('input[aria-label="Fabrication note"]',e=>e.value)!=='Conflicting edit' && !(await page.evaluate(()=>document.querySelector('[role="dialog"]').textContent.includes('This job changed elsewhere'))));

  check('no uncaught browser errors',errors.length===0);if(errors.length)console.error(errors);
  console.log(`Production workspace: ${passed} passed, ${failed} failed (local synthetic demo)`);if(failed)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
