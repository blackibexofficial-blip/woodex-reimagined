/* Mocked Supabase UI-auth regression. Never point this test at a real project.
 * Start Vite in supabase mode on 4180 with URL http://127.0.0.1:4180 and a fake
 * key; start a second supabase-mode Vite on 4181 with empty URL/key. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4180';
const emptyBase = process.env.WOODEX_EMPTY_BASE ?? 'http://127.0.0.1:4181';
const browser = await launchBrowser();
let passed=0, failed=0;
function check(name, ok) { console.log(`${ok?'PASS':'FAIL'}  ${name}`); ok?passed++:failed++; }
try {
  const page=await browser.newPage(); const errors=[]; const outside=[];
  page.on('pageerror', e=>errors.push(e.message));
  let userMode='allow', logoutOffline=false, held; const requests=[];
  const user={id:'11111111-1111-1111-1111-111111111111',aud:'authenticated',role:'authenticated',email:'staff@example.test',user_metadata:{full_name:'Synthetic Staff'}};
  await page.setRequestInterception(true);
  page.on('request', req=>{
    const url=new URL(req.url());
    if (url.origin!==base) {outside.push(url.origin);return void req.abort();}
    const json=(body,status=200)=>req.respond({status,contentType:'application/json',body:JSON.stringify(body)});
    if (url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/rest/v1/')) requests.push(url.pathname);
    if (url.pathname==='/auth/v1/token') {
      const payload=JSON.parse(req.postData() || '{}');
      if(url.searchParams.get('grant_type')!=='refresh_token' && (payload.email!=='staff@example.test' || payload.password!=='synthetic-pass')) return void json({error:'invalid_grant',error_description:'Invalid login credentials'},400);
      const token=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');
      return void json({access_token:`e30.${token}.sig`,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user});
    }
    if (url.pathname==='/auth/v1/user') {
      if(userMode==='hold') {held=req;return;}
      return void (userMode==='deny' ? json({message:'invalid token'},401):json(user));
    }
    if (url.pathname==='/auth/v1/logout') return void (logoutOffline ? json({message:'offline'},503) : json({}));
    if (url.pathname.startsWith('/rest/v1/rpc/')) return void json(false);
    if (url.pathname.startsWith('/rest/v1/')) return void json([]);
    return void req.continue();
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>localStorage.setItem('woodex.admin.session',JSON.stringify({email:'forged@example.test',name:'Forged',signedInAt:'2026-01-01'})));
  requests.length=0;
  await page.goto(`${base}/admin/dashboard`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>location.pathname==='/admin/login',{timeout:20000});
  check('forged legacy localStorage identity cannot open Supabase admin', await page.evaluate(()=>!localStorage.getItem('woodex.admin.session')));
  check('Supabase mode has no demo login tab or demo credential hint', await page.evaluate(()=>![...document.querySelectorAll('[role="tab"]')].some(el=>el.textContent.includes('Demo gate')) && !document.body.textContent.includes('Demo credentials')));
  check('protected order data is not requested before verified session', !requests.some(x=>x==='/rest/v1/orders'));
  await page.goto(`${base}/admin/order/synthetic-order`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>location.pathname==='/admin/login',{timeout:15000});
  check('unauthenticated print deep link is protected', !requests.some(x=>x==='/rest/v1/orders'));
  await page.type('#admin-email','demo@woodex.test'); await page.type('#admin-password','WoodexDemo123!'); await page.click('button[type=submit]');
  await page.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('Invalid'),{timeout:12000});
  check('demo credentials cannot sign in to Supabase mode', await page.evaluate(()=>location.pathname==='/admin/login'));
  await page.click('#admin-email'); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.type('#admin-email','staff@example.test');
  await page.click('#admin-password'); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.type('#admin-password','synthetic-pass');
  await page.click('button[type=submit]');
  await page.waitForFunction(()=>location.pathname==='/admin/order/synthetic-order' && !document.body.textContent.includes('Checking admin session'),{timeout:20000});
  check('valid mock Auth response and verified user restore print deep link', requests.includes('/auth/v1/user'));
  await page.goto(`${base}/admin/dashboard`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('nav[aria-label="Admin navigation"]',{timeout:20000});
  check('valid verified session opens admin after navigation', await page.evaluate(()=>location.pathname==='/admin/dashboard'));
  const beforeReload = requests.filter(x=>x==='/auth/v1/user').length;
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('nav[aria-label="Admin navigation"]',{timeout:20000});
  check('stored Supabase session is reverified after reload', requests.filter(x=>x==='/auth/v1/user').length>beforeReload);
  await page.evaluate(()=>{const marker=document.createElement('span');marker.id='refresh-mount-marker';document.querySelector('nav[aria-label="Admin navigation"]').appendChild(marker);});
  userMode='hold'; held=undefined;
  await page.evaluate(async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts');await supabase.auth.refreshSession();});
  for(let i=0;i<100 && !held;i++) await new Promise(r=>setTimeout(r,50));
  if(!held) throw Error('Token refresh verification was not requested');
  check('same-user token refresh keeps the mounted admin UI while checking',!!(await page.$('#refresh-mount-marker')));
  await held.respond({status:200,contentType:'application/json',body:JSON.stringify(user)}); userMode='allow';
  await page.waitForSelector('nav[aria-label="Admin navigation"]',{timeout:15000});
  logoutOffline=true;
  await page.evaluate(()=>[...document.querySelectorAll('button[aria-label="Sign out"]')].find(el=>el.offsetParent !== null).click());
  await page.waitForFunction(()=>location.pathname==='/admin/login',{timeout:15000});
  await page.goto(`${base}/admin/dashboard`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>location.pathname==='/admin/login',{timeout:15000});
  check('UI logout clears local session even if server revocation fails', true);
  logoutOffline=false;
  await page.evaluate(async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts'); await supabase.auth.signInWithPassword({email:'staff@example.test',password:'synthetic-pass'});});
  await page.goto(`${base}/admin/dashboard`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('nav[aria-label="Admin navigation"]',{timeout:20000});
  userMode='deny'; await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>location.pathname==='/admin/login',{timeout:20000});
  check('rejected server verification fails closed despite stored token', true);
  userMode='hold'; held=undefined;
  await page.evaluate(async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts'); await supabase.auth.signInWithPassword({email:'staff@example.test',password:'synthetic-pass'});});
  for(let i=0;i<100 && !held;i++) await new Promise(r=>setTimeout(r,50));
  if(!held) throw Error('Held verification was not requested');
  await page.evaluate(async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts'); await supabase.auth.signOut({scope:'local'});});
  await held.respond({status:200,contentType:'application/json',body:JSON.stringify(user)});
  await new Promise(r=>setTimeout(r,300));
  await page.goto(`${base}/admin/dashboard`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>location.pathname==='/admin/login',{timeout:15000});
  check('sign-out invalidates a late successful verification', true);
  check('no uncaught browser errors',errors.length===0);
  if(errors.length) console.error(errors);

  const empty=await browser.newPage(); let invalidNetwork=false,emptyErrors=[];
  empty.on('pageerror', e=>emptyErrors.push(e.message));
  await empty.setRequestInterception(true);
  empty.on('request',req=>{const u=new URL(req.url());if(u.origin===emptyBase)return void req.continue();if(u.hostname==='unconfigured.invalid')invalidNetwork=true;return void req.abort();});
  await empty.goto(`${emptyBase}/admin/dashboard`,{waitUntil:'domcontentloaded'});
  await empty.waitForFunction(()=>location.pathname==='/admin/login',{timeout:20000});
  await empty.waitForFunction(()=>document.body.textContent.includes('Supabase keys are not set'),{timeout:12000});
  check('missing configuration renders login and never offers demo bypass',await empty.evaluate(()=>![...document.querySelectorAll('[role="tab"]')].some(el=>el.textContent.includes('Demo gate')) && !![...document.querySelectorAll('button')].find(el=>el.textContent.includes('Sign in with Supabase'))));
  await empty.type('#admin-email','staff@example.test');await empty.type('#admin-password','synthetic-pass');await empty.click('button[type=submit]');
  await empty.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('not configured'),{timeout:12000});
  check('missing configuration fails closed without backend request',!invalidNetwork && emptyErrors.length===0);
  if(emptyErrors.length)console.error(emptyErrors);
  console.log(`\n${passed} passed, ${failed} failed (mocked local Supabase; external requests blocked)`);
  if(failed)process.exitCode=1;
} catch(error){console.error(error);process.exitCode=1;}
finally{await browser.close();}
