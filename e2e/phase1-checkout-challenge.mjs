/* Supabase-mode browser regression; provider and order adapter are mocked, all external network blocked. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:8081';
const browser = await launchBrowser();
let passed=0, failed=0;
const check=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);ok?passed++:failed++;};
try {
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',req=>new URL(req.url()).origin===base?req.continue():req.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>localStorage.setItem('woodex-cart',JSON.stringify([{id:'test-chair',name:'Test chair',category:'chairs',price:1000,quantity:1}])));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(async()=>{
    const api=(await import('/src/api/supabase.ts')).supabaseAdminApi;
    window.testCalls=[]; window.challengeCalls=0;
    api.createOrder=async input=>{window.testCalls.push(input); return {id:'TEST-ORDER-2',total:1000};};
    window.turnstile={render:(_holder,opts)=>{window.challengeCalls++; window.testChallenge=opts; return 'fake-widget';}};
    history.pushState({},'', '/checkout'); window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForSelector('#name');
  await page.type('#name','Test Customer'); await page.type('#phone','03000000000'); await page.type('#address','Test address');
  await page.evaluate(()=>{const f=document.querySelector('form');f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>window.challengeCalls===1);
  check('synchronous lock includes the pending challenge',await page.evaluate(()=>window.challengeCalls===1 && window.testCalls.length===0));
  await page.evaluate(()=>window.testChallenge['error-callback']());
  await page.waitForFunction(()=>document.body.textContent.includes("Verification didn't load"));
  check('challenge failure sends no order and unlocks retry without unknown-order warning',await page.evaluate(()=>window.testCalls.length===0 && !document.querySelector('[role=alert] input[type=checkbox]') && !document.querySelector('button[type=submit]').disabled));
  await page.click('button[type=submit]'); await page.waitForFunction(()=>window.challengeCalls===2);
  await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Open cart"]')].find(e=>e.getClientRects().length)?.click());
  await page.waitForSelector('[aria-label="Increase quantity"]',{visible:true});
  await page.evaluate(()=>[...document.querySelectorAll('[aria-label="Increase quantity"]')].find(e=>e.getClientRects().length)?.click());
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('woodex-cart'))[0].quantity===2);await page.keyboard.press('Escape');
  await page.evaluate(()=>window.testChallenge.callback('old-token'));
  await page.waitForFunction(()=>document.body.textContent.includes('Your cart changed or couldn\'t be checked'));
  check('cart edit during verification cancels before order submission',await page.evaluate(()=>window.testCalls.length===0 && !document.querySelector('button[type=submit]').disabled && !document.querySelector('[role=alert] input[type=checkbox]')));
  await page.waitForFunction(()=>!document.body.textContent.includes('Your cart changed or couldn\'t be checked'),{timeout:15000});
  await page.click('button[type=submit]');await page.waitForFunction(()=>window.challengeCalls===3);
  await page.evaluate(()=>window.testChallenge.callback('fake-token'));
  await page.waitForFunction(()=>document.body.textContent.includes('Order Placed Successfully!'));
  check('retry after challenge failure or cart edit submits once with new token and current cart',await page.evaluate(()=>window.testCalls.length===1 && window.testCalls[0].cfTurnstileToken==='fake-token' && window.testCalls[0].items[0].quantity===2));
  check('no uncaught browser errors',errors.length===0);
} catch(e){failed++;console.error('FAIL  unexpected test error',e);} finally {await browser.close();}
console.log(`Checkout challenge: ${passed} passed, ${failed} failed`); process.exitCode=failed?1:0;
