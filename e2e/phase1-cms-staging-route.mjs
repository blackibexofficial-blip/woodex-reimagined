/* Local demo only. Requires Vite :4186 flag off and :4187 flag on. */
import { launchBrowser } from './lib.mjs';
import path from 'node:path';
const browser = await launchBrowser();
let passed = 0, failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
const off = 'http://127.0.0.1:4186', on = 'http://127.0.0.1:4187';
try {
  const page = await browser.newPage();
  await page.goto(`${off}/p/example`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.body.textContent.includes('Page not found') || document.body.textContent.includes('Oops! Page not found'), {timeout:20000});
  check('flag off leaves /p/:slug unavailable', await page.evaluate(() => !document.body.textContent.includes('Staging preview') && document.body.textContent.includes('404')));
  await page.goto(on, {waitUntil:'domcontentloaded'});
  const fixture = await page.evaluate(async () => {
    const {demoAdminApi:api} = await import('/src/api/demo/db.ts');
    const first = await api.createPage({title:'First public title',slug:'first-test',starter:'blank'});
    const second = await api.createPage({title:'Second public title',slug:'second-test',starter:'blank'});
    const firstDoc = {root:{props:{}},content:[
      {type:'Heading',props:{id:'first-h1',title:'FIRST PUBLIC CONTENT',level:'h1'}},
      {type:'Heading',props:{id:'hidden-h1',title:'HIDDEN EDITOR CONTENT',hidden:'hidden',level:'h2'}},
      {type:'Button',props:{id:'next',label:'Go to second page',href:'/p/second-test'}}
    ]};
    const secondDoc = {root:{props:{}},content:[{type:'Heading',props:{id:'second-h1',title:'SECOND PUBLIC CONTENT',level:'h1'}}]};
    await api.updatePage(first.id,{doc:firstDoc,seo:{title:'First public SEO',noindex:false}});
    await api.updatePage(second.id,{doc:secondDoc}); await api.publishPage(second.id);
    return {first:first.id, second:second.id, firstSlug:first.slug, secondSlug:second.slug};
  });
  const gotoFirst = async () => { await page.goto(`${on}/p/${fixture.firstSlug}`,{waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>document.body.textContent.includes('Staging preview') && !document.body.textContent.includes('Loading published page'),{timeout:20000}); };
  await gotoFirst();
  check('unpublished draft renders missing state, not draft', await page.evaluate(() => document.querySelector('main')?.textContent.includes('Page not found') && !document.querySelector('main')?.textContent.includes('FIRST PUBLIC CONTENT')));
  await page.evaluate(async id => { const {demoAdminApi:api}=await import('/src/api/demo/db.ts'); await api.publishPage(id); await api.updatePage(id,{title:'SECRET DRAFT TITLE',doc:{root:{props:{}},content:[{type:'Heading',props:{id:'secret',title:'SECRET DRAFT CONTENT',level:'h1'}}]},seo:{title:'SECRET DRAFT SEO'}}); },fixture.first);
  await gotoFirst();
  check('public route shows published copy, never later draft', await page.evaluate(() => document.querySelector('main')?.textContent.includes('FIRST PUBLIC CONTENT') && !document.body.textContent.includes('SECRET DRAFT CONTENT') && !document.body.textContent.includes('SECRET DRAFT TITLE')));
  check('hidden block is absent from rendered DOM', await page.evaluate(() => !document.querySelector('main')?.textContent.includes('HIDDEN EDITOR CONTENT')));
  check('staging title uses published SEO, not draft SEO', await page.evaluate(() => document.title.includes('First public SEO') && !document.title.includes('SECRET DRAFT SEO')));
  check('staging route sets one noindex robots tag and no duplicate canonical', await page.evaluate(() => document.querySelectorAll('meta[name="robots"]').length === 1 && document.querySelector('meta[name="robots"]')?.content === 'noindex,nofollow' && document.querySelectorAll('link[rel="canonical"]').length === 1 && document.querySelector('link[rel="canonical"]')?.href === `${location.origin}${location.pathname}`));
  check('existing header/footer and explicit staging banner are present', await page.evaluate(() => !!document.querySelector('header') && !!document.querySelector('footer') && document.body.textContent.includes('Not for public release')));
  await page.addScriptTag({path:path.resolve('node_modules/axe-core/axe.min.js')});
  const axe = await page.evaluate(async () => (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(x=>x.id));
  check('synthetic rendered page has no WCAG A/AA axe violations', axe.length === 0);
  if (axe.length) console.log('axe violations:', axe.join(', '));
  const collision = await page.evaluate(async id => {
    const {demoAdminApi:api}=await import('/src/api/demo/db.ts');
    await api.updatePage(id,{slug:'draft-new'});
    const p=await api.createPage({title:'Collision',slug:'first-test',starter:'blank'});
    await api.updatePage(p.id,{doc:{root:{props:{}},content:[{type:'Heading',props:{id:'collision',title:'COLLISION',level:'h1'}}]}});
    await api.publishPage(p.id); return p.id;
  },fixture.first);
  await gotoFirst();
  check('duplicate published slugs fail closed on route', await page.evaluate(() => document.querySelector('main')?.textContent.includes('Page not found') && !document.querySelector('main')?.textContent.includes('COLLISION')));
  await page.evaluate(async ({id,collision}) => {const {demoAdminApi:api}=await import('/src/api/demo/db.ts'); await api.deletePage(collision); await api.updatePage(id,{slug:'first-test'});},{id:fixture.first,collision});
  await gotoFirst();
  check('removing collision restores the original published snapshot', await page.evaluate(() => document.querySelector('main')?.textContent.includes('FIRST PUBLIC CONTENT')));
  await page.evaluate(() => [...document.querySelectorAll('main a')].find(a=>a.textContent.includes('Go to second page')).click());
  await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('SECOND PUBLIC CONTENT'), {timeout:15000});
  check('client navigation displays the new slug without old content', await page.evaluate(() => location.pathname === '/p/second-test' && !document.querySelector('main')?.textContent.includes('FIRST PUBLIC CONTENT')));
  await page.evaluate(() => {history.pushState({},'', '/'); window.dispatchEvent(new PopStateEvent('popstate'));});
  await page.waitForFunction(() => location.pathname === '/' && document.body.textContent.includes('Design For Your Workspace'), {timeout:15000});
  check('leaving preview restores robots metadata', await page.evaluate(() => !document.querySelector('meta[name="robots"]')));
  check('leaving preview restores page title', await page.evaluate(() => !document.title.includes('preview')));
  check('existing home page is unchanged', await page.evaluate(() => document.body.textContent.includes('Design For Your Workspace')));
  await page.goto(`${on}/shop`,{waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>document.body.textContent.includes('Shop'),{timeout:20000});
  check('existing /shop route remains separate', await page.evaluate(() => !document.body.textContent.includes('Staging preview')));
  await page.goto(`${on}/p/Invalid_slug`,{waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('Page not found'),{timeout:20000});
  check('invalid slug is rejected', true);
  await page.evaluate(async id => {const {demoAdminApi:api}=await import('/src/api/demo/db.ts'); await api.publishPage(id);},fixture.first);
  await gotoFirst();
  check('republishing updates the public snapshot', await page.evaluate(() => document.querySelector('main')?.textContent.includes('SECRET DRAFT CONTENT')));
  await page.evaluate(async id => {const {demoAdminApi:api}=await import('/src/api/demo/db.ts'); await api.updatePage(id,{doc:{root:{props:{}},content:[{type:'Image',props:{id:'unsupported-image',src:'/x'}}]}}); await api.publishPage(id);},fixture.first);
  await gotoFirst();
  check('unsupported published block fails closed', await page.evaluate(() => document.querySelector('main')?.textContent.includes('not supported in the staging preview') && !document.querySelector('main img[src="/x"]')));
  await page.evaluate(async id => {const {demoAdminApi:api}=await import('/src/api/demo/db.ts'); await api.unpublishPage(id);},fixture.first);
  await gotoFirst();
  check('unpublish yields missing state after navigation', await page.evaluate(() => document.querySelector('main')?.textContent.includes('Page not found')));
  const status = await page.evaluate(async id => {const {demoAdminApi:api}=await import('/src/api/demo/db.ts'); const pg=await api.getPage(id); await api.revertPage(id, pg.history[pg.history.length-1].version); return (await api.getPage(id)).status;},fixture.first);
  await gotoFirst();
  check('demo restore stays unavailable until republished', status === 'draft' && await page.evaluate(() => document.querySelector('main')?.textContent.includes('Page not found')));
  await page.evaluate(async id => {const {demoAdminApi:api}=await import('/src/api/demo/db.ts'); await api.publishPage(id);},fixture.first);
  await gotoFirst();
  check('republished restore renders prior public content', await page.evaluate(() => document.querySelector('main')?.textContent.includes('FIRST PUBLIC CONTENT')));
  const boundary = await page.evaluate(async () => {
    const React=(await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const transformed=await (await fetch('/src/pages-builder/PublishedPagePreview.tsx')).text();
    const routerPath=transformed.match(/from "(\/node_modules\/\.vite\/deps\/react-router-dom\.js\?v=[^"]+)"/)?.[1];
    if (!routerPath) throw new Error('Could not find Vite router module');
    const {MemoryRouter}=await import(routerPath);
    const {RenderBoundary}=await import('/src/pages-builder/PublishedPagePreview.tsx');
    const host=document.createElement('div'); document.body.appendChild(host); const root=createRoot(host);
    function Broken(){throw new Error('SECRET INTERNAL ERROR');}
    root.render(React.createElement(MemoryRouter,null,React.createElement(RenderBoundary,{key:'broken'},React.createElement(Broken))));
    await new Promise(r=>setTimeout(r,50));
    const safe=host.textContent.includes('Page unavailable') && !host.textContent.includes('SECRET INTERNAL ERROR');
    root.render(React.createElement(MemoryRouter,null,React.createElement(RenderBoundary,{key:'healthy'},React.createElement('p',null,'Recovered'))));
    await new Promise(r=>setTimeout(r,50));
    const recovered=host.textContent.includes('Recovered'); root.unmount(); host.remove(); return {safe,recovered};
  });
  check('render boundary hides unexpected internal errors', boundary.safe);
  check('render boundary recovers for a new page', boundary.recovered);
  console.log(`\nCMS staging route: ${passed}/${passed + failed} passed (local demo browser)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
