/* Local browser regression using a mocked demo adapter; never sends a real order. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:8080';
const browser = await launchBrowser();
let passed = 0, failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => new URL(req.url()).origin === base ? req.continue() : req.abort());
  await page.goto(base, {waitUntil:'domcontentloaded'});
  await page.evaluate(() => localStorage.setItem('woodex-cart', JSON.stringify([{id:'test-chair',name:'Test chair',category:'chairs',price:1000,quantity:1}])));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(async () => {
    const api = (await import('/src/api/demo/db.ts')).demoAdminApi;
    window.testCalls = [];
    api.createOrder = input => {
      window.testCalls.push(input);
      return new Promise((resolve, reject) => { window.testResolve = resolve; window.testReject = reject; });
    };
    history.pushState({}, '', '/checkout');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await page.waitForSelector('#name');
  await page.type('#name','Test Customer');
  await page.type('#phone','03000000000');
  await page.type('#address','Test address');
  await page.evaluate(() => {
    const form = document.querySelector('form');
    form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
    form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
  });
  await page.waitForFunction(() => window.testCalls.length === 1);
  check('same-tick submissions start only one order', await page.evaluate(() => window.testCalls.length === 1));
  check('submit disabled while order is pending', await page.$eval('button[type=submit]', b => b.disabled));
  await page.evaluate(() => window.testReject(new Error('simulated lost response')));
  await page.waitForSelector('[role=alert] input[type=checkbox]');
  check('unknown outcome warns about a possible order and duplicate', await page.$eval('[role=alert]', a => /couldn't confirm/.test(a.textContent) && /may have been placed/.test(a.textContent) && /duplicate/.test(a.textContent)));
  check('failed response preserves cart and blocks retry', await page.evaluate(() => JSON.parse(localStorage.getItem('woodex-cart')).length === 1 && document.querySelector('button[type=submit]').disabled));
  await page.evaluate(() => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})));
  check('programmatic submit cannot bypass acknowledgement', await page.evaluate(() => window.testCalls.length === 1));
  await page.click('[role=alert] input[type=checkbox]');
  check('acknowledgement enables explicit retry', await page.$eval('button[type=submit]', b => !b.disabled));
  await page.click('button[type=submit]');
  await page.waitForFunction(() => window.testCalls.length === 2);
  await page.evaluate(() => window.testReject(new Error('second uncertain result')));
  await page.waitForFunction(() => document.querySelector('[role=alert] input[type=checkbox]')?.checked === false);
  check('each uncertain result requires a fresh acknowledgement', await page.$eval('button[type=submit]', b => b.disabled));
  await page.click('[role=alert] input[type=checkbox]');
  await page.click('button[type=submit]');
  await page.waitForFunction(() => window.testCalls.length === 3);
  await page.evaluate(() => window.testResolve({id:'TEST-ORDER-1',total:1000}));
  await page.waitForFunction(() => document.body.textContent.includes('Order Placed Successfully!'));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('woodex-cart')).length === 0);
  check('confirmed success shows receipt and clears cart', await page.evaluate(() => document.body.textContent.includes('TEST-ORDER-1') && JSON.parse(localStorage.getItem('woodex-cart')).length === 0));
  // Reload removes the adapter mock. This order lives only in this browser's demo storage.
  await page.evaluate(() => localStorage.setItem('woodex-cart', JSON.stringify([{id:'test-chair',name:'Test chair',category:'chairs',price:1000,quantity:1}])));
  await page.goto(`${base}/checkout`, {waitUntil:'domcontentloaded'});
  await page.waitForSelector('#name');
  await page.type('#name','Local Demo Customer'); await page.type('#phone','03000000000'); await page.type('#address','Test address');
  await page.click('button[type=submit]');
  await page.waitForFunction(() => document.body.textContent.includes('Order Placed Successfully!'));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('woodex-cart')).length === 0);
  check('unmocked local demo order still completes and clears cart', await page.evaluate(() => document.body.textContent.includes('Order reference:') && JSON.parse(localStorage.getItem('woodex-cart')).length === 0));
  check('no uncaught browser errors', errors.length === 0);
} catch (e) { failed++; console.error('FAIL  unexpected test error', e); }
finally { await browser.close(); }
console.log(`Checkout safety: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
