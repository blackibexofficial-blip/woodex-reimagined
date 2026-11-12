/**
 * WOODEX — sitemap entries, as a pure function of the catalogue and the CMS.
 *
 * SEO-001 (phase-2 decision D-01, option A): the sitemap may only list URLs that
 * a stranger can actually open. That means
 *
 *   * no builder preview routes (`/lab/*`), no approved-snapshot experiment
 *     (`/p/*`), no admin surface — those are `noindex` and unreachable by design;
 *   * CMS pages only when `published_page_index()` lists them, i.e. only when a
 *     published snapshot exists. A draft never reaches the sitemap, and
 *     unpublishing removes the URL at the next build;
 *   * `<lastmod>` only where a real date exists. The old generator stamped every
 *     URL with the build date, teaching crawlers that `lastmod` carries no signal.
 *
 * Kept free of data-module imports so the entry builder can be unit-tested
 * without the asset stubs the generator needs.
 */

export interface SitemapEntry {
  path: string;
  /** ISO `YYYY-MM-DD`, only when the source really has a date. */
  lastmod?: string;
  changefreq: string;
  priority: string;
}

export interface PublishedPageRef {
  slug: string;
  kind?: string | null;
  publishedAt?: string | null;
  published_at?: string | null;
}

export interface SitemapSources {
  products: Array<{ id: string }>;
  series: Array<{ id: string }>;
  services: Array<{ slug: string }>;
  posts: Array<{ id: string; date?: string }>;
  pages?: PublishedPageRef[];
}

/** Transactional, administrative and preview routes are excluded on purpose. */
export const STATIC_ROUTES = [
  "/",
  "/shop",
  "/series",
  "/room-packages",
  "/services",
  "/materials",
  "/projects",
  "/custom-design",
  "/blog",
  "/about",
  "/b2b",
  "/contact",
  "/showrooms",
  "/virtual-showroom",
  "/warranty",
  "/quotation",
];

/** Prefixes that must never appear in the sitemap, whatever the source says. */
export const NON_PUBLIC_PREFIXES = ["/admin", "/lab/", "/p/", "/preview", "/api/", "/cart", "/checkout"];

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/**
 * Normalise a date to `YYYY-MM-DD`, or `undefined` when there is no honest date.
 * Accepts ISO timestamps (`2026-01-31T10:00:00Z`) and the human format the blog
 * data uses (`Feb 15, 2025`). Anything else — including an empty string — is
 * treated as "unknown" rather than guessed at.
 */
export function isoDate(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(text);
  if (iso) return iso[1];
  const human = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})$/.exec(text);
  if (human) {
    const month = MONTHS[human[1].slice(0, 3).toLowerCase()];
    if (!month) return undefined;
    return `${human[3]}-${month}-${human[2].padStart(2, "0")}`;
  }
  return undefined;
}

export function isPublicPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  // A slug is a path segment, not an address: no query, fragment, whitespace,
  // scheme, protocol-relative trick or traversal in a sitemap <loc>.
  if (/[?#\s]/.test(path) || path.includes(":") || path.includes("//") || path.includes("..")) return false;
  return !NON_PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

/** Build the ordered, de-duplicated entry list the sitemap renders. */
export function buildSitemapEntries(sources: SitemapSources): SitemapEntry[] {
  const entries: SitemapEntry[] = [
    ...STATIC_ROUTES.map((path) => ({
      path,
      changefreq: path === "/" ? "weekly" : "monthly",
      priority: path === "/" ? "1.0" : path === "/shop" ? "0.9" : "0.6",
    })),
    ...sources.products.map((product) => ({ path: `/shop/${product.id}`, changefreq: "weekly", priority: "0.8" })),
    ...sources.series.map((series) => ({ path: `/series/${series.id}`, changefreq: "monthly", priority: "0.7" })),
    ...sources.services.map((service) => ({ path: `/services/${service.slug}`, changefreq: "monthly", priority: "0.6" })),
    ...sources.posts.map((post) => ({
      path: `/blog/${post.id}`,
      lastmod: isoDate(post.date),
      changefreq: "yearly",
      priority: "0.5",
    })),
    // Published CMS pages only — chrome documents (header/footer) are not URLs.
    ...(sources.pages ?? [])
      .filter((page) => (page.kind ?? "page") !== "chrome")
      .map((page) => ({
        path: `/${String(page.slug).replace(/^\/+/, "")}`,
        lastmod: isoDate(page.publishedAt ?? page.published_at),
        changefreq: "monthly",
        priority: "0.6",
      })),
  ];

  const seen = new Set<string>();
  return entries
    .filter((entry) => isPublicPath(entry.path))
    .filter((entry) => (seen.has(entry.path) ? false : (seen.add(entry.path), true)));
}

/**
 * Fail the build rather than ship a sitemap that promises URLs nobody can open.
 * Returns the entries so callers can chain it.
 */
export function assertPublicOnly(entries: SitemapEntry[]): SitemapEntry[] {
  const leaked = entries.filter((entry) => !isPublicPath(entry.path));
  if (leaked.length > 0) {
    throw new Error(`sitemap would list non-public paths: ${leaked.map((e) => e.path).join(", ")}`);
  }
  const seen = new Set<string>();
  const duplicates = entries.filter((entry) => (seen.has(entry.path) ? true : (seen.add(entry.path), false)));
  if (duplicates.length > 0) {
    throw new Error(`sitemap has duplicate paths: ${duplicates.map((e) => e.path).join(", ")}`);
  }
  for (const entry of entries) {
    if (entry.lastmod && !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod)) {
      throw new Error(`sitemap entry ${entry.path} has a malformed lastmod: ${entry.lastmod}`);
    }
  }
  return entries;
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderSitemap(entries: SitemapEntry[], siteUrl: string): string {
  const origin = siteUrl.replace(/\/+$/, "");
  const body = entries.map((entry) => {
    const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "";
    return `  <url><loc>${escapeXml(`${origin}${entry.path}`)}</loc>${lastmod}<changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <!-- Generated by scripts/generate-sitemap.ts — ${entries.length} public URLs. Do not edit by hand. -->`,
    ...body,
    "</urlset>",
    "",
  ].join("\n");
}
