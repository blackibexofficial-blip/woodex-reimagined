/* Fake Bagisto mode, real adapter + UI. All requests outside the local Vite server are blocked. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:8082';
const browser = await launchBrowser();
let passed=0, failed=0, mode='ok', checkoutCalls=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
const input={customerName:'Synthetic Customer',customerPhone:'03000000000',city:'Lahore',address:'Test address',paymentMethod:'cod',items:[{id:'test-chair',name:'Test chair',price:1000,quantity:1}],subtotal:1000,shipping:0,total:1000};
try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',req=>{
    const u=new URL(req.url());
    if(u.origin!==base) return req.abort();
    if(u.pathname==='/api/shop/checkout') {
      checkoutCalls++;
      if(mode==='offline') return req.abort('failed');
      return req.respond({status:mode==='error'?500:200,contentType:'application/json',body:mode==='error'?'{"error":"simulated"}':mode==='invalid'?'not json':'{"message":"not a verified receipt"}'});
    }
    if(u.pathname.startsWith('/api/')) return req.respond({status:404,contentType:'application/json',body:'{}'});
    return req.continue();
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  let result=await page.evaluate(async input=>(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.createOrder(input),input);
  check('unverified 200 is not presented as a confirmed order',result.submissionOutcome==='bagisto-response-unverified' && result.id.startsWith('WDX-WEB-'));
  check('unverified 200 does not create an outbox entry',await page.evaluate(()=>localStorage.getItem('woodex.outbox.orders.v1')===null));
  mode='error'; result=await page.evaluate(async input=>(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.createOrder(input),input);
  check('HTTP failure reports local-only fallback',result.submissionOutcome==='bagisto-queued-locally' && await page.evaluate(()=>JSON.parse(localStorage.getItem('woodex.outbox.orders.v1')).length===1));
  mode='offline'; result=await page.evaluate(async input=>(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.createOrder(input),input);
  check('network failure also reports local-only fallback',result.submissionOutcome==='bagisto-queued-locally' && await page.evaluate(()=>JSON.parse(localStorage.getItem('woodex.outbox.orders.v1')).length===2));
  mode='invalid'; result=await page.evaluate(async input=>(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.createOrder(input),input);
  check('malformed HTTP 200 response is unconfirmed and stored only locally',result.submissionOutcome==='bagisto-queued-locally' && await page.evaluate(()=>JSON.parse(localStorage.getItem('woodex.outbox.orders.v1')).length===3));
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='woodex.outbox.orders.v1') throw new DOMException('storage blocked','QuotaExceededError');return original.call(this,k,v);};});
  result=await page.evaluate(async input=>(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.createOrder(input),input);
  check('storage failure is not claimed as saved',result.submissionOutcome==='bagisto-not-saved' && await page.evaluate(()=>JSON.parse(localStorage.getItem('woodex.outbox.orders.v1')).length===3));

  const openCheckout=async()=>{
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{localStorage.removeItem('woodex.outbox.orders.v1');localStorage.setItem('woodex-cart',JSON.stringify([{id:'test-chair',name:'Test chair',category:'chairs',price:1000,quantity:1}]));});
    await page.goto(`${base}/checkout`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#name');
    await page.type('#name','Synthetic Customer'); await page.type('#phone','03000000000'); await page.type('#address','Test address');
  };
  const submitCheckout=async()=>{await page.click('button[type=submit]');await page.waitForSelector('[role=alert] input[type=checkbox]');};
  mode='ok'; await openCheckout(); await submitCheckout();
  check('storefront 200 remains unconfirmed, keeps cart and hides fake reference/success',await page.evaluate(()=>document.querySelector('[role=alert]').textContent.includes('response could not be verified') && !document.body.textContent.includes('Order Placed Successfully!') && !document.body.textContent.includes('WDX-WEB-') && JSON.parse(localStorage.getItem('woodex-cart')).length===1));
  mode='error'; await openCheckout(); await submitCheckout();
  check('storefront queued fallback says browser-only, not automatically sent',await page.evaluate(()=>{const t=document.querySelector('[role=alert]').textContent;return t.includes('only in this browser') && t.includes('does not automatically send') && JSON.parse(localStorage.getItem('woodex.outbox.orders.v1')).length===1 && JSON.parse(localStorage.getItem('woodex-cart')).length===1;}));
  let calls=checkoutCalls; await page.evaluate(()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  check('storefront blocks accidental retries after a queued outcome',checkoutCalls===calls && await page.$eval('button[type=submit]',b=>b.disabled));
  await page.click('[role=alert] input[type=checkbox]');
  await page.waitForFunction(()=>!document.querySelector('button[type=submit]')?.disabled);
  // A transient toast can cover the sticky submit button; wait for its dismissal.
  await page.waitForFunction(()=>document.querySelectorAll('[data-sonner-toast]').length===0);
  await page.click('button[type=submit]');
  await page.waitForFunction(()=>document.querySelector('[role=alert] input[type=checkbox]')?.checked===false);
  check('acknowledged retry performs a new request and requires acknowledgement again',checkoutCalls===calls+1 && await page.$eval('button[type=submit]',b=>b.disabled));
  mode='offline'; await openCheckout();
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='woodex.outbox.orders.v1') throw new DOMException('storage blocked','QuotaExceededError');return original.call(this,k,v);};});
  await submitCheckout();
  check('storefront reports when the local fallback cannot be saved',await page.$eval('[role=alert]',a=>a.textContent.includes('could not be saved')));

  // Browser-local demo session is solely a test harness, not Bagisto authentication.
  mode='error'; await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>localStorage.setItem('woodex.admin.session',JSON.stringify({email:'test@example.test',name:'Test',signedInAt:new Date().toISOString()})));
  await page.goto(`${base}/admin/orders/new`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#sale-name');
  await page.type('#sale-name','Synthetic Customer'); await page.type('#sale-phone','03000000000'); await page.type('#sale-city','Lahore');
  await page.type('[aria-label="Free line name"]','Test chair'); await page.type('[aria-label="Free line price"]','1000');
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Add').click());
  calls=checkoutCalls;
  await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order'));b.click();b.click();});
  await page.waitForSelector('[role=alert] input[type=checkbox]');
  check('manual form blocks same-tick duplicate submits',checkoutCalls===calls+1);
  check('manual admin order remains on form with warning, not fake print URL',await page.evaluate(()=>location.pathname==='/admin/orders/new' && document.querySelector('[role=alert]').textContent.includes('only in this browser') && !document.body.textContent.includes('created — opening')));
  check('admin retry is disabled until duplicate risk is acknowledged',await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order')).disabled));
  await page.click('[role=alert] input[type=checkbox]');
  check('admin can explicitly acknowledge and retry',await page.evaluate(()=>![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order')).disabled));
  calls=checkoutCalls;
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order')).click());
  await page.waitForFunction(()=>document.querySelector('[role=alert] input[type=checkbox]')?.checked===false);
  check('admin repeat failure resets acknowledgement',checkoutCalls===calls+1 && await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order')).disabled));
  mode='ok'; await page.click('[role=alert] input[type=checkbox]');
  await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order'))?.disabled);
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Create order')).click());
  await page.waitForFunction(()=>document.querySelector('[role=alert]')?.textContent.includes('response could not be verified'));
  check('admin also treats HTTP 200 as unverified and does not navigate to fake print URL',await page.evaluate(()=>location.pathname==='/admin/orders/new' && document.querySelector('[role=alert] input[type=checkbox]').checked===false));
  check('no uncaught browser errors',errors.length===0);
} catch(e){failed++;console.error('FAIL unexpected test error',e);} finally {await browser.close();}
console.log(`Bagisto order outcome: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
