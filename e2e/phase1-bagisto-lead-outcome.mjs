/* Real local Bagisto adapter and public forms, synthetic intercepted HTTP only. */
import { launchBrowser } from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8082';
const browser=await launchBrowser(); let mode='ok',calls=0,passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
const input={type:'quote',name:'Synthetic Customer',email:'test@example.test',phone:'03000000000',summary:'Synthetic enquiry',consent:true,consentAt:new Date().toISOString(),consentVersion:'lead-privacy-v1'};
try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',req=>{const u=new URL(req.url());if(u.origin!==base)return req.abort();
    if(u.pathname==='/api/shop/woodex/leads') {calls++;if(mode==='offline')return req.abort('failed');return req.respond({status:mode==='error'?500:200,contentType:'application/json',body:mode==='error'?'{"error":"simulated"}':mode==='invalid'?'not json':'{"message":"unverified"}'});}
    if(u.pathname.startsWith('/api/'))return req.respond({status:404,contentType:'application/json',body:'{}'});return req.continue();});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  let result=await page.evaluate(async input=>(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.createLead(input),input);
  check('parsed 2xx is unverified and does not create a local fallback',result.submissionOutcome==='bagisto-response-unverified' && await page.evaluate(()=>localStorage.getItem('woodex.outbox.leads.v1')===null));
  mode='error';result=await page.evaluate(async input=>(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.createLead(input),input);
  check('HTTP failure reports only successful local storage',result.submissionOutcome==='bagisto-queued-locally' && await page.evaluate(()=>JSON.parse(localStorage.getItem('woodex.outbox.leads.v1')).length===1));
  mode='offline';result=await page.evaluate(async input=>(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.createLead(input),input);
  check('network failure reports local fallback',result.submissionOutcome==='bagisto-queued-locally');
  mode='invalid';result=await page.evaluate(async input=>(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.createLead(input),input);
  check('invalid 2xx JSON is unconfirmed with local fallback',result.submissionOutcome==='bagisto-queued-locally');
  await page.evaluate(()=>{const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='woodex.outbox.leads.v1')throw new DOMException('denied','QuotaExceededError');return orig.call(this,k,v);};});
  mode='error';result=await page.evaluate(async input=>(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.createLead(input),input);
  check('failed storage is not claimed as saved',result.submissionOutcome==='bagisto-not-saved');
  result=await page.evaluate(async()=>{const api=(await import('/src/api/bagisto/admin.ts')).bagistoAdminApi;return api.captureChatOffline({name:'Synthetic Customer',phone:'03000000000',message:'Synthetic request',consent:true});});
  check('chat capture carries storage-failure outcome',result.submissionOutcome==='bagisto-not-saved');
  const consentCalls=calls;
  const noConsent=await page.evaluate(async()=>{try{await (await import('/src/api/bagisto/admin.ts')).bagistoAdminApi.captureChatOffline({name:'Test',phone:'03000000000',message:'Test',consent:false});return false;}catch{return true;}});
  check('chat still rejects missing consent without a request',noConsent && calls===consentCalls);

  mode='ok';await page.goto(`${base}/contact`,{waitUntil:'domcontentloaded'});await page.waitForSelector('#name');
  await page.type('#name','Synthetic Customer');await page.type('#email','test@example.test');await page.type('#message','Synthetic enquiry');
  await page.click('form input[type=checkbox]');
  let before=calls;
  await page.evaluate(()=>{const f=document.querySelector('#name').closest('form');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.waitForSelector('form [role=alert] input[type=checkbox]');
  check('contact blocks same-tick submit and treats 2xx as unconfirmed',calls===before+1 && await page.evaluate(()=>document.querySelector('form [role=alert]').textContent.includes('response could not be verified') && !document.body.textContent.includes('Message Sent!') && document.querySelector('#message').value==='Synthetic enquiry'));
  before=calls;await page.evaluate(()=>document.querySelector('#name').closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  check('contact cannot retry without acknowledgement',calls===before && await page.$eval('form button[type=submit]',b=>b.disabled));
  mode='error';await page.click('form [role=alert] input[type=checkbox]');
  await page.waitForFunction(()=>!document.querySelector('form button[type=submit]')?.disabled);
  await page.evaluate(()=>document.querySelector('#name').closest('form').requestSubmit());
  await page.waitForFunction(()=>document.querySelector('form [role=alert]')?.textContent.includes('only in this browser'));
  check('contact retry displays local-only privacy and delivery warning',calls===before+1 && await page.evaluate(()=>!document.querySelector('form [role=alert] input').checked && document.querySelector('form [role=alert]').textContent.includes('does not automatically send')));

  mode='error';await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>localStorage.setItem('woodex-quote',JSON.stringify([{id:'test-chair',name:'Test chair',category:'chairs',price:1000,quantity:1}])));
  await page.goto(`${base}/quotation`,{waitUntil:'domcontentloaded'});await page.waitForSelector('#project-type');
  await page.type('#name','Synthetic Customer');await page.type('#company','Test Company');await page.type('#email','test@example.test');await page.type('#phone','03000000000');await page.type('#project-type','Synthetic project');
  await page.click('#quote-form form input[type=checkbox]');
  await page.evaluate(()=>{const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='woodex.outbox.leads.v1')throw new DOMException('denied','QuotaExceededError');return orig.call(this,k,v);};});
  before=calls;await page.evaluate(()=>{const f=document.querySelector('#quote-form form');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.waitForSelector('#quote-form [role=alert]');
  check('quote blocks double submit and reports unsaved fallback without losing form or basket',calls===before+1 && await page.evaluate(()=>document.querySelector('#quote-form [role=alert]').textContent.includes('could not be saved') && document.querySelector('#project-type').value==='Synthetic project' && JSON.parse(localStorage.getItem('woodex-quote')).length===1 && !document.body.textContent.includes('Quote Request Submitted!')));

  mode='ok';await page.goto(base,{waitUntil:'domcontentloaded'});await page.evaluate(()=>sessionStorage.removeItem('woodex.chat.conversationId'));
  await page.waitForSelector('button[aria-label^="Open live chat"]');await page.click('button[aria-label^="Open live chat"]');await page.waitForSelector('#chat-cap-name');
  await page.type('#chat-cap-name','Synthetic Customer');await page.type('#chat-cap-phone','03000000000');await page.type('#chat-cap-message','Synthetic callback');
  await page.click('#woodex-chat-panel form input[type=checkbox]');before=calls;
  await page.evaluate(()=>{const f=document.querySelector('#woodex-chat-panel form');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.waitForSelector('#woodex-chat-panel [role=alert]');
  check('chat 2xx is unconfirmed, with no fake callback confirmation or thread',calls===before+1 && await page.evaluate(()=>document.querySelector('#woodex-chat-panel [role=alert]').textContent.includes('response could not be verified') && !document.querySelector('#woodex-chat-panel').textContent.includes('Team WOODEX will call you back.') && !sessionStorage.getItem('woodex.chat.conversationId') && document.querySelector('#chat-cap-message').value==='Synthetic callback'));
  mode='error';await page.click('#woodex-chat-panel [role=alert] input[type=checkbox]');
  await page.waitForFunction(()=>!document.querySelector('#woodex-chat-panel button[type=submit]')?.disabled);
  await page.evaluate(()=>document.querySelector('#woodex-chat-panel form').requestSubmit());
  await page.waitForFunction(()=>document.querySelector('#woodex-chat-panel [role=alert]')?.textContent.includes('only in this browser'));
  check('chat retry propagates local-only fallback and resets acknowledgement',await page.evaluate(()=>!document.querySelector('#woodex-chat-panel [role=alert] input').checked && document.querySelector('#woodex-chat-panel [role=alert]').textContent.includes('does not automatically send')));
  await page.evaluate(()=>{const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='woodex.outbox.leads.v1')throw new DOMException('denied','QuotaExceededError');return orig.call(this,k,v);};});
  mode='offline';await page.click('#woodex-chat-panel [role=alert] input[type=checkbox]');
  await page.waitForFunction(()=>!document.querySelector('#woodex-chat-panel button[type=submit]')?.disabled);
  await page.evaluate(()=>document.querySelector('#woodex-chat-panel form').requestSubmit());
  await page.waitForFunction(()=>document.querySelector('#woodex-chat-panel [role=alert]')?.textContent.includes('could not be saved'));
  check('chat reports failed browser storage instead of promising a callback',await page.evaluate(()=>!document.querySelector('#woodex-chat-panel').textContent.includes('Team WOODEX will call you back.') && !document.querySelector('#woodex-chat-panel [role=alert] input').checked));
  check('no uncaught browser errors',errors.length===0);
} catch(e){failed++;console.error('FAIL unexpected test error',e);} finally {await browser.close();}
console.log(`Bagisto lead outcome: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
