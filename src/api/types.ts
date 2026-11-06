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
  city: string;
  items: AdminOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  placedAt: string;      // ISO
  notes?: string;
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
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
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
}

/** The contract the admin panel implements against. Demo + Bagisto both satisfy this. */
export interface AdminApi {
  getDashboardStats(): Promise<DashboardStats>;
  getRevenueSeries(days: number): Promise<RevenuePoint[]>;

  listProducts(params?: ListParams & { category?: string; inStock?: boolean }): Promise<Paginated<AdminProduct>>;
  updateProduct(id: string, patch: Partial<Pick<AdminProduct, "name" | "price" | "compareAtPrice" | "inStock" | "stock" | "isBestSeller" | "stockStatus">>): Promise<AdminProduct | undefined>;

  listOrders(params?: ListParams & { status?: OrderStatus | "all" }): Promise<Paginated<AdminOrder>>;
  getOrder(id: string): Promise<AdminOrder | undefined>;
  updateOrderStatus(id: string, status: OrderStatus): Promise<AdminOrder | undefined>;

  listCustomers(params?: ListParams & { type?: "all" | "retail" | "business" }): Promise<Paginated<AdminCustomer>>;
  getCustomer(id: string): Promise<AdminCustomer | undefined>;

  listLeads(params?: ListParams & { type?: LeadType | "all"; status?: LeadStatus | "all" }): Promise<Paginated<AdminLead>>;
  updateLeadStatus(id: string, status: LeadStatus): Promise<AdminLead | undefined>;

  getSettings(): Promise<StoreSettings>;
  saveSettings(settings: StoreSettings): Promise<StoreSettings>;

  /** Catalogue taxonomy managed in the admin (demo-backed). */
  listCategories(): Promise<AdminCategory[]>;
  /** Creates a category; id is slugified from the name. */
  createCategory(input: { name: string; group: AdminCategory["group"] }): Promise<AdminCategory>;
  updateCategory(
    id: string,
    patch: Partial<Pick<AdminCategory, "name" | "group" | "visible">>,
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

  /** Media library — demo-backed, persisted in localStorage as data URLs (keep files small). */
  listMediaAssets(): Promise<AdminMediaAsset[]>;
  addMediaAsset(input: { name: string; url: string; mime: string; size: number }): Promise<AdminMediaAsset>;
  deleteMediaAsset(id: string): Promise<boolean>;

  /** Storefront → admin capture: creates an order (status "pending"). */
  createOrder(input: NewOrderInput): Promise<AdminOrder>;
  /** Storefront → admin capture: creates a lead in the quote/B2B pipeline. */
  createLead(input: NewLeadInput): Promise<AdminLead>;

  /** Demo mode only: wipe the local demo DB back to the seed. No-op on live backends. */
  resetDemoData(): Promise<void>;
}
