/* Demo-mode manual-order regression: mocked errors and a real browser-local order. */
import { launchBrowser } from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8080';
const browser=await launchBrowser(); let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try {
  const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true); page.on('request',r=>new URL(r.url()).origin===base?r.continue():r.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>localStorage.setItem('woodex.admin.session',JSON.stringify({email:'test@example.test',name:'Test',signedInAt:new Date().toISOString()})));
  await page.goto(`${base}/admin/orders/new`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#sale-name');
  await page.evaluate(async()=>{const api=(await import('/src/api/demo/db.ts')).demoAdminApi;window.orderCalls=0;api.createOrder=()=>{window.orderCalls++;return new Promise((resolve,reject)=>{window.orderResolve=resolve;window.orderReject=reject;});};});
  const fill=async()=>{
    await page.type('#sale-name','Synthetic Customer'); await page.type('#sale-phone','03000000000'); await page.type('#sale-city','Lahore');
    await page.type('[aria-label="Free line name"]','Test chair'); await page.type('[aria-label="Free line price"]','1000');
    await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add').click());
  };
  await fill();
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order'));b.click();b.click();});
  await page.waitForFunction(()=>window.orderCalls===1);
  check('manual order blocks same-tick submits',await page.evaluate(()=>window.orderCalls===1));
  await page.evaluate(()=>window.orderReject(new Error('simulated lost response')));
  await page.waitForSelector('[role=alert] input[type=checkbox]');
  check('ambiguous error stays on form and warns of possible duplicate',await page.evaluate(()=>location.pathname==='/admin/orders/new' && document.querySelector('[role=alert]').textContent.includes('may already exist') && [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order')).disabled));
  await page.click('[role=alert] input[type=checkbox]');
  check('admin must explicitly acknowledge to re-enable submission',await page.evaluate(()=>![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order')).disabled));
  // A full navigation removes the mock. This creates an order only in isolated browser demo storage.
  await page.goto(`${base}/admin/orders/new`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#sale-name'); await fill();
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order')).click());
  await page.waitForFunction(()=>/^\/admin\/order\//.test(location.pathname));
  await page.waitForFunction(()=>document.body.textContent.includes('Synthetic Customer'));
  check('unmocked demo manual order navigates to its printable order',await page.evaluate(()=>/^\/admin\/order\//.test(location.pathname) && document.body.textContent.includes('Synthetic Customer')));
  check('no uncaught browser errors',errors.length===0);
} catch(e){failed++;console.error('FAIL unexpected test error',e);} finally {await browser.close();}
console.log(`Manual order safety: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
