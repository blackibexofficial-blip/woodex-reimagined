/* Mocked local PostgREST/Auth; start Vite in Supabase mode on :4181, with
 * VITE_SUPABASE_URL=http://127.0.0.1:4181 and a nonsecret mock key. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4181';
const browser = await launchBrowser();
let passed = 0, failed = 0, scenario = 'valid';
const requests = [];
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.origin !== base || (!url.pathname.startsWith('/auth/v1/') && !url.pathname.startsWith('/rest/v1/'))) return void req.continue();
    requests.push({path:url.pathname,method:req.method(),body:req.postData(),authorization:req.headers().authorization});
    const json = (data, status = 200) => req.respond({status, contentType:'application/json', body:JSON.stringify(data)});
    if (url.pathname === '/auth/v1/token') {
      const payload = Buffer.from(JSON.stringify({sub:'11111111-1111-1111-1111-111111111111',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');
      return void json({access_token:`e30.${payload}.sig`, refresh_token:'test-refresh', token_type:'bearer', expires_in:3600, user:{id:'11111111-1111-1111-1111-111111111111',aud:'authenticated',role:'authenticated',email:'editor@example.test'}});
    }
    if (url.pathname !== '/rest/v1/rpc/storefront_page_snapshot') return void json({message:'unexpected admin/table access'}, 403);
    if (scenario === 'error') return void json({message:'unavailable'}, 503);
    if (scenario === 'missing') return void json(null);
    if (scenario === 'invalid') return void json({id:1,slug:'safe',title:'Bad',theme:{},blocks:{}});
    if (scenario === 'wrong-slug') return void json({id:1,slug:'draft-slug',title:'Draft',theme:{},blocks:[]});
    if (scenario === 'unsupported') return void json({id:1,slug:'safe',title:'Unsupported',theme:{},seo:{},blocks:[{type:'Image',props:{id:'x'}}]});
    const seo = scenario === 'invalid-noindex' ? {noindex:'yes'} : {title:'Published SEO',description:'Public description',noindex:true,strictGate:true};
    return void json({id:12,slug:'safe',title:'Published title',published_at:'2026-01-01T00:00:00Z',theme:{},blocks:[{type:'Heading',props:{id:'x',title:'Published content'},internal:'secret'}],seo,secret:'never map'});
  });
  await page.goto(`${base}/robots.txt`, {waitUntil:'domcontentloaded'});
  await page.evaluate(async () => {
    window.reader = await import('/src/api/storefront-pages.ts');
    window.supabase = (await import('/src/integrations/supabase/client.ts')).supabase;
    window.source = await import('/src/pages-builder/storefront-source.ts');
    window.renderable = async () => { try { return {value:await window.source.getRenderableStorefrontPage('safe')}; } catch(e) { return {error:e.code ?? e.name}; } };
    window.read = async (slug='safe') => {
      try { return {value:await window.reader.getStorefrontPageSnapshot(slug)}; }
      catch(e) { return {error:e.code, message:e.message}; }
    };
  });
  let result = await page.evaluate(() => window.read());
  check('anonymous reader maps published snapshot', result.value?.title === 'Published title' && result.value?.doc.content[0].props.title === 'Published content');
  check('projection omits extra top-level, block wrapper and SEO fields', !JSON.stringify(result.value).includes('secret') && !('strictGate' in result.value.seo));
  check('reader requests only the published RPC and published slug', requests.filter(r => r.path.startsWith('/rest/v1/')).every(r => r.path === '/rest/v1/rpc/storefront_page_snapshot' && r.method === 'POST' && JSON.parse(r.body).p_slug === 'safe'));
  check('anonymous request uses no authenticated editor token', !requests.at(-1).authorization?.includes('e30.'));
  await page.evaluate(() => window.supabase.auth.signInWithPassword({email:'editor@example.test',password:'test'}));
  result = await page.evaluate(() => window.read());
  check('authenticated editor also reads only public snapshot', result.value?.title === 'Published title' && requests.at(-1).path === '/rest/v1/rpc/storefront_page_snapshot' && requests.at(-1).authorization.includes('e30.'));
  result = await page.evaluate(() => window.renderable());
  check('renderable source accepts supported published content', result.value?.doc.content[0].props.title === 'Published content');
  scenario = 'unsupported';
  result = await page.evaluate(() => window.renderable());
  check('renderable source rejects unsupported published content', result.error === 'UnsupportedStorefrontDocumentError');
  scenario = 'missing';
  check('renderable source preserves missing result', (await page.evaluate(() => window.renderable())).value === undefined);
  result = await page.evaluate(() => window.read());
  check('missing or ambiguous snapshot returns absent without draft fallback', !result.error && result.value === undefined);
  scenario = 'error';
  check('renderable source preserves backend unavailable error', (await page.evaluate(() => window.renderable())).error === 'unavailable');
  result = await page.evaluate(() => window.read());
  check('backend errors are unavailable, not missing or draft fallback', result.error === 'unavailable' && result.value === undefined);
  scenario = 'invalid';
  result = await page.evaluate(() => window.read());
  check('malformed response is rejected without substituting an empty document', result.error === 'invalid');
  scenario = 'wrong-slug';
  result = await page.evaluate(() => window.read());
  check('mismatched response slug is rejected', result.error === 'invalid');
  scenario = 'invalid-noindex';
  result = await page.evaluate(() => window.read());
  check('malformed noindex remains non-indexable', result.value?.seo.noindex === true);
  check('no raw page or draft table request was made', requests.every(r => !/^\/rest\/v1\/(pages|page_blocks|page_versions)(\?|$)/.test(r.path)));
  console.log(`\nCMS Supabase reader: ${passed}/${passed + failed} passed (mocked local PostgREST/Auth)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
