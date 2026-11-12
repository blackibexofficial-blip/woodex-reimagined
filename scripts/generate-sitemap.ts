// Generates public/sitemap.xml from the actual data modules plus the CMS's
// published index, so every URL it lists is one a stranger can open.
// Run by `bun run build` (pre-write) and standalone via `bun run generate-sitemap`.
// Uses scripts/stub-assets.ts so image imports resolve to "" — identical to
// scripts/mcp-snapshot.ts.
import { products, seriesList } from "../src/data/products";
import { services } from "../src/data/services";
import { blogPosts } from "../src/data/blogPosts";
import { site } from "../src/config/site";
import { assertPublicOnly, buildSitemapEntries, renderSitemap, type PublishedPageRef } from "../src/lib/sitemap";

interface IndexRow {
  slug?: unknown;
  kind?: unknown;
  published_at?: unknown;
}

/**
 * Ask the database which CMS pages are published. Only an approved snapshot is
 * ever indexed, so a draft can never be advertised to a crawler. Without
 * Supabase credentials the storefront has no CMS pages at all (demo/static
 * builds), which is why the absence is a warning rather than a failure —
 * `SITEMAP_REQUIRE_PAGES=1` turns it into a hard error for a real deployment.
 */
async function loadPublishedPages(): Promise<PublishedPageRef[]> {
  const url = (process.env.VITE_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const key = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!url || !key) {
    if (process.env.SITEMAP_REQUIRE_PAGES === "1") {
      throw new Error("sitemap: VITE_SUPABASE_URL / anon key missing while SITEMAP_REQUIRE_PAGES=1");
    }
    console.warn("sitemap: no Supabase credentials — listing catalogue URLs only (no CMS pages).");
    return [];
  }
  try {
    const response = await fetch(`${url}/rest/v1/rpc/published_page_index`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw new Error(`published_page_index → ${response.status}`);
    const rows = (await response.json()) as IndexRow[];
    if (!Array.isArray(rows)) throw new Error("published_page_index did not return an array");
    return rows
      .filter((row) => typeof row?.slug === "string" && row.slug.length > 0)
      .map((row) => ({
        slug: String(row.slug),
        kind: typeof row.kind === "string" ? row.kind : "page",
        publishedAt: typeof row.published_at === "string" ? row.published_at : null,
      }));
  } catch (error) {
    if (process.env.SITEMAP_REQUIRE_PAGES === "1") throw error;
    console.warn(`sitemap: could not read published CMS pages (${(error as Error).message}) — listing catalogue URLs only.`);
    return [];
  }
}

const pages = await loadPublishedPages();
const entries = assertPublicOnly(
  buildSitemapEntries({
    products,
    series: seriesList,
    services,
    posts: blogPosts,
    pages,
  }),
);

await Bun.write("public/sitemap.xml", renderSitemap(entries, site.url));
console.log(
  `sitemap.xml: ${entries.length} public URLs (${products.length} products, ${seriesList.length} series, ` +
    `${services.length} services, ${blogPosts.length} posts, ${pages.length} published CMS pages; ` +
    `no /lab, /p, /admin routes)`,
);
