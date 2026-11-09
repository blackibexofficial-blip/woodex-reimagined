/* Local browser-only SEO workflow regression. Run against a demo Vite server. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:8080';
const browser = await launchBrowser();
let passed = 0, failed = 0;
function check(name, ok) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; }
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => new URL(req.url()).origin === base ? req.continue() : req.abort());
  await page.goto(base, {waitUntil:'domcontentloaded'});
  const ids = await page.evaluate(async () => {
    const {demoAdminApi: api} = await import('/src/api/demo/db.ts');
    localStorage.setItem('woodex.admin.session', JSON.stringify({email:'seo@example.test',name:'Test',signedInAt:new Date().toISOString()}));
    const make = async (title, seo, doc) => {
      const p = await api.createPage({title, starter:'blank'});
      await api.updatePage(p.id, {seo, doc});
      return {id:p.id, slug:p.slug};
    };
    const blank = {root:{props:{}},content:[]};
    const validDoc = {root:{props:{}},content:[{type:'HeroCentered',props:{id:'hero-test',title:'Good heading'}}]};
    const valid = {title:'Useful furniture page title',description:'Furniture description',focusKeyphrase:'furniture'};
    return {
      strict:await make('Gate strict case', {}, blank),
      soft:await make('Gate override case', {strictGate:false}, blank),
      valid:await make('Gate valid case', valid, validDoc),
      stale:await make('Gate stale case', valid, validDoc),
      noindex:await make('Gate noindex case', {...valid,noindex:true}, validDoc),
      editor:await make('Gate editor case', {}, blank),
      changed:await make('Gate changed case', valid, validDoc),
    };
  });
  const rowSwitch = async title => {
    const handle = await page.evaluateHandle(title => {
      const row = [...document.querySelectorAll('tr')].find(r => r.textContent.includes(title));
      return row?.querySelector('button[role="switch"]');
    }, title);
    const el = handle.asElement(); if (!el) throw new Error(`Missing switch: ${title}`); return el;
  };
  const status = id => page.evaluate(async id => (await (await import('/src/api/demo/db.ts')).demoAdminApi.getPage(id))?.status, id);
  const click = async title => { const el = await rowSwitch(title); await el.click(); await el.dispose(); };
  const waitToast = text => page.waitForFunction(text => document.body.textContent.includes(text), {timeout:12000}, text);
  const waitStatus = (id, expected) => page.waitForFunction(async (id, expected) => (await (await import('/src/api/demo/db.ts')).demoAdminApi.getPage(id))?.status === expected, {timeout:12000}, id, expected);
  await page.goto(`${base}/admin/pages`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.body.textContent.includes('Gate strict case'), {timeout:20000});
  await click('Gate strict case'); await waitToast('SEO gate blocks publish');
  check('strict invalid draft is blocked from list publishing', await status(ids.strict.id) === 'draft');
  await page.evaluate(async id => { const api=(await import('/src/api/demo/db.ts')).demoAdminApi; await api.updatePage(id,{seo:{title:'',description:'',focusKeyphrase:''}}); }, ids.stale.id);
  await click('Gate stale case');
  await page.waitForFunction(() => ![...document.querySelectorAll('tr')].find(r=>r.textContent.includes('Gate stale case'))?.querySelector('[role="switch"]')?.disabled,{timeout:12000});
  check('list reloads saved content before checking instead of trusting stale row', await status(ids.stale.id) === 'draft');
  await click('Gate noindex case');
  await page.waitForFunction(() => document.body.textContent.includes('noindex is ON'), {timeout:12000});
  check('strict noindex draft is blocked', await status(ids.noindex.id) === 'draft');
  let accept = false, confirmations = 0;
  page.on('dialog', async dialog => { confirmations++; accept ? await dialog.accept() : await dialog.dismiss(); });
  await click('Gate override case');
  await page.waitForFunction(() => ![...document.querySelectorAll('tr')].find(r=>r.textContent.includes('Gate override case'))?.querySelector('[role="switch"]')?.disabled,{timeout:12000});
  check('non-strict invalid draft requires confirmation and cancellation preserves draft', confirmations === 1 && await status(ids.soft.id) === 'draft');
  accept = true;
  await click('Gate override case'); await waitStatus(ids.soft.id,'published');
  check('confirmed non-strict override publishes', confirmations === 2 && await status(ids.soft.id) === 'published');
  await page.waitForFunction(() => [...document.querySelectorAll('tr')].find(r=>r.textContent.includes('Gate override case'))?.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true',{timeout:12000});
  await click('Gate override case'); await waitStatus(ids.soft.id,'draft');
  check('unpublish remains available without SEO confirmation', confirmations === 2 && await status(ids.soft.id) === 'draft');
  await page.waitForFunction(() => [...document.querySelectorAll('tr')].find(r=>r.textContent.includes('Gate valid case'))?.querySelector('[role="switch"]')?.disabled === false,{timeout:12000});
  await click('Gate valid case'); await waitStatus(ids.valid.id,'published');
  check('SEO-ready draft publishes without confirmation', confirmations === 2 && await status(ids.valid.id) === 'published');
  await page.waitForFunction(() => [...document.querySelectorAll('tr')].find(r=>r.textContent.includes('Gate changed case'))?.querySelector('[role="switch"]')?.disabled === false,{timeout:12000});
  await page.evaluate(async id => { const api=(await import('/src/api/demo/db.ts')).demoAdminApi; await api.publishPage(id); }, ids.changed.id);
  await click('Gate changed case'); await waitToast('Page status changed or the page is unavailable');
  check('stale status does not accidentally unpublish an externally published page', await status(ids.changed.id) === 'published');
  await page.waitForFunction(() => [...document.querySelectorAll('tr')].find(r=>r.textContent.includes('Gate changed case'))?.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true',{timeout:12000});
  await page.goto(`${base}/admin/pages/${ids.editor.slug}`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('button[title="Publish this page"]',{timeout:30000});
  await page.click('button[title="Publish this page"]'); await waitToast('SEO gate blocks publish');
  check('editor still blocks the same strict invalid draft', await status(ids.editor.id) === 'draft');
  check('no uncaught browser errors', errors.length === 0);
  if (errors.length) console.error(errors);
  console.log(`\n${passed} passed, ${failed} failed (local demo browser; external requests blocked)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
