/* Published snapshot reader exercise against local demo mode. Start Vite on 4180. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4180';
const browser = await launchBrowser();
let passed = 0, failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
try {
  const page = await browser.newPage();
  await page.goto(`${base}/robots.txt`, {waitUntil:'domcontentloaded'});
  await page.evaluate(async () => {
    localStorage.clear();
    window.api = (await import('/src/api/demo/db.ts')).demoAdminApi;
    window.reader = (await import('/src/api/storefront-pages.ts'));
    window.doc = text => ({root:{props:{themeMark:`theme ${text}`}}, content:[{type:'Heading',props:{id:'heading',title:text}}]});
  });
  check('legacy seed without a complete snapshot is not inferred from editable page', await page.evaluate(async () => (await window.reader.getStorefrontPageSnapshot('home')) === undefined));
  const created = await page.evaluate(async () => {
    const p = await window.api.createPage({title:'Public A', slug:'first', starter:'blank'});
    window.firstId = p.id;
    await window.api.updatePage(p.id, {doc:window.doc('FIRST PUBLISHED'), seo:{title:'Published SEO',description:'Public desc',noindex:true,focusKeyphrase:'private seo control',strictGate:true}});
    return p;
  });
  check('new draft is not exposed', await page.evaluate(async () => (await window.reader.getStorefrontPageSnapshot('first')) === undefined));
  await page.evaluate(() => window.api.publishPage(window.firstId));
  let snapshot = await page.evaluate(() => window.reader.getStorefrontPageSnapshot('first'));
  check('publish exposes title, document and safe SEO projection', snapshot?.title === 'Public A' && snapshot.doc.content[0].props.title === 'FIRST PUBLISHED' && snapshot.seo.title === 'Published SEO' && snapshot.seo.noindex === true && !('strictGate' in snapshot.seo) && !('focusKeyphrase' in snapshot.seo));
  await page.evaluate(async () => {
    const result = await window.reader.getStorefrontPageSnapshot('first');
    result.doc.content[0].props.title = 'MUTATED RESPONSE';
    result.doc.root.props.themeMark = 'MUTATED RESPONSE';
  });
  snapshot = await page.evaluate(() => window.reader.getStorefrontPageSnapshot('first'));
  check('mutating a returned document cannot mutate the retained revision', snapshot.doc.content[0].props.title === 'FIRST PUBLISHED' && snapshot.doc.root.props.themeMark === 'theme FIRST PUBLISHED');
  await page.evaluate(() => window.api.updatePage(window.firstId, {title:'SECRET DRAFT',slug:'draft-new',doc:window.doc('PRIVATE DRAFT'),seo:{title:'DRAFT SEO',noindex:false}}));
  snapshot = await page.evaluate(() => window.reader.getStorefrontPageSnapshot('first'));
  check('later edits do not alter published title, content, theme or SEO', snapshot.title === 'Public A' && snapshot.doc.content[0].props.title === 'FIRST PUBLISHED' && snapshot.doc.root.props.themeMark === 'theme FIRST PUBLISHED' && snapshot.seo.title === 'Published SEO' && snapshot.seo.noindex === true);
  check('new draft slug is not exposed', await page.evaluate(async () => (await window.reader.getStorefrontPageSnapshot('draft-new')) === undefined));
  const other = await page.evaluate(async () => {
    const p = await window.api.createPage({title:'Public B',slug:'first',starter:'blank'});
    window.otherId = p.id;
    await window.api.publishPage(p.id);
    return p;
  });
  check('second page can use old draft slug for collision test', other.slug === 'first');
  check('duplicate published slug fails closed', await page.evaluate(async () => (await window.reader.getStorefrontPageSnapshot('first')) === undefined));
  await page.evaluate(() => {
    const key = 'woodex.admin.db.v1';
    const db = JSON.parse(localStorage.getItem(key));
    const p = db.pages.find(row => row.id === window.otherId);
    delete p.history[0].seo;
    localStorage.setItem(key, JSON.stringify(db));
    window.dispatchEvent(new StorageEvent('storage', {key}));
  });
  check('a malformed duplicate still makes the slug ambiguous', await page.evaluate(async () => (await window.reader.getStorefrontPageSnapshot('first')) === undefined));
  await page.evaluate(() => window.api.unpublishPage(window.otherId));
  check('unpublishing conflicting page restores unambiguous snapshot', (await page.evaluate(() => window.reader.getStorefrontPageSnapshot('first')))?.title === 'Public A');
  await page.evaluate(() => window.api.publishPage(window.firstId));
  check('republish moves content and SEO to new slug', await page.evaluate(async () => (await window.reader.getStorefrontPageSnapshot('first')) === undefined && (await window.reader.getStorefrontPageSnapshot('draft-new'))?.seo.title === 'DRAFT SEO'));
  const version = (await page.evaluate(() => window.api.getPage(window.firstId))).history.at(-1).version;
  await page.evaluate(version => window.api.revertPage(window.firstId, version), version);
  check('demo restore retains existing behavior: draft and no public snapshot', await page.evaluate(async () => (await window.reader.getStorefrontPageSnapshot('draft-new')) === undefined && (await window.api.getPage(window.firstId)).status === 'draft'));
  await page.evaluate(() => window.api.publishPage(window.firstId));
  check('restored draft is public only after republishing', (await page.evaluate(() => window.reader.getStorefrontPageSnapshot('draft-new')))?.doc.content[0].props.title === 'FIRST PUBLISHED');
  await page.evaluate(() => window.api.unpublishPage(window.firstId));
  check('unpublish removes public snapshot', await page.evaluate(async () => (await window.reader.getStorefrontPageSnapshot('draft-new')) === undefined));
  const copy = await page.evaluate(async () => {
    const p = await window.api.duplicatePage(window.firstId);
    return [p.status, await window.reader.getStorefrontPageSnapshot(p.slug)];
  });
  check('duplicated draft does not inherit published access', copy[0] === 'draft' && copy[1] == null);
  const chrome = await page.evaluate(async () => {
    const p = await window.api.createPage({title:'Chrome fixture',kind:'chrome'});
    await window.api.publishPage(p.id);
    return await window.reader.getStorefrontPageSnapshot(p.slug);
  });
  check('published chrome is excluded', chrome == null);
  await page.evaluate(async () => { const p = await window.api.getPage('home'); await window.api.updatePage(p.id,{doc:window.doc('LEGACY DRAFT')}); });
  check('editing legacy published row does not expose draft via reader', await page.evaluate(async () => (await window.reader.getStorefrontPageSnapshot('home')) === undefined));
  await page.evaluate(async () => { const p = await window.api.getPage('home'); await window.api.publishPage(p.id); });
  check('legacy seed can be republished to create trustworthy snapshot', (await page.evaluate(() => window.reader.getStorefrontPageSnapshot('home')))?.doc.content[0].props.title === 'LEGACY DRAFT');
  const tab = await browser.newPage();
  await tab.goto(`${base}/robots.txt`, {waitUntil:'domcontentloaded'});
  await tab.evaluate(async () => {window.reader=(await import('/src/api/storefront-pages.ts'));});
  check('second tab can read same-origin demo snapshot', (await tab.evaluate(() => window.reader.getStorefrontPageSnapshot('home')))?.title === 'Home');
  await page.evaluate(async () => {const home=await window.api.getPage('home'); await window.api.unpublishPage(home.id);});
  await tab.waitForFunction(async () => (await window.reader.getStorefrontPageSnapshot('home')) === undefined, {timeout:10000});
  check('storage event invalidates other tab after unpublish', true);
  console.log(`\nCMS demo reader: ${passed}/${passed + failed} passed (local browser / localStorage)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
