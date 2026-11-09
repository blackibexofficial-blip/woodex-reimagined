/* Mocked local Supabase settings UI regression; start Vite on 4178 with
 * VITE_API_MODE=supabase and VITE_SUPABASE_URL pointing at that same server. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4178';
const browser = await launchBrowser();
let passed = 0, failed = 0;
function check(name, condition) { console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`); condition ? passed++ : failed++; }
try {
  const page = await browser.newPage();
  let owner = false, readError = false, savePayload;
  let stored = {storeName:'Synthetic store',tagline:'Test',phone:'03000000000',whatsapp:'03000000000',email:'test@example.test',address:'Synthetic address',city:'Lahore',currency:'PKR',deliveryNote:'Test',taxRate:5,privateNote:'PRESERVE'};
  const requests = [];
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.origin !== base) return void req.abort();
    if (!url.pathname.startsWith('/auth/v1/') && !url.pathname.startsWith('/rest/v1/')) return void req.continue();
    requests.push(url.pathname);
    const json = (body, status=200) => req.respond({status,contentType:'application/json',body:JSON.stringify(body)});
    if (url.pathname === '/auth/v1/token') {
      const token = Buffer.from(JSON.stringify({sub:'11111111-1111-1111-1111-111111111111',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');
      return void json({access_token:`e30.${token}.sig`,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:{id:'11111111-1111-1111-1111-111111111111',aud:'authenticated',role:'authenticated',email:'staff@example.test'}});
    }
    if (url.pathname === '/auth/v1/user') return void json({id:'11111111-1111-1111-1111-111111111111',aud:'authenticated',role:'authenticated',email:'staff@example.test'});
    if (url.pathname === '/rest/v1/rpc/has_role') return void json(owner);
    if (url.pathname === '/rest/v1/rpc/staff_store_settings') {
      if (readError) return void json({message:'denied'},403);
      const {privateNote, ...projection} = stored;
      return void json(owner ? stored : projection);
    }
    if (url.pathname === '/rest/v1/rpc/owner_save_store_settings') {
      savePayload = JSON.parse(req.postData()).p_settings;
      stored = {...stored, ...savePayload};
      return void json(stored);
    }
    return void json({});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(() => localStorage.setItem('woodex.admin.session',JSON.stringify({email:'staff@example.test',name:'Synthetic',signedInAt:new Date().toISOString()})));
  await page.goto(`${base}/admin/settings`,{waitUntil:'networkidle2'});
  const waitText = text => page.waitForFunction(t => document.body.innerText.includes(t),{timeout:20000},text);
  await page.waitForFunction(() => location.pathname === '/admin/login', {timeout:20000});
  check('spoofed session is redirected rather than showing settings', !requests.includes('/rest/v1/rpc/staff_store_settings'));
  check('settings adapter does not request raw app_settings', !requests.includes('/rest/v1/app_settings'));
  const signIn = () => page.evaluate(async () => { const {supabase} = await import('/src/integrations/supabase/client.ts'); await supabase.auth.signInWithPassword({email:'staff@example.test',password:'test'}); });
  await signIn();
  await page.goto(`${base}/admin/settings`,{waitUntil:'networkidle2'});
  await waitText('Read-only: only the owner can change settings');
  check('authenticated non-owner cannot edit settings', await page.$eval('#s-name', el => el.matches(':disabled')));
  owner = true;
  await signIn();
  await page.waitForFunction(() => { const input = document.querySelector('#s-name'); return !!input && !input.matches(':disabled'); }, {timeout:20000});
  check('owner session enables settings controls', true);
  await page.click('#s-name');
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.type('Updated synthetic');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save').click());
  await waitText('Store settings saved.');
  check(`owner save uses merge RPC and preserves server-only fields (saved name: ${savePayload?.storeName})`, requests.includes('/rest/v1/rpc/owner_save_store_settings') && savePayload?.storeName === 'Updated synthetic' && stored.privateNote === 'PRESERVE');
  await page.evaluate(async () => {const {supabase}=await import('/src/integrations/supabase/client.ts'); await supabase.auth.signOut({scope:'local'});});
  await page.waitForFunction(() => location.pathname === '/admin/login',{timeout:20000});
  check('sign-out closes protected settings', true);
  readError = true;
  await signIn();
  await page.goto(`${base}/admin/settings`,{waitUntil:'networkidle2'});
  await waitText('Could not load store settings. Check your permissions and connection.');
  check('settings read failure is visible rather than endless loading', true);
  console.log(`\n${passed} passed, ${failed} failed (mocked local Supabase)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
