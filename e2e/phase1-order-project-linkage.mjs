/* Local synthetic demo regression for the order → production job link
   (candidate 00024 UI/adapters). Never reaches a hosted provider. */
import {launchBrowser} from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8080';
const browser=await launchBrowser();let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try {
  const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===new URL(base).origin?r.continue():r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const seed=await page.evaluate(async()=>{localStorage.clear();localStorage.setItem('woodex.admin.session',JSON.stringify({email:'production@example.test',name:'Tester',signedInAt:new Date().toISOString()}));const api=(await import('/src/api/index.ts')).getAdminApi();const res=await api.listOrders({status:'all',page:1,perPage:50});return res.items.map(o=>({id:o.id,status:o.status,title:o.customerName,email:o.customerEmail}));});
  const open=seed.find(o=>o.status!=='cancelled');
  const cancelled=seed.find(o=>o.status==='cancelled');
  const open2=seed.filter(o=>o.status!=='cancelled')[1];
  if(!open||!open2||!cancelled)throw Error('Seed orders missing (need two open and one cancelled)');

  await page.goto(`${base}/admin/orders`,{waitUntil:'domcontentloaded'});
  const openOrder=async id=>{
    await page.waitForFunction(id=>[...document.querySelectorAll('td')].some(td=>td.textContent.trim()===id),{timeout:30000},id);
    await page.evaluate(id=>{const cell=[...document.querySelectorAll('td')].find(td=>td.textContent.trim()===id);cell.closest('tr').click();},id);
    await page.waitForSelector('[role="dialog"]');
    await page.waitForFunction(()=>document.querySelector('[aria-label="Production job"]')!==null,{timeout:15000});
  };
  const dialogText=()=>page.evaluate(()=>document.querySelector('[role="dialog"]').textContent);
  const storedProjects=()=>page.evaluate(async()=>(await (await import('/src/api/index.ts')).getAdminApi().listProjects()).map(p=>({id:p.id,title:p.title,orderId:p.orderId,active:p.active})));
  const storedOrder=()=>page.evaluate(async id=>{const raw=localStorage.getItem('woodex.admin.db.v1');const db=JSON.parse(raw);const o=(db.orders??[]).find(x=>x.id===id);return o?{id:o.id,status:o.status}:null;},open.id);

  await openOrder(open.id);
  check('an unlinked order shows the empty production state',(await dialogText()).includes('No production job is linked to this order yet'));
  await page.click('[role="dialog"] button[aria-label="Start production job"]');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Production job"]')?.textContent.includes('% complete'),{timeout:20000});
  const created=(await storedProjects()).find(p=>p.orderId===open.id);
  check('starting production creates a job linked to the order',!!created);
  check('the new job is internal (inactive, never in the portfolio)',created?.active===false);
  check('the new job title carries the order reference',String(created?.title).includes(open.id));
  const prodText=await dialogText();
  check('the order dialog shows progress and QC for the job',prodText.includes('0% complete')&&prodText.includes('QC')&&prodText.includes('Open in Projects'));
  check('linking does not change the order status',(await storedOrder())?.status===open.status);
  const audit=await page.evaluate(async id=>(await (await import('/src/api/index.ts')).getAdminApi().listProjectProductionEvents(id)).map(e=>e.action),created.id);
  check('the link is written to the production audit trail',audit.includes('order_linked'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('[role="dialog"]')===null,{timeout:10000});

  const guard=await page.evaluate(async ({openId,open2Id,cancelledId})=>{
    const api=(await import('/src/api/index.ts')).getAdminApi();
    const out={};
    const projects=await api.listProjects();
    const other=projects.find(p=>!p.orderId&&!p.practice?.production) ?? projects.find(p=>!p.orderId);
    try{await api.linkProjectOrder(other.id,openId);out.secondJob='allowed';}catch(e){out.secondJob=e instanceof Error?e.message:String(e);}
    try{await api.linkProjectOrder(other.id,cancelledId);out.cancelled='allowed';}catch(e){out.cancelled=e instanceof Error?e.message:String(e);}
    out.otherId=other.id;
    try{await api.linkProjectOrder(other.id,open2Id);out.linked=await api.getOrderProduction(open2Id).then(r=>r?.projectId??null);}catch(e){out.linked=e instanceof Error?e.message:String(e);}
    try{await api.linkProjectOrder(other.id,openId);out.relink='allowed';}catch(e){out.relink=e instanceof Error?e.message:String(e);}
    return out;
  },{openId:open.id,open2Id:open2.id,cancelledId:cancelled.id});
  check('a second job cannot claim an order that already has one',String(guard.secondJob).includes('already has a production job'));
  check('a cancelled order cannot start production',String(guard.cancelled).includes('cancelled'));
  check('another job can link a different order',guard.linked===guard.otherId);
  check('a linked job cannot be re-pointed to another order',String(guard.relink).includes('already linked to order'));

  await page.reload({waitUntil:'domcontentloaded'});
  await page.goto(`${base}/admin/projects`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(title=>[...document.querySelectorAll('td')].some(td=>td.textContent.includes(title)),{timeout:30000},String(created?.title));
  check('the projects table shows the order link badge',
    await page.evaluate(id=>[...document.querySelectorAll('[aria-label^="Linked order"]')].some(el=>el.getAttribute('aria-label')===`Linked order ${id}`),open.id));

  await page.evaluate(async id=>{const api=(await import('/src/api/index.ts')).getAdminApi();await api.unlinkProjectOrder(id,'customer cancelled the job');},created.id);
  const afterUnlink=(await storedProjects()).find(p=>p.id===created.id);
  check('unlinking removes the link but keeps the job',!!afterUnlink && !afterUnlink.orderId);
  const unlinkAudit=await page.evaluate(async id=>(await (await import('/src/api/index.ts')).getAdminApi().listProjectProductionEvents(id)).map(e=>e.action),created.id);
  check('unlinking is recorded in the audit trail',unlinkAudit.includes('order_unlinked'));

  await page.goto(`${base}/admin/orders`,{waitUntil:'domcontentloaded'});
  await openOrder(cancelled.id);
  check('a cancelled order cannot be given a production job',
    await page.evaluate(()=>{const b=document.querySelector('[role="dialog"] button[aria-label="Start production job"]');return !b || b.disabled;}));

  check('no uncaught browser errors',errors.length===0);if(errors.length)console.error(errors);
  console.log(`Order → production link: ${passed} passed, ${failed} failed (local synthetic demo)`);if(failed)process.exitCode=1;
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
