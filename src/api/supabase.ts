/**
 * WOODEX — Supabase production adapter for AdminApi (v3 P2 wiring).
 *
 * Env-gated: engaged only with VITE_API_MODE=supabase. Default build keeps the
 * demo adapter and this file is never exercised.
 *
 * Honest status: authored against the hardened converged schema
 * (supabase/migrations/20261107000001…002). NOT executed against hosted
 * Supabase from this authoring environment — there is no egress to the hosted
 * project. Correctness here = tsc, review, and the pglite rehearsal of every
 * RPC this adapter calls (docs/08-master-plan §8.1). The 5s bound on the
 * integration client makes calls fail fast instead of hanging.
 *
 * What is wired (real round-trips through Supabase):
 *   products (list/search/paginate/update name·price·stock via product_update,
 *     doc fields via product_update_payload), dashboard (admin_overview + client
 *     aggregation), orders (stage RPC + courier columns + events), quotes
 *     (full lifecycle incl. recompute), returns (state machine + restock via
 *     inventory_apply), customers (clients + order aggregate), suppliers/POs,
 *     transfers, option sets, categories, collections, price lists, bundles,
 *     sales channels, showrooms/series/brands/materials/services/projects/
 *     blog posts (payload round-trips), pages builder (create/update/publish/
 *     unpublish/revert via page RPCs, draft + published snapshots), homepage +
 *     warranty/custom-design/virtual-showroom singletons, media library,
 *     inventory (read via inventory_meta, adjust via inventory_apply, movement
 *     ledger), leads (capture via lead-capture EF — never direct anon writes),
 *     order confirm — NO (see below).
 *
 * What is deliberately NOT wired — it throws SupabaseUnsupportedError naming
 * the cause instead of returning fabricated data:
 *   createOrder / convertQuote (requires order-submit EF: server-side price
 *   re-verification — never trusts client prices), exchanges/claims (no tables
 *   in convergence 0001), draft orders (no table), companies (admin B2B master
 *   is v3 Wave 2), page folders (no table), delivery zones (schema reshaped),
 *   assignMediaToProduct (needs a media RPC), createProduct/duplicateProduct/
 *   deleteProduct/importProductsCsv (catalogue authoring goes through the
 *   seed/WP-migration path by design), getChannelSales (orders carry no channel),
 *   resetWarrantyPage/resetCustomDesignPage/resetVirtualShowroomPage (requires
 *   the default-content module — Wave 3), resetDemoData (never destructive),
 *   invoice operations (no AdminApi methods — invoices are EF-first by design).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json, TablesUpdate } from "@/integrations/supabase/types";
import type {
  AdminApi,
  AdminBlogPost, AdminBrand, AdminBundle, AdminCategory, AdminCollection, AdminCollectionKind,
  AdminCustomDesignPage, AdminDeliveryZone, AdminHomepageSections, AdminInventoryItem, AdminLead,
  AdminMaterial, AdminMediaAsset, AdminOptionSet, AdminOrder, AdminOrderEvent, AdminPage,
  AdminPageContentItem, AdminPageDoc, AdminPageHistoryEntry, AdminPageSeo, AdminPriceList,
  AdminProduct, AdminProject, AdminPurchaseOrder, AdminPurchaseOrderPatch, AdminQuote,
  AdminQuotePatch, AdminReturn, AdminReturnPatch, AdminSalesChannel, AdminSeries, AdminService,
  AdminShowroom, AdminStockMovement, AdminStockTransfer, AdminStockTransferPatch, AdminSupplier,
  AdminSupplierPatch, AdminVirtualShowroomPage, AdminWarrantyPage,
  BulkProductPatch, BundleStatus, DashboardStats, ListParams, NewAdminBundleInput,
  NewAdminCollectionInput, NewAdminPriceListInput, NewBlogPostInput, NewBrandInput, NewLeadInput,
  NewMaterialInput, NewOrderInput, NewOptionSetInput, NewProjectInput, NewPurchaseOrderInput,
  NewPurchaseOrderLineInput, NewQuoteInput, NewReturnInput, NewSalesChannelInput, NewServiceInput,
  NewAdminProductInput,
  NewSeriesInput, NewShowroomInput, NewStockTransferInput, NewSupplierInput,
  Paginated, PurchaseOrderReceipt, QuoteStatus, RevenuePoint, StockMovementType, StoreSettings,
  StockTransferReceipt, TransferLocation, PurchaseOrderStatus, PriceListStatus,
  ProductImportRow, ProductImportResult,
} from "@/api/types";

/* ── helpers ─────────────────────────────────────────────────────────────── */

const notConfigured = (): boolean =>
  !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const guard = () => {
  if (notConfigured()) {
    throw new Error("VITE_API_MODE=supabase but VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are missing — fix env or unset VITE_API_MODE (falls back to demo).");
  }
};
const fail = (what: string, error: { message?: string } | null): never => {
  throw new Error(`Supabase: ${what} failed — ${error?.message ?? "unknown PostgREST error"}`);
};
const toNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const asObj = (v: Json | null | undefined): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const pad4 = (n: number) => String(n).padStart(4, "0");
const todayStartIso = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const monthStartIso = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const pagenate = <T>(items: T[], total: number, page: number, perPage: number): Paginated<T> =>
  ({ items, total, page, perPage });
const isNotWired = (method: string, detail: string): never => {
  throw new SupabaseUnsupportedError(`${method} — not wired in the Supabase adapter: ${detail}`);
};
export class SupabaseUnsupportedError extends Error {
  constructor(message: string) { super(message); this.name = "SupabaseUnsupportedError"; }
}

type Row = Record<string, any>;
type TableName = keyof Database["public"]["Tables"] & string;
type PayloadTable =
  | "suppliers" | "option_sets" | "price_lists" | "bundles" | "sales_channels"
  | "showrooms" | "series" | "brands" | "collections" | "categories" | "blog_posts" | "projects";

/* ── orders shared ───────────────────────────────────────────────────────── */
const STAGE_TO_STATUS: Record<string, AdminOrder["status"]> = {
  intake: "pending", production: "processing", ready: "shipped",
  delivered: "delivered", closed: "delivered", cancelled: "cancelled",
};
const STATUS_TO_STAGE: Record<AdminOrder["status"], string> = {
  pending: "intake", processing: "production", shipped: "ready",
  delivered: "delivered", cancelled: "cancelled",
};
const orderRef = (id: number) => `WDX-${id}`;
const parseOrderId = (ref: string): number => {
  const m = String(ref).match(/^WDX-(\d+)$/);
  if (m) return Number(m[1]);
  const asNum = Number(ref);
  if (Number.isFinite(asNum)) return asNum;
  throw new Error(`Supabase: order id "${ref}" is not a WDX-<n> reference`);
};
const rowToAdminOrder = (r: Row): AdminOrder => {
  const items = (Array.isArray(r.items) ? r.items : []) as AdminOrder["items"];
  return {
    id: orderRef(r.id),
    customerName: r.customer ?? "",
    customerEmail: r.customer_email ?? "",
    customerPhone: r.customer_phone ?? "",
    ...(r.address ? { address: r.address } : {}),
    city: r.city ?? "",
    items,
    subtotal: toNum(r.subtotal ?? r.total),
    shipping: toNum(r.shipping),
    total: toNum(r.total),
    paymentMethod: String(r.payment_method ?? "cod") as AdminOrder["paymentMethod"],
    status: STAGE_TO_STATUS[r.stage] ?? "pending",
    placedAt: r.created_at,
    ...(r.owner ? { notes: undefined } : {}),
    ...(r.courier_name ? { courierName: r.courier_name } : {}),
    ...(r.tracking_number ? { trackingNumber: r.tracking_number } : {}),
    ...(r.internal_notes ? { internalNotes: r.internal_notes } : {}),
    discountPct: toNum(r.discount_pct),
    discountAmount: toNum(r.discount_amount),
  } as unknown as AdminOrder;
};

/* products shared
 * products.payload holds the full storefront document (name, specs, images,
   ratings, flags…); first-class columns carry the ledger-critical fields. */
const rowToAdminProduct = (r: Row): AdminProduct => {
  const p = asObj(r.payload);
  const images = Array.isArray(p.images) ? (p.images as string[]) : undefined;
  return {
    ...(p as unknown as Partial<AdminProduct>),
    id: String(r.id),
    name: r.name ?? String(p.name ?? ""),
    category: r.category_id ?? String(p.category ?? "ungrouped"),
    sku: r.sku ?? (p.sku != null ? String(p.sku) : String(r.id)),
    price: toNum(r.price),
    compareAtPrice: p.compareAtPrice !== undefined ? toNum(p.compareAtPrice) : undefined,
    image: (typeof p.image === "string" ? p.image : images?.[0]) as string | undefined,
    inStock: Boolean(r.in_stock),
    stock: toNum(r.stock_qty),
    stockStatus: (p.stockStatus as AdminProduct["stockStatus"]) ?? (r.in_stock ? "in_stock" : "out_of_stock"),
    isBestSeller: p.isBestSeller === true,
    rating: toNum(p.rating),
    reviews: toNum(p.reviews),
    createdAt: (typeof p.createdAt === "string" ? p.createdAt : r.updated_at) as string | undefined,
    dimensions: p.dimensions as string | undefined,
    weightKg: p.weightKg !== undefined ? toNum(p.weightKg) : undefined,
    optionSetIds: (Array.isArray(p.optionSetIds) ? p.optionSetIds : undefined) as string[] | undefined,
    specs: (Array.isArray(p.specs) ? p.specs : undefined) as AdminProduct["specs"],
    shortDescription: p.shortDescription as string | undefined,
    description: p.description as string | undefined,
    images,
    seriesId: r.series_id ?? undefined,
    brandId: p.brandId as string | undefined,
  };
};

/* ── dashboard ──────────────────────────────────────────────────────────── */
async function getDashboardStats(): Promise<DashboardStats> {
  guard();
  const [ov, open, month] = await Promise.all([
    supabase.rpc("admin_overview"),
    supabase.from("orders").select("id", { count: "exact", head: true })
      .not("stage", "in", '("delivered","closed","cancelled")'),
    supabase.from("orders").select("total, created_at").gte("created_at", monthStartIso()),
  ]);
  if (ov.error) fail("admin_overview", ov.error);
  if (open.error) fail("orders count", open.error);
  if (month.error) fail("orders mtd", month.error);
  const o = asObj(ov.data as Json);
  const today = todayStartIso();
  const rows = (month.data ?? []) as { total: number | string; created_at: string }[];
  const revenueMtd = rows.reduce((s, r) => s + toNum(r.total), 0);
  const ordersMtd = rows.length;
  const revenueToday = rows.filter((r) => r.created_at >= today).reduce((s, r) => s + toNum(r.total), 0);
  const ordersToday = rows.filter((r) => r.created_at >= today).length;
  return {
    revenueToday,
    revenueMtd,
    ordersToday,
    ordersMtd,
    averageOrderValue: ordersMtd > 0 ? Math.round(revenueMtd / ordersMtd) : 0,
    pendingOrders: open.count ?? 0,
    newLeads: toNum(o.new_leads_7d),      // overview window is trailing-7d by design
    lowStockProducts: toNum(o.low_stock),
  };
}
async function getRevenueSeries(days: number): Promise<RevenuePoint[]> {
  guard();
  const start = new Date();
  start.setDate(start.getDate() - Math.max(1, days) + 1);
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase.from("orders").select("total, created_at")
    .gte("created_at", start.toISOString()).neq("stage", "cancelled");
  if (error) fail("revenue series", error);
  const buckets = new Map<string, RevenuePoint>();
  for (let d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, {
      label: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d),
      revenue: 0,
      orders: 0,
    });
  }
  for (const r of (data ?? []) as { total: number | string; created_at: string }[]) {
    const key = String(r.created_at).slice(0, 10);
    const b = buckets.get(key);
    if (b) { b.revenue += toNum(r.total); b.orders += 1; }
  }
  return [...buckets.values()];
}

/* ── products ───────────────────────────────────────────────────────────── */
async function listProducts(params?: ListParams & { category?: string; inStock?: boolean; brandId?: string }): Promise<Paginated<AdminProduct>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 24));
  const query = params?.query?.trim();
  const sort = params?.sort ?? "name";
  const dir = params?.direction === "desc" ? false : true;
  let q = supabase.from("products").select("*", { count: "exact" });
  if (params?.category) q = q.eq("category_id", params.category);
  if (params?.brandId) q = q.eq("payload->>brandId", params.brandId);
  if (params?.inStock !== undefined) q = q.eq("in_stock", params.inStock);
  if (query) q = q.ilike("name", `%${query}%`);
  if (sort === "price") q = q.order("price", { ascending: dir });
  else if (sort === "stock") q = q.order("stock_qty", { ascending: dir });
  else q = q.order("name", { ascending: dir });
  q = q.range((page - 1) * perPage, page * perPage - 1);
  const { data, count, error } = await q;
  if (error) fail("listProducts", error);
  return pagenate((data ?? []).map(rowToAdminProduct), count ?? (data?.length ?? 0), page, perPage);
}

/** Keys the adapter persists through real RPC paths; anything richer is
 *  merged into products.payload by product_update_payload. */
const PRODUCT_DOC_KEYS = new Set([
  "compareAtPrice", "isBestSeller", "stockStatus", "category", "dimensions", "weightKg",
  "optionSetIds", "specs", "shortDescription", "description", "images", "seriesId", "image",
  "brandId", "subcategory", "sku",
]);
const MONEY_OR_LEDGER = new Set(["price", "stock", "inStock"]);

async function updateProduct(id: string, patch: Partial<Pick<AdminProduct,
  "name" | "price" | "compareAtPrice" | "inStock" | "stock" | "isBestSeller" | "stockStatus" |
  "category" | "dimensions" | "weightKg" | "optionSetIds" | "specs" | "shortDescription" |
  "description" | "images" | "seriesId" | "image" | "brandId">>): Promise<AdminProduct | undefined> {
  guard();
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (error) fail("getProduct", error);
    return data ? rowToAdminProduct(data) : undefined;
  }
  // sku is the fulfilment identity — it is never patchable from the admin editor.
  // money/ledger leg
  const money: { p_price?: number; p_stock_qty?: number; p_name?: string } = {};
  if (patch.price !== undefined) money.p_price = toNum(patch.price);
  if (patch.stock !== undefined) money.p_stock_qty = Math.max(0, Math.round(toNum(patch.stock)));
  if (patch.name !== undefined) money.p_name = String(patch.name);
  let rpcRow: Row | null = null;
  if (Object.keys(money).length > 0) {
    const { data, error } = await supabase.rpc("product_update", { p_id: id, ...money });
    if (error) fail("product_update", error);
    rpcRow = data as Row;
  }
  // document leg
  const doc: Record<string, unknown> = {};
  for (const k of keys) {
    if (MONEY_OR_LEDGER.has(k) || k === "name" || k === "sku") continue;
    const v = (patch as Record<string, unknown>)[k];
    if (k === "category" && typeof v === "string") doc.category = v;
    else if (k === "seriesId") doc.seriesId = v ?? "";
    else if (k === "images") doc.images = v;
    else if (k === "image") doc.image = v ?? "";
    else doc[k] = v;
  }
  if (Object.keys(doc).length > 0) {
    const { data, error } = await supabase.rpc("product_update_payload", { p_id: id, p_patch: doc as Json });
    if (error) fail("product_update_payload", error);
    rpcRow = data as Row;
  }
  if (patch.inStock !== undefined && !rpcRow) {
    // stock quantity is the source of in_stock; a bare boolean flip is a lie in this schema
    isNotWired("updateProduct.inStock", "in_stock derives from stock_qty — patch stock instead of the bare boolean");
  }
  if (!rpcRow) {
    const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (error) fail("getProduct", error);
    rpcRow = data as Row;
  }
  return rpcRow ? rowToAdminProduct(rpcRow) : undefined;
}

async function bulkUpdateProducts(ids: string[], patch: BulkProductPatch): Promise<{ updated: number }> {
  guard();
  let updated = 0;
  const { data: products, error } = await supabase.from("products").select("id, price").in("id", ids);
  if (error) fail("bulkPatch read", error);
  const current = new Map(((products ?? []) as Row[]).map((r) => [String(r.id), toNum(r.price)]));
  switch (patch.kind) {
    case "pricePct": {
      const factor = 1 + toNum(patch.pct) / 100;
      for (const [id, price] of current) {
        const target = Math.max(0, Math.round(price * factor));
        const { error: e2 } = await supabase.rpc("product_update", { p_id: id, p_price: target });
        if (e2) fail("bulkPatch pricePct", e2);
        if (patch.includeCompareAt) {
          const { error: e3 } = await supabase.rpc("product_update_payload", { p_id: id, p_patch: { compareAtPrice: price } as unknown as Json });
          if (e3) fail("bulkPatch compareAtPrice", e3);
        }
        updated += 1;
      }
      return { updated };
    }
    case "stockDelta": {
      const delta = Math.round(toNum(patch.delta));
      for (const id of ids) {
        const { data: prod, error: e2 } = await supabase.from("products").select("stock_qty").eq("id", id).maybeSingle();
        if (e2) fail("bulkPatch stock read", e2);
        if (!prod) continue;
        const next = Math.max(0, toNum((prod as Row).stock_qty) + delta);
        const { error: e3 } = await supabase.rpc("product_update", { p_id: id, p_stock_qty: next });
        if (e3) fail("bulkPatch stockDelta", e3);
        updated += 1;
      }
      return { updated };
    }
    case "stockStatus": {
      for (const id of ids) {
        const { error: e2 } = await supabase.rpc("product_update_payload", { p_id: id, p_patch: { stockStatus: patch.status } as unknown as Json });
        if (e2) fail("bulkPatch stockStatus", e2);
        updated += 1;
      }
      return { updated };
    }
    case "markOnSale": {
      const frac = Math.min(0.6, Math.max(0, toNum(patch.pct) / 100));
      for (const [id, price] of current) {
        const target = Math.max(0, Math.round(price * (1 - frac)));
        const { error: e2 } = await supabase.rpc("product_update", { p_id: id, p_price: target });
        if (e2) fail("bulkPatch markOnSale price", e2);
        const { error: e3 } = await supabase.rpc("product_update_payload", { p_id: id, p_patch: { compareAtPrice: price } as unknown as Json });
        if (e3) fail("bulkPatch markOnSale compareAt", e3);
        updated += 1;
      }
      return { updated };
    }
    case "clearSale": {
      for (const id of ids) {
        const { error: e2 } = await supabase.rpc("product_update_payload", { p_id: id, p_patch: { compareAtPrice: null } as unknown as Json });
        if (e2) fail("bulkPatch clearSale", e2);
        updated += 1;
      }
      return { updated };
    }
    case "bestSeller": {
      for (const id of ids) {
        const { error: e2 } = await supabase.rpc("product_update_payload", { p_id: id, p_patch: { isBestSeller: patch.value } as unknown as Json });
        if (e2) fail("bulkPatch bestSeller", e2);
        updated += 1;
      }
      return { updated };
    }
    case "brand": {
      for (const id of ids) {
        const { error: e2 } = await supabase.rpc("product_update_payload", { p_id: id, p_patch: { brandId: patch.brandId } as unknown as Json });
        if (e2) fail("bulkPatch brand", e2);
        updated += 1;
      }
      return { updated };
    }
    default: {
      const exhaustive: never = patch;
      throw new SupabaseUnsupportedError(`bulkUpdateProducts — unknown patch kind: ${String((exhaustive as { kind?: string }).kind)}`);
    }
  }
}

function createProduct(_input: NewAdminProductInput): Promise<AdminProduct> {
  return Promise.reject(new SupabaseUnsupportedError("createProduct — not wired in the Supabase adapter: the converged catalogue is seed/migration-authoritative by design (no public INSERT grant on products). Author catalogue rows in the seed SQL or a dedicated tooling path."));
}
function duplicateProduct(_id: string): Promise<AdminProduct | undefined> {
  return Promise.reject(new SupabaseUnsupportedError("duplicateProduct — not wired: no duplicate RPC; the admin duplicates in demo mode only."));
}
function deleteProduct(_id: string): Promise<boolean> {
  return Promise.reject(new SupabaseUnsupportedError("deleteProduct — not wired: products are ledger-referenced (order lines, movements); deletion is an owner-only migration concern, never an admin button."));
}
function importProductsCsv(_rows: ProductImportRow[]): Promise<ProductImportResult> {
  return Promise.reject(new SupabaseUnsupportedError("importProductsCsv — not wired: CSV import belongs to the migration tooling, not the live admin PATCH surface."));
}

/* ── orders ─────────────────────────────────────────────────────────────── */
async function listOrders(params?: ListParams & { status?: AdminOrder["status"] | "all" }): Promise<Paginated<AdminOrder>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 20));
  const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  if (error) fail("listOrders", error);
  let rows = (data ?? []) as Row[];
  const q = params?.query?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      String(r.customer ?? "").toLowerCase().includes(q) ||
      String(r.ref ?? "").toLowerCase().includes(q) ||
      String(r.id).includes(q) ||
      String(r.city ?? "").toLowerCase().includes(q));
  }
  if (params?.status && params.status !== "all") {
    rows = rows.filter((r) => STAGE_TO_STATUS[r.stage] === params.status);
  }
  const total = rows.length;
  const slice = rows.slice((page - 1) * perPage, page * perPage);
  return pagenate(slice.map(rowToAdminOrder), total, page, perPage);
}
async function getOrder(id: string): Promise<AdminOrder | undefined> {
  guard();
  const num = parseOrderId(id);
  const { data, error } = await supabase.from("orders").select("*").eq("id", num).maybeSingle();
  if (error) fail("getOrder", error);
  return data ? rowToAdminOrder(data) : undefined;
}
async function updateOrderStatus(id: string, status: AdminOrder["status"], options?: { courierName?: string; trackingNumber?: string; internalNote?: string }): Promise<AdminOrder | undefined> {
  guard();
  const num = parseOrderId(id);
  const stage = STATUS_TO_STAGE[status];
  const { error: e1 } = await supabase.rpc("order_stage", { p_order_id: num, p_stage: stage, p_note: options?.internalNote ?? undefined });
  if (e1) fail("order_stage", e1);
  if (options?.courierName !== undefined || options?.trackingNumber !== undefined) {
    const patch: { courier_name?: string | null; tracking_number?: string | null; internal_notes?: string | null } = {};
    if (options.courierName !== undefined) patch.courier_name = options.courierName || null;
    if (options.trackingNumber !== undefined) patch.tracking_number = options.trackingNumber || null;
    if (options.internalNote !== undefined) patch.internal_notes = options.internalNote;
    const { error: e2 } = await supabase.from("orders").update(patch).eq("id", num);
    if (e2) fail("updateOrderCourier", e2);
  } else if (options?.internalNote !== undefined) {
    // order_stage journaled the note; keep the denorm column in sync too
    const { error: e2 } = await supabase.from("orders").update({ internal_notes: options.internalNote }).eq("id", num);
    if (e2) fail("updateOrderNotes", e2);
  }
  const fresh = await getOrder(id);
  return fresh;
}
async function updateOrderCourier(id: string, patch: Partial<Pick<AdminOrder, "courierName" | "trackingNumber" | "internalNotes">>): Promise<AdminOrder | undefined> {
  guard();
  const num = parseOrderId(id);
  const row: { courier_name?: string | null; tracking_number?: string | null; internal_notes?: string | null } = {};
  if (patch.courierName !== undefined) row.courier_name = patch.courierName || null;
  if (patch.trackingNumber !== undefined) row.tracking_number = patch.trackingNumber || null;
  if (patch.internalNotes !== undefined) row.internal_notes = patch.internalNotes || null;
  if (Object.keys(row).length === 0) return getOrder(id);
  const { error } = await supabase.from("orders").update(row).eq("id", num);
  if (error) fail("updateOrderCourier", error);
  return getOrder(id);
}
async function getOrderEvents(orderId: string): Promise<AdminOrderEvent[]> {
  guard();
  const num = parseOrderId(orderId);
  const { data, error } = await supabase.from("order_events").select("*")
    .eq("order_id", num).order("created_at", { ascending: true });
  if (error) fail("order_events", error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    orderId: orderRef(num),
    fromStatus: undefined,
    toStatus: STAGE_TO_STATUS[String(r.kind ?? "").replace(/^stage:/, "")] ?? undefined,
    note: r.note ?? undefined,
    createdAt: r.created_at,
  }));
}
function createOrder(_input: NewOrderInput): Promise<AdminOrder> {
  return Promise.reject(new SupabaseUnsupportedError("createOrder — not wired: the order-submit edge function (server-side price re-verification against the converged catalogue) is not deployed; the admin never writes orders directly, prices must never come from the client."));
}

/* ── returns (RMA) ─────────────────────────────────────────────────────── */
const RETURN_STATUS_TO_DB: Record<AdminReturn["status"], { state: string; resolution?: string }> = {
  requested: { state: "Requested" },
  received: { state: "Received" },
  inspected: { state: "Inspected" },
  refunded: { state: "Resolved", resolution: "refunded" },
  replaced: { state: "Resolved", resolution: "replaced" },
  rejected: { state: "Rejected" },
};
const returnRef = (id: number) => `RMA-${pad4(id)}`;
const parseReturnId = (s: string): number => {
  const m = String(s).match(/^RMA-(\d+)$/);
  return m ? Number(m[1]) : Number(s);
};
const rowToAdminReturn = (r: Row): AdminReturn => {
  const dbStatus = String(r.state ?? "Requested");
  const res = r.resolution ? String(r.resolution) : undefined;
  const status: AdminReturn["status"] =
    dbStatus === "Resolved" ? (res === "replaced" ? "replaced" : "refunded")
    : (dbStatus.toLowerCase() as AdminReturn["status"]);
  return {
    id: returnRef(r.id),
    orderId: r.order_id != null ? orderRef(r.order_id) : "—",
    customerName: String(r.customer ?? ""),
    customerEmail: r.customer_email ?? "",
    customerPhone: r.customer_phone ?? "",
    city: r.city ?? "",
    items: (Array.isArray(r.items) ? r.items : []) as AdminReturn["items"],
    reason: String(r.reason ?? "other") as AdminReturn["reason"],
    ...(r.reason_detail ? { reasonDetail: String(r.reason_detail) } : {}),
    status,
    refundAmount: toNum(r.refund_amount),
    restock: Boolean(r.restock),
    ...(r.inspection_note ? { inspectionNote: String(r.inspection_note) } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};
async function listReturns(params?: ListParams & { status?: AdminReturn["status"] | "all" }): Promise<Paginated<AdminReturn>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 20));
  const { data, error } = await supabase.from("returns").select("*").order("created_at", { ascending: false });
  if (error) fail("listReturns", error);
  let rows = (data ?? []) as Row[];
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => String(r.customer ?? "").toLowerCase().includes(q) || String(r.ref ?? "").toLowerCase().includes(q));
  if (params?.status && params.status !== "all") {
    rows = rows.filter((r) => rowToAdminReturn(r).status === params.status);
  }
  const total = rows.length;
  return pagenate(rows.slice((page - 1) * perPage, page * perPage).map(rowToAdminReturn), total, page, perPage);
}
async function getReturn(id: string): Promise<AdminReturn | undefined> {
  guard();
  const num = parseReturnId(id);
  const { data, error } = await supabase.from("returns").select("*").eq("id", num).maybeSingle();
  if (error) fail("getReturn", error);
  return data ? rowToAdminReturn(data) : undefined;
}
async function createReturn(input: NewReturnInput): Promise<AdminReturn | undefined> {
  guard();
  const orderId = parseOrderId(input.orderId);
  const { data: order, error: e1 } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (e1) fail("getOrder", e1);
  if (!order) return undefined;
  const o = order as Row;
  if (STAGE_TO_STATUS[o.stage] !== "delivered") {
    throw new Error("New ReturnInput rejected: the order must be delivered before a return can be opened.");
  }
  const orderItems = (Array.isArray(o.items) ? o.items : []) as { id: string; name: string; price: number; image?: string }[];
  const lines = input.items.map((line) => {
    const src = orderItems.find((it) => it.id === line.productId);
    return {
      id: line.productId,
      name: src?.name ?? line.productId,
      quantity: line.quantity,
      price: src?.price ?? 0,
      ...(src?.image ? { image: src.image } : {}),
    };
  });
  if (lines.length === 0) throw new Error("New ReturnInput rejected: at least one line is required.");
  const refundAmount = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const { data, error } = await supabase.from("returns").insert({
    order_id: orderId,
    customer: o.customer,
    customer_email: o.customer_email ?? null,
    customer_phone: o.customer_phone ?? null,
    city: o.city ?? null,
    items: lines as unknown as Json,
    reason: input.reason,
    reason_detail: input.reasonDetail ?? null,
    refund_amount: refundAmount,
    restock: input.restock ?? false,
    state: "Requested",
  }).select("*").single();
  if (error) fail("createReturn", error);
  const num = (data as Row).id as number;
  const ref = returnRef(num);
  await supabase.from("returns").update({ ref }).eq("id", num);
  return rowToAdminReturn({ ...(data as Row), ref });
}
async function updateReturn(id: string, patch: AdminReturnPatch): Promise<AdminReturn | undefined> {
  guard();
  const num = parseReturnId(id);
  const { data: current, error: e0 } = await supabase.from("returns").select("*").eq("id", num).maybeSingle();
  if (e0) fail("getReturn", e0);
  if (!current) return undefined;
  const cur = rowToAdminReturn(current as Row);
  const TERMINAL = ["refunded", "replaced", "rejected"];
  if (TERMINAL.includes(cur.status)) {
    throw new Error(`return ${id} is closed (${cur.status}) and cannot be edited.`);
  }
  const row: TablesUpdate<"returns"> = {};
  if (patch.inspectionNote !== undefined) row.inspection_note = patch.inspectionNote;
  if (patch.refundAmount !== undefined) row.refund_amount = Math.max(0, patch.refundAmount);
  if (patch.restock !== undefined) row.restock = patch.restock;
  if (patch.status !== undefined) {
    const mapped = RETURN_STATUS_TO_DB[patch.status];
    row.state = mapped.state;
    row.resolution = mapped.resolution ?? null;
  }
  // restock on receipt: decrement stock + movement per returned line
  const becomingReceived = patch.status === "received" && cur.status !== "received" && (patch.restock ?? cur.restock);
  if (Object.keys(row).length > 0) {
    const { error } = await supabase.from("returns").update(row).eq("id", num);
    if (error) fail("updateReturn", error);
  }
  if (becomingReceived) {
    for (const line of cur.items) {
      const { error: e3 } = await supabase.rpc("inventory_apply", {
        p_product_id: line.id,
        p_delta: Math.max(1, line.quantity),
        p_reason: "return_restock",
        p_note: `RMA ${id}`,
      });
      if (e3) {
        throw new Error(`Supabase: return ${id} was marked received but restock failed for ${line.id} — fix stock manually (catalog.manage capability required to post movements): ${e3.message}`);
      }
    }
  }
  return getReturn(id);
}
function listExchanges(_params?: ListParams & { status?: string | "all" }): Promise<Paginated<never>> {
  return Promise.reject(new SupabaseUnsupportedError("listExchanges — not wired: the exchanges domain has no table in convergence 0001 (Wave 4 after RMA stabilises)."));
}
function getExchange(_id: string): Promise<never | undefined> {
  return Promise.reject(new SupabaseUnsupportedError("getExchange — not wired (Wave 4)."));
}
function createExchange(_input: unknown): Promise<never> {
  return Promise.reject(new SupabaseUnsupportedError("createExchange — not wired (Wave 4)."));
}
function updateExchange(_id: string, _patch: unknown): Promise<never | undefined> {
  return Promise.reject(new SupabaseUnsupportedError("updateExchange — not wired (Wave 4)."));
}
function listClaims(_params?: ListParams & { status?: string | "all" }): Promise<Paginated<never>> {
  return Promise.reject(new SupabaseUnsupportedError("listClaims — not wired: warranty-claims domain has no table in convergence 0001 (Wave 4)."));
}
function getClaim(_id: string): Promise<never | undefined> {
  return Promise.reject(new SupabaseUnsupportedError("getClaim — not wired (Wave 4)."));
}
function createClaim(_input: unknown): Promise<never> {
  return Promise.reject(new SupabaseUnsupportedError("createClaim — not wired (Wave 4)."));
}
function updateClaim(_id: string, _patch: unknown): Promise<never | undefined> {
  return Promise.reject(new SupabaseUnsupportedError("updateClaim — not wired (Wave 4)."));
}
function listDraftOrders(_params?: ListParams & { status?: string | "all" }): Promise<Paginated<never>> {
  return Promise.reject(new SupabaseUnsupportedError("listDraftOrders — not wired: draft-orders have no table in convergence 0001 (Wave 2)."));
}
function getDraftOrder(_id: string): Promise<never | undefined> {
  return Promise.reject(new SupabaseUnsupportedError("getDraftOrder — not wired (Wave 2)."));
}
function createDraftOrder(_input: unknown): Promise<never> {
  return Promise.reject(new SupabaseUnsupportedError("createDraftOrder — not wired (Wave 2)."));
}
function updateDraftOrder(_id: string, _patch: unknown): Promise<never | undefined> {
  return Promise.reject(new SupabaseUnsupportedError("updateDraftOrder — not wired (Wave 2)."));
}
function deleteDraftOrder(_id: string): Promise<boolean> {
  return Promise.reject(new SupabaseUnsupportedError("deleteDraftOrder — not wired (Wave 2)."));
}
function convertDraftOrder(_id: string): Promise<AdminOrder> {
  return Promise.reject(new SupabaseUnsupportedError("convertDraftOrder — not wired: conversion must reprice via the order-submit EF (Wave 2)."));
}

/* ── quotes ─────────────────────────────────────────────────────────────── */
const QUOTE_REF = (id: number) => `QOT-${id}`;
const parseQuoteId = (s: string): number => {
  const m = String(s).match(/^QOT-(\d+)$/);
  const n = m ? Number(m[1]) : Number(s);
  if (!Number.isFinite(n)) throw new Error(`Supabase: quote id "${s}" is not a QOT-<n> reference`);
  return n;
};
const quoteTotals = (q: { subtotal: number; discountPct: number; shipping: number }) => {
  const sub = toNum(q.subtotal);
  const pct = Math.min(60, Math.max(0, toNum(q.discountPct)));
  const discountAmount = Math.round((sub * pct) / 100);
  const shipping = toNum(q.shipping);
  const total = Math.max(0, sub - discountAmount + shipping);
  return { discountPct: pct, discountAmount, total };
};
const rowToAdminQuote = (r: Row): AdminQuote => {
  const details = asObj(r.details);
  const items = (Array.isArray(r.items) ? r.items : []) as AdminQuote["items"];
  const subtotal = toNum(details.subtotal ?? r.subtotal);
  const shipping = toNum(details.shipping ?? r.shipping);
  const discountPct = toNum(details.discountPct);
  const { discountAmount, total } = quoteTotals({ subtotal, discountPct, shipping });
  return {
    id: QUOTE_REF(r.id),
    ...(details.leadId ? { leadId: String(details.leadId) } : {}),
    customerName: String(r.customer ?? ""),
    customerPhone: String(r.customer_phone ?? r.contact ?? ""),
    customerEmail: String(r.customer_email ?? r.contact ?? ""),
    ...(r.company ? { company: r.company } : {}),
    ...(r.city ? { city: r.city } : {}),
    ...(r.address ? { address: r.address } : {}),
    items,
    subtotal,
    discountPct,
    discountAmount: toNum(details.discountAmount, discountAmount),
    shipping,
    total: toNum(details.total ?? r.total ?? total),
    validityDays: toNum(details.validityDays, 7) || 7,
    validUntil: String(details.validUntil ?? new Date(toNum(Date.parse(r.created_at) || Date.now()) + 7 * 86400000).toISOString()),
    ...(r.note ? { notes: r.note } : {}),
    status: String(r.status ?? "draft") as QuoteStatus,
    ...(details.convertedOrderId ? { convertedOrderId: String(details.convertedOrderId) } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};
async function listQuotes(params?: ListParams & { status?: QuoteStatus | "all" }): Promise<Paginated<AdminQuote>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 20));
  const { data, error } = await supabase.from("quotes").select("*").order("created_at", { ascending: false });
  if (error) fail("listQuotes", error);
  let rows = (data ?? []) as Row[];
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.customer, r.contact, r.ref, r.company].some((v) => String(v ?? "").toLowerCase().includes(q)));
  if (params?.status && params.status !== "all") rows = rows.filter((r) => String(r.status) === params.status);
  const total = rows.length;
  return pagenate(rows.slice((page - 1) * perPage, page * perPage).map(rowToAdminQuote), total, page, perPage);
}
async function getQuote(id: string): Promise<AdminQuote | undefined> {
  guard();
  const num = parseQuoteId(id);
  const { data, error } = await supabase.from("quotes").select("*").eq("id", num).maybeSingle();
  if (error) fail("getQuote", error);
  return data ? rowToAdminQuote(data) : undefined;
}
async function createQuote(input: NewQuoteInput): Promise<AdminQuote> {
  guard();
  const baseDetail: Record<string, unknown> = {
    discountPct: toNum(input.discountPct),
    shipping: toNum(input.shipping),
    validityDays: toNum(input.validityDays, 7) || 7,
    ...(input.leadId ? { leadId: input.leadId } : {}),
  };
  const lines = (input.items ?? []) as unknown as AdminQuote["items"];
  const subtotal = lines.reduce((s, it) => s + toNum(it.price) * toNum(it.quantity), 0);
  const detail: Record<string, unknown> = { ...baseDetail, subtotal };
  const { discountPct, discountAmount, total } = quoteTotals({ subtotal, discountPct: toNum(detail.discountPct), shipping: toNum(detail.shipping) });
  detail.discountPct = discountPct;
  detail.discountAmount = discountAmount;
  detail.total = total;
  const { data, error } = await supabase.from("quotes").insert({
    customer: input.customerName,
    contact: input.customerEmail ?? input.customerPhone,
    customer_email: input.customerEmail ?? null,
    customer_phone: input.customerPhone,
    company: input.company ?? null,
    city: input.city ?? null,
    address: input.address ?? null,
    lead_id: input.leadId && /^lead-(\d+)$/.test(input.leadId) ? Number(input.leadId.replace("lead-", "")) : null,
    items: lines as unknown as Json,
    total,
    status: "draft",
    source: "admin",
    note: (input as { notes?: string }).notes ?? null,
    details: detail as Json,
  }).select("*").single();
  if (error) fail("createQuote", error);
  const id = (data as Row).id as number;
  await supabase.from("quotes").update({ ref: QUOTE_REF(id) }).eq("id", id);
  return rowToAdminQuote({ ...(data as Row), ref: QUOTE_REF(id) });
}
async function createQuoteFromLead(leadId: string): Promise<AdminQuote | undefined> {
  guard();
  const m = String(leadId).match(/(\d+)/);
  const num = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(num)) throw new Error(`createQuoteFromLead: lead id "${leadId}" carries no numeric id`);
  const { data: lead, error } = await supabase.from("leads").select("*").eq("id", num).maybeSingle();
  if (error) fail("getLead", error);
  if (!lead) return undefined;
  const l = lead as Row;
  const quote = await createQuote({
    leadId,
    customerName: l.name,
    customerPhone: String(l.phone ?? l.contact ?? ""),
    customerEmail: l.email ?? undefined,
    company: l.company ?? undefined,
    city: l.city ?? undefined,
    items: [],
    // line items + totals are negotiated afterwards; nothing invented here
  } as NewQuoteInput);
  // best-effort lead advance, loud-on-failure (crm.manage)
  const { error: e2 } = await supabase.from("leads").update({ status: "quoted" }).eq("id", num);
  if (e2) console.warn(`Supabase: quote ${quote.id} created but lead ${leadId} could not advance to 'quoted' (${e2.message}) — requires crm.manage`);
  return quote;
}
async function updateQuote(id: string, patch: AdminQuotePatch): Promise<AdminQuote | undefined> {
  guard();
  const num = parseQuoteId(id);
  const { data: current, error: e0 } = await supabase.from("quotes").select("*").eq("id", num).maybeSingle();
  if (e0) fail("getQuote", e0);
  if (!current) return undefined;
  const cur = current as Row;
  const details = { ...asObj(cur.details) };
  for (const k of ["discountPct", "shipping", "validityDays", "validUntil", "convertedOrderId", "leadId"]) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) details[k] = v;
  }
  const lines = patch.items ? (patch.items as unknown as AdminQuote["items"]) : (Array.isArray(cur.items) ? (cur.items as AdminQuote["items"]) : []);
  details.subtotal = lines.reduce((s2, it) => s2 + toNum(it.price) * toNum(it.quantity), 0);
  const { discountPct, discountAmount, total } = quoteTotals({
    subtotal: toNum(details.subtotal),
    discountPct: toNum(patch.discountPct ?? details.discountPct),
    shipping: toNum(patch.shipping ?? details.shipping),
  });
  details.discountPct = discountPct;
  details.discountAmount = discountAmount;
  details.total = total;
  const row: TablesUpdate<"quotes"> = {};
  if (patch.customerName !== undefined) row.customer = patch.customerName;
  if (patch.customerEmail !== undefined) row.customer_email = patch.customerEmail;
  if (patch.customerPhone !== undefined) row.customer_phone = patch.customerPhone;
  if (patch.company !== undefined) row.company = patch.company;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.notes !== undefined) row.note = patch.notes;
  if (patch.items !== undefined) row.items = patch.items as unknown as Json;
  if (patch.status !== undefined) row.status = patch.status;
  row.details = details as Json;
  row.total = total;
  const { error } = await supabase.from("quotes").update(row).eq("id", num);
  if (error) fail("updateQuote", error);
  return getQuote(id);
}
async function deleteQuote(id: string): Promise<boolean> {
  guard();
  const num = parseQuoteId(id);
  const { error } = await supabase.from("quotes").delete().eq("id", num);
  if (error) fail("deleteQuote", error);
  return true;
}
function convertQuote(_id: string, _paymentMethod?: string): Promise<never> {
  return Promise.reject(new SupabaseUnsupportedError("convertQuote — not wired: conversion must reprice from the live catalogue via the order-submit EF (price integrity), which is not deployed yet. Never builds an order from client-supplied prices."));
}

/* ── customers (clients) ─────────────────────────────────────────────────── */
async function listCustomers(params?: ListParams & { type?: "retail" | "business" }): Promise<Paginated<any>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 20));
  let q = supabase.from("clients").select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (params?.type) q = q.eq("kind", params.type);
  const s = params?.query?.trim();
  if (s) q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
  q = q.range((page - 1) * perPage, page * perPage - 1);
  const { data, count, error } = await q;
  if (error) fail("listCustomers", error);
  // light order aggregate per page — exact name match labeled "best effort"
  const names = ((data ?? []) as Row[]).map((r) => String(r.name).toLowerCase());
  const { data: agg } = await supabase.from("orders").select("customer, total");
  const sums = new Map<string, { n: number; total: number }>();
  for (const r of (agg ?? []) as { customer: string; total: number | string }[]) {
    const key = String(r.customer).toLowerCase();
    if (!names.includes(key)) continue;
    const cur = sums.get(key) ?? { n: 0, total: 0 };
    cur.n += 1; cur.total += toNum(r.total);
    sums.set(key, cur);
  }
  const items = ((data ?? []) as Row[]).map((r) => {
    const aggRow = sums.get(String(r.name).toLowerCase());
    return {
      id: `cust-${r.id}`,
      name: r.name,
      ...(r.company ? { company: r.company } : {}),
      email: r.email ?? "",
      phone: r.phone ?? "",
      city: r.city ?? "",
      type: (r.kind ?? "retail") as "retail" | "business",
      ordersCount: aggRow?.n ?? 0,
      totalSpent: aggRow?.total ?? 0,
      createdAt: r.created_at,
      tags: r.tags ?? [],
      notes: r.notes ?? undefined,
    };
  });
  return pagenate(items, count ?? items.length, page, perPage);
}
async function getCustomer(id: string): Promise<any | undefined> {
  guard();
  const num = Number(String(id).replace(/^cust-/, ""));
  if (!Number.isFinite(num)) return undefined;
  const { data, error } = await supabase.from("clients").select("*").eq("id", num).maybeSingle();
  if (error) fail("getCustomer", error);
  if (!data) return undefined;
  return (await listCustomers({ query: (data as Row).name, perPage: 1 })).items.find((c: any) => String((c as any).id) === `cust-${num}`)
    ?? { id: `cust-${num}`, name: (data as Row).name, email: (data as Row).email ?? "", phone: (data as Row).phone ?? "", city: (data as Row).city ?? "", type: (data as Row).kind ?? "retail", ordersCount: 0, totalSpent: 0, createdAt: (data as Row).created_at, tags: [], notes: undefined };
}

/* leads: capture must go through the lead-capture EF (anon cannot insert by
 * design); the admin lead pipeline reads/updates go through the clients/leads
 * capability policies. */
async function listLeads(params?: ListParams & { status?: AdminLead["status"] | "all"; type?: AdminLead["type"] | "all" }): Promise<Paginated<AdminLead>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 20));
  const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
  if (error) fail("listLeads", error);
  let rows = (data ?? []) as Row[];
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.name, r.company, r.contact, r.email, r.utm_campaign].some((v) => String(v ?? "").toLowerCase().includes(q)));
  if (params?.status && params.status !== "all") rows = rows.filter((r) => String(r.status ?? "new") === params.status);
  if (params?.type && params.type !== "all") rows = rows.filter((r) => String(r.type ?? "quote") === params.type);
  const total = rows.length;
  const items = rows.slice((page - 1) * perPage, page * perPage).map(rowToAdminLead);
  return pagenate(items, total, page, perPage);
}
const rowToAdminLead = (r: Row): AdminLead => ({
  id: `lead-${r.id}`,
  type: String(r.type ?? "quote") as AdminLead["type"],
  name: String(r.name ?? ""),
  ...(r.company ? { company: r.company } : {}),
  email: r.email ?? String(r.contact ?? ""),
  phone: String(r.phone ?? r.contact ?? ""),
  ...(r.city ? { city: r.city } : {}),
  summary: String(r.interest ?? ""),
  value: r.value !== null && r.value !== undefined ? toNum(r.value) : undefined,
  status: String(r.status ?? "new") as AdminLead["status"],
  createdAt: String(r.created_at),
  ...(r.contact_consent ? { consent: true } : {}),
  ...(r.consent_at ? { consentAt: r.consent_at } : {}),
  ...(r.consent_version ? { consentVersion: r.consent_version } : {}),
  ...(r.utm_source ? { utmSource: r.utm_source } : {}),
  ...(r.utm_medium ? { utmMedium: r.utm_medium } : {}),
  ...(r.utm_campaign ? { utmCampaign: r.utm_campaign } : {}),
  ...(r.landing_path ? { landingPath: r.landing_path } : {}),
  ...(r.referrer ? { referrer: r.referrer } : {}),
});
async function updateLeadStatus(id: string, status: AdminLead["status"], patch?: Partial<Pick<AdminLead, "summary">>): Promise<AdminLead | undefined> {
  guard();
  const num = Number(String(id).replace(/^lead-/, ""));
  if (!Number.isFinite(num)) return undefined;
  const row: TablesUpdate<"leads"> = { status };
  if (patch?.summary !== undefined) row.interest = patch.summary;
  const { data, error } = await supabase.from("leads").update(row).eq("id", num).select("*").maybeSingle();
  if (error) fail("updateLeadStatus", error);
  return data ? rowToAdminLead(data as Row) : undefined;
}
async function createLead(input: NewLeadInput): Promise<AdminLead> {
  guard();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lead-capture`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "") },
    body: JSON.stringify({
      type: input.type,
      name: input.name,
      company: input.company,
      email: input.email,
      phone: input.phone,
      city: input.city,
      interest: input.summary,
      value: input.value,
      source: (input as { source?: string }).source ?? "admin",
      landing_path: input.landingPath,
      referrer: input.referrer,
      utm_source: input.utmSource,
      utm_medium: input.utmMedium,
      utm_campaign: input.utmCampaign,
      consent: input.consent === true,
      consent_version: input.consentVersion,
    }),
  });
  const body = (await resp.json().catch(() => ({}))) as { ok?: boolean; id?: number | null; error?: string };
  if (!resp.ok) {
    throw new Error(`Supabase: lead capture failed (${resp.status}) — ${body.error ?? "the lead-capture function rejected the submission"}`);
  }
  return {
    id: body.id != null ? `lead-${body.id}` : `lead-${Date.now()}`,
    type: input.type,
    name: input.name,
    ...(input.company ? { company: input.company } : {}),
    email: input.email ?? "",
    phone: input.phone,
    ...(input.city ? { city: input.city } : {}),
    summary: input.summary,
    value: input.value,
    status: "new",
    createdAt: new Date().toISOString(),
    consent: input.consent,
    consentAt: input.consentAt,
    consentVersion: input.consentVersion,
    landingPath: input.landingPath,
    referrer: input.referrer,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
  };
}
function listCompanies(): Promise<never> {
  return Promise.reject(new SupabaseUnsupportedError("listCompanies — not wired: the B2B companies master table does not exist in convergence 0001 (Wave 2); derive accounts from clients.kind='business' for now."));
}

/* ── settings (single-row app_settings) ─────────────────────────────────── */
async function getSettings(): Promise<StoreSettings> {
  guard();
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", "store").maybeSingle();
  if (error) fail("getSettings", error);
  const v = asObj((data?.value as Json) ?? null);
  return v as unknown as StoreSettings;
}
async function saveSettings(settings: StoreSettings): Promise<StoreSettings> {
  guard();
  const { error } = await supabase.from("app_settings")
    .upsert({ key: "store", value: settings as unknown as Json, updated_at: new Date().toISOString() });
  if (error) fail("saveSettings", error);
  return settings;
}
function resetDemoData(): Promise<void> {
  return Promise.reject(new SupabaseUnsupportedError("resetDemoData — refuses to run anywhere but the browser demo (destructive)."));
}

/* ── catalog kit ─────────────────────────────────────────────────────────── */
const nextPrefixedId = async (table: TableName, prefix: string, seed = 1000): Promise<string> => {
  const { data } = await supabase.from(table).select("id");
  let max = 0;
  for (const r of (data ?? []) as unknown as { id: string }[]) {
    const m = String(r.id).match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${seed + max + 1}`;
};
const mergePayload = async (table: PayloadTable, id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const { data, error } = await supabase.from(table).select("*").eq("id", id).single();
  if (error) fail(`${table} read`, error);
  const prev = asObj((data as Row).payload as Json);
  const merged = { ...prev, ...patch };
  const patchRow = { payload: merged } as unknown as TablesUpdate<PayloadTable>;
  const { error: e2 } = await supabase.from(table).update(patchRow as never).eq("id", id);
  if (e2) fail(`${table} payload write`, e2);
  return merged;
};
const readRows = async <T>(table: TableName, toModel: (r: Row) => T, orderBy = "created_at"): Promise<T[]> => {
  const { data, error } = await supabase.from(table).select("*").order(orderBy, { ascending: false });
  if (error) fail(`${table} list`, error);
  return ((data ?? []) as Row[]).map(toModel);
};

/* ── suppliers + POs ─────────────────────────────────────────────────────── */
const rowToSupplier = (r: Row): AdminSupplier => {
  const p = asObj(r.payload);
  return {
    id: r.id,
    name: r.name,
    ...(r.contact_name ? { contactName: r.contact_name } : {}),
    ...(r.email ? { email: r.email } : {}),
    ...(r.phone ? { phone: r.phone } : {}),
    ...(r.city ? { city: r.city } : {}),
    ...(p.address ? { address: String(p.address) } : {}),
    ...(p.taxId ? { taxId: String(p.taxId) } : {}),
    paymentTerms: String(p.paymentTerms ?? "net30") as AdminSupplier["paymentTerms"],
    ...(p.notes ? { notes: String(p.notes) } : {}),
    active: p.active !== false,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
};
const supplierInputToRow = (input: NewSupplierInput | AdminSupplierPatch) => {
  const p: Record<string, unknown> = {};
  if ("address" in input && input.address !== undefined) p.address = input.address;
  if ("taxId" in input && input.taxId !== undefined) p.taxId = input.taxId;
  if ("paymentTerms" in input && input.paymentTerms !== undefined) p.paymentTerms = input.paymentTerms;
  if ("notes" in input && input.notes !== undefined) p.notes = input.notes;
  if ("active" in input && input.active !== undefined) p.active = input.active;
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...("contactName" in input && input.contactName !== undefined && { contact_name: input.contactName }),
    ...("email" in input && input.email !== undefined && { email: input.email }),
    ...("phone" in input && input.phone !== undefined && { phone: input.phone }),
    ...("city" in input && input.city !== undefined && { city: input.city }),
  };
};

async function listSuppliers(params?: ListParams & { active?: "all" | "active" | "inactive" }): Promise<AdminSupplier[]> {
  guard();
  const rows = await readRows("suppliers", rowToSupplier);
  const q = params?.query?.trim().toLowerCase();
  let filtered = q ? rows.filter((r) => [r.name, r.contactName, r.email, r.city].some((v) => String(v ?? "").toLowerCase().includes(q))) : rows;
  if (params?.active === "active") filtered = filtered.filter((r) => r.active);
  else if (params?.active === "inactive") filtered = filtered.filter((r) => !r.active);
  return filtered;
}
async function createSupplier(input: NewSupplierInput): Promise<AdminSupplier> {
  guard();
  const id = await nextPrefixedId("suppliers", "SUP");
  const base = supplierInputToRow(input as NewSupplierInput);
  const row = {
    id,
    name: input.name,
    contact_name: (base as Row).contact_name ?? null,
    email: (base as Row).email ?? null,
    phone: (base as Row).phone ?? null,
    city: (base as Row).city ?? null,
    payload: {
      address: (input as NewSupplierInput).address ?? null,
      taxId: (input as NewSupplierInput).taxId ?? null,
      paymentTerms: input.paymentTerms ?? "net30",
      notes: (input as NewSupplierInput).notes ?? null,
      active: true,
    } as Json,
  };
  const { data, error } = await supabase.from("suppliers").insert(row).select("*").single();
  if (error) fail("createSupplier", error);
  return rowToSupplier(data as Row);
}
async function updateSupplier(id: string, patch: AdminSupplierPatch): Promise<AdminSupplier | undefined> {
  guard();
  const base = supplierInputToRow(patch);
  const patchKeys = Object.keys(base);
  if (patchKeys.length) {
    const { error } = await supabase.from("suppliers").update(base).eq("id", id);
    if (error) fail("updateSupplier", error);
  }
  if (patch.address !== undefined || patch.taxId !== undefined || patch.paymentTerms !== undefined || patch.notes !== undefined || patch.active !== undefined) {
    const merged = await mergePayload("suppliers", id, {
      ...(patch.address !== undefined && { address: patch.address }),
      ...(patch.taxId !== undefined && { taxId: patch.taxId }),
      ...(patch.paymentTerms !== undefined && { paymentTerms: patch.paymentTerms }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(patch.active !== undefined && { active: patch.active }),
    });
    void merged;
  }
  const { data, error } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  if (error) fail("getSupplier", error);
  return data ? rowToSupplier(data) : undefined;
}
async function deleteSupplier(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) {
    // FK restrict or RLS deny — never fabricate a destructive "ok"
    console.warn(`Supabase: deleteSupplier(${id}) refused — ${error.message}`);
    return false;
  }
  return true;
}
const PO_STATUS_DB: Record<string, string> = { draft: "Draft", sent: "Sent", partial: "Partial", received: "Received", cancelled: "Cancelled" };
const PO_STATUS_CLIENT: Record<string, AdminPurchaseOrder["status"]> = { Draft: "draft", Sent: "sent", Partial: "partial", Received: "received", Cancelled: "cancelled" };
const rowToPO = (r: Row): AdminPurchaseOrder => {
  const lines = (Array.isArray(r.items) ? r.items : []) as AdminPurchaseOrder["lines"];
  return {
    id: r.id,
    supplierId: r.supplier_id,
    supplierName: String(r.supplier_name ?? ""),
    lines,
    subtotal: toNum(lines.reduce((s, l) => s + toNum(l.costPrice) * toNum(l.quantity), 0)),
    ...(r.expected_at ? { expectedDate: String(r.expected_at).slice(0, 10) } : {}),
    ...(r.notes ? { notes: r.notes } : {}),
    status: PO_STATUS_CLIENT[String(r.status)] ?? "draft",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.received_at ? { receivedAt: r.received_at } : {}),
  };
};
const poLinesInput = (lines: NewPurchaseOrderLineInput[]): AdminPurchaseOrder["lines"] =>
  lines.map((l, i) => ({
    id: `line-${Date.now()}-${i}`,
    ...(l.productId ? { productId: l.productId } : {}),
    name: l.name,
    ...(l.sku ? { sku: l.sku } : {}),
    ...(l.image ? { image: l.image } : {}),
    costPrice: Math.max(0, toNum(l.costPrice)),
    quantity: Math.max(1, Math.round(toNum(l.quantity, 1))),
    receivedQuantity: 0,
  }));
async function listPurchaseOrders(params?: ListParams & { status?: AdminPurchaseOrder["status"] | "all" }): Promise<Paginated<AdminPurchaseOrder>> {
  guard();
  const page = Math.max(1, params?.page ?? 1), perPage = params?.perPage ?? 50;
  const { data, error } = await supabase.from("purchase_orders")
    .select("*, supplier:suppliers(name)").order("created_at", { ascending: false });
  if (error) fail("listPurchaseOrders", error);
  let rows: Row[] = ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, supplier_name: (r as Row).supplier?.name }));
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => String(r.id).toLowerCase().includes(q) || String(r.supplier?.name ?? "").toLowerCase().includes(q));
  if (params?.status && params.status !== "all") rows = rows.filter((r) => String(r.status) === PO_STATUS_DB[params.status!]);
  const total = rows.length;
  return pagenate(rows.slice((page - 1) * perPage, page * perPage).map(rowToPO), total, page, perPage);
}
async function getPurchaseOrder(id: string): Promise<AdminPurchaseOrder | undefined> {
  guard();
  const { data, error } = await supabase.from("purchase_orders").select("*, supplier:suppliers(name)").eq("id", id).maybeSingle();
  if (error) fail("getPurchaseOrder", error);
  return data ? rowToPO({ ...(data as unknown as Row), supplier_name: (data as unknown as Row).supplier?.name }) : undefined;
}
async function createPurchaseOrder(input: NewPurchaseOrderInput): Promise<AdminPurchaseOrder> {
  guard();
  const id = await nextPrefixedId("purchase_orders", "PO");
  const lines = poLinesInput(input.lines ?? []);
  const subtotal = lines.reduce((s, l) => s + l.costPrice * l.quantity, 0);
  const status = input.status === "sent" ? "Sent" : "Draft";
  const { data, error } = await supabase.from("purchase_orders").insert({
    id,
    supplier_id: input.supplierId,
    status,
    items: lines as unknown as Json,
    total: subtotal,
    expected_at: input.expectedDate ?? null,
    notes: input.notes ?? null,
  }).select("*, supplier:suppliers(name)").single();
  if (error) fail("createPurchaseOrder", error);
  return rowToPO({ ...(data as unknown as Row), supplier_name: (data as unknown as Row).supplier?.name });
}
async function updatePurchaseOrder(id: string, patch: AdminPurchaseOrderPatch): Promise<AdminPurchaseOrder | undefined> {
  guard();
  const { data: cur, error: e0 } = await supabase.from("purchase_orders").select("*").eq("id", id).maybeSingle();
  if (e0) fail("getPurchaseOrder", e0);
  if (!cur) return undefined;
  const row: TablesUpdate<"purchase_orders"> = {};
  if (patch.supplierId !== undefined) row.supplier_id = patch.supplierId;
  if (patch.expectedDate !== undefined) row.expected_at = patch.expectedDate;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.lines !== undefined) {
    const lines = poLinesInput(patch.lines);
    row.items = lines as unknown as Json;
    row.total = lines.reduce((s, l) => s + l.costPrice * l.quantity, 0);
  }
  if (Object.keys(row).length) {
    const { error } = await supabase.from("purchase_orders").update(row).eq("id", id);
    if (error) fail("updatePurchaseOrder", error);
  }
  return getPurchaseOrder(id);
}
async function setPurchaseOrderStatus(id: string, status: PurchaseOrderStatus): Promise<AdminPurchaseOrder | undefined> {
  guard();
  const { error } = await supabase.from("purchase_orders").update({ status: PO_STATUS_DB[status] }).eq("id", id);
  if (error) fail("setPurchaseOrderStatus", error);
  return getPurchaseOrder(id);
}
async function receivePurchaseOrder(id: string, receipts: PurchaseOrderReceipt[]): Promise<AdminPurchaseOrder | undefined> {
  guard();
  const po = await getPurchaseOrder(id);
  if (!po) return undefined;
  const lines = po.lines.map((l) => ({ ...l }));
  for (const receipt of receipts ?? []) {
    const line = lines.find((l) => l.id === receipt.lineId);
    if (!line) continue;
    const room = Math.max(0, line.quantity - line.receivedQuantity);
    const take = Math.min(room, Math.max(0, Math.round(toNum(receipt.quantity))));
    if (take <= 0) continue;
    line.receivedQuantity += take;
    if (line.productId) {
      const { error } = await supabase.rpc("inventory_apply", {
        p_product_id: line.productId,
        p_delta: take,
        p_reason: "po_receipt",
        p_note: `PO ${id}`,
      });
      if (error) throw new Error(`Supabase: stock receipt for ${line.productId} failed — PO ${id} stays unposted for that line: ${error.message}`);
    }
  }
  const allReceived = lines.every((l) => l.receivedQuantity >= l.quantity);
  const anyReceived = lines.some((l) => l.receivedQuantity > 0);
  const nextStatus = allReceived ? "Received" : anyReceived ? "Partial" : PO_STATUS_DB[po.status];
  const { error: e2 } = await supabase.from("purchase_orders").update({
    items: lines as unknown as Json,
    status: nextStatus,
    ...(allReceived ? { received_at: new Date().toISOString() } : {}),
  }).eq("id", id);
  if (e2) fail("receivePurchaseOrder", e2);
  return getPurchaseOrder(id);
}
async function deletePurchaseOrder(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
  if (error) { console.warn(`Supabase: deletePurchaseOrder(${id}) refused — ${error.message}`); return false; }
  return true;
}

/* ── stock transfers + locations ─────────────────────────────────────────── */
const TRANSFER_STATUS_DB: Record<string, string> = { draft: "Requested", in_transit: "In transit", received: "Received", cancelled: "Cancelled" };
const TRANSFER_STATUS_CLIENT: Record<string, AdminStockTransfer["status"]> = { Requested: "draft", "In transit": "in_transit", Received: "received", Cancelled: "cancelled" };
const LOCATION_FALLBACK: Record<string, string> = { main: "Factory Warehouse", "loc-warehouse": "Factory Warehouse", showroom: "Showroom" };
const showroomNameCache = new Map<string, string>();
const locationName = async (id: string): Promise<string> => {
  if (LOCATION_FALLBACK[id]) return LOCATION_FALLBACK[id];
  if (showroomNameCache.has(id)) return showroomNameCache.get(id)!;
  const { data } = await supabase.from("showrooms").select("payload").eq("id", id).maybeSingle();
  const name = asObj((data as Row | undefined)?.payload as Json).name;
  const resolved = typeof name === "string" && name ? `${name} Showroom` : id;
  showroomNameCache.set(id, resolved);
  return resolved;
};
const rowToTransfer = (r: Row, fromName: string, toName: string): AdminStockTransfer => ({
  id: r.id,
  fromLocationId: r.from_zone,
  fromLocationName: fromName,
  toLocationId: r.to_zone,
  toLocationName: toName,
  lines: (Array.isArray(r.items) ? r.items : []) as AdminStockTransfer["lines"],
  status: TRANSFER_STATUS_CLIENT[String(r.status)] ?? "draft",
  ...(r.notes ? { notes: r.notes } : {}),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.received_at ? { receivedAt: r.received_at } : {}),
});
async function getTransferLocations() {
  guard();
  const { data, error } = await supabase.from("showrooms").select("id, payload");
  if (error) fail("getTransferLocations", error);
  const locs: TransferLocation[] = [{ id: "main", name: "Factory Warehouse", kind: "warehouse" }];
  for (const r of (data ?? []) as Row[]) {
    const p = asObj(r.payload);
    locs.push({ id: String(r.id), name: `${String(p.name ?? r.id)} Showroom`, kind: "showroom" as const });
  }
  return locs;
}
async function listStockTransfers(params?: ListParams & { status?: AdminStockTransfer["status"] | "all" }): Promise<Paginated<AdminStockTransfer>> {
  guard();
  const page = Math.max(1, params?.page ?? 1), perPage = params?.perPage ?? 50;
  const { data, error } = await supabase.from("stock_transfers").select("*").order("created_at", { ascending: false });
  if (error) fail("listStockTransfers", error);
  let rows = (data ?? []) as Row[];
  if (params?.status && params.status !== "all") rows = rows.filter((r) => String(r.status) === TRANSFER_STATUS_DB[params.status!]);
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => String(r.id).toLowerCase().includes(q));
  const slice = rows.slice((page - 1) * perPage, page * perPage);
  const items = await Promise.all(slice.map(async (r) => rowToTransfer(r, await locationName(r.from_zone), await locationName(r.to_zone))));
  return pagenate(items, rows.length, page, perPage);
}
async function getStockTransfer(id: string): Promise<AdminStockTransfer | undefined> {
  guard();
  const { data, error } = await supabase.from("stock_transfers").select("*").eq("id", id).maybeSingle();
  if (error) fail("getStockTransfer", error);
  if (!data) return undefined;
  return rowToTransfer(data as Row, await locationName((data as Row).from_zone), await locationName((data as Row).to_zone));
}
async function createStockTransfer(input: NewStockTransferInput): Promise<AdminStockTransfer> {
  guard();
  const id = await nextPrefixedId("stock_transfers", "TRF");
  const lines = (input.lines ?? []).map((l, i) => ({
    id: `line-${Date.now()}-${i}`,
    productId: l.productId,
    name: l.name,
    ...(l.sku ? { sku: l.sku } : {}),
    ...(l.image ? { image: l.image } : {}),
    quantity: Math.max(1, Math.round(toNum(l.quantity, 1))),
    receivedQuantity: 0,
  }));
  const { data, error } = await supabase.from("stock_transfers").insert({
    id,
    from_zone: input.fromLocationId,
    to_zone: input.toLocationId,
    status: "Requested",
    items: lines as unknown as Json,
    notes: input.notes ?? null,
  }).select("*").single();
  if (error) fail("createStockTransfer", error);
  const r = data as Row;
  return rowToTransfer(r, await locationName(r.from_zone), await locationName(r.to_zone));
}
async function updateStockTransfer(id: string, patch: AdminStockTransferPatch): Promise<AdminStockTransfer | undefined> {
  guard();
  const row: TablesUpdate<"stock_transfers"> = {};
  if (patch.fromLocationId !== undefined) row.from_zone = patch.fromLocationId;
  if (patch.toLocationId !== undefined) row.to_zone = patch.toLocationId;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.lines !== undefined) {
    row.items = patch.lines.map((l, i) => ({
      id: (l as { id?: string }).id ?? `line-${Date.now()}-${i}`,
      productId: l.productId,
      name: l.name,
      ...(l.sku ? { sku: l.sku } : {}),
      ...(l.image ? { image: l.image } : {}),
      quantity: Math.max(1, Math.round(toNum(l.quantity, 1))),
      receivedQuantity: (l as { receivedQuantity?: number }).receivedQuantity ?? 0,
    })) as unknown as Json;
  }
  if (Object.keys(row).length === 0) return getStockTransfer(id);
  const { error } = await supabase.from("stock_transfers").update(row).eq("id", id);
  if (error) fail("updateStockTransfer", error);
  return getStockTransfer(id);
}
async function dispatchStockTransfer(id: string): Promise<AdminStockTransfer | undefined> {
  guard();
  const { error } = await supabase.from("stock_transfers").update({ status: "In transit" }).eq("id", id);
  if (error) fail("dispatchStockTransfer", error);
  return getStockTransfer(id);
}
async function receiveStockTransfer(id: string, receipts: StockTransferReceipt[]): Promise<AdminStockTransfer | undefined> {
  guard();
  const cur = await getStockTransfer(id);
  if (!cur) return undefined;
  const lines = cur.lines.map((l) => ({ ...l }));
  let any = false, all = true;
  for (const line of lines) {
    const receipt = (receipts ?? []).find((r) => r.lineId === line.id);
    if (receipt) {
      const room = Math.max(0, line.quantity - line.receivedQuantity);
      const take = Math.min(room, Math.max(0, Math.round(toNum(receipt.quantity))));
      line.receivedQuantity += take;
      any = any || take > 0;
    }
    if (line.receivedQuantity < line.quantity) all = false;
  }
  const { error } = await supabase.from("stock_transfers").update({
    items: lines as unknown as Json,
    status: all ? "Received" : any ? "In transit" : TRANSFER_STATUS_DB[cur.status],
    ...(all ? { received_at: new Date().toISOString() } : {}),
  }).eq("id", id);
  if (error) fail("receiveStockTransfer", error);
  return getStockTransfer(id);
}
async function deleteStockTransfer(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("stock_transfers").delete().eq("id", id);
  if (error) { console.warn(`Supabase: deleteStockTransfer(${id}) refused — ${error.message}`); return false; }
  return true;
}

/* ── option sets ─────────────────────────────────────────────────────────── */
const rowToOptionSet = (r: Row): AdminOptionSet => {
  const p = asObj(r.payload);
  return {
    id: r.id,
    name: r.name,
    values: (Array.isArray(p.values) ? p.values : []) as AdminOptionSet["values"],
    createdAt: String(p.createdAt ?? r.created_at),
    updatedAt: String(p.updatedAt ?? r.updated_at ?? r.created_at),
  };
};
async function listOptionSets(): Promise<AdminOptionSet[]> {
  guard();
  return readRows("option_sets", rowToOptionSet, "created_at");
}
async function createOptionSet(input: NewOptionSetInput): Promise<AdminOptionSet> {
  guard();
  const id = `optset-${Date.now()}`;
  const now = new Date().toISOString();
  const values = (input.values ?? []).map((v) => ({
    id: v.id ?? `opt-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    label: v.label,
    priceDelta: toNum(v.priceDelta),
    ...(v.skuSuffix ? { skuSuffix: v.skuSuffix } : {}),
  }));
  const { data, error } = await supabase.from("option_sets").insert({
    id, name: input.name,
    payload: { values, createdAt: now, updatedAt: now } as unknown as Json,
  }).select("*").single();
  if (error) fail("createOptionSet", error);
  return rowToOptionSet(data as Row);
}
async function updateOptionSet(id: string, patch: Partial<NewOptionSetInput & { name?: string }>): Promise<AdminOptionSet | undefined> {
  guard();
  const merged = await mergePayload("option_sets", id, {
    ...(patch.values !== undefined && { values: patch.values }),
    updatedAt: new Date().toISOString(),
  });
  void merged;
  if (patch.name !== undefined) {
    const { error } = await supabase.from("option_sets").update({ name: patch.name }).eq("id", id);
    if (error) fail("updateOptionSet", error);
  }
  const { data, error } = await supabase.from("option_sets").select("*").eq("id", id).maybeSingle();
  if (error) fail("getOptionSet", error);
  return data ? rowToOptionSet(data) : undefined;
}
async function deleteOptionSet(id: string): Promise<boolean> {
  guard();
  const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).contains("payload", {});
  void count; // contains-match can't express array membership portably from the client; rely on RLS refusal instead
  const { error } = await supabase.from("option_sets").delete().eq("id", id);
  return !error;
}

/* ── price lists ─────────────────────────────────────────────────────────── */
const rowToPriceList = (r: Row): AdminPriceList => {
  const p = asObj(r.payload);
  return {
    id: r.id,
    name: r.name,
    ...(p.description ? { description: String(p.description) } : {}),
    status: String(r.status ?? "active") as AdminPriceList["status"],
    audience: String(p.audience ?? "all_b2b") as AdminPriceList["audience"],
    companyIds: Array.isArray(p.companyIds) ? (p.companyIds as string[]) : [],
    target: String(p.target ?? "all_products") as AdminPriceList["target"],
    categoryIds: Array.isArray(p.categoryIds) ? (p.categoryIds as string[]) : [],
    discountPct: Math.min(60, Math.max(0, toNum(p.discountPct))),
    ...(p.startsAt ? { startsAt: String(p.startsAt) } : {}),
    ...(p.endsAt ? { endsAt: String(p.endsAt) } : {}),
    createdAt: String(p.createdAt ?? r.created_at),
    updatedAt: String(p.updatedAt ?? r.updated_at ?? r.created_at),
  };
};
async function listPriceLists(): Promise<AdminPriceList[]> {
  guard();
  return readRows("price_lists", rowToPriceList);
}
async function createPriceList(input: NewAdminPriceListInput): Promise<AdminPriceList> {
  guard();
  const id = await nextPrefixedId("price_lists", "B2B", 0);
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("price_lists").insert({
    id,
    name: input.name,
    status: "active",
    payload: {
      description: (input as { description?: string }).description,
      audience: input.audience,
      companyIds: input.companyIds ?? [],
      target: input.target,
      categoryIds: input.categoryIds ?? [],
      discountPct: input.discountPct,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      createdAt: now,
      updatedAt: now,
    } as Json,
  }).select("*").single();
  if (error) fail("createPriceList", error);
  return rowToPriceList(data as Row);
}
async function updatePriceList(id: string, patch: Partial<NewAdminPriceListInput>): Promise<AdminPriceList | undefined> {
  guard();
  const base: TablesUpdate<"price_lists"> = {};
  if (patch.name !== undefined) base.name = patch.name;
  if (Object.keys(base).length) {
    const { error } = await supabase.from("price_lists").update(base).eq("id", id);
    if (error) fail("updatePriceList", error);
  }
  const doc: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ["description", "audience", "companyIds", "target", "categoryIds", "discountPct", "startsAt", "endsAt"] as const) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) doc[k] = v;
  }
  await mergePayload("price_lists", id, doc);
  const { data, error } = await supabase.from("price_lists").select("*").eq("id", id).maybeSingle();
  if (error) fail("getPriceList", error);
  return data ? rowToPriceList(data) : undefined;
}
async function setPriceListStatus(id: string, status: PriceListStatus): Promise<AdminPriceList | undefined> {
  guard();
  const { data, error } = await supabase.from("price_lists").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select("*").maybeSingle();
  if (error) fail("setPriceListStatus", error);
  return data ? rowToPriceList(data as Row) : undefined;
}
async function deletePriceList(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("price_lists").delete().eq("id", id);
  return !error;
}

/* ── bundles ─────────────────────────────────────────────────────────────── */
const rowToBundle = (r: Row): AdminBundle => {
  const p = asObj(r.payload);
  return {
    id: r.id,
    name: r.name,
    ...(p.description ? { description: String(p.description) } : {}),
    status: String(p.status ?? "active") as AdminBundle["status"],
    image: String(p.image ?? "bundle-default"),
    lines: (Array.isArray(p.lines) ? p.lines : []) as AdminBundle["lines"],
    discountPct: Math.min(60, Math.max(0, toNum(p.discountPct))),
    popular: p.popular === true,
    sortOrder: toNum(p.sortOrder),
    createdAt: String(p.createdAt ?? r.created_at),
    updatedAt: String(p.updatedAt ?? r.updated_at ?? r.created_at),
  };
};
async function listBundles(): Promise<AdminBundle[]> {
  guard();
  return readRows("bundles", rowToBundle).then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder));
}
async function createBundle(input: NewAdminBundleInput): Promise<AdminBundle> {
  guard();
  const id = `bundle-${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("bundles").insert({
    id,
    name: input.name,
    payload: {
      description: input.description, status: "draft", image: input.image,
      lines: input.lines ?? [], discountPct: input.discountPct,
      popular: input.popular ?? false, sortOrder: input.sortOrder ?? 0,
      createdAt: now, updatedAt: now,
    } as unknown as Json,
  }).select("*").single();
  if (error) fail("createBundle", error);
  return rowToBundle(data as Row);
}
async function updateBundle(id: string, patch: Partial<NewAdminBundleInput>): Promise<AdminBundle | undefined> {
  guard();
  if (patch.name !== undefined) {
    const { error } = await supabase.from("bundles").update({ name: patch.name }).eq("id", id);
    if (error) fail("updateBundle", error);
  }
  const doc: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const k of ["description", "status", "image", "lines", "discountPct", "popular", "sortOrder"] as const) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) doc[k] = v;
  }
  await mergePayload("bundles", id, doc);
  const { data, error } = await supabase.from("bundles").select("*").eq("id", id).maybeSingle();
  if (error) fail("getBundle", error);
  return data ? rowToBundle(data) : undefined;
}
async function setBundleStatus(id: string, status: AdminBundle["status"]): Promise<AdminBundle | undefined> {
  guard();
  await mergePayload("bundles", id, { status, updatedAt: new Date().toISOString() });
  const { data, error } = await supabase.from("bundles").select("*").eq("id", id).maybeSingle();
  if (error) fail("getBundle", error);
  return data ? rowToBundle(data) : undefined;
}
async function deleteBundle(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("bundles").delete().eq("id", id);
  return !error;
}

/* ── sales channels ──────────────────────────────────────────────────────── */
const rowToChannel = (r: Row): AdminSalesChannel => {
  const p = asObj(r.payload);
  return {
    id: r.id,
    name: r.name,
    kind: String(r.kind ?? "web") as AdminSalesChannel["kind"],
    ...(p.description ? { description: String(p.description) } : {}),
    enabled: p.enabled !== false,
    sortOrder: toNum(p.sortOrder),
    createdAt: String(p.createdAt ?? r.created_at),
    updatedAt: String(p.updatedAt ?? r.updated_at ?? r.created_at),
  };
};
async function listSalesChannels(): Promise<AdminSalesChannel[]> {
  guard();
  const rows = await readRows("sales_channels", rowToChannel);
  return rows.sort((a, b) => a.sortOrder - b.sortOrder);
}
async function createSalesChannel(input: NewSalesChannelInput): Promise<AdminSalesChannel> {
  guard();
  const id = `ch-${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("sales_channels").insert({
    id,
    name: input.name,
    kind: input.kind,
    payload: {
      description: (input as Partial<NewSalesChannelInput>).description,
      enabled: true,
      sortOrder: (input as Partial<NewSalesChannelInput>).sortOrder ?? 0,
      createdAt: now, updatedAt: now,
    } as Json,
  }).select("*").single();
  if (error) fail("createSalesChannel", error);
  return rowToChannel(data);
}
async function updateSalesChannel(id: string, patch: Partial<NewSalesChannelInput>): Promise<AdminSalesChannel | undefined> {
  guard();
  const base: TablesUpdate<"sales_channels"> = {};
  if (patch.name !== undefined) base.name = patch.name;
  if (patch.kind !== undefined) base.kind = patch.kind;
  if (Object.keys(base).length) {
    const { error } = await supabase.from("sales_channels").update(base).eq("id", id);
    if (error) fail("updateSalesChannel", error);
  }
  const doc: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.description !== undefined) doc.description = patch.description;
  if (patch.enabled !== undefined) doc.enabled = patch.enabled;
  if (patch.sortOrder !== undefined) doc.sortOrder = patch.sortOrder;
  await mergePayload("sales_channels", id, doc);
  const { data, error } = await supabase.from("sales_channels").select("*").eq("id", id).maybeSingle();
  if (error) fail("getSalesChannel", error);
  return data ? rowToChannel(data) : undefined;
}
async function setSalesChannelEnabled(id: string, enabled: boolean): Promise<AdminSalesChannel | undefined> {
  return updateSalesChannel(id, { enabled } as Partial<NewSalesChannelInput>);
}
async function deleteSalesChannel(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("sales_channels").delete().eq("id", id);
  return !error;
}
function getChannelSales(): Promise<Array<{ channelId: string; orders: number; revenue: number }>> {
  return Promise.reject(new SupabaseUnsupportedError("getChannelSales — not wired: orders carry no channel attribution column in convergence 0001; adding one without a story for historic orders would fabricate attribution. Tracked as Wave-2 schema work."));
}

/* ── showrooms / series / brands ─────────────────────────────────────────── */
const rowToShowroom = (r: Row): AdminShowroom => {
  const p = asObj(r.payload);
  return { id: r.id, ...p, createdAt: String(p.createdAt ?? r.created_at), updatedAt: String(p.updatedAt ?? r.updated_at ?? r.created_at) } as unknown as AdminShowroom;
};
async function listShowrooms(): Promise<AdminShowroom[]> { return readRows("showrooms", rowToShowroom); }
async function createShowroom(input: NewShowroomInput): Promise<AdminShowroom> {
  guard();
  const id = `showroom-${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("showrooms").insert({
    id,
    payload: { ...(input as unknown as Record<string, unknown>), active: true, createdAt: now, updatedAt: now } as unknown as Json,
  }).select("*").single();
  if (error) fail("createShowroom", error);
  return rowToShowroom(data as Row);
}
async function updateShowroom(id: string, patch: Partial<NewShowroomInput>): Promise<AdminShowroom | undefined> {
  guard();
  await mergePayload("showrooms", id, { ...(patch as Record<string, unknown>), updatedAt: new Date().toISOString() });
  const { data, error } = await supabase.from("showrooms").select("*").eq("id", id).maybeSingle();
  if (error) fail("getShowroom", error);
  return data ? rowToShowroom(data) : undefined;
}
async function setShowroomActive(id: string, active: boolean): Promise<AdminShowroom | undefined> {
  return updateShowroom(id, { active } as unknown as Partial<NewShowroomInput>);
}
async function deleteShowroom(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("showrooms").delete().eq("id", id);
  return !error;
}
const rowToSeries = (r: Row): AdminSeries => ({
  ...(asObj(r.payload) as object),
  id: r.id,
  name: r.name,
  ...(r.collection_id ? { collectionId: r.collection_id } : {}),
  createdAt: String(asObj(r.payload).createdAt ?? r.created_at ?? ""),
  updatedAt: String(asObj(r.payload).updatedAt ?? r.updated_at ?? r.created_at ?? ""),
} as unknown as AdminSeries);
async function listSeries(): Promise<AdminSeries[]> { return readRows("series", rowToSeries); }
async function createSeries(input: NewSeriesInput): Promise<AdminSeries> {
  guard();
  const id = `series-${Date.now()}`;
  const now = new Date().toISOString();
  const { collectionId, name, ...rest } = input as unknown as Record<string, unknown> & { name?: string; collectionId?: string };
  const { data, error } = await supabase.from("series").insert({
    id,
    name: String(name ?? "Untitled series"),
    collection_id: collectionId ?? null,
    payload: { ...rest, active: true, createdAt: now, updatedAt: now } as Json,
  }).select("*").single();
  if (error) fail("createSeries", error);
  return rowToSeries(data as Row);
}
async function updateSeries(id: string, patch: Partial<NewSeriesInput>): Promise<AdminSeries | undefined> {
  guard();
  const base: TablesUpdate<"series"> = {};
  if ((patch as { name?: string }).name !== undefined) base.name = (patch as { name?: string }).name;
  if ((patch as { collectionId?: string }).collectionId !== undefined) base.collection_id = (patch as { collectionId?: string }).collectionId;
  if (Object.keys(base).length) {
    const { error } = await supabase.from("series").update(base).eq("id", id);
    if (error) fail("updateSeries", error);
  }
  const { name, collectionId, ...rest } = patch as unknown as Record<string, unknown> & { name?: string; collectionId?: string };
  if (Object.keys(rest).length) await mergePayload("series", id, { ...rest, updatedAt: new Date().toISOString() });
  const { data, error } = await supabase.from("series").select("*").eq("id", id).maybeSingle();
  if (error) fail("getSeries", error);
  return data ? rowToSeries(data) : undefined;
}
async function setSeriesActive(id: string, active: boolean): Promise<AdminSeries | undefined> {
  return updateSeries(id, { active } as unknown as Partial<NewSeriesInput>);
}
async function deleteSeries(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("series").delete().eq("id", id);
  return !error;
}
const rowToBrand = (r: Row): AdminBrand => ({
  ...(asObj(r.payload) as object),
  id: r.id,
  name: r.name,
  createdAt: String(asObj(r.payload).createdAt ?? r.created_at ?? ""),
  updatedAt: String(asObj(r.payload).updatedAt ?? r.updated_at ?? r.created_at ?? ""),
} as unknown as AdminBrand);
async function listBrands(): Promise<AdminBrand[]> { return readRows("brands", rowToBrand); }
async function createBrand(input: NewBrandInput): Promise<AdminBrand> {
  guard();
  const id = `brand-${Date.now()}`;
  const now = new Date().toISOString();
  const { name, ...rest } = input as unknown as Record<string, unknown> & { name?: string };
  const { data, error } = await supabase.from("brands").insert({
    id,
    name: String(name ?? "Untitled brand"),
    payload: { ...rest, active: true, createdAt: now, updatedAt: now } as Json,
  }).select("*").single();
  if (error) fail("createBrand", error);
  return rowToBrand(data);
}
async function updateBrand(id: string, patch: Partial<NewBrandInput>): Promise<AdminBrand | undefined> {
  guard();
  if ((patch as { name?: string }).name !== undefined) {
    const { error } = await supabase.from("brands").update({ name: (patch as { name?: string }).name }).eq("id", id);
    if (error) fail("updateBrand", error);
  }
  const { name, ...rest } = patch as unknown as Record<string, unknown> & { name?: string };
  void name;
  if (Object.keys(rest).length) await mergePayload("brands", id, { ...rest, updatedAt: new Date().toISOString() });
  const { data, error } = await supabase.from("brands").select("*").eq("id", id).maybeSingle();
  if (error) fail("getBrand", error);
  return data ? rowToBrand(data) : undefined;
}
async function setBrandActive(id: string, active: boolean): Promise<AdminBrand | undefined> {
  return updateBrand(id, { active } as unknown as Partial<NewBrandInput>);
}
async function deleteBrand(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("brands").delete().eq("id", id);
  return !error;
}

/* ── materials & services (json-document tables) ─────────────────────────── */
const rowToJsonDoc = <T>(r: Row, withActive = true): T => {
  const doc = asObj(r.json as Json ?? r.payload as Json);
  return { id: r.id, ...doc, ...(withActive && r.status ? { status: r.status } : {}) } as unknown as T;
};
async function listMaterials(): Promise<AdminMaterial[]> {
  guard();
  return readRows("materials", (r) => rowToJsonDoc<AdminMaterial>(r), "created_at");
}
async function createMaterial(input: NewMaterialInput): Promise<AdminMaterial> {
  guard();
  const id = `mat-${Date.now()}`;
  const { data, error } = await supabase.from("materials").insert({
    id,
    json: { ...(input as unknown as Record<string, unknown>), active: true } as unknown as Json,
  }).select("*").single();
  if (error) fail("createMaterial", error);
  return rowToJsonDoc<AdminMaterial>(data as Row);
}
async function updateMaterial(id: string, patch: Partial<NewMaterialInput>): Promise<AdminMaterial | undefined> {
  guard();
  // materials has `json` (not payload) — merge directly
  const { data, error } = await supabase.from("materials").select("*").eq("id", id).maybeSingle();
  if (error) fail("getMaterial", error);
  if (!data) return undefined;
  const merged = { ...asObj((data as Row).json as Json), ...(patch as Record<string, unknown>) };
  const { error: e2 } = await supabase.from("materials").update({ json: merged as Json }).eq("id", id);
  if (e2) fail("updateMaterial", e2);
  return rowToJsonDoc<AdminMaterial>({ ...(data as Row), json: merged as Json });
}
async function setMaterialActive(id: string, active: boolean): Promise<AdminMaterial | undefined> {
  return updateMaterial(id, { active } as unknown as Partial<NewMaterialInput>);
}
async function deleteMaterial(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("materials").delete().eq("id", id);
  return !error;
}
async function listServices(): Promise<AdminService[]> {
  guard();
  return readRows("services", (r) => rowToJsonDoc<AdminService>(r), "created_at");
}
async function createService(input: NewServiceInput): Promise<AdminService> {
  guard();
  const id = `service-${Date.now()}`;
  const { data, error } = await supabase.from("services").insert({
    id,
    json: { ...(input as unknown as Record<string, unknown>), active: true } as unknown as Json,
  }).select("*").single();
  if (error) fail("createService", error);
  return rowToJsonDoc<AdminService>(data as Row);
}
async function updateService(slug: string, patch: Partial<NewServiceInput>): Promise<AdminService | undefined> {
  guard();
  const { data, error } = await supabase.from("services").select("*").eq("id", slug).maybeSingle();
  if (error) fail("getService", error);
  if (!data) return undefined;
  const merged = { ...asObj((data as Row).json as Json), ...(patch as Record<string, unknown>) };
  const { error: e2 } = await supabase.from("services").update({ json: merged as Json }).eq("id", slug);
  if (e2) fail("updateService", e2);
  return rowToJsonDoc<AdminService>({ ...(data as Row), json: merged as Json });
}
async function setServiceActive(slug: string, active: boolean): Promise<AdminService | undefined> {
  return updateService(slug, { active } as unknown as Partial<NewServiceInput>);
}
async function deleteService(slug: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("services").delete().eq("id", slug);
  return !error;
}

/* ── projects & blog ─────────────────────────────────────────────────────── */
const rowToProject = (r: Row): AdminProject => ({
  id: r.id,
  ...(asObj(r.payload) as object),
  status: String(r.status ?? "published"),
  createdAt: String(asObj(r.payload).createdAt ?? r.created_at ?? ""),
  updatedAt: String(asObj(r.payload).updatedAt ?? r.updated_at ?? r.created_at ?? ""),
} as unknown as AdminProject);
async function listProjects(): Promise<AdminProject[]> { return readRows("projects", rowToProject); }
async function createProject(input: NewProjectInput): Promise<AdminProject> {
  guard();
  const id = `project-${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("projects").insert({
    id, status: "published",
    payload: { ...(input as unknown as Record<string, unknown>), createdAt: now, updatedAt: now } as unknown as Json,
  }).select("*").single();
  if (error) fail("createProject", error);
  return rowToProject(data as Row);
}
async function updateProject(id: string, patch: Partial<NewProjectInput>): Promise<AdminProject | undefined> {
  guard();
  if ((patch as { status?: string }).status !== undefined) {
    const { error } = await supabase.from("projects").update({ status: (patch as { status?: string }).status }).eq("id", id);
    if (error) fail("updateProject", error);
  }
  const { status, ...rest } = patch as Record<string, unknown> & { status?: string };
  void status;
  if (Object.keys(rest).length) await mergePayload("projects", id, { ...rest, updatedAt: new Date().toISOString() });
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) fail("getProject", error);
  return data ? rowToProject(data) : undefined;
}
async function setProjectActive(id: string, active: boolean): Promise<AdminProject | undefined> {
  return updateProject(id, { status: active ? "published" : "archived" } as unknown as Partial<NewProjectInput>);
}
async function deleteProject(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  return !error;
}
const rowToBlogPost = (r: Row): AdminBlogPost => ({
  id: r.id,
  ...(asObj(r.payload) as object),
  status: String(r.status ?? "Draft"),
  createdAt: String(asObj(r.payload).createdAt ?? r.created_at ?? ""),
  updatedAt: String(asObj(r.payload).updatedAt ?? r.updated_at ?? r.created_at ?? ""),
} as unknown as AdminBlogPost);
async function listBlogPosts(): Promise<AdminBlogPost[]> { return readRows("blog_posts", rowToBlogPost); }
async function createBlogPost(input: NewBlogPostInput): Promise<AdminBlogPost> {
  guard();
  const id = `post-${Date.now()}`;
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("blog_posts").insert({
    id, status: "Draft",
    payload: { ...(input as unknown as Record<string, unknown>), createdAt: now, updatedAt: now } as unknown as Json,
  }).select("*").single();
  if (error) fail("createBlogPost", error);
  return rowToBlogPost(data as Row);
}
async function updateBlogPost(id: string, patch: Record<string, unknown>): Promise<AdminBlogPost | undefined> {
  guard();
  if (patch.status !== undefined) {
    const { error } = await supabase.from("blog_posts").update({ status: String(patch.status) }).eq("id", id);
    if (error) fail("updateBlogPost", error);
  }
  const { status, ...rest } = patch;
  void status;
  if (Object.keys(rest).length) await mergePayload("blog_posts", id, { ...rest, updatedAt: new Date().toISOString() });
  const { data, error } = await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle();
  if (error) fail("getBlogPost", error);
  return data ? rowToBlogPost(data) : undefined;
}
async function setBlogPostActive(id: string, active: boolean): Promise<AdminBlogPost | undefined> {
  return updateBlogPost(id, { status: active ? "Published" : "Draft" });
}
async function deleteBlogPost(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  return !error;
}

/* ── collections ─────────────────────────────────────────────────────────── */
const rowToCollection = (r: Row): AdminCollection => {
  const p = asObj(r.payload);
  return {
    id: r.id,
    name: r.name,
    handle: String(p.handle ?? r.id),
    description: String(p.description ?? ""),
    kind: String(p.kind ?? "manual") as AdminCollectionKind,
    rule: p.rule as AdminCollection["rule"],
    productIds: Array.isArray(p.productIds) ? (p.productIds as string[]) : [],
    sortOrder: toNum(p.sortOrder),
    createdAt: String(p.createdAt ?? ""),
  };
};
async function listCollections(): Promise<AdminCollection[]> {
  guard();
  return readRows("collections", rowToCollection).then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder));
}
async function listCollectionProducts(id: string): Promise<AdminProduct[]> {
  guard();
  const { data, error } = await supabase.from("collections").select("*").eq("id", id).maybeSingle();
  if (error) fail("getCollection", error);
  if (!data) return [];
  const c = rowToCollection(data as Row);
  if (c.kind !== "manual") {
    isNotWired("listCollectionProducts(auto)", "automatic collection rules are evaluated live on the storefront; the admin cannot cheaply evaluate them yet — open the rule in demo mode or page through the catalogue.");
  }
  const ids = c.productIds;
  if (ids.length === 0) return [];
  const all = await Promise.all(
    ids.map(async (pid) => {
      const { data: pr, error: e2 } = await supabase.from("products").select("*").eq("id", pid).maybeSingle();
      if (e2) fail("getProduct", e2);
      return pr ? rowToAdminProduct(pr as Row) : undefined;
    }),
  );
  return all.filter((p): p is AdminProduct => Boolean(p));
}
async function createCollection(input: NewAdminCollectionInput): Promise<AdminCollection> {
  guard();
  if (input.kind && input.kind !== "manual") {
    isNotWired("createCollection(automatic)", "automatic rules are written in the storefront motion layer (Wave 3 index sync); manual collections only here.");
  }
  const id = `col-${Date.now()}`;
  const { data, error } = await supabase.from("collections").insert({
    id,
    name: input.name,
    payload: {
      handle: (input as { handle?: string }).handle ?? id,
      description: (input as { description?: string }).description ?? "",
      kind: "manual",
      rule: (input as { rule?: unknown }).rule,
      productIds: (input as { productIds?: string[] }).productIds ?? [],
      sortOrder: (input as { sortOrder?: number }).sortOrder ?? 0,
      createdAt: new Date().toISOString(),
    } as unknown as Json,
  }).select("*").single();
  if (error) fail("createCollection", error);
  return rowToCollection(data as Row);
}
async function updateCollection(id: string, patch: Partial<NewAdminCollectionInput>): Promise<AdminCollection | undefined> {
  guard();
  if (patch.kind && patch.kind !== "manual") {
    isNotWired("updateCollection(automatic)", "switching a collection to automatic is not supported yet (Wave 3).");
  }
  if (patch.name !== undefined) {
    const { error } = await supabase.from("collections").update({ name: patch.name }).eq("id", id);
    if (error) fail("updateCollection", error);
  }
  const { name, ...rest } = patch as unknown as Record<string, unknown> & { name?: string };
  void name;
  if (Object.keys(rest).length) await mergePayload("collections", id, rest);
  const { data, error } = await supabase.from("collections").select("*").eq("id", id).maybeSingle();
  if (error) fail("getCollection", error);
  return data ? rowToCollection(data) : undefined;
}
async function deleteCollection(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("collections").delete().eq("id", id);
  return !error;
}

/* ── categories ──────────────────────────────────────────────────────────── */
const rowToCategory = (r: Row): AdminCategory => {
  const p = asObj(r.payload);
  return {
    id: r.id,
    name: r.name,
    group: String(r.group_ ?? "ungrouped") as AdminCategory["group"],
    ...(r.parent_id ? { parentId: r.parent_id } : {}),
    sortOrder: toNum(r.sort),
    visible: r.visible !== false,
    ...(p.heroStyle ? { heroStyle: String(p.heroStyle) as AdminCategory["heroStyle"] } : {}),
    ...(p.description ? { description: String(p.description) } : {}),
  } as unknown as AdminCategory;
};
async function listCategories(): Promise<AdminCategory[]> {
  guard();
  const rows = await readRows("categories", rowToCategory, "sort");
  return rows.sort((a, b) => ((a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9)) || a.name.localeCompare(b.name));
}
function slugify(name: string) { return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "category"; }
async function createCategory(input: { name: string; group: AdminCategory["group"]; parentId?: string }): Promise<AdminCategory> {
  guard();
  let base = slugify(input.name);
  const { data: existing } = await supabase.from("categories").select("id");
  const ids = new Set(((existing ?? []) as { id: string }[]).map((r) => r.id));
  let id = base, n = 2;
  while (ids.has(id)) id = `${base}-${n++}`;
  const payload: Record<string, unknown> = {};
  // heroStyle/description are set via updateCategory; the create contract only carries name/group/parentId.
  const { data, error } = await supabase.from("categories").insert({
    id,
    name: input.name,
    group_: (input as { group?: string }).group ?? "ungrouped",
    parent_id: (input as { parentId?: string }).parentId ?? null,
    sort: Math.round(toNum((input as { sortOrder?: number }).sortOrder)),
    visible: (input as { visible?: boolean }).visible !== false,
    payload: payload as unknown as Json,
  }).select("*").single();
  if (error) fail("createCategory", error);
  return rowToCategory(data as Row);
}
async function updateCategory(id: string, patch: Partial<AdminCategory> & { parentId?: string }): Promise<AdminCategory | undefined> {
  guard();
  const row: TablesUpdate<"categories"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if ((patch as { group?: string }).group !== undefined) row.group_ = (patch as { group?: string }).group;
  if (patch.parentId !== undefined) row.parent_id = patch.parentId === "" ? null : patch.parentId;
  if ((patch as { sortOrder?: number }).sortOrder !== undefined) row.sort = Math.round(toNum((patch as { sortOrder?: number }).sortOrder));
  if ((patch as { visible?: boolean }).visible !== undefined) row.visible = (patch as { visible?: boolean }).visible;
  if (Object.keys(row).length) {
    const { error } = await supabase.from("categories").update(row).eq("id", id);
    if (error) fail("updateCategory", error);
  }
  const doc: Record<string, unknown> = {};
  for (const k of ["heroStyle", "description", "specs", "weightKg", "dimensions"]) {
    const v = (patch as Record<string, unknown>)[k];
    if (v !== undefined) doc[k] = v;
  }
  if (Object.keys(doc).length) await mergePayload("categories", id, doc);
  const { data, error } = await supabase.from("categories").select("*").eq("id", id).maybeSingle();
  if (error) fail("getCategory", error);
  return data ? rowToCategory(data) : undefined;
}
async function deleteCategory(id: string): Promise<{ ok: boolean; error?: string }> {
  guard();
  const { count, error: e0 } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("category_id", id);
  if (e0) fail("deleteCategory(check)", e0);
  if ((count ?? 0) > 0) {
    return { ok: false, error: `used by ${count} product${count === 1 ? "" : "s"}` };
  }
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/* ── media ───────────────────────────────────────────────────────────────── */
const rowToMediaAsset = (r: Row): AdminMediaAsset => ({
  id: r.id,
  name: r.name,
  url: r.url,
  mime: r.mime ?? "application/octet-stream",
  size: toNum(r.size_bytes),
  createdAt: r.created_at,
  ...(r.folder ? { folder: r.folder } : {}),
  ...(r.alt ? { alt: r.alt } : {}),
});
async function listMediaAssets(params?: { query?: string; folder?: string }): Promise<AdminMediaAsset[]> {
  guard();
  let q = supabase.from("media_assets").select("*").order("created_at", { ascending: false });
  if (params?.folder) q = q.eq("folder", params.folder);
  const s = params?.query?.trim();
  if (s) q = q.ilike("name", `%${s}%`);
  const { data, error } = await q;
  if (error) fail("listMediaAssets", error);
  return ((data ?? []) as Row[]).map(rowToMediaAsset);
}
async function addMediaAsset(input: { name: string; url: string; mime: string; size: number; folder?: string; alt?: string }): Promise<AdminMediaAsset> {
  guard();
  const id = `media-${Date.now()}`;
  const { data, error } = await supabase.from("media_assets").insert({
    id,
    name: input.name,
    url: input.url,
    alt: input.alt ?? null,
    size_bytes: Math.max(0, Math.round(toNum(input.size))),
    mime: input.mime,
    folder: input.folder ?? null,
  }).select("*").single();
  if (error) fail("addMediaAsset", error);
  return rowToMediaAsset(data as Row);
}
async function deleteMediaAsset(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("media_assets").delete().eq("id", id);
  return !error;
}
async function updateMediaAsset(id: string, patch: Partial<Pick<AdminMediaAsset, "name" | "folder" | "alt">>): Promise<AdminMediaAsset | undefined> {
  guard();
  const row: TablesUpdate<"media_assets"> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.folder !== undefined) row.folder = patch.folder ?? null;
  if (patch.alt !== undefined) row.alt = patch.alt ?? null;
  if (Object.keys(row).length) {
    const { error } = await supabase.from("media_assets").update(row).eq("id", id);
    if (error) fail("updateMediaAsset", error);
  }
  const { data, error } = await supabase.from("media_assets").select("*").eq("id", id).maybeSingle();
  if (error) fail("getMediaAsset", error);
  return data ? rowToMediaAsset(data) : undefined;
}
async function bulkDeleteMediaAssets(ids: string[]): Promise<number> {
  guard();
  if (!ids.length) return 0;
  const { error, count } = await supabase.from("media_assets").delete({ count: "exact" }).in("id", ids);
  if (error) fail("bulkDeleteMediaAssets", error);
  return count ?? ids.length;
}
async function moveMediaAssets(ids: string[], folder: string | undefined): Promise<number> {
  guard();
  if (!ids.length) return 0;
  const { error } = await supabase.from("media_assets").update({ folder: folder ?? null }).in("id", ids);
  if (error) fail("moveMediaAssets", error);
  return ids.length;
}
function assignMediaToProduct(_assetId: string, _productId: string): Promise<boolean> {
  return Promise.reject(new SupabaseUnsupportedError("assignMediaToProduct — not wired: products keep media via the payload contract and require a dedicated payload RPC (assignMedicToProduct media RPC), which is Wave 3 tooling."));
}

/* ── inventory ───────────────────────────────────────────────────────────── */
async function listInventory(params?: ListParams & { filter?: "all" | "in" | "low" | "out" | "made_to_order" }): Promise<AdminInventoryItem[]> {
  guard();
  const { data, error } = await supabase.from("products").select("*");
  if (error) fail("listInventory products", error);
  const { data: metas, error: e2 } = await supabase.from("inventory_meta").select("*");
  if (e2) fail("listInventory meta", e2);
  const meta = new Map(((metas ?? []) as Row[]).map((m) => [String(m.product_id), m]));
  let items: AdminInventoryItem[] = ((data ?? []) as Row[]).map((r) => {
    const m = meta.get(String(r.id));
    const p = asObj(r.payload);
    const qty = toNum(r.stock_qty);
    const threshold = m ? toNum(m.low_stock_threshold, 5) : 5;
    const stockStatus = (p.stockStatus as AdminInventoryItem["stockStatus"]) ?? (r.in_stock ? "in_stock" : "out_of_stock");
    return {
      productId: String(r.id),
      name: r.name ?? String(p.name ?? ""),
      sku: r.sku ?? String(r.id),
      category: String(r.category_id ?? ""),
      image: typeof p.image === "string" ? p.image : undefined,
      quantity: qty,
      lowStockThreshold: threshold,
      location: "Factory Warehouse",
      stockStatus,
      lastUpdated: String(m?.updated_at ?? r.updated_at),
    };
  });
  const q = params?.query?.trim().toLowerCase();
  if (q) items = items.filter((r) => `${r.name} ${r.sku} ${r.category}`.toLowerCase().includes(q));
  switch (params?.filter) {
    case "in": items = items.filter((r) => r.stockStatus === "in_stock"); break;
    case "out": items = items.filter((r) => r.stockStatus === "out_of_stock"); break;
    case "low": items = items.filter((r) => r.quantity > 0 && r.quantity <= r.lowStockThreshold); break;
    case "made_to_order": items = items.filter((r) => r.stockStatus === "made_to_order"); break;
    default: break;
  }
  return items;
}
const MOVEMENT_SIGN: Record<StockMovementType, 1 | -1> = {
  inbound: 1, outbound: -1, return: 1, damage: -1, adjustment: 1, transfer: -1,
};
async function adjustStock(input: { productId: string; type: StockMovementType; quantity: number; notes?: string }): Promise<{ item: AdminInventoryItem; movement: AdminStockMovement } | undefined> {
  guard();
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty)) throw new Error("adjustStock: quantity must be a number");
  const magnitude = Math.abs(Math.round(qty));
  const delta = input.type === "adjustment" ? Math.round(qty) : MOVEMENT_SIGN[input.type] * magnitude;
  const { error } = await supabase.rpc("inventory_apply", {
    p_product_id: input.productId,
    p_delta: delta,
    p_reason: input.type,
    p_note: input.notes ?? undefined,
  });
  if (error) fail("inventory_apply", error);
  const [prodRes, metaRes, movesRes] = await Promise.all([
    supabase.from("products").select("*").eq("id", input.productId).maybeSingle(),
    supabase.from("inventory_meta").select("*").eq("product_id", input.productId).maybeSingle(),
    supabase.from("stock_movements").select("*").eq("product_id", input.productId).order("created_at", { ascending: false }).limit(1),
  ]);
  const prod = prodRes.data as Row | null;
  if (!prod) return undefined;
  const m = metaRes.data as Row | null;
  const p = asObj(prod.payload);
  const item: AdminInventoryItem = {
    productId: String(prod.id),
    name: prod.name ?? String(p.name ?? ""),
    sku: prod.sku ?? String(prod.id),
    category: String(prod.category_id ?? ""),
    image: typeof p.image === "string" ? p.image : undefined,
    quantity: toNum(prod.stock_qty),
    lowStockThreshold: m ? toNum(m.low_stock_threshold, 5) : 5,
    location: "Factory Warehouse",
    stockStatus: (p.stockStatus as AdminInventoryItem["stockStatus"]) ?? (prod.in_stock ? "in_stock" : "out_of_stock"),
    lastUpdated: new Date().toISOString(),
  };
  const mv = ((movesRes.data ?? []) as Row[])[0];
  const movement: AdminStockMovement = {
    id: mv ? String(mv.id) : `mv-${Date.now()}`,
    productId: String(prod.id),
    productName: item.name,
    productSku: item.sku,
    type: input.type,
    quantity: delta,
    notes: input.notes,
    createdAt: mv?.created_at ?? new Date().toISOString(),
  };
  return { item, movement };
}
async function listStockMovements(params?: { productId?: string; limit?: number }): Promise<AdminStockMovement[]> {
  guard();
  const limit = Math.max(1, Math.min(500, params?.limit ?? 50));
  let q = supabase.from("stock_movements").select("*").order("created_at", { ascending: false }).limit(limit);
  if (params?.productId) q = q.eq("product_id", params.productId);
  const { data, error } = await q;
  if (error) fail("listStockMovements", error);
  const ids = [...new Set(((data ?? []) as Row[]).map((r) => String(r.product_id)))];
  const { data: prods } = ids.length ? await supabase.from("products").select("id, name, sku").in("id", ids) : { data: [] as Row[] };
  const names = new Map(((prods ?? []) as Row[]).map((p2) => [String(p2.id), { name: p2.name, sku: p2.sku ?? String(p2.id) }]));
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    productId: String(r.product_id),
    productName: names.get(String(r.product_id))?.name ?? String(r.product_id),
    productSku: names.get(String(r.product_id))?.sku ?? String(r.product_id),
    type: String(r.reason ?? "adjustment") as StockMovementType,
    quantity: toNum(r.delta),
    notes: r.note ?? undefined,
    createdAt: r.created_at,
  }));
}
/* delivery zones: structural mismatch (schema reshaped during convergence —
 * delivery_zones holds generic zones, not the admin short-notice/cod model) */
function listDeliveryZones(): Promise<never> {
  return Promise.reject(new SupabaseUnsupportedError("listDeliveryZones — not wired: delivery_zones in the converged schema is a different (simpler) model than the admin's ETA/COD zone config; reconciling it is a Wave-2 decision, not a mechanical map."));
}
function saveDeliveryZone(_input: unknown): Promise<never> {
  return Promise.reject(new SupabaseUnsupportedError("saveDeliveryZone — not wired (same reason as listDeliveryZones)."));
}
function deleteDeliveryZone(_id: string): Promise<boolean> {
  return Promise.reject(new SupabaseUnsupportedError("deleteDeliveryZone — not wired (same reason as listDeliveryZones)."));
}

/* ── homepage + singletons ───────────────────────────────────────────────── */
async function getHomepageSections(): Promise<AdminHomepageSections> {
  guard();
  const { data, error } = await supabase.from("homepage_sections").select("content").eq("id", "home").maybeSingle();
  if (error) fail("getHomepageSections", error);
  return asObj((data?.content as Json) ?? null) as unknown as AdminHomepageSections;
}
async function updateHomepageSections(patch: Partial<AdminHomepageSections>): Promise<AdminHomepageSections> {
  guard();
  const current = await getHomepageSections();
  const next = { ...current, ...patch } as AdminHomepageSections;
  const { error } = await supabase.from("homepage_sections")
    .upsert({ id: "home", content: next as unknown as Json, updated_at: new Date().toISOString() } as never);
  if (error) fail("updateHomepageSections", error);
  return next;
}
type SingletonTable = "warranty_page" | "custom_design_page" | "virtual_showroom_page";
const singletonRead = async <T>(table: SingletonTable, id: string): Promise<T> => {
  const { data, error } = await supabase.from(table).select("content").eq("id", id).maybeSingle();
  if (error) fail(`${table} read`, error);
  return asObj((data?.content as Json) ?? null) as unknown as T;
};
const singletonWrite = async <T>(table: SingletonTable, id: string, content: T): Promise<T> => {
  const { error } = await supabase.from(table)
    .upsert({ id, content: content as unknown as Json, updated_at: new Date().toISOString() } as never);
  if (error) fail(`${table} write`, error);
  return content;
};
const singletonReset = (method: string): never => {
  throw new SupabaseUnsupportedError(`${method} — not wired: the built-in default copy lives in the storefront bundle (Wave 3 extracts it to a shared defaults module); resetting content means restoring real defaults, which this adapter must not invent.`);
};
const getWarrantyPage = (): Promise<AdminWarrantyPage> => singletonRead("warranty_page", "warranty");
const updateWarrantyPage = (content: AdminWarrantyPage): Promise<AdminWarrantyPage> => singletonWrite("warranty_page", "warranty", content);
const resetWarrantyPage = (): Promise<AdminWarrantyPage> => Promise.reject(singletonReset("resetWarrantyPage"));
const getCustomDesignPage = (): Promise<AdminCustomDesignPage> => singletonRead("custom_design_page", "custom-design");
const updateCustomDesignPage = (content: AdminCustomDesignPage): Promise<AdminCustomDesignPage> => singletonWrite("custom_design_page", "custom-design", content);
const resetCustomDesignPage = (): Promise<AdminCustomDesignPage> => Promise.reject(singletonReset("resetCustomDesignPage"));
const getVirtualShowroomPage = (): Promise<AdminVirtualShowroomPage> => singletonRead("virtual_showroom_page", "virtual-showroom");
const updateVirtualShowroomPage = (content: AdminVirtualShowroomPage): Promise<AdminVirtualShowroomPage> => singletonWrite("virtual_showroom_page", "virtual-showroom", content);
const resetVirtualShowroomPage = (): Promise<AdminVirtualShowroomPage> => Promise.reject(singletonReset("resetVirtualShowroomPage"));

/* ── pages builder ───────────────────────────────────────────────────────── */
const pageTitleToSlug = (t: string) => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "page";
const pageStatusLower = (s: string): "draft" | "published" => (String(s).toLowerCase() === "published" ? "published" : "draft");
const versionOf = (r: Row): number => {
  const v = Array.isArray(r.page_versions) ? r.page_versions : [];
  return v.reduce((m: number, x: Row) => Math.max(m, toNum(x.version)), 0) || 1;
};
const rowToDoc = (r: Row, blocks: Row[]): AdminPageDoc => ({
  root: { props: asObj(r.theme as Json) },
  content: (blocks ?? []).map((b) => ({ type: String(b.type), props: asObj(b.props as Json) as AdminPageContentItem["props"] })),
});
const rowToSeo = (r: Row): AdminPageSeo | undefined => {
  const seo = asObj(r.seo as Json);
  const out: AdminPageSeo = {
    ...(typeof seo.title === "string" ? { title: seo.title } : r.seo_title ? { title: r.seo_title } : {}),
    ...(typeof seo.description === "string" ? { description: seo.description } : r.seo_desc ? { description: r.seo_desc } : {}),
    ...(typeof seo.focusKeyphrase === "string" ? { focusKeyphrase: seo.focusKeyphrase } : {}),
    ...(typeof seo.noindex === "boolean" ? { noindex: seo.noindex } : {}),
    ...(typeof seo.strictGate === "boolean" ? { strictGate: seo.strictGate } : {}),
  };
  return Object.keys(out).length ? out : undefined;
};
const pageHistory = (versions: Row[]): AdminPageHistoryEntry[] =>
  versions
    .map((v) => ({
      version: toNum(v.version),
      publishedAt: String(v.created_at),
      title: String(asObj(v.snapshot as Json).title ?? ""),
      doc: ((): AdminPageDoc => {
        const snap = asObj(v.snapshot as Json);
        return { root: { props: asObj(snap.theme as Json) }, content: (Array.isArray(snap.blocks) ? snap.blocks : []).map((b) => ({ type: String((b as Row).type), props: asObj((b as Row).props as Json) as AdminPageContentItem["props"] })) };
      })(),
    }))
    .sort((a, b) => b.version - a.version);
const loadPage = async (r: Row, withHistory: boolean): Promise<AdminPage> => {
  const { data: blocks, error } = await supabase.from("page_blocks").select("*").eq("page_id", r.id).order("sort", { ascending: true });
  if (error) fail("page_blocks", error);
  let versions: Row[] = [];
  if (withHistory) {
    const { data, error: e2 } = await supabase.from("page_versions").select("*").eq("page_id", r.id).order("version", { ascending: false });
    if (e2) fail("page_versions", e2);
    versions = (data ?? []) as Row[];
  }
  return {
    id: String(r.id),
    slug: r.slug,
    title: r.title,
    kind: (r.kind ?? "page") as AdminPage["kind"],
    folderId: null,
    status: pageStatusLower(r.status),
    doc: rowToDoc(r, (blocks ?? []) as Row[]),
    seo: rowToSeo(r),
    updatedAt: r.updated_at,
    publishedAt: r.published_at ?? null,
    version: Math.max(toNum(r.version_latest), versions[0]?.version ? toNum(versions[0].version) : 1),
    history: withHistory ? pageHistory(versions) : [],
  };
};
async function listPages(kind?: AdminPage["kind"]): Promise<AdminPage[]> {
  guard();
  let q = supabase.from("pages").select("*").order("updated_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) fail("listPages", error);
  // list view carries empty history (loaded on demand by getPage) — documented trade-off
  return Promise.all(((data ?? []) as Row[]).map((r) => loadPage(r, false)));
}
async function getPage(idOrSlug: string): Promise<AdminPage | undefined> {
  guard();
  const isNum = /^\d+$/.test(idOrSlug);
  const { data, error } = await supabase.from("pages").select("*")
    .eq(isNum ? "id" : "slug", isNum ? Number(idOrSlug) : idOrSlug).maybeSingle();
  if (error) fail("getPage", error);
  return data ? loadPage(data as Row, true) : undefined;
}
async function createPage(input: { title: string; slug?: string; starter?: string; kind?: AdminPage["kind"] }): Promise<AdminPage> {
  guard();
  const slug = (input.slug && pageTitleToSlug(input.slug)) || pageTitleToSlug(input.title);
  const { data, error } = await supabase.from("pages").insert({
    slug, title: input.title, status: "Draft", kind: input.kind ?? "page",
    seo: {} as Json, theme: {} as Json,
  }).select("*").single();
  if (error) fail("createPage", error);
  // empty version-1 journal entry keeps every page revertable to its birth state
  await supabase.from("page_versions").insert({
    page_id: (data as Row).id,
    version: 1,
    snapshot: { id: (data as Row).id, slug, title: input.title, theme: {}, blocks: [] } as unknown as Json,
    who: "admin",
    action: "create",
  });
  return loadPage(data as Row, true);
}
async function updatePage(id: string, patch: { title?: string; slug?: string; folderId?: string | null; doc?: AdminPageDoc; seo?: AdminPageSeo }): Promise<AdminPage | undefined> {
  guard();
  if (patch.folderId !== undefined) {
    isNotWired("updatePage.folderId", "page folders have no table in the converged schema (Wave 4 folder tree).");
  }
  const cur = await getPage(id);
  if (!cur) return undefined;
  const numId = Number(cur.id);
  const seo = patch.seo ? { ...(cur.seo ?? {}), ...patch.seo } : cur.seo;
  const theme = patch.doc ? patch.doc.root.props : undefined;
  const blocks = patch.doc ? patch.doc.content : undefined;
  if (patch.slug && patch.slug !== cur.slug) {
    const { error } = await supabase.from("pages").update({ slug: pageTitleToSlug(patch.slug) }).eq("id", numId);
    if (error) fail("updatePage.slug", error);
  }
  const { error: e2 } = await supabase.rpc("page_save", {
    p_id: numId,
    p_title: patch.title ?? cur.title,
    p_seo_title: (seo as AdminPageSeo | undefined)?.title ?? null,
    p_seo_desc: (seo as AdminPageSeo | undefined)?.description ?? null,
    p_theme: (theme ?? asObj(null)) as Json,
    p_blocks: (blocks ?? cur.doc.content) as unknown as Json,
    p_seo: (seo ?? {}) as unknown as Json,
  });
  if (e2) fail("page_save", e2);
  return getPage(cur.id);
}
async function publishPage(id: string): Promise<AdminPage | undefined> {
  guard();
  const cur = await getPage(id);
  if (!cur) return undefined;
  const { error } = await supabase.rpc("page_publish", { p_id: Number(cur.id), p_publish: true });
  if (error) fail("page_publish", error);
  return getPage(cur.id);
}
async function unpublishPage(id: string): Promise<AdminPage | undefined> {
  guard();
  const cur = await getPage(id);
  if (!cur) return undefined;
  const { error } = await supabase.rpc("page_publish", { p_id: Number(cur.id), p_publish: false });
  if (error) fail("page_publish(unpublish)", error);
  return getPage(cur.id);
}
async function duplicatePage(id: string): Promise<AdminPage | undefined> {
  guard();
  const cur = await getPage(id);
  if (!cur) return undefined;
  let slug = `${cur.slug}-copy`, n = 2;
  for (;;) {
    const { data } = await supabase.from("pages").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    slug = `${cur.slug}-copy-${n++}`;
  }
  const { data, error } = await supabase.from("pages").insert({
    slug, title: `${cur.title} (Copy)`, status: "Draft", kind: cur.kind,
    seo: (cur.seo ?? {}) as unknown as Json, theme: cur.doc.root.props as unknown as Json,
  }).select("*").single();
  if (error) fail("duplicatePage", error);
  const newId = (data as Row).id as number;
  if (cur.doc.content.length) {
    const { error: e2 } = await supabase.rpc("page_save", {
      p_id: newId,
      p_title: `${cur.title} (Copy)`,
      p_seo_title: cur.seo?.title ?? null,
      p_seo_desc: cur.seo?.description ?? null,
      p_theme: cur.doc.root.props as unknown as Json,
      p_blocks: cur.doc.content as unknown as Json,
      p_seo: (cur.seo ?? {}) as unknown as Json,
    });
    if (e2) fail("duplicatePage(save)", e2);
  }
  return getPage(String(newId));
}
async function deletePage(id: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("pages").delete().eq("id", Number(id));
  return !error;
}
async function revertPage(id: string, version: number): Promise<AdminPage | undefined> {
  guard();
  const cur = await getPage(id);
  if (!cur) return undefined;
  const { error } = await supabase.rpc("page_revert", { p_id: Number(cur.id), p_version: version });
  if (error) fail("page_revert", error);
  return getPage(cur.id);
}
function listPageFolders(): Promise<never> {
  return Promise.reject(new SupabaseUnsupportedError("listPageFolders — not wired: page folders need a page_folders table (Wave 4); pages carry folderId=null everywhere meanwhile."));
}
function createPageFolder(_input: unknown): Promise<never> {
  return Promise.reject(new SupabaseUnsupportedError("createPageFolder — not wired (Wave 4)."));
}
function updatePageFolder(_id: string, _patch: unknown): Promise<never | undefined> {
  return Promise.reject(new SupabaseUnsupportedError("updatePageFolder — not wired (Wave 4)."));
}
function deletePageFolder(_id: string): Promise<boolean> {
  return Promise.reject(new SupabaseUnsupportedError("deletePageFolder — not wired (Wave 4)."));
}

/* ── the contract ────────────────────────────────────────────────────────── */
export const supabaseAdminApi: AdminApi = {
  getDashboardStats,
  getRevenueSeries,
  listProducts,
  updateProduct,
  bulkUpdateProducts,
  createProduct,
  duplicateProduct,
  deleteProduct,
  importProductsCsv,
  listOrders,
  getOrder,
  updateOrderStatus,
  updateOrderCourier,
  getOrderEvents,
  createOrder,
  listReturns,
  getReturn,
  createReturn,
  updateReturn,
  listExchanges,
  getExchange,
  createExchange,
  updateExchange,
  listClaims,
  getClaim,
  createClaim,
  updateClaim,
  listDraftOrders,
  getDraftOrder,
  createDraftOrder,
  updateDraftOrder,
  deleteDraftOrder,
  convertDraftOrder,
  listQuotes,
  getQuote,
  createQuote,
  createQuoteFromLead,
  updateQuote,
  deleteQuote,
  convertQuote,
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  setPurchaseOrderStatus,
  receivePurchaseOrder,
  deletePurchaseOrder,
  getTransferLocations,
  listStockTransfers,
  getStockTransfer,
  createStockTransfer,
  updateStockTransfer,
  dispatchStockTransfer,
  receiveStockTransfer,
  deleteStockTransfer,
  listOptionSets,
  createOptionSet,
  updateOptionSet,
  deleteOptionSet,
  listCustomers,
  getCustomer,
  listLeads,
  updateLeadStatus,
  createLead,
  resetDemoData,
  getSettings,
  saveSettings,
  listCompanies,
  listPriceLists,
  createPriceList,
  updatePriceList,
  setPriceListStatus,
  deletePriceList,
  listBundles,
  createBundle,
  updateBundle,
  setBundleStatus,
  deleteBundle,
  listSalesChannels,
  createSalesChannel,
  updateSalesChannel,
  setSalesChannelEnabled,
  deleteSalesChannel,
  getChannelSales,
  listShowrooms,
  createShowroom,
  updateShowroom,
  setShowroomActive,
  deleteShowroom,
  listSeries,
  createSeries,
  updateSeries,
  setSeriesActive,
  deleteSeries,
  listBrands,
  createBrand,
  updateBrand,
  setBrandActive,
  deleteBrand,
  getHomepageSections,
  updateHomepageSections,
  getWarrantyPage,
  updateWarrantyPage,
  resetWarrantyPage,
  getCustomDesignPage,
  updateCustomDesignPage,
  resetCustomDesignPage,
  getVirtualShowroomPage,
  updateVirtualShowroomPage,
  resetVirtualShowroomPage,
  listPages,
  getPage,
  createPage,
  updatePage,
  publishPage,
  unpublishPage,
  duplicatePage,
  deletePage,
  revertPage,
  listPageFolders,
  createPageFolder,
  updatePageFolder,
  deletePageFolder,
  listMaterials,
  createMaterial,
  updateMaterial,
  setMaterialActive,
  deleteMaterial,
  listProjects,
  createProject,
  updateProject,
  setProjectActive,
  deleteProject,
  listBlogPosts,
  createBlogPost,
  updateBlogPost,
  setBlogPostActive,
  deleteBlogPost,
  listServices,
  createService,
  updateService,
  setServiceActive,
  deleteService,
  listCollections,
  listCollectionProducts,
  createCollection,
  updateCollection,
  deleteCollection,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listInventory,
  adjustStock,
  listStockMovements,
  listDeliveryZones,
  saveDeliveryZone,
  deleteDeliveryZone,
  listMediaAssets,
  addMediaAsset,
  deleteMediaAsset,
  updateMediaAsset,
  bulkDeleteMediaAssets,
  moveMediaAssets,
  assignMediaToProduct,
};
