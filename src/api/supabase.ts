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
 *     order confirm — NO (see below);
 *   createOrder → order-submit EF → order_submit RPC (server re-pricing of the
 *     converged catalogue, SELECT ... FOR UPDATE stock atomicity, client_ref
 *     replay idempotency; client subtotal/total ignored by design). Hosted
 *     deployment of migration 0003 + the order-submit EF is pending owner action;
 *   quote convert → quote_convert RPC (quote.manage cap; negotiated lines are
 *     the approved artifact, stock still verified FOR UPDATE; flips the quote,
 *     stamps convertedOrderId + audit atomically). Hosted deployment of
 *     migration 0004 is pending owner action.
 *   draft orders (0008) — staff CRUD (read: order.manage or finance.manage;
 *     write: order.manage) and draft → order via convert_draft_order RPC
 *     (0010, 2026-11-07 owner gate, full spec): catalogue reprice per line
 *     (stock FOR UPDATE + rollback), order.manage-audited negotiated
 *     overrides, zone shipping, idempotent flip to converted. Exchanges + claims (0009) — full
 *     lifecycle; line validation, transition guards and timeline notes via
 *     record_order_event; stock effects via inventory_apply (catalog.manage).
 *     Singleton resets (Wave 3) — restore the bundle's default copy from
 *     @/api/singleton-defaults (warranty / custom-design / virtual-showroom).
 *
 * What is deliberately NOT wired — it throws SupabaseUnsupportedError naming
 * the cause instead of returning fabricated data:
 *   companies (admin B2B master — Wave 2+ scope), page folders (no table),
 *   delivery zones (schema reshaped by 0007; ETA/COD zone config is an owner call),
 *   assignMediaToProduct (needs a media RPC), createProduct/duplicateProduct/
 *   deleteProduct/importProductsCsv (catalogue authoring goes through the
 *   seed/migration path by design), getChannelSales (orders carry no channel
 *   attribution column yet — Wave-2 decision), resetDemoData (never destructive),
 *   invoice operations (no AdminApi methods — invoices are EF-first by design).
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type {
  AdminApi,
  ChatConversation, ChatMessage, ChatMode,
  LeadImportInput, LeadImportResult, AdminLeadPatch,
  AdminBlogPost, AdminBrand, AdminBundle, AdminCategory, AdminCollection, AdminCollectionKind,
  AdminCustomDesignPage, AdminCustomer, AdminDeliveryZone, AdminHomepageSections, AdminInventoryItem, AdminLead,
  AdminMaterial, AdminMediaAsset, AdminOptionSet, AdminOrder, AdminOrderEvent, AdminPage,
  AdminPageContentItem, AdminPageDoc, AdminPageHistoryEntry, AdminPageSeo, AdminPriceList,
  AdminProduct, AdminProject, AdminPurchaseOrder, AdminPurchaseOrderPatch, AdminQuote,
  AdminQuotePatch, AdminQuoteVersion, AdminQuoteTemplate, AdminInvoice, AdminInvoicePayment, InvoiceStatus, NewInvoicePaymentInput, AdminTask, NewTaskInput, AdminClient, MergeCandidate, ClientCrossRefs, AdminSiteVisit, NewSiteVisitInput, SiteVisitPatch, SiteVisitStatus,
  AdminReturn, AdminReturnPatch, AdminSalesChannel, AdminSeries, AdminService,
  AdminShowroom, AdminStockMovement, AdminStockTransfer, AdminStockTransferPatch, AdminSupplier,
  AdminSupplierPatch, AdminVirtualShowroomPage, AdminWarrantyPage,
  AdminClaim, AdminClaimPatch, AdminDraftOrder, AdminDraftOrderPatch, AdminExchange, AdminExchangePatch,
  BulkProductPatch, BundleStatus, DashboardStats, ListParams, PaymentMethod, NewAdminBundleInput,
  NewAdminCollectionInput, NewAdminPriceListInput, NewBlogPostInput, NewBrandInput, NewLeadInput,
  NewMaterialInput, NewOrderInput, NewOptionSetInput, NewProjectInput, NewPurchaseOrderInput,
  NewPurchaseOrderLineInput, NewQuoteInput, NewReturnInput, NewSalesChannelInput, NewServiceInput,
  NewAdminProductInput,
  NewClaimInput, NewDraftOrderInput, NewDraftOrderLineInput, NewExchangeInput,
  NewSeriesInput, NewShowroomInput, NewStockTransferInput, NewSupplierInput,
  Paginated, PurchaseOrderReceipt, QuoteStatus, RevenuePoint, StockMovementType, StoreSettings,
  ExchangeStatus, ClaimStatus, ClaimType, DraftOrderStatus, AdminOrderItem,
  StockTransferReceipt, TransferLocation, PurchaseOrderStatus, PriceListStatus,
  ProductImportRow, ProductImportResult,
  ProjectCostCode, ProjectActualLine, ProjectActualSource, ProjectFileItem,
  ProjectPractice, ProjectQcInspection, ProjectProductionEvent,
  OrderProduction,
  ProjectPostDispatch,
  ProjectHandover,
  ProjectWarranty,
  ProjectHandoverKind,
  ProjectWarrantyClaim,
  ProjectWarrantyResolutionKind,
  StaffSeat,
  WarrantyRegisterRow,
} from "@/api/types";
import { BUILTIN_TEMPLATES, isBuiltinTemplateId, DEFAULT_QUOTE_TEMPLATE, clampAdvancePct } from "@/api/quote-templates";
import { defaultWarrantyPage, defaultCustomDesignPage, defaultVirtualShowroomPage } from "@/api/singleton-defaults";

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
const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asOptStr = (v: unknown): string | undefined => (v == null ? undefined : String(v));
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

// PostgREST rows are dynamically shaped by the converged schema; every consumer coerces at the boundary (toNum/asStr/String/Boolean, an optional spread with truthy guards). Keep the alias to one seam and lint-clean it there instead of widening 70+ Money-path expressions to unknown in one commit — review coercion diff-by-diff.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    compareAtPrice: p.compareAtPrice != null ? toNum(p.compareAtPrice) : undefined,
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
    // Control-center — verbatim from admin_overview (RPC is the source of truth)
    outstandingInvoices: toNum(o.pending_invoices),
    openQuotes: toNum(o.open_quotes),
    pipelineValue: toNum(o.pipeline_value),
    overdueReturns: toNum(o.overdue_returns),
    publishedPages: toNum(o.published_pages),
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
async function createOrder(input: NewOrderInput): Promise<AdminOrder> {
  guard();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/order-submit`;
  // The reference also identifies replays; use a high-entropy browser token,
  // never a timestamp plus Math.random. Do not fall back to a predictable ID.
  const clientRef = `ord-${crypto.randomUUID()}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "") },
    body: JSON.stringify({
      items: (input.items ?? []).map((l) => ({ productId: String(l.id), quantity: l.quantity })),
      name: input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
      address: input.address,
      city: input.city,
      notes: input.notes,
      paymentMethod: input.paymentMethod,
      channelId: input.channelId,
      clientRef,
      cfTurnstileToken: input.cfTurnstileToken,
    }),
  });
  const body = (await resp.json().catch(() => ({}))) as { ok?: boolean; order?: Record<string, unknown>; error?: string; detail?: string };
  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Supabase: too many orders on this connection — please wait a few minutes and try again.");
    if (resp.status === 403) throw new Error("Supabase: the anti-bot check failed — please retry the order (and complete the challenge if shown).");
    if (resp.status === 409) {
      throw new Error(`Supabase: order rejected — ${body.detail ?? "insufficient stock for one of the lines"}`);
    }
    throw new Error(`Supabase: order-submit failed (${resp.status}) — ${body.error ?? "the function rejected the submission"}`);
  }
  const o = body.order!;
  // client-sent subtotal/shipping/total are IGNORED — the RPC is the only price authority
  return {
    id: String(o.ref ?? o.id),
    customerName: String(o.customerName ?? input.customerName),
    customerEmail: String(o.customerEmail ?? input.customerEmail ?? ""),
    customerPhone: String(o.customerPhone ?? input.customerPhone),
    ...(o.address ? { address: String(o.address) } : input.address ? { address: input.address } : {}),
    ...(input.channelId ? { channelId: input.channelId } : {}),
    city: String(o.city ?? input.city),
    items: ((o.items as AdminOrder["items"]) ?? input.items) as AdminOrder["items"],
    subtotal: toNum(o.subtotal),
    shipping: toNum(o.shipping),
    total: toNum(o.total),
    paymentMethod: String(o.paymentMethod ?? input.paymentMethod) as AdminOrder["paymentMethod"],
    status: "pending",
    placedAt: String(o.placedAt ?? new Date().toISOString()),
    discountPct: 0,
    discountAmount: 0,
  } as unknown as AdminOrder;
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

/* ── exchanges (Wave 2b — exchanges/claims, migration 0009) ──────────────── */
const EXCHANGE_TRANSITIONS: Record<ExchangeStatus, ExchangeStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["shipped"],
  shipped: ["completed"],
  completed: [],
  rejected: [],
};
const EXCHANGE_REF = (id: number) => `EXC-${id}`;
const parseExchangeId = (s: string): number => {
  const m = String(s).match(/^EXC-(\d+)$/);
  return m ? Number(m[1]) : Number(s);
};
const rowToAdminExchange = (r: Row): AdminExchange => {
  const incoming = (Array.isArray(r.incoming) ? r.incoming : []) as AdminExchange["incoming"];
  const outgoing = (Array.isArray(r.outgoing) ? r.outgoing : []) as AdminExchange["outgoing"];
  return {
    id: String(r.ref ?? EXCHANGE_REF(Number(r.id))),
    orderId: r.order_id != null ? orderRef(Number(r.order_id)) : "—",
    ...(r.return_id != null ? { returnId: `RMA-${pad4(Number(r.return_id))}` } : {}),
    customerName: String(r.customer ?? ""),
    customerEmail: r.customer_email ? String(r.customer_email) : "",
    customerPhone: r.customer_phone ? String(r.customer_phone) : "",
    city: r.city ? String(r.city) : "",
    incoming,
    outgoing,
    ...(r.reason ? { reason: String(r.reason) } : {}),
    status: String(r.status ?? "requested") as ExchangeStatus,
    priceDifference: toNum(r.price_difference),
    differenceSettled: Boolean(r.difference_settled),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
};
async function listExchanges(params?: ListParams & { status?: ExchangeStatus | "all" }): Promise<Paginated<AdminExchange>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 20));
  const { data, error } = await supabase.from("exchanges").select("*").order("updated_at", { ascending: false });
  if (error) fail("listExchanges", error);
  let rows = (data ?? []) as Row[];
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.ref, r.customer, r.customer_email, r.city, r.reason, r.order_id].some((v) => String(v ?? "").toLowerCase().includes(q)));
  if (params?.status && params.status !== "all") rows = rows.filter((r) => String(r.status) === params.status);
  const total = rows.length;
  return pagenate(rows.slice((page - 1) * perPage, page * perPage).map(rowToAdminExchange), total, page, perPage);
}
async function getExchange(id: string): Promise<AdminExchange | undefined> {
  guard();
  const num = parseExchangeId(id);
  const { data, error } = await supabase.from("exchanges").select("*").eq("id", num).maybeSingle();
  if (error) fail("getExchange", error);
  return data ? rowToAdminExchange(data) : undefined;
}
const recordOrderNote = async (orderId: number | null | undefined, note: string) => {
  if (orderId == null) return;
  const { error } = await supabase.rpc("record_order_event", { p_order_id: orderId, p_note: note });
  if (error) console.warn(`Supabase: exchange/claim created/updated but the order timeline note was not recorded (${error.message})`);
};
async function createExchange(input: NewExchangeInput): Promise<AdminExchange | undefined> {
  guard();
  const orderId = parseOrderId(input.orderId);
  const { data: order, error: e1 } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (e1) fail("getOrder", e1);
  if (!order) return undefined;
  const o = order as Row;
  if (STAGE_TO_STATUS[String(o.stage ?? "intake")] !== "delivered") {
    throw new Error("New ExchangeInput rejected: the order must be delivered before an exchange can be opened.");
  }
  let returnNum: number | null = null;
  if (input.returnId) {
    const m = String(input.returnId).match(/(\d+)/);
    returnNum = m ? Number(m[1]) : NaN;
    if (!Number.isFinite(returnNum)) throw new Error(`Linked return "${input.returnId}" carries no numeric id`);
    const { data: ret, error: e2 } = await supabase.from("returns").select("id").eq("id", returnNum).maybeSingle();
    if (e2) fail("getReturn", e2);
    if (!ret) throw new Error(`Linked return ${input.returnId} not found.`);
  }
  const orderItems = (Array.isArray(o.items) ? o.items : []) as { id: string; name: string; price: number; image?: string; quantity: number }[];
  const wantedIn = new Map((input.incoming ?? []).map((l) => [l.productId, Math.max(0, Math.trunc(Number(l.quantity) || 0))]));
  const incoming: AdminExchange["incoming"] = [];
  for (const line of orderItems) {
    const qty = Math.min(wantedIn.get(line.id) ?? 0, line.quantity);
    if (qty > 0) incoming.push({ id: line.id, name: line.name, ...(line.image ? { image: line.image } : {}), quantity: qty, price: toNum(line.price) });
  }
  if (incoming.length === 0) throw new Error("Select at least one item to take back.");
  const wantedOut: { id: string; qty: number }[] = [];
  for (const l of input.outgoing ?? []) {
    const qty = Math.max(0, Math.trunc(Number(l.quantity) || 0));
    if (l.productId?.trim() && qty > 0) wantedOut.push({ id: l.productId.trim(), qty });
  }
  if (wantedOut.length === 0) throw new Error("Add at least one replacement item.");
  const { data: prods, error: e3 } = await supabase.from("products").select("*").in("id", wantedOut.map((l) => l.id));
  if (e3) fail("getProducts", e3);
  const prodRows = (prods ?? []) as Row[];
  const outgoing: AdminExchange["outgoing"] = [];
  for (const want of wantedOut) {
    const pr = prodRows.find((x) => x.id === want.id);
    if (!pr) continue;
    const pImg = asObj(pr.payload).image;
    outgoing.push({
      id: String(pr.id),
      name: String(pr.name ?? pr.id),
      ...(typeof pImg === "string" && pImg ? { image: pImg } : {}),
      quantity: want.qty,
      price: toNum(pr.price),
    });
  }
  if (outgoing.length === 0) throw new Error("Add at least one replacement item — none of the given product ids exist.");
  const inTotal = incoming.reduce((acc, it) => acc + it.price * it.quantity, 0);
  const outTotal = outgoing.reduce((acc, it) => acc + it.price * it.quantity, 0);
  const diff = outTotal - inTotal;
  const { data, error } = await supabase.from("exchanges").insert({
    order_id: orderId,
    return_id: returnNum,
    customer: String(o.customer ?? ""),
    customer_email: o.customer_email ? String(o.customer_email) : null,
    customer_phone: o.customer_phone ? String(o.customer_phone) : null,
    city: o.city ? String(o.city) : null,
    incoming: incoming as unknown as Json,
    outgoing: outgoing as unknown as Json,
    reason: input.reason?.trim() || null,
    status: "requested",
    price_difference: diff,
    difference_settled: diff === 0,
  }).select("*").single();
  if (error) fail("createExchange", error);
  const num = (data as Row).id as number;
  const ref = EXCHANGE_REF(num);
  await supabase.from("exchanges").update({ ref }).eq("id", num);
  await recordOrderNote(orderId, `Exchange ${ref} opened${returnNum ? ` — links RMA-${pad4(returnNum)}` : ""}`);
  return rowToAdminExchange({ ...(data as Row), ref });
}
async function updateExchange(id: string, patch: AdminExchangePatch): Promise<AdminExchange | undefined> {
  guard();
  const num = parseExchangeId(id);
  const { data: current, error: e0 } = await supabase.from("exchanges").select("*").eq("id", num).maybeSingle();
  if (e0) fail("getExchange", e0);
  if (!current) return undefined;
  const curRow = current as Row;
  const cur = rowToAdminExchange(curRow);
  const terminal = cur.status === "completed" || cur.status === "rejected";
  const row: TablesUpdate<"exchanges"> = {};
  if (patch.differenceSettled !== undefined) {
    if (terminal) throw new Error(`Exchange ${cur.id} is closed — no further edits.`);
    row.difference_settled = Boolean(patch.differenceSettled);
  }
  let becomingShipped = false;
  let becomingCompleted = false;
  let nextStatus: ExchangeStatus | undefined;
  if (patch.status !== undefined && patch.status !== cur.status) {
    if (terminal) throw new Error(`Exchange ${cur.id} is closed — no further edits.`);
    const allowed = EXCHANGE_TRANSITIONS[cur.status] ?? [];
    if (!allowed.includes(patch.status)) {
      throw new Error(`Exchange ${cur.id} cannot move from ${cur.status} to ${patch.status}.`);
    }
    row.status = patch.status;
    nextStatus = patch.status;
    becomingShipped = patch.status === "shipped";
    becomingCompleted = patch.status === "completed";
  }
  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from("exchanges").update(row).eq("id", num);
  if (error) fail("updateExchange", error);
  if (becomingShipped) {
    for (const line of cur.outgoing) {
      const { error: e3 } = await supabase.rpc("inventory_apply", {
        p_product_id: line.id,
        p_delta: -Math.max(1, line.quantity),
        p_reason: "exchange_dispatch",
        p_note: `Exchange ${cur.id} dispatch — ${line.name}`,
      });
      if (e3) throw new Error(`Supabase: exchange ${cur.id} marked shipped but dispatch stock was not decremented for ${line.id} (the actor needs catalog.manage): ${e3.message}`);
    }
  }
  if (becomingCompleted) {
    for (const line of cur.incoming) {
      const { error: e4 } = await supabase.rpc("inventory_apply", {
        p_product_id: line.id,
        p_delta: Math.max(1, line.quantity),
        p_reason: "exchange_restock",
        p_note: `Exchange ${cur.id} restock — ${line.name}`,
      });
      if (e4) throw new Error(`Supabase: exchange ${cur.id} marked completed but restock failed for ${line.id} (the actor needs catalog.manage): ${e4.message}`);
    }
  }
  if (nextStatus) {
    const note =
      nextStatus === "approved" ? `Exchange ${cur.id} approved`
      : nextStatus === "shipped" ? `Exchange ${cur.id} — replacement dispatched`
      : nextStatus === "completed" ? `Exchange ${cur.id} completed${cur.priceDifference !== 0 && !(row.difference_settled ?? cur.differenceSettled) ? " — price difference still pending" : ""}`
      : `Exchange ${cur.id} rejected`;
    await recordOrderNote(curRow.order_id == null ? null : Number(curRow.order_id), note);
  }
  return getExchange(id);
}

/* ── claims (Wave 2b) ───────────────────────────────────────────────────── */
const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  reported: ["assessing", "rejected"],
  assessing: ["approved", "rejected"],
  approved: ["resolved"],
  rejected: [],
  resolved: [],
};
const CLAIM_REF = (id: number) => `CLM-${id}`;
const parseClaimId = (s: string): number => {
  const m = String(s).match(/^CLM-(\d+)$/);
  return m ? Number(m[1]) : Number(s);
};
const rowToAdminClaim = (r: Row): AdminClaim => ({
  id: String(r.ref ?? CLAIM_REF(Number(r.id))),
  ...(r.order_id != null ? { orderId: orderRef(Number(r.order_id)) } : {}),
  customerName: String(r.customer ?? ""),
  customerEmail: r.customer_email ? String(r.customer_email) : "",
  customerPhone: r.customer_phone ? String(r.customer_phone) : "",
  city: r.city ? String(r.city) : "",
  productName: String(r.product_name ?? ""),
  ...(r.product_id ? { productId: String(r.product_id) } : {}),
  type: String(r.type ?? "warranty") as ClaimType,
  issue: String(r.issue ?? ""),
  status: String(r.status ?? "reported") as ClaimStatus,
  ...(r.assessment_note ? { assessmentNote: String(r.assessment_note) } : {}),
  ...(r.resolution_note ? { resolutionNote: String(r.resolution_note) } : {}),
  ...(r.resolution_cost != null ? { resolutionCost: toNum(r.resolution_cost) } : {}),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
async function listClaims(params?: ListParams & { status?: ClaimStatus | "all"; type?: ClaimType | "all" }): Promise<Paginated<AdminClaim>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 20));
  const { data, error } = await supabase.from("claims").select("*").order("updated_at", { ascending: false });
  if (error) fail("listClaims", error);
  let rows = (data ?? []) as Row[];
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.ref, r.order_id, r.customer, r.customer_email, r.product_name, r.city, r.issue].some((v) => String(v ?? "").toLowerCase().includes(q)));
  if (params?.status && params.status !== "all") rows = rows.filter((r) => String(r.status) === params.status);
  if (params?.type && params.type !== "all") rows = rows.filter((r) => String(r.type) === params.type);
  const total = rows.length;
  return pagenate(rows.slice((page - 1) * perPage, page * perPage).map(rowToAdminClaim), total, page, perPage);
}
async function getClaim(id: string): Promise<AdminClaim | undefined> {
  guard();
  const num = parseClaimId(id);
  const { data, error } = await supabase.from("claims").select("*").eq("id", num).maybeSingle();
  if (error) fail("getClaim", error);
  return data ? rowToAdminClaim(data) : undefined;
}
async function createClaim(input: NewClaimInput): Promise<AdminClaim | undefined> {
  guard();
  const productName = input.productName?.trim();
  const issue = input.issue?.trim();
  if (!productName) throw new Error("Tell us which product the claim is about.");
  if (!issue) throw new Error("Describe the issue the customer reported.");
  const orderId = input.orderId ? parseOrderId(input.orderId) : null;
  let customerName = input.customerName?.trim() ?? "";
  let customerEmail = input.customerEmail?.trim() ?? "";
  let customerPhone = input.customerPhone?.trim() ?? "";
  let city = input.city?.trim() ?? "";
  if (orderId != null) {
    const { data: order, error: e1 } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (e1) fail("getOrder", e1);
    if (!order) throw new Error(`Order ${input.orderId} not found.`);
    const o = order as Row;
    customerName = String(o.customer ?? "");
    customerEmail = o.customer_email ? String(o.customer_email) : "";
    customerPhone = o.customer_phone ? String(o.customer_phone) : "";
    city = o.city ? String(o.city) : "";
  }
  if (!customerName) throw new Error("Link an order or enter the customer's name.");
  const { data, error } = await supabase.from("claims").insert({
    order_id: orderId,
    customer: customerName,
    customer_email: customerEmail || null,
    customer_phone: customerPhone || null,
    city: city || null,
    product_name: productName,
    product_id: input.productId?.trim() || null,
    type: input.type,
    issue,
    status: "reported",
  }).select("*").single();
  if (error) fail("createClaim", error);
  const num = (data as Row).id as number;
  const ref = CLAIM_REF(num);
  await supabase.from("claims").update({ ref }).eq("id", num);
  await recordOrderNote(orderId, `Claim ${ref} filed — ${input.type}`);
  return rowToAdminClaim({ ...(data as Row), ref });
}
async function updateClaim(id: string, patch: AdminClaimPatch): Promise<AdminClaim | undefined> {
  guard();
  const num = parseClaimId(id);
  const { data: current, error: e0 } = await supabase.from("claims").select("*").eq("id", num).maybeSingle();
  if (e0) fail("getClaim", e0);
  if (!current) return undefined;
  const curRow = current as Row;
  const cur = rowToAdminClaim(curRow);
  const terminal = cur.status === "rejected" || cur.status === "resolved";
  if (terminal && (patch.status !== undefined || patch.assessmentNote !== undefined || patch.resolutionNote !== undefined || patch.resolutionCost !== undefined)) {
    throw new Error(`Claim ${cur.id} is closed — no further edits.`);
  }
  const row: TablesUpdate<"claims"> = {};
  if (patch.assessmentNote !== undefined) row.assessment_note = patch.assessmentNote.trim() || null;
  if (patch.resolutionNote !== undefined) row.resolution_note = patch.resolutionNote.trim() || null;
  if (patch.resolutionCost !== undefined) {
    const amt = Number(patch.resolutionCost);
    if (!Number.isFinite(amt) || amt < 0) throw new Error("Resolution cost must be a positive number.");
    row.resolution_cost = Math.round(amt);
  }
  let nextStatus: ClaimStatus | undefined;
  if (patch.status !== undefined && patch.status !== cur.status) {
    const allowed = CLAIM_TRANSITIONS[cur.status] ?? [];
    if (!allowed.includes(patch.status)) {
      throw new Error(`Claim ${cur.id} cannot move from ${cur.status} to ${patch.status}.`);
    }
    row.status = patch.status;
    nextStatus = patch.status;
  }
  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from("claims").update(row).eq("id", num);
  if (error) fail("updateClaim", error);
  if (nextStatus) {
    const assessmentNote = row.assessment_note ?? cur.assessmentNote;
    const resolutionNote = row.resolution_note ?? cur.resolutionNote;
    const note =
      nextStatus === "assessing" ? `Claim ${cur.id} — assessment started`
      : nextStatus === "approved" ? `Claim ${cur.id} approved${assessmentNote ? ` — ${assessmentNote}` : ""}`
      : nextStatus === "rejected" ? `Claim ${cur.id} rejected${assessmentNote ? ` — ${assessmentNote}` : ""}`
      : `Claim ${cur.id} resolved${resolutionNote ? ` — ${resolutionNote}` : ""}`;
    await recordOrderNote(curRow.order_id == null ? null : Number(curRow.order_id), note);
  }
  return getClaim(id);
}

/* ── draft orders (Wave 2 — migrations 0008 + 0010 draft→order conversion) ── */
const DRAFT_REF = (id: number) => `DRF-${id}`;
const parseDraftId = (s: string): number => {
  const m = String(s).match(/^DRF-(\d+)$/);
  return m ? Number(m[1]) : Number(s);
};
const sanitizeDraftLines = (lines: NewDraftOrderLineInput[]): AdminOrderItem[] => {
  const items: AdminOrderItem[] = [];
  let seq = 1;
  for (const line of lines ?? []) {
    const name = line.name?.trim();
    const price = Number(line.price);
    const qty = Math.max(1, Math.trunc(Number(line.quantity) || 1));
    if (!name || !Number.isFinite(price) || price < 0) continue;
    items.push({
      id: line.productId?.trim() || `free-${Date.now().toString(36)}-${seq++}`,
      name,
      price: Math.round(price),
      quantity: qty,
      ...(line.image ? { image: line.image } : {}),
      ...(line.category ? { category: line.category } : {}),
      ...(line.series ? { series: line.series } : {}),
      ...(line.material ? { material: line.material } : {}),
      ...(line.finish ? { finish: line.finish } : {}),
      ...(line.width !== undefined ? { width: line.width } : {}),
      ...(line.height !== undefined ? { height: line.height } : {}),
      ...(line.depth !== undefined ? { depth: line.depth } : {}),
      ...(line.unit ? { unit: line.unit } : {}),
      ...(line.customNotes ? { customNotes: line.customNotes } : {}),
    });
  }
  return items;
};
const draftLineTotal = (items: AdminOrderItem[]): number => items.reduce((acc, it) => acc + toNum(it.price) * toNum(it.quantity), 0);
const rowToAdminDraftOrder = (r: Row): AdminDraftOrder => {
  const items = (Array.isArray(r.items) ? r.items : []) as AdminOrderItem[];
  const subtotal = toNum(r.subtotal, draftLineTotal(items));
  const shipping = toNum(r.shipping);
  return {
    id: String(r.ref ?? DRAFT_REF(Number(r.id))),
    customerName: String(r.customer ?? ""),
    customerPhone: r.customer_phone ? String(r.customer_phone) : "",
    customerEmail: r.customer_email ? String(r.customer_email) : "",
    ...(r.city ? { city: String(r.city) } : {}),
    ...(r.address ? { address: String(r.address) } : {}),
    items,
    subtotal,
    shipping,
    total: toNum(r.total, subtotal + shipping),
    ...(r.channel_id ? { channelId: String(r.channel_id) } : {}),
    ...(r.note ? { notes: String(r.note) } : {}),
    status: String(r.status ?? "draft") as DraftOrderStatus,
    ...(r.converted_order_id ? { convertedOrderId: String(r.converted_order_id) } : {}),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
};
async function listDraftOrders(params?: ListParams & { status?: DraftOrderStatus | "all" }): Promise<Paginated<AdminDraftOrder>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 20));
  const { data, error } = await supabase.from("draft_orders").select("*").order("updated_at", { ascending: false });
  if (error) fail("listDraftOrders", error);
  let rows = (data ?? []) as Row[];
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.ref, r.customer, r.customer_phone, r.customer_email, r.city, r.note, r.converted_order_id].some((v) => String(v ?? "").toLowerCase().includes(q)));
  if (params?.status && params.status !== "all") rows = rows.filter((r) => String(r.status) === params.status);
  const total = rows.length;
  return pagenate(rows.slice((page - 1) * perPage, page * perPage).map(rowToAdminDraftOrder), total, page, perPage);
}
async function getDraftOrder(id: string): Promise<AdminDraftOrder | undefined> {
  guard();
  const num = parseDraftId(id);
  const { data, error } = await supabase.from("draft_orders").select("*").eq("id", num).maybeSingle();
  if (error) fail("getDraftOrder", error);
  return data ? rowToAdminDraftOrder(data) : undefined;
}
async function createDraftOrder(input: NewDraftOrderInput): Promise<AdminDraftOrder> {
  guard();
  const customerName = input.customerName?.trim();
  const customerPhone = input.customerPhone?.trim();
  if (!customerName) throw new Error("Customer name is required.");
  if (!customerPhone) throw new Error("Customer phone is required.");
  const items = sanitizeDraftLines(input.items ?? []);
  if (items.length === 0) throw new Error("Add at least one line to the draft.");
  const subtotal = draftLineTotal(items);
  const shipping = input.shipping !== undefined ? Math.max(0, Math.round(Number(input.shipping) || 0)) : subtotal >= 150000 ? 0 : 1500;
  const { data, error } = await supabase.from("draft_orders").insert({
    customer: customerName,
    customer_phone: customerPhone,
    customer_email: input.customerEmail?.trim() || null,
    city: input.city?.trim() || null,
    address: input.address?.trim() || null,
    items: items as unknown as Json,
    subtotal,
    shipping,
    total: subtotal + shipping,
    channel_id: input.channelId?.trim() || "ch-manual",
    note: input.notes?.trim() || null,
    status: "draft",
  }).select("*").single();
  if (error) fail("createDraftOrder", error);
  const num = (data as Row).id as number;
  const ref = DRAFT_REF(num);
  await supabase.from("draft_orders").update({ ref }).eq("id", num);
  return rowToAdminDraftOrder({ ...(data as Row), ref });
}
async function updateDraftOrder(id: string, patch: AdminDraftOrderPatch): Promise<AdminDraftOrder | undefined> {
  guard();
  const num = parseDraftId(id);
  const { data: current, error: e0 } = await supabase.from("draft_orders").select("*").eq("id", num).maybeSingle();
  if (e0) fail("getDraftOrder", e0);
  if (!current) return undefined;
  const curRow = current as Row;
  const cur = rowToAdminDraftOrder(curRow);
  if (cur.status === "converted") {
    throw new Error(`Draft ${cur.id} is already converted — it can no longer be edited.`);
  }
  const row: TablesUpdate<"draft_orders"> = {};
  if (patch.customerName !== undefined) {
    const v = patch.customerName.trim();
    if (!v) throw new Error("Customer name is required.");
    row.customer = v;
  }
  if (patch.customerPhone !== undefined) {
    const v = patch.customerPhone.trim();
    if (!v) throw new Error("Customer phone is required.");
    row.customer_phone = v;
  }
  if (patch.customerEmail !== undefined) row.customer_email = patch.customerEmail.trim() || null;
  if (patch.city !== undefined) row.city = patch.city.trim() || null;
  if (patch.address !== undefined) row.address = patch.address.trim() || null;
  if (patch.notes !== undefined) row.note = patch.notes.trim() || null;
  if (patch.channelId !== undefined) row.channel_id = patch.channelId.trim() || null;
  let nextSubtotal = cur.subtotal;
  if (patch.items !== undefined) {
    const items = sanitizeDraftLines(patch.items);
    if (items.length === 0) throw new Error("A draft needs at least one line.");
    row.items = items as unknown as Json;
    nextSubtotal = draftLineTotal(items);
    row.subtotal = nextSubtotal;
  }
  if (patch.shipping !== undefined) row.shipping = Math.max(0, Math.round(Number(patch.shipping) || 0));
  const nextShipping = row.shipping ?? cur.shipping;
  row.total = nextSubtotal + nextShipping;
  row.updated_at = new Date().toISOString();
  const { error } = await supabase.from("draft_orders").update(row).eq("id", num);
  if (error) fail("updateDraftOrder", error);
  return getDraftOrder(id);
}
async function deleteDraftOrder(id: string): Promise<boolean> {
  guard();
  const num = parseDraftId(id);
  const { data: current, error: e0 } = await supabase.from("draft_orders").select("id, status").eq("id", num).maybeSingle();
  if (e0) fail("getDraftOrder", e0);
  if (!current || String((current as Row).status) === "converted") return false;
  const { error } = await supabase.from("draft_orders").delete().eq("id", num);
  if (error) fail("deleteDraftOrder", error);
  return true;
}
/**
 * Draft → order, server-authoritative (owner-approved 2026-11-07, full spec —
 * migration 0010 `convert_draft_order`): catalogue reprice per line, stock
 * FOR UPDATE with full rollback on any shortfall, zone shipping, idempotent
 * flip (converted + converted_order_id) in one transaction. Negotiated line
 * prices require order.manage and arrive as explicit
 * `overrides: [{ line, price }]` — audited in order_events server-side.
 */
async function convertDraftOrder(id: string, paymentMethod: PaymentMethod = "cod", overrides?: Array<{ line: number; price: number }>): Promise<AdminOrder | undefined> {
  guard();
  const draftId = parseDraftId(id);
  if (!Number.isFinite(draftId)) throw new Error(`Supabase: draft id "${id}" is not a DRF-<n> reference`);
  const { data, error } = await supabase.rpc("convert_draft_order", {
    p_draft_id: draftId,
    p_negotiated_lines: (overrides ?? []) as unknown as Json,
    p_payment_method: paymentMethod,
  });
  if (error) fail("convert_draft_order", error);
  const res = data as { ok?: boolean; reason?: string; orderRef?: string; id?: string; ref?: string } | null;
  if (!res?.ok) {
    if (res?.reason === "not-found") return undefined;
    if (res?.reason === "already-converted") {
      throw new Error(`Draft ${id} is already converted to ${res.orderRef ?? "unknown order"}.`);
    }
    throw new Error(`Supabase convert_draft_order failed: ${res?.reason ?? "unknown error"}`);
  }
  const ref = String(res.ref ?? res.id);
  const order = await getOrder(ref);
  if (!order) throw new Error(`Supabase convert_draft_order failed: order ${ref} not readable after conversion.`);
  return order;
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
    version: toNum(r.version, 1) || 1,
    ...(details.templateId !== undefined ? { templateId: String(details.templateId) } : {}),
    ...(Array.isArray(r.audit) ? { audit: r.audit as unknown as AdminQuote["audit"] } : {}),
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
  for (const k of ["discountPct", "shipping", "validityDays", "validUntil", "convertedOrderId", "leadId", "templateId"]) {
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
  const newVersion = (toNum(cur.version, 1) || 1) + 1;
  const prevStatus = String(cur.status ?? "draft");
  const auditList: unknown[] = Array.isArray(cur.audit) ? [...(cur.audit as unknown[])] : [];
  const statusChanged = patch.status !== undefined && patch.status !== prevStatus;
  auditList.push(statusChanged
    ? { version: newVersion, at: new Date().toISOString(), action: "status", detail: `${prevStatus}→${patch.status}` }
    : { version: newVersion, at: new Date().toISOString(), action: "edit" });
  const cappedAudit = auditList.slice(-20);

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
  row.version = newVersion;
  row.audit = cappedAudit as Json;
  const { error } = await supabase.from("quotes").update(row).eq("id", num);
  if (error) fail("updateQuote", error);
  // version snapshot (audit auxiliary — never blocks the save)
  try {
    const { error: eVer } = await supabase.from("quote_versions").insert({
      quote_id: num,
      version: newVersion,
      action: statusChanged ? `status:${String(patch.status)}` : "edit",
      actor: null,
      snapshot: {
        items: lines,
        subtotal: toNum(details.subtotal),
        discountPct: details.discountPct,
        discountAmount: details.discountAmount,
        shipping: details.shipping,
        total,
        status: String(patch.status ?? cur.status),
        notes: row.note ?? cur.note ?? null,
        templateId: details.templateId ?? null,
        validityDays: details.validityDays,
        validUntil: details.validUntil,
      } as unknown as Json,
    });
    if (eVer) console.error("quote_versions insert failed (non-fatal):", eVer.message);
  } catch (eVer) {
    console.error("quote_versions insert failed (non-fatal):", eVer);
  }
  return getQuote(id);
}
async function listQuoteVersions(id: string): Promise<AdminQuoteVersion[]> {
  guard();
  const num = parseQuoteId(id);
  const { data, error } = await supabase
    .from("quote_versions")
    .select("*")
    .eq("quote_id", num)
    .order("version", { ascending: false })
    .limit(30);
  if (error) fail("listQuoteVersions", error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    quoteId: QUOTE_REF(num),
    version: toNum(r.version),
    action: (r.action ?? undefined) as string | undefined,
    actor: (r.actor ?? undefined) as string | undefined,
    createdAt: String(r.created_at),
    snapshot: asObj(r.snapshot) as unknown as AdminQuoteVersion["snapshot"],
  }));
}

async function restoreQuoteVersion(id: string, version: number): Promise<AdminQuote | undefined> {
  guard();
  const num = parseQuoteId(id);
  const target = Math.max(1, Math.trunc(version));
  const { data, error } = await supabase
    .from("quote_versions")
    .select("*")
    .eq("quote_id", num)
    .eq("version", target)
    .maybeSingle();
  if (error) fail("restoreQuoteVersion read", error);
  if (!data) return undefined;
  const snap = asObj((data as Row).snapshot) as unknown as AdminQuoteVersion["snapshot"];
  const patch: AdminQuotePatch = {
    items: Array.isArray(snap.items) ? snap.items : [],
    discountPct: typeof snap.discountPct === "number" ? snap.discountPct : undefined,
    shipping: typeof snap.shipping === "number" ? snap.shipping : undefined,
    validityDays: typeof snap.validityDays === "number" ? snap.validityDays : undefined,
    notes: snap.notes,
    templateId: snap.templateId,
    status: snap.status === "converted" ? undefined : "revised",
  };
  return updateQuote(id, patch);
}

async function listQuoteTemplates(): Promise<AdminQuoteTemplate[]> {
  guard();
  const { data, error } = await supabase.from("quote_templates").select("*").order("updated_at", { ascending: false });
  if (error) fail("listQuoteTemplates", error);
  const custom = ((data ?? []) as Row[])
    .map((r) => {
      const tpl = asObj(r.template);
      return {
        id: String(r.id),
        name: String(r.name ?? "Untitled template"),
        brandColor: typeof tpl.brandColor === "string" ? tpl.brandColor : "#318b45",
        header: Array.isArray(tpl.header) ? (tpl.header as AdminQuoteTemplate["header"]) : DEFAULT_QUOTE_TEMPLATE.header.map((b) => ({ ...b, id: `${b.id}-c` })),
        footer: Array.isArray(tpl.footer) ? (tpl.footer as AdminQuoteTemplate["footer"]) : DEFAULT_QUOTE_TEMPLATE.footer.map((b) => ({ ...b, id: `${b.id}-c` })),
        builtIn: false,
        logo: typeof tpl.logo === "string" && tpl.logo ? tpl.logo : undefined,
        layout: tpl.layout === "a4" ? ("a4" as const) : ("classic" as const),
        advancePct: typeof tpl.advancePct === "number" ? clampAdvancePct(tpl.advancePct) : undefined,
        validityDays: typeof tpl.validityDays === "number" && Number.isFinite(tpl.validityDays) ? Math.max(1, Math.min(365, Math.round(tpl.validityDays))) : undefined,
        termsEn: typeof tpl.termsEn === "string" && tpl.termsEn.trim() ? tpl.termsEn : undefined,
        termsUr: typeof tpl.termsUr === "string" && tpl.termsUr.trim() ? tpl.termsUr : undefined,
        acceptanceBlock: typeof tpl.acceptanceBlock === "boolean" ? tpl.acceptanceBlock : undefined,
        footerVariant: tpl.footerVariant === "zainab" || tpl.footerVariant === "store" || tpl.footerVariant === "custom" ? tpl.footerVariant : undefined,
        footerCustomLines: typeof tpl.footerCustomLines === "string" ? tpl.footerCustomLines : undefined,
      } satisfies AdminQuoteTemplate;
    })
    .filter((t) => !isBuiltinTemplateId(t.id));
  return [...BUILTIN_TEMPLATES, ...custom];
}

async function saveQuoteTemplate(template: AdminQuoteTemplate): Promise<AdminQuoteTemplate> {
  guard();
  const name = String(template.name ?? "").trim();
  if (!name) throw new Error("Template name is required.");
  let saved: AdminQuoteTemplate = { ...template, name, builtIn: false };
  if (!saved.id || isBuiltinTemplateId(saved.id) || template.builtIn) {
    saved = { ...saved, id: `tpl-${Date.now().toString(36)}` };
  }
  const row = {
    id: saved.id,
    name: saved.name,
    template: {
      brandColor: saved.brandColor, header: saved.header, footer: saved.footer, logo: saved.logo ?? null, layout: saved.layout ?? "classic",
      advancePct: saved.advancePct, validityDays: saved.validityDays, termsEn: saved.termsEn ?? null, termsUr: saved.termsUr ?? null,
      acceptanceBlock: saved.acceptanceBlock ?? null, footerVariant: saved.footerVariant ?? null, footerCustomLines: saved.footerCustomLines ?? null,
    } as unknown as Json,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("quote_templates").upsert(row, { onConflict: "id" });
  if (error) fail("saveQuoteTemplate", error);
  return saved;
}

async function deleteQuoteTemplate(id: string): Promise<boolean> {
  guard();
  if (isBuiltinTemplateId(String(id))) return false;
  const { count, error } = await supabase.from("quote_templates").delete({ count: "exact" }).eq("id", String(id));
  if (error) fail("deleteQuoteTemplate", error);
  return (count ?? 0) > 0;
}

/* ── CRM clients + merge-review (0001 clients/client_links; client_merge RPC) ──
   Human-in-the-loop identity resolution: candidates are derived client-side by
   grouping on normalized email/phone among non-merged clients (admin-ERP scale:
   one 5k-row scan, no new RPCs). Merges execute via the capability-checked
   client_merge RPC (crm.manage) — NOT a delete path: retired records are
   tombstoned with merged_into and stay auditable. */
const CLIENT_REF = (id: number) => `CLI-${id}`;
const parseClientId = (s: string): number => {
  const m = String(s).match(/^CLI-(\d+)$/);
  return m ? Number(m[1]) : Number(s);
};
const rowToAdminClient = (r: Row): AdminClient => ({
  id: CLIENT_REF(Number(r.id)),
  name: String(r.name ?? ""),
  ...(r.company ? { company: String(r.company) } : {}),
  ...(r.email ? { email: String(r.email) } : {}),
  ...(r.email_norm ? { emailNorm: String(r.email_norm) } : {}),
  ...(r.phone ? { phone: String(r.phone) } : {}),
  ...(r.phone_norm ? { phoneNorm: String(r.phone_norm) } : {}),
  ...(r.city ? { city: String(r.city) } : {}),
  kind: r.kind === "business" ? "business" : "retail",
  ...(r.source ? { source: String(r.source) } : {}),
  tags: Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [],
  ...(r.notes ? { notes: String(r.notes) } : {}),
  ...(r.merged_into ? { mergedInto: CLIENT_REF(Number(r.merged_into)) } : {}),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});
const CLIENT_COLS = "id,name,company,email,email_norm,phone,phone_norm,city,kind,source,tags,notes,merged_into,created_at,updated_at";

async function updateClientCategory(): Promise<AdminClient | undefined> {
  // V4 PR-C — the clients.category column does not exist hosted; the migration is an owner-gated decision.
  throw new Error("Retagging clients needs the owner-gated clients.category migration — do it in the demo build (VITE_API_MODE=demo).");
}

async function listClientCrossRefs(): Promise<Record<string, ClientCrossRefs>> {
  guard();
  try {
    const { data, error } = await supabase.from("client_links").select("client_id, entity").limit(10000);
    if (error) { console.warn("listClientCrossRefs:", error.message); return {}; }
    const out: Record<string, ClientCrossRefs> = {};
    for (const row of data ?? []) {
      const r = row as { client_id?: number | string; entity?: string };
      if (r.entity !== "lead" && r.entity !== "quote") continue; // invoice/order/project links aren't maintained hosted yet
      const cid = r.client_id === undefined ? undefined : CLIENT_REF(Number(r.client_id));
      if (!cid) continue;
      const e = r.entity as "lead" | "quote";
      (out[cid] ??= {})[e] = (out[cid][e] ?? 0) + 1;
    }
    return out;
  } catch (err) {
    console.warn("listClientCrossRefs failed", err);
    return {}; // never break the Clients page on a hosted hiccup
  }
}

async function listClients(params?: { includeMerged?: boolean }): Promise<AdminClient[]> {
  guard();
  let q = supabase.from("clients").select(CLIENT_COLS).order("created_at", { ascending: true }).limit(2000);
  if (!params?.includeMerged) q = q.is("merged_into", null);
  const { data, error } = await q;
  if (error) fail("listClients", error);
  return (data ?? []).map(rowToAdminClient);
}

async function listMergeCandidates(): Promise<MergeCandidate[]> {
  guard();
  const { data, error } = await supabase.from("clients").select(CLIENT_COLS).is("merged_into", null).limit(5000);
  if (error) fail("listMergeCandidates", error);
  const clients = (data ?? []).map(rowToAdminClient);
  const out: MergeCandidate[] = [];
  const group = (keyOf: (c: AdminClient) => string | undefined, reason: MergeCandidate["reason"]) => {
    const map = new Map<string, AdminClient[]>();
    for (const c of clients) {
      const k = keyOf(c);
      if (!k) continue;
      const arr = map.get(k) ?? [];
      arr.push(c);
      map.set(k, arr);
    }
    for (const [key, members] of map) {
      if (members.length >= 2) out.push({ id: `${reason}:${key}`, reason, key, clients: members });
    }
  };
  group((c) => c.emailNorm, "email");
  group((c) => c.phoneNorm, "phone");
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

async function mergeClients(intoId: string, fromId: string): Promise<AdminClient> {
  guard();
  if (intoId === fromId) throw new Error("Choose two different records.");
  const { data, error } = await supabase.rpc("client_merge", { p_into: parseClientId(intoId), p_from: parseClientId(fromId) });
  if (error) fail("client_merge", error);
  return rowToAdminClient(data as unknown as Row);
}

/* ── site visits (0001 public.site_visits — plain RLS, crm.manage; no reminder RPC yet) ──
   client_id is NOT NULL in 0001 — the CRM identity is the master. Creation resolves
   it three ways: explicit client ref → existing lead link → create an identity client
   from the lead (first-class evidence; NOT an auto-merge — review still owns merges).
   A `site_visit_schedule` RPC enforcing reminder-task linkage is a future 0013
   candidate — deliberately not invented here. */
const SV_REF = (id: number) => `SV-${id}`;
const parseSvId = (s: string): number => {
  const m = String(s).match(/^SV-(\d+)$/);
  return m ? Number(m[1]) : Number(s);
};
const leadNumOf = (leadId: string): number => {
  const m = String(leadId).match(/(\d+)/);
  return m ? Number(m[1]) : NaN;
};
const rowToAdminSiteVisit = (r: Row): AdminSiteVisit => ({
  id: SV_REF(Number(r.id)),
  leadId: `lead-${Number(r.lead_id)}`,
  clientId: `CLI-${Number(r.client_id)}`,
  scheduledAt: String(r.scheduled_at),
  address: String(r.address ?? ""),
  owner: String(r.owner ?? "You"),
  status: String(r.status ?? "Scheduled") as SiteVisitStatus,
  ...(r.outcome ? { outcome: String(r.outcome) } : {}),
  ...(r.notes ? { notes: String(r.notes) } : {}),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

async function listSiteVisits(leadId?: string): Promise<AdminSiteVisit[]> {
  guard();
  let q = supabase.from("site_visits").select("*").order("scheduled_at", { ascending: true }).limit(500);
  if (leadId) {
    const num = leadNumOf(leadId);
    if (!Number.isFinite(num)) return [];
    q = q.eq("lead_id", num);
  }
  const { data, error } = await q;
  if (error) fail("listSiteVisits", error);
  return (data ?? []).map(rowToAdminSiteVisit);
}

async function createSiteVisit(input: NewSiteVisitInput): Promise<AdminSiteVisit> {
  guard();
  const leadNum = leadNumOf(String(input?.leadId ?? ""));
  if (!Number.isFinite(leadNum)) throw new Error("createSiteVisit: lead id carries no numeric id");
  if (!input.scheduledAt) throw new Error("Pick a date and time.");
  if (!input.address?.trim()) throw new Error("Address is required.");

  // resolve client: explicit ref → lead link → create identity client from the lead
  let clientNum: number | null = null;
  if (input.clientId) {
    const m = String(input.clientId).match(/(\d+)/);
    clientNum = m ? Number(m[1]) : null;
    if (!clientNum) throw new Error(`createSiteVisit: client id "${input.clientId}" carries no numeric id`);
  } else {
    const link = await supabase.from("client_links").select("client_id").eq("entity", "lead").eq("entity_id", leadNum).maybeSingle();
    if (link.error) fail("client_links read", link.error);
    if (link.data) {
      clientNum = Number((link.data as Row).client_id);
    } else {
      const { data: lead, error } = await supabase.from("leads").select("*").eq("id", leadNum).maybeSingle();
      if (error) fail("getLead", error);
      if (!lead) throw new Error(`Lead ${input.leadId} not found.`);
      const l = lead as Row;
      const insertRow: TablesInsert<"clients"> = {
        name: String(l.name ?? "Lead"),
        ...(l.company ? { company: String(l.company) } : {}),
        ...(l.email ? { email: String(l.email), email_norm: String(l.email).trim().toLowerCase() } : {}),
        ...(l.phone ? { phone: String(l.phone), phone_norm: String(l.phone).replace(/\D/g, "") } : {}),
        ...(l.city ? { city: String(l.city) } : {}),
        kind: l.company ? "business" : "retail",
        source: "lead",
      };
      const ins = await supabase.from("clients").insert(insertRow).select("*").single();
      if (ins.error) fail("createClientFromLead", ins.error);
      clientNum = Number((ins.data as Row).id);
      const linkIns = await supabase.from("client_links").insert({ client_id: clientNum, entity: "lead", entity_id: leadNum });
      if (linkIns.error) console.warn(`Supabase: identity client CLI-${clientNum} created but the lead link failed (${linkIns.error.message}) — visiting anyway`);
    }
  }

  // ref is NOT NULL in 0001 — placeholder on insert, stable SV-<id> ref afterwards (exchange pattern)
  const insertVisit: TablesInsert<"site_visits"> = {
    lead_id: leadNum,
    client_id: clientNum,
    scheduled_at: new Date(input.scheduledAt).toISOString(),
    address: input.address.trim(),
    owner: input.owner?.trim() || "You",
    status: "Scheduled",
    ref: `SV-TMP-${Date.now()}`,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };
  const { data, error } = await supabase.from("site_visits").insert(insertVisit).select("*").single();
  if (error) fail("createSiteVisit", error);
  const created = data as Row;
  const svNum = Number(created.id);
  const ref = SV_REF(svNum);
  const upd = await supabase.from("site_visits").update({ ref }).eq("id", svNum);
  if (upd.error) console.warn(`Supabase: site visit ${svNum} created but ref stamp failed (${upd.error.message})`);
  return rowToAdminSiteVisit({ ...created, ref });
}

async function updateSiteVisitStatus(id: string, patch: SiteVisitPatch): Promise<AdminSiteVisit | undefined> {
  guard();
  const num = parseSvId(id);
  if (!Number.isFinite(num)) throw new Error(`updateSiteVisitStatus: id "${id}" carries no numeric id`);
  const row: TablesUpdate<"site_visits"> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.outcome !== undefined) row.outcome = patch.outcome?.trim() ? patch.outcome.trim() : null;
  if (patch.notes !== undefined) row.notes = patch.notes?.trim() ? patch.notes.trim() : null;
  const { data, error } = await supabase.from("site_visits").update(row).eq("id", num).select("*").maybeSingle();
  if (error) fail("updateSiteVisit", error);
  if (!data) return undefined;
  return rowToAdminSiteVisit(data as Row);
}

/* ── tasks (0001 public.tasks; cap crm.manage; no delete path) ──────────────/* ── tasks (0001 public.tasks; cap crm.manage; no delete path) ──────────────
   NOTE: the table has no client-label column — the legacy screen's free-text
   "client" line rode client_id there. In supabase mode the context rides
   lead/quote/order refs. Demo mode keeps the human label. */
const TASK_REF = (id: number) => `TSK-${id}`;
const parseTaskId = (s: string): number => {
  const m = String(s).match(/^TSK-(\d+)$/);
  return m ? Number(m[1]) : Number(s);
};
const rowToAdminTask = (r: Row): AdminTask => ({
  id: TASK_REF(Number(r.id)),
  title: String(r.title ?? ""),
  ...(r.lead_id ? { leadId: String(r.lead_id) } : {}),
  ...(r.quote_id ? { quoteId: QUOTE_REF(Number(r.quote_id)) } : {}),
  ...(r.order_id ? { orderId: orderRef(Number(r.order_id)) } : {}),
  ...(r.due ? { due: String(r.due) } : {}),
  owner: String(r.owner ?? "You"),
  priority: String(r.priority ?? "normal"),
  done: Boolean(r.done),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

async function listTasks(params?: ListParams & { status?: "all" | "open" | "done" }): Promise<Paginated<AdminTask>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 20));
  const { data, error } = await supabase.from("tasks").select("*").order("due", { ascending: true, nullsFirst: false }).order("done", { ascending: true });
  if (error) fail("listTasks", error);
  let rows = (data ?? []) as Row[];
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.title, r.owner, r.priority, TASK_REF(Number(r.id))].some((v) => String(v ?? "").toLowerCase().includes(q)));
  let items = rows.map(rowToAdminTask);
  if (params?.status === "open") items = items.filter((t) => !t.done);
  else if (params?.status === "done") items = items.filter((t) => t.done);
  const total = items.length;
  return pagenate(items.slice((page - 1) * perPage, page * perPage), total, page, perPage);
}

async function createTask(input: NewTaskInput): Promise<AdminTask> {
  guard();
  const title = input.title?.trim();
  if (!title) throw new Error("Task title is required.");
  const row: TablesInsert<"tasks"> = {
    title,
    due: input.dueAt ?? null,
    priority: (input.priority?.trim() || "normal").toLowerCase(),
    owner: input.owner?.trim() || "You",
    done: false,
  };
  const { data, error } = await supabase.from("tasks").insert(row).select("*").single();
  if (error) fail("createTask", error);
  return rowToAdminTask(data as Row);
}

async function setTaskDone(id: string, done: boolean): Promise<AdminTask | undefined> {
  guard();
  const num = parseTaskId(id);
  const { data, error } = await supabase.from("tasks").update({ done: !!done, updated_at: new Date().toISOString() }).eq("id", num).select("*").maybeSingle();
  if (error) fail("setTaskDone", error);
  return data ? rowToAdminTask(data as Row) : undefined;
}

/* ── invoices (0001: invoices + payments; RPC-only creation) ───────────────
   quote→invoice rides quote_invoice_snapshot(p_quote_id) (cap quote.manage, idempotent).
   payments ride invoice_apply_payment (cap finance.manage; atomically re-derives
   paid + status Issued/Partially paid/Paid). There is NO direct INSERT policy on
   either table — rows are created via the RPCs only. */
const INVOICE_REF = (id: number) => `INV-${id}`;
const parseInvoiceId = (s: string): number => {
  const m = String(s).match(/^INV-(\d+)$/);
  return m ? Number(m[1]) : Number(s);
};
const INVOICE_DB_STATUSES = new Set(["Issued", "Partially paid", "Paid", "Cancelled"]);
const rowToAdminInvoice = (r: Row): AdminInvoice => {
  const total = toNum(r.total);
  const paid = toNum(r.paid);
  const due = r.due ? String(r.due) : undefined;
  const balance = Math.max(0, Math.round(total) - Math.round(paid));
  const dbStatus = INVOICE_DB_STATUSES.has(String(r.status)) ? String(r.status) : "Issued";
  const overdue = dbStatus !== "Paid" && dbStatus !== "Cancelled" && balance > 0 && !!due && Date.parse(due) < Date.now();
  return {
    id: INVOICE_REF(Number(r.id)),
    ref: r.ref ? String(r.ref) : INVOICE_REF(Number(r.id)),
    ...(r.quote_id ? { quoteId: QUOTE_REF(Number(r.quote_id)) } : {}),
    ...(r.order_id ? { orderId: orderRef(Number(r.order_id)) } : {}),
    customer: String(r.customer ?? ""),
    items: (Array.isArray(r.items) ? r.items : []) as AdminInvoice["items"],
    subtotal: toNum(r.subtotal),
    discount: toNum(r.discount),
    tax: toNum(r.tax),
    shipping: toNum(r.shipping),
    total,
    paid,
    balance,
    status: (overdue ? "Overdue" : dbStatus) as InvoiceStatus,
    ...(due ? { due } : {}),
    ...(r.notes ? { notes: String(r.notes) } : {}),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
};

async function listInvoices(params?: ListParams & { status?: InvoiceStatus | "all"; query?: string }): Promise<Paginated<AdminInvoice>> {
  guard();
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(100, params?.perPage ?? 20));
  const { data, error } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
  if (error) fail("listInvoices", error);
  let rows = (data ?? []) as Row[];
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.customer, r.ref, INVOICE_REF(Number(r.id)), r.notes].some((v) => String(v ?? "").toLowerCase().includes(q)));
  let items = rows.map(rowToAdminInvoice);
  if (params?.status && params.status !== "all") items = items.filter((inv) => inv.status === params.status);
  const total = items.length;
  return pagenate(items.slice((page - 1) * perPage, page * perPage), total, page, perPage);
}

async function getInvoice(id: string): Promise<AdminInvoice | undefined> {
  guard();
  const num = parseInvoiceId(id);
  const { data, error } = await supabase.from("invoices").select("*").eq("id", num).maybeSingle();
  if (error) fail("getInvoice", error);
  return data ? rowToAdminInvoice(data as Row) : undefined;
}

async function listInvoicePayments(invoiceId: string): Promise<AdminInvoicePayment[]> {
  guard();
  const num = parseInvoiceId(invoiceId);
  const { data, error } = await supabase.from("payments").select("*").eq("invoice_id", num).order("created_at", { ascending: false });
  if (error) {
    // payments_read is finance.manage-only — other roles get an honest empty ledger, not an exception.
    console.error("listInvoicePayments denied/failed:", error.message);
    return [];
  }
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    invoiceId: INVOICE_REF(num),
    amount: toNum(r.amount),
    method: String(r.method ?? "Bank transfer"),
    ...(r.reference ? { reference: String(r.reference) } : {}),
    ...(r.note ? { note: String(r.note) } : {}),
    createdAt: String(r.created_at),
  }));
}

async function convertQuoteToInvoice(quoteId: string): Promise<AdminInvoice> {
  guard();
  const num = parseQuoteId(quoteId);
  const { data, error } = await supabase.rpc("quote_invoice_snapshot", { p_quote_id: num });
  if (error) fail("convertQuoteToInvoice", error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("quote_invoice_snapshot returned nothing.");
  return rowToAdminInvoice(row as Row);
}

/* Order → invoice. The RPC builds the invoice to match the order total (the
   residual rides as tax) and returns the existing invoice if one is already
   active, so a double click cannot raise two bills. */
async function createInvoiceFromOrder(orderId: string): Promise<AdminInvoice> {
  guard();
  const num = parseOrderId(orderId);
  const { data, error } = await supabase.rpc("invoice_from_order", { p_order_id: num });
  if (error) fail("createInvoiceFromOrder", error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("invoice_from_order returned nothing.");
  return rowToAdminInvoice(row as Row);
}

async function recordInvoicePayment(invoiceId: string, input: NewInvoicePaymentInput): Promise<AdminInvoice | undefined> {
  guard();
  const num = parseInvoiceId(invoiceId);
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be a positive number.");
  const method = input.method?.trim() || "Bank transfer";
  const { data, error } = await supabase.rpc("invoice_apply_payment", {
    p_invoice_id: num,
    p_amount: amount,
    p_method: method,
    p_reference: input.reference?.trim() || null,
  });
  if (error) {
    if (String((error as { message?: string }).message ?? "").includes("not found")) return undefined;
    fail("recordInvoicePayment", error);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? rowToAdminInvoice(row as Row) : undefined;
}

async function deleteQuote(id: string): Promise<boolean> {
  guard();
  const num = parseQuoteId(id);
  const { error } = await supabase.from("quotes").delete().eq("id", num);
  if (error) fail("deleteQuote", error);
  return true;
}
async function convertQuote(id: string, paymentMethod?: string): Promise<AdminOrder | undefined> {
  guard();
  // admin-gated RPC (quote.manage): re-verifies stock per catalogue line under
  // FOR UPDATE, carries negotiated line prices + discount as the approved
  // commercial artifact, stamps the order, flips the quote atomically.
  const { data, error } = await supabase.rpc("quote_convert", {
    p_quote_ref: id,
    p_payment_method: paymentMethod ?? null,
  });
  if (error) {
    const msg = String(error.message ?? "");
    const code = (error as { code?: string }).code;
    if (/out of stock/i.test(msg)) throw new Error(`Supabase: quote conversion rejected — ${msg}`);
    if (code === "42501" || /not authorized/i.test(msg)) throw new Error("Supabase: you are not authorized to convert quotes.");
    fail("convertQuote", error);
  }
  const r = data as Record<string, unknown> | null;
  if (!r?.ok) {
    const reason = String(r?.reason ?? "unknown");
    // demo parity: missing quote or already-converted (idempotent re-click) -> undefined
    if (reason === "not-found" || reason === "already-converted" || reason === "bad-id") return undefined;
    if (reason === "not-accepted") throw new Error("Only accepted quotes can be converted to an order.");
    throw new Error(`Supabase: quote conversion failed — ${reason}`);
  }
  return {
    id: String(r.ref ?? r.id),
    customerName: String(r.customerName ?? ""),
    customerEmail: String(r.customerEmail ?? ""),
    customerPhone: String(r.customerPhone ?? ""),
    ...(r.address ? { address: String(r.address) } : {}),
    city: String(r.city ?? ""),
    items: ((r.items as AdminOrder["items"]) ?? []) as AdminOrder["items"],
    subtotal: toNum(r.subtotal),
    shipping: toNum(r.shipping),
    total: toNum(r.total),
    paymentMethod: String(r.paymentMethod ?? paymentMethod ?? "cod") as AdminOrder["paymentMethod"],
    status: "pending",
    placedAt: String(r.placedAt ?? new Date().toISOString()),
    ...(typeof r.channelId === "string" ? { channelId: r.channelId } : {}),
    discountPct: toNum(r.discountPct),
    discountAmount: toNum(r.discountAmount),
  } as unknown as AdminOrder;
}

/* ── customers (clients) ─────────────────────────────────────────────────── */
async function listCustomers(params?: ListParams & { type?: "retail" | "business" }): Promise<Paginated<AdminCustomer>> {
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
  const toCustomer = (r: Row, aggRow?: { n: number; total: number }): AdminCustomer => ({
    id: `cust-${r.id}`,
    name: String(r.name ?? ""),
    ...(r.company ? { company: String(r.company) } : {}),
    email: String(r.email ?? ""),
    phone: String(r.phone ?? ""),
    city: String(r.city ?? ""),
    type: (String(r.kind ?? "retail") === "business" ? "business" : "retail") as "retail" | "business",
    ordersCount: aggRow?.n ?? 0,
    totalSpent: aggRow?.total ?? 0,
    joinedAt: String(r.created_at ?? new Date().toISOString()),
  });
  const items = ((data ?? []) as Row[]).map((r) => toCustomer(r, sums.get(String(r.name).toLowerCase())));
  return pagenate(items, count ?? items.length, page, perPage);
}
async function getCustomer(id: string): Promise<AdminCustomer | undefined> {
  guard();
  const num = Number(String(id).replace(/^cust-/, ""));
  if (!Number.isFinite(num)) return undefined;
  const { data, error } = await supabase.from("clients").select("*").eq("id", num).maybeSingle();
  if (error) fail("getCustomer", error);
  if (!data) return undefined;
  const row = data as Row;
  const found = (await listCustomers({ query: String(row.name ?? ""), perPage: 1 })).items.find((c) => c.id === `cust-${num}`);
  if (found) return found;
  return toCustomerRef(row);
}
const toCustomerRef = (row: Row): AdminCustomer => ({
  id: `cust-${row.id}`,
  name: String(row.name ?? ""),
  email: String(row.email ?? ""),
  phone: String(row.phone ?? ""),
  city: String(row.city ?? ""),
  type: (String(row.kind ?? "retail") === "business" ? "business" : "retail") as "retail" | "business",
  ordersCount: 0,
  totalSpent: 0,
  joinedAt: String(row.created_at ?? new Date().toISOString()),
});

/* leads: capture must go through the lead-capture EF (anon cannot insert by
 * design); the admin lead pipeline reads/updates go through the clients/leads
 * capability policies. */
async function listLeads(params?: ListParams & { status?: AdminLead["status"] | "all"; type?: AdminLead["type"] | "all"; assignee?: string; unassigned?: boolean; staleDays?: number }): Promise<Paginated<AdminLead>> {
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
  if (params?.assignee) rows = rows.filter((r) => String(r.owner ?? "").trim() === params.assignee);
  if (params?.unassigned) rows = rows.filter((r) => !String(r.owner ?? "").trim());
  if (params?.staleDays && params.staleDays > 0) {
    // hosted has no last_contact column — age from created_at until the owner-gated migration ships
    const cutoff = Date.now() - params.staleDays * 86400000;
    rows = rows.filter((r) => new Date(String(r.created_at)).getTime() < cutoff);
  }
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
  ...(r.owner ? { assignedTo: String(r.owner) } : {}),
  ...(r.note ? { note: String(r.note) } : {}),
});
const LEAD_PATCH_HOSTED_GAPS = ["leadSource", "quotationRef", "lastContact", "meetingAt", "nextAction"] as const;
async function updateLead(id: string, patch: AdminLeadPatch): Promise<AdminLead | undefined> {
  guard();
  // V4 PR-D — the hosted leads table carries owner + note only; the rest need the owner-gated migration.
  const gaps = LEAD_PATCH_HOSTED_GAPS.filter((k) => patch[k] !== undefined);
  if (gaps.length) throw new Error(`Hosted leads table has no columns for ${gaps.join(", ")} — owner-gated migration. Edit those in the demo build.`);
  const num = Number(String(id).replace(/^lead-/, ""));
  if (!Number.isFinite(num)) return undefined;
  const row: TablesUpdate<"leads"> = { updated_at: new Date().toISOString() };
  if (patch.assignedTo !== undefined) row.owner = (patch.assignedTo ?? "").trim() || null;
  if (patch.note !== undefined) row.note = (patch.note ?? "").trim() || null;
  if (Object.keys(row).length === 1) {
    const { data, error } = await supabase.from("leads").select("*").eq("id", num).maybeSingle();
    if (error) fail("updateLead", error);
    return data ? rowToAdminLead(data as Row) : undefined;
  }
  const { data, error } = await supabase.from("leads").update(row).eq("id", num).select("*").maybeSingle();
  if (error) fail("updateLead", error);
  return data ? rowToAdminLead(data as Row) : undefined;
}

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


async function importLeads({ rows }: LeadImportInput): Promise<LeadImportResult> {
  return {
    created: 0,
    duplicates: [],
    rejected: rows.map((r) => ({ row: r.row, reason: "Hosted lead import is an owner-gated programme — import in the demo build instead", name: r.name, phone: r.phone })),
  };
}

/* ── Live chat (V4 P0) — demo-authoritative this release; hosted tables are owner-gated ── */
const CHAT_HOSTED_REASON = "live chat is demo-only in this release — hosted chat tables need the owner's explicit migration decision";

async function listChatConversations(): Promise<ChatConversation[]> {
  return [];
}

async function getChatConversation(): Promise<{ conversation: ChatConversation; messages: ChatMessage[] } | undefined> {
  return undefined;
}

async function postChatVisitorMessage(): Promise<{ conversation: ChatConversation; message: ChatMessage }> {
  throw new SupabaseUnsupportedError(CHAT_HOSTED_REASON);
}

async function postChatAgentMessage(): Promise<ChatMessage | undefined> {
  throw new SupabaseUnsupportedError(CHAT_HOSTED_REASON);
}

async function captureChatOffline(input: { name: string; phone: string; message: string; consent: boolean; consentVersion?: string; page?: string; cfTurnstileToken?: string }): Promise<{ conversation: ChatConversation; leadId: string }> {
  if (!input.consent) throw new Error("Consent is required before we store a callback request.");
  const lead = await createLead({
    type: "chat",
    name: input.name.trim(),
    phone: input.phone.trim(),
    summary: `Chat callback — ${input.message.trim()}`,
    consent: true,
    consentAt: new Date().toISOString(),
    consentVersion: input.consentVersion ?? "lead-privacy-v1",
    landingPath: input.page,
    utmSource: "storefront_chat",
    cfTurnstileToken: input.cfTurnstileToken,
  });
  const now = new Date().toISOString();
  return {
    conversation: { id: `CH-${lead.id}`, page: input.page, visitorName: input.name, visitorPhone: input.phone, visitorConsent: true, visitorConsentAt: now, status: "open", unread: 1, createdAt: now, lastMessageAt: now, leadId: lead.id },
    leadId: lead.id,
  };
}

async function setChatStatus(): Promise<ChatConversation | undefined> {
  return undefined; // hosted adapters have no chat tables this release
}

async function markChatRead(): Promise<ChatConversation | undefined> {
  return undefined;
}

async function countOpenChats(): Promise<number> {
  return 0;
}

async function getChatMode(): Promise<ChatMode> {
  return "offline";
}

async function setChatMode(): Promise<ChatMode> {
  return "offline";
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
      capture_version: 2,
      value: input.value,
      source: (input as { source?: string }).source ?? "admin",
      landing_path: input.landingPath,
      referrer: input.referrer,
      utm_source: input.utmSource,
      utm_medium: input.utmMedium,
      utm_campaign: input.utmCampaign,
      consent: input.consent === true,
      consent_version: input.consentVersion,
      cfTurnstileToken: input.cfTurnstileToken,
    }),
  });
  const body = (await resp.json().catch(() => ({}))) as { ok?: boolean; id?: number | string | null; capture_version?: number; error?: string };
  if (!resp.ok) {
    if (resp.status === 403) throw new Error("Supabase: the anti-bot check failed — please retry (and complete the challenge if shown).");
    throw new Error(`Supabase: lead capture failed (${resp.status}) — ${body.error ?? "the lead-capture function rejected the submission"}`);
  }
  const validLeadId = typeof body.id === "number"
    ? Number.isSafeInteger(body.id) && body.id > 0
    : typeof body.id === "string" && /^[1-9]\d{0,18}$/.test(body.id);
  // An older deployed function silently clips interest to 120 characters and
  // drops company. Without the v2 acknowledgement do not claim full capture:
  // the old function may already have inserted a partial lead.
  if (body.ok !== true || !validLeadId || body.capture_version !== 2) {
    throw new Error("Supabase: lead capture response could not be verified.");
  }
  return {
    id: `lead-${body.id}`,
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
  const { data, error } = await supabase.rpc("staff_store_settings");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Could not load store settings. Check your permissions and connection.");
  }
  const v = asObj(data as Json);
  return v as unknown as StoreSettings;
}
async function saveSettings(settings: StoreSettings): Promise<StoreSettings> {
  guard();
  const { data, error } = await supabase.rpc("owner_save_store_settings", { p_settings: settings as unknown as Json });
  if (error) fail("saveSettings", error);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Could not verify saved store settings.");
  return data as unknown as StoreSettings;
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

// Presentation check only. RLS independently enforces access on every row.
// Explicitly report denial/errors instead of treating an RLS-empty result as
// proof that there are no procurement records.
async function requireProcurementRead(): Promise<void> {
  const { data, error } = await supabase.rpc("procurement_read_allowed");
  if (error || typeof data !== "boolean") throw new Error("Could not verify procurement access. Check your connection or contact an administrator.");
  if (!data) throw new Error("You do not have permission to view procurement or stock movement records.");
}

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
  await requireProcurementRead();
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
/* The receipt ledger (00032) is the source of truth for what actually arrived.
   Lines also carry a legacy `receivedQuantity`, so take the larger of the two
   rather than double-counting after the migration is applied. */
type ReceiptLedgerLine = { line?: number; qty?: number };
async function receiptTotals(poIds: string[]): Promise<Map<string, number[]>> {
  const totals = new Map<string, number[]>();
  const ids = [...new Set(poIds.filter(Boolean))];
  if (!ids.length) return totals;
  const { data, error } = await supabase.from("purchase_order_receipts").select("po_id, lines").in("po_id", ids);
  if (error) return totals;            // ledger not deployed yet: stored values stand
  for (const row of (data ?? []) as Array<{ po_id: string; lines: unknown }>) {
    const sums = totals.get(String(row.po_id)) ?? [];
    for (const line of (Array.isArray(row.lines) ? row.lines : []) as ReceiptLedgerLine[]) {
      const idx = Number(line?.line);
      const qty = toNum(line?.qty);
      if (!Number.isFinite(idx) || idx < 0 || qty <= 0) continue;
      sums[idx] = (sums[idx] ?? 0) + qty;
    }
    totals.set(String(row.po_id), sums);
  }
  return totals;
}
function applyReceiptTotals(po: AdminPurchaseOrder, sums: number[] | undefined): AdminPurchaseOrder {
  if (!sums || !sums.length) return po;
  return {
    ...po,
    lines: po.lines.map((l, i) => ({ ...l, receivedQuantity: Math.max(toNum(l.receivedQuantity), sums[i] ?? 0) })),
  };
}
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
  await requireProcurementRead();
  const page = Math.max(1, params?.page ?? 1), perPage = params?.perPage ?? 50;
  const { data, error } = await supabase.from("purchase_orders")
    .select("*, supplier:suppliers(name)").order("created_at", { ascending: false });
  if (error) fail("listPurchaseOrders", error);
  let rows: Row[] = ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, supplier_name: (r as Row).supplier?.name }));
  const q = params?.query?.trim().toLowerCase();
  if (q) rows = rows.filter((r) => String(r.id).toLowerCase().includes(q) || String(r.supplier?.name ?? "").toLowerCase().includes(q));
  if (params?.status && params.status !== "all") rows = rows.filter((r) => String(r.status) === PO_STATUS_DB[params.status!]);
  const total = rows.length;
  const pageRows = rows.slice((page - 1) * perPage, page * perPage);
  const sums = await receiptTotals(pageRows.map((r) => String(r.id)));
  return pagenate(pageRows.map((r) => applyReceiptTotals(rowToPO(r), sums.get(String(r.id)))), total, page, perPage);
}
async function getPurchaseOrder(id: string): Promise<AdminPurchaseOrder | undefined> {
  guard();
  await requireProcurementRead();
  const { data, error } = await supabase.from("purchase_orders").select("*, supplier:suppliers(name)").eq("id", id).maybeSingle();
  if (error) fail("getPurchaseOrder", error);
  if (!data) return undefined;
  const po = rowToPO({ ...(data as unknown as Row), supplier_name: (data as unknown as Row).supplier?.name });
  return applyReceiptTotals(po, (await receiptTotals([po.id])).get(po.id));
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
  // Cancelling carries a reason and refuses an order that has already taken
  // goods; every other transition is a plain status write.
  if (status === "cancelled") {
    const { error } = await supabase.rpc("purchase_order_cancel", {
      p_po_id: id,
      p_reason: "Cancelled from the purchase orders screen",
    });
    if (error) fail("setPurchaseOrderStatus", error);
    return getPurchaseOrder(id);
  }
  const { error } = await supabase.from("purchase_orders").update({ status: PO_STATUS_DB[status] }).eq("id", id);
  if (error) fail("setPurchaseOrderStatus", error);
  return getPurchaseOrder(id);
}
/* Receiving is one RPC (00032): it locks the purchase order, refuses
   over-receipt, writes the receipt ledger, raises `grn` stock movements and
   sets Partial/Received. The old client-side loop read-modify-wrote `items`
   and asked for the reason `po_receipt`, which the stock_movements CHECK
   constraint rejects — so on Supabase this path used to fail on the first
   product line. */
async function receivePurchaseOrder(id: string, receipts: PurchaseOrderReceipt[]): Promise<AdminPurchaseOrder | undefined> {
  guard();
  const po = await getPurchaseOrder(id);
  if (!po) return undefined;
  const wanted = (receipts ?? []).flatMap((r) => {
    const index = po.lines.findIndex((l) => l.id === r.lineId);
    const qty = Math.max(0, Math.round(toNum(r.quantity)));
    return index >= 0 && qty > 0 ? [{ line: index, qty }] : [];
  });
  const { error } = await supabase.rpc("purchase_order_receive", {
    p_po_id: po.id,
    p_lines: wanted.length ? (wanted as unknown as Json) : null,
    p_note: null,
  });
  if (error) fail("receivePurchaseOrder", error);
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
  orderId: r.order_id ? String(r.order_id) : undefined,
  revision: toNum(r.revision, 0),
  status: String(r.status ?? "published"),
  createdAt: String(asObj(r.payload).createdAt ?? r.created_at ?? ""),
  updatedAt: String(asObj(r.payload).updatedAt ?? r.updated_at ?? r.created_at ?? ""),
} as unknown as AdminProject);
async function listProjects(): Promise<AdminProject[]> { return readRows("projects", rowToProject); }

/** Public portfolio projection: never fetch the private practice payload. */
export async function listPublishedProjects(): Promise<AdminProject[]> {
  guard();
  const { data, error } = await supabase.rpc("published_projects");
  if (error) fail("published_projects", error);
  return (data ?? []).map((row) => rowToProject(row as Row));
}
async function createProject(input: NewProjectInput): Promise<AdminProject> {
  guard();
  const id = `project-${Date.now()}`;
  const now = new Date().toISOString();
  // `orderId` is a column (00024), never payload: the workspace repair path would
  // drop unknown payload fields. Link through the RPC afterwards so the audit row
  // and the one-job-per-order rule both apply.
  const { orderId, ...rest } = input;
  const { data, error } = await supabase.from("projects").insert({
    id, status: rest.active === false ? "draft" : "published",
    payload: { ...(rest as unknown as Record<string, unknown>), createdAt: now, updatedAt: now } as unknown as Json,
  }).select("*").single();
  if (error) fail("createProject", error);
  if (orderId) await linkProjectOrder(id, orderId);
  return rowToProject(data as Row);
}
/** Portfolio fields. The server merges the patch, validates the status and checks
 *  the revision this tab read (00034), so a stale copy can't overwrite a colleague. */
async function updateProject(id: string, patch: Partial<NewProjectInput>, expectedRevision?: number): Promise<AdminProject | undefined> {
  guard();
  const { error } = await supabase.rpc("project_update", {
    p_id: id,
    p_patch: patch as unknown as Json,
    ...(expectedRevision == null ? {} : { p_expected_revision: expectedRevision }),
  });
  if (error) {
    if (String(error.code ?? "") === "P0002") return undefined;
    if (String(error.code ?? "") === "40001") {
      throw new Error(
        `This project changed elsewhere while you were editing (${error.message ?? "revision conflict"}). Reload before saving again — your changes are still on screen.`,
      );
    }
    if (["22023", "42501"].includes(String(error.code ?? ""))) throw new Error(error.message ?? "Could not save the project.");
    fail("updateProject", error);
  }
  return fetchProject(id);
}
async function fetchProject(id: string): Promise<AdminProject | undefined> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) fail("getProject", error);
  return data ? rowToProject(data as Row) : undefined;
}
/**
 * Practice save with optimistic concurrency (migration 00022 candidate). The
 * server, not this client, derives the QC block from recorded inspections and
 * rejects a stale revision instead of overwriting a colleague's work.
 */
async function saveProjectPractice(id: string, practice: ProjectPractice, expectedRevision?: number): Promise<AdminProject | undefined> {
  guard();
  const { error } = await supabase.rpc("project_practice_save", {
    p_project_id: id,
    p_practice: practice as unknown as Json,
    p_expected_revision: expectedRevision ?? null,
  });
  if (error) {
    if (String(error.code ?? "") === "40001" || /changed elsewhere/i.test(error.message ?? "")) {
      throw new Error(
        `This job changed elsewhere while you were editing (${error.message ?? "revision conflict"}). Reload the workspace before saving again — your current edits are still on screen.`,
      );
    }
    fail("saveProjectPractice", error);
  }
  return fetchProject(id);
}
/** Order → job link (candidate 00024). The server checks capability, existence and
 *  the one-job-per-order rule; this wrapper only maps the RPC result. */
async function linkProjectOrder(projectId: string, orderId: string): Promise<{ projectId: string; orderId: string; alreadyLinked: boolean }> {
  guard();
  const { data, error } = await supabase.rpc("project_link_order", { p_project_id: projectId, p_order_id: orderId });
  if (error) {
    if (String(error.code ?? "") === "23514" || String(error.code ?? "") === "P0002" || String(error.code ?? "") === "22023") {
      throw new Error(error.message ?? "Could not link the order to this job.");
    }
    fail("linkProjectOrder", error);
  }
  const row = ((data ?? []) as Row[])[0] ?? {};
  return { projectId: String(row.project_id ?? projectId), orderId: String(row.order_id ?? orderId), alreadyLinked: Boolean(row.already_linked) };
}
async function unlinkProjectOrder(projectId: string, reason?: string): Promise<{ projectId: string; previousOrderId: string }> {
  guard();
  const { data, error } = await supabase.rpc("project_unlink_order", { p_project_id: projectId, p_reason: reason ?? "" });
  if (error) {
    if (String(error.code ?? "") === "23514" || String(error.code ?? "") === "P0002" || String(error.code ?? "") === "22001") {
      throw new Error(error.message ?? "Could not remove the order link.");
    }
    fail("unlinkProjectOrder", error);
  }
  const row = ((data ?? []) as Row[])[0] ?? {};
  return { projectId: String(row.project_id ?? projectId), previousOrderId: String(row.previous_order_id ?? "") };
}
async function getOrderProduction(orderId: string): Promise<OrderProduction | undefined> {
  guard();
  const { data, error } = await supabase.rpc("order_project", { p_order_id: orderId });
  if (error) {
    // A missing projection function or an unauthorised read is not a page-breaking
    // error: the orders screen simply shows "no production job".
    if (String(error.code ?? "") === "42501" || String(error.code ?? "") === "42883" || /does not exist|schema cache/i.test(error.message ?? "")) return undefined;
    fail("getOrderProduction", error);
  }
  const row = ((data ?? []) as Row[])[0];
  if (!row) return undefined;
  return {
    projectId: String(row.project_id ?? ""),
    orderId: String(row.order_id ?? orderId),
    title: String(row.title ?? ""),
    progress: Number(row.progress ?? 0),
    qcResult: (row.qc_result ?? null) as OrderProduction["qcResult"],
    dispatchVehicle: (row.dispatch_vehicle ?? null) as string | null,
    dispatchDate: (row.dispatch_date ?? null) as string | null,
    updatedAt: String(row.updated_at ?? ""),
  };
}
/** Post-dispatch records + derived warranty state (candidate 00025). One RPC keeps
 *  the state server-derived instead of recomputing rules in the UI. */
async function getProjectPostDispatch(projectId: string): Promise<ProjectPostDispatch> {
  guard();
  const { data, error } = await supabase.rpc("project_post_dispatch", { p_project_id: projectId });
  if (error) {
    if (String(error.code ?? "") === "42883" || /does not exist|schema cache/i.test(error.message ?? "")) {
      return { projectId, warrantyState: "none" };
    }
    fail("getProjectPostDispatch", error);
  }
  const r = ((data ?? []) as Row[])[0];
  if (!r) return { projectId, warrantyState: "none" };
  const iso = (v: unknown) => (v == null ? "" : String(v));
  const delivery = r.delivery_id ? {
    id: String(r.delivery_id), projectId, kind: "delivery" as const,
    happenedOn: iso(r.delivery_on), lead: iso(r.delivery_lead), notes: iso(r.delivery_notes),
    signedBy: iso(r.delivery_signed_by), createdAt: iso(r.delivery_created_at),
  } : undefined;
  const installation = r.installation_id ? {
    id: String(r.installation_id), projectId, kind: "installation" as const,
    happenedOn: iso(r.installation_on), lead: iso(r.installation_lead), notes: iso(r.installation_notes),
    signedBy: iso(r.installation_signed_by), createdAt: iso(r.installation_created_at),
  } : undefined;
  const warranty = r.warranty_id ? {
    id: String(r.warranty_id), projectId, months: Number(r.warranty_months ?? 0),
    coverage: iso(r.warranty_coverage), exclusions: iso(r.warranty_exclusions),
    startsOn: iso(r.warranty_starts_on), endsOn: iso(r.warranty_ends_on),
    slaDays: r.warranty_sla_days == null ? undefined : Number(r.warranty_sla_days),
    cancelledAt: r.warranty_cancelled_at ? iso(r.warranty_cancelled_at) : undefined,
    cancelReason: iso(r.warranty_cancel_reason) || undefined,
    createdAt: iso(r.warranty_created_at),
  } : undefined;
  return { projectId, delivery, installation, warranty, warrantyState: (r.warranty_state ?? "none") as ProjectPostDispatch["warrantyState"] };
}
async function recordProjectHandover(input: { projectId: string; kind: ProjectHandoverKind; happenedOn: string; lead?: string; notes?: string; signedBy?: string }): Promise<ProjectHandover> {
  guard();
  const { data, error } = await supabase.rpc("project_handover_record", {
    p_project_id: input.projectId,
    p_kind: input.kind,
    p_happened_on: input.happenedOn,
    p_lead: input.lead ?? "",
    p_notes: input.notes ?? "",
    p_signed_by: input.signedBy ?? "",
  });
  if (error) {
    if (["23514", "23505", "22023", "22001", "P0002"].includes(String(error.code ?? ""))) throw new Error(error.message ?? "Could not record the handover.");
    fail("recordProjectHandover", error);
  }
  const r = (data ?? {}) as Row;
  return {
    id: String(r.id ?? ""), projectId: input.projectId, kind: input.kind,
    happenedOn: String(r.happened_on ?? input.happenedOn), lead: String(r.lead ?? ""),
    notes: String(r.notes ?? ""), signedBy: String(r.signed_by ?? ""), createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}
async function openProjectWarranty(input: { projectId: string; months: number; coverage?: string; exclusions?: string; slaDays?: number }): Promise<ProjectWarranty> {
  guard();
  const { data, error } = await supabase.rpc("project_warranty_open", {
    p_project_id: input.projectId, p_months: input.months,
    p_coverage: input.coverage ?? "", p_exclusions: input.exclusions ?? "",
    // The claim promise is set once, when the warranty is opened (default 7 days).
    ...(input.slaDays == null ? {} : { p_sla_days: input.slaDays }),
  });
  if (error) {
    if (["23514", "23505", "22023", "22001", "P0002"].includes(String(error.code ?? ""))) throw new Error(error.message ?? "Could not open the warranty.");
    fail("openProjectWarranty", error);
  }
  return warrantyFromRow(data as Row, input.projectId);
}
async function cancelProjectWarranty(input: { projectId: string; reason?: string }): Promise<ProjectWarranty> {
  guard();
  const { data, error } = await supabase.rpc("project_warranty_cancel", { p_project_id: input.projectId, p_reason: input.reason ?? "" });
  if (error) {
    if (["23514", "22001", "P0002"].includes(String(error.code ?? ""))) throw new Error(error.message ?? "Could not cancel the warranty.");
    fail("cancelProjectWarranty", error);
  }
  return warrantyFromRow(data as Row, input.projectId);
}
function warrantyFromRow(r: Row, projectId: string): ProjectWarranty {
  return {
    id: String(r.id ?? ""), projectId, months: Number(r.months ?? 0),
    coverage: String(r.coverage ?? ""), exclusions: String(r.exclusions ?? ""),
    startsOn: String(r.starts_on ?? ""), endsOn: String(r.ends_on ?? ""),
    slaDays: r.sla_days == null ? undefined : Number(r.sla_days),
    cancelledAt: r.cancelled_at ? String(r.cancelled_at) : undefined,
    cancelReason: r.cancel_reason ? String(r.cancel_reason) : undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  };
}
/** Warranty claims (candidate 00026). Listing reads the table under RLS; every
 *  write goes through the RPCs so transitions and warranty liveness are enforced. */
/** Warranty register (candidate 00027): one read-only projection, no client maths. */
async function listWarrantyRegister(daysAhead = 60): Promise<WarrantyRegisterRow[]> {
  guard();
  const { data, error } = await supabase.rpc("project_warranty_register", { p_days_ahead: daysAhead });
  if (error) {
    if (String(error.code ?? "") === "42883" || /does not exist|schema cache/i.test(error.message ?? "")) return [];
    if (String(error.code ?? "") === "22023") throw new Error(error.message ?? "Invalid reminder window.");
    fail("listWarrantyRegister", error);
  }
  const iso = (v: unknown) => (v == null ? undefined : String(v));
  return ((data ?? []) as Row[]).map((r) => ({
    projectId: String(r.project_id ?? ""),
    title: String(r.title ?? ""),
    orderId: iso(r.order_id),
    warrantyId: iso(r.warranty_id),
    warrantyState: (r.warranty_state ?? "none") as WarrantyRegisterRow["warrantyState"],
    startsOn: iso(r.warranty_starts_on),
    endsOn: iso(r.warranty_ends_on),
    daysLeft: r.days_left == null ? undefined : Number(r.days_left),
    expiringSoon: Boolean(r.expiring_soon),
    openClaims: Number(r.open_claims ?? 0),
    totalClaims: Number(r.total_claims ?? 0),
    slaBreached: Number(r.sla_breached ?? 0),
    nextClaimDue: iso(r.next_claim_due),
    assignedTo: iso(r.assigned_to),
    deliveryOn: iso(r.delivery_on),
    installationOn: iso(r.installation_on),
    dispatchVehicle: iso(r.dispatch_vehicle),
    updatedAt: String(r.updated_at ?? ""),
  }));
}
async function listProjectWarrantyClaims(projectId: string): Promise<ProjectWarrantyClaim[]> {
  guard();
  const { data, error } = await supabase
    .from("project_warranty_claims")
    .select("id,project_id,warranty_id,summary,details,status,opened_on,due_on,cost,resolution_kind,assigned_to,resolution,closed_at,opened_by,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    if (String(error.code ?? "") === "42P01" || String(error.code ?? "") === "42883") return [];
    fail("listProjectWarrantyClaims", error);
  }
  return ((data ?? []) as Row[]).map(claimFromRow);
}
function claimFromRow(r: Row): ProjectWarrantyClaim {
  return {
    id: String(r.id ?? ""),
    projectId: String(r.project_id ?? ""),
    warrantyId: String(r.warranty_id ?? ""),
    summary: String(r.summary ?? ""),
    details: String(r.details ?? ""),
    status: String(r.status ?? "open") as ProjectWarrantyClaim["status"],
    openedOn: String(r.opened_on ?? ""),
    dueOn: r.due_on == null ? undefined : String(r.due_on),
    cost: Number(r.cost ?? 0),
    resolutionKind: (r.resolution_kind ?? undefined) as ProjectWarrantyClaim["resolutionKind"],
    assignedTo: r.assigned_to ? String(r.assigned_to) : undefined,
    resolution: String(r.resolution ?? ""),
    closedAt: r.closed_at ? String(r.closed_at) : undefined,
    openedBy: r.opened_by ? String(r.opened_by) : undefined,
    createdAt: String(r.created_at ?? ""),
  };
}
async function openProjectWarrantyClaim(input: { projectId: string; summary: string; details?: string; openedOn?: string }): Promise<ProjectWarrantyClaim> {
  guard();
  const { data, error } = await supabase.rpc("project_warranty_claim_open", {
    p_project_id: input.projectId,
    p_summary: input.summary,
    p_details: input.details ?? "",
    p_opened_on: input.openedOn ?? new Date().toISOString().slice(0, 10),
  });
  if (error) {
    if (["23514", "22023", "22001", "P0002"].includes(String(error.code ?? ""))) throw new Error(error.message ?? "Could not open the claim.");
    fail("openProjectWarrantyClaim", error);
  }
  return claimFromRow(data as Row);
}
async function updateProjectWarrantyClaim(input: {
  claimId: string;
  status: "scheduled" | "resolved" | "rejected";
  resolution?: string;
  cost?: number;
  resolutionKind?: ProjectWarrantyResolutionKind;
  replacement?: { productId: string; qty: number };
}): Promise<ProjectWarrantyClaim> {
  guard();
  const { data, error } = await supabase.rpc("project_warranty_claim_update", {
    p_claim_id: input.claimId,
    p_status: input.status,
    p_resolution: input.resolution ?? "",
    ...(input.cost == null ? {} : { p_cost: input.cost }),
    ...(input.resolutionKind == null ? {} : { p_resolution_kind: input.resolutionKind }),
    ...(input.replacement == null ? {} : { p_replacement: input.replacement }),
  });
  if (error) {
    if (["23514", "22023", "22001", "P0002"].includes(String(error.code ?? ""))) throw new Error(error.message ?? "Could not update the claim.");
    fail("updateProjectWarrantyClaim", error);
  }
  return claimFromRow(data as Row);
}
/** Give a claim a real owner. The seat must exist in user_roles (00033). */
async function assignProjectWarrantyClaim(input: { claimId: string; userId: string }): Promise<ProjectWarrantyClaim> {
  guard();
  const { data, error } = await supabase.rpc("project_warranty_claim_assign", {
    p_claim_id: input.claimId,
    p_user: input.userId,
  });
  if (error) {
    if (["23514", "22023", "P0002"].includes(String(error.code ?? ""))) throw new Error(error.message ?? "Could not assign the claim.");
    fail("assignProjectWarrantyClaim", error);
  }
  return claimFromRow(data as Row);
}
/** Seats that can own a claim (emails live in auth.users, so this is an RPC). */
async function listStaffSeats(role?: string): Promise<StaffSeat[]> {
  guard();
  const { data, error } = await supabase.rpc("staff_seats", role ? { p_role: role } : {});
  if (error) {
    if (String(error.code ?? "") === "42883" || /does not exist|schema cache/i.test(error.message ?? "")) return [];
    if (String(error.code ?? "") === "22023") throw new Error(error.message ?? "Unknown role.");
    fail("listStaffSeats", error);
  }
  return ((data ?? []) as Row[]).map((r) => ({
    userId: String(r.user_id ?? ""),
    email: String(r.email ?? ""),
    role: String(r.role ?? ""),
    name: String(r.name ?? ""),
  }));
}
async function listProjectQcInspections(projectId: string): Promise<ProjectQcInspection[]> {
  guard();
  const { data, error } = await supabase
    .from("project_qc_inspections")
    .select("id,project_id,result,notes,inspected_by_email,revision,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) fail("listProjectQcInspections", error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    result: String(r.result) === "passed" ? "passed" : "failed",
    notes: String(r.notes ?? ""),
    inspectedByEmail: String(r.inspected_by_email ?? ""),
    revision: toNum(r.revision, 0),
    createdAt: String(r.created_at ?? ""),
  }));
}
async function recordProjectQcInspection(input: { projectId: string; result: "passed" | "failed"; notes?: string }): Promise<{ inspection: ProjectQcInspection; project: AdminProject | undefined }> {
  guard();
  const { data, error } = await supabase.rpc("project_qc_record", {
    p_project_id: input.projectId,
    p_result: input.result,
    p_notes: input.notes ?? "",
  });
  if (error) {
    if (String(error.code ?? "") === "42501") throw new Error("You do not have permission to record a QC inspection.");
    throw new Error(`Could not record the QC inspection — ${error.message ?? "unknown PostgREST error"}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
  if (!row) throw new Error("The inspection was not returned by the database — reload before retrying.");
  const inspection: ProjectQcInspection = {
    id: String(row.id),
    projectId: String(row.project_id ?? input.projectId),
    result: String(row.result) === "passed" ? "passed" : "failed",
    notes: String(row.notes ?? ""),
    inspectedByEmail: String(row.inspected_by_email ?? ""),
    revision: toNum(row.revision, 0),
    createdAt: String(row.created_at ?? ""),
  };
  return { inspection, project: await fetchProject(input.projectId) };
}
async function listProjectProductionEvents(projectId: string): Promise<ProjectProductionEvent[]> {
  guard();
  const { data, error } = await supabase
    .from("project_production_events")
    .select("id,project_id,action,revision,qc_result,dispatch_vehicle,created_at")
    .eq("project_id", projectId)
    .order("id", { ascending: false })
    .limit(50);
  if (error) fail("listProjectProductionEvents", error);
  return ((data ?? []) as Row[]).map((r) => ({
    id: toNum(r.id, 0),
    projectId: String(r.project_id),
    action: String(r.action ?? ""),
    revision: toNum(r.revision, 0),
    qcResult: r.qc_result == null ? null : String(r.qc_result),
    dispatchVehicle: r.dispatch_vehicle == null ? null : String(r.dispatch_vehicle),
    createdAt: String(r.created_at ?? ""),
  }));
}
async function setProjectActive(id: string, active: boolean, expectedRevision?: number): Promise<AdminProject | undefined> {
  return updateProject(id, { status: active ? "published" : "archived" } as unknown as Partial<NewProjectInput>, expectedRevision);
}
/** Deleting also carries the revision token (00034): a stale tab cannot delete a
 *  job someone just worked on. */
async function deleteProject(id: string, expectedRevision?: number): Promise<boolean> {
  guard();
  const { data, error } = await supabase.rpc("project_delete", {
    p_id: id,
    ...(expectedRevision == null ? {} : { p_expected_revision: expectedRevision }),
  });
  if (error) {
    if (String(error.code ?? "") === "P0002") return false;
    if (String(error.code ?? "") === "40001") {
      throw new Error(
        `This project changed elsewhere (${error.message ?? "revision conflict"}). Reload the list before deleting.`,
      );
    }
    fail("deleteProject", error);
  }
  return Boolean(data);
}

/* ── project actuals ledger (0013: project_cost_codes + project_actuals) ──
   Cap model: crm.manage write, crm.manage|finance.manage read — enforced by RLS
   against the caller's JWT; no service-role bypass here. amount is GENERATED
   server-side (qty * rate). PO→BOQ allocation is manual in this slice. */
const rowToCostCode = (r: Row): ProjectCostCode => ({
  id: Number(r.id),
  projectId: String(r.project_id),
  code: String(r.code),
  boqSection: r.boq_section == null ? null : String(r.boq_section),
  description: String(r.description ?? ""),
  createdAt: String(r.created_at ?? ""),
});
async function listProjectCostCodes(projectId: string): Promise<ProjectCostCode[]> {
  guard();
  const { data, error } = await supabase.from("project_cost_codes").select("*").eq("project_id", projectId).order("code", { ascending: true });
  if (error) fail("listProjectCostCodes", error);
  return ((data ?? []) as Row[]).map(rowToCostCode);
}
async function upsertProjectCostCode(input: { projectId: string; code: string; boqSection?: string | null; description?: string }): Promise<ProjectCostCode> {
  guard();
  const code = String(input.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) throw new Error(`Cost code "${input.code}" is invalid — use A–Z, 0–9, - and _ (max 32 chars).`);
  const row = {
    project_id: input.projectId,
    code,
    boq_section: input.boqSection?.trim() ? input.boqSection.trim() : null,
    description: String(input.description ?? "").trim().slice(0, 200),
  };
  const { data, error } = await supabase.from("project_cost_codes").upsert(row, { onConflict: "project_id,code" }).select("*").single();
  if (error) fail("upsertProjectCostCode", error);
  return rowToCostCode(data as Row);
}
async function deleteProjectCostCode(projectId: string, code: string): Promise<boolean> {
  guard();
  const { error, count } = await supabase.from("project_cost_codes").delete({ count: "exact" }).eq("project_id", projectId).eq("code", code);
  if (error) {
    // FK RESTRICT surfaces here (23503) — carry the raw message so the UI can show it
    throw new Error(`Cost code ${code} could not be removed — ${error.message}`);
  }
  return (count ?? 0) > 0;
}
const rowToActual = (r: Row): ProjectActualLine => ({
  id: Number(r.id),
  projectId: String(r.project_id),
  costCode: String(r.cost_code),
  description: String(r.description ?? ""),
  qty: toNum(r.qty),
  unit: String(r.unit ?? "lot"),
  rate: toNum(r.rate),
  amount: toNum(r.amount),
  source: (["po", "labor", "subcontract", "manual"] as ProjectActualSource[]).includes(r.source as ProjectActualSource) ? (r.source as ProjectActualSource) : "manual",
  poRef: r.po_ref == null ? null : String(r.po_ref),
  incurredOn: String(r.incurred_on ?? "").slice(0, 10),
  note: String(r.note ?? ""),
  createdAt: String(r.created_at ?? ""),
});
async function listProjectActuals(projectId: string): Promise<ProjectActualLine[]> {
  guard();
  const { data, error } = await supabase.from("project_actuals").select("*").eq("project_id", projectId).order("incurred_on", { ascending: true }).order("id", { ascending: true });
  if (error) fail("listProjectActuals", error);
  return ((data ?? []) as Row[]).map(rowToActual);
}
async function addProjectActual(input: { projectId: string; costCode: string; description: string; qty: number; unit: string; rate: number; source: ProjectActualSource; poRef?: string | null; incurredOn?: string; note?: string }): Promise<ProjectActualLine> {
  guard();
  const qty = Math.max(0, Number(input.qty) || 0);
  const rate = Math.max(0, Number(input.rate) || 0);
  const row: TablesInsert<"project_actuals"> = {
    project_id: input.projectId,
    cost_code: String(input.costCode),
    description: String(input.description ?? "").trim().slice(0, 300) || "Untitled actual",
    qty,
    unit: String(input.unit ?? "lot").trim().slice(0, 12) || "lot",
    rate,
    source: (["po", "labor", "subcontract", "manual"] as ProjectActualSource[]).includes(input.source) ? input.source : "manual",
    po_ref: input.poRef?.trim() ? input.poRef.trim().slice(0, 40) : null,
    note: String(input.note ?? "").trim().slice(0, 300),
  };
  if (input.incurredOn && /^\d{4}-\d{2}-\d{2}$/.test(input.incurredOn)) row.incurred_on = input.incurredOn;
  const { data, error } = await supabase.from("project_actuals").insert(row).select("*").single();
  if (error) fail("addProjectActual", error);
  return rowToActual(data as Row);
}
async function updateProjectActual(id: number, projectId: string, patch: Partial<Pick<ProjectActualLine, "costCode" | "description" | "qty" | "unit" | "rate" | "source" | "poRef" | "incurredOn" | "note">>): Promise<ProjectActualLine | undefined> {
  guard();
  const row: TablesUpdate<"project_actuals"> = {};
  if (patch.costCode !== undefined) row.cost_code = String(patch.costCode);
  if (patch.description !== undefined) row.description = String(patch.description).trim().slice(0, 300);
  if (patch.qty !== undefined) row.qty = Math.max(0, Number(patch.qty) || 0);
  if (patch.unit !== undefined) row.unit = String(patch.unit).trim().slice(0, 12);
  if (patch.rate !== undefined) row.rate = Math.max(0, Number(patch.rate) || 0);
  if (patch.source !== undefined && (["po", "labor", "subcontract", "manual"] as ProjectActualSource[]).includes(patch.source)) row.source = patch.source;
  if (patch.poRef !== undefined) row.po_ref = patch.poRef?.trim() ? patch.poRef.trim().slice(0, 40) : null;
  if (patch.incurredOn !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(patch.incurredOn)) row.incurred_on = patch.incurredOn;
  if (patch.note !== undefined) row.note = String(patch.note).trim().slice(0, 300);
  const { data, error } = await supabase.from("project_actuals").update(row).eq("id", id).eq("project_id", projectId).select("*").maybeSingle();
  if (error) fail("updateProjectActual", error);
  return data ? rowToActual(data as Row) : undefined;
}
async function deleteProjectActual(id: number, projectId: string): Promise<boolean> {
  guard();
  const { error } = await supabase.from("project_actuals").delete().eq("id", id).eq("project_id", projectId);
  return !error;
}

/* Storage — real job files (0014: private `projects` bucket, 50 MB cap, crm.manage).
   Object name: <projectId>/<timestamp>-<sanitized>. Demo/Bagisto reject; the payload login carries the metadata entry after upload. */
const sanitizeFileName = (name: string): string => {
  const base = String(name).replace(/^.*[\\/]/, "").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return base || "file";
};
const kindFromFileName = (name: string): ProjectFileItem["kind"] => {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["dwg", "dxf", "skp"].includes(ext)) return "drawing";
  if (["3ds", "obj", "fbx", "glb", "gltf", "stl", "step"].includes(ext)) return "model";
  if (["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(ext)) return "image";
  return "document";
};
async function uploadProjectFile(projectId: string, fileName: string, bytes: ArrayBuffer, contentType: string): Promise<ProjectFileItem> {
  guard();
  const clean = sanitizeFileName(fileName);
  const objectPath = `${projectId}/${Date.now().toString(36)}-${clean}`;
  const { error } = await supabase.storage.from("projects").upload(objectPath, bytes, {
    contentType: contentType || "application/octet-stream",
    upsert: false,
  });
  if (error) fail("uploadProjectFile", error);
  return {
    id: `storage-${objectPath}`,
    name: clean,
    size: bytes.byteLength,
    kind: kindFromFileName(clean),
    uploadedBy: "You",
    uploadedAt: new Date().toISOString(),
    storagePath: objectPath,
  };
}

async function getProjectFileDownloadUrl(storagePath: string): Promise<string> {
  guard();
  const clean = String(storagePath).replace(/^\/+/, "");
  if (!clean || clean.split("/").includes("..")) throw new Error("Invalid storage path.");
  const { data, error } = await supabase.storage.from("projects").createSignedUrl(clean, 120);
  if (error || !data?.signedUrl) fail("getProjectFileDownloadUrl", error);
  return data.signedUrl;
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
  const base = slugify(input.name);
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
  await requireProcurementRead();
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
const getWarrantyPage = (): Promise<AdminWarrantyPage> => singletonRead("warranty_page", "warranty");
const updateWarrantyPage = (content: AdminWarrantyPage): Promise<AdminWarrantyPage> => singletonWrite("warranty_page", "warranty", content);
const resetWarrantyPage = (): Promise<AdminWarrantyPage> => singletonWrite("warranty_page", "warranty", defaultWarrantyPage());
const getCustomDesignPage = (): Promise<AdminCustomDesignPage> => singletonRead("custom_design_page", "custom-design");
const updateCustomDesignPage = (content: AdminCustomDesignPage): Promise<AdminCustomDesignPage> => singletonWrite("custom_design_page", "custom-design", content);
const resetCustomDesignPage = (): Promise<AdminCustomDesignPage> => singletonWrite("custom_design_page", "custom-design", defaultCustomDesignPage());
const getVirtualShowroomPage = (): Promise<AdminVirtualShowroomPage> => singletonRead("virtual_showroom_page", "virtual-showroom");
const updateVirtualShowroomPage = (content: AdminVirtualShowroomPage): Promise<AdminVirtualShowroomPage> => singletonWrite("virtual_showroom_page", "virtual-showroom", content);
const resetVirtualShowroomPage = (): Promise<AdminVirtualShowroomPage> => singletonWrite("virtual_showroom_page", "virtual-showroom", defaultVirtualShowroomPage());

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

/** Public preview reads only the immutable published snapshot, never draft rows. */
export async function getPublishedPage(slug: string): Promise<AdminPage | undefined> {
  guard();
  const { data, error } = await supabase.rpc("published_page", { p_slug: slug });
  if (error) fail("published_page", error);
  if (!data) return undefined;
  const snap = asObj(data);
  const blocks = Array.isArray(snap.blocks) ? snap.blocks as Row[] : [];
  const publishedAt = typeof snap.published_at === "string" ? snap.published_at : null;
  return {
    id: String(snap.id), slug: String(snap.slug), title: String(snap.title),
    kind: snap.kind === "chrome" ? "chrome" : "page", folderId: null,
    status: "published", doc: rowToDoc(snap, blocks), seo: rowToSeo(snap),
    updatedAt: publishedAt ?? "", publishedAt, version: 1, history: [],
  };
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
  listQuoteVersions,
  restoreQuoteVersion,
  listQuoteTemplates,
  saveQuoteTemplate,
  deleteQuoteTemplate,
  deleteQuote,
  listInvoices,
  getInvoice,
  listInvoicePayments,
  convertQuoteToInvoice,

  createInvoiceFromOrder,
  recordInvoicePayment,
  listTasks,
  createTask,
  setTaskDone,
  listClients,
  listMergeCandidates,
  mergeClients,
  updateClientCategory,
  listClientCrossRefs,
  listSiteVisits,
  createSiteVisit,
  updateSiteVisitStatus,
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
  updateLead,
  createLead,
  importLeads,
  listChatConversations,
  getChatConversation,
  postChatVisitorMessage,
  postChatAgentMessage,
  captureChatOffline,
  markChatRead,
  setChatStatus,
  countOpenChats,
  getChatMode,
  setChatMode,
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
  saveProjectPractice,
  linkProjectOrder,
  unlinkProjectOrder,
  getOrderProduction,
  getProjectPostDispatch,
  recordProjectHandover,
  openProjectWarranty,
  cancelProjectWarranty,
  listWarrantyRegister,
  listProjectWarrantyClaims,
  openProjectWarrantyClaim,
  updateProjectWarrantyClaim,
  assignProjectWarrantyClaim,
  listStaffSeats,
  listProjectQcInspections,
  recordProjectQcInspection,
  listProjectProductionEvents,
  setProjectActive,
  deleteProject,
  listProjectCostCodes,
  upsertProjectCostCode,
  deleteProjectCostCode,
  listProjectActuals,
  addProjectActual,
  updateProjectActual,
  deleteProjectActual,
  uploadProjectFile,
  getProjectFileDownloadUrl,
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
