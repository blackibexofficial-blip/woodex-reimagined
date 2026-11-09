/* Mocked local Auth/PostgREST. Start Vite :4188 with staging flag and local mock URL. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4188';
const browser = await launchBrowser();
let passed = 0, failed = 0;
const seen = [], waits = new Map();
const hold = slug => new Promise(resolve => waits.set(slug,resolve));
const payload = (slug, content = `Published ${slug}`) => ({id:1,slug,title:`Title ${slug}`,published_at:'2026-01-01T00:00:00Z',theme:{},seo:{title:`SEO ${slug}`,noindex:false},blocks:[{type:'Heading',props:{id:`heading-${slug}`,title:content,level:'h1'}}]});
const response = (req,data,status=200) => req.respond({status,contentType:'application/json',body:JSON.stringify(data)});
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.origin !== base) return void req.abort();
    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname === '/auth/v1/token') {
        const data=Buffer.from(JSON.stringify({sub:'11111111-1111-1111-1111-111111111111',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');
        return void response(req,{access_token:`e30.${data}.sig`,refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,user:{id:'11111111-1111-1111-1111-111111111111',aud:'authenticated',role:'authenticated',email:'editor@example.test'}});
      }
      return void response(req,{});
    }
    if (!url.pathname.startsWith('/rest/v1/')) return void req.continue();
    seen.push({path:url.pathname,body:req.postData(),authorization:req.headers().authorization});
    if (url.pathname !== '/rest/v1/rpc/storefront_page_snapshot') return void response(req,[]);
    const {p_slug: slug} = JSON.parse(req.postData());
    if (waits.has(slug)) { const resolve=waits.get(slug); waits.delete(slug); resolve(req); return; }
    if (slug === 'missing') return void response(req,null);
    if (slug === 'offline') return void response(req,{message:'database unavailable'},503);
    if (slug === 'bad') return void response(req,{id:2,slug:'bad',title:'Bad',theme:{},seo:{},blocks:[{type:'Image',props:{id:'x',src:'https://invalid.test/x'}}]});
    if (slug === 'corrupt') return void response(req,{id:2,slug:'corrupt',title:'Corrupt',theme:{},seo:{},blocks:{}});
    return void response(req,payload(slug));
  });
  await page.goto(`${base}/p/alpha`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('Published alpha'),{timeout:20000});
  check('anonymous route reads published RPC', await page.evaluate(()=>document.querySelector('main')?.textContent.includes('Published alpha')));
  check('staging route forces noindex even if snapshot allows indexing', await page.evaluate(()=>document.querySelector('meta[name="robots"]')?.content === 'noindex,nofollow'));
  const pendingB = hold('slow-b');
  await page.evaluate(()=>{history.pushState({},'', '/p/slow-b'); window.dispatchEvent(new PopStateEvent('popstate'));});
  const requestB = await pendingB;
  await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('Loading published page'),{timeout:10000});
  check('old content disappears immediately while a new slug loads', await page.evaluate(()=>!document.querySelector('main')?.textContent.includes('Published alpha')));
  await response(requestB,payload('slow-b'));
  await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('Published slow-b'),{timeout:10000});
  check('new slug renders after its own response', true);
  const pendingA = hold('slow-a');
  await page.evaluate(()=>{history.pushState({},'', '/p/slow-a'); window.dispatchEvent(new PopStateEvent('popstate'));});
  const requestA = await pendingA;
  await page.evaluate(()=>{history.pushState({},'', '/p/beta'); window.dispatchEvent(new PopStateEvent('popstate'));});
  await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('Published beta'),{timeout:10000});
  await response(requestA,payload('slow-a','STALE RESPONSE'));
  await new Promise(resolve=>setTimeout(resolve,200));
  check('late response for previous slug cannot overwrite current page', await page.evaluate(()=>document.querySelector('main')?.textContent.includes('Published beta') && !document.querySelector('main')?.textContent.includes('STALE RESPONSE')));
  const nav = async (slug, text) => {
    await page.evaluate(slug=>{history.pushState({},'', `/p/${slug}`); window.dispatchEvent(new PopStateEvent('popstate'));},slug);
    await page.waitForFunction(text=>document.querySelector('main')?.textContent.includes(text),{timeout:10000},text);
  };
  await nav('missing','Page not found');
  check('missing RPC result gets missing state', true);
  await nav('offline','service is temporarily unavailable');
  check('backend failure is not presented as a 404', await page.evaluate(()=>!document.querySelector('main')?.textContent.includes('Page not found')));
  await nav('bad','not supported in the staging preview');
  check('unsupported content is rejected without rendering its image', await page.evaluate(()=>!document.querySelector('main img')));
  await nav('corrupt','service is temporarily unavailable');
  check('malformed RPC payload is rejected without draft fallback', true);
  await page.evaluate(async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts'); await supabase.auth.signInWithPassword({email:'editor@example.test',password:'test'});});
  await nav('editor-test','Published editor-test');
  check('authenticated editor still renders only the public RPC result', seen.some(r=>r.path==='/rest/v1/rpc/storefront_page_snapshot' && JSON.parse(r.body).p_slug==='editor-test' && r.authorization?.includes('e30.')));
  check('route never queried draft page, block or history tables', seen.every(r=>!/^\/rest\/v1\/(pages|page_blocks|page_versions)$/.test(r.path)));
  console.log(`\nCMS mocked Supabase route: ${passed}/${passed + failed} passed`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
