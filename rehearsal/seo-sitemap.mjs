/* Pure-function regression for the sitemap entry builder (M6 SEO-001).
   Bundles src/lib/sitemap.ts with the esbuild that already ships inside vite,
   so the check runs on plain node — no bun, no built assets, no network. */
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const check = (name, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (condition) passed++; else failed++;
};

const bundle = await build({
  entryPoints: [path.join(ROOT, 'src/lib/sitemap.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
});
const file = path.join(os.tmpdir(), `woodex-sitemap-${process.pid}.mjs`);
fs.writeFileSync(file, bundle.outputFiles[0].text);
const { buildSitemapEntries, renderSitemap, assertPublicOnly, isPublicPath, isoDate, STATIC_ROUTES } = await import(file);
fs.rmSync(file, { force: true });

const catalogue = {
  products: [{ id: 'ballmer-executive-desk' }, { id: 'nova-task-chair' }],
  series: [{ id: 'executive' }],
  services: [{ slug: 'custom-office-furniture' }],
  posts: [{ id: 'ergonomic-office-guide-2025', date: 'Feb 15, 2025' }, { id: 'unsigned-post' }],
};

// ── dates ────────────────────────────────────────────────────────────────
check('a human blog date becomes an ISO date', isoDate('Feb 15, 2025') === '2025-02-15');
check('an ISO timestamp keeps only the day', isoDate('2026-03-01T09:30:00Z') === '2026-03-01');
check('an unparseable date is unknown, not guessed', isoDate('sometime in 2025') === undefined);
check('an empty date is unknown', isoDate('') === undefined && isoDate(null) === undefined);

// ── the catalogue itself ─────────────────────────────────────────────────
const plain = buildSitemapEntries(catalogue);
const paths = plain.map((e) => e.path);
check('every static route is listed', STATIC_ROUTES.every((r) => paths.includes(r)));
check('products, series, services and posts are listed',
  ['/shop/ballmer-executive-desk', '/series/executive', '/services/custom-office-furniture', '/blog/ergonomic-office-guide-2025']
    .every((p) => paths.includes(p)));
check('no path is listed twice', new Set(paths).size === paths.length);
check('a post with a date gets lastmod', plain.find((e) => e.path.startsWith('/blog/ergonomic'))?.lastmod === '2025-02-15');
check('a post without a date gets no lastmod at all', plain.find((e) => e.path === '/blog/unsigned-post')?.lastmod === undefined);
check('nothing is stamped with the build date', plain.filter((e) => e.lastmod).length <= 2);
check('an empty CMS index adds nothing', plain.length === buildSitemapEntries({ ...catalogue, pages: [] }).length);

// ── the CMS index ────────────────────────────────────────────────────────
const withPages = buildSitemapEntries({
  ...catalogue,
  pages: [
    { slug: 'about-us', kind: 'page', published_at: '2026-02-01T08:00:00Z' },
    { slug: 'site-header', kind: 'chrome', published_at: '2026-02-01T08:00:00Z' },
    { slug: 'about-us', kind: 'page', published_at: '2026-02-01T08:00:00Z' },
  ],
});
const cmsPaths = withPages.map((e) => e.path);
check('a published CMS page is listed at its slug', cmsPaths.includes('/about-us'));
check('the published date becomes lastmod', withPages.find((e) => e.path === '/about-us')?.lastmod === '2026-02-01');
check('a chrome document is never listed', !cmsPaths.includes('/site-header'));
check('a duplicate index row cannot duplicate a URL', cmsPaths.filter((p) => p === '/about-us').length === 1);

// ── the pages that must never appear ─────────────────────────────────────
const hostile = buildSitemapEntries({
  ...catalogue,
  pages: [
    { slug: 'lab/draft-page', kind: 'page' },
    { slug: 'p/published-snapshot', kind: 'page' },
    { slug: 'admin/pages', kind: 'page' },
    { slug: 'shop?draft=1', kind: 'page' },
    { slug: 'https://evil.example/x', kind: 'page' },
  ],
});
const hostilePaths = hostile.map((e) => e.path);
check('a preview route can never reach the sitemap',
  !hostilePaths.some((p) => p.startsWith('/lab') || p.startsWith('/p/') || p.startsWith('/admin')));
check('a query string can never reach the sitemap', !hostilePaths.some((p) => p.includes('?')));
check('an absolute URL can never reach the sitemap', !hostilePaths.some((p) => p.startsWith('http')));
check('the hostile index leaves only the catalogue', hostile.length === plain.length);

// ── the guard the build runs ─────────────────────────────────────────────
check('the guard accepts a clean list', (() => { try { assertPublicOnly(plain); return true; } catch { return false; } })());
check('the guard rejects a smuggled preview path',
  (() => { try { assertPublicOnly([...plain, { path: '/lab/secret', changefreq: 'monthly', priority: '0.5' }]); return false; } catch { return true; } })());
check('the guard rejects duplicate paths',
  (() => { try { assertPublicOnly([{ path: '/', changefreq: 'weekly', priority: '1.0' }, { path: '/', changefreq: 'weekly', priority: '1.0' }]); return false; } catch { return true; } })());
check('the guard rejects a malformed lastmod',
  (() => { try { assertPublicOnly([{ path: '/', lastmod: '15/02/2025', changefreq: 'weekly', priority: '1.0' }]); return false; } catch { return true; } })());
check('a protocol-relative or traversal slug is refused',
  !isPublicPath('/https://evil.example/x') && !isPublicPath('/../../etc/passwd') && !isPublicPath('//evil.example/x'));
check('isPublicPath allows the storefront and blocks the workshop',
  isPublicPath('/shop') && isPublicPath('/about-us') && !isPublicPath('/admin') && !isPublicPath('/lab/x') && !isPublicPath('/p/x'));

// ── the rendered document ────────────────────────────────────────────────
const xml = renderSitemap(plain, 'https://woodex.pk');
check('the document is a urlset', xml.startsWith('<?xml') && xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'));
check('every loc is absolute and on the canonical host',
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].every((m) => m[1].startsWith('https://woodex.pk/')));
check('the document has exactly one url per entry', (xml.match(/<url>/g) ?? []).length === plain.length);
check('entries without a date omit lastmod entirely', !/<url><loc>https:\/\/woodex\.pk\/blog\/unsigned-post<\/loc><lastmod>/.test(xml));
check('the trailer is well formed', xml.trim().endsWith('</urlset>'));

console.log(`\nSEO sitemap: ${passed} passed, ${failed} failed (pure functions; no network)`);
process.exit(failed ? 1 : 0);
