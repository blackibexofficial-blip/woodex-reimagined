import { defineMcp } from "@lovable.dev/mcp-js";
import { searchProducts, getProduct, listCategories } from "./tools/catalog";
import { listServices, listBlogPosts, getBlogPost } from "./tools/content";
import { seoAuditPage, seoGenerateMeta } from "./tools/seo";

export default defineMcp({
  name: "woodex-reimagined",
  title: "WOODEX Reimagined",
  version: "0.2.0",
  instructions:
    "Public catalog tools for WOODEX, a Lahore furniture maker. Prices are in PKR. Use search_products / get_product for furniture, list_categories_and_series for taxonomy, list_services for services, and list_blog_posts / get_blog_post for articles. For read-only SEO advisory, seo_audit_page audits a page and seo_generate_meta drafts title/description suggestions.",
  tools: [searchProducts, getProduct, listCategories, listServices, listBlogPosts, getBlogPost, seoAuditPage, seoGenerateMeta],
});
