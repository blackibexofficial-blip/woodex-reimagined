/* Demo-mode public forms and synthetic ambiguous failure, no hosted network. */
import { launchBrowser } from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8080';const browser=await launchBrowser();let passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).origin===base?r.continue():r.abort());
  await page.goto(`${base}/contact`,{waitUntil:'domcontentloaded'});await page.waitForSelector('#name');
  await page.evaluate(async()=>{const api=(await import('/src/api/demo/db.ts')).demoAdminApi;window.testCalls=0;api.createLead=()=>{window.testCalls++;return new Promise((resolve,reject)=>{window.testReject=reject;});};});
  await page.type('#name','Synthetic Customer');await page.type('#email','test@example.test');await page.type('#message','Synthetic enquiry');await page.click('form input[type=checkbox]');
  await page.evaluate(()=>{const f=document.querySelector('#name').closest('form');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>window.testCalls===1);check('contact locks overlapping in-flight requests',await page.evaluate(()=>window.testCalls===1));
  check('contact fields and consent cannot be edited while request is pending',await page.evaluate(()=>document.querySelector('#message').matches(':disabled') && document.querySelector('form input[type=checkbox]').matches(':disabled')));
  await page.evaluate(()=>window.testReject(new Error('simulated lost response')));await page.waitForSelector('form [role=alert] input[type=checkbox]');
  check('ambiguous error warns and retains contact form',await page.evaluate(()=>document.querySelector('form [role=alert]').textContent.includes('may already have reached us') && document.querySelector('#message').value==='Synthetic enquiry' && document.querySelector('form button[type=submit]').disabled));
  await page.click('form [role=alert] input[type=checkbox]');check('contact retry requires acknowledgement',await page.$eval('form button[type=submit]',b=>!b.disabled));
  // Full navigation removes the mock. Both entries persist only in this browser's demo DB.
  await page.goto(`${base}/contact`,{waitUntil:'domcontentloaded'});await page.waitForSelector('#name');
  await page.type('#name','Local Demo Customer');await page.type('#email','demo@example.test');await page.type('#message','Local demo message');await page.click('form input[type=checkbox]');
  await page.evaluate(()=>document.querySelector('#name').closest('form').requestSubmit());await page.waitForFunction(()=>document.body.textContent.includes('Message Sent!'));
  check('unmocked demo contact still completes',await page.evaluate(()=>document.body.textContent.includes('Message Sent!')));
  await page.goto(`${base}/quotation`,{waitUntil:'domcontentloaded'});await page.waitForSelector('#project-type');
  await page.type('#name','Local Demo Customer');await page.type('#company','Demo Company');await page.type('#email','demo@example.test');await page.type('#phone','03000000000');await page.type('#project-type','Demo project');await page.click('#quote-form form input[type=checkbox]');
  await page.evaluate(()=>document.querySelector('#quote-form form').requestSubmit());await page.waitForFunction(()=>document.body.textContent.includes('Quote Request Submitted!'));
  check('unmocked demo quote still completes',await page.evaluate(()=>document.body.textContent.includes('Quote Request Submitted!')));
  check('no uncaught browser errors',errors.length===0);
}catch(e){failed++;console.error('FAIL unexpected test error',e);}finally{await browser.close();}
console.log(`Demo lead safety: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
