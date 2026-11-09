/* Synthetic browser contract tests; mocks HTTP and Turnstile, blocks external traffic. */
import { launchBrowser } from './lib.mjs';
const base=process.env.WOODEX_TEST_BASE??'http://127.0.0.1:8081';const browser=await launchBrowser();let mode='v2',bodies=[],passed=0,failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',req=>{const u=new URL(req.url());if(u.origin!==base)return req.abort();
    if(u.pathname==='/functions/v1/lead-capture'){bodies.push(JSON.parse(req.postData()));return req.respond({status:202,contentType:'application/json',body:JSON.stringify(mode==='v2'?{ok:true,id:42,capture_version:2}:{ok:true,id:42})});}
    if(u.pathname.startsWith('/auth/')||u.pathname.startsWith('/rest/'))return req.respond({status:404,contentType:'application/json',body:'{}'});return req.continue();});
  const challenge=async()=>page.evaluate(()=>{window.challengeActions=[];window.turnstile={render:(_holder,opts)=>{window.challengeActions.push(opts.action);queueMicrotask(()=>opts.callback('synthetic-token'));return 'mock';}};});
  await page.goto(`${base}/contact`,{waitUntil:'domcontentloaded'});await challenge();await page.waitForSelector('#name');
  const long='Message start '+ 'x'.repeat(300) + ' CONTACT END';
  await page.type('#name','Synthetic Customer');await page.type('#email','test@example.test');
  await page.$eval('#message',(e,value)=>{e.value=value;},long);await page.click('form input[type=checkbox]');
  check('contact shows length and sensitive-information guidance',await page.evaluate(()=>document.querySelector('#message').maxLength===3000 && document.querySelector('#name').closest('form').textContent.includes('do not include sensitive information')));
  await page.evaluate(()=>document.querySelector('#name').closest('form').requestSubmit());await page.waitForFunction(()=>document.body.textContent.includes('Message Sent!'));
  let body=bodies.at(-1);check('contact sends complete message past prior truncation limit',body.interest.endsWith('CONTACT END') && body.interest.includes(long) && body.capture_version===2 && body.cfTurnstileToken==='synthetic-token');

  await page.goto(base,{waitUntil:'domcontentloaded'});
  const items=Array.from({length:7},(_,i)=>({id:`item-${i+1}`,name:`Synthetic Product ${i+1}`,category:'chairs',price:1000,quantity:i+1,...(i===6?{variantLabel:'Finish: Walnut'}:{})}));
  await page.evaluate(items=>localStorage.setItem('woodex-quote',JSON.stringify(items)),items);
  await page.goto(`${base}/quotation`,{waitUntil:'domcontentloaded'});await challenge();await page.waitForSelector('#project-type');
  await page.type('#name','Synthetic Customer');await page.type('#company','Synthetic Company');await page.type('#email','test@example.test');await page.type('#phone','03000000000');await page.type('#project-type','Office refit');await page.click('#quote-form form input[type=checkbox]');
  check('quote clearly identifies basket as unpriced text summary',await page.evaluate(()=>document.querySelector('#quote-form form').textContent.includes('text summary') && document.querySelector('#quote-form form').textContent.includes('not a priced or accepted quotation')));
  await page.evaluate(()=>document.querySelector('#quote-form form').requestSubmit());await page.waitForFunction(()=>document.body.textContent.includes('Quote Request Submitted!'));
  body=bodies.at(-1);check('quote sends all seven lines, variant and nonbinding estimate',items.every(i=>body.interest.includes(i.name)) && body.interest.includes('Finish: Walnut') && body.interest.includes('Displayed estimate:') && body.interest.includes('not confirmed'));
  check('quote sends company and v2 marker',body.company==='Synthetic Company' && body.capture_version===2);

  mode='legacy';await page.goto(`${base}/contact`,{waitUntil:'domcontentloaded'});await challenge();await page.waitForSelector('#name');
  await page.type('#name','Synthetic Customer');await page.type('#email','test@example.test');await page.type('#message','Synthetic legacy response');await page.click('form input[type=checkbox]');
  await page.evaluate(()=>document.querySelector('#name').closest('form').requestSubmit());await page.waitForSelector('form [role=alert]');
  check('older function without acknowledgement cannot trigger success or clear form',await page.evaluate(()=>!document.body.textContent.includes('Message Sent!') && document.querySelector('#message').value==='Synthetic legacy response' && document.querySelector('form button[type=submit]').disabled));

  mode='v2';await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForSelector('button[aria-label^="Open live chat"]');await challenge();await page.click('button[aria-label^="Open live chat"]');await page.waitForSelector('#chat-cap-name');
  await page.type('#chat-cap-name','Synthetic Customer');await page.type('#chat-cap-phone','03000000000');
  const chat='Chat start '+ 'z'.repeat(300)+' CHAT END';
  await page.$eval('#chat-cap-message',(e,value)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));},chat);
  await page.click('#woodex-chat-panel form input[type=checkbox]');await page.evaluate(()=>document.querySelector('#woodex-chat-panel form').requestSubmit());
  await page.waitForFunction(()=>document.querySelector('#woodex-chat-panel')?.textContent.includes('Team WOODEX will call you back.'));
  body=bodies.at(-1);check('offline chat sends complete message past prior limit with lead action',body.interest.includes(chat) && body.interest.endsWith('CHAT END') && body.capture_version===2 && await page.evaluate(()=>window.challengeActions.includes('lead')));

  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>localStorage.setItem('woodex-quote',JSON.stringify([{id:'long',name:'X'.repeat(4100),category:'chairs',price:1000,quantity:1}])));
  await page.goto(`${base}/quotation`,{waitUntil:'domcontentloaded'});await challenge();await page.waitForSelector('#project-type');
  await page.type('#name','Synthetic Customer');await page.type('#company','Synthetic Company');await page.type('#email','test@example.test');await page.type('#phone','03000000000');await page.type('#project-type','Office refit');await page.click('#quote-form form input[type=checkbox]');
  const before=bodies.length;await page.evaluate(()=>document.querySelector('#quote-form form').requestSubmit());await page.waitForSelector('#quote-form [role=alert]');
  check('oversized quote is blocked before challenge or network and keeps basket',bodies.length===before && await page.evaluate(()=>document.querySelector('#quote-form [role=alert]').textContent.includes('too long') && window.challengeActions.length===0 && JSON.parse(localStorage.getItem('woodex-quote')).length===1));
  check('no uncaught browser errors',errors.length===0);
}catch(e){failed++;console.error('FAIL unexpected test error',e);}finally{await browser.close();}
console.log(`Lead content: ${passed} passed, ${failed} failed`);process.exitCode=failed?1:0;
