/* Browser tests of builder rendering guards. Start Vite locally on :4179 first. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:4179';
const browser = await launchBrowser();
let passed = 0, failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
try {
  const page = await browser.newPage();
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { woodexConfig } = await import('/src/pages-builder/blocks.tsx');
    const { Render } = await import('/node_modules/.vite/deps/@puckeditor_core.js');
    const { BuilderModeContext } = await import('/src/pages-builder/shell.tsx');
    const { safeBuilderHref } = await import('/src/pages-builder/safe-url.ts');
    const { sanitizeRichHtml } = await import('/src/pages-builder/richtext.tsx');
    const host = document.createElement('div'); host.id = 'builder-test'; document.body.appendChild(host);
    const root = createRoot(host);
    window.builderTest = {
      safeBuilderHref, sanitizeRichHtml,
      render: async (type, mode, extra = {}) => {
        const config = woodexConfig.components[type];
        if (!config) throw new Error(`Unknown test block ${type}`);
        root.render(React.createElement(BuilderModeContext.Provider, {value: mode}, React.createElement(config.render, {...config.defaultProps, ...extra})));
        await new Promise(resolve => setTimeout(resolve, 30));
        return { html: host.innerHTML, text: host.textContent, forms: host.querySelectorAll('form').length,
          links: [...host.querySelectorAll('a')].map(a => ({href:a.getAttribute('href'), text:a.textContent})),
          locked: !!host.querySelector('[title="Locked — no edits"]') };
      },
      renderDoc: async () => {
        const data = { root: {props: {}}, content: [
          {type:'EnquiryForm', props:{...woodexConfig.components.EnquiryForm.defaultProps, id:'guard-form'}},
          {type:'Button', props:{...woodexConfig.components.Button.defaultProps, id:'guard-link', label:'Unsafe link', href:'javascript:alert(1)'}},
          {type:'Heading', props:{...woodexConfig.components.Heading.defaultProps, id:'guard-hidden', hidden:'hidden', title:'PRIVATE HIDDEN LABEL'}},
        ]};
        root.render(React.createElement(Render, {config:woodexConfig, data}));
        await new Promise(resolve => setTimeout(resolve, 60));
        return {forms:host.querySelectorAll('form').length, text:host.textContent,
          link:[...host.querySelectorAll('a')].find(a=>a.textContent.includes('Unsafe link'))?.getAttribute('href')};
      },
      submit: () => {
        window.testAlert = '';
        window.alert = text => { window.testAlert = text; };
        const f = host.querySelector('form');
        if (!f) return null;
        const event = new Event('submit', {bubbles: true, cancelable: true});
        f.dispatchEvent(event);
        return {message:window.testAlert, prevented:event.defaultPrevented};
      },
    };
  });
  const render = (type, mode, props = {}) => page.evaluate(({type, mode, props}) => window.builderTest.render(type, mode, props), {type, mode, props});
  for (const type of ['HeroForm', 'HeroSplitForm', 'EnquiryForm', 'CallbackForm', 'NewsletterSignup']) {
    const pub = await render(type, 'public');
    check(`${type}: public mode does not render demo form`, pub.forms === 0 && pub.text.includes('currently unavailable'));
    check(`${type}: public fallback is appropriate`, type === 'NewsletterSignup' ? !pub.links.some(a => a.href === '/contact') : pub.links.some(a => a.href === '/contact'));
    const lab = await render(type, 'store');
    const result = await page.evaluate(() => window.builderTest.submit());
    check(`${type}: LAB form remains but does not claim success`, lab.forms === 1 && result?.prevented && result.message === 'Preview only. No submission was sent.');
    const editor = await render(type, 'editor');
    check(`${type}: editor still renders form`, editor.forms === 1);
  }
  const sectionPublic = await render('HeroForm', 'public', {hidden:'hidden'});
  const sectionEditor = await render('HeroForm', 'editor', {hidden:'hidden'});
  check('hidden section is absent in public but visible as editor placeholder', !sectionPublic.text.trim() && sectionEditor.text.includes('Hidden on storefront'));
  const elementPublic = await render('Button', 'public', {hidden:'hidden'});
  const elementEditor = await render('Button', 'editor', {hidden:'hidden'});
  check('hidden element is absent in public but visible as editor placeholder', !elementPublic.text.trim() && elementEditor.text.includes('hidden on storefront'));
  const lockedPublic = await render('Button', 'public', {locked:'locked'});
  const lockedEditor = await render('Button', 'editor', {locked:'locked'});
  check('public mode omits editing lock badge', !lockedPublic.locked && lockedEditor.locked);

  const puckDoc = await page.evaluate(() => window.builderTest.renderDoc());
  check('Puck render defaults to public-safe form, link and hidden guards', puckDoc.forms === 0 && puckDoc.text.includes('currently unavailable') && !puckDoc.text.includes('PRIVATE HIDDEN LABEL') && puckDoc.link === null);

  const cases = await page.evaluate(() => {
    const f = window.builderTest.safeBuilderHref;
    const bad = ['javascript:alert(1)', '  JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'data:text/html,hello', '//evil.test/a', '/\\evil.test', 'https://user:pass@evil.test/', 'vbscript:foo', 'file:///etc/passwd'];
    const good = ['/shop?q=1&x=2', '#features', 'shop/chairs', '../contact', 'https://example.test/a?x=1&y=2', 'http://example.test/', 'mailto:hi@example.test', 'tel:+923001234567'];
    return {bad:bad.map(x => [x, f(x)]), good:good.map(x => [x, f(x)])};
  });
  check('dangerous and ambiguous URL forms are rejected', cases.bad.every(([,out]) => out === null || out === undefined));
  check('ordinary relative, web, telephone and email links are retained', cases.good.every(([input,out]) => input === out));
  for (const [type, props, text] of [
    ['ButtonLink', {href:'javascript:alert(1)', label:'Legacy action'}, 'Legacy action'],
    ['Button', {href:'javascript:alert(1)', label:'Button action'}, 'Button action'],
    ['TwoButtons', {primaryHref:'//evil.test', primaryLabel:'Primary', secondaryHref:'/shop', secondaryLabel:'Secondary'}, 'Primary'],
    ['CardBox', {ctaHref:'data:text/html,x', ctaLabel:'Card action'}, 'Card action'],
    ['HeroCentered', {ctaHref:'java\nscript:alert(1)', ctaLabel:'Hero action'}, 'Hero action'],
    ['CtaStrip', {ctaHref:'javascript:alert(1)', ctaLabel:'Bar action'}, 'Bar action'],
    ['CategoryCircles', {circles:[{href:'/\\evil.test', label:'Category'}]}, 'Category'],
  ]) {
    const result = await render(type, 'public', props);
    check(`${type}: unsafe configured link has no href`, result.links.some(a => a.text.includes(text) && a.href === null));
  }
  const safeButton = await render('Button', 'public', {href:'/shop?category=chairs&sort=popular', label:'Shop'});
  check('valid configured link remains navigable', safeButton.links.some(a => a.href === '/shop?category=chairs&sort=popular'));
  const rich = await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = window.builderTest.sanitizeRichHtml('<a href="/shop?x=1&amp;y=2">Shop</a> <a href="/&#92;&#92;evil.test">encoded</a> <a href="javascript:alert(1)">bad</a><img src=x onerror=alert(1)>');
    return {links:[...host.querySelectorAll('a')].map(a=>a.getAttribute('href')), images:host.querySelectorAll('img').length};
  });
  check('rich text preserves ordinary query links', rich.links.includes('/shop?x=1&y=2'));
  check('rich text does not decode encoded backslashes or allow scripts/images', rich.links.every(h => !h.includes('\\') && !h.startsWith('javascript:')) && rich.images === 0);
  const slug = await page.evaluate(async () => {
    const { demoAdminApi } = await import('/src/api/demo/db.ts');
    const created = await demoAdminApi.createPage({title:'LAB guard fixture', starter:'blank'});
    await demoAdminApi.updatePage(created.id, {doc:{root:{props:{}}, content:[{type:'EnquiryForm',props:{id:'lab-form',title:'Lab form'}}]}});
    return created.slug;
  });
  await page.goto(`${base}/lab/${slug}`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.body.textContent.includes('Lab form'), {timeout:15000});
  check('actual LAB route retains its preview-only form', await page.evaluate(() => !!document.querySelector('form') && document.body.textContent.includes('Preview only — this form does not send submissions.')));
  console.log(`\nCMS rendering guards: ${passed}/${passed + failed} passed (local browser, fixture components)`);
  if (failed) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await browser.close(); }
