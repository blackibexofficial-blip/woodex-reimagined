/* Requires local Vite: 4182 static, 4183 bagisto, 4184 unconfigured Supabase. */
import { launchBrowser } from './lib.mjs';
const browser = await launchBrowser();
let failures = 0;
try {
  for (const [port, mode] of [[4182,'static'],[4183,'bagisto'],[4184,'supabase']]) {
    const page = await browser.newPage();
    const unexpected = [];
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.origin !== `http://127.0.0.1:${port}` || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) {
        unexpected.push(req.url()); return void req.abort();
      }
      void req.continue();
    });
    await page.goto(`http://127.0.0.1:${port}/robots.txt`, {waitUntil:'domcontentloaded'});
    const result = await page.evaluate(async () => {
      const {config} = await import('/src/config/env.ts');
      const {getStorefrontPageSnapshot} = await import('/src/api/storefront-pages.ts');
      try { await getStorefrontPageSnapshot('home'); return {mode:config.apiMode, enabled:config.supabase.enabled, error:null}; }
      catch(e) { return {mode:config.apiMode, enabled:config.supabase.enabled, error:e.code}; }
    });
    const ok = result.mode === mode && result.error === 'unavailable' && (mode !== 'supabase' || !result.enabled) && unexpected.length === 0;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${mode}: unavailable without falling back to demo or contacting a backend`);
    if (!ok) failures++;
    await page.close();
  }
  console.log(`\nCMS unsupported/unconfigured modes: ${3-failures}/3 passed (local browser)`);
  if (failures) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
