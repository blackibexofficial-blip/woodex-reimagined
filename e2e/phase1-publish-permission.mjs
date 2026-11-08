/* Mocked Supabase auth/capability UI regression; start Vite in supabase mode
 * with VITE_SUPABASE_URL pointing at the same local test server. No hosted calls. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4176';
const browser = await launchBrowser();
let passed = 0, failed = 0;
function check(name, condition) { console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`); condition ? passed++ : failed++; }
try {
  const page = await browser.newPage();
  let capability = 'allow';
  let heldRequest;
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.origin !== base || (!url.pathname.startsWith('/auth/v1/') && !url.pathname.startsWith('/rest/v1/'))) return void req.continue();
    const json = (body, status = 200) => req.respond({status, contentType:'application/json', body: JSON.stringify(body)});
    if (url.pathname === '/auth/v1/token') {
      const payload = Buffer.from(JSON.stringify({sub:'11111111-1111-1111-1111-111111111111',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');
      return void json({access_token:`e30.${payload}.sig`, refresh_token:'test-refresh', token_type:'bearer', expires_in:3600, user:{id:'11111111-1111-1111-1111-111111111111',aud:'authenticated',role:'authenticated',email:'staff@example.test'}});
    }
    if (url.pathname === '/rest/v1/rpc/has_cap') {
      if (capability === 'hold') { heldRequest = req; return; }
      return void (capability === 'error' ? json({message:'unavailable'}, 503) : json(capability === 'allow'));
    }
    return void json({});
  });
  await page.goto(base, {waitUntil:'domcontentloaded'});
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {usePagePublishPermission} = await import('/src/lib/owner.ts');
    const {supabase} = await import('/src/integrations/supabase/client.ts');
    window.testSupabase = supabase;
    const host = document.createElement('div'); host.id = 'permission-test'; document.body.appendChild(host);
    function Test() { const state = usePagePublishPermission(); return React.createElement('span', {id:'permission-value'}, JSON.stringify(state)); }
    createRoot(host).render(React.createElement(Test));
  });
  const waitState = async (canPublish, checking) => page.waitForFunction((can, pending) => { const el = document.querySelector('#permission-value'); if (!el) return false; const s = JSON.parse(el.textContent); return s.canPublish === can && s.checking === pending; }, {timeout:15000}, canPublish, checking);
  await waitState(false, false);
  check('no Supabase session fails closed', true);
  await page.evaluate(() => window.testSupabase.auth.signInWithPassword({email:'staff@example.test', password:'test'}));
  await waitState(true, false);
  check('authenticated page.manage result enables publish', true);
  capability = 'deny';
  await page.evaluate(() => window.testSupabase.auth.signInWithPassword({email:'staff@example.test', password:'test'}));
  await waitState(false, false);
  check('denied capability disables publish', true);
  capability = 'error';
  await page.evaluate(() => window.testSupabase.auth.signInWithPassword({email:'staff@example.test', password:'test'}));
  await waitState(false, false);
  check('capability API failure fails closed', true);
  capability = 'hold';
  await page.evaluate(() => window.testSupabase.auth.signInWithPassword({email:'staff@example.test', password:'test'}));
  await waitState(false, true);
  await page.waitForFunction(() => true);
  for (let i = 0; i < 50 && !heldRequest; i++) await new Promise(r => setTimeout(r, 100));
  if (!heldRequest) throw new Error('capability request was not intercepted');
  await page.evaluate(() => window.testSupabase.auth.signOut({scope:'local'}));
  await waitState(false, false);
  await heldRequest.respond({status:200, contentType:'application/json', body:'true'});
  await new Promise(r => setTimeout(r, 300));
  check('sign-out invalidates stale in-flight allow response', await page.$eval('#permission-value', el => {const s=JSON.parse(el.textContent); return !s.canPublish && !s.checking;}));
  console.log(`\n${passed} passed, ${failed} failed (mocked local Supabase)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
