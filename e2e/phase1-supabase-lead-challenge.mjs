/* Synthetic Supabase-mode lead and challenge tests; no hosted requests. */
import { launchBrowser } from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8081';
const browser=await launchBrowser();let mode='valid',bodies=[],passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try {
  const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',req=>{const u=new URL(req.url());if(u.origin!==base)return req.abort();
    if(u.pathname==='/functions/v1/lead-capture'){bodies.push(JSON.parse(req.postData()));return req.respond({status:mode==='denied'?403:202,contentType:'application/json',body:mode==='valid'?'{"ok":true,"id":42,"capture_version":2}':mode==='legacy'?'{"ok":true,"id":42}':mode==='string-id'?'{"ok":true,"id":"9007199254740993","capture_version":2}':mode==='bad-id'?'{"ok":true,"id":"not-an-id","capture_version":2}':mode==='empty'?'{"ok":true,"id":null,"capture_version":2}':mode==='false'?'{"ok":false,"id":42,"capture_version":2}':'{"error":"denied"}'});}
    if(u.pathname.startsWith('/auth/') || u.pathname.startsWith('/rest/'))return req.respond({status:404,contentType:'application/json',body:'{}'});
    return req.continue();});
  const installChallenge=async()=>page.evaluate(()=>{window.challengeCalls=0;window.turnstile={render:(_holder,opts)=>{window.challengeCalls++;window.testChallenge=opts;return 'fake-widget';}};});
  await page.goto(base,{waitUntil:'domcontentloaded'});await installChallenge();
  await page.waitForSelector('button[aria-label^="Open live chat"]');await page.click('button[aria-label^="Open live chat"]');await page.waitForSelector('#chat-cap-name');
  await page.type('#chat-cap-name','Synthetic Customer');await page.type('#chat-cap-phone','03000000000');await page.type('#chat-cap-message','Synthetic callback');await page.click('#woodex-chat-panel form input[type=checkbox]');
  await page.evaluate(()=>{const f=document.querySelector('#woodex-chat-panel form');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>window.challengeCalls===1);
  check('chat locks synchronously before challenge and sends no lead',await page.evaluate(()=>window.challengeCalls===1 && window.testChallenge.action==='lead') && bodies.length===0);
  check('chat inputs and consent are disabled during verification',await page.evaluate(()=>document.querySelector('#chat-cap-message').matches(':disabled') && document.querySelector('#woodex-chat-panel form input[type=checkbox]').matches(':disabled')));
  await page.evaluate(()=>window.testChallenge['error-callback']());
  await page.waitForFunction(()=>document.body.textContent.includes("Verification didn't load"));
  check('failed chat challenge unlocks without creating unknown outcome',bodies.length===0 && await page.evaluate(()=>!document.querySelector('#woodex-chat-panel [role=alert]') && !document.querySelector('#woodex-chat-panel button[type=submit]').disabled));
  await page.evaluate(()=>document.querySelector('#woodex-chat-panel form').requestSubmit());await page.waitForFunction(()=>window.challengeCalls===2);
  await page.evaluate(()=>window.testChallenge.callback('synthetic-lead-token'));
  await page.waitForFunction(()=>document.querySelector('#woodex-chat-panel')?.textContent.includes('Team WOODEX will call you back.'));
  check('chat passes fresh lead token through actual Supabase adapter',bodies.length===1 && bodies[0].cfTurnstileToken==='synthetic-lead-token' && bodies[0].consent===true);

  mode='empty';await page.goto(`${base}/contact`,{waitUntil:'domcontentloaded'});await installChallenge();await page.waitForSelector('#name');
  await page.type('#name','Synthetic Customer');await page.type('#email','test@example.test');await page.type('#message','Synthetic enquiry');await page.click('form input[type=checkbox]');
  await page.evaluate(()=>document.querySelector('#name').closest('form').requestSubmit());await page.waitForFunction(()=>window.challengeCalls===1);await page.evaluate(()=>window.testChallenge.callback('synthetic-contact-token'));
  await page.waitForSelector('form [role=alert] input[type=checkbox]');
  check('missing receipt ID is uncertain and preserves contact form',bodies.at(-1).cfTurnstileToken==='synthetic-contact-token' && await page.evaluate(()=>!document.body.textContent.includes('Message Sent!') && document.querySelector('#message').value==='Synthetic enquiry' && document.querySelector('form button[type=submit]').disabled));
  mode='false';await page.click('form [role=alert] input[type=checkbox]');await page.waitForFunction(()=>!document.querySelector('form button[type=submit]')?.disabled);
  await page.evaluate(()=>document.querySelector('#name').closest('form').requestSubmit());await page.waitForFunction(()=>window.challengeCalls===2);await page.evaluate(()=>window.testChallenge.callback('synthetic-retry-token'));
  await page.waitForFunction(()=>document.querySelector('form [role=alert] input[type=checkbox]')?.checked===false);
  check('false ok response is uncertain and forces acknowledgement again',bodies.at(-1).cfTurnstileToken==='synthetic-retry-token' && await page.$eval('form button[type=submit]',b=>b.disabled));
  mode='denied';await page.click('form [role=alert] input[type=checkbox]');await page.waitForFunction(()=>!document.querySelector('form button[type=submit]')?.disabled);
  await page.evaluate(()=>document.querySelector('#name').closest('form').requestSubmit());await page.waitForFunction(()=>window.challengeCalls===3);await page.evaluate(()=>window.testChallenge.callback('synthetic-denied-token'));
  await page.waitForFunction(()=>document.querySelector('form [role=alert] input[type=checkbox]')?.checked===false);
  check('backend rejection does not claim delivery and requires renewed acknowledgement',bodies.at(-1).cfTurnstileToken==='synthetic-denied-token' && await page.$eval('form button[type=submit]',b=>b.disabled));
  mode='valid';await page.goto(`${base}/quotation`,{waitUntil:'domcontentloaded'});await installChallenge();await page.waitForSelector('#project-type');
  await page.type('#name','Synthetic Customer');await page.type('#company','Test Company');await page.type('#email','test@example.test');await page.type('#phone','03000000000');await page.type('#project-type','Synthetic project');await page.click('#quote-form form input[type=checkbox]');
  await page.evaluate(()=>document.querySelector('#quote-form form').requestSubmit());await page.waitForFunction(()=>window.challengeCalls===1);await page.evaluate(()=>window.testChallenge.callback('synthetic-quote-token'));
  await page.waitForFunction(()=>document.body.textContent.includes('Quote Request Submitted!'));
  check('quote sends correct challenge and accepts valid synthetic receipt',bodies.at(-1).cfTurnstileToken==='synthetic-quote-token' && bodies.at(-1).consent===true);
  const input={type:'quote',name:'Synthetic Customer',email:'test@example.test',phone:'03000000000',summary:'Synthetic',consent:true,consentVersion:'lead-privacy-v1'};
  mode='legacy';const legacy=await page.evaluate(async input=>{try{await (await import('/src/api/supabase.ts')).supabaseAdminApi.createLead(input);return false;}catch{return true;}},input);
  check('legacy receipt without v2 acknowledgement is uncertain',legacy && bodies.at(-1).capture_version===2);
  mode='bad-id';const bad=await page.evaluate(async input=>{try{await (await import('/src/api/supabase.ts')).supabaseAdminApi.createLead(input);return false;}catch{return true;}},input);
  check('malformed receipt ID cannot fabricate a lead reference',bad);
  mode='string-id';const good=await page.evaluate(async input=>(await import('/src/api/supabase.ts')).supabaseAdminApi.createLead(input),input);
  check('decimal string receipt ID is accepted without precision loss',good.id==='lead-9007199254740993');
  check('no uncaught browser errors',errors.length===0);
} catch(e){failed++;console.error('FAIL unexpected test error',e);} finally {await browser.close();}
console.log(`Supabase lead challenge: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
