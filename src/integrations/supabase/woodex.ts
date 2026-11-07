/**
 * WOODEX ↔ Supabase data layer (P1 scaffolding).
 *
 * Thin typed wrappers around:
 *   - capability-checked RPCs (require role grants first, see 20261107000001 migration)
 *   - direct table reads permitted by RLS for authenticated roles
 *
 * Until the staging project exists and `VITE_SUPABASE_URL` /
 * `VITE_SUPABASE_PUBLISHABLE_KEY` are set, every call fails fast with a clear
 * message instead of hanging — the admin keeps its demo mode unchanged.
 *
 * Reality note: without hosted Supabase there is no way to exercise these from
 * the authoring environment; correctness here = types + review + the pglite
 * rehearsal of the same RPC signatures. Verified paths: tsc (types) ✔,
 * pglite behavior ✔ (see docs/08-master-plan, 8.1).
 */
import { supabase } from "./client";
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./types";

export type ProductRow = Tables<"products">;
export type QuoteRow = Tables<"quotes">;
export type InvoiceRow = Tables<"invoices">;
export type OrderRow = Tables<"orders">;
export type LedgerMovementRow = Tables<"stock_movements">;

const configured = () =>
  Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or keep using demo mode.");
    this.name = "SupabaseNotConfiguredError";
  }
}

const guard = () => {
  if (!configured()) throw new SupabaseNotConfiguredError();
};

export type AdminOverview = {
  orders_today: number;
  open_quotes: number;
  pipeline_value: number;
  pending_invoices: number;
  overdue_returns: number;
  low_stock: number;
  new_leads_7d: number;
  published_pages: number;
};

export async function adminOverview(): Promise<AdminOverview> {
  guard();
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw error;
  return data as unknown as AdminOverview;
}

/** Admin product quick-edit (catalog.manage required server-side). */
export async function productUpdate(args: {
  id: string;
  price?: number;
  stockQty?: number;
  name?: string;
}): Promise<ProductRow> {
  guard();
  const { data, error } = await supabase.rpc("product_update", {
    p_id: args.id,
    p_price: args.price,
    p_stock_qty: args.stockQty,
    p_name: args.name,
  });
  if (error) throw error;
  return data as ProductRow;
}

export async function inventoryApply(args: {
  productId: string;
  delta: number;
  reason: string;
  note?: string;
}): Promise<ProductRow> {
  guard();
  const { data, error } = await supabase.rpc("inventory_apply", {
    p_product_id: args.productId,
    p_delta: Math.trunc(args.delta),
    p_reason: args.reason,
    p_note: args.note,
  });
  if (error) throw error;
  return data as ProductRow;
}

export async function orderStage(args: {
  orderId: number;
  stage: "intake" | "production" | "ready" | "delivered" | "closed" | "cancelled";
  note?: string;
}): Promise<OrderRow> {
  guard();
  const { data, error } = await supabase.rpc("order_stage", {
    p_order_id: args.orderId,
    p_stage: args.stage,
    p_note: args.note,
  });
  if (error) throw error;
  return data as OrderRow;
}

/** Idempotent: second call returns the same invoice. */
export async function quoteInvoiceSnapshot(quoteId: number): Promise<InvoiceRow> {
  guard();
  const { data, error } = await supabase.rpc("quote_invoice_snapshot", { p_quote_id: quoteId });
  if (error) throw error;
  return data as InvoiceRow;
}

/** finance.manage only; negative amounts are rejected by the ledger constraint. */
export async function invoiceApplyPayment(args: {
  invoiceId: number;
  amount: number;
  method?: string;
  reference?: string;
}): Promise<InvoiceRow> {
  guard();
  const { data, error } = await supabase.rpc("invoice_apply_payment", {
    p_invoice_id: args.invoiceId,
    p_amount: args.amount,
    p_method: args.method,
    p_reference: args.reference,
  });
  if (error) throw error;
  return data as InvoiceRow;
}

export async function clientMerge(into: number, from: number) {
  guard();
  const { data, error } = await supabase.rpc("client_merge", { p_into: into, p_from: from });
  if (error) throw error;
  return data;
}

// ── reads permitted by RLS ──────────────────────────────────────────────────
export async function listOrders(limit = 50): Promise<OrderRow[]> {
  guard();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function listInvoices(limit = 50): Promise<InvoiceRow[]> {
  guard();
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function listLowStock(limit = 25): Promise<ProductRow[]> {
  guard();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .lte("stock_qty", 5)
    .order("stock_qty", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}

export type NewLead = Pick<TablesInsert<"leads">, "name"> & Partial<TablesInsert<"leads">>;

/** Admin-side lead insert (mirror of the public lead-capture EF; server-side consent required). */
export async function insertLead(lead: NewLead) {
  guard();
  const { data, error } = await supabase.from("leads").insert(lead).select("id").single();
  if (error) throw error;
  return data;
}

export type { Json, Database, Tables, TablesInsert, TablesUpdate };
