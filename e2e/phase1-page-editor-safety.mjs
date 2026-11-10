/* Synthetic demo-only editor regression. Requires a local Vite server in demo mode. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:8080';
const browser = await launchBrowser(); let passed = 0, failed = 0;
const check = (label, value) => { console.log(`${value ? 'PASS' : 'FAIL'}  ${label}`); value ? passed++ : failed++; };
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', r => new URL(r.url()).origin === new URL(base).origin ? r.continue() : r.abort());
  await page.goto(base, {waitUntil:'domcontentloaded'});
  const item = await page.evaluate(async () => {
    localStorage.clear();
    localStorage.setItem('woodex.admin.session', JSON.stringify({email:'editor@example.test',name:'Editor',signedInAt:new Date().toISOString()}));
    const api = (await import('/src/api/demo/db.ts')).demoAdminApi;
    const item = await api.createPage({title:'Safety test page', starter:'blank'});
    await api.updatePage(item.id,{seo:{strictGate:false}});
    await api.publishPage(item.id); await api.unpublishPage(item.id);
    return item;
  });
  await page.goto(`${base}/admin/pages`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => [...document.querySelectorAll('a')].some(a => a.textContent === 'Safety test page'), {timeout:30000});
  await page.evaluate(async () => {
    const api = (await import('/src/api/demo/db.ts')).demoAdminApi;
    window.testHold = ''; window.testStarted = '';
    for (const key of ['updatePage', 'publishPage', 'revertPage']) {
      const original = api[key].bind(api);
      api[key] = async (...args) => {
        if (window.testHold === key) { window.testStarted = key; await new Promise(resolve => { window.testRelease = resolve; }); window.testHold = ''; }
        return original(...args);
      };
    }
  });
  await page.evaluate(() => [...document.querySelectorAll('a')].find(a => a.textContent === 'Safety test page').click());
  await page.waitForSelector('input[aria-label="Page title"]', {timeout:30000});
  const changeTitle = async value => { await page.click('input[aria-label="Page title"]'); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.type('input[aria-label="Page title"]',value); };
  const button = async text => { const b=await page.evaluateHandle(text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text),text); const el=b.asElement(); if(!el)throw Error(`Missing button: ${text}`); await el.click(); await b.dispose(); };
  const stored = () => page.evaluate(async id => (await (await import('/src/api/demo/db.ts')).demoAdminApi.getPage(id)),item.id);
  await changeTitle('First save');
  await page.evaluate(()=>{window.testHold='updatePage';window.testStarted=''});
  await button('Save draft'); await page.waitForFunction(()=>window.testStarted==='updatePage',{timeout:5000});
  check('publish is disabled during an outstanding save', await page.$eval('button[title="Publish this page"]', b=>b.disabled));
  await changeTitle('Later edit');
  await page.evaluate(()=>window.testRelease());
  await page.waitForFunction(()=>!window.testHold);
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Save draft' && !b.querySelector('.animate-spin')));
  check('saving an older revision retains newer unsaved edits', await page.evaluate(()=>document.body.textContent.includes('unsaved changes') && document.querySelector('input[aria-label="Page title"]').value==='Later edit'));
  check('delayed save persists its original snapshot, not the later edit', (await stored()).title === 'First save');
  const beforeUnload = await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});
  check('unsaved edits register a browser unload warning', beforeUnload);
  let confirms=0, accept=false; page.on('dialog', async d=>{confirms++; if(accept) await d.accept(); else await d.dismiss();});
  await page.click('a[aria-label="Back to Pages"]');
  check('canceling Back preserves the unsaved editor', confirms>0 && await page.$('input[aria-label="Page title"]')!==null);
  // Sidebar navigation used to throw the draft away silently (M5 PROD-007).
  const editorPath = page.url();
  const sidebarConfirms = confirms;
  await page.evaluate(() => document.querySelector('a[href$="/admin/orders"]')?.click());
  await new Promise(r => setTimeout(r, 400));
  check('a sidebar link asks before discarding unsaved edits', confirms === sidebarConfirms + 1 && page.url() === editorPath);
  check('dismissing the sidebar prompt keeps the editor open', await page.$('input[aria-label="Page title"]') !== null);
  await page.click('button[title="Version history"]');
  const priorConfirms = confirms;
  await button('Restore as draft');
  check('canceling restore preserves unsaved changes and saved draft', confirms === priorConfirms + 1 && (await stored()).title === 'First save' && await page.$eval('input[aria-label="Page title"]', el=>el.value) === 'Later edit');
  accept = true;
  await page.evaluate(()=>{window.testHold='revertPage';window.testStarted=''});
  await button('Restore as draft'); await page.waitForFunction(()=>window.testStarted==='revertPage');
  await changeTitle('Edited during restore'); await page.evaluate(()=>window.testRelease());
  await page.waitForFunction(()=>!window.testHold);
  await page.waitForFunction(()=>document.body.textContent.includes('newer editor changes are still unsaved'));
  check('edits during restore remain in the editor and are marked unsaved', await page.$eval('input[aria-label="Page title"]', el=>el.value)==='Edited during restore' && await page.evaluate(()=>document.body.textContent.includes('unsaved changes')));
  check('restore did update the saved draft without overwriting new editor content', (await stored()).title === 'Safety test page');
  await button('Save draft'); await page.waitForFunction(()=>!document.body.textContent.includes('unsaved changes'));
  check('subsequent save persists the newest editor changes', (await stored()).title === 'Edited during restore');
  await changeTitle('Publish snapshot');
  await page.evaluate(()=>{window.testHold='updatePage';window.testStarted=''});
  await page.click('button[title="Publish this page"]'); await page.waitForFunction(()=>window.testStarted==='updatePage');
  await changeTitle('Change during publish save'); await page.evaluate(()=>window.testRelease());
  await page.waitForFunction(()=>!window.testHold);
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.title==='Publish this page' && !b.disabled));
  check('publish is aborted when edits overtake its save', (await stored()).status === 'draft' && (await stored()).title === 'Publish snapshot' && await page.evaluate(()=>document.body.textContent.includes('unsaved changes')));
  await button('Save draft'); await page.waitForFunction(()=>!document.body.textContent.includes('unsaved changes'));
  await page.evaluate(()=>{window.testHold='publishPage';window.testStarted=''});
  await page.click('button[title="Publish this page"]'); await page.waitForFunction(()=>window.testStarted==='publishPage');
  await changeTitle('Edited while publishing'); await page.evaluate(()=>window.testRelease());
  await page.waitForFunction(()=>!window.testHold);
  await page.waitForFunction(()=>document.body.textContent.includes('newer editor changes remain unsaved'));
  check('edits made during publish remain unsaved, not silently cleared', (await stored()).status === 'published' && (await stored()).title === 'Change during publish save' && await page.$eval('input[aria-label="Page title"]', el=>el.value)==='Edited while publishing' && await page.evaluate(()=>document.body.textContent.includes('unsaved changes')));
  check('no uncaught browser errors',errors.length===0); if(errors.length) console.error(errors);
  console.log(`Page editor safety: ${passed} passed, ${failed} failed (demo, synthetic fixtures)`); if(failed)process.exitCode=1;
} catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
