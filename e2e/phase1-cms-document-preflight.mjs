/* Start local Vite in demo mode on :4185. All data is synthetic browser localStorage. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4185';
const browser = await launchBrowser();
let passed = 0, failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
try {
  const page = await browser.newPage();
  await page.goto(base, {waitUntil:'domcontentloaded'});
  const results = await page.evaluate(async () => {
    const {preparePublicDocument} = await import('/src/pages-builder/public-document.ts');
    const {woodexConfig} = await import('/src/pages-builder/blocks.tsx');
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {Render} = await import('/node_modules/.vite/deps/@puckeditor_core.js');
    const allowed = ['Heading','SubHeading','Paragraph','SmallLabel','SectionHeading','ButtonLink','Button','TwoButtons','Spacer','DividerLine','HeroCentered','HeroCenteredTrust','CtaStrip'];
    const mk = (type = 'Heading', props = {}) => ({type, props:{...woodexConfig.components[type]?.defaultProps, id:`${type}-1`, ...props}});
    const doc = (...content) => ({root:{props:{}},content});
    const hasIssue = (d, code) => {const r = preparePublicDocument(d); return !r.ok && r.issues.some(x=>x.code === code);};
    const answers = [];
    const test = (name, pass) => answers.push({name, pass:!!pass});
    test('each of 13 provisional block defaults is accepted', allowed.every(type => preparePublicDocument(doc(mk(type))).ok));
    test('empty linked-style list and empty inspector are accepted', preparePublicDocument({root:{props:{_linkedStyles:[]}},content:[mk('Heading',{_inspector:{}})]}).ok);
    test('unknown block is rejected even if visually hidden', hasIssue(doc({type:'UnknownBlock',props:{id:'x',hidden:'hidden'}}),'unsupported_block'));
    test('demo form and image blocks are not in the provisional profile', hasIssue(doc(mk('EnquiryForm')),'unsupported_block') && hasIssue(doc(mk('Image')),'unsupported_block'));
    test('prototype-like block name is not accepted', hasIssue(doc({type:'toString',props:{id:'x'}}),'unsupported_block'));
    test('linked styles with background URL fail closed', hasIssue({root:{props:{_linkedStyles:[{name:'hm-x',declarations:{background:'url(https://tracker.test/x)'}}]}},content:[]},'unsupported_root'));
    test('inspector styles and external URL backgrounds fail closed', hasIssue(doc(mk('Heading',{_inspector:{bg:'url(https://tracker.test/x)'}})),'unsupported_style'));
    test('unexpected root props and zones fail closed', hasIssue({root:{props:{unknown:'x'}},content:[]},'unsupported_root') && hasIssue({root:{props:{}},content:[],zones:{}},'unsupported_root'));
    test('unsupported block fields and nested object values are rejected', hasIssue(doc(mk('Heading',{extra:'x'})),'invalid_property') && hasIssue(doc(mk('Heading',{title:{html:'x'}})),'invalid_property'));
    test('invalid heading tag is rejected before React can render it', hasIssue(doc(mk('Heading',{level:'iframe'})),'invalid_property'));
    test('invalid enum and invalid hidden flags are rejected', hasIssue(doc(mk('Spacer',{size:'giant'})),'invalid_property') && hasIssue(doc(mk('Button',{hidden:'sometimes'})),'invalid_property'));
    test('malicious script, control characters, and protocol-relative links are rejected', ['javascript:alert(1)','java\nscript:x','//bad.test'].every(href=>hasIssue(doc(mk('Button',{href})),'unsafe_link')));
    test('ordinary query links are accepted', preparePublicDocument(doc(mk('Button',{href:'/shop?q=chair&sort=price'}))).ok);
    test('rich text markup is explicitly unsupported', hasIssue(doc(mk('Paragraph',{text:'<b>formatted</b>'})),'rich_text_unsupported'));
    test('plain text can contain ampersands', preparePublicDocument(doc(mk('Paragraph',{text:'Design & delivery'}))).ok);
    test('missing, malformed, and duplicate block ids are rejected', hasIssue(doc({type:'Heading',props:{id:''}}),'invalid_property') && hasIssue(doc({type:'Heading',props:{id:'bad id'}}),'invalid_property') && hasIssue(doc(mk('Heading'),mk('Heading')),'duplicate_id'));
    test('block wrappers with extra metadata fail closed', hasIssue(doc({...mk('Heading'),metadata:'unexpected'}),'invalid_block'));
    test('malformed documents fail closed', [null,{}, {root:{props:[]},content:[]}, {root:{props:{}},content:[null]}].every(v=>!preparePublicDocument(v).ok));
    test('excessive blocks are rejected without rendering', hasIssue(doc(...Array.from({length:51},(_,i)=>mk('Spacer',{id:`s-${i}`}))),'too_many_blocks'));
    test('oversized field and total payload are rejected', hasIssue(doc(mk('Paragraph',{text:'a'.repeat(4001)})),'invalid_property') && hasIssue(doc(...Array.from({length:30},(_,i)=>mk('Paragraph',{id:`p-${i}`,text:'a'.repeat(3400)}))),'size_limit'));
    const manyBad = preparePublicDocument(doc(...Array.from({length:40},(_,i)=>({type:'unsupported',props:{id:`u-${i}`}}))));
    test('diagnostics are bounded to 20 issues', !manyBad.ok && manyBad.issues.length === 20);
    const original = doc(mk('Heading',{id:'hero',title:'Original',level:'h1'}),mk('Button',{id:'cta',label:'Shop',href:'/shop'}));
    const result = preparePublicDocument(original);
    original.content[0].props.title = '<script>changed</script>';
    original.content[1].props.href = 'javascript:alert(1)';
    test('returned validated copy is independent of mutable source', result.ok && result.doc.content[0].props.title === 'Original' && result.doc.content[1].props.href === '/shop');
    if (result.ok) {
      const host = document.createElement('div'); document.body.appendChild(host);
      createRoot(host).render(React.createElement(Render,{config:woodexConfig,data:result.doc}));
      await new Promise(resolve=>setTimeout(resolve,80));
      test('validated copy renders through real Puck with heading and safe link', host.querySelector('h1')?.textContent === 'Original' && host.querySelector('a')?.getAttribute('href') === '/shop' && !host.querySelector('script,iframe,form'));
    } else test('validated copy renders through real Puck with heading and safe link',false);
    return answers;
  });
  for (const result of results) check(result.name, result.pass);
  const sourceChecks = await page.evaluate(async () => {
    const {demoAdminApi:api} = await import('/src/api/demo/db.ts');
    const {getRenderableStorefrontPage} = await import('/src/pages-builder/storefront-source.ts');
    const safe = await api.createPage({title:'Renderable fixture',starter:'blank'});
    await api.updatePage(safe.id,{doc:{root:{props:{}},content:[{type:'Heading',props:{id:'safe-heading',title:'Published safe',level:'h1'}}]}});
    await api.publishPage(safe.id);
    await api.updatePage(safe.id,{doc:{root:{props:{}},content:[{type:'Image',props:{id:'draft-secret'}}]}});
    const first = await getRenderableStorefrontPage(safe.slug);
    const draftIgnored = first?.doc.content[0].props.title === 'Published safe';
    await api.publishPage(safe.id);
    let rejected = false;
    try { await getRenderableStorefrontPage(safe.slug); } catch(e) { rejected = e.name === 'UnsupportedStorefrontDocumentError'; }
    await api.unpublishPage(safe.id);
    const missing = await getRenderableStorefrontPage(safe.slug);
    return {draftIgnored,rejected,missing:missing === undefined};
  });
  check('renderable source uses published version, not later draft', sourceChecks.draftIgnored);
  check('renderable source rejects unsupported published documents as a whole', sourceChecks.rejected);
  check('renderable source returns absent for unpublished content', sourceChecks.missing);
  const created = await page.evaluate(async () => {
    localStorage.setItem('woodex.admin.session', JSON.stringify({email:'test@example.test',name:'Test',signedInAt:new Date().toISOString()}));
    const {demoAdminApi:api} = await import('/src/api/demo/db.ts');
    const p = await api.createPage({title:'Preflight fixture', starter:'blank'});
    await api.updatePage(p.id,{doc:{root:{props:{}},content:[{type:'Heading',props:{id:'heading-1',title:'Safe draft',level:'h1',align:'left'}}]}});
    return p;
  });
  await page.goto(`${base}/admin/pages/${created.slug}`, {waitUntil:'domcontentloaded'});
  await page.waitForSelector('[data-testid="storefront-preflight"]', {timeout:30000});
  check('editor shows limited check on current draft', await page.$eval('[data-testid="storefront-preflight"]', el => el.textContent.includes('limited checks passed') && el.textContent.includes('not enabled') && el.textContent.includes('does not block publishing')));
  await page.evaluate(async (id) => {
    const {demoAdminApi:api} = await import('/src/api/demo/db.ts');
    await api.updatePage(id,{doc:{root:{props:{}},content:[{type:'EnquiryForm',props:{id:'form-1',title:'Demo'}}]}});
  }, created.id);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('[data-testid="storefront-preflight"]')?.textContent.includes('1 issue'),{timeout:30000});
  await page.click('[data-testid="storefront-preflight"] summary');
  check('editor reports unsupported block without changing publish controls', await page.$eval('[data-testid="storefront-preflight"]', el => el.textContent.includes('Block 1') && el.textContent.includes('not supported') && el.textContent.includes('does not block publishing')));
  console.log(`\nCMS public document preflight: ${passed}/${passed + failed} passed (local browser, synthetic documents)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
