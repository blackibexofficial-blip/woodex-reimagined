/**
 * The catalogue as the storefront sees it.
 *
 * These are the shapes the components already render. They are deliberately *not* the shapes
 * the API speaks — the API returns minor units, slugs and snake_case, and translating that is
 * the job of `src/lib/api/catalog.ts`. Keeping one boundary means a component changed today
 * does not have to change again when the API's payload grows.
 */

export interface ProductColor {
  name: string;
  hex: string;
  image?: string;
}

export interface ProductSpecification {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  series?: string;
  /** Whole rupees. The API sends paisa; the adapter divides once, here. */
  price: number;
  originalPrice?: number;
  description: string;
  shortDescription: string;
  images: string[];
  colors: ProductColor[];
  specifications: ProductSpecification[];
  features: string[];
  inStock: boolean;
  isNew?: boolean;
  isBestSeller?: boolean;
  rating: number;
  reviews: number;
}

/** A row from `GET /products` — snake_case, integer minor units. */
export interface ApiProductCard {
  id: number;
  sku: string;
  slug: string;
  name: string;
  summary: string;
  category: string | null;
  category_slug: string | null;
  series: string | null;
  price_minor: number;
  price: string;
  compare_at_minor: number | null;
  compare_at: string | null;
  discount_bp: number;
  in_stock: boolean;
  available_qty: number;
  is_featured: boolean;
  rating: number | null;
  review_count: number;
  image: string | null;
  image_srcset: string | null;
  finishes: { code: string; label: string; hex: string | null }[];
  warranty_months: number;
  lead_time_days: number;
  url: string;
}

/** A row from `GET /products/{slug}` — the card, plus everything a product page renders. */
export interface ApiProductDetail extends ApiProductCard {
  product_id: number;
  description: string;
  category_slug: string | null;
  subcategory: string | null;
  images: string[];
  colors: { code: string; name: string; hex: string | null; image: string | null }[];
  specifications: { label: string; value: string }[];
  features: string[];
  materials: string[];
  customisable: boolean;
}

export interface ApiCollection<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    per_page: number;
    pages: number;
  };
}

export interface ApiCategoryNode {
  slug: string;
  name: string;
  count: number;
  children: { slug: string; name: string; count: number }[];
}

/** A navigation group rendered in the shop sidebar. */
export interface CategoryNode {
  label: string;
  id: string;
  children: { label: string; id: string }[];
}
