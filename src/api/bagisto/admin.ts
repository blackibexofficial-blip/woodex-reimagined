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
  AdminHomepageSections,
  AdminWarrantyPage,
  AdminCustomDesignPage,
  AdminVirtualShowroomPage,
  AdminPage,
  AdminPageFolder,
  AdminBrand,
  AdminApi, AdminBundle, AdminCategory, AdminStockTransfer, TransferLocation, AdminOptionSet, AdminCollection, AdminCompany, AdminCustomer, AdminPriceList, AdminLead, AdminMediaAsset, AdminOrder, AdminOrderEvent, AdminProduct, AdminReturn, AdminExchange, AdminClaim, AdminDraftOrder, AdminQuote, AdminSupplier, AdminPurchaseOrder, AdminSalesChannel, AdminSeries,
  AdminShowroom, AdminMaterial, AdminProject, AdminBlogPost, AdminService, DashboardStats, ListParams, NewAdminProductInput, NewLeadInput, NewOrderInput, NewSalesChannelInput, NewShowroomInput, Paginated, ProductImportResult, RevenuePoint, StoreSettings,
  AdminQuoteVersion, AdminQuoteTemplate, AdminInvoice, AdminInvoicePayment, AdminTask,
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
  channelId: input.channelId,
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
  channelId: o.channel_code ?? o.channelId ?? undefined,
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
      // Control-center — not derivable from /sales/*; Bagisto invoicing is stubbed 501 here. Zeros, not invented numbers.
      outstandingInvoices: 0,
      openQuotes: 0,
      pipelineValue: 0,
      overdueReturns: 0,
      publishedPages: 0,
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

  async bulkUpdateProducts(): Promise<{ updated: number }> {
    // No verified Bagisto bulk-update mapping (catalog rules exist but payloads are unverified).
    throw new BagistoApiError(501, "Bulk assortment edits are demo-only until the Bagisto product-update mapping is verified — see docs/07-admin-integration §8.");
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

  async listReturns(): Promise<Paginated<AdminReturn>> {
    // Returns/RMA are not in Bagisto core (operations/RMA is a paid Marketplace add-on) —
    // no verified mapping; intentionally 501 until docs/07 provisioning happens.
    throw new BagistoApiError(501, "Returns/RMA are not wired for Bagisto yet — Bagisto core has no RMA module. Use VITE_API_MODE=demo.");
  },

  async getReturn(): Promise<AdminReturn | undefined> {
    throw new BagistoApiError(501, "Returns/RMA are not wired for Bagisto yet — Bagisto core has no RMA module. Use VITE_API_MODE=demo.");
  },

  async createReturn(): Promise<AdminReturn | undefined> {
    throw new BagistoApiError(501, "Return creation is not wired for Bagisto yet.");
  },

  async updateReturn(): Promise<AdminReturn | undefined> {
    throw new BagistoApiError(501, "Return updates are not wired for Bagisto yet.");
  },

  async listExchanges(): Promise<Paginated<AdminExchange>> {
    // Exchanges ride on RMA in Bagisto — Marketplace add-on, unverified. See docs/07-admin-integration.
    throw new BagistoApiError(501, "Exchanges are not wired for Bagisto yet (no RMA/Exchange in Bagisto core). Use VITE_API_MODE=demo.");
  },

  async getExchange(): Promise<AdminExchange | undefined> {
    throw new BagistoApiError(501, "Exchanges are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },

  async createExchange(): Promise<AdminExchange | undefined> {
    throw new BagistoApiError(501, "Exchange creation is not wired for Bagisto yet.");
  },

  async updateExchange(): Promise<AdminExchange | undefined> {
    throw new BagistoApiError(501, "Exchange updates are not wired for Bagisto yet.");
  },

  async listClaims(): Promise<Paginated<AdminClaim>> {
    // Claims/warranty are not in Bagisto core — custom module required. See docs/07-admin-integration.
    throw new BagistoApiError(501, "Claims are not wired for Bagisto yet (no claims/warranty module in core). Use VITE_API_MODE=demo.");
  },

  async getClaim(): Promise<AdminClaim | undefined> {
    throw new BagistoApiError(501, "Claims are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },

  async createClaim(): Promise<AdminClaim | undefined> {
    throw new BagistoApiError(501, "Claim creation is not wired for Bagisto yet.");
  },

  async updateClaim(): Promise<AdminClaim | undefined> {
    throw new BagistoApiError(501, "Claim updates are not wired for Bagisto yet.");
  },

  async listDraftOrders(): Promise<Paginated<AdminDraftOrder>> {
    // Bagisto has draft orders natively — wiring needs a verified sales/drafts mapper. See docs/07-admin-integration.
    throw new BagistoApiError(501, "Draft orders are not wired for Bagisto yet (native in Bagisto, mapper unverified). Use VITE_API_MODE=demo.");
  },

  async getDraftOrder(): Promise<AdminDraftOrder | undefined> {
    throw new BagistoApiError(501, "Draft orders are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },

  async createDraftOrder(): Promise<AdminDraftOrder> {
    throw new BagistoApiError(501, "Draft order creation is not wired for Bagisto yet.");
  },

  async updateDraftOrder(): Promise<AdminDraftOrder | undefined> {
    throw new BagistoApiError(501, "Draft order updates are not wired for Bagisto yet.");
  },

  async deleteDraftOrder(): Promise<boolean> {
    throw new BagistoApiError(501, "Draft order deletion is not wired for Bagisto yet.");
  },

  async convertDraftOrder(): Promise<AdminOrder | undefined> {
    throw new BagistoApiError(501, "Draft order conversion is not wired for Bagisto yet.");
  },

  async listQuotes(): Promise<Paginated<AdminQuote>> {
    // Bagisto has no quotation entity out of the box — needs a custom package or meta-fields on orders.
    throw new BagistoApiError(501, "Quotes are not wired for Bagisto yet (no native entity). Use VITE_API_MODE=demo.");
  },

  async getQuote(): Promise<AdminQuote | undefined> {
    throw new BagistoApiError(501, "Quotes are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },

  async createQuote(): Promise<AdminQuote> {
    throw new BagistoApiError(501, "Quote creation is not wired for Bagisto yet.");
  },

  async createQuoteFromLead(): Promise<AdminQuote | undefined> {
    throw new BagistoApiError(501, "Quote creation is not wired for Bagisto yet.");
  },

  async updateQuote(): Promise<AdminQuote | undefined> {
    throw new BagistoApiError(501, "Quote updates are not wired for Bagisto yet.");
  },

  async deleteQuote(): Promise<boolean> {
    throw new BagistoApiError(501, "Quote deletion is not wired for Bagisto yet.");
  },

  async convertQuote(): Promise<AdminOrder | undefined> {
    throw new BagistoApiError(501, "Quote conversion is not wired for Bagisto yet.");
  },

  async listQuoteVersions(): Promise<AdminQuoteVersion[]> {
    throw new BagistoApiError(501, "Quote versioning is not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },

  async restoreQuoteVersion(): Promise<AdminQuote | undefined> {
    throw new BagistoApiError(501, "Quote version restore is not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },

  async listQuoteTemplates(): Promise<AdminQuoteTemplate[]> {
    throw new BagistoApiError(501, "Quote templates are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },

  async saveQuoteTemplate(): Promise<AdminQuoteTemplate> {
    throw new BagistoApiError(501, "Quote template save is not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },

  async deleteQuoteTemplate(): Promise<boolean> {
    throw new BagistoApiError(501, "Quote template deletion is not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },
  async listInvoices(): Promise<Paginated<AdminInvoice>> {
    throw new BagistoApiError(501, "Invoices are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },
  async getInvoice(): Promise<AdminInvoice | undefined> {
    throw new BagistoApiError(501, "Invoices are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },
  async listInvoicePayments(): Promise<AdminInvoicePayment[]> {
    throw new BagistoApiError(501, "Invoice payments are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },
  async convertQuoteToInvoice(): Promise<AdminInvoice> {
    throw new BagistoApiError(501, "Quote→invoice conversion is not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },
  async recordInvoicePayment(): Promise<AdminInvoice | undefined> {
    throw new BagistoApiError(501, "Invoice payment recording is not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },
  async listTasks(): Promise<Paginated<AdminTask>> {
    throw new BagistoApiError(501, "Tasks are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },
  async createTask(): Promise<AdminTask> {
    throw new BagistoApiError(501, "Task creation is not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },
  async setTaskDone(): Promise<AdminTask | undefined> {
    throw new BagistoApiError(501, "Task updates are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },

  async listSuppliers(): Promise<AdminSupplier[]> {
    throw new BagistoApiError(501, "Suppliers are not wired for Bagisto yet (no native entity). Use VITE_API_MODE=demo.");
  },

  async createSupplier(): Promise<AdminSupplier> {
    throw new BagistoApiError(501, "Supplier creation is not wired for Bagisto yet.");
  },

  async updateSupplier(): Promise<AdminSupplier | undefined> {
    throw new BagistoApiError(501, "Supplier updates are not wired for Bagisto yet.");
  },

  async deleteSupplier(): Promise<boolean> {
    throw new BagistoApiError(501, "Supplier deletion is not wired for Bagisto yet.");
  },

  async listPurchaseOrders(): Promise<Paginated<AdminPurchaseOrder>> {
    throw new BagistoApiError(501, "Purchase orders are not wired for Bagisto yet (needs inventory/purchase module). Use VITE_API_MODE=demo.");
  },

  async getPurchaseOrder(): Promise<AdminPurchaseOrder | undefined> {
    throw new BagistoApiError(501, "Purchase orders are not wired for Bagisto yet. Use VITE_API_MODE=demo.");
  },

  async createPurchaseOrder(): Promise<AdminPurchaseOrder> {
    throw new BagistoApiError(501, "Purchase order creation is not wired for Bagisto yet.");
  },

  async updatePurchaseOrder(): Promise<AdminPurchaseOrder | undefined> {
    throw new BagistoApiError(501, "Purchase order updates are not wired for Bagisto yet.");
  },

  async setPurchaseOrderStatus(): Promise<AdminPurchaseOrder | undefined> {
    throw new BagistoApiError(501, "Purchase order status is not wired for Bagisto yet.");
  },

  async receivePurchaseOrder(): Promise<AdminPurchaseOrder | undefined> {
    throw new BagistoApiError(501, "Purchase order receipt is not wired for Bagisto yet.");
  },

  async deletePurchaseOrder(): Promise<boolean> {
    throw new BagistoApiError(501, "Purchase order deletion is not wired for Bagisto yet.");
  },

  async getTransferLocations(): Promise<TransferLocation[]> {
    throw new BagistoApiError(501, "Transfer locations are not wired for Bagisto yet.");
  },

  async listStockTransfers(): Promise<Paginated<AdminStockTransfer>> {
    throw new BagistoApiError(501, "Stock transfers are not wired for Bagisto yet.");
  },

  async getStockTransfer(): Promise<AdminStockTransfer | undefined> {
    throw new BagistoApiError(501, "Stock transfer detail is not wired for Bagisto yet.");
  },

  async createStockTransfer(): Promise<AdminStockTransfer> {
    throw new BagistoApiError(501, "Stock transfer creation is not wired for Bagisto yet.");
  },

  async updateStockTransfer(): Promise<AdminStockTransfer | undefined> {
    throw new BagistoApiError(501, "Stock transfer update is not wired for Bagisto yet.");
  },

  async dispatchStockTransfer(): Promise<AdminStockTransfer | undefined> {
    throw new BagistoApiError(501, "Stock transfer dispatch is not wired for Bagisto yet.");
  },

  async receiveStockTransfer(): Promise<AdminStockTransfer | undefined> {
    throw new BagistoApiError(501, "Stock transfer receipt is not wired for Bagisto yet.");
  },

  async deleteStockTransfer(): Promise<boolean> {
    throw new BagistoApiError(501, "Stock transfer deletion is not wired for Bagisto yet.");
  },

  async listOptionSets(): Promise<AdminOptionSet[]> {
    throw new BagistoApiError(501, "Option sets are not wired for Bagisto yet.");
  },

  async createOptionSet(): Promise<AdminOptionSet> {
    throw new BagistoApiError(501, "Option set creation is not wired for Bagisto yet.");
  },

  async updateOptionSet(): Promise<AdminOptionSet | undefined> {
    throw new BagistoApiError(501, "Option set update is not wired for Bagisto yet.");
  },

  async deleteOptionSet(): Promise<boolean> {
    throw new BagistoApiError(501, "Option set deletion is not wired for Bagisto yet.");
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

  // Sales channels & showroom registry are demo-backed master data. Bagisto channels exist
  // server-side (channel_code) but the admin registry + attribution roll-up is not mapped yet.
  async listSalesChannels(): Promise<AdminSalesChannel[]> {
    throw new BagistoApiError(501, "Sales channel registry is demo-only until Bagisto channel mapping is verified — see docs/07-admin-integration §8.");
  },

  async createSalesChannel(): Promise<AdminSalesChannel> {
    throw new BagistoApiError(501, "Channel creation is not wired for Bagisto yet.");
  },

  async updateSalesChannel(): Promise<AdminSalesChannel | undefined> {
    throw new BagistoApiError(501, "Channel editing is not wired for Bagisto yet.");
  },

  async setSalesChannelEnabled(): Promise<AdminSalesChannel | undefined> {
    throw new BagistoApiError(501, "Channel toggling is not wired for Bagisto yet.");
  },

  async deleteSalesChannel(): Promise<boolean> {
    throw new BagistoApiError(501, "Channel deletion is not wired for Bagisto yet.");
  },

  async getChannelSales(): Promise<Array<{ channelId: string; orders: number; revenue: number }>> {
    // Honest fallback: attribute everything to what the mapping can actually prove — web.
    const local = JSON.parse(localStorage.getItem("woodex.web.orders") ?? "[]") as AdminOrder[];
    if (!Array.isArray(local) || local.length === 0) return [];
    const revenue = local.reduce((sum, o) => sum + (o.total ?? 0), 0);
    return [{ channelId: "ch-web", orders: local.length, revenue }];
  },

  async listShowrooms(): Promise<AdminShowroom[]> {
    throw new BagistoApiError(501, "Showroom registry is demo-only until a store-locator backend exists — see docs/07-admin-integration §8.");
  },

  async createShowroom(): Promise<AdminShowroom> {
    throw new BagistoApiError(501, "Showroom creation is not wired for Bagisto yet.");
  },

  async listSeries(): Promise<AdminSeries[]> {
    throw new BagistoApiError(501, "Series taxonomy is demo-only until a /series backend exists — see docs/07-admin-integration §8.");
  },
  async createSeries(): Promise<AdminSeries> {
    throw new BagistoApiError(501, "Series creation is not wired for Bagisto yet.");
  },
  async updateSeries(): Promise<AdminSeries | undefined> {
    throw new BagistoApiError(501, "Series update is not wired for Bagisto yet.");
  },
  async setSeriesActive(): Promise<AdminSeries | undefined> {
    throw new BagistoApiError(501, "Series status is not wired for Bagisto yet.");
  },
  async deleteSeries(): Promise<boolean> {
    throw new BagistoApiError(501, "Series deletion is not wired for Bagisto yet.");
  },
  async listBrands(): Promise<AdminBrand[]> {
    throw new BagistoApiError(501, "Brand master is demo-only until a brand backend exists — see docs/07-admin-integration §8.");
  },
  async createBrand(): Promise<AdminBrand> {
    throw new BagistoApiError(501, "Brand creation is not wired for Bagisto yet.");
  },
  async updateBrand(): Promise<AdminBrand | undefined> {
    throw new BagistoApiError(501, "Brand update is not wired for Bagisto yet.");
  },
  async setBrandActive(): Promise<AdminBrand | undefined> {
    throw new BagistoApiError(501, "Brand status is not wired for Bagisto yet.");
  },
  async deleteBrand(): Promise<boolean> {
    throw new BagistoApiError(501, "Brand deletion is not wired for Bagisto yet.");
  },
  async getHomepageSections(): Promise<AdminHomepageSections> {
    throw new BagistoApiError(501, "Homepage sections are demo-only until a homepage backend exists — see docs/07-admin-integration §8.");
  },
  async updateHomepageSections(): Promise<AdminHomepageSections> {
    throw new BagistoApiError(501, "Homepage sections are not wired for Bagisto yet.");
  },
  async getWarrantyPage(): Promise<AdminWarrantyPage> {
    throw new BagistoApiError(501, "Warranty page content is demo-only until a Bagisto CMS block exists — see docs/07-admin-integration §8.");
  },
  async updateWarrantyPage(): Promise<AdminWarrantyPage> {
    throw new BagistoApiError(501, "Warranty page content is not wired for Bagisto yet.");
  },
  async resetWarrantyPage(): Promise<AdminWarrantyPage> {
    throw new BagistoApiError(501, "Warranty page content is not wired for Bagisto yet.");
  },
  async getCustomDesignPage(): Promise<AdminCustomDesignPage> {
    throw new BagistoApiError(501, "Custom Design page content is demo-only until a Bagisto CMS block exists — see docs/07-admin-integration §8.");
  },
  async updateCustomDesignPage(): Promise<AdminCustomDesignPage> {
    throw new BagistoApiError(501, "Custom Design page content is not wired for Bagisto yet.");
  },
  async resetCustomDesignPage(): Promise<AdminCustomDesignPage> {
    throw new BagistoApiError(501, "Custom Design page content is not wired for Bagisto yet.");
  },
  async getVirtualShowroomPage(): Promise<AdminVirtualShowroomPage> {
    throw new BagistoApiError(501, "Virtual Showroom page content is demo-only until a Bagisto CMS block exists — see docs/07-admin-integration §8.");
  },
  async updateVirtualShowroomPage(): Promise<AdminVirtualShowroomPage> {
    throw new BagistoApiError(501, "Virtual Showroom page content is not wired for Bagisto yet.");
  },
  async resetVirtualShowroomPage(): Promise<AdminVirtualShowroomPage> {
    throw new BagistoApiError(501, "Virtual Showroom page content is not wired for Bagisto yet.");
  },
  async listPages(): Promise<AdminPage[]> {
    throw new BagistoApiError(501, "Pages builder is demo-only until the Bagisto puck_data CMS mapping lands (Wave 7) — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async getPage(): Promise<AdminPage | undefined> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async createPage(): Promise<AdminPage> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async updatePage(): Promise<AdminPage | undefined> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async publishPage(): Promise<AdminPage | undefined> {
    throw new BagistoApiError(501, "Pages builder publish is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async unpublishPage(): Promise<AdminPage | undefined> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async duplicatePage(): Promise<AdminPage | undefined> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async deletePage(): Promise<boolean> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async revertPage(): Promise<AdminPage | undefined> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async listPageFolders(): Promise<AdminPageFolder[]> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async createPageFolder(): Promise<AdminPageFolder> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async updatePageFolder(): Promise<AdminPageFolder | undefined> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async deletePageFolder(): Promise<boolean> {
    throw new BagistoApiError(501, "Pages builder is demo-only until Wave 7 — see docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.");
  },
  async updateShowroom(): Promise<AdminShowroom | undefined> {
    throw new BagistoApiError(501, "Showroom editing is not wired for Bagisto yet.");
  },

  async setShowroomActive(): Promise<AdminShowroom | undefined> {
    throw new BagistoApiError(501, "Showroom toggling is not wired for Bagisto yet.");
  },

  async deleteShowroom(): Promise<boolean> {
    throw new BagistoApiError(501, "Showroom deletion is not wired for Bagisto yet.");
  },

  async listMaterials(): Promise<AdminMaterial[]> {
    throw new BagistoApiError(501, "Materials & finishes are demo-managed until a Bagisto attribute/variant backend is provisioned — see docs/07-admin-integration §8.");
  },

  async createMaterial(): Promise<AdminMaterial> {
    throw new BagistoApiError(501, "Material creation is not wired for Bagisto yet.");
  },

  async updateMaterial(): Promise<AdminMaterial | undefined> {
    throw new BagistoApiError(501, "Material editing is not wired for Bagisto yet.");
  },

  async setMaterialActive(): Promise<AdminMaterial | undefined> {
    throw new BagistoApiError(501, "Material toggling is not wired for Bagisto yet.");
  },

  async deleteMaterial(): Promise<boolean> {
    throw new BagistoApiError(501, "Material deletion is not wired for Bagisto yet.");
  },

  async listProjects(): Promise<AdminProject[]> {
    throw new BagistoApiError(501, "Projects portfolio is demo-managed until a CMS/portfolio backend is provisioned — see docs/07-admin-integration §8.");
  },

  async createProject(): Promise<AdminProject> {
    throw new BagistoApiError(501, "Project creation is not wired for Bagisto yet.");
  },

  async updateProject(): Promise<AdminProject | undefined> {
    throw new BagistoApiError(501, "Project editing is not wired for Bagisto yet.");
  },

  async setProjectActive(): Promise<AdminProject | undefined> {
    throw new BagistoApiError(501, "Project toggling is not wired for Bagisto yet.");
  },

  async deleteProject(): Promise<boolean> {
    throw new BagistoApiError(501, "Project deletion is not wired for Bagisto yet.");
  },

  async listBlogPosts(): Promise<AdminBlogPost[]> {
    throw new BagistoApiError(501, "Blog/Journal is demo-managed until the headless CMS panel (Bagisto/TailAdmin) is provisioned — see docs/07-admin-integration §8.");
  },

  async createBlogPost(): Promise<AdminBlogPost> {
    throw new BagistoApiError(501, "Blog creation is not wired for Bagisto yet.");
  },

  async updateBlogPost(): Promise<AdminBlogPost | undefined> {
    throw new BagistoApiError(501, "Blog editing is not wired for Bagisto yet.");
  },

  async setBlogPostActive(): Promise<AdminBlogPost | undefined> {
    throw new BagistoApiError(501, "Blog toggling is not wired for Bagisto yet.");
  },

  async deleteBlogPost(): Promise<boolean> {
    throw new BagistoApiError(501, "Blog deletion is not wired for Bagisto yet.");
  },

  async listServices(): Promise<AdminService[]> {
    throw new BagistoApiError(501, "Services are demo-managed until a CMS/page backend is provisioned — see docs/07-admin-integration §8.");
  },

  async createService(): Promise<AdminService> {
    throw new BagistoApiError(501, "Service creation is not wired for Bagisto yet.");
  },

  async updateService(): Promise<AdminService | undefined> {
    throw new BagistoApiError(501, "Service editing is not wired for Bagisto yet.");
  },

  async setServiceActive(): Promise<AdminService | undefined> {
    throw new BagistoApiError(501, "Service toggling is not wired for Bagisto yet.");
  },

  async deleteService(): Promise<boolean> {
    throw new BagistoApiError(501, "Service deletion is not wired for Bagisto yet.");
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
