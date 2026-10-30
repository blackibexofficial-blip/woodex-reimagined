import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import { fetchAllProducts, fetchProduct, fetchProductPage, toProduct } from "@/lib/api/catalog";
import { getCategoryImages, products as snapshotProducts } from "@/data/products";
import type { Product } from "@/lib/api/types";

/**
 * Where the product in hand came from.
 *
 * The storefront has to work in two places: on Hostinger, where Laravel is one folder away
 * and `/api/storefront/v1` answers in milliseconds, and in a build preview or an offline
 * demo, where there is no PHP at all. Rather than pretend the second case does not exist,
 * the first render always uses the bundled snapshot and the API replaces it as soon as it
 * answers. A visitor never sees a spinner where a product grid should be.
 */
export type CatalogSource = "api" | "snapshot";

const ADAPTER = { fallbackImages: getCategoryImages };

/**
 * Skip the network entirely and render the bundled catalogue.
 *
 * For design reviews and previews with no backend behind them. Without it, the app still
 * works — the fetch fails in three seconds and the snapshot takes over — but that is three
 * seconds of a shop that looks like it is thinking.
 */
export const CATALOG_OFFLINE = ["1", "true"].includes(
  String(import.meta.env.VITE_CATALOG_OFFLINE ?? "").toLowerCase(),
);

const QUERY = {
  staleTime: 5 * 60_000,
  // One attempt, then degrade. A shared-host PHP worker that is out of capacity hangs until
  // the proxy times out; retrying three times turns a two-second stall into six.
  retry: 0,
  refetchOnWindowFocus: false,
} as const;

export interface CatalogResult {
  products: Product[];
  source: CatalogSource;
  /** True while a background refresh is in flight — safe to ignore in the UI. */
  isRefreshing: boolean;
  error: ApiError | null;
}

/** The whole published catalogue, filtered client-side by the shop. */
export function useCatalogProducts(): CatalogResult {
  const query = useQuery({
    queryKey: ["catalog", "products"],
    queryFn: ({ signal }) => fetchAllProducts({ signal }),
    enabled: !CATALOG_OFFLINE,
    ...QUERY,
  });

  // A successful empty answer is an answer: the catalogue is empty, and showing 148
  // snapshot products that cannot be ordered would be a lie. Only a failure degrades.
  const live =
    !CATALOG_OFFLINE && query.isSuccess ? query.data.map((row) => toProduct(row, ADAPTER)) : null;

  return {
    products: live ?? snapshotProducts,
    source: live === null ? "snapshot" : "api",
    isRefreshing: query.isFetching,
    error: query.error instanceof ApiError ? query.error : null,
  };
}

export interface ProductResult {
  product: Product | undefined;
  source: CatalogSource;
  isLoading: boolean;
  /** The API answered 404: the product is genuinely not in the catalogue. */
  notFound: boolean;
  error: ApiError | null;
}

/** One product by slug, degrading to the snapshot only when the API is unreachable. */
export function useProduct(slug: string | undefined): ProductResult {
  const query = useQuery({
    queryKey: ["catalog", "product", slug],
    queryFn: ({ signal }) => fetchProduct(slug as string, { signal }),
    enabled: Boolean(slug) && !CATALOG_OFFLINE,
    ...QUERY,
  });

  const error = query.error instanceof ApiError ? query.error : null;
  const unreachable = error !== null && (error.isNetworkFailure || error.status >= 500);

  const product = query.data
    ? toProduct(query.data, ADAPTER)
    : unreachable
      ? snapshotProducts.find((candidate) => candidate.id === slug)
      : undefined;

  return {
    product,
    source: query.data ? "api" : "snapshot",
    // Only a live lookup is "loading" — the snapshot answers synchronously, so a page that
    // could render never shows a skeleton.
    isLoading: query.isPending && query.fetchStatus === "fetching",
    notFound: error?.isNotFound ?? false,
    error,
  };
}

/**
 * Up to `limit` other products in the same category.
 *
 * Filtered on the server (`?category=…`) rather than by fetching the catalogue and slicing
 * it: a product page should cost one request to the catalog API, not five. Related products
 * are decoration, so if the request fails the section simply does not render.
 */
export function useRelatedProducts(
  category: string | undefined,
  excludeId: string | undefined,
  limit = 4,
): Product[] {
  const query = useQuery({
    queryKey: ["catalog", "related", category, limit],
    queryFn: ({ signal }) =>
      fetchProductPage({ category, perPage: limit + 1, signal }),
    enabled: Boolean(category) && !CATALOG_OFFLINE,
    ...QUERY,
  });

  if (!query.isSuccess) return [];

  return query.data.data
    .map((row) => toProduct(row, ADAPTER))
    .filter((product) => product.id !== excludeId)
    .slice(0, limit);
}
