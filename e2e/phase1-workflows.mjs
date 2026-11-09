/* Isolated demo browser regression. Start Vite in demo mode, then run this script.
 * It uses only a fresh browser's localStorage and never contacts hosted data. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4175';
const browser = await launchBrowser();
let passed = 0, failed = 0;
function check(name, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (condition) passed++; else failed++;
}
try {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  const tests = await page.evaluate(async () => {
    const { demoAdminApi: api } = await import('/src/api/demo/db.ts');
    const quote = await api.createQuote({customerName: 'Phase One Synthetic', customerPhone: '03000000000', items: [{name:'Test line', price:100, quantity:2}]});
    const originalOrders = (await api.listOrders({perPage: 1000})).total;
    const results = [];
    for (const status of ['draft','review','approval','sent','revised','declined']) {
      await api.updateQuote(quote.id, {status});
      let rejected = false;
      try { await api.convertQuote(quote.id); } catch (e) { rejected = /Only accepted quotes/.test(e.message); }
      const after = await api.getQuote(quote.id);
      results.push({status, pass: rejected && after.status === status && (await api.listOrders({perPage: 1000})).total === originalOrders});
    }
    await api.updateQuote(quote.id, {status:'draft'});
    localStorage.setItem('woodex.admin.session', JSON.stringify({email:'test@example.test', name:'Test', signedInAt:new Date().toISOString()}));
    return {id:quote.id, results, originalOrders};
  });
  for (const result of tests.results) check(`demo ${result.status} rejected without order`, result.pass);
  await page.goto(`${base}/admin/quotes`, {waitUntil:'networkidle2'});
  await page.waitForSelector(`button[aria-label="Convert ${tests.id} to order"]`, {timeout:20000});
  check('draft convert button is disabled', await page.$eval(`button[aria-label="Convert ${tests.id} to order"]`, el => el.disabled));
  await page.evaluate(async (id) => { const {demoAdminApi:api} = await import('/src/api/demo/db.ts'); await api.updateQuote(id, {status:'accepted'}); }, tests.id);
  await page.reload({waitUntil:'networkidle2'});
  await page.waitForSelector(`button[aria-label="Convert ${tests.id} to order"]`, {timeout:20000});
  check('accepted convert button is enabled', !(await page.$eval(`button[aria-label="Convert ${tests.id} to order"]`, el => el.disabled)));
  await page.click(`button[aria-label="Convert ${tests.id} to order"]`);
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].some(b => b.textContent.includes('Convert to order')));
  await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent.includes('Convert to order')).click());
  await page.waitForFunction(id => document.querySelector(`button[aria-label="Convert ${id} to order"]`)?.disabled === true, {timeout:20000}, tests.id);
  const final = await page.evaluate(async ({id, originalOrders}) => {
    const {demoAdminApi:api} = await import('/src/api/demo/db.ts');
    const quote = await api.getQuote(id);
    const replay = await api.convertQuote(id);
    return {converted:quote.status === 'converted' && !!quote.convertedOrderId, replay:replay === undefined, oneOrder:(await api.listOrders({perPage:1000})).total === originalOrders + 1};
  }, tests);
  check('accepted quote converts through UI once', final.converted && final.oneOrder);
  check('demo converted replay does not create another order', final.replay && final.oneOrder);
  console.log(`\n${passed} passed, ${failed} failed (local demo browser)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
