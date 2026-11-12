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
  // Server-side page revisions (M6 CMS-002, migration 00035): demo parity for the
  // stale-save and stale-publish refusals the editor now surfaces.
  const revisionChecks = await page.evaluate(async () => {
    const api = (await import('/src/api/demo/db.ts')).demoAdminApi;
    const pg = await api.createPage({ title: 'Revision page', starter: 'blank' });
    const first = await api.updatePage(pg.id, { title: 'Revision page v2' }, pg.revision ?? 0);
    const conflict = async (fn) => { try { await fn(); return ''; } catch (e) { return e instanceof Error ? e.message : String(e); } };
    const staleSave = await conflict(() => api.updatePage(pg.id, { title: 'Stale page' }, pg.revision ?? 0));
    const stalePublish = await conflict(() => api.publishPage(pg.id, pg.revision ?? 0));
    const fresh = await api.getPage(pg.id);
    return { firstRevision: first?.revision, staleSave, stalePublish, titleNow: fresh?.title };
  });
  check('a page save bumps the revision', revisionChecks.firstRevision === 1);
  check('a stale page save is refused instead of overwriting', /changed elsewhere/i.test(revisionChecks.staleSave));
  check('a stale publish is refused', /changed elsewhere/i.test(revisionChecks.stalePublish));
  check('the refused writes left the newer title in place', revisionChecks.titleNow === 'Revision page v2');
  // Block persistence contract (M6 BLD-003) in the demo adapter: identity must
  // survive the round trip, and no two blocks may claim the same one.
  const blockIds = await page.evaluate(async id => {
    const api = (await import('/src/api/demo/db.ts')).demoAdminApi;
    const current = await api.getPage(id);
    const content = [
      { type: 'Heading', props: { id: 'e2e-hero', title: 'Identity survives' } },
      { type: 'Paragraph', props: { id: 'e2e-body', text: 'Second block' } },
    ];
    await api.updatePage(id, { doc: { ...current.doc, content } });
    const first = (await api.getPage(id)).doc.content.map(b => b?.props?.id);
    const second = (await api.getPage(id)).doc.content.map(b => b?.props?.id);
    return { first, second };
  }, item.id);
  check('blocks saved through the adapter keep their identity', blockIds.first.join(',') === 'e2e-hero,e2e-body');
  check('block identities are unique and stable across reloads',
    new Set(blockIds.first).size === blockIds.first.length && blockIds.first.join(',') === blockIds.second.join(','));

  // Publish pipeline in the browser (M6 CMS-001): /lab/:slug badges the real state,
  // and unpublishing hides the page from the public route without losing the draft.
  const labSlug = 'safety-test-page';
  const badge = () => page.evaluate(() => document.body.innerText);
  await page.goto(`${base}/lab/${labSlug}`, {waitUntil:'networkidle2', timeout:60000});
  await page.waitForFunction(() => document.body.innerText.includes('PUBLISHED') || document.body.innerText.includes('DRAFT'), {timeout:20000}).catch(()=>{});
  check('the lab route shows the published page with the PUBLISHED badge', (await badge()).includes('PUBLISHED — from the Pages workspace'));
  const flip = async (action) => page.evaluate(async ({slug, action}) => {
    const api = (await import('/src/api/demo/db.ts')).demoAdminApi;
    const pg = await api.getPage(slug);
    if (action === 'unpublish') await api.unpublishPage(pg.id);
    else await api.publishPage(pg.id);
    return pg.title;
  }, {slug: labSlug, action});
  const draftTitle = await flip('unpublish');
  await page.reload({waitUntil:'networkidle2'});
  await page.waitForFunction(() => document.body.innerText.includes('DRAFT'), {timeout:20000}).catch(()=>{});
  const offBody = await badge();
  check('unpublishing flips the badge to DRAFT and keeps the draft readable', offBody.includes('DRAFT — not published') && !offBody.includes('Page not found') && Boolean(draftTitle));
  await flip('publish');
  await page.reload({waitUntil:'networkidle2'});
  await page.waitForFunction(() => document.body.innerText.includes('PUBLISHED'), {timeout:20000}).catch(()=>{});
  check('republishing restores the PUBLISHED badge', (await badge()).includes('PUBLISHED — from the Pages workspace'));
  check('no uncaught browser errors',errors.length===0); if(errors.length) console.error(errors);
  console.log(`Page editor safety: ${passed} passed, ${failed} failed (demo, synthetic fixtures)`); if(failed)process.exitCode=1;
} catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}
