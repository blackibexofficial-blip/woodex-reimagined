/* Render the actual builder ProductRail with bundled seed data; block external requests. */
import { launchBrowser } from './lib.mjs';
const base = process.env.WOODEX_TEST_BASE ?? 'http://127.0.0.1:8080';
const browser = await launchBrowser();
let passed = 0, failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? passed++ : failed++; };
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', r => new URL(r.url()).origin === new URL(base).origin ? r.continue() : r.abort());
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const { homeBlocks } = await import('/src/pages-builder/sections/home-blocks.tsx');
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    for (const filter of ['all', 'isNew', 'isBestSeller']) {
      const el = document.createElement('div'); el.id = `rail-${filter}`; document.body.appendChild(el);
      createRoot(el).render(React.createElement(homeBlocks.ProductRail.render, { ...homeBlocks.ProductRail.defaultProps, filter, limit: '8' }));
    }
  });
  for (const filter of ['all', 'isNew', 'isBestSeller']) await page.waitForSelector(`#rail-${filter} a.group h3`);
  const groups = await page.evaluate(() => Object.fromEntries(['all', 'isNew', 'isBestSeller'].map(filter => [filter,
    Array.from(document.querySelectorAll(`#rail-${filter} a.group`), a => ({ href: a.getAttribute('href'), name: a.querySelector('h3')?.textContent?.trim() }))])));
  for (const [filter, items] of Object.entries(groups)) {
    check(`${filter} product links use existing /shop product route`, items.length > 0 && items.every(item => /^\/shop\/[^/]+$/.test(item.href) && item.name));
  }
  const items = [...new Map(Object.values(groups).flat().map(item => [item.href, item])).values()];
  let matchingProducts = true;
  for (const item of items) {
    await page.goto(new URL(item.href, base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(expected => Array.from(document.querySelectorAll('h1')).some(h => h.textContent.trim() === expected || /404|not found/i.test(h.textContent)), { timeout: 10000 }, item.name);
    const heading = await page.$eval('h1', h => h.textContent.trim());
    if (heading !== item.name) { console.log(`  Incorrect product for ${item.href}: ${heading}`); matchingProducts = false; }
  }
  check(`all ${items.length} distinct rendered products open their matching detail page`, items.length > 0 && matchingProducts);
  check('no uncaught browser errors', errors.length === 0);
} catch (e) { failed++; console.error('FAIL unexpected test error', e); }
finally { await browser.close(); }
console.log(`Builder product rail: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
