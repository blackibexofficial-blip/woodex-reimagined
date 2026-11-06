/**
 * WOODEX — admin domain types.
 *
 * One canonical shape used by every adapter (demo DB, Bagisto REST). The Bagisto
 * adapter maps wire payloads into these types, so the admin UI never cares which
 * backend answered.
 */

export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";
export type PaymentMethod = "cod" | "bank-transfer" | "easypaisa" | "jazzcash" | "card";
export type LeadType = "quote" | "b2b";
export type LeadStatus = "new" | "contacted" | "quoted" | "won" | "lost";
export type StockStatus = "in_stock" | "out_of_stock" | "made_to_order";
export type StockMovementType = "inbound" | "outbound" | "return" | "damage" | "adjustment";

export interface AdminOrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface AdminOrder {
  id: string;            // e.g. "WDX-1042"
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  /** Street address for fulfilment & the invoice (optional — legacy seeds lack it). */
  address?: string;
  /** Sales channel this order came through (admin-managed registry). */
  channelId?: string;
  city: string;
  items: AdminOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  placedAt: string;      // ISO
  notes?: string;
  /** Courier + consignment for the dispatch leg (admin-entered). */
  courierName?: string;
  trackingNumber?: string;
  /** Staff-only annotations — never shown on the storefront / invoice. */
  internalNotes?: string;
}

/** Lifecycle ledger — one entry per status transition/dispatch note. */
export interface AdminOrderEvent {
  id: string;
  orderId: string;            // e.g. "WDX-1042"
  fromStatus?: OrderStatus;   // undefined for a pure note
  toStatus?: OrderStatus;
  note?: string;
  createdAt: string;          // ISO
}

export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  type: "retail" | "business";
  company?: string;
  ordersCount: number;
  totalSpent: number;
  joinedAt: string;      // ISO
}

export interface AdminLead {
  id: string;
  type: LeadType;
  name: string;
  company?: string;
  email: string;
  phone: string;
  city?: string;
  summary: string;       // project/requirements snapshot
  value?: number;        // estimated order value (PKR)
  status: LeadStatus;
  createdAt: string;     // ISO
}

export interface AdminProduct {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  sku: string;
  price: number;
  compareAtPrice?: number;
  image?: string;
  inStock: boolean;
  stock: number;
  /** Fulfilment mode: sell from stock, blocked, or built to order. */
  stockStatus: StockStatus;
  isBestSeller: boolean;
  rating: number;
  reviews: number;
  /** Deterministic seed date — drives automatic "newest" collections. */
  createdAt?: string;
  /** Optional physical attributes (admin display + CSV round-trip). */
  dimensions?: string;
  weightKg?: number;
}

/* ── B2B price lists ("catalogs" — negotiated trade pricing) ──────────────── */

export interface AdminCompany {
  id: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  createdAt: string;
}

export type PriceListStatus = "draft" | "active" | "archived";
export type PriceListAudience = "all_b2b" | "companies";
/** Which catalogue slice the discount applies to. */
export type PriceListTarget = "all_products" | "categories";

export interface AdminPriceList {
  id: string;
  name: string;
  description?: string;
  status: PriceListStatus;
  audience: PriceListAudience;
  /** company ids — only when audience === "companies". */
  companyIds: string[];
  target: PriceListTarget;
  /** storefront category ids — only when target === "categories". */
  categoryIds: string[];
  /** 0–60, whole percent off the retail price. */
  discountPct: number;
  /** Optional validity window (ISO dates, inclusive). */
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NewAdminPriceListInput {
  name: string;
  description?: string;
  audience: PriceListAudience;
  companyIds?: string[];
  target: PriceListTarget;
  categoryIds?: string[];
  discountPct: number;
  startsAt?: string;
  endsAt?: string;
}

/* ── Bundles (merchandising) ───────────────────────────────────────────── */

export type BundleStatus = "draft" | "active" | "archived";

export interface AdminBundleLine {
  productId: string;
  quantity: number;
}

export interface AdminBundle {
  id: string;
  name: string;
  description?: string;
  status: BundleStatus;
  /** Image key resolved by the renderers (see src/lib/bundleImages.ts). */
  image: string;
  lines: AdminBundleLine[];
  /** Whole-percent off the catalogue sum — bundle price rounds to the nearest PKR 10. */
  discountPct: number;
  popular: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewAdminBundleInput {
  name: string;
  description?: string;
  image: string;
  lines: AdminBundleLine[];
  discountPct: number;
  popular?: boolean;
  sortOrder?: number;
}

/* ── Sales channels & markets ─────────────────────────────────────────── */

export type SalesChannelKind = "web" | "whatsapp" | "instagram" | "phone" | "showroom" | "b2b";

export interface AdminSalesChannel {
  id: string;
  name: string;
  kind: SalesChannelKind;
  description?: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewSalesChannelInput {
  name: string;
  kind: SalesChannelKind;
  description?: string;
  enabled?: boolean;
  sortOrder?: number;
}

export interface AdminShowroom {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  whatsapp?: string;
  hours: string;
  lat?: number;
  lng?: number;
  isHQ: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewShowroomInput {
  name: string;
  city: string;
  address: string;
  phone: string;
  whatsapp?: string;
  hours: string;
  lat?: number;
  lng?: number;
  isHQ?: boolean;
  active?: boolean;
  sortOrder?: number;
}

/* ── Materials & finishes (admin-managed since P1.2) ─────────────────────── */
export type AdminMaterialCategory = "wood" | "laminate" | "metal" | "fabric";
export type AdminMaterialBrightness = "light" | "medium" | "dark" | "all";
export type AdminMaterialPart = "worktop" | "frame" | "seating" | "panel" | "storage";

export interface AdminMaterial {
  id: string;
  name: string;
  category: AdminMaterialCategory;
  brightness: AdminMaterialBrightness;
  /** Image URL (bundled asset path or data URL). Undefined for pure-color swatches. */
  image?: string;
  /** Hex value used by color swatches on /materials. Undefined for image finishes. */
  hex?: string;
  /** Optional blurb (shown on /materials cards and in the configurator). */
  description?: string;
  /** Configurator applicability. Empty array = finish hidden from the room configurator. */
  applicableTo: AdminMaterialPart[];
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewMaterialInput {
  name: string;
  category: AdminMaterialCategory;
  brightness?: AdminMaterialBrightness;
  image?: string;
  hex?: string;
  description?: string;
  applicableTo?: AdminMaterialPart[];
  active?: boolean;
  sortOrder?: number;
}

export const MATERIAL_CATEGORY_LABELS: Record<AdminMaterialCategory, string> = {
  wood: "Wood Finishes",
  laminate: "Solid & Laminate",
  metal: "Metal Colors",
  fabric: "Fabric & Leather",
};

export const MATERIAL_PART_LABELS: Record<AdminMaterialPart, string> = {
  worktop: "Worktop",
  frame: "Frame",
  seating: "Seating",
  panel: "Panel",
  storage: "Storage",
};

/* ── Collections (merchandising) ────────────────────────────────────────── */


export type AdminCollectionKind = "manual" | "automatic";
export type AdminCollectionRule = "best_selling" | "price_asc" | "price_desc" | "on_sale" | "newest";

export const COLLECTION_RULE_LABELS: Record<AdminCollectionRule, string> = {
  best_selling: "Best selling",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  on_sale: "On sale",
  newest: "Date: newest first",
};

export interface AdminCollection {
  id: string;
  name: string;
  /** URL handle — unique, lowercase-hyphen. Consumed as /shop?collection=<handle>. */
  handle: string;
  description?: string;
  kind: AdminCollectionKind;
  /** Automatic rule; undefined for manual collections. */
  rule?: AdminCollectionRule;
  /** Hand-picked product ids; ignored for automatic rules. */
  productIds: string[];
  sortOrder: number;
  createdAt: string;
}

export interface NewAdminCollectionInput {
  name: string;
  handle?: string;
  description?: string;
  kind: AdminCollectionKind;
  rule?: AdminCollectionRule;
  productIds?: string[];
}

/** Input for creating a product from the admin panel. SKU/id are generated. */
export interface NewAdminProductInput {
  name: string;
  category: string;
  subcategory?: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  inStock?: boolean;
  stockStatus?: StockStatus;
  isBestSeller?: boolean;
  image?: string;
  dimensions?: string;
  weightKg?: number;
}

/** One validated CSV import row (upsert key = id, else sku). */
/** Bulk assortment edits — discriminated by `kind`, applied server-side in one pass. */
export type BulkProductPatch =
  | { kind: "pricePct"; pct: number; includeCompareAt?: boolean }
  | { kind: "stockStatus"; status: StockStatus }
  | { kind: "markOnSale"; pct: number }
  | { kind: "clearSale" }
  | { kind: "bestSeller"; value: boolean }
  | { kind: "stockDelta"; delta: number };

export interface ProductImportRow {
  id?: string;
  sku?: string;
  name: string;
  category?: string;
  subcategory?: string;
  price?: number;
  compareAtPrice?: number;
  stock?: number;
  inStock?: boolean;
  rating?: number;
  reviews?: number;
  stockStatus?: StockStatus;
  isBestSeller?: boolean;
  dimensions?: string;
  weightKg?: number;
}

export interface ProductImportResult {
  created: number;
  updated: number;
  skipped: number;
  /** 1-based data-row numbers (header excluded) + reason. */
  errors: { row: number; message: string }[];
}

/* ── Inventory & fulfilment ─────────────────────────────────────────────── */

export interface AdminInventoryItem {
  productId: string;
  name: string;
  sku: string;
  category: string;
  image?: string;
  quantity: number;
  lowStockThreshold: number;
  location: string;
  stockStatus: StockStatus;
  lastUpdated: string;   // ISO
}

export interface AdminStockMovement {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  type: StockMovementType;
  /** Signed delta actually applied to stock (already clamped at zero). */
  quantity: number;
  notes?: string;
  createdAt: string;     // ISO
}

export interface AdminDeliveryZone {
  id: string;
  zoneName: string;
  city: string;
  postalCodes: string[];
  standardCost: number;
  expressCost: number;
  sameDayCost: number;
  standardDays: number;
  expressDays: number;
  codAvailable: boolean;
  isActive: boolean;
  createdAt: string;     // ISO
  updatedAt: string;     // ISO
}

export interface DashboardStats {
  revenueToday: number;
  revenueMtd: number;
  ordersToday: number;
  ordersMtd: number;
  averageOrderValue: number;
  pendingOrders: number;
  newLeads: number;
  lowStockProducts: number;
}

export interface RevenuePoint {
  label: string;   // e.g. "Oct 12"
  revenue: number;
  orders: number;
}

export interface AdminCategory {
  id: string;            // slug, e.g. "executive-tables"
  name: string;          // display name (no tree glyphs)
  group: "office" | "home" | "ungrouped";
  /** Parent for nested display. Omitted = top level. "" sent in patches clears it back to root. */
  parentId?: string;
  /** Display order among siblings; lower first. Absent = alphabetical fallback. */
  sortOrder?: number;
  visible: boolean;
  /** Filled in by adapters that can compute it (demo). Omitted otherwise. */
  productCount?: number;
  createdAt: string;     // ISO
}

export interface AdminMediaAsset {
  id: string;
  name: string;          // e.g. "executive-desk-hero.webp"
  url: string;           // asset path or data: URL (demo uploads)
  mime: string;          // e.g. "image/jpeg"
  size: number;          // bytes (approximate for seeded catalogue imagery)
  createdAt: string;     // ISO
  /** Logical folder (free-form, e.g. "Products", "Showroom"). Undefined = Unsorted. */
  folder?: string;
  /** Alt text for accessibility — used when this asset is shown on the storefront. */
  alt?: string;
}

export interface StoreSettings {
  storeName: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  currency: string;
  deliveryNote: string;
  taxRate: number; // percent
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
}

export interface NewOrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

/** Payload from the storefront checkout → creates the order the admin sees. */
export interface NewOrderInput {
  /** Sales channel attribution — "ch-web" for storefront orders. */
  channelId?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  address?: string;
  city: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  items: NewOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
}

/** Payload from storefront forms (quotation, contact) → creates a lead in the pipeline. */
export interface NewLeadInput {
  type: LeadType;
  name: string;
  company?: string;
  email?: string;
  phone: string;
  city?: string;
  summary: string;
  value?: number;
}

export interface ListParams {
  query?: string;
  page?: number;
  perPage?: number;
  /** Newest-first is the server default; admin table can request a sorted page. */
  sort?: "name" | "price" | "stock" | "rating" | "reviews";
  direction?: "asc" | "desc";
}

/** The contract the admin panel implements against. Demo + Bagisto both satisfy this. */
export interface AdminApi {
  getDashboardStats(): Promise<DashboardStats>;
  getRevenueSeries(days: number): Promise<RevenuePoint[]>;

  listProducts(params?: ListParams & { category?: string; inStock?: boolean }): Promise<Paginated<AdminProduct>>;
  updateProduct(id: string, patch: Partial<Pick<AdminProduct, "name" | "price" | "compareAtPrice" | "inStock" | "stock" | "isBestSeller" | "stockStatus" | "category" | "dimensions" | "weightKg">>): Promise<AdminProduct | undefined>;
  /** Applies one bulk patch to many products atomically-ish (single persisted pass). */
  bulkUpdateProducts(ids: string[], patch: BulkProductPatch): Promise<{ updated: number }>;
  /** Create a product (demo: local catalogue insert; bagisto: POST, unverified). SKU auto-assigned. */
  createProduct(input: NewAdminProductInput): Promise<AdminProduct>;
  /** Clone a product as "<name> (Copy)" with a fresh SKU; copy lands out of stock. */
  duplicateProduct(id: string): Promise<AdminProduct | undefined>;
  /** Delete a product (inventory ledger history is kept; product's stock row is removed). */
  deleteProduct(id: string): Promise<boolean>;
  /** Upsert catalogue rows (match by id, else sku). Creates with defaults when the match fails. */
  importProductsCsv(rows: ProductImportRow[]): Promise<ProductImportResult>;

  listOrders(params?: ListParams & { status?: OrderStatus | "all" }): Promise<Paginated<AdminOrder>>;
  getOrder(id: string): Promise<AdminOrder | undefined>;
  /**
   * Transitions status. Side effects (demo): records an order event; transition → "shipped"
   * deducts item quantities from stock (clamped ≥0) with outbound movements referencing the
   * order; transition → "cancelled" restocks only when this order was previously shipped
   * (detected via the events ledger). Courier/tracking/note are stored on the order.
   */
  updateOrderStatus(id: string, status: OrderStatus, options?: { courierName?: string; trackingNumber?: string; internalNote?: string }): Promise<AdminOrder | undefined>;
  /** Courier/consignment/internal-notes update without a status change. */
  updateOrderCourier(id: string, patch: Partial<Pick<AdminOrder, "courierName" | "trackingNumber" | "internalNotes">>): Promise<AdminOrder | undefined>;
  /** Lifecycle ledger for one order, oldest first. */
  getOrderEvents(orderId: string): Promise<AdminOrderEvent[]>;

  listCustomers(params?: ListParams & { type?: "all" | "retail" | "business" }): Promise<Paginated<AdminCustomer>>;
  getCustomer(id: string): Promise<AdminCustomer | undefined>;

  listLeads(params?: ListParams & { type?: LeadType | "all"; status?: LeadStatus | "all" }): Promise<Paginated<AdminLead>>;
  updateLeadStatus(id: string, status: LeadStatus): Promise<AdminLead | undefined>;

  getSettings(): Promise<StoreSettings>;
  saveSettings(settings: StoreSettings): Promise<StoreSettings>;

  /** Catalogue taxonomy managed in the admin (demo-backed). */
  listCompanies(): Promise<AdminCompany[]>;
  listPriceLists(): Promise<AdminPriceList[]>;
  createPriceList(input: NewAdminPriceListInput): Promise<AdminPriceList>;
  updatePriceList(id: string, patch: Partial<NewAdminPriceListInput>): Promise<AdminPriceList | undefined>;
  setPriceListStatus(id: string, status: PriceListStatus): Promise<AdminPriceList | undefined>;
  deletePriceList(id: string): Promise<boolean>;

  listBundles(): Promise<AdminBundle[]>;
  createBundle(input: NewAdminBundleInput): Promise<AdminBundle>;
  updateBundle(id: string, patch: Partial<NewAdminBundleInput>): Promise<AdminBundle | undefined>;
  setBundleStatus(id: string, status: BundleStatus): Promise<AdminBundle | undefined>;
  deleteBundle(id: string): Promise<boolean>;

  listSalesChannels(): Promise<AdminSalesChannel[]>;
  createSalesChannel(input: NewSalesChannelInput): Promise<AdminSalesChannel>;
  updateSalesChannel(id: string, patch: Partial<NewSalesChannelInput>): Promise<AdminSalesChannel | undefined>;
  setSalesChannelEnabled(id: string, enabled: boolean): Promise<AdminSalesChannel | undefined>;
  deleteSalesChannel(id: string): Promise<boolean>;
  /** Attribution for non-cancelled orders, grouped by channel. */
  getChannelSales(): Promise<Array<{ channelId: string; orders: number; revenue: number }>>;
  listShowrooms(): Promise<AdminShowroom[]>;
  createShowroom(input: NewShowroomInput): Promise<AdminShowroom>;
  updateShowroom(id: string, patch: Partial<NewShowroomInput>): Promise<AdminShowroom | undefined>;
  setShowroomActive(id: string, active: boolean): Promise<AdminShowroom | undefined>;
  deleteShowroom(id: string): Promise<boolean>;
  listMaterials(): Promise<AdminMaterial[]>;
  createMaterial(input: NewMaterialInput): Promise<AdminMaterial>;
  updateMaterial(id: string, patch: Partial<NewMaterialInput>): Promise<AdminMaterial | undefined>;
  setMaterialActive(id: string, active: boolean): Promise<AdminMaterial | undefined>;
  deleteMaterial(id: string): Promise<boolean>;

  listCollections(): Promise<AdminCollection[]>;
  /** Resolves a collection's member products (rule resolved live for automatic collections). */
  listCollectionProducts(id: string): Promise<AdminProduct[]>;
  createCollection(input: NewAdminCollectionInput): Promise<AdminCollection>;
  updateCollection(id: string, patch: Partial<Pick<AdminCollection, "name" | "handle" | "description" | "kind" | "rule" | "productIds" | "sortOrder">>): Promise<AdminCollection | undefined>;
  deleteCollection(id: string): Promise<boolean>;

  listCategories(): Promise<AdminCategory[]>;
  /** Creates a category; id is slugified from the name. */
  createCategory(input: { name: string; group: AdminCategory["group"]; parentId?: string }): Promise<AdminCategory>;
  updateCategory(
    id: string,
    patch: Partial<Pick<AdminCategory, "name" | "group" | "visible" | "parentId" | "sortOrder">>,
  ): Promise<AdminCategory | undefined>;
  /** Refuses (returns ok:false + reason) while products still reference the category. */
  deleteCategory(id: string): Promise<{ ok: boolean; error?: string }>;

  /* Inventory & fulfilment */
  /** All catalogue products joined with their stock metadata, worst-stocked first. */
  listInventory(params?: ListParams & { filter?: "all" | "in" | "low" | "out" | "made_to_order" }): Promise<AdminInventoryItem[]>;
  /**
   * Applies a stock delta and records an audit movement.
   * For `adjustment`, `quantity` is taken as-is (may be negative); otherwise the
   * type implies the sign (inbound/return +, outbound/damage −) and the magnitude
   * (absolute value) is used. Clamps at zero and records the *applied* delta.
   */
  adjustStock(input: { productId: string; type: StockMovementType; quantity: number; notes?: string }): Promise<{ item: AdminInventoryItem; movement: AdminStockMovement } | undefined>;
  listStockMovements(params?: { productId?: string; limit?: number }): Promise<AdminStockMovement[]>;

  /* Delivery zones — base/express/same-day costs + COD, demo-backed until Bagisto WMS wiring */
  listDeliveryZones(): Promise<AdminDeliveryZone[]>;
  /** Creates a zone when `id` is omitted; otherwise updates the existing zone. */
  saveDeliveryZone(input: Omit<AdminDeliveryZone, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<AdminDeliveryZone>;
  deleteDeliveryZone(id: string): Promise<boolean>;

  /** Media library — demo: IndexedDB (data URLs OK); bagisto: NOT wired (501) — use Bagisto Media Assets when provisioned. */
  listMediaAssets(): Promise<AdminMediaAsset[]>;
  addMediaAsset(input: { name: string; url: string; mime: string; size: number; folder?: string; alt?: string }): Promise<AdminMediaAsset>;
  deleteMediaAsset(id: string): Promise<boolean>;
  /** Rename / change folder / alt text. Returns the updated asset. */
  updateMediaAsset(id: string, patch: Partial<Pick<AdminMediaAsset, "name" | "folder" | "alt">>): Promise<AdminMediaAsset | undefined>;
  /** Deletes many assets at once; returns the number actually removed. */
  bulkDeleteMediaAssets(ids: string[]): Promise<number>;
  /** Moves assets into a folder (undefined = Unsorted); returns the number moved. */
  moveMediaAssets(ids: string[], folder: string | undefined): Promise<number>;
  /** Points the product's image at this asset; returns false when either side is unknown. */
  assignMediaToProduct(assetId: string, productId: string): Promise<boolean>;

  /** Storefront → admin capture: creates an order (status "pending"). */
  createOrder(input: NewOrderInput): Promise<AdminOrder>;
  /** Storefront → admin capture: creates a lead in the quote/B2B pipeline. */
  createLead(input: NewLeadInput): Promise<AdminLead>;

  /** Demo mode only: wipe the local demo DB back to the seed. No-op on live backends. */
  resetDemoData(): Promise<void>;
}
