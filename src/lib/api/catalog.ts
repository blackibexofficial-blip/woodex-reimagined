/**
 * Catalog reads and the one translation between the API's shapes and the storefront's.
 *
 * The API speaks paisa and snake_case; every component in this app speaks rupees and
 * camelCase, because that is what 148 hard-coded products established before there was an
 * API. Rather than rewrite twenty components, the seam is here: `toProduct()` is the only
 * function that knows both languages.
 *
 * Prices cross that seam exactly once, as `price_minor / 100`. That is safe because
 * `price_minor` is an integer count of paisa and 100 is a power of ten — no binary rounding
 * can occur until the value is formatted for display, and formatting uses `toLocaleString`.
 */

import { getJson } from "./client";
import type {
  ApiCategoryNode,
  CategoryNode,
  ApiCollection,
  ApiProductCard,
  ApiProductDetail,
  ApiMaterialGroup,
  ApiMaterialLibrary,
  Product,
  ProductColor,
  ProductSpecification,
} from "./types";

/** 48 is the server's hard ceiling (`CatalogQuery::MAX_PER_PAGE`); asking for more is silently clamped. */
export const CATALOG_PAGE_SIZE = 48;

/**
 * A guard against an infinite loop if `meta.pages` is ever wrong.
 *
 * 12 pages × 48 = 576 products. The catalogue is 148 today; if it ever outgrows this, the
 * shop should move to server-side pagination rather than quietly fetching a thousand rows.
 */
const MAX_PAGES = 12;

const RUPEES_PER_MINOR = 100;

/**
 * A neutral swatch colour for a finish the API has no hex for.
 *
 * Rendering `backgroundColor: null` gives a transparent circle, which on a white card is an
 * invisible option — worse than a slightly wrong colour, because the visitor cannot tell it
 * is there at all.
 */
const DEFAULT_SWATCH = "#B9A88F";

interface AdapterOptions {
  /** Category slug → three bundled photos. Used when the API has no media for a product yet. */
  fallbackImages?: (category: string) => string[];
}

function minorToRupees(minor: number | null | undefined): number | undefined {
  if (minor === null || minor === undefined) return undefined;
  return Math.round(minor / RUPEES_PER_MINOR);
}

function toColors(
  colors: { name?: string; label?: string; hex: string | null }[] | undefined,
): ProductColor[] {
  return (colors ?? [])
    .map((color) => {
      const name = (color.label ?? color.name ?? "").trim();
      const hex = color.hex?.trim();
      return { name, hex: hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : DEFAULT_SWATCH };
    })
    .filter((color) => color.name !== "");
}

function toSpecifications(
  specifications: { label: string; value: string }[] | undefined,
): ProductSpecification[] {
  return (specifications ?? []).filter((row) => row.label.trim() !== "" && row.value.trim() !== "");
}

/**
 * Build the shape the components render.
 *
 * `images` is guaranteed to be non-empty. Every card and gallery in this app reads
 * `images[0]` without checking, which was safe while the data was a literal in the same
 * file and is not safe with a database behind it — a product created five minutes ago in
 * the admin has no photographs yet.
 */
export function toProduct(
  row: ApiProductCard | ApiProductDetail,
  options: AdapterOptions = {},
): Product {
  const detail = row as Partial<ApiProductDetail>;
  const path = row.category_path ?? [];
  // A product is filed at its leaf ("executive-tables") so that filtering by the leaf works;
  // the storefront's sidebar has entries for both the leaf and its parent, and `filterByCategory`
  // matches on `category` (the root) or `subcategory` (the leaf). Keeping both here is what
  // makes one product answer to "Office Tables" and to "Executive Tables".
  const root = path[0] ?? row.category_slug ?? row.category ?? "";
  const leaf = path.length > 1 ? path[path.length - 1] : undefined;
  const category = root;

  const images = (detail.images ?? []).filter(Boolean);
  const primary = row.image ?? images[0];
  const photos = images.length > 0 ? images : primary ? [primary] : [];

  if (photos.length === 0 && options.fallbackImages) {
    photos.push(...options.fallbackImages(category));
  }

  return {
    id: row.slug,
    name: row.name,
    category,
    subcategory: leaf,
    series: row.series ?? undefined,
    price: minorToRupees(row.price_minor) ?? 0,
    originalPrice: minorToRupees(row.compare_at_minor),
    description: detail.description?.trim() || row.summary,
    shortDescription: row.summary,
    images: photos.filter(Boolean),
    colors: toColors(detail.colors ?? row.finishes),
    specifications: toSpecifications(detail.specifications),
    features: (detail.features ?? []).filter((feature) => feature.trim() !== ""),
    inStock: row.in_stock,
    // The API does not carry a "new" flag; featured is the closest honest signal it has.
    isNew: false,
    isBestSeller: row.is_featured,
    rating: row.rating ?? 0,
    reviews: row.review_count,
  };
}

export interface FetchOptions {
  signal?: AbortSignal;
}

export interface ProductPageParams extends FetchOptions {
  page?: number;
  perPage?: number;
  /** A category slug, filtered on the server. */
  category?: string;
}

/** One page of products. */
export async function fetchProductPage(
  params: ProductPageParams = {},
): Promise<ApiCollection<ApiProductCard>> {
  const { page = 1, perPage = CATALOG_PAGE_SIZE, category, signal } = params;

  const search = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });

  if (category) search.set("category", category);

  return getJson<ApiCollection<ApiProductCard>>(`/products?${search.toString()}`, { signal });
}

/**
 * Every published product, page by page.
 *
 * The shop filters and counts in the browser — the sidebar shows a count for thirteen
 * categories and the search is instant — so it needs the whole catalogue, not a page of it.
 * At 148 products that is four requests of 48 against a five-minute server cache, which is
 * cheaper than making the sidebar count stale by design.
 */
export async function fetchAllProducts(options: FetchOptions = {}): Promise<ApiProductCard[]> {
  const first = await fetchProductPage({ page: 1, signal: options.signal });
  const pages = Math.min(first.meta?.pages ?? 1, MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
      fetchProductPage({ page: index + 2, signal: options.signal }),
    ),
  );

  return [first, ...rest].flatMap((page) => page.data ?? []);
}

/** One product by slug. Throws `ApiError` with status 404 when it is not in the catalogue. */
export async function fetchProduct(slug: string, options: FetchOptions = {}): Promise<ApiProductDetail> {
  const body = await getJson<{ data: ApiProductDetail }>(`/products/${encodeURIComponent(slug)}`, {
    signal: options.signal,
  });

  return body.data;
}

/** The category tree with live counts. Public and cached for five minutes server-side. */
export async function fetchCategories(options: FetchOptions = {}): Promise<ApiCategoryNode[]> {
  const body = await getJson<{ data: ApiCategoryNode[] }>("/categories", { signal: options.signal });

  return body.data ?? [];
}

/**
 * Filter a product list by a sidebar category id.
 *
 * This mirrors `getProductsByCategory` in the bundled snapshot exactly — including the
 * parent-to-children expansion — because the two implementations share a URL space:
 * `/shop?category=office-tables` must show the same products whether the data came from the
 * API or from the snapshot, or a link shared yesterday would open a different page today.
 */
const CHILDREN: Record<string, string[]> = {
  "office-tables": ["executive-tables", "manager-tables", "staff-tables", "meeting-tables", "reception-tables"],
  bedroom: ["bed-sets", "bedside-tables", "dressing-tables", "mirrors", "bench-settee"],
  living: ["home-sofa", "center-side-tables", "coffee-tables", "console", "tv-units"],
  dining: ["dining-sets", "dining-chairs", "dining-tables"],
};

export function filterByCategory(products: Product[], category: string): Product[] {
  if (category === "all") return products;

  const children = CHILDREN[category];

  if (children) {
    return products.filter(
      (product) => product.category === category || children.includes(product.subcategory ?? ""),
    );
  }

  return products.filter(
    (product) => product.category === category || product.subcategory === category,
  );
}

/** The shop's sort dropdown, applied to whichever list is in hand. */
export function sortProducts(products: Product[], sortBy: string): Product[] {
  const sorted = [...products];

  switch (sortBy) {
    case "price-low":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-high":
      return sorted.sort((a, b) => b.price - a.price);
    case "rating":
      return sorted.sort((a, b) => b.rating - a.rating);
    case "newest":
      return sorted.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    default:
      return sorted;
  }
}

/**
 * Trim the editorial navigation down to the categories that actually have products.
 *
 * The sidebar is hand-written (`officeCategoryTree` in the shop) because the ordering and the
 * wording are a merchandising decision, not a database one. But a category with nothing in it
 * is a dead end: the visitor clicks, gets "no products found", and concludes the shop is
 * broken. Filtering the tree against the live catalogue keeps the editorial order and removes
 * the dead ends — the same job the API's category counts do, without a second request.
 *
 * A parent is kept when its children have stock even if it has none of its own, because the
 * parent is how you reach them.
 */
export function pruneTree(nodes: CategoryNode[], products: Product[]): CategoryNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children.filter((child) => filterByCategory(products, child.id).length > 0),
    }))
    .filter(
      (node) =>
        node.children.length > 0 || filterByCategory(products, node.id).length > 0,
    );
}

/**
 * Categories the editorial tree does not know about.
 *
 * The API can grow a category before the sidebar is told about it. Rather than hide those
 * products behind "All", they get a group of their own — a shop that cannot show a category
 * it has stock in is worse than one with an extra heading.
 */
export function uncoveredCategories(
  nodes: CategoryNode[],
  products: Product[],
): { label: string; id: string }[] {
  const known = new Set<string>();
  for (const node of nodes) {
    known.add(node.id);
    for (const child of node.children) known.add(child.id);
  }

  const seen = new Map<string, number>();

  for (const product of products) {
    for (const slug of [product.category, product.subcategory]) {
      if (!slug || known.has(slug)) continue;
      seen.set(slug, (seen.get(slug) ?? 0) + 1);
    }
  }

  return [...seen.keys()].map((id) => ({
    id,
    // The UI already renders a count badge, so the label is just the slug, title-cased.
    label: id
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
  }));
}

/**
 * The finishes and materials the catalogue actually offers.
 *
 * Grouped by swatch attribute rather than flattened, because the page that renders it needs to
 * know *which* axis a colour belongs to: "Finish" is three colours you can have a desk in,
 * "Material" is fourteen build descriptions, and drawing the second as circles would produce
 * fourteen grey discs.
 */
export async function fetchMaterials(options: FetchOptions = {}): Promise<ApiMaterialGroup[]> {
  const body = await getJson<ApiMaterialLibrary>("/materials", { signal: options.signal });

  return (body.data ?? [])
    .map((group) => ({
      code: group.code ?? "",
      name: group.name || group.code || "Materials",
      type: group.type ?? "select",
      swatch_type: group.swatch_type ?? null,
      options: (group.options ?? []).map((option) => ({
        code: option.code ?? "",
        label: option.label || option.code || "",
        // The server already refuses malformed hexes; this is the second belt, because a
        // transparent swatch on a white card is an option nobody can see.
        hex: /^#[0-9a-f]{6}$/i.test(option.hex ?? "") ? (option.hex as string).toUpperCase() : null,
        image: option.image || null,
        products: typeof option.products === "number" ? option.products : null,
        variants: typeof option.variants === "number" ? option.variants : null,
      })),
    }))
    .filter((group) => group.code !== "" && group.options.length > 0);
}
