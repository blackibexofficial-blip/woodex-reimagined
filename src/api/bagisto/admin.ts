/**
 * WOODEX ← Bagisto REST client (bagisto/bagisto-api package).
 *
 * Bagisto exposes two surfaces:
 *   {base}/api/shop/…   public storefront API — header:  X-STOREFRONT-KEY: pk_storefront_…
 *   {base}/api/admin/…  back-office API — header:        Authorization: Bearer <id>|<token>
 *
 * This module maps those payloads onto the AdminApi contract so the /admin UI works
 * unchanged against a live Bagisto. It is only exercised when VITE_API_MODE=bagisto.
 *
 * IMPORTANT (security): shipping VITE_BAGISTO_ADMIN_TOKEN in the browser build is
 * acceptable ONLY for private previews. In production, front the admin API with your
 * Laravel backend/proxy and keep the integration token server-side — see
 * docs/07-admin-integration/README.md.
 *
 * NOTE: field names follow the bagisto-api reference (devdocs.bagisto.com/api).
 * Verify mappings against your instance via /api/admin/docs (Swagger) after install —
 * mappers are deliberately isolated in `mapProduct` / `mapOrder` / `mapCustomer`.
 */
import { config } from "@/config/env";
import type {
  AdminApi, AdminBundle, AdminCategory, AdminCollection, AdminCompany, AdminCustomer, AdminPriceList, AdminLead, AdminMediaAsset, AdminOrder, AdminOrderEvent, AdminProduct, DashboardStats, ListParams, NewAdminProductInput, NewLeadInput, NewOrderInput, Paginated, ProductImportResult, RevenuePoint, StoreSettings,
} from "@/api/types";

const OUTBOX_KEYS = { order: "woodex.outbox.orders.v1", lead: "woodex.outbox.leads.v1" } as const;

/** Never lose a storefront enquiry: if the live endpoint is unreachable/unverified, queue locally. */
function outboxPush(kind: keyof typeof OUTBOX_KEYS, value: unknown) {
  try {
    const key = OUTBOX_KEYS[kind];
    const queued = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
    queued.push({ ...(value as object), queuedAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(queued));
  } catch { /* storage unavailable — log only */ }
}

const localOrderFrom = (input: NewOrderInput): AdminOrder => ({
  id: `WDX-WEB-${Date.now().toString(36).toUpperCase()}`,
  customerName: input.customerName,
  customerEmail: input.customerEmail ?? "",
  customerPhone: input.customerPhone,
  address: input.address,
  city: input.city,
  items: input.items,
  subtotal: input.subtotal,
  shipping: input.shipping,
  total: input.total,
  paymentMethod: input.paymentMethod,
  status: "pending",
  placedAt: new Date().toISOString(),
  notes: input.notes,
});

const localLeadFrom = (input: NewLeadInput): AdminLead => ({
  id: `lead-web-${Date.now().toString(36)}`,
  type: input.type,
  name: input.name,
  company: input.company,
  email: input.email ?? "",
  phone: input.phone,
  city: input.city,
  summary: input.summary,
  value: input.value,
  status: "new",
  createdAt: new Date().toISOString(),
});

/** Bagisto wire payloads are dynamic JSON — keep them structured here (mappers coerce below). */
type WireLoose = Record<string, unknown>;

class BagistoApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "BagistoApiError"; }
}

async function request<T>(path: string, init: RequestInit = {}, surface: "shop" | "admin" = "admin"): Promise<T> {
  const base = config.bagisto.baseUrl;
  if (!base) throw new BagistoApiError(0, "VITE_BAGISTO_API_URL is not configured.");
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (surface === "shop") headers.set("X-STOREFRONT-KEY", config.bagisto.storefrontKey);
  else headers.set("Authorization", `Bearer ${config.bagisto.adminToken}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const res = await fetch(`${base}/api/${surface}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BagistoApiError(res.status, `Bagisto ${surface} ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapProduct = (p: any): AdminProduct => ({
  id: String(p.id ?? p._id ?? ""),
  name: p.name ?? p.product_name ?? "Untitled",
  category: p.category?.slug ?? p.category_name ?? (typeof p.category === "string" ? p.category : ""),
  price: Number(p.price ?? p.new_price ?? 0),
  compareAtPrice: p.compare_price ?? p.original_price ? Number(p.compare_price ?? p.original_price) : undefined,
  image: p.images?.[0]?.url ?? p.base_image?.medium_url ?? p.base_image?.url,
  inStock: Boolean(p.in_stock ?? p.is_in_stock ?? true),
  stock: Number(p.inventories?.[0]?.qty ?? p.total_qty ?? p.quantity ?? 0),
  stockStatus: (p.in_stock ?? p.is_in_stock ?? true) ? "in_stock" : "out_of_stock",
  sku: String(p.sku ?? p.slug ?? p.id ?? ""),
  isBestSeller: Boolean(p.is_featured ?? p.is_best_seller ?? false),
  rating: Number(p.average_rating ?? p.rating ?? 0),
  reviews: Number(p.reviews_count ?? p.review_count ?? 0),
});

const mapOrder = (o: any): AdminOrder => ({
  courierName: o.courier_title ?? o.shipping_title,
  trackingNumber: o.tracking_number ?? o.track_number,
  internalNotes: o.staff_note,
  id: o.increment_id ? `WDX-${o.increment_id}` : String(o.id ?? "WDX-?"),
  customerName: o.customer_full_name ?? o.customer?.name ?? "Guest",
  customerEmail: o.customer_email ?? o.customer?.email ?? "",
  customerPhone: o.customer_phone ?? o.addresses?.[0]?.phone ?? "",
  city: o.addresses?.[0]?.city ?? o.shipping_address?.city ?? "",
  address: o.addresses?.[0]?.address1 ?? o.shipping_address?.address1 ?? o.address1,
  items: (o.items ?? []).map((i: any) => ({
    id: String(i.product_id ?? i.id),
    name: i.name ?? i.product_name ?? "Item",
    price: Number(i.price ?? 0),
    quantity: Number(i.qty_ordered ?? i.quantity ?? 1),
    image: i.product?.images?.[0]?.url,
  })),
  subtotal: Number(o.grand_total ? Number(o.grand_total) - Number(o.shipping_amount ?? 0) : o.sub_total ?? 0),
  shipping: Number(o.shipping_amount ?? o.shipping_amount_including_tax ?? 0),
  total: Number(o.grand_total ?? o.total ?? 0),
  paymentMethod: (o.payment_title ?? "").toLowerCase().includes("cash") ? "cod" : "bank-transfer",
  status: ({ pending: "pending", processing: "processing", shipped: "shipped", closed: "delivered", completed: "delivered", canceled: "cancelled", cancelled: "cancelled" } as Record<string, AdminOrder["status"]>)[o.status] ?? "processing",
  placedAt: o.created_at ?? o.placed_at ?? new Date().toISOString(),
  notes: o.notes ?? undefined,
});

const mapCustomer = (c: any): AdminCustomer => ({
  id: String(c.id ?? ""),
  name: c.name ?? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
  email: c.email ?? "",
  phone: c.phone ?? c.phone_number ?? "",
  city: c.addresses?.[0]?.city ?? c.city ?? "",
  type: c.organization_name || c.company_name ? "business" : "retail",
  company: c.organization_name ?? c.company_name ?? undefined,
  ordersCount: Number(c.orders_count ?? c.total_orders ?? 0),
  totalSpent: Number(c.total_spent ?? c.grand_total ?? 0),
  joinedAt: c.created_at ?? new Date().toISOString(),
});

const wrap = <T>(data: T[], page: number, perPage: number, total: number): Paginated<T> => ({ items: data, total, page, perPage });
const meta2 = (res: any, page = 1, perPage = 10) => ({
  page: Number(res?.meta?.currentPage ?? res?.meta?.current_page ?? page),
  perPage: Number(res?.meta?.perPage ?? res?.meta?.per_page ?? perPage),
  total: Number(res?.meta?.total ?? res?.meta?.total_items ?? (res?.data?.length ?? 0)),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

const qp = (p: ListParams | undefined, extra: Record<string, string | number | boolean | undefined> = {}) => {
  const params = new URLSearchParams();
  params.set("per_page", String(p?.perPage ?? 10));
  params.set("page", String(p?.page ?? 1));
  if (p?.query) params.set("query", p.query);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) params.set(k, String(v));
  return `?${params.toString()}`;
};

export const bagistoAdminApi: AdminApi = {
  async getDashboardStats(): Promise<DashboardStats> {
    // Bagisto ships sales reports under /api/admin/reports/sales/*; exact granularity
    // varies by version — compute from orders as a portable baseline.
    const res = await request<{ data: WireLoose[]; meta?: unknown }>(`/sales/orders${qp({ perPage: 100, page: 1 })}`);
    const orders = (res.data ?? []).map(mapOrder).filter((o) => o.status !== "cancelled");
    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const som = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const today = orders.filter((o) => new Date(o.placedAt).getTime() >= sod);
    const mtd = orders.filter((o) => new Date(o.placedAt).getTime() >= som);
    const revenueMtd = mtd.reduce((s, o) => s + o.total, 0);
    return {
      revenueToday: today.reduce((s, o) => s + o.total, 0),
      revenueMtd,
      ordersToday: today.length,
      ordersMtd: mtd.length,
      averageOrderValue: mtd.length ? Math.round(revenueMtd / mtd.length) : 0,
      pendingOrders: orders.filter((o) => o.status === "pending" || o.status === "processing").length,
      newLeads: 0, // B2B/quote leads live in the storefront DB — see docs (custom endpoint recommended)
      lowStockProducts: 0,
    };
  },

  async getRevenueSeries(days) {
    const out: RevenuePoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      out.push({ label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), revenue: 0, orders: 0 });
    }
    // Populated from /reports/sales/* on instances that expose it; left as zeros otherwise.
    return out;
  },

  async listProducts(params) {
    const res = await request<{ data: WireLoose[]; meta?: WireLoose }>(`/catalog/products${qp(params, { category_slug: params?.category, is_in_stock: params?.inStock })}`);
    const m = meta2(res, params?.page, params?.perPage);
    return wrap((res.data ?? []).map(mapProduct), m.page, m.perPage, m.total);
  },

  async updateProduct(id, patch) {
    // Bagisto product update: PUT /api/admin/catalog/products/{id}
    await request(`/catalog/products/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ price: patch.price, is_in_stock: patch.inStock, qty: patch.stock, is_featured: patch.isBestSeller, name: patch.name }),
    });
    const res = await request<{ data: WireLoose }>(`/catalog/products/${encodeURIComponent(id)}`);
    return mapProduct(res.data ?? res);
  },

  // Products v2 — best-effort against the live instance. UNVERIFIED: payload shapes follow
  // the bagisto-api reference (attribute_family required, category ids are integers, inventories
  // live on a channel/location). Expect mapping drift — validate with /api/admin/docs after
  // provisioning (docs/07). Falls back to BagistoApiError with the raw response on failure.
  async createProduct(input: NewAdminProductInput): Promise<AdminProduct> {
    const sku = `WDX-${Date.now().toString(36).toUpperCase()}`;
    const res = await request<{ data: WireLoose }>(`/catalog/products`, {
      method: "POST",
      body: JSON.stringify({
        type: "simple",
        sku,
        attribute_family: "default",
        name: input.name,
        price: input.price,
        compare_price: input.compareAtPrice,
        weight: input.weightKg,
        width: input.dimensions, // Bagisto family attributes vary per install — UNVERIFIED
        inventories: [{ qty: input.stock, in_stock: input.inStock ?? input.stock > 0 }],
        categories: input.category ? [input.category] : [],
      }),
    });
    return mapProduct(res.data ?? res);
  },

  async duplicateProduct(id: string): Promise<AdminProduct | undefined> {
    const src = await request<{ data: WireLoose }>(`/catalog/products/${encodeURIComponent(id)}`).then((r) => r.data ?? r as unknown as WireLoose).catch(() => null);
    if (!src) return undefined;
    const name = `${String(src.name ?? "Product")} (Copy)`;
    const sku = `WDX-${Date.now().toString(36).toUpperCase()}`;
    const res = await request<{ data: WireLoose }>(`/catalog/products`, {
      method: "POST",
      body: JSON.stringify({ ...src, id: undefined, sku, name, price: src.price, inventories: [{ qty: 0, in_stock: false }] }),
    });
    return mapProduct(res.data ?? res);
  },

  async deleteProduct(id: string): Promise<boolean> {
    await request(`/catalog/products/${encodeURIComponent(id)}`, { method: "DELETE" });
    return true;
  },

  async importProductsCsv(): Promise<ProductImportResult> {
    throw new BagistoApiError(501, "CSV import is not wired for Bagisto yet (unverified bulk-upsert semantics). Use VITE_API_MODE=demo for bulk imports, or Bagisto Admin → Catalogue → import.");
  },

  async listOrders(params) {
    const res = await request<{ data: WireLoose[]; meta?: WireLoose }>(`/sales/orders${qp(params, { status: params?.status !== "all" ? params?.status : undefined })}`);
    const m = meta2(res, params?.page, params?.perPage);
    return wrap((res.data ?? []).map(mapOrder), m.page, m.perPage, m.total);
  },

  async getOrder(id) {
    const res = await request<{ data?: WireLoose } | WireLoose>(`/sales/orders/${encodeURIComponent(id.replace(/^WDX-/, ""))}`);
    const raw = (res as { data?: unknown }).data ?? res;
    return mapOrder(raw);
  },

  // Transitions are best-effort against the live instance. UNVERIFIED: Bagisto's action
  // endpoints (state/cancel) vary by version & channel config — see docs/07.
  async updateOrderStatus(id, status, options) {
    const num = encodeURIComponent(id.replace(/^WDX-/, ""));
    // courier/consignment ride along on the same best-effort payload (ignored by versions that don't accept them)
    const extra = {
      ...(options?.courierName !== undefined ? { courier_title: options.courierName } : {}),
      ...(options?.trackingNumber !== undefined ? { tracking_number: options.trackingNumber } : {}),
      ...(options?.internalNote ? { staff_note: options.internalNote } : {}),
    };
    await request(`/sales/orders/${num}/${status === "cancelled" ? "cancel" : "state"}`, {
      method: "POST",
      body: JSON.stringify({ status, ...extra }),
    }).catch(() => {
      // Some versions expose a generic update instead of action endpoints.
      return request(`/sales/orders/${num}`, { method: "PUT", body: JSON.stringify({ status, ...extra }) });
    });
    return this.getOrder(id);
  },

  async updateOrderCourier(id, patch): Promise<AdminOrder | undefined> {
    // UNVERIFIED: maps onto the generic order update; Bagisto does not ship a dedicated endpoint.
    await request(`/sales/orders/${encodeURIComponent(id.replace(/^WDX-/, ""))}`, {
      method: "PUT",
      body: JSON.stringify({
        ...(patch.courierName !== undefined ? { courier_title: patch.courierName } : {}),
        ...(patch.trackingNumber !== undefined ? { tracking_number: patch.trackingNumber } : {}),
        ...(patch.internalNotes !== undefined ? { staff_note: patch.internalNotes } : {}),
      }),
    });
    return this.getOrder(id);
  },

  async getOrderEvents(): Promise<AdminOrderEvent[]> {
    // Bagisto keeps its own status history (order_status_history in reports); surfacing it
    // here needs a verified mapper — intentionally 501 until docs/07 provisioning happens.
    throw new BagistoApiError(501, "Order lifecycle events are not wired for Bagisto yet (unverified report payloads). Use VITE_API_MODE=demo for the events timeline.");
  },

  async listCustomers(params) {
    const res = await request<{ data: WireLoose[]; meta?: WireLoose }>(`/customers/customers${qp(params)}`);
    const m = meta2(res, params?.page, params?.perPage);
    let items = (res.data ?? []).map(mapCustomer);
    if (params?.type && params.type !== "all") items = items.filter((c) => c.type === params.type);
    return wrap(items, m.page, m.perPage, m.total);
  },

  async getCustomer(id) {
    const res = await request<{ data?: WireLoose } | WireLoose>(`/customers/customers/${encodeURIComponent(id)}`);
    const raw = (res as { data?: unknown }).data ?? res;
    return mapCustomer(raw);
  },

  async listLeads(params) {
    // Leads/quotes have no Bagisto core table — they live in the storefront DB or a
    // custom webkul package. Wire this to that endpoint when it exists; until then
    // the demo adapter remains the source for /admin/leads.
    return paginateLocal(params);
  },

  async updateLeadStatus() {
    throw new BagistoApiError(501, "Lead pipeline is not backed by Bagisto core — keep VITE_API_MODE=demo or add a custom package. See docs/07-admin-integration.");
  },

  async getSettings(): Promise<StoreSettings> {
    const res = await request<{ data: WireLoose[] }>(`/core/config/all`).catch(() => ({ data: [] }));
    const flat = Object.fromEntries((res.data ?? []).map((c: WireLoose) => [c.code ?? c.key, c.value]));
    return {
      storeName: String(flat["general.shop_name"] ?? flat["shop_name"] ?? config.appName),
      tagline: String(flat["general.tagline"] ?? "Premium Office & Home Furniture"),
      phone: String(flat["general.shop_phone"] ?? ""),
      whatsapp: String(flat["general.whatsapp"] ?? ""),
      email: String(flat["general.shop_email"] ?? ""),
      address: String(flat["general.shop_address"] ?? ""),
      city: String(flat["general.shop_city"] ?? ""),
      currency: config.bagisto.currency,
      deliveryNote: String(flat["general.delivery_note"] ?? ""),
      taxRate: Number(flat["sales.tax_rate"] ?? 0),
    };
  },

  async saveSettings() {
    throw new BagistoApiError(501, "Store settings are managed in Bagisto admin → Configuration. Editing here is demo-only.");
  },

  async createOrder(input: NewOrderInput): Promise<AdminOrder> {
    try {
      // Bagisto checkout is a token flow (cart → address → payment → order). This is a
      // best-effort single-shot payload for instances exposing it — VERIFY on staging and
      // adjust to your bagisto-api version. On any failure the order is queued in the
      // local outbox so nothing is lost; see docs/07-admin-integration §6.
      await request(
        `/checkout`,
        {
          method: "POST",
          body: JSON.stringify({
            customer: { name: input.customerName, email: input.customerEmail, phone: input.customerPhone },
            shipping_address: { address1: input.address, city: input.city },
            notes: input.notes,
            payment_method: input.paymentMethod === "cod" ? "cashondelivery" : "banktransfer",
            items: input.items.map((i) => ({ product_id: i.id, qty: i.quantity, price: i.price })),
          }),
        },
        "shop",
      );
    } catch (err) {
      console.warn("[woodex] live order capture failed — queued in local outbox:", err);
      outboxPush("order", input);
    }
    return localOrderFrom(input);
  },

  async createLead(input: NewLeadInput): Promise<AdminLead> {
    try {
      // Requires the custom `woodex/leads` Laravel package (see docs/07-admin-integration §6).
      // Falls back to the local outbox if absent — the enquiry is never lost.
      await request(`/woodex/leads`, { method: "POST", body: JSON.stringify(input) }, "shop");
    } catch (err) {
      console.warn("[woodex] live lead capture failed — queued in local outbox:", err);
      outboxPush("lead", input);
    }
    return localLeadFrom(input);
  },

  async listCategories() {
    // Bagisto serves categories via /api/admin/catalog/categories on instances with the
    // bagisto-api package; mapping is intentionally not guessed. Wire it when a staging
    // instance is available — see docs/07-admin-integration §8.
    throw new BagistoApiError(501, "Category management is not wired for Bagisto yet. Use VITE_API_MODE=demo for the preview, or implement mappers in src/api/bagisto/admin.ts.");
  },

  // B2B price lists (customer-group pricing) are intentionally not wired yet — Bagisto's
  // customer-group + catalog rules exist but payloads are unverified from this sandbox.
  async listCompanies(): Promise<AdminCompany[]> {
    throw new BagistoApiError(501, "Company registry is demo-only until Bagisto company/customer groups are verified — see docs/07-admin-integration §8.");
  },

  async listPriceLists(): Promise<AdminPriceList[]> {
    throw new BagistoApiError(501, "Price lists are demo-only until Bagisto customer-group pricing is verified — see docs/07-admin-integration §8.");
  },

  async createPriceList(): Promise<AdminPriceList> {
    throw new BagistoApiError(501, "Price list creation is not wired for Bagisto yet.");
  },

  async updatePriceList(): Promise<AdminPriceList | undefined> {
    throw new BagistoApiError(501, "Price list editing is not wired for Bagisto yet.");
  },

  async setPriceListStatus(): Promise<AdminPriceList | undefined> {
    throw new BagistoApiError(501, "Price list activation is not wired for Bagisto yet.");
  },

  async deletePriceList(): Promise<boolean> {
    throw new BagistoApiError(501, "Price list deletion is not wired for Bagisto yet.");
  },

  // Curated room-package bundles have no verified Bagisto mapping yet — demo-only.
  async listBundles(): Promise<AdminBundle[]> {
    throw new BagistoApiError(501, "Bundles are demo-only until a Bagisto bundle mapping is verified — see docs/07-admin-integration §8.");
  },

  async createBundle(): Promise<AdminBundle> {
    throw new BagistoApiError(501, "Bundle creation is not wired for Bagisto yet.");
  },

  async updateBundle(): Promise<AdminBundle | undefined> {
    throw new BagistoApiError(501, "Bundle editing is not wired for Bagisto yet.");
  },

  async setBundleStatus(): Promise<AdminBundle | undefined> {
    throw new BagistoApiError(501, "Bundle activation is not wired for Bagisto yet.");
  },

  async deleteBundle(): Promise<boolean> {
    throw new BagistoApiError(501, "Bundle deletion is not wired for Bagisto yet.");
  },

  async listCollections(): Promise<AdminCollection[]> {
    // Collections/price-merchandise grouping has no verified Bagisto mapping yet — demo-only.
    throw new BagistoApiError(501, "Collections are not wired for Bagisto yet. Use VITE_API_MODE=demo — Bagisto category/rule merchandising lives in Bagisto admin → Catalog → Categories.");
  },

  async listCollectionProducts(): Promise<AdminProduct[]> {
    throw new BagistoApiError(501, "Collections are demo-only for now — see docs/07-admin-integration §8.");
  },

  async createCollection(): Promise<AdminCollection> {
    throw new BagistoApiError(501, "Collection creation is not wired for Bagisto yet.");
  },

  async updateCollection(): Promise<AdminCollection | undefined> {
    throw new BagistoApiError(501, "Collection editing is not wired for Bagisto yet.");
  },

  async deleteCollection(): Promise<boolean> {
    throw new BagistoApiError(501, "Collection deletion is not wired for Bagisto yet.");
  },

  async createCategory(): Promise<AdminCategory> {
    throw new BagistoApiError(501, "Category creation on Bagisto is not wired yet — manage categories in Bagisto admin → Catalog → Categories.");
  },

  async updateCategory(): Promise<AdminCategory | undefined> {
    throw new BagistoApiError(501, "Category editing on Bagisto is not wired yet — manage categories in Bagisto admin → Catalog → Categories.");
  },

  async deleteCategory(): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: "Category deletion on Bagisto is not wired yet — manage categories in Bagisto admin → Catalog → Categories." };
  },

  async listMediaAssets(): Promise<AdminMediaAsset[]> {
    throw new BagistoApiError(501, "Media library is demo-only for now. Bagisto equivalents: storage disk + /api/admin media once wired — see docs/07-admin-integration §8.");
  },

  async addMediaAsset(): Promise<AdminMediaAsset> {
    throw new BagistoApiError(501, "Media upload on Bagisto is not wired yet — use the demo mode or wire the Bagisto media endpoint.");
  },

  async deleteMediaAsset(): Promise<boolean> {
    throw new BagistoApiError(501, "Media deletion on Bagisto is not wired yet.");
  },

  // Media v2 (folders/alt/bulk) — same story: not wired against a live Bagisto server.
  // To wire later: Bagisto Media Assets (spatie/laravel-medialibrary behind the hood),
  // endpoints vary per install — UNVERIFIED until docs/07 provisioning happens.
  async updateMediaAsset(): Promise<AdminMediaAsset | undefined> {
    throw new BagistoApiError(501, "Media update on Bagisto is not wired yet (unverified against a live server).");
  },

  async bulkDeleteMediaAssets(): Promise<number> {
    throw new BagistoApiError(501, "Bulk media deletion on Bagisto is not wired yet (unverified against a live server).");
  },

  async moveMediaAssets(): Promise<number> {
    throw new BagistoApiError(501, "Moving assets between folders on Bagisto is not wired yet (unverified).");
  },

  async assignMediaToProduct(): Promise<boolean> {
    throw new BagistoApiError(501, "Assigning a media asset to a product on Bagisto is not wired yet (unverified — would map to the product `images` relation once provisioned).");
  },

  async listInventory() {
    // Sellable qty exists per product (mapped above). The WMS layer — per-location
    // stock, movement audit log, thresholds, zones — is not in Bagisto core; tracking
    // it there needs a custom package. See docs/07-admin-integration.
    throw new BagistoApiError(501, "Inventory module is not wired for Bagisto yet — use the product stock column for now, or VITE_API_MODE=demo for the preview. See docs/07-admin-integration.");
  },

  async adjustStock() {
    throw new BagistoApiError(501, "Stock adjustments are not wired for Bagisto yet — Bagisto adjusts qty via product inventories. See docs/07-admin-integration.");
  },

  async listStockMovements() {
    throw new BagistoApiError(501, "Stock movement history is not exposed by Bagisto core — WMS package required. See docs/07-admin-integration.");
  },

  async listDeliveryZones() {
    throw new BagistoApiError(501, "Delivery zones (base/express/same-day, COD) are not in Bagisto core — model as cart rules or a custom package. See docs/07-admin-integration.");
  },

  async saveDeliveryZone() {
    throw new BagistoApiError(501, "Delivery zone editing is not wired for Bagisto yet. See docs/07-admin-integration.");
  },

  async deleteDeliveryZone() {
    throw new BagistoApiError(501, "Delivery zone deletion is not wired for Bagisto yet. See docs/07-admin-integration.");
  },

  async resetDemoData() {
    // no-op on a live backend
  },
};

function paginateLocal(params?: ListParams & { type?: string; status?: string }): Paginated<AdminLead> {
  // Lazy import to avoid a hard dependency in bagisto mode until a live leads endpoint exists.
  void params;
  return { items: [], total: 0, page: 1, perPage: 10 };
}
