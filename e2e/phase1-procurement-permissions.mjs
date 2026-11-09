/* Mocked browser/UI regression. Start a local Vite server in supabase mode
 * with VITE_SUPABASE_URL pointed at itself on 4177. No hosted calls. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4177';
const browser = await launchBrowser();
let passed = 0, failed = 0;
function check(name, condition) { console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`); condition ? passed++ : failed++; }
try {
  const page = await browser.newPage();
  let capability = 'deny';
  const requests = [];
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.origin !== base) return void req.abort();
    if (!url.pathname.startsWith('/rest/v1/') && !url.pathname.startsWith('/auth/v1/')) return void req.continue();
    requests.push(url.pathname);
    const json = (body, status=200) => req.respond({status, contentType:'application/json', body:JSON.stringify(body)});
    const user = {id:'11111111-1111-1111-1111-111111111111',aud:'authenticated',role:'authenticated',email:'staff@example.test'};
    if (url.pathname === '/auth/v1/token') {
      const token = Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');
      return void json({access_token:`e30.${token}.sig`,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
    }
    if (url.pathname === '/auth/v1/user') return void json(user);
    if (url.pathname === '/rest/v1/rpc/procurement_read_allowed') return void (capability === 'error' ? json({message:'offline'},503) : json(capability === 'allow'));
    if (url.pathname === '/rest/v1/suppliers') return void json([{id:'SUP-test',name:'Synthetic supplier',payload:{active:true,paymentTerms:'net30'},created_at:'2026-01-01T00:00:00Z'}]);
    if (url.pathname === '/rest/v1/purchase_orders') return void json([{id:'PO-test',supplier_id:'SUP-test',supplier:{name:'Synthetic supplier'},items:[],status:'Draft',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'}]);
    return void json([]);
  });
  await page.goto(base, {waitUntil:'domcontentloaded'});
  await page.evaluate(async () => { const {supabase} = await import('/src/integrations/supabase/client.ts'); await supabase.auth.signInWithPassword({email:'staff@example.test',password:'test'}); });
  const goto = (path) => page.goto(`${base}/admin/${path}`, {waitUntil:'networkidle2'});
  const waitText = text => page.waitForFunction(t => document.body.innerText.includes(t), {timeout:20000}, text);
  const body = () => page.evaluate(() => document.body.innerText);
  await goto('suppliers');
  await waitText('You do not have permission to view procurement');
  check('supplier denial is explicit, not an empty list', !(await body()).includes('No suppliers yet'));
  check('denied supplier view makes no supplier query', !requests.includes('/rest/v1/suppliers'));
  await goto('purchase-orders');
  await waitText('You do not have permission to view procurement');
  check('purchase order denial is explicit, not an empty list', !(await body()).includes('No purchase orders match'));
  check('denied purchase order view makes no data queries', !requests.includes('/rest/v1/purchase_orders') && !requests.includes('/rest/v1/suppliers'));
  await goto('purchase-order/PO-test');
  await waitText('You do not have permission to view procurement');
  check('print view reports denial rather than not-found', !(await body()).includes('Purchase order not found'));
  await goto('inventory');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Movements')), {timeout:20000});
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Movements')).click());
  await waitText('You do not have permission to view procurement');
  check('stock movement denial is explicit', !(await body()).includes('No movements yet'));
  check('denied movement view makes no stock movement query', !requests.includes('/rest/v1/stock_movements'));
  capability = 'error';
  await goto('suppliers');
  await waitText('Could not verify procurement access');
  check('capability service failure is shown and fails closed', !requests.includes('/rest/v1/suppliers'));
  capability = 'allow';
  await goto('suppliers');
  await waitText('Synthetic supplier');
  check('permitted supplier records render', requests.includes('/rest/v1/suppliers'));
  await goto('purchase-orders');
  await waitText('PO-test');
  check('permitted purchase order and supplier render', (await body()).includes('Synthetic supplier'));
  console.log(`\n${passed} passed, ${failed} failed (mocked local Supabase; no real authorization)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
