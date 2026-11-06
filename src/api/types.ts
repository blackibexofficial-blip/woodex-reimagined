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
export type StockMovementType = "inbound" | "outbound" | "return" | "damage" | "adjustment" | "transfer";

export interface AdminOrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  /** Variant SKU (product id + option suffixes) when bought as a configured variant. */
  sku?: string;
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
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "converted";
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
  createdAt: string;
  updatedAt: string;
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
}
export type AdminQuotePatch = Partial<NewQuoteInput> & { status?: QuoteStatus };

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

/* ── Projects / case studies (admin-managed since P1.3) ─────────────────── */
export interface AdminProject {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface NewProjectInput {
  title: string;
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
}
export interface AdminPageHistoryEntry {
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
  /** Same materialisation path as createOrder; sets the draft to converted with convertedOrderId. */
  convertDraftOrder(id: string, paymentMethod?: PaymentMethod): Promise<AdminOrder | undefined>;
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
  /** Requires ≥1 line; same materialisation path as createOrder (channel `manual`); order carries the discount. */
  convertQuote(id: string, paymentMethod?: PaymentMethod): Promise<AdminOrder | undefined>;
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
  setProjectActive(id: string, active: boolean): Promise<AdminProject | undefined>;
  deleteProject(id: string): Promise<boolean>;
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
