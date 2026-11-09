/**
 * WOODEX — admin domain types.
 *
 * One canonical shape used by every adapter (demo DB, Bagisto REST). The Bagisto
 * adapter maps wire payloads into these types, so the admin UI never cares which
 * backend answered.
 */

export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";
export type PaymentMethod = "cod" | "bank-transfer" | "easypaisa" | "jazzcash" | "card";
export type LeadType = "quote" | "b2b" | "chat";
export type LeadStatus = "new" | "contacted" | "quoted" | "won" | "lost" | "meeting" | "not_responding";
/** Lead acquisition source — "furniture" | "interior" | "project" mirror the owner's Lead 2026 sheet; the rest are app-origin. */
export type LeadSource = "furniture" | "interior" | "project" | "website" | "storefront_chat" | "referral";
/** Live chat availability for the storefront bubble. Demo adapter persists it; hosted adapters are read-only stubs this phase. */
export type ChatMode = "off" | "offline" | "live";
export type ChatStatus = "open" | "closed";
export type StockStatus = "in_stock" | "out_of_stock" | "made_to_order";
export type StockMovementType = "inbound" | "outbound" | "return" | "damage" | "adjustment" | "transfer";

export interface AdminOrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  /** Variant SKU (product id + option suffixes) when bought as a configured variant. */
  sku?: string;
  /** Optional engineering spec — filled by the quotation builder; carried verbatim in JSON. */
  category?: string;
  series?: string;
  material?: string;
  finish?: string;
  width?: number;
  height?: number;
  depth?: number;
  unit?: "mm" | "cm" | "in";
  customNotes?: string;
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
  /** Transient createOrder outcome from the unverified Bagisto checkout integration.
   * None of these values confirms remote order creation; local IDs are not receipts. */
  submissionOutcome?: "bagisto-response-unverified" | "bagisto-queued-locally" | "bagisto-not-saved";
  notes?: string;
  /** Courier + consignment for the dispatch leg (admin-entered). */
  courierName?: string;
  trackingNumber?: string;
  /** Staff-only annotations — never shown on the storefront / invoice. */
  internalNotes?: string;
  /** Discount carried over when converted from a quote (B2B) — absent on regular orders. */
  discountPct?: number;
  discountAmount?: number;
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

/* ── Returns (RMA) ──────────────────────────────────────────────────────── */
export type ReturnReason = "damaged" | "wrong_item" | "not_as_described" | "changed_mind" | "other";
/** requested → received → inspected → refunded | replaced | rejected */
export type ReturnStatus = "requested" | "received" | "inspected" | "refunded" | "replaced" | "rejected";
export interface AdminReturnItem {
  id: string;            // order line id (== product id in the demo seed)
  name: string;
  image?: string;
  quantity: number;
  price: number;
}
export interface AdminReturn {
  id: string;            // e.g. "RMA-1001"
  orderId: string;       // e.g. "WDX-1042"
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  city: string;
  items: AdminReturnItem[];
  reason: ReturnReason;
  reasonDetail?: string;
  status: ReturnStatus;
  /** Editable while inspected; defaults to the full value of the returned lines. */
  refundAmount?: number;
  /** Restock lines into inventory when status → received. */
  restock: boolean;
  inspectionNote?: string;
  createdAt: string;
  updatedAt: string;
}
export interface NewReturnItemInput {
  productId: string;
  quantity: number;
}
export interface NewReturnInput {
  orderId: string;
  items: NewReturnItemInput[];
  reason: ReturnReason;
  reasonDetail?: string;
  restock?: boolean;
}
export type AdminReturnPatch = Partial<Pick<AdminReturn, "status" | "inspectionNote" | "restock" | "refundAmount">>;

/* ── Exchanges ──────────────────────────────────────────────────────────── */
export type ExchangeStatus = "requested" | "approved" | "shipped" | "completed" | "rejected";
export interface AdminExchangeItem {
  id: string;            // product id (incoming lines map onto order lines)
  name: string;
  image?: string;
  quantity: number;
  price: number;
}
export interface AdminExchange {
  id: string;            // e.g. "EXC-1001"
  orderId: string;       // e.g. "WDX-1042"
  /** Linked RMA when the exchange originates from a return. */
  returnId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  city: string;
  /** Items coming back from the customer (snapshot from order lines). */
  incoming: AdminExchangeItem[];
  /** Replacement items to dispatch to the customer. */
  outgoing: AdminExchangeItem[];
  reason?: string;
  status: ExchangeStatus;
  /** outgoing total − incoming total. Positive = customer pays, negative = refund to customer. */
  priceDifference: number;
  /** True once the difference (collect or refund) has been settled. */
  differenceSettled: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface NewExchangeLineInput {
  productId: string;
  quantity: number;
}
export interface NewExchangeInput {
  orderId: string;
  returnId?: string;
  incoming: NewExchangeLineInput[];
  outgoing: NewExchangeLineInput[];
  reason?: string;
}
export type AdminExchangePatch = Partial<Pick<AdminExchange, "status" | "differenceSettled">>;

/* ── Claims (warranty / damage / defect) ───────────────────────────────── */
export type ClaimType = "warranty" | "damage" | "defect";
/** reported → assessing → approved | rejected → resolved */
export type ClaimStatus = "reported" | "assessing" | "approved" | "rejected" | "resolved";
export interface AdminClaim {
  id: string;            // e.g. "CLM-1001"
  /** Linked order when the claim references one (often a delivered order). */
  orderId?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  city: string;
  /** What the claim is about — product/line name (free text for walk-in claims). */
  productName: string;
  productId?: string;
  type: ClaimType;
  /** Customer's description of the failure. */
  issue: string;
  status: ClaimStatus;
  assessmentNote?: string;
  resolutionNote?: string;
  /** Cost WOODEX absorbed on a resolved claim (repair/replacement/parts). */
  resolutionCost?: number;
  createdAt: string;
  updatedAt: string;
}
export interface NewClaimInput {
  orderId?: string;
  productName: string;
  productId?: string;
  type: ClaimType;
  issue: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  city?: string;
}
export type AdminClaimPatch = Partial<Pick<AdminClaim, "status" | "assessmentNote" | "resolutionNote" | "resolutionCost">>;

/* ── Draft Orders ───────────────────────────────────────────────────────── */
export type DraftOrderStatus = "draft" | "converted";
export interface AdminDraftOrder {
  id: string;            // e.g. "DRF-1001"
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  city?: string;
  address?: string;
  /** Line snapshot — catalogue lines carry productId; free lines don't. */
  items: AdminOrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  channelId?: string;
  /** Staff-only note — never shown storefront/customer-facing. */
  notes?: string;
  status: DraftOrderStatus;
  /** Set on conversion — the WDX-… order this draft became. */
  convertedOrderId?: string;
  createdAt: string;
  updatedAt: string;
}
export interface NewDraftOrderLineInput {
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  category?: string;
  series?: string;
  material?: string;
  finish?: string;
  width?: number;
  height?: number;
  depth?: number;
  unit?: "mm" | "cm" | "in";
  customNotes?: string;
}
export interface NewDraftOrderInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  city?: string;
  address?: string;
  items: NewDraftOrderLineInput[];
  shipping?: number;
  channelId?: string;
  notes?: string;
}
export type AdminDraftOrderPatch = Partial<NewDraftOrderInput>;

/* ── Quotes (priced quotations — closes the B2B Quotation-form → lead → quote → order loop) ── */
export type QuoteStatus = "draft" | "review" | "approval" | "sent" | "revised" | "accepted" | "declined" | "converted";
export interface AdminQuote {
  id: string;            // e.g. "QOT-1001"
  /** Originating CRM lead, when the quote was drafted from one. */
  leadId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  company?: string;
  city?: string;
  address?: string;
  /** Line snapshot — catalogue lines carry the product id; free lines get a synthetic one. */
  items: AdminOrderItem[];
  subtotal: number;         // list-price sum before discount
  discountPct: number;      // 0–60
  discountAmount: number;
  shipping: number;
  total: number;            // subtotal − discountAmount + shipping
  validityDays: number;
  validUntil: string;       // ISO — UI badges the quote "expired" when past (derived, not stored)
  notes?: string;
  status: QuoteStatus;
  convertedOrderId?: string;
  /** Monotonic save counter (v1 = creation). Present only on quotes created/edited after the versioning port. */
  version?: number;
  /** Chosen print template (custom or builtin id). Undefined = builtin "Woodex classic". */
  templateId?: string;
  /** Lightweight audit trail — status transitions and edits. Newest last, capped at 20 entries. */
  audit?: QuoteAuditEntry[];
  createdAt: string;
  updatedAt: string;
}
export interface QuoteAuditEntry {
  version: number;
  at: string;
  /** "create" | "edit" | "status" | "restore" | "send" */
  action: string;
  /** Free detail, e.g. "review→approval" or "restore:3". */
  detail?: string;
}
export interface AdminQuoteVersion {
  id: string;
  quoteId: string;
  version: number;
  action?: string;
  actor?: string;
  createdAt: string;
  /** Frozen copy of the financially-relevant quote state at save time. */
  snapshot: {
    items: AdminOrderItem[];
    subtotal: number;
    discountPct: number;
    discountAmount: number;
    shipping: number;
    total: number;
    status: string;
    notes?: string;
    templateId?: string;
    validityDays?: number;
    validUntil: string;
  };
}
export type QuoteTemplateBlockType =
  | "letterhead" | "doc-ref" | "doc-title" | "validity"
  | "payment-note" | "terms" | "signature" | "custom";
export interface QuoteTemplateBlock {
  id: string;
  type: QuoteTemplateBlockType;
  label: string;
  content: string;
  visible: boolean;
}
export interface AdminTask {
  id: string;              // TSK-#### (demo seeds from 1001; supabase rides bigint identity)
  title: string;
  /** Free-text client/deal label captured at creation (e.g. lead name) — not an FK for humans to read. */
  client?: string;
  leadId?: string;
  quoteId?: string;
  orderId?: string;
  due?: string;
  owner: string;
  priority: string;        // low | normal | high — free-form per 0001 (default 'normal')
  done: boolean;
  createdAt: string;
  updatedAt: string;
}
export type NewTaskInput = { title: string; dueAt?: string; priority?: string; owner?: string; client?: string };

export type InvoiceStatus = "Issued" | "Partially paid" | "Paid" | "Overdue" | "Cancelled";
export interface AdminInvoicePayment {
  id: string;
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string;
  note?: string;
  createdAt: string;
}
export interface AdminInvoice {
  id: string;             // INV-#### (demo seeds from 1001; supabase rides bigint identity)
  ref?: string;
  quoteId?: string;       // QOT-#### — set when created via quote→invoice snapshot
  orderId?: string;       // ORD-#### — set when issued against an order (order path is separate)
  customer: string;
  company?: string;
  city?: string;
  items: Array<{ id: string; name: string; price: number; quantity: number; image?: string }>;
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  paid: number;
  /** total - paid, computed at read time (never trusted from storage). */
  balance: number;
  status: InvoiceStatus;
  due?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export type NewInvoicePaymentInput = { amount: number; method?: string; reference?: string; note?: string };

export interface AdminQuoteTemplate {
  id: string;
  name: string;
  /** Accent colour for headings / rules (hex). */
  brandColor: string;
  header: QuoteTemplateBlock[];
  footer: QuoteTemplateBlock[];
  /** Builtin templates live in code and are read-only; editing one clones it. */
  builtIn?: boolean;
  /** Optional logo as a data URL (≤200 KB) — picked in the template designer; renders in the A4 masthead. */
  logo?: string;
  /** Print layout: "classic" (original sheet) or "a4" (redesigned Woodex A4 sheet). Defaults to "classic". */
  layout?: "classic" | "a4";
  /** Advance % due on acceptance (furniture A4 documents). Whole points, clamped 0–100; missing = 75. */
  advancePct?: number;
  /** Quotation validity in days (designer default 30). The quote's own `validityDays` stays authoritative at print time. */
  validityDays?: number;
  /** Advance/policy wording (EN). Supports {advance} {balance} {advancePct} {balancePct} {validUntil} placeholders — resolved at render. Missing = classic payment-note row only. */
  termsEn?: string;
  /** Urdu counterpart — rendered RTL below the EN block. */
  termsUr?: string;
  /** Render the client-acceptance signature block (default: true for the A4 layout). */
  acceptanceBlock?: boolean;
  /** Signatory footer variant — "zainab" (WI-10204 house doc) | "store" (storefront) | "custom". Missing = zainab behaviour for A4. */
  footerVariant?: "zainab" | "store" | "custom";
  /** Custom signatory footer lines (one per line) — used when footerVariant === "custom". */
  footerCustomLines?: string;
}
export type NewQuoteLineInput = NewDraftOrderLineInput;
export interface NewQuoteInput {
  leadId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  company?: string;
  city?: string;
  address?: string;
  items: NewQuoteLineInput[];
  discountPct?: number;
  validityDays?: number;
  shipping?: number;
  notes?: string;
  /** Print template id (builtin or custom). Missing = builtin Woodex classic. */
  templateId?: string;
}
export type AdminQuotePatch = Partial<NewQuoteInput> & { status?: QuoteStatus; templateId?: string };

/* ── Suppliers (purchasing master — referenced by purchase orders) ────────── */
export type SupplierTerms = "advance" | "cod" | "net15" | "net30" | "net45";
export interface AdminSupplier {
  id: string;            // e.g. "SUP-1001"
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  /** NTN / sales-tax registration — optional. */
  taxId?: string;
  paymentTerms: SupplierTerms;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface NewSupplierInput {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  taxId?: string;
  paymentTerms?: SupplierTerms;
  notes?: string;
  active?: boolean;
}
export type AdminSupplierPatch = Partial<NewSupplierInput>;

/* ── Purchase Orders (replenishment from suppliers) ──────────────────────── */
export type PurchaseOrderStatus = "draft" | "sent" | "partial" | "received" | "cancelled";
export interface AdminPurchaseOrderLine {
  id: string;
  productId?: string;    // catalogue line — receipt writes inbound stock movements
  name: string;
  sku?: string;
  image?: string;
  costPrice: number;     // PKR — what WOODEX pays the supplier
  quantity: number;      // ordered units
  receivedQuantity: number;
}
export interface AdminPurchaseOrder {
  id: string;            // e.g. "PO-1001"
  supplierId: string;
  supplierName: string;  // snapshot at creation/save
  lines: AdminPurchaseOrderLine[];
  subtotal: number;      // Σ costPrice × quantity
  expectedDate?: string; // ISO date (yyyy-mm-dd)
  notes?: string;
  status: PurchaseOrderStatus;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;   // set when every line is fully received
}
export interface NewPurchaseOrderLineInput {
  productId?: string;
  name: string;
  sku?: string;
  image?: string;
  costPrice: number;
  quantity: number;
}
export interface NewPurchaseOrderInput {
  supplierId: string;
  lines: NewPurchaseOrderLineInput[];
  expectedDate?: string;
  notes?: string;
  /** Creates as draft (default) or straight to sent. */
  status?: "draft" | "sent";
}
export interface AdminPurchaseOrderPatch {
  supplierId?: string;
  lines?: NewPurchaseOrderLineInput[];
  expectedDate?: string;
  notes?: string;
}
/** One receipt entry per line — quantity is clamped to the remaining units. */
export interface PurchaseOrderReceipt {
  lineId: string;
  quantity: number;
}

/* ── Stock Transfers (locations: factory warehouse + showrooms) ──────────── */
export type TransferStatus = "draft" | "in_transit" | "received" | "cancelled";
export interface AdminTransferLine {
  id: string;
  productId: string;
  name: string;
  sku?: string;
  image?: string;
  quantity: number;
  receivedQuantity: number;
}
export interface AdminStockTransfer {
  id: string;                 // e.g. "TRF-1001"
  fromLocationId: string;     // "loc-warehouse" or a showroom id
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  /** Catalogue lines only — transfers move real, tracked stock. */
  lines: AdminTransferLine[];
  status: TransferStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;
}
export interface NewStockTransferLineInput {
  productId: string;
  name: string;
  sku?: string;
  image?: string;
  quantity: number;
}
export interface NewStockTransferInput {
  fromLocationId: string;
  toLocationId: string;
  lines: NewStockTransferLineInput[];
  notes?: string;
}
export interface AdminStockTransferPatch {
  fromLocationId?: string;
  toLocationId?: string;
  lines?: NewStockTransferLineInput[];
  notes?: string;
}
export interface StockTransferReceipt {
  lineId: string;
  quantity: number;
}
/** Location picker — warehouse (factory) plus active showrooms. */
export interface TransferLocation {
  id: string;
  name: string;
  kind: "warehouse" | "showroom";
}

/* ── Product option sets (Finish / Fabric / Size — master data) ───────────── */
export interface AdminOptionValue {
  id: string;
  label: string;
  /** +/- PKR applied to the product base price when selected. */
  priceDelta: number;
  /** Appended to the SKU on variant selection (WDX-1001-NO-FI-C). */
  skuSuffix?: string;
}
export interface AdminOptionSet {
  id: string;                 // e.g. "opt-finish" (seeds) or "optset-…" (admin-created)
  name: string;               // e.g. "Finish"
  values: AdminOptionValue[];
  createdAt: string;
  updatedAt: string;
}
export interface AdminOptionValueInput {
  id?: string;                // keep the id on edit; omit for new values
  label: string;
  priceDelta: number;
  skuSuffix?: string;
}
export interface NewOptionSetInput {
  name: string;
  values: AdminOptionValueInput[];
}
export interface AdminOptionSetPatch {
  name?: string;
  values?: AdminOptionValueInput[];
}

/* ── CRM identity layer (0001 clients / client_links / client_merge) ──────────
 * Identity resolution is a human-in-the-loop surface: nothing merges itself.
 * `emailNorm`/`phoneNorm` are the collision keys; `mergedInto` marks retired
 * records (soft tombstone — no deletes). */
export interface AdminClient {
  id: string;             // "CLI-<n>" demo/hosted synthetic ref
  name: string;
  company?: string;
  email?: string;
  emailNorm?: string;
  phone?: string;
  phoneNorm?: string;
  city?: string;
  kind: "retail" | "business";
  source?: string;        // acquisition attribution when known (lead/utm/referrer)
  tags: string[];
  notes?: string;
  /** Set when this record was merged into another — retired id, kept for audit. */
  mergedInto?: string;
  /** Explicit line-of-business tag (V4 P2). Absent for legacy rows — the UI derives furniture/interior/project/retail/business from kind+tags. */
  category?: ClientCategory;
  createdAt: string;
  updatedAt: string;
}

/** CRM client category (V4 P2) — furniture/interior/project line of business. Derived at read when unset (kind/tags), explicit when retagged. */
export type ClientCategory = "furniture" | "interior" | "project" | "retail" | "business";
export const CLIENT_CATEGORIES: ClientCategory[] = ["furniture", "interior", "project", "retail", "business"];

export interface ClientCrossRefs {
  lead?: number;
  quote?: number;
  invoice?: number;
  order?: number;
  project?: number;
}

export interface AdminClientLink {
  clientId: string;
  entity: string;         // "lead" | "quote" | "order" | "site_visit" | ...
  entityId: string;
}

export interface MergeCandidate {
  /** stable pair key for UI state */
  id: string;
  reason: "email" | "phone";
  /** the shared normalized key */
  key: string;
  /** 2+ non-merged clients colliding on the same normalized key */
  clients: AdminClient[];
}

/* ── Site visits (0001 public.site_visits — plain RLS, crm.manage; no reminder-task RPC yet) ── */
export type SiteVisitStatus = "Scheduled" | "Completed" | "No-show" | "Cancelled";
export interface AdminSiteVisit {
  id: string;              // "SV-<n>"
  leadId: string;          // "lead-<n>"
  clientId: string;        // "CLI-<n>" — mandatory in 0001 (client identity is the CRM master)
  scheduledAt: string;     // ISO
  address: string;
  owner: string;
  status: SiteVisitStatus;
  outcome?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
export interface NewSiteVisitInput {
  leadId: string;
  scheduledAt: string;
  address: string;
  owner?: string;
  notes?: string;
  /** Optional explicit client — hosted resolves/creates the client for the lead when omitted. */
  clientId?: string;
}
export interface SiteVisitPatch {
  status?: SiteVisitStatus;
  outcome?: string;
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
  /** Acquisition source when we know it (hosted: joined from clients by email_norm when present). */
  source?: string;
  /** Deterministic 1–99 profile score — always DERIVED from orders/totalSpent (never stored, never hand-entered). */
  score?: number;
}

/** Transient result of the unverified Bagisto lead intake, not a delivery receipt. */
export type LeadSubmissionOutcome = "bagisto-response-unverified" | "bagisto-queued-locally" | "bagisto-not-saved";

export interface AdminLead {
  id: string;
  submissionOutcome?: LeadSubmissionOutcome;
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
  consent?: boolean;
  consentAt?: string;
  consentVersion?: string;
  landingPath?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /* Lead 2026 parity (import + CRM depth) */
  /** Free text — e.g. "Abdullah", "Nabeel", "Imtiaz" from the sheet's "Assassin to" column. */
  assignedTo?: string;
  leadSource?: LeadSource;
  /** Reference to a quote document (e.g. "WI-10204") when the lead is linked. */
  quotationRef?: string;
  /** ISO date of last outbound touch. */
  lastContact?: string;
  /** ISO datetime of the scheduled meeting. */
  meetingAt?: string;
  /** Free text next step ("Monday visit", "Expecting call"). */
  nextAction?: string;
  /** Sheet's trailing Note column. */
  note?: string;
}

/** Patch for the CRM parity fields (V4 P3). Empty string clears the field. Hosted wires assignedTo→owner + note only — the rest need the owner-gated migration. */
export interface AdminLeadPatch {
  assignedTo?: string;
  leadSource?: LeadSource | "";
  quotationRef?: string;
  /** ISO datetime; "" clears. */ lastContact?: string;
  /** ISO datetime; "" clears. */ meetingAt?: string;
  nextAction?: string;
  note?: string;
}

/* ── Lead import (V4 PR-A) — parse happens client-side; adapter only persists ── */
export interface LeadImportRow {
  /** 1-based line number in the source file (for issue reporting). */
  row: number;
  date?: string;        // ISO after parse
  company?: string;
  name?: string;
  phone?: string;
  email?: string;
  designation?: string;
  location?: string;
  leadSource?: LeadSource;
  status?: LeadStatus;
  assignedTo?: string;
  quotationRef?: string;
  lastContact?: string;
  nextAction?: string;
  meetingAt?: string;
  note?: string;
}
export interface LeadImportIssue {
  row: number;
  reason: string;
  name?: string;
  phone?: string;
}
export interface LeadImportResult {
  /** Leads created (or, with dryRun, that WOULD be created). */
  created: number;
  duplicates: LeadImportIssue[];
  rejected: LeadImportIssue[];
}
export interface LeadImportInput {
  rows: LeadImportRow[];
  /** true = simulate only, nothing is written. */
  dryRun?: boolean;
}

/** Live chat — storefront bubble ↔ admin inbox (demo adapter this phase; V4 §P0). */
export interface ChatConversation {
  id: string;                       // "CH-<n>" (demo: "DEMO-CH-<n>" for seeds)
  /** Storefront landing path the visitor opened chat from, e.g. "/shop". */
  page?: string;
  visitorName?: string;
  visitorPhone?: string;
  visitorConsent?: boolean;
  visitorConsentAt?: string;
  status: ChatStatus;
  /** Agent-side unread count (visitor messages not yet seen). */
  unread: number;
  createdAt: string;                // ISO
  lastMessageAt: string;            // ISO
  /** Set when an offline capture (or inbox conversion) created a lead from this thread. */
  leadId?: string;
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "visitor" | "agent";
  body: string;
  createdAt: string;                // ISO
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
  /** Attached option set ids (Finish / Fabric / Size …) — order matters on PDP. */
  optionSetIds?: string[];
  /** Free-form spec rows (Dimensions / Weight / Material / Warranty…) — editable in admin. */
  specs?: Array<{ label: string; value: string }>;
  /** Short blurb (legacy "Short Description"). */
  shortDescription?: string;
  /** Long-form product details (legacy "Product Details"). */
  description?: string;
  /** Gallery URLs — images[0] is the primary thumbnail admin-wide. */
  images?: string[];
  /** FK to storefront /series/:seriesId (ek-series, infinity-series…). */
  seriesId?: string;
  /** FK to the admin Brand master (seeded "woodex"); room for future partner brands. */
  brandId?: string;
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

/* ── Furniture Series (admin-managed since A2; storefront reads static master until Bagisto) ── */
export interface AdminSeries {
  id: string;            // slug — matches the static `seriesList` ids and `/series/:seriesId` URLs
  name: string;
  tagline: string;
  badge: string;
  description: string;
  features: string[];
  color: string;          // hex accent used by the /series landing cards
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface NewSeriesInput {
  id?: string;            // optional slug override on create; derived from name when omitted
  name: string;
  tagline: string;
  badge: string;
  description: string;
  features: string[];
  color: string;
  active?: boolean;
  sortOrder?: number;
}

/* ── Product Brands (admin-managed since A3; catalogue is Woodex today) ── */
export interface AdminBrand {
  id: string;             // slug — products reference this via brandId
  name: string;
  tagline: string;
  description: string;
  logo?: string;          // URL or /public path; rendered with an onError fallback
  website?: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
export interface NewBrandInput {
  id?: string;            // optional slug override on create; derived from name when omitted
  name: string;
  tagline: string;
  description: string;
  logo?: string;
  website?: string;
  active?: boolean;
  sortOrder?: number;
}

/* ── Homepage sections (admin-managed since A6; storefront is static until Bagisto) ── */
export type HomepageRailMode = "auto" | "manual";
export interface AdminHomepageRail {
  /** "auto" — storefront derives the rail from product flags at cutover (admin previews the rule).
   *  "manual" — the ordered productIds below (capped at 12). */
  mode: HomepageRailMode;
  productIds: string[];
}
export interface AdminHomepageSections {
  bestSellers: AdminHomepageRail;
  carousel: AdminHomepageRail;
}

/* ── Warranty page content (singleton — admin-editable /warranty policy page) ── */
export interface AdminWarrantyTier {
  /** Stable row id for the editor (regenerated on save if missing/duplicated). */
  id: string;
  name: string;
  duration: string;
  applies: string;
  /** At most one tier shows the "Most Popular" badge (first wins on save). */
  popular: boolean;
  coverage: string[];
  excludes: string[];
}
export interface AdminWarrantyStep {
  id: string;
  title: string;
  description: string;
}
export interface AdminWarrantyFaq {
  id: string;
  q: string;
  a: string;
}
export interface AdminWarrantyPage {
  hero: { eyebrow: string; title: string; subtitle: string };
  tiers: AdminWarrantyTier[];
  steps: AdminWarrantyStep[];
  faqs: AdminWarrantyFaq[];
}

/* ── Custom Design + Virtual Showroom pages (admin-managed since B4) ───────── */
export interface AdminCustomDesignSpaceItem {
  /** Stable row id for the editor. Number shown on the card is derived from position. */
  id: string;
  label: string;
  blurb: string;
  /** Services slug the card links to (/services/:slug). */
  slug: string;
}
export interface AdminCustomDesignTestimonial {
  id: string;
  text: string;
  name: string;
  role: string;
}
export interface AdminCustomDesignPage {
  hero: { eyebrow: string; title: string; subtitle: string };
  wds: { heading: string; paragraph: string; subheading: string; varietyOne: string; varietyTwo: string };
  spaces: { heading: string; subheading: string; items: AdminCustomDesignSpaceItem[] };
  furniture: { heading: string; paragraph: string; bullets: string[] };
  designFirst: { heading: string; bodyOne: string; bodyTwo: string };
  testimonialsIntro: { heading: string; subheading: string };
  testimonials: AdminCustomDesignTestimonial[];
  finalCta: { heading: string; paragraph: string };
}

export type AdminVirtualShowroomFeatureIcon = "monitor" | "rotate" | "palette" | "maximize" | "users" | "box";
export interface AdminVirtualShowroomFeature {
  id: string;
  icon: AdminVirtualShowroomFeatureIcon;
  title: string;
  description: string;
}
export interface AdminVirtualShowroomPage {
  hero: { eyebrow: string; title: string; subtitle: string };
  configurator: { heading: string; intro: string };
  featuresIntro: { heading: string; subheading: string };
  features: AdminVirtualShowroomFeature[];
  finalCta: { heading: string; paragraph: string };
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

/* ── Project actuals ledger (migration 0013 — relational, NOT payload) ──
   The planned BOQ stays inside `projects.payload`. ACTUALS live in
   public.project_cost_codes + public.project_actuals (cost codes align to BOQ
   sections by name via boq_section; shop codes LABOR / SUBCON / MISC carry none).
   Variance is computed client-side per code (planned from payload BOQ section
   totals vs ledger actuals). PO→BOQ allocation is manual in this slice. */
export const PROJECT_ACTUAL_SOURCES = ["po", "labor", "subcontract", "manual"] as const;
export type ProjectActualSource = (typeof PROJECT_ACTUAL_SOURCES)[number];
export const PROJECT_ACTUAL_SOURCE_LABELS: Record<ProjectActualSource, string> = {
  po: "Purchase order",
  labor: "Site labour",
  subcontract: "Subcontract",
  manual: "Manual entry",
};
export interface ProjectCostCode {
  id: number;
  projectId: string;
  code: string;
  /** payload BOQ section this code maps to (planned side); null for shop codes */
  boqSection: string | null;
  description: string;
  createdAt: string;
}
export interface ProjectActualLine {
  id: number;
  projectId: string;
  costCode: string;
  description: string;
  qty: number;
  unit: string;
  rate: number;
  /** qty × rate (server-generated hosted; client-computed in demo) */
  amount: number;
  source: ProjectActualSource;
  poRef: string | null;
  /** YYYY-MM-DD */
  incurredOn: string;
  note: string;
  createdAt: string;
}

/* ── Projects / case studies (admin-managed since P1.3) ─────────────────── */
export interface AdminProject {
  id: string;
  /** Practice workspace payload (BOQ / milestones / files) — absent for plain portfolio entries. */
  practice?: ProjectPractice;
  title: string;
  client: string;
  category: string;
  image: string;
  beforeImage?: string;
  location: string;
  sqft: string;
  year: string;
  employees: string;
  duration: string;
  description: string;
  challenge?: string;
  solution?: string;
  furnitureUsed: string[];
  testimonial?: { text: string; author: string; role: string };
  /** 0–5, optional for admin-created projects */
  rating?: number;
  active: boolean;
  sortOrder: number;
  /** Optimistic-concurrency token for practice/payload writes (migration 00022). */
  revision?: number;
  /** Last person who changed the production stages (demo mirror of
   *  `projects.production_updated_by`). Used to stop self-approval: whoever moved
   *  the stages cannot record the QC pass. Undefined in Supabase mode, where the
   *  RPC enforces the rule and returns the reason. */
  productionUpdatedBy?: string;
  /** Order this job was started from (`WDX-<n>`), stored in `projects.order_id`
   *  (candidate 00024). One order links to at most one job. */
  orderId?: string;
  createdAt: string;
  updatedAt: string;
}

/* ── Interior projects — practice workspace (rides the projects payload; no migration) ──
   BOQ is PLANNED cost only (no actuals/variance — needs owner sign-off on a
   costing model). Files are metadata-only; no bytes are stored. Milestones use a
   four-badge status. Everything serializes into `projects.payload`. */
export type ProjectMilestoneStatus = "not_started" | "in_progress" | "blocked" | "done";
export const PROJECT_MILESTONE_STATUSES: ProjectMilestoneStatus[] = ["not_started", "in_progress", "blocked", "done"];
export interface ProjectMilestone {
  id: string;
  phase: string;
  owner: string;
  due?: string;
  status: ProjectMilestoneStatus;
}
export interface ProjectBoqRow {
  id: string;
  section: string;
  item: string;
  qty: number;
  unit: string;
  rate: number;
}
export interface ProjectFileItem {
  id: string;
  name: string;
  size: number;
  kind: "drawing" | "image" | "document" | "model";
  uploadedBy: string;
  uploadedAt: string;
  /** Set when the file lives in the hosted `projects` bucket (migration 0014) — object name `<project-id>/<file>`. Absent in demo (metadata-only). */
  storagePath?: string;
}
/* ── Production / dispatch (rides the same payload; still no migration) ──
   Five fixed shop-floor stages with per-stage % complete + note; a QC gate
   (pending/passed/failed + defect note) and a dispatch block (date · vehicle ·
   driver · challan ref). The UI checks the recorded QC value before dispatch;
   migration 00021 adds a limited local server-side check but is not independent
   approval, and its hosted deployment and policy are unverified. */
export const PROJECT_PRODUCTION_STAGES = ["material_prep", "fabrication", "finishing", "qc", "dispatch"] as const;
export type ProjectProductionStageKey = (typeof PROJECT_PRODUCTION_STAGES)[number];
export const PROJECT_PRODUCTION_STAGE_LABELS: Record<ProjectProductionStageKey, string> = {
  material_prep: "Material prep",
  fabrication: "Fabrication",
  finishing: "Finishing",
  qc: "QC inspection",
  dispatch: "Dispatch",
};
export interface ProjectProductionStage {
  id: string;
  stage: ProjectProductionStageKey;
  pct: number; // 0–100
  note: string;
}
export const PROJECT_QC_RESULTS = ["pending", "passed", "failed"] as const;
export type ProjectQcResult = (typeof PROJECT_QC_RESULTS)[number];
export interface ProjectQc {
  result: ProjectQcResult;
  defectNote: string;
  inspectedBy: string;
  inspectedAt: string; // YYYY-MM-DD
}
export interface ProjectDispatch {
  date: string; // YYYY-MM-DD
  vehicle: string;
  driver: string;
  driverPhone: string;
  challanRef: string;
}
export interface ProjectProduction {
  stages: ProjectProductionStage[];
  qc: ProjectQc;
  dispatch: ProjectDispatch;
}
export interface ProjectPractice {
  boq: ProjectBoqRow[];
  milestones: ProjectMilestone[];
  files: ProjectFileItem[];
  production?: ProjectProduction;
}

/** Recorded QC inspection (append-only; migration 00022 candidate). The pass
 *  shown on the job comes from here, not from a hand-typed payload field. */
export interface ProjectQcInspection {
  id: string;
  projectId: string;
  result: "passed" | "failed";
  notes: string;
  inspectedByEmail: string;
  /** Project revision created by this inspection. */
  revision: number;
  createdAt: string;
}

/** Append-only production audit entry (migration 00022 candidate). */
/* ── Delivery / installation handover + warranty (candidate 00025) ────────── */
export type ProjectHandoverKind = "delivery" | "installation";
export interface ProjectHandover {
  id: string;
  projectId: string;
  kind: ProjectHandoverKind;
  /** YYYY-MM-DD, never in the future. */
  happenedOn: string;
  lead: string;
  notes: string;
  signedBy: string;
  createdAt: string;
}
export type ProjectWarrantyState = "none" | "active" | "expired" | "cancelled";
export interface ProjectWarranty {
  id: string;
  projectId: string;
  months: number;
  coverage: string;
  exclusions: string;
  /** YYYY-MM-DD — the installation date, not the day it was typed. */
  startsOn: string;
  endsOn: string;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
}
/** One row of the warranty register (candidate 00027) — computed, never stored. */
export interface WarrantyRegisterRow {
  projectId: string;
  title: string;
  orderId?: string;
  warrantyId?: string;
  warrantyState: ProjectWarrantyState;
  startsOn?: string;
  endsOn?: string;
  /** Negative when expired. */
  daysLeft?: number;
  expiringSoon: boolean;
  openClaims: number;
  totalClaims: number;
  deliveryOn?: string;
  installationOn?: string;
  dispatchVehicle?: string;
  updatedAt: string;
}

export type ProjectWarrantyClaimStatus = "open" | "scheduled" | "resolved" | "rejected";
export interface ProjectWarrantyClaim {
  id: string;
  projectId: string;
  warrantyId: string;
  summary: string;
  details: string;
  status: ProjectWarrantyClaimStatus;
  /** YYYY-MM-DD; never future, never before the warranty start. */
  openedOn: string;
  resolution: string;
  closedAt?: string;
  openedBy?: string;
  createdAt: string;
}

/** What happened after dispatch, plus the derived warranty state (never typed). */
export interface ProjectPostDispatch {
  projectId: string;
  delivery?: ProjectHandover;
  installation?: ProjectHandover;
  warranty?: ProjectWarranty;
  warrantyState: ProjectWarrantyState;
}

/** Read projection for the orders page: which job is building this order. */
export interface OrderProduction {
  projectId: string;
  orderId: string;
  title: string;
  /** Roll-up of stage percentages (0–100). */
  progress: number;
  qcResult: "pending" | "passed" | "failed" | null;
  dispatchVehicle: string | null;
  dispatchDate: string | null;
  updatedAt: string;
}

export interface ProjectProductionEvent {
  id: number;
  projectId: string;
  action: string;
  revision: number;
  qcResult: string | null;
  dispatchVehicle: string | null;
  createdAt: string;
}

export interface NewProjectInput {
  title: string;
  /** Optional order link (`WDX-<n>`); stored on the row, never inside the payload. */
  orderId?: string;
  practice?: ProjectPractice;
  client: string;
  category: string;
  image?: string;
  beforeImage?: string;
  location?: string;
  sqft?: string;
  year?: string;
  employees?: string;
  duration?: string;
  description?: string;
  challenge?: string;
  solution?: string;
  furnitureUsed?: string[];
  testimonial?: { text: string; author: string; role: string };
  rating?: number;
  active?: boolean;
  sortOrder?: number;
}

/* ── Blog / Journal (admin-managed since P1.4) ──────────────────────────── */
export interface AdminBlogContentBlock {
  heading?: string;
  body: string;
}

export interface AdminBlogPost {
  /** URL slug, e.g. "ergonomic-office-guide-2025" */
  id: string;
  title: string;
  excerpt: string;
  image: string;
  category: string;
  author: string;
  /** Free-form date string — ISO (admin-created) or legacy "Feb 15, 2025" (seed). */
  date: string;
  readTime: string;
  featured: boolean;
  active: boolean;
  content: AdminBlogContentBlock[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NewBlogPostInput {
  title: string;
  category: string;
  author: string;
  date: string;
  excerpt?: string;
  image?: string;
  readTime?: string;
  featured?: boolean;
  active?: boolean;
  content?: AdminBlogContentBlock[];
  tags?: string[];
}

/* ── Services (admin-managed since P1.5) ────────────────────────────────── */
export interface AdminServiceProcessStep {
  step: string;
  title: string;
  description: string;
}
export interface AdminServiceBenefit {
  title: string;
  description: string;
}
export interface AdminServiceFaq {
  q: string;
  a: string;
}
export interface AdminService {
  slug: string;
  number: string;
  title: string;
  shortTitle: string;
  tagline: string;
  hero: string;
  intro: string;
  metaTitle: string;
  metaDescription: string;
  overview: { heading: string; body: string };
  process: AdminServiceProcessStep[];
  benefits: AdminServiceBenefit[];
  inclusions: string[];
  faqs: AdminServiceFaq[];
  caseStudy: { client: string; sector: string; result: string };
  /** Slugs of related services */
  related: string[];
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface NewServiceInput {
  title: string;
  slug?: string;
  number?: string;
  shortTitle?: string;
  tagline?: string;
  hero?: string;
  intro?: string;
  metaTitle?: string;
  metaDescription?: string;
  overview?: { heading: string; body: string };
  process?: AdminServiceProcessStep[];
  benefits?: AdminServiceBenefit[];
  inclusions?: string[];
  faqs?: AdminServiceFaq[];
  caseStudy?: { client: string; sector: string; result: string };
  related?: string[];
  active?: boolean;
  sortOrder?: number;
}

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
  | { kind: "stockDelta"; delta: number }
  | { kind: "brand"; brandId: string };

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
  /** Control-center signals — populated from the same source as the KPI strip
   *  (admin_overview in supabase mode; demo computes equivalents from the store). */
  /** Invoices in Issued + Partially paid — the finance-live ledger backlog. */
  outstandingInvoices: number;
  /** Open quotation workload (draft/review/approval/sent/revised). */
  openQuotes: number;
  /** Sum of open-quote totals — pipeline value. */
  pipelineValue: number;
  /** Returns requested but not yet handled. */
  overdueReturns: number;
  /** Pages with a published snapshot on the storefront. */
  publishedPages: number;
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
  /** Legacy storefront hero style (lbpanel parity). Omitted = "standard". */
  heroStyle?: "standard" | "split" | "full-width" | "minimal";
  /** Legacy homepage rails for this category (lbpanel parity). */
  homepageBestSellers?: boolean;
  homepageCarousel?: boolean;
  /** Hero sub-copy / SEO-ish intro line (legacy Short Description). */
  shortDescription?: string;
  /** Hero background image URL or /public path (legacy Background Image). */
  backgroundImage?: string;
  /** Long-form body copy (legacy Long Description). */
  longDescription?: string;
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
  /**
   * Store-level logo shown on every printable document (quotation, invoice,
   * order, purchase order, return, exchange). Data URL (PNG/JPG/WebP/SVG,
   * ≤ 200 KB) — persisted inside the app_settings `store` blob, so no schema
   * change is needed. When set, it outranks a template's own logo.
   */
  storeLogo?: string | null;
  /** Lead assignee roster — drives Leads rows + the Mine / Unassigned filters. Demo-seeded with the sales team. */
  team?: string[];
  /**
   * Offline AI draft replies in the inbox composer ("Suggest reply" — the
   * retrieval-grounded local draft, NOT the hosted model). Defaults to true.
   * The hosted OpenAI-compatible path stays disabled until the owner deploys
   * supabase/functions/ai-agent with AI_AGENT_API_KEY.
   */
  aiOfflineDraftsEnabled?: boolean;
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
  /** Variant SKU (product id + option suffixes) when bought as a configured variant. */
  sku?: string;
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
  /** Cloudflare Turnstile token (supabase mode only — verified by the order-submit EF; demo/bagisto ignore it). */
  cfTurnstileToken?: string;
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
  /** Consent capture (v3 P1): the storefront must present the WOODEX privacy notice before submit. */
  consent?: boolean;
  /** ISO timestamp the customer accepted the notice. */
  consentAt?: string;
  /** Served notice version (see src/lib/consent.ts CONSENT_VERSION). */
  consentVersion?: string;
  landingPath?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /** Cloudflare Turnstile token (supabase mode only — verified by the lead-capture EF; demo/bagisto ignore it). */
  cfTurnstileToken?: string;
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
/** Pages builder (Wave 1) — a builder page stored on the admin side. */
export interface AdminPageContentItem {
  type: string;
  props: Record<string, unknown> & { id?: string };
}
export interface AdminPageDoc {
  root: { props: Record<string, unknown> };
  content: AdminPageContentItem[];
}
export interface AdminPageSeo {
  title?: string;
  description?: string;
  focusKeyphrase?: string;
  /** Pages-builder SEO panel: serve this page with robots noindex (publish gate warns when on). */
  noindex?: boolean;
  /** Pages-builder SEO panel: block publishing until SEO checks pass (default true). */
  strictGate?: boolean;
}
export interface AdminPageHistoryEntry {
  /** Present only on new demo publish revisions; older history cannot safely reconstruct a public snapshot. */
  slug?: string;
  seo?: AdminPageSeo;
  version: number;
  publishedAt: string;
  title: string;
  doc: AdminPageDoc;
}
export interface AdminPage {
  id: string;
  slug: string;
  title: string;
  /** "page" = normal routable builder page; "chrome" = linked master (header/footer/announcement), reserved for Wave 4. */
  kind: "page" | "chrome";
  folderId: string | null;
  status: "draft" | "published";
  doc: AdminPageDoc;
  seo?: AdminPageSeo;
  updatedAt: string;
  publishedAt: string | null;
  version: number;
  history: AdminPageHistoryEntry[];
}
export interface AdminPageFolder {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}
export interface NewPageInput {
  title: string;
  slug?: string;
  folderId?: string | null;
  /** Which seed to start from: the three-block home starter (default) or an empty document. */
  starter?: "starter" | "blank";
  kind?: "page" | "chrome";
}
export interface UpdatePageInput {
  title?: string;
  slug?: string;
  folderId?: string | null;
  doc?: AdminPageDoc;
  seo?: AdminPageSeo;
}
export interface NewPageFolderInput {
  name: string;
  parentId?: string | null;
}
export interface UpdatePageFolderInput {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
}

export interface AdminApi {
  getDashboardStats(): Promise<DashboardStats>;
  getRevenueSeries(days: number): Promise<RevenuePoint[]>;

  listProducts(params?: ListParams & { category?: string; inStock?: boolean; brandId?: string }): Promise<Paginated<AdminProduct>>;
  updateProduct(id: string, patch: Partial<Pick<AdminProduct, "name" | "price" | "compareAtPrice" | "inStock" | "stock" | "isBestSeller" | "stockStatus" | "category" | "dimensions" | "weightKg" | "optionSetIds" | "specs" | "shortDescription" | "description" | "images" | "seriesId" | "image" | "brandId">>): Promise<AdminProduct | undefined>;
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
  listReturns(params?: ListParams & { status?: ReturnStatus | "all" }): Promise<Paginated<AdminReturn>>;
  getReturn(id: string): Promise<AdminReturn | undefined>;
  /** Undefined when the order is missing; throws on non-delivered orders or empty line selection. */
  createReturn(input: NewReturnInput): Promise<AdminReturn | undefined>;
  /** Throws on illegal status transitions and edits to closed returns. */
  updateReturn(id: string, patch: AdminReturnPatch): Promise<AdminReturn | undefined>;
  listExchanges(params?: ListParams & { status?: ExchangeStatus | "all" }): Promise<Paginated<AdminExchange>>;
  getExchange(id: string): Promise<AdminExchange | undefined>;
  /** Undefined when the order is missing; throws on non-delivered orders or empty line selection. */
  createExchange(input: NewExchangeInput): Promise<AdminExchange | undefined>;
  /** Throws on illegal status transitions and edits to closed exchanges. */
  updateExchange(id: string, patch: AdminExchangePatch): Promise<AdminExchange | undefined>;
  listClaims(params?: ListParams & { status?: ClaimStatus | "all"; type?: ClaimType | "all" }): Promise<Paginated<AdminClaim>>;
  getClaim(id: string): Promise<AdminClaim | undefined>;
  createClaim(input: NewClaimInput): Promise<AdminClaim | undefined>;
  /** Throws on illegal status transitions and edits to closed claims. */
  updateClaim(id: string, patch: AdminClaimPatch): Promise<AdminClaim | undefined>;
  listDraftOrders(params?: ListParams & { status?: DraftOrderStatus | "all" }): Promise<Paginated<AdminDraftOrder>>;
  getDraftOrder(id: string): Promise<AdminDraftOrder | undefined>;
  createDraftOrder(input: NewDraftOrderInput): Promise<AdminDraftOrder>;
  /** Throws when the draft is already converted. */
  updateDraftOrder(id: string, patch: AdminDraftOrderPatch): Promise<AdminDraftOrder | undefined>;
  /** False when the draft is missing or already converted. */
  deleteDraftOrder(id: string): Promise<boolean>;
  /**
   * Converts a staff draft into an order via the server-authoritative path: current catalogue
   * reprice by default, zone shipping, single-transaction stock with rollback, idempotent flip
   * (converted + convertedOrderId set atomically). Per-line negotiated prices require an
   * order.manage actor and ride in as explicit `overrides` (audited in order_events).
   */
  convertDraftOrder(id: string, paymentMethod?: PaymentMethod, overrides?: Array<{ line: number; price: number }>): Promise<AdminOrder | undefined>;
  listQuotes(params?: ListParams & { status?: QuoteStatus | "all" }): Promise<Paginated<AdminQuote>>;
  getQuote(id: string): Promise<AdminQuote | undefined>;
  /** Empty-quote drafts are allowed (fill lines later); convert enforces ≥1 line + total > 0. */
  createQuote(input: NewQuoteInput): Promise<AdminQuote>;
  /** Prefills contact details from a CRM lead, links leadId, advances the lead to "quoted". */
  createQuoteFromLead(leadId: string): Promise<AdminQuote | undefined>;
  /** Throws when the quote is already converted. Status patch limited to non-converted statuses. */
  updateQuote(id: string, patch: AdminQuotePatch): Promise<AdminQuote | undefined>;
  /** False when the quote is missing or already converted. */
  deleteQuote(id: string): Promise<boolean>;
  /** Invoices are RPC-gated server-side (quote_invoice_snapshot, invoice_apply_payment). Creation and payment both carry caps; no direct-insert path exists by design. */
  listInvoices(params?: ListParams & { status?: InvoiceStatus | "all"; query?: string }): Promise<Paginated<AdminInvoice>>;
  getInvoice(id: string): Promise<AdminInvoice | undefined>;
  /** Payments for one invoice — finance-only by policy (payments_read); other roles get an empty list. */
  listInvoicePayments(invoiceId: string): Promise<AdminInvoicePayment[]>;
  /** Idempotent: re-calling with the same quote returns the existing invoice (RPC contract). Cap: quote.manage. */
  listTasks(params?: ListParams & { status?: "all" | "open" | "done" }): Promise<Paginated<AdminTask>>;
  createTask(input: NewTaskInput): Promise<AdminTask>;
  /** Cap: crm.manage (RLS). No delete path — tasks are worked, not removed. */
  setTaskDone(id: string, done: boolean): Promise<AdminTask | undefined>;

  convertQuoteToInvoice(quoteId: string): Promise<AdminInvoice>;
  /** Cap: finance.manage (RPC contract). Atomically appends the payment and recomputes Paid/Partially paid/Issued. */
  recordInvoicePayment(invoiceId: string, input: NewInvoicePaymentInput): Promise<AdminInvoice | undefined>;
  /** Requires ≥1 line; same materialisation path as createOrder (channel `manual`); order carries the discount. */
  convertQuote(id: string, paymentMethod?: PaymentMethod): Promise<AdminOrder | undefined>;
  /** Newest first. Empty for quotes saved before the versioning port. */
  listQuoteVersions(id: string): Promise<AdminQuoteVersion[]>;
  /** Rewrites the quote from a frozen version snapshot, bumps the version, action "restore:N". */
  restoreQuoteVersion(id: string, version: number): Promise<AdminQuote | undefined>;
  /** Builtin template replaces-shadows any custom with the same id. */
  listQuoteTemplates(): Promise<AdminQuoteTemplate[]>;
  /** Upsert by id; saving a builtin id clones into a new custom template instead of mutating code. */
  saveQuoteTemplate(template: AdminQuoteTemplate): Promise<AdminQuoteTemplate>;
  /** Builtin templates may not be deleted. */
  deleteQuoteTemplate(id: string): Promise<boolean>;
  listSuppliers(params?: ListParams & { active?: "all" | "active" | "inactive" }): Promise<AdminSupplier[]>;
  createSupplier(input: NewSupplierInput): Promise<AdminSupplier>;
  updateSupplier(id: string, patch: AdminSupplierPatch): Promise<AdminSupplier | undefined>;
  /** False or throw when referenced by purchase orders — deactivate instead. */
  deleteSupplier(id: string): Promise<boolean>;
  listPurchaseOrders(params?: ListParams & { status?: PurchaseOrderStatus | "all" }): Promise<Paginated<AdminPurchaseOrder>>;
  getPurchaseOrder(id: string): Promise<AdminPurchaseOrder | undefined>;
  createPurchaseOrder(input: NewPurchaseOrderInput): Promise<AdminPurchaseOrder>;
  /** Draft POs only — throws once the PO has been sent. */
  updatePurchaseOrder(id: string, patch: AdminPurchaseOrderPatch): Promise<AdminPurchaseOrder | undefined>;
  /** draft → sent · draft|sent → cancelled (only while nothing has been received). */
  setPurchaseOrderStatus(id: string, status: "sent" | "cancelled"): Promise<AdminPurchaseOrder | undefined>;
  /** Applies a (partial) receipt — inbound stock movements for catalogue lines; auto-advances status. */
  receivePurchaseOrder(id: string, receipts: PurchaseOrderReceipt[]): Promise<AdminPurchaseOrder | undefined>;
  /** Draft POs only. */
  deletePurchaseOrder(id: string): Promise<boolean>;
  /** Warehouse + active showrooms — the transfer location picker. */
  getTransferLocations(): Promise<TransferLocation[]>;
  listStockTransfers(params?: ListParams & { status?: TransferStatus | "all" }): Promise<Paginated<AdminStockTransfer>>;
  getStockTransfer(id: string): Promise<AdminStockTransfer | undefined>;
  createStockTransfer(input: NewStockTransferInput): Promise<AdminStockTransfer>;
  /** Draft transfers only — throws once dispatched. */
  updateStockTransfer(id: string, patch: AdminStockTransferPatch): Promise<AdminStockTransfer | undefined>;
  /** draft → in_transit; validates on-hand stock and writes OUT transfer legs. */
  dispatchStockTransfer(id: string): Promise<AdminStockTransfer | undefined>;
  /** Applies (partial) receipt — writes IN transfer legs; completes to received. */
  receiveStockTransfer(id: string, receipts: StockTransferReceipt[]): Promise<AdminStockTransfer | undefined>;
  /** Draft transfers only. */
  deleteStockTransfer(id: string): Promise<boolean>;
  /** Option set master — Finish / Fabric / Size and the like. */
  listOptionSets(): Promise<AdminOptionSet[]>;
  createOptionSet(input: NewOptionSetInput): Promise<AdminOptionSet>;
  /** Name and values replaced atomically on update. */
  updateOptionSet(id: string, patch: AdminOptionSetPatch): Promise<AdminOptionSet | undefined>;
  /** Refused while any product references the set. */
  deleteOptionSet(id: string): Promise<boolean>;

  listCustomers(params?: ListParams & { type?: "all" | "retail" | "business" }): Promise<Paginated<AdminCustomer>>;
  getCustomer(id: string): Promise<AdminCustomer | undefined>;

  /** CRM identity — merge review queue. Nothing here auto-merges. */
  listClients(params?: { includeMerged?: boolean }): Promise<AdminClient[]>;
  listMergeCandidates(): Promise<MergeCandidate[]>;
  mergeClients(intoId: string, fromId: string): Promise<AdminClient>;
  /** Set an explicit category (owner retag). Hosted adapters reject until the clients.category column ships (owner-gated migration). */
  updateClientCategory(id: string, category: ClientCategory): Promise<AdminClient | undefined>;
  /** Cross-entity reference counts per client id (lead/quote/invoice/order/project). Hosted-supabase computes from client_links only; Bagisto returns {}. */
  listClientCrossRefs(): Promise<Record<string, ClientCrossRefs>>;

  /** CRM site visits — scheduling + outcome tracking against leads (0001 site_visits). */
  listSiteVisits(leadId?: string): Promise<AdminSiteVisit[]>;
  createSiteVisit(input: NewSiteVisitInput): Promise<AdminSiteVisit>;
  updateSiteVisitStatus(id: string, patch: SiteVisitPatch): Promise<AdminSiteVisit | undefined>;

  listLeads(params?: ListParams & { type?: LeadType | "all"; status?: LeadStatus | "all"; assignee?: string; unassigned?: boolean; staleDays?: number }): Promise<Paginated<AdminLead>>;
  updateLeadStatus(id: string, status: LeadStatus): Promise<AdminLead | undefined>;
  /** Patch CRM parity fields (V4 P3). */
  updateLead(id: string, patch: AdminLeadPatch): Promise<AdminLead | undefined>;
  /** Bulk import (Lead 2026 parity). Demo-authoritative; hosted adapters reject rows with a reason (owner-gated programme). */
  importLeads(input: LeadImportInput): Promise<LeadImportResult>;

  /** Live chat (V4 P0) — storefront bubble + inbox. Demo adapter is authoritative; hosted adapters are stubs this phase. */
  listChatConversations(params?: { status?: ChatStatus | "all"; query?: string; unreadOnly?: boolean }): Promise<ChatConversation[]>;
  getChatConversation(id: string): Promise<{ conversation: ChatConversation; messages: ChatMessage[] } | undefined>;
  /** Storefront-side: append a visitor message (creates the thread on first send). Path is recorded as `page`. */
  postChatVisitorMessage(conversationId: string | undefined, input: { body: string; visitorName?: string; visitorPhone?: string; page?: string }): Promise<{ conversation: ChatConversation; message: ChatMessage }>;
  /** Agent-side reply; optionally closes the thread in the same write. */
  postChatAgentMessage(conversationId: string, body: string, opts?: { close?: boolean }): Promise<ChatMessage | undefined>;
  /** Offline capture → creates the thread + a lead with consent; returns both refs. */
  captureChatOffline(input: { name: string; phone: string; message: string; consent: boolean; consentVersion?: string; page?: string; cfTurnstileToken?: string }): Promise<{ conversation: ChatConversation; leadId: string; submissionOutcome?: LeadSubmissionOutcome }>;
  /** Agent opened the thread — clears agent-side unread. */
  markChatRead(conversationId: string): Promise<ChatConversation | undefined>;
  /** Close or reopen a thread (agent action). */
  setChatStatus(conversationId: string, status: ChatStatus): Promise<ChatConversation | undefined>;
  /** Open + unread badge count for the admin sidebar. */
  countOpenChats(): Promise<number>;
  getChatMode(): Promise<ChatMode>;
  setChatMode(mode: ChatMode): Promise<ChatMode>;

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
  /** Furniture Series — managed taxonomy shared with /series/:seriesId (static master until Bagisto). */
  listSeries(): Promise<AdminSeries[]>;
  createSeries(input: NewSeriesInput): Promise<AdminSeries>;
  updateSeries(id: string, patch: Partial<NewSeriesInput>): Promise<AdminSeries | undefined>;
  setSeriesActive(id: string, active: boolean): Promise<AdminSeries | undefined>;
  deleteSeries(id: string): Promise<boolean>;
  /** Product brands — Woodex today; managed for future partner brands. */
  listBrands(): Promise<AdminBrand[]>;
  createBrand(input: NewBrandInput): Promise<AdminBrand>;
  updateBrand(id: string, patch: Partial<NewBrandInput>): Promise<AdminBrand | undefined>;
  setBrandActive(id: string, active: boolean): Promise<AdminBrand | undefined>;
  deleteBrand(id: string): Promise<boolean>;
  /** Homepage Best Sellers rail + Home Carousel — mode (auto vs manual) and manual order. */
  getHomepageSections(): Promise<AdminHomepageSections>;
  updateHomepageSections(patch: Partial<AdminHomepageSections>): Promise<AdminHomepageSections>;
  getWarrantyPage(): Promise<AdminWarrantyPage>;
  updateWarrantyPage(content: AdminWarrantyPage): Promise<AdminWarrantyPage>;
  resetWarrantyPage(): Promise<AdminWarrantyPage>;
  getCustomDesignPage(): Promise<AdminCustomDesignPage>;
  updateCustomDesignPage(content: AdminCustomDesignPage): Promise<AdminCustomDesignPage>;
  resetCustomDesignPage(): Promise<AdminCustomDesignPage>;
  getVirtualShowroomPage(): Promise<AdminVirtualShowroomPage>;
  updateVirtualShowroomPage(content: AdminVirtualShowroomPage): Promise<AdminVirtualShowroomPage>;
  resetVirtualShowroomPage(): Promise<AdminVirtualShowroomPage>;
  /** Pages builder (Wave 1) — demo-DB pages slice; documents are Puck-shaped JSON. */
  listPages(kind?: "page" | "chrome"): Promise<AdminPage[]>;
  getPage(idOrSlug: string): Promise<AdminPage | undefined>;
  createPage(input: NewPageInput): Promise<AdminPage>;
  updatePage(id: string, patch: UpdatePageInput): Promise<AdminPage | undefined>;
  publishPage(id: string): Promise<AdminPage | undefined>;
  unpublishPage(id: string): Promise<AdminPage | undefined>;
  duplicatePage(id: string): Promise<AdminPage | undefined>;
  deletePage(id: string): Promise<boolean>;
  revertPage(id: string, version: number): Promise<AdminPage | undefined>;
  listPageFolders(): Promise<AdminPageFolder[]>;
  createPageFolder(input: NewPageFolderInput): Promise<AdminPageFolder>;
  updatePageFolder(id: string, patch: UpdatePageFolderInput): Promise<AdminPageFolder | undefined>;
  deletePageFolder(id: string): Promise<boolean>;
  listMaterials(): Promise<AdminMaterial[]>;
  createMaterial(input: NewMaterialInput): Promise<AdminMaterial>;
  updateMaterial(id: string, patch: Partial<NewMaterialInput>): Promise<AdminMaterial | undefined>;
  setMaterialActive(id: string, active: boolean): Promise<AdminMaterial | undefined>;
  deleteMaterial(id: string): Promise<boolean>;
  listProjects(): Promise<AdminProject[]>;
  createProject(input: NewProjectInput): Promise<AdminProject>;
  updateProject(id: string, patch: Partial<NewProjectInput>): Promise<AdminProject | undefined>;
  /**
   * Practice save with a revision check (migration 00022 candidate in Supabase mode;
   * demo mirrors the same conflict rule). QC fields are owned by recorded
   * inspections, so the server overrides the draft's qc block.
   */
  saveProjectPractice(id: string, practice: ProjectPractice, expectedRevision?: number): Promise<AdminProject | undefined>;
  /** Link a production job to an order (candidate 00024). One order → one job. */
  linkProjectOrder(projectId: string, orderId: string): Promise<{ projectId: string; orderId: string; alreadyLinked: boolean }>;
  /** Remove the link; the production/QC history is kept. */
  unlinkProjectOrder(projectId: string, reason?: string): Promise<{ projectId: string; previousOrderId: string }>;
  /** Which job (if any) is building this order. */
  getOrderProduction(orderId: string): Promise<OrderProduction | undefined>;
  /** Delivery/installation records and the warranty (candidate 00025). */
  getProjectPostDispatch(projectId: string): Promise<ProjectPostDispatch>;
  recordProjectHandover(input: { projectId: string; kind: ProjectHandoverKind; happenedOn: string; lead?: string; notes?: string; signedBy?: string }): Promise<ProjectHandover>;
  openProjectWarranty(input: { projectId: string; months: number; coverage?: string; exclusions?: string }): Promise<ProjectWarranty>;
  cancelProjectWarranty(input: { projectId: string; reason?: string }): Promise<ProjectWarranty>;
  /** Warranty claims (candidate 00026) — only against a live warranty. */
  listProjectWarrantyClaims(projectId: string): Promise<ProjectWarrantyClaim[]>;
  /** Warranty register: jobs with a warranty or a claim, derived state and counts. */
  listWarrantyRegister(daysAhead?: number): Promise<WarrantyRegisterRow[]>;
  openProjectWarrantyClaim(input: { projectId: string; summary: string; details?: string; openedOn?: string }): Promise<ProjectWarrantyClaim>;
  updateProjectWarrantyClaim(input: { claimId: string; status: "scheduled" | "resolved" | "rejected"; resolution?: string }): Promise<ProjectWarrantyClaim>;
  listProjectQcInspections(projectId: string): Promise<ProjectQcInspection[]>;
  /** Records an identity-stamped inspection and derives the job's QC result. */
  recordProjectQcInspection(input: { projectId: string; result: "passed" | "failed"; notes?: string }): Promise<{ inspection: ProjectQcInspection; project: AdminProject | undefined }>;
  listProjectProductionEvents(projectId: string): Promise<ProjectProductionEvent[]>;
  setProjectActive(id: string, active: boolean): Promise<AdminProject | undefined>;
  deleteProject(id: string): Promise<boolean>;
  /** Cost-code master per project (migration 0013). Writes require crm.manage. */
  listProjectCostCodes(projectId: string): Promise<ProjectCostCode[]>;
  upsertProjectCostCode(input: { projectId: string; code: string; boqSection?: string | null; description?: string }): Promise<ProjectCostCode>;
  /** Fails when actuals reference the code (FK RESTRICT) — caller surfaces the message. */
  deleteProjectCostCode(projectId: string, code: string): Promise<boolean>;
  /** Actual-cost ledger per project (migration 0013). Finance may read, never write. */
  listProjectActuals(projectId: string): Promise<ProjectActualLine[]>;
  addProjectActual(input: { projectId: string; costCode: string; description: string; qty: number; unit: string; rate: number; source: ProjectActualSource; poRef?: string | null; incurredOn?: string; note?: string }): Promise<ProjectActualLine>;
  updateProjectActual(id: number, projectId: string, patch: Partial<Pick<ProjectActualLine, "costCode" | "description" | "qty" | "unit" | "rate" | "source" | "poRef" | "incurredOn" | "note">>): Promise<ProjectActualLine | undefined>;
  deleteProjectActual(id: number, projectId: string): Promise<boolean>;
  /**
   * Uploads a file into the job's storage bucket (supabase mode, migration 0014).
   * Object name: `<projectId>/<timestamp>-<sanitized-name>`. Demo/Bagisto reject with
   * an explanatory error (demo keeps simulated metadata-only uploads).
   */
  uploadProjectFile(projectId: string, fileName: string, bytes: ArrayBuffer, contentType: string): Promise<ProjectFileItem>;
  /**
   * Signed download URL (2-minute TTL) for a file stored in the private projects bucket (0014).
   * Throws a descriptive error when the path/bucket is unavailable (e.g. bucket not applied yet).
   */
  getProjectFileDownloadUrl(storagePath: string): Promise<string>;
  listBlogPosts(): Promise<AdminBlogPost[]>;
  createBlogPost(input: NewBlogPostInput): Promise<AdminBlogPost>;
  updateBlogPost(id: string, patch: Partial<NewBlogPostInput>): Promise<AdminBlogPost | undefined>;
  setBlogPostActive(id: string, active: boolean): Promise<AdminBlogPost | undefined>;
  deleteBlogPost(id: string): Promise<boolean>;
  listServices(): Promise<AdminService[]>;
  createService(input: NewServiceInput): Promise<AdminService>;
  updateService(slug: string, patch: Partial<NewServiceInput>): Promise<AdminService | undefined>;
  setServiceActive(slug: string, active: boolean): Promise<AdminService | undefined>;
  deleteService(slug: string): Promise<boolean>;

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
    patch: Partial<Pick<AdminCategory,
      | "name" | "group" | "visible" | "parentId" | "sortOrder"
      | "heroStyle" | "homepageBestSellers" | "homepageCarousel"
      | "shortDescription" | "backgroundImage" | "longDescription">>,
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
