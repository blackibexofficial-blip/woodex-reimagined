/**
 * WOODEX demo database — seeded from the real storefront catalogue and persisted to
 * localStorage so the /admin preview is fully interactive (edits survive reloads).
 *
 * This is the `demo` adapter behind AdminApi. When VITE_API_MODE=bagisto the same
 * interface is served by src/api/bagisto/* instead — no UI changes required.
 */
import { idbDeleteMany, idbGetAll, idbPutMany } from "@/api/demo/mediaStore";
import { products, categoryGroups } from "@/data/products";
import { optionSetIdsFor, OPTION_SETS } from "@/data/options";
import { materials as finishSeed } from "@/data/materials";
import { pageSwatchSeed } from "@/data/materialsPage";
import { projectsDisplay as projectSeed } from "@/data/projects";
import { blogPosts as blogSeed } from "@/data/blogPosts";
import { services as serviceSeed } from "@/data/services";
import { warrantyPageSeed } from "@/data/warrantyPage";
import { customDesignPageSeed } from "@/data/customDesignPage";
import { virtualShowroomPageSeed } from "@/data/virtualShowroomPage";
import { buildSeedPages, buildSeedPageFolders, blankPageDoc, starterPageDoc } from "@/data/pages";
import type {
  AdminApi,
  AdminCategory,
  AdminDeliveryZone,
  AdminInventoryItem,
  AdminCustomer,
  AdminLead,
  AdminCollection,
  AdminCollectionRule,
  AdminMediaAsset,
  AdminCompany,
  AdminOrder,
  AdminOrderEvent,
  AdminOrderItem,
  AdminStockMovement,
  StockMovementType,
  AdminPriceList,
  AdminProduct,
  DashboardStats,
  ListParams,
  NewAdminProductInput,
  ProductImportResult,
  ProductImportRow,
  NewLeadInput,
  NewAdminCollectionInput,
  NewOrderInput,
  NewAdminPriceListInput,
  PriceListStatus,
  AdminBundle,
  NewAdminBundleInput,
  BundleStatus,
  AdminSalesChannel,
  NewSalesChannelInput,
  SalesChannelKind,
  AdminShowroom,
  AdminSeries,
  NewSeriesInput,
  AdminBrand,
  NewBrandInput,
  AdminHomepageSections,
  AdminWarrantyPage,
  AdminCustomDesignPage,
  AdminVirtualShowroomPage,
  AdminPage,
  AdminPageFolder,
  NewPageInput,
  UpdatePageInput,
  NewPageFolderInput,
  UpdatePageFolderInput,
  NewShowroomInput,
  AdminMaterial,
  NewMaterialInput,
  AdminProject,
  NewProjectInput,
  AdminBlogPost,
  NewBlogPostInput,
  AdminService,
  NewServiceInput,
  AdminReturn,
  AdminReturnItem,
  AdminReturnPatch,
  NewReturnInput,
  ReturnReason,
  ReturnStatus,
  AdminExchange,
  AdminExchangeItem,
  AdminExchangePatch,
  NewExchangeInput,
  ExchangeStatus,
  AdminClaim,
  AdminClaimPatch,
  NewClaimInput,
  ClaimType,
  ClaimStatus,
  AdminDraftOrder,
  AdminDraftOrderPatch,
  NewDraftOrderInput,
  NewDraftOrderLineInput,
  DraftOrderStatus,
  AdminQuote,
  AdminQuotePatch,
  NewQuoteInput,
  QuoteStatus,
  AdminSupplier,
  AdminSupplierPatch,
  NewSupplierInput,
  AdminPurchaseOrder,
  AdminPurchaseOrderLine,
  AdminPurchaseOrderPatch,
  NewPurchaseOrderInput,
  NewPurchaseOrderLineInput,
  PurchaseOrderReceipt,
  PurchaseOrderStatus,
  AdminStockTransfer,
  AdminStockTransferPatch,
  NewStockTransferInput,
  NewStockTransferLineInput,
  StockTransferReceipt,
  TransferStatus,
  TransferLocation,
  AdminTransferLine,
  AdminOptionSet,
  AdminOptionValue,
  AdminOptionValueInput,
  NewOptionSetInput,
  AdminOptionSetPatch,
  OrderStatus,
  PaymentMethod,
  RevenuePoint,
  StoreSettings,
} from "@/api/types";

const DB_KEY = "woodex.admin.db.v1";

interface DemoDb {
  products: AdminProduct[];
  orders: AdminOrder[];
  customers: AdminCustomer[];
  leads: AdminLead[];
  settings: StoreSettings;
  inventoryMeta: Record<string, { lowStockThreshold: number; location: string; lastUpdated: string }>;
  movements: AdminStockMovement[];
  zones: AdminDeliveryZone[];
  categories: AdminCategory[];
  media: AdminMediaAsset[];
  orderEvents: AdminOrderEvent[];
  collections: AdminCollection[];
  companies: AdminCompany[];
  priceLists: AdminPriceList[];
  bundles: AdminBundle[];
  salesChannels: AdminSalesChannel[];
  showrooms: AdminShowroom[];
  series: AdminSeries[];
  brands: AdminBrand[];
  homepageSections: AdminHomepageSections;
  warrantyPage: AdminWarrantyPage;
  customDesignPage: AdminCustomDesignPage;
  virtualShowroomPage: AdminVirtualShowroomPage;
  pages: AdminPage[];
  pageFolders: AdminPageFolder[];
  materials: AdminMaterial[];
  projects: AdminProject[];
  blogPosts: AdminBlogPost[];
  services: AdminService[];
  returns: AdminReturn[];
  exchanges: AdminExchange[];
  claims: AdminClaim[];
  draftOrders: AdminDraftOrder[];
  quotes: AdminQuote[];
  suppliers: AdminSupplier[];
  purchaseOrders: AdminPurchaseOrder[];
  stockTransfers: AdminStockTransfer[];
  optionSets: AdminOptionSet[];
}

/* ── deterministic RNG so every fresh session seeds identically ─────────── */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rand: () => number, arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const hashString = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const CITIES = ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan"] as const;
const FIRST = ["Ahmed", "Hassan", "Bilal", "Usman", "Zainab", "Ayesha", "Fatima", "Sara", "Owais", "Hira", "Danish", "Mahnoor"] as const;
const LAST = ["Khan", "Sheikh", "Malik", "Raza", "Hussain", "Siddiqui", "Qureshi", "Chaudhry", "Butt", "Mirza"] as const;
const BUSINESSES: Array<{ company: string; name: string; email: string; phone: string; city: string }> = [
  { company: "Alpha Textiles Pvt Ltd", name: "Imran Sheikh", email: "procurement@alphatextiles.pk", phone: "+92 321 4567890", city: "Faisalabad" },
  { company: "Crescent Logistics", name: "Mariam Chaudhry", email: "admin@crescentlogistics.pk", phone: "+92 333 7654321", city: "Karachi" },
  { company: "Ravi Agro Foods", name: "Kashif Mirza", email: "ops@raviagrofoods.pk", phone: "+92 300 9988776", city: "Multan" },
  { company: "Indus Developers", name: "Sana Malik", email: "projects@indusdevelopers.pk", phone: "+92 345 1122334", city: "Lahore" },
  { company: "Nawaab Group of Companies", name: "Omar Qureshi", email: "facilities@nawaabgroup.pk", phone: "+92 312 5566778", city: "Islamabad" },
];

const DEFAULT_SETTINGS: StoreSettings = {
  storeName: "WOODEX",
  tagline: "Premium Office & Home Furniture",
  phone: "+92 300 1234567",
  whatsapp: "+92 300 1234567",
  email: "hello@woodex.pk",
  address: "Showroom & Factory, 12-km Sheikh Zayed Road",
  city: "Lahore",
  currency: "PKR",
  deliveryNote: "Free delivery inside city limits on orders above Rs 150,000. 3–5 working days anywhere in Pakistan.",
  taxRate: 0,
};

const stripGlyph = (s: string) => s.replace(/^[↳▸»-]\s*/, "").trim();

/** Parent (product-facing) category ids that live outside `categoryGroups` subcategories. */
const PARENT_CATEGORY_NAMES: Record<string, { name: string; group: "office" | "home" }> = {
  "office-tables": { name: "Office Tables", group: "office" },
  chairs: { name: "Office Chairs", group: "office" },
  workstations: { name: "Workstations", group: "office" },
  "office-sofas": { name: "Office Sofas", group: "office" },
  storage: { name: "Office Storage", group: "office" },
  cafe: { name: "Cafe Furniture", group: "office" },
  public: { name: "Public Sitting", group: "office" },
  "home-office": { name: "Home Office", group: "office" },
  acoustic: { name: "Acoustic Furniture", group: "office" },
  collaborative: { name: "Collaborative Furniture", group: "office" },
  bedroom: { name: "Bedroom Furniture", group: "home" },
  living: { name: "Living Room", group: "home" },
  dining: { name: "Dining Furniture", group: "home" },
};

function buildSeedCategories(): AdminCategory[] {
  const usedIds = new Set<string>();
  for (const p of products) {
    usedIds.add(p.category);
    const sub = (p as { subcategory?: string }).subcategory;
    if (sub) usedIds.add(sub);
  }
  const map = new Map<string, AdminCategory>();
  const groupOf = (g: string) => (g === "home" ? ("home" as const) : ("office" as const));
  let i = 0;
  const push = (id: string, name: string, group: AdminCategory["group"]) => {
    map.set(id, {
      id,
      name: stripGlyph(name),
      group,
      visible: true,
      sortOrder: i,
      createdAt: new Date(Date.now() - (i + 15) * 86400000).toISOString(),
    });
    i++;
  };
  // pass 1 — storefront subcategories (leaves)
  for (const group of categoryGroups) {
    for (const sub of group.subcategories) push(sub.id, sub.name, groupOf(group.id));
  }
  // pass 2 — product-facing parents; on a NAME collision (nav aliases like "office-storage"
  // vs "storage") resolve in favour of the id products actually use.
  for (const [id, meta] of Object.entries(PARENT_CATEGORY_NAMES)) {
    if (map.has(id)) continue;
    const collision = [...map.values()].find((c) => c.name.toLowerCase() === meta.name.toLowerCase());
    if (collision) {
      if (usedIds.has(id) && !usedIds.has(collision.id)) {
        map.delete(collision.id);
        push(id, meta.name, meta.group);
      }
      continue;
    }
    push(id, meta.name, meta.group);
  }
  return [...map.values()];
}

function buildSeedMedia(): AdminMediaAsset[] {
  const seen = new Set<string>();
  const out: AdminMediaAsset[] = [];
  for (const p of products) {
    for (const img of p.images) {
      if (seen.has(img)) continue;
      seen.add(img);
      const h = Math.abs(hashString(img));
      out.push({
        id: `med-${h.toString(36)}`,
        name: `${String(p.id).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${out.length + 1}.webp`,
        url: img,
        mime: "image/jpeg",
        size: 140_000 + (h % 340_000), // approx. bytes — seeded catalogue imagery
        createdAt: new Date(Date.now() - ((h % 170) + 10) * 86400000).toISOString(),
      });
      if (out.length >= 14) return out;
    }
  }
  return out;
}

/* ── inventory seeds ────────────────────────────────────────────────────── */
/** Deterministic per-product thresholds / locations (stable across fresh seeds). */
function buildInventoryMeta(adminProducts: AdminProduct[]): DemoDb["inventoryMeta"] {
  const meta: DemoDb["inventoryMeta"] = {};
  for (const p of adminProducts) {
    meta[p.id] = {
      lowStockThreshold: 6 + (hashString(p.id) % 10), // 6–15 units
      location: hashString(`${p.id}#loc`) % 4 === 0 ? "Showroom Floor — Lahore" : "Main Warehouse — Lahore",
      lastUpdated: new Date(Date.now() - ((hashString(`${p.id}#upd`) % 45) + 2) * 86400000).toISOString(),
    };
  }
  return meta;
}

const defaultInventoryMeta = (id: string) => ({
  lowStockThreshold: 6 + (hashString(id) % 10),
  location: hashString(`${id}#loc`) % 4 === 0 ? "Showroom Floor — Lahore" : "Main Warehouse — Lahore",
  lastUpdated: new Date().toISOString(),
});

/** 3 default delivery zones — base / express / same-day costs + COD (owner-requested rates). */
function buildSeedZones(): AdminDeliveryZone[] {
  const created = new Date(Date.now() - 120 * 86400000).toISOString();
  const mk = (id: string, zoneName: string, city: string, postalCodes: string[]): AdminDeliveryZone => ({
    id, zoneName, city, postalCodes,
    standardCost: 2000, expressCost: 5000, sameDayCost: 8000,
    standardDays: 3, expressDays: 1,
    codAvailable: true, isActive: true,
    createdAt: created, updatedAt: created,
  });
  return [
    mk("zone-lahore", "Lahore City", "Lahore", ["54000", "54590", "54660", "54772", "54900"]),
    mk("zone-isb-rwp", "Islamabad & Rawalpindi", "Islamabad", ["44000", "44010", "44030", "44150", "46000"]),
    mk("zone-karachi", "Karachi City", "Karachi", ["74000", "74200", "74400", "74800", "75600"]),
  ];
}

function buildSeedMovements(adminProducts: AdminProduct[]): AdminStockMovement[] {
  const rand = mulberry32(77077);
  const out: AdminStockMovement[] = [];
  const note: Record<StockMovementType, string> = {
    inbound: "Goods received from factory batch",
    outbound: "Dispatch for order fulfilment",
    return: "Customer return restocked",
    damage: "Damaged on the floor — written off",
    adjustment: "Cycle count correction",
    transfer: "Stock transfer between locations",
  };
  for (let i = 0; i < 16; i++) {
    const p = adminProducts[Math.floor(rand() * adminProducts.length)];
    const type = pick(rand, ["inbound", "inbound", "outbound", "outbound", "outbound", "return", "damage", "adjustment"] as const);
    const magnitude = type === "inbound" ? 10 + Math.floor(rand() * 40) : type === "outbound" ? 1 + Math.floor(rand() * 6) : 1 + Math.floor(rand() * 2);
    const signed = type === "inbound" || type === "return" ? magnitude : type === "adjustment" ? (rand() < 0.5 ? -magnitude : magnitude) : -magnitude;
    out.push({
      id: `mov-seed-${i + 1}`,
      productId: p.id,
      productName: p.name,
      productSku: p.sku,
      type,
      quantity: signed,
      notes: note[type],
      createdAt: new Date(Date.now() - Math.floor(rand() * 30) * 86400000 - Math.floor(rand() * 20) * 3600000).toISOString(),
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const MEDIA_MIGRATED_KEY = "woodex.media.migrated.v1";
const PAGES_HOME_V2_KEY = "woodex.pages.home-v2";

/**
 * One-time migration: catalogue seed assets + any legacy localStorage uploads
 * are copied into IndexedDB. Runs lazily on first media access.
 */
async function ensureMediaSeeded() {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem(MEDIA_MIGRATED_KEY) === "1") return;
    const db = loadDb();
    const merged = new Map<string, AdminMediaAsset>();
    for (const a of buildSeedMedia()) merged.set(a.id, a);          // catalogue imagery (static paths)
    for (const a of db.media ?? []) merged.set(a.id, a);            // legacy uploads (data: URLs) — win on id collision
    await idbPutMany([...merged.values()]);
    if (typeof localStorage !== "undefined") localStorage.setItem(MEDIA_MIGRATED_KEY, "1");
  } catch {
    /* private mode / IDB unavailable — media simply stays empty but nothing crashes */
  }
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "category";

function buildSeedCompanies(): AdminCompany[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  const mk = (id: string, name: string, contactName: string, email: string, phone: string, city: string, createdAt: string): AdminCompany =>
    ({ id, name, contactName, email, phone, city, createdAt });
  return [
    mk("co-indus-developers", "Indus Developers", "Sana Malik", "projects@indusdevelopers.pk", "+92 345 1122334", "Lahore", iso(210)),
    mk("co-nawaab-group", "Nawaab Group of Companies", "Omar Qureshi", "facilities@nawaabgroup.pk", "+92 312 5566778", "Islamabad", iso(300)),
    mk("co-meridian-builders", "Meridian Builders", "Hira Shahid", "procurement@meridianbuilders.pk", "+92 300 7788123", "Karachi", iso(180)),
    mk("co-pearl-corporation", "Pearl Corporation", "Bilal Anwar", "admin@pearlcorp.pk", "+92 321 4455667", "Lahore", iso(150)),
    mk("co-al-noor", "Al Noor Textiles", "Kashif Raza", "accounts@alnoortextiles.pk", "+92 333 9088776", "Faisalabad", iso(120)),
    mk("co-frontier-holdings", "Frontier Holdings", "Ayesha Siddiqui", "projects@frontierholdings.pk", "+92 345 6601123", "Peshawar", iso(90)),
    mk("co-citymount-properties", "CityMount Properties", "Usman Tariq", "ops@citymountproperties.pk", "+92 309 2233445", "Multan", iso(60)),
    mk("co-skyline-ventures", "Skyline Ventures", "Maham Javed", "hello@skylineventures.pk", "+92 317 8899001", "Islamabad", iso(30)),
  ];
}

function buildSeedBundles(): AdminBundle[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  const mk = (
    id: string, name: string, description: string, image: string,
    lines: AdminBundle["lines"], discountPct: number, popular: boolean, sortOrder: number,
    status: BundleStatus, daysAgo: number,
  ): AdminBundle => ({ id, name, description, image, lines, discountPct, popular, sortOrder, status, createdAt: iso(daysAgo), updatedAt: iso(daysAgo) });
  return [
    mk("bun-executive-office", "Executive Office Package", "Everything a C-suite office needs — coordinated desk, flagship chair and storage, one coordinated quote.", "desk", [
      { productId: "sovereign-executive-desk", quantity: 1 },
      { productId: "crown-leather-executive-chair", quantity: 1 },
      { productId: "file-4-steel-cabinet", quantity: 1 },
      { productId: "link-visitor-chair-chrome", quantity: 2 },
    ], 10, false, 10, "active", 120),
    mk("bun-team-workspace", "Team Workspace Package", "Complete four-person benching setup — workstations, task chairs and pedestals, ready to plug in.", "workstation", [
      { productId: "bench-4-open-workstation", quantity: 1 },
      { productId: "core-staff-task-chair", quantity: 4 },
      { productId: "mobile-3-pedestal", quantity: 4 },
    ], 10, true, 20, "active", 110),
    mk("bun-meeting-room", "Meeting Room Package", "A boardroom that commands the room — conference table, seating and credenza in one quote.", "meeting", [
      { productId: "connect-8-conference-table", quantity: 1 },
      { productId: "nexus-conference-chair", quantity: 8 },
      { productId: "credenza-72", quantity: 1 },
    ], 8, false, 30, "active", 100),
    mk("bun-startup", "Startup Bundle", "Launch your office from day one — six-person benching, chairs, storage and a reception counter.", "office", [
      { productId: "bench-6-open-workstation", quantity: 1 },
      { productId: "core-staff-task-chair", quantity: 6 },
      { productId: "mobile-3-pedestal", quantity: 3 },
      { productId: "first-linear-reception", quantity: 1 },
    ], 7, false, 40, "active", 90),
    mk("bun-managers-suite", "Manager's Suite", "A private office that projects leadership — desk, high-back seating, bookshelf and six-seat meeting table.", "chair", [
      { productId: "sovereign-executive-desk", quantity: 1 },
      { productId: "stride-manager-chair", quantity: 1 },
      { productId: "bookshelf-glass-5-tier", quantity: 1 },
      { productId: "connect-6-meeting-table", quantity: 1 },
    ], 12, false, 50, "active", 80),
    mk("bun-open-office", "Open Office Package", "Full open-plan setup with breakout seating — drafted by the merchandising team for review.", "sofa", [
      { productId: "bench-4-open-workstation", quantity: 2 },
      { productId: "core-staff-task-chair", quantity: 8 },
      { productId: "locker-6-personal", quantity: 2 },
      { productId: "marvel-3-seater-sofa", quantity: 1 },
    ], 12, false, 60, "draft", 10),
  ];
}

function buildSeedSalesChannels(): AdminSalesChannel[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  const mk = (id: string, name: string, kind: SalesChannelKind, description: string, sortOrder: number, daysAgo: number): AdminSalesChannel =>
    ({ id, name, kind, description, enabled: true, sortOrder, createdAt: iso(daysAgo), updatedAt: iso(daysAgo) });
  return [
    mk("ch-web", "Online Store", "web", "woodex.pk — every storefront order is attributed here.", 10, 200),
    mk("ch-whatsapp", "WhatsApp", "whatsapp", "Orders taken over WhatsApp chat by the sales desk.", 20, 180),
    mk("ch-instagram", "Instagram", "instagram", "Instagram DMs and Shop checkouts.", 30, 160),
    mk("ch-phone", "Phone / Call Centre", "phone", "Phone orders keyed in by the support desk.", 40, 150),
    mk("ch-showroom", "Showroom Walk-in", "showroom", "Walk-in purchases at physical showrooms, entered by staff.", 50, 140),
    mk("ch-b2b", "B2B / Projects", "b2b", "Corporate and project contracts (fit-outs, CP&Q).", 60, 130),
  ];
}

function buildSeedMaterials(): AdminMaterial[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const finishes: AdminMaterial[] = finishSeed.map((m, i) => ({
    id: m.id,
    name: m.name,
    category: m.category,
    brightness: m.brightness,
    image: m.image,
    applicableTo: [...m.applicableTo],
    active: true,
    sortOrder: (i + 1) * 10,
    createdAt: iso(220 - i * 5),
    updatedAt: iso(220 - i * 5),
  }));
  const swatches: AdminMaterial[] = pageSwatchSeed.map((s, i) => ({
    id: `swatch-${s.category}-${slug(s.name)}`,
    name: s.name,
    category: s.category,
    brightness: "all" as const,
    hex: s.hex,
    description: s.description,
    applicableTo: [],
    active: true,
    sortOrder: 1000 + (i + 1) * 10,
    createdAt: iso(150 - i),
    updatedAt: iso(150 - i),
  }));
  return [...finishes, ...swatches];
}

function buildSeedProjects(): AdminProject[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  return projectSeed.map((p, i) => ({
    ...p,
    active: true,
    sortOrder: (i + 1) * 10,
    createdAt: iso(300 - i * 25),
    updatedAt: iso(300 - i * 25),
  }));
}

function buildSeedBlogPosts(): AdminBlogPost[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  return blogSeed.map((p, i) => ({
    ...p,
    featured: p.featured ?? false,
    active: true,
    content: p.content.map((c) => ({ ...c })),
    tags: [...p.tags],
    createdAt: iso(120 - i * 12),
    updatedAt: iso(120 - i * 12),
  }));
}

function cloneService<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function buildSeedServices(): AdminService[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  return serviceSeed.map((s, i) => ({
    ...cloneService(s),
    active: true,
    sortOrder: (i + 1) * 10,
    createdAt: iso(200 - i * 15),
    updatedAt: iso(200 - i * 15),
  }));
}

function buildSeedShowrooms(): AdminShowroom[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  const wa = "923001234567";
  const mk = (
    id: string, name: string, city: string, address: string, phone: string,
    hours: string, lat: number | undefined, lng: number | undefined,
    isHQ: boolean, sortOrder: number, daysAgo: number,
  ): AdminShowroom =>
    ({ id, name, city, address, phone, whatsapp: wa, hours, lat, lng, isHQ, active: true, sortOrder, createdAt: iso(daysAgo), updatedAt: iso(daysAgo) });
  return [
    mk("sr-lahore-hq", "WOODEX Lahore — Experience Centre", "Lahore (HQ)", "123 Gulberg III, Main Boulevard, Lahore", "+92 42 111 WOODEX", "Mon–Sat: 9am–7pm", 31.5204, 74.3587, true, 10, 200),
    mk("sr-karachi", "WOODEX Karachi", "Karachi", "456 Clifton Block 5, Karachi", "+92 21 111 WOODEX", "Mon–Sat: 9am–7pm", 24.8607, 67.0011, false, 20, 180),
    mk("sr-islamabad", "WOODEX Islamabad", "Islamabad", "789 Blue Area, F-7 Markaz, Islamabad", "+92 51 111 WOODEX", "Mon–Sat: 10am–6pm", 33.7294, 73.0931, false, 30, 160),
    mk("sr-rawalpindi", "WOODEX Rawalpindi", "Rawalpindi", "44 Saddar Road, Committee Chowk, Rawalpindi", "+92 51 222 WOODEX", "Mon–Sat: 9am–7pm", 33.6007, 73.0679, false, 40, 150),
    mk("sr-faisalabad", "WOODEX Faisalabad", "Faisalabad", "12 D-Ground, Faisalabad", "+92 41 333 WOODEX", "Mon–Sat: 9am–6pm", 31.4504, 73.135, false, 50, 140),
  ];
}

/**
 * Demo seed for the Furniture Series master — inlined deliberately: this demo
 * bundle mis-wires named imports from @/data/products inside the shared db
 * chunk (unbound identifier at module evaluation — see A2 commit note), so the
 * storefront's `seriesList` is intentionally NOT imported here.
 * The /series/:seriesId storefront pages still read src/data/products.ts until
 * the Bagisto cutover; keep the two in sync manually until then.
 */
const SERIES_SEED: Array<Omit<AdminSeries, "createdAt" | "updatedAt">> = [
  {
    id: "ek-series", name: "Ek Series", tagline: "Affordable quality for every workspace",
    badge: "Budget-Friendly",
    description: "The Ek Series delivers reliable quality at an accessible price point. Perfect for startups, schools, and growing businesses that need functional furniture without breaking the budget.",
    features: ["Engineered wood construction", "Powder-coated steel frames", "Standard ergonomics", "3-year warranty"],
    color: "#5a7a3a", active: true, sortOrder: 10,
  },
  {
    id: "infinity-series", name: "Infinity Series", tagline: "Modular systems that grow with you",
    badge: "Modular",
    description: "The Infinity Series is built for flexibility. Every component connects seamlessly, allowing you to expand, reconfigure, and adapt your workspace as your team evolves.",
    features: ["Fully modular components", "Expandable layouts", "Integrated cable management", "5-year warranty"],
    color: "#3a5a7a", active: true, sortOrder: 20,
  },
  {
    id: "woodex-series", name: "Woodex Series", tagline: "Premium flagship collection",
    badge: "Premium",
    description: "Our flagship Woodex Series represents the pinnacle of Pakistani craftsmanship. Designed for executives and discerning clients who demand nothing but the best.",
    features: ["Solid hardwood & premium veneer", "Full-grain leather options", "Handcrafted detailing", "10-year warranty"],
    color: "#7a5a3a", active: true, sortOrder: 30,
  },
  {
    id: "cubicle-series", name: "Cubicle Series", tagline: "Privacy-focused workstation solutions",
    badge: "Privacy",
    description: "The Cubicle Series creates focused, private workspaces within open offices. Acoustic panels and intelligent layouts maximize productivity for individual contributors.",
    features: ["Acoustic privacy panels", "Height-adjustable options", "Personal storage integration", "5-year warranty"],
    color: "#5a5a7a", active: true, sortOrder: 40,
  },
  {
    id: "nova-series", name: "Nova Series", tagline: "Minimalist design-forward furniture",
    badge: "Minimal",
    description: "Nova Series brings Scandinavian-inspired minimalism to Pakistani workspaces. Clean lines, hidden hardware, and slim profiles for design-conscious offices.",
    features: ["Hidden hardware", "Slim steel frames", "Push-to-open drawers", "3-year warranty"],
    color: "#7a7a5a", active: true, sortOrder: 50,
  },
];

/**
 * Demo seed for the Brand master. Inlined for the same reason as SERIES_SEED
 * (named imports from @/data/* mis-wire in the shared db chunk). The catalogue
 * is Woodex today — seed a single house brand; the manager exists for the day
 * partner brands ship. FK on products: brandId === "woodex".
 */
const HOMEPAGE_SECTIONS_SEED: AdminHomepageSections = {
  bestSellers: { mode: "auto", productIds: [] },
  carousel: { mode: "auto", productIds: [] },
};

function cloneWarrantyPage(src: AdminWarrantyPage): AdminWarrantyPage {
  return {
    hero: { eyebrow: src.hero.eyebrow, title: src.hero.title, subtitle: src.hero.subtitle },
    tiers: src.tiers.map((t) => ({ ...t, coverage: [...t.coverage], excludes: [...t.excludes] })),
    steps: src.steps.map((s) => ({ ...s })),
    faqs: src.faqs.map((f) => ({ ...f })),
  };
}

const WARRANTY_PAGE_SEED: AdminWarrantyPage = cloneWarrantyPage(warrantyPageSeed);

const cloneDoc = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const CUSTOM_DESIGN_PAGE_SEED: AdminCustomDesignPage = cloneDoc(customDesignPageSeed);
const VIRTUAL_SHOWROOM_PAGE_SEED: AdminVirtualShowroomPage = cloneDoc(virtualShowroomPageSeed);
const clonePage = (pg: AdminPage): AdminPage => cloneDoc(pg);
const newPageId = () => `page-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
const newFolderId = () => `folder-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
const slugifyPage = (raw: string): string =>
  (raw || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-") || "page";
const uniquePageSlug = (rows: AdminPage[], base: string, exceptId?: string): string => {
  let slug = base;
  let n = 2;
  const taken = () => rows.some((pg) => pg.slug === slug && pg.id !== exceptId);
  while (taken()) { slug = `${base}-${n++}`; }
  return slug;
};

/** Validate + normalize the admin-supplied warranty page content. Throws on hard errors. */
function sanitizeWarrantyPage(input: AdminWarrantyPage): AdminWarrantyPage {
  if (!input || typeof input !== "object") throw new Error("Warranty page content is missing.");
  const cleanStr = (v: unknown, field: string, max: number, required: boolean): string => {
    const t = typeof v === "string" ? v.trim() : "";
    if (required && !t) throw new Error(`${field} is required.`);
    return t.slice(0, max);
  };
  const cleanList = (v: unknown, max: number, maxItem: number): string[] =>
    Array.isArray(v)
      ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x.length > 0).slice(0, max).map((x) => x.slice(0, maxItem))
      : [];
  const uniqueId = (raw: unknown, prefix: string, index: number, used: Set<string>): string => {
    let id = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 64) : `${prefix}-${index + 1}`;
    if (used.has(id)) id = `${prefix}-${index + 1}-${Math.random().toString(36).slice(2, 8)}`;
    used.add(id);
    return id;
  };

  const hero = input.hero;
  if (!hero || typeof hero !== "object") throw new Error("Hero block is missing.");
  const cleanHero = {
    eyebrow: cleanStr(hero.eyebrow, "Hero eyebrow", 120, true),
    title: cleanStr(hero.title, "Hero title", 160, true),
    subtitle: cleanStr(hero.subtitle, "Hero subtitle", 600, false),
  };

  if (!Array.isArray(input.tiers)) throw new Error("Tiers must be a list.");
  if (input.tiers.length === 0) throw new Error("At least one warranty tier is required.");
  if (input.tiers.length > 6) throw new Error("At most 6 warranty tiers.");
  const tierIds = new Set<string>();
  let popularSeen = false;
  const tiers = input.tiers.map((t, i) => {
    const tier = t ?? ({} as (typeof input.tiers)[number]);
    const popularWanted = Boolean(tier.popular);
    const popular = popularWanted && !popularSeen;
    if (popular) popularSeen = true;
    return {
      id: uniqueId(tier.id, "tier", i, tierIds),
      name: cleanStr(tier.name, `Tier ${i + 1} name`, 120, true),
      duration: cleanStr(tier.duration, `Tier ${i + 1} duration`, 60, true),
      applies: cleanStr(tier.applies, `Tier ${i + 1} applies-to`, 200, false),
      popular,
      coverage: cleanList(tier.coverage, 20, 200),
      excludes: cleanList(tier.excludes, 20, 200),
    };
  });

  if (!Array.isArray(input.steps)) throw new Error("Claim steps must be a list.");
  if (input.steps.length === 0) throw new Error("At least one claim step is required.");
  if (input.steps.length > 8) throw new Error("At most 8 claim steps.");
  const stepIds = new Set<string>();
  const steps = input.steps.map((st, i) => {
    const step = st ?? ({} as (typeof input.steps)[number]);
    return {
      id: uniqueId(step.id, "step", i, stepIds),
      title: cleanStr(step.title, `Step ${i + 1} title`, 120, true),
      description: cleanStr(step.description, `Step ${i + 1} description`, 600, true),
    };
  });

  if (!Array.isArray(input.faqs)) throw new Error("FAQs must be a list.");
  if (input.faqs.length > 12) throw new Error("At most 12 FAQs.");
  const faqIds = new Set<string>();
  const faqs = input.faqs.map((f, i) => {
    const faq = f ?? ({} as (typeof input.faqs)[number]);
    return {
      id: uniqueId(faq.id, "faq", i, faqIds),
      q: cleanStr(faq.q, `FAQ ${i + 1} question`, 300, true),
      a: cleanStr(faq.a, `FAQ ${i + 1} answer`, 1000, true),
    };
  });

  return { hero: cleanHero, tiers, steps, faqs };
}

/** Validate + normalize the admin-supplied custom design page content. Throws on hard errors. */
function sanitizeCustomDesignPage(input: AdminCustomDesignPage): AdminCustomDesignPage {
  if (!input || typeof input !== "object") throw new Error("Custom design page content is missing.");
  const cleanStr = (v: unknown, field: string, max: number, required: boolean): string => {
    const t = typeof v === "string" ? v.trim() : "";
    if (required && !t) throw new Error(`${field} is required.`);
    return t.slice(0, max);
  };
  const cleanList = (v: unknown, max: number, maxItem: number): string[] =>
    Array.isArray(v)
      ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x.length > 0).slice(0, max).map((x) => x.slice(0, maxItem))
      : [];
  const uniqueId = (raw: unknown, prefix: string, index: number, used: Set<string>): string => {
    let id = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 64) : `${prefix}-${index + 1}`;
    if (used.has(id)) id = `${prefix}-${index + 1}-${Math.random().toString(36).slice(2, 8)}`;
    used.add(id);
    return id;
  };
  const slugify = (raw: unknown): string => {
    const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    return t.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 80) || "custom-design";
  };

  const hero = input.hero;
  if (!hero || typeof hero !== "object") throw new Error("Hero block is missing.");
  const cleanHero = {
    eyebrow: cleanStr(hero.eyebrow, "Hero eyebrow", 120, true),
    title: cleanStr(hero.title, "Hero title", 160, true),
    subtitle: cleanStr(hero.subtitle, "Hero subtitle", 800, false),
  };

  const wds = input.wds;
  if (!wds || typeof wds !== "object") throw new Error("WDS block is missing.");
  const cleanWds = {
    heading: cleanStr(wds.heading, "WDS heading", 200, true),
    paragraph: cleanStr(wds.paragraph, "WDS paragraph", 1000, false),
    subheading: cleanStr(wds.subheading, "WDS subheading", 160, false),
    varietyOne: cleanStr(wds.varietyOne, "WDS variety (1)", 600, false),
    varietyTwo: cleanStr(wds.varietyTwo, "WDS variety (2)", 600, false),
  };

  const spaces = input.spaces;
  if (!spaces || typeof spaces !== "object") throw new Error("Space-work block is missing.");
  if (!Array.isArray(spaces.items)) throw new Error("Space-work cards must be a list.");
  if (spaces.items.length === 0) throw new Error("At least one space-work card is required.");
  if (spaces.items.length > 9) throw new Error("At most 9 space-work cards.");
  const spaceIds = new Set<string>();
  const spaceItems = spaces.items.map((it, i) => {
    const item = it ?? ({} as (typeof spaces.items)[number]);
    return {
      id: uniqueId(item.id, "sw", i, spaceIds),
      label: cleanStr(item.label, `Card ${i + 1} label`, 100, true),
      blurb: cleanStr(item.blurb, `Card ${i + 1} blurb`, 320, true),
      slug: slugify(item.slug),
    };
  });
  const cleanSpaces = {
    heading: cleanStr(spaces.heading, "Space-work heading", 160, true),
    subheading: cleanStr(spaces.subheading, "Space-work subheading", 400, false),
    items: spaceItems,
  };

  const furniture = input.furniture;
  if (!furniture || typeof furniture !== "object") throw new Error("Furniture block is missing.");
  const cleanFurniture = {
    heading: cleanStr(furniture.heading, "Furniture heading", 200, true),
    paragraph: cleanStr(furniture.paragraph, "Furniture paragraph", 1000, false),
    bullets: cleanList(furniture.bullets, 6, 200),
  };

  const designFirst = input.designFirst;
  if (!designFirst || typeof designFirst !== "object") throw new Error("Design-first block is missing.");
  const cleanDesignFirst = {
    heading: cleanStr(designFirst.heading, "Design-first heading", 200, true),
    bodyOne: cleanStr(designFirst.bodyOne, "Design-first paragraph (1)", 1200, false),
    bodyTwo: cleanStr(designFirst.bodyTwo, "Design-first paragraph (2)", 1200, false),
  };

  const testimonialsIntro = input.testimonialsIntro ?? { heading: "What Our Clients Say", subheading: "" };
  const cleanTestimonialsIntro = {
    heading: cleanStr(testimonialsIntro.heading, "Testimonials heading", 160, true),
    subheading: cleanStr(testimonialsIntro.subheading, "Testimonials subheading", 200, false),
  };

  if (!Array.isArray(input.testimonials)) throw new Error("Testimonials must be a list.");
  if (input.testimonials.length > 6) throw new Error("At most 6 testimonials.");
  const testimonialIds = new Set<string>();
  const testimonials = input.testimonials.map((t, i) => {
    const item = t ?? ({} as (typeof input.testimonials)[number]);
    return {
      id: uniqueId(item.id, "cd-test", i, testimonialIds),
      text: cleanStr(item.text, `Testimonial ${i + 1} text`, 700, true),
      name: cleanStr(item.name, `Testimonial ${i + 1} name`, 120, true),
      role: cleanStr(item.role, `Testimonial ${i + 1} role`, 160, false),
    };
  });

  const finalCta = input.finalCta;
  if (!finalCta || typeof finalCta !== "object") throw new Error("Closing CTA block is missing.");
  const cleanFinalCta = {
    heading: cleanStr(finalCta.heading, "CTA heading", 200, true),
    paragraph: cleanStr(finalCta.paragraph, "CTA paragraph", 400, false),
  };

  return { hero: cleanHero, wds: cleanWds, spaces: cleanSpaces, furniture: cleanFurniture, designFirst: cleanDesignFirst, testimonialsIntro: cleanTestimonialsIntro, testimonials, finalCta: cleanFinalCta };
}

const FEATURE_ICONS = new Set(["monitor", "rotate", "palette", "maximize", "users", "box"]);
/** Validate + normalize the admin-supplied virtual showroom page content. Throws on hard errors. */
function sanitizeVirtualShowroomPage(input: AdminVirtualShowroomPage): AdminVirtualShowroomPage {
  if (!input || typeof input !== "object") throw new Error("Virtual showroom content is missing.");
  const cleanStr = (v: unknown, field: string, max: number, required: boolean): string => {
    const t = typeof v === "string" ? v.trim() : "";
    if (required && !t) throw new Error(`${field} is required.`);
    return t.slice(0, max);
  };
  const uniqueId = (raw: unknown, prefix: string, index: number, used: Set<string>): string => {
    let id = typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 64) : `${prefix}-${index + 1}`;
    if (used.has(id)) id = `${prefix}-${index + 1}-${Math.random().toString(36).slice(2, 8)}`;
    used.add(id);
    return id;
  };

  const hero = input.hero;
  if (!hero || typeof hero !== "object") throw new Error("Hero block is missing.");
  const cleanHero = {
    eyebrow: cleanStr(hero.eyebrow, "Hero eyebrow", 120, true),
    title: cleanStr(hero.title, "Hero title", 160, true),
    subtitle: cleanStr(hero.subtitle, "Hero subtitle", 600, false),
  };

  const configurator = input.configurator;
  if (!configurator || typeof configurator !== "object") throw new Error("Configurator block is missing.");
  const cleanConfigurator = {
    heading: cleanStr(configurator.heading, "Configurator heading", 160, true),
    intro: cleanStr(configurator.intro, "Configurator intro", 400, false),
  };

  const featuresIntro = input.featuresIntro ?? { heading: "Virtual Showroom Features", subheading: "" };
  const cleanFeaturesIntro = {
    heading: cleanStr(featuresIntro.heading, "Features heading", 160, true),
    subheading: cleanStr(featuresIntro.subheading, "Features subheading", 200, false),
  };

  if (!Array.isArray(input.features)) throw new Error("Features must be a list.");
  if (input.features.length === 0) throw new Error("At least one feature is required.");
  if (input.features.length > 8) throw new Error("At most 8 features.");
  const featureIds = new Set<string>();
  const features = input.features.map((f, i) => {
    const feature = f ?? ({} as (typeof input.features)[number]);
    const icon = typeof feature.icon === "string" && FEATURE_ICONS.has(feature.icon) ? feature.icon : "monitor";
    return {
      id: uniqueId(feature.id, "vs-feature", i, featureIds),
      icon: icon as (typeof input.features)[number]["icon"],
      title: cleanStr(feature.title, `Feature ${i + 1} title`, 120, true),
      description: cleanStr(feature.description, `Feature ${i + 1} description`, 300, true),
    };
  });

  const finalCta = input.finalCta;
  if (!finalCta || typeof finalCta !== "object") throw new Error("Closing CTA block is missing.");
  const cleanFinalCta = {
    heading: cleanStr(finalCta.heading, "CTA heading", 200, true),
    paragraph: cleanStr(finalCta.paragraph, "CTA paragraph", 400, false),
  };

  return { hero: cleanHero, configurator: cleanConfigurator, featuresIntro: cleanFeaturesIntro, features, finalCta: cleanFinalCta };
}

const BRAND_SEED: Array<Omit<AdminBrand, "createdAt" | "updatedAt">> = [
  {
    id: "woodex", name: "Woodex", tagline: "Pakistan's office furniture makers since the workshop years",
    description: "WOODEX makes premium office furniture in Lahore — desks, workstations, conference tables, seating and storage — engineered wood, powder-coated steel frames, nationwide delivery with a warranty on every piece.",
    logo: "/woodex-logo.png", website: "https://woodexfurniture.pk", active: true, sortOrder: 10,
  },
];

function buildSeedBrands(): AdminBrand[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  return BRAND_SEED.map((b) => ({ ...b, createdAt: iso(200), updatedAt: iso(200) }));
}

function buildSeedSeries(): AdminSeries[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  return SERIES_SEED.map((s, i) => ({
    ...s,
    features: [...s.features],
    createdAt: iso(Math.max(30, 150 - i * 25)),
    updatedAt: iso(Math.max(30, 150 - i * 25)),
  }));
}

function channelFor(email: string, subtotal: number): string {
  let h = 0;
  const key = `${email}:${subtotal}`;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const b = h % 100;
  return b < 55 ? "ch-web" : b < 70 ? "ch-whatsapp" : b < 80 ? "ch-instagram" : b < 92 ? "ch-showroom" : b < 97 ? "ch-phone" : "ch-b2b";
}

function buildSeedPriceLists(): AdminPriceList[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  return [
    { id: "pl-wholesale", name: "Wholesale", description: "Standing trade discount for registered B2B buyers — the default rate of the /b2b program.", status: "active", audience: "all_b2b", companyIds: [], target: "all_products", categoryIds: [], discountPct: 12, createdAt: iso(150), updatedAt: iso(150) },
    { id: "pl-indus-corporate-2026", name: "Indus Developers — Corporate 2026", description: "Contract rate for Indus Developers projects across executive/manager/staff/meeting tables and chairs.", status: "active", audience: "companies", companyIds: ["co-indus-developers"], target: "categories", categoryIds: ["office-tables", "meeting-tables", "chairs"], discountPct: 20, createdAt: iso(45), updatedAt: iso(30) },
    { id: "pl-ramadan-2026", name: "Ramadan Campaign 2026", description: "Seasonal promo — saved as draft for the owner to review and activate.", status: "draft", audience: "all_b2b", companyIds: [], target: "all_products", categoryIds: [], discountPct: 8, startsAt: "2026-02-20", endsAt: "2026-03-25", createdAt: iso(20), updatedAt: iso(20) },
  ];
}

/** Resolves a collection's members — manual picks in curated order; rules evaluated live off the catalogue. */
function resolveCollectionProducts(db: DemoDb, c: AdminCollection): AdminProduct[] {
  if (c.kind === "manual") {
    const out: AdminProduct[] = [];
    for (const id of c.productIds) {
      const item = db.products.find((x) => x.id === id);
      if (item) out.push(item);
    }
    return out;
  }
  const all = db.products;
  switch (c.rule) {
    case "best_selling":
      return [...all].filter((p) => p.isBestSeller).sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    case "price_asc":
      return [...all].sort((a, b) => a.price - b.price);
    case "price_desc":
      return [...all].sort((a, b) => b.price - a.price);
    case "on_sale":
      return [...all]
        .filter((p) => p.compareAtPrice !== undefined && p.compareAtPrice > p.price)
        .sort((a, b) => (b.compareAtPrice! - b.price) - (a.compareAtPrice! - a.price));
    case "newest":
      // "New arrivals" is a shelf, not the whole catalogue — a fresh season's worth
      return [...all].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 24);
    default:
      return [];
  }
}

/** Seeded merchandising collections — sf-style new/sale/best-seller mix. */
function buildSeedCollections(prods: AdminProduct[]): AdminCollection[] {
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  return [
    { id: "col-new-arrivals", name: "New Arrivals", handle: "new-arrivals", description: "Fresh from the WOODEX workshops — latest additions this season.", kind: "automatic", rule: "newest", productIds: [], sortOrder: 0, createdAt: iso(120) },
    { id: "col-on-sale", name: "On Sale", handle: "on-sale", description: "Discounted catalogue — while stocks last.", kind: "automatic", rule: "on_sale", productIds: [], sortOrder: 1, createdAt: iso(90) },
    { id: "col-best-sellers", name: "Best Sellers", handle: "best-sellers", description: "Hand-picked customer favourites across office and home ranges.", kind: "manual", productIds: [...prods].filter((p) => p.isBestSeller).sort((a, b) => b.reviews - a.reviews).slice(0, 12).map((p) => p.id), sortOrder: 2, createdAt: iso(150) },
  ];
}

/** Price-list discount sanity: whole percent 0–60. */
/** Normalise bundle lines: trim ids, clamp quantities, dedupe by product. */
function sanitizeBundleLines(lines: AdminBundle["lines"] | undefined): AdminBundle["lines"] {
  if (!Array.isArray(lines)) return [];
  const merged = new Map<string, number>();
  for (const line of lines) {
    if (!line || typeof line.productId !== "string") continue;
    const id = line.productId.trim();
    if (!id) continue;
    const qty = Math.max(1, Math.min(99, Math.floor(Number(line.quantity) || 1)));
    merged.set(id, Math.min(99, (merged.get(id) ?? 0) + qty));
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

const clampPct = (n?: number) => Math.min(60, Math.max(0, Math.round(Number(n) || 0)));
const isoDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s : undefined);

const slugifyHandle = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "collection";

/** Deterministic lifecycle ledger for seeded orders (plausible history, clamped to now). */
function buildSeedOrderEvents(orders: AdminOrder[]): AdminOrderEvent[] {
  const out: AdminOrderEvent[] = [];
  const nowMs = Date.now();
  const at = (placedAt: string, offsetMs: number) => new Date(Math.min(new Date(placedAt).getTime() + offsetMs, nowMs)).toISOString();
  for (const o of orders) {
    out.push({ id: `ev-seed-${out.length + 1}`, orderId: o.id, fromStatus: undefined, toStatus: "pending", note: "Order received", createdAt: o.placedAt });
    if (o.status === "pending") continue;
    out.push({ id: `ev-seed-${out.length + 1}`, orderId: o.id, fromStatus: "pending", toStatus: "processing", note: "Payment confirmed — preparing for dispatch", createdAt: at(o.placedAt, 3 * 3600e3) });
    if (o.status === "processing") continue;
    if (o.status === "cancelled") {
      out.push({ id: `ev-seed-${out.length + 1}`, orderId: o.id, fromStatus: "processing", toStatus: "cancelled", note: "Cancelled by customer before dispatch", createdAt: at(o.placedAt, 26 * 3600e3) });
      continue;
    }
    out.push({ id: `ev-seed-${out.length + 1}`, orderId: o.id, fromStatus: "processing", toStatus: "shipped", note: "Dispatched — handed to courier", createdAt: at(o.placedAt, 26 * 3600e3) });
    if (o.status === "shipped") continue;
    out.push({ id: `ev-seed-${out.length + 1}`, orderId: o.id, fromStatus: "shipped", toStatus: "delivered", note: "Delivered", createdAt: at(o.placedAt, 72 * 3600e3) });
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Applies a stock delta for an order line, logging an honest clamped movement. */
const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["received"],
  received: ["inspected"],
  inspected: ["refunded", "replaced", "rejected"],
  refunded: [],
  replaced: [],
  rejected: [],
};

const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  damaged: "Damaged in transit",
  wrong_item: "Wrong item delivered",
  not_as_described: "Not as described",
  changed_mind: "Changed mind",
  other: "Other",
};

const newEventId = () => `ev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;

const EXCHANGE_TRANSITIONS: Record<ExchangeStatus, ExchangeStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["shipped"],
  shipped: ["completed"],
  completed: [],
  rejected: [],
};

/** Materialise an order inside a db mutation — shared by createOrder and draft conversion. */
function materializeOrder(db: DemoDb, input: NewOrderInput & { discountPct?: number; discountAmount?: number }): AdminOrder {
  const maxSeq = db.orders.reduce((max, o) => {
    const n = Number(o.id.replace(/\D/g, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 1000);
  const order: AdminOrder = {
    id: `WDX-${maxSeq + 1}`,
    customerName: input.customerName,
    customerEmail: input.customerEmail ?? "",
    customerPhone: input.customerPhone,
    address: input.address,
    channelId: input.channelId ?? "ch-web",
    city: input.city,
    items: input.items,
    subtotal: input.subtotal,
    shipping: input.shipping,
    total: input.total,
    paymentMethod: input.paymentMethod,
    status: "pending",
    placedAt: new Date().toISOString(),
    notes: input.notes,
    ...(input.discountPct !== undefined ? { discountPct: input.discountPct } : {}),
    ...(input.discountAmount !== undefined && input.discountAmount > 0 ? { discountAmount: input.discountAmount } : {}),
  };
  db.orders.push(order);

  // roll the purchase into the customer aggregate (match by phone, fallback email)
  const digits = (s: string) => s.replace(/\D/g, "");
  let customer = db.customers.find(
    (c) => digits(c.phone) === digits(input.customerPhone) || (input.customerEmail && c.email.toLowerCase() === input.customerEmail.toLowerCase()),
  );
  if (!customer) {
    customer = {
      id: `cus-web-${Date.now().toString(36)}`,
      name: input.customerName,
      email: input.customerEmail ?? "",
      phone: input.customerPhone,
      city: input.city,
      type: "retail",
      ordersCount: 0,
      totalSpent: 0,
      joinedAt: new Date().toISOString(),
    };
    db.customers.push(customer);
  }
  customer.ordersCount += 1;
  customer.totalSpent += input.total;
  return { ...order };
}

/** Validate/normalise draft lines — catalogue lines keep productId, free lines get a synthetic id. */
function sanitizeDraftLines(lines: NewDraftOrderLineInput[]): AdminOrderItem[] {
  const items: AdminOrderItem[] = [];
  let seq = 1;
  for (const line of lines ?? []) {
    const name = line.name?.trim();
    const price = Number(line.price);
    const qty = Math.max(1, Math.trunc(Number(line.quantity) || 1));
    if (!name || !Number.isFinite(price) || price < 0) continue;
    items.push({ id: line.productId?.trim() || `free-${Date.now().toString(36)}-${seq++}`, name, price: Math.round(price), quantity: qty, image: line.image });
  }
  return items;
}

/** Deterministic seed draft — B2B shortlist built from catalogue products. */
function buildSeedDraftOrders(products: AdminProduct[]): AdminDraftOrder[] {
  const picks = products.filter((p) => p.price > 0).slice(0, 3);
  if (picks.length === 0) return [];
  const qtys = [24, 12, 6];
  const items = picks.map((p, i) => ({ id: p.id, name: p.name, image: p.image, price: p.price, quantity: qtys[i] ?? 1 }));
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const t = new Date(Date.now() - 4 * 86400000).toISOString();
  return [{
    id: "DRF-1001",
    customerName: "Indus Developers — Procurement",
    customerPhone: "+92 345 1122334",
    customerEmail: "projects@indusdevelopers.pk",
    city: "Lahore",
    items,
    subtotal,
    shipping: 0,
    total: subtotal,
    channelId: "ch-b2b",
    notes: "B2B — Sana Malik, fit-out for 3 sales centres. Awaiting PO before dispatch.",
    status: "draft",
    createdAt: t,
    updatedAt: t,
  }];
}

/** Quote totals — discount on the list-price subtotal; free delivery at 150k+. */
function quoteTotals(items: AdminOrderItem[], discountPct: number, shipping?: number | null) {
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const discountAmount = Math.round((subtotal * discountPct) / 100);
  const ship = shipping !== undefined && shipping !== null
    ? Math.max(0, Math.round(Number(shipping) || 0))
    : subtotal >= 150000 ? 0 : 1500;
  return { subtotal, discountAmount, shipping: ship, total: subtotal - discountAmount + ship };
}

/** Deterministic seed quotes tied to the CRM's "quoted" leads (Bilal Ahmed · Ravi Agro Foods). */
function buildSeedQuotes(products: AdminProduct[]): AdminQuote[] {
  const priced = products.filter((p) => p.price > 0);
  if (priced.length < 3) return [];
  const bySub = (sub: string) => priced.find((p) => p.subcategory === sub);
  const meeting = bySub("meeting-tables") ?? priced[0];
  const staff = bySub("staff-tables") ?? priced.find((p) => p.id !== meeting.id) ?? priced[1];
  const chair = bySub("chairs") ?? priced.find((p) => p.id !== meeting.id && p.id !== staff.id) ?? priced[2];

  const mk = (
    id: string,
    leadId: string,
    customerName: string,
    customerPhone: string,
    customerEmail: string,
    company: string | undefined,
    city: string,
    lines: Array<[AdminProduct, number]>,
    discountPct: number,
    validityDays: number,
    status: AdminQuote["status"],
    daysAgo: number,
  ): AdminQuote => {
    const items = lines.map(([p, quantity]) => ({ id: p.id, name: p.name, image: p.image, price: p.price, quantity }));
    const totals = quoteTotals(items, discountPct, 0); // B2B — free delivery on quotes
    const created = new Date(Date.now() - daysAgo * 86400000);
    const t = created.toISOString();
    return {
      id, leadId, customerName, customerPhone, customerEmail, company, city,
      items, ...totals, discountPct, validityDays,
      validUntil: new Date(created.getTime() + validityDays * 86400000).toISOString(),
      status,
      createdAt: t,
      updatedAt: t,
    };
  };

  return [
    mk("QOT-1001", "lead-1005", "Bilal Ahmed", "+92 315 8899007", "bilal.a@example.com", undefined, "Islamabad",
       [[meeting, 1], [chair, 12]], 5, 14, "sent", 3),
    mk("QOT-1002", "lead-1008", "Kashif Mirza", "+92 300 9988776", "ops@raviagrofoods.pk", "Ravi Agro Foods", "Multan",
       [[staff, 25], [chair, 50]], 8, 21, "accepted", 5),
  ];
}

/** Shared creation path — used by createQuote and createQuoteFromLead. */
function createQuoteInDb(db: DemoDb, input: NewQuoteInput): AdminQuote {
  const customerName = input.customerName?.trim();
  const customerPhone = input.customerPhone?.trim();
  if (!customerName) throw new Error("Customer name is required.");
  if (!customerPhone) throw new Error("Customer phone is required.");
  const items = sanitizeDraftLines(input.items ?? []);
  const discountPct = clampPct(input.discountPct);
  const validityDays = Math.min(90, Math.max(1, Math.trunc(Number(input.validityDays) || 14)));
  const totals = quoteTotals(items, discountPct, input.shipping);
  const now = new Date().toISOString();
  const maxSeq = (db.quotes ?? []).reduce((max, q) => Math.max(max, Number(q.id.replace(/\D/g, "")) || 0), 1000);
  const quote: AdminQuote = {
    id: `QOT-${maxSeq + 1}`,
    leadId: input.leadId?.trim() || undefined,
    customerName,
    customerPhone,
    customerEmail: input.customerEmail?.trim() ?? "",
    company: input.company?.trim() || undefined,
    city: input.city?.trim() || undefined,
    address: input.address?.trim() || undefined,
    items,
    ...totals,
    discountPct,
    validityDays,
    validUntil: new Date(Date.parse(now) + validityDays * 86400000).toISOString(),
    notes: input.notes?.trim() || undefined,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  (db.quotes ??= []).push(quote);
  return quote;
}

/** Deterministic seed suppliers — the four vendors the demo POs draw from. */
function buildSeedSuppliers(): AdminSupplier[] {
  const t = new Date(Date.now() - 120 * 86400000).toISOString();
  const mk = (
    id: string,
    name: string,
    contactName: string,
    email: string,
    phone: string,
    city: string,
    paymentTerms: AdminSupplier["paymentTerms"],
    notes: string,
    taxId?: string,
  ): AdminSupplier => ({ id, name, contactName, email, phone, city, taxId, paymentTerms, notes, active: true, createdAt: t, updatedAt: t });
  return [
    mk("SUP-1001", "Pak Wood & Timber Co", "Rana Imran", "imran@pakwood.com.pk", "+92 300 4561230", "Lahore", "net30", "Sawn timber, MDF and melamine boards — primary sheet supplier for the executive and Ballmer ranges.", "52751-8"),
    mk("SUP-1002", "Sheikh Sawmills & Boards", "Sheikh Zubair", "sales@sheikhsawmills.pk", "+92 321 6745123", "Faisalabad", "net45", "Raw lumber + veneer sheets; secondary source when Pak Wood is short on stock.", "51234-5"),
    mk("SUP-1003", "MetalKraft Industries", "Kamran Shah", "orders@metalkraft.pk", "+92 301 5550192", "Gujranwala", "net15", "Welded frames, telescopic slides, hinges and locks — hardware for storage lines.", "49871-2"),
    mk("SUP-1004", "Al-Noor Foam & Upholstery", "Noor Ahmed", "noor@alnoorfoam.pk", "+92 315 2098711", "Karachi", "cod", "High-density foam, fabric and leather — sofas, chair cushions and reception seating."),
  ];
}

/** Validate/normalise PO lines — catalogue lines keep productId (receipts write stock); received starts at 0. */
function sanitizePoLines(lines: NewPurchaseOrderLineInput[]): AdminPurchaseOrderLine[] {
  const items: AdminPurchaseOrderLine[] = [];
  let seq = 1;
  for (const line of lines ?? []) {
    const name = line.name?.trim();
    const costPrice = Number(line.costPrice);
    const qty = Math.max(1, Math.trunc(Number(line.quantity) || 1));
    if (!name || !Number.isFinite(costPrice) || costPrice < 0) continue;
    items.push({
      id: line.productId?.trim() ? `pol-${line.productId.trim()}-${seq}` : `pol-free-${Date.now().toString(36)}-${seq}`,
      productId: line.productId?.trim() || undefined,
      name,
      sku: line.sku?.trim() || undefined,
      image: line.image,
      costPrice: Math.round(costPrice),
      quantity: qty,
      receivedQuantity: 0,
    });
    seq += 1;
  }
  return items;
}

/** Deterministic seed POs — one draft (boards from Pak Wood) and one sent PO (hardware from MetalKraft). */
function buildSeedPurchaseOrders(products: AdminProduct[]): AdminPurchaseOrder[] {
  const priced = products.filter((p) => p.price > 0);
  if (priced.length < 3) return [];
  const bySub = (sub: string) => priced.find((p) => p.subcategory === sub);
  const meeting = bySub("meeting-tables") ?? priced[0];
  const staff = bySub("staff-tables") ?? priced.find((p) => p.id !== meeting.id) ?? priced[1];
  const chair = bySub("chairs") ?? priced.find((p) => p.id !== meeting.id && p.id !== staff.id) ?? priced[2];
  const cost = (p: AdminProduct) => Math.max(1, Math.round(p.price * 0.6));
  const now = Date.now();
  const t1 = new Date(now - 1 * 86400000).toISOString();
  const t3 = new Date(now - 3 * 86400000).toISOString();
  const day = (offset: number) => new Date(now + offset * 86400000).toISOString().slice(0, 10);

  const draftLines: AdminPurchaseOrderLine[] = [
    { id: "pol-1001-1", productId: meeting.id, name: meeting.name, sku: meeting.sku, image: meeting.image, costPrice: cost(meeting), quantity: 2, receivedQuantity: 0 },
    { id: "pol-1001-2", productId: chair.id, name: chair.name, sku: chair.sku, image: chair.image, costPrice: cost(chair), quantity: 24, receivedQuantity: 0 },
  ];
  const sentLines: AdminPurchaseOrderLine[] = [
    { id: "pol-1002-1", name: "Soft-close hinges 107°", costPrice: 145, quantity: 500, receivedQuantity: 0 },
    { id: "pol-1002-2", name: "Telescopic slides 45mm", costPrice: 380, quantity: 300, receivedQuantity: 0 },
  ];
  const sum = (ls: AdminPurchaseOrderLine[]) => ls.reduce((s, l) => s + l.costPrice * l.quantity, 0);
  return [
    {
      id: "PO-1001",
      supplierId: "SUP-1001",
      supplierName: "Pak Wood & Timber Co",
      lines: draftLines,
      subtotal: sum(draftLines),
      expectedDate: day(14),
      notes: "Advance 50% on order confirmation; balance on delivery.",
      status: "draft",
      createdAt: t1,
      updatedAt: t1,
    },
    {
      id: "PO-1002",
      supplierId: "SUP-1003",
      supplierName: "MetalKraft Industries",
      lines: sentLines,
      subtotal: sum(sentLines),
      expectedDate: day(10),
      notes: "Net-15 terms · invoice on delivery.",
      status: "sent",
      createdAt: t3,
      updatedAt: t3,
    },
  ];
}

/** Resolve a transfer location id to a display name (warehouse or showroom). */
function transferLocationName(db: DemoDb, id: string): string | undefined {
  if (id === "loc-warehouse") return "Warehouse — Lahore (factory)";
  const showroom = (db.showrooms ?? []).find((x) => x.id === id);
  return showroom ? `${showroom.name} — ${showroom.city}` : undefined;
}

/** Validate/normalise transfer lines — catalogue products only; received starts at 0. */
function sanitizeTransferLines(lines: NewStockTransferLineInput[]): AdminTransferLine[] {
  const items: AdminTransferLine[] = [];
  let seq = 1;
  for (const line of lines ?? []) {
    const productId = line.productId?.trim();
    const name = line.name?.trim();
    const qty = Math.max(1, Math.trunc(Number(line.quantity) || 1));
    if (!productId || !name) continue;
    items.push({ id: `trfline-${productId}-${seq}`, productId, name, sku: line.sku?.trim() || undefined, image: line.image, quantity: qty, receivedQuantity: 0 });
    seq += 1;
  }
  return items;
}

/** Deterministic seed transfers — one historical (received) Lahore replenishment, one in transit to Karachi. */
function buildSeedTransfers(products: AdminProduct[]): AdminStockTransfer[] {
  const bySub = (sub: string) => products.find((p) => p.subcategory === sub && p.price > 0);
  const chair = bySub("chairs") ?? products.find((p) => p.price > 0)!;
  const staff = bySub("staff-tables") ?? products.find((p) => p.id !== chair.id)!;
  const now = Date.now();
  const tOld = new Date(now - 30 * 86400000).toISOString();
  const tMid = new Date(now - 3 * 86400000).toISOString();
  const receivedLine = { id: "trfline-1001-1", productId: chair.id, name: chair.name, sku: chair.sku, image: chair.image, quantity: 6, receivedQuantity: 6 };
  const transitLine = { id: "trfline-1002-1", productId: staff.id, name: staff.name, sku: staff.sku, image: staff.image, quantity: 6, receivedQuantity: 0 };
  return [
    {
      id: "TRF-1001",
      fromLocationId: "loc-warehouse",
      fromLocationName: "Warehouse — Lahore (factory)",
      toLocationId: "sr-lahore-hq",
      toLocationName: "WOODEX Lahore — Experience Centre — Lahore (HQ)",
      lines: [receivedLine],
      status: "received",
      notes: "Showroom floor replenishment — chair units.",
      createdAt: tOld,
      updatedAt: new Date(Date.parse(tOld) + 86400000).toISOString(),
      receivedAt: new Date(Date.parse(tOld) + 86400000).toISOString(),
    },
    {
      id: "TRF-1002",
      fromLocationId: "loc-warehouse",
      fromLocationName: "Warehouse — Lahore (factory)",
      toLocationId: "sr-karachi",
      toLocationName: "WOODEX Karachi — Karachi",
      lines: [transitLine],
      status: "in_transit",
      notes: "Karachian delivery leg — TCS courier, consignment on file.",
      createdAt: tMid,
      updatedAt: tMid,
    },
  ];
}

/** Seed option sets — clones the static storefront master so admin edits persist independently. */
function buildSeedOptionSets(): AdminOptionSet[] {
  const now = new Date().toISOString();
  return OPTION_SETS.map((set) => ({
    id: set.id,
    name: set.name,
    values: set.values.map((v) => ({ ...v })),
    createdAt: now,
    updatedAt: now,
  }));
}

/** Sanitise option-set value rows — labels required; ids kept on edit, minted otherwise. */
function sanitizeOptionValues(values: AdminOptionValueInput[], setId: string): AdminOptionValue[] {
  const items: AdminOptionValue[] = [];
  const seen = new Set<string>();
  let seq = 1;
  for (const v of values ?? []) {
    const label = v.label?.trim();
    if (!label) continue;
    let id = v.id?.trim();
    if (!id || seen.has(id)) id = `val-${setId.replace(/[^a-z0-9]/gi, "")}-${Date.now().toString(36)}-${seq}`;
    seen.add(id);
    const priceDelta = Math.trunc(Number(v.priceDelta) || 0);
    const skuSuffix = v.skuSuffix?.trim().toUpperCase() || undefined;
    items.push({ id, label, priceDelta, skuSuffix });
    seq += 1;
  }
  return items;
}

const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  reported: ["assessing", "rejected"],
  assessing: ["approved", "rejected"],
  approved: ["resolved"],
  rejected: [],
  resolved: [],
};

/** Deterministic seed claims derived from delivered orders — ties into the 5-year warranty story. */
function buildSeedClaims(orders: AdminOrder[]): AdminClaim[] {
  const delivered = orders.filter((o) => o.status === "delivered").sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const out: AdminClaim[] = [];
  const t1 = new Date(Date.now() - 3 * 86400000).toISOString();
  if (delivered[0] && delivered[0].items[0]) {
    const o = delivered[0];
    const line = o.items[0];
    out.push({
      id: "CLM-1001",
      orderId: o.id,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      city: o.city,
      productName: line.name,
      productId: line.id,
      type: "warranty",
      issue: "5-year warranty — finish flaking on the table top within 8 months of delivery.",
      status: "assessing",
      createdAt: t1,
      updatedAt: t1,
    });
  }
  const t2 = new Date(Date.now() - 1 * 86400000).toISOString();
  if (delivered[1] && delivered[1].items[0]) {
    const o = delivered[1];
    const line = o.items[0];
    out.push({
      id: "CLM-1002",
      orderId: o.id,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      city: o.city,
      productName: line.name,
      productId: line.id,
      type: "damage",
      issue: "Damaged on arrival — leg joint split, courier seal intact. Photos received on WhatsApp.",
      status: "reported",
      createdAt: t2,
      updatedAt: t2,
    });
  }
  return out;
}

/** Deterministic seed exchange derived from the same delivered order as RMA-1001. */
function buildSeedExchanges(orders: AdminOrder[], products: AdminProduct[]): AdminExchange[] {
  const delivered = orders.filter((o) => o.status === "delivered").sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const o = delivered[0];
  if (!o || !o.items[0] || products.length < 2) return [];
  const line = o.items[0];
  const replacement = products.find((p) => p.id !== line.id && p.image) ?? products.find((p) => p.id !== line.id);
  if (!replacement) return [];
  const t = new Date(Date.now() - 1 * 86400000).toISOString();
  const incoming = [{ id: line.id, name: line.name, image: line.image, quantity: 1, price: line.price }];
  const outgoing = [{ id: replacement.id, name: replacement.name, image: replacement.image, quantity: 1, price: replacement.price }];
  const diff = outgoing[0].price - incoming[0].price;
  return [{
    id: "EXC-1001",
    orderId: o.id,
    returnId: "RMA-1001",
    customerName: o.customerName,
    customerEmail: o.customerEmail,
    customerPhone: o.customerPhone,
    city: o.city,
    incoming,
    outgoing,
    reason: "Defective unit — customer prefers the alternate model",
    status: "approved",
    priceDifference: diff,
    differenceSettled: diff === 0,
    createdAt: t,
    updatedAt: t,
  }];
}

/** Deterministic seed returns derived from delivered orders (pipeline spread). */
function buildSeedReturns(orders: AdminOrder[]): AdminReturn[] {
  const delivered = orders.filter((o) => o.status === "delivered").sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const out: AdminReturn[] = [];
  const t1 = new Date(Date.now() - 2 * 86400000).toISOString();
  if (delivered[0] && delivered[0].items[0]) {
    const o = delivered[0];
    const line = o.items[0];
    out.push({
      id: "RMA-1001",
      orderId: o.id,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      city: o.city,
      items: [{ id: line.id, name: line.name, image: line.image, quantity: 1, price: line.price }],
      reason: "damaged",
      reasonDetail: "Finish chipped during transit — customer shared photos on WhatsApp",
      status: "requested",
      refundAmount: line.price,
      restock: true,
      createdAt: t1,
      updatedAt: t1,
    });
  }
  const t2 = new Date(Date.now() - 6 * 86400000).toISOString();
  if (delivered[1] && delivered[1].items.length) {
    const o = delivered[1];
    const items = o.items.slice(0, 2).map((it) => ({
      id: it.id, name: it.name, image: it.image, quantity: Math.min(it.quantity, 2), price: it.price,
    }));
    out.push({
      id: "RMA-1002",
      orderId: o.id,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone,
      city: o.city,
      items,
      reason: "not_as_described",
      reasonDetail: "Grain colour darker than the website photos",
      status: "inspected",
      refundAmount: items.reduce((s, it) => s + it.price * it.quantity, 0),
      restock: false,
      inspectionNote: "Units received in original packaging — no physical damage; mismatch confirmed.",
      createdAt: t2,
      updatedAt: t2,
    });
  }
  return out;
}

function adjustLineStock(
  db: DemoDb,
  orderId: string,
  item: Pick<AdminOrderItem, "id" | "name" | "quantity">,
  direction: "out" | "in",
  note: string,
  now: string,
) {
  let p = db.products.find((x) => x.id === item.id);
  if (!p) {
    const target = item.name.trim().toLowerCase();
    p = db.products.find((x) => x.name.trim().toLowerCase() === target);
  }
  if (!p) return; // line doesn't map onto the catalogue — record nothing rather than guess
  if (direction === "out") {
    const before = p.stock;
    const qty = Math.min(Math.max(0, Math.trunc(item.quantity) || 0), before);
    if (qty <= 0) return;
    p.stock = before - qty;
    syncFulfilment(p);
    touchProductMeta(db, p.id);
    db.movements.unshift({
      id: `mov-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      productId: p.id,
      productName: p.name,
      productSku: p.sku,
      type: "outbound",
      quantity: -qty,
      notes: `${note} ${orderId}`,
      createdAt: now,
    });
    return;
  }
  const beforeIn = p.stock;
  const add = Math.max(0, Math.trunc(item.quantity) || 0);
  if (add <= 0) return;
  p.stock = beforeIn + add;
  syncFulfilment(p);
  touchProductMeta(db, p.id);
  db.movements.unshift({
    id: `mov-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
    productId: p.id,
    productName: p.name,
    productSku: p.sku,
    type: "return",
    quantity: add,
    notes: `${note} ${orderId}`,
    createdAt: now,
  });
}

function buildSeed(): DemoDb {
  const rand = mulberry32(20261106);

  /* products from the live catalogue */
  const adminProducts: AdminProduct[] = products.map((p, i) => {
    const stock = p.inStock ? (hashString(p.id) % 90) + 3 : 0;
    const madeToOrder = p.inStock && hashString(`${p.id}#mto`) % 100 < 14; // ~a seventh of the catalogue is built to order
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      subcategory: (p as { subcategory?: string }).subcategory,
      sku: `WDX-${String(i + 1001).padStart(4, "0")}`,
      price: p.price,
      compareAtPrice: p.originalPrice,
      image: p.images[0],
      inStock: p.inStock,
      stock,
      stockStatus: p.inStock ? (madeToOrder ? "made_to_order" : "in_stock") : "out_of_stock",
      isBestSeller: Boolean(p.isBestSeller),
      rating: p.rating,
      reviews: p.reviews,
      // deterministic pseudo-fresh dates spread over the last 60 days
      createdAt: new Date(Date.now() - (hashString(p.id) % 60) * 86400000).toISOString(),
      optionSetIds: optionSetIdsFor(p),
      specs: p.specifications?.map((s) => ({ ...s })),
      shortDescription: p.shortDescription,
      description: p.description,
      images: [...p.images],
      seriesId: p.series,
      brandId: "woodex",
    };
  });

  /* customers: 10 retail + 5 business accounts */
  const customers: AdminCustomer[] = [];
  for (let i = 0; i < 10; i++) {
    const name = `${pick(rand, FIRST)} ${pick(rand, LAST)}`;
    customers.push({
      id: `cus-r-${i + 1}`,
      name,
      email: `${name.split(" ")[0].toLowerCase()}.${i + 1}@example.com`,
      phone: `+92 3${Math.floor(rand() * 40 + 10)} ${String(Math.floor(rand() * 8999999) + 1000000)}`,
      city: pick(rand, CITIES),
      type: "retail",
      ordersCount: 0,
      totalSpent: 0,
      joinedAt: new Date(Date.now() - Math.floor(rand() * 400 + 30) * 86400000).toISOString(),
    });
  }
  BUSINESSES.forEach((b, i) => {
    customers.push({
      id: `cus-b-${i + 1}`,
      name: b.name,
      email: b.email,
      phone: b.phone,
      city: b.city,
      type: "business",
      company: b.company,
      ordersCount: 0,
      totalSpent: 0,
      joinedAt: new Date(Date.now() - Math.floor(rand() * 500 + 120) * 86400000).toISOString(),
    });
  });

  /* orders spread over the last 75 days */
  const orderDrafts: Array<Omit<AdminOrder, "id">> = [];
  for (let i = 0; i < 64; i++) {
    const daysAgo = Math.floor(Math.pow(rand(), 1.35) * 75); // bias toward recent
    const placed = new Date(Date.now() - daysAgo * 86400000 - Math.floor(rand() * 12 + 8) * 3600000);
    const customer = pick(rand, customers);
    const itemCount = 1 + Math.floor(rand() * 3);
    const chosen = new Map<string, AdminOrderItem>();
    for (let j = 0; j < itemCount; j++) {
      const p = pick(rand, adminProducts);
      const qty = customer.type === "business" ? 4 + Math.floor(rand() * 20) : 1 + Math.floor(rand() * 4);
      const existing = chosen.get(p.id);
      if (existing) existing.quantity += qty;
      else chosen.set(p.id, { id: p.id, name: p.name, price: p.price, quantity: qty, image: p.image });
    }
    const items = [...chosen.values()];
    const subtotal = items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const shipping = subtotal >= 150000 ? 0 : 1500;
    const age = (Date.now() - placed.getTime()) / 86400000;
    let status: OrderStatus;
    if (rand() < 0.08) status = "cancelled";
    else if (age > 12) status = "delivered";
    else if (age > 6) status = "shipped";
    else if (age > 2.5) status = "processing";
    else status = "pending";
    const paymentMethod = pick(rand, ["cod", "cod", "cod", "bank-transfer", "easypaisa", "jazzcash", "card"] as const) as PaymentMethod;
    orderDrafts.push({
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      city: customer.city,
      items,
      subtotal,
      shipping,
      total: subtotal + shipping,
      paymentMethod,
      status,
      placedAt: placed.toISOString(),
      channelId: channelFor(customer.email, subtotal),
    });
  }
  orderDrafts.sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  const orders: AdminOrder[] = orderDrafts.map((o, i) => ({ ...o, id: `WDX-${1001 + i}` }));

  /* roll order aggregates into customers */
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const c = customers.find((x) => x.email === order.customerEmail);
    if (c) { c.ordersCount += 1; c.totalSpent += order.total; }
  }

  /* leads: quote requests + B2B enquiries */
  const leadDrafts: Array<Omit<AdminLead, "id" | "createdAt"> & { daysAgo: number }> = [
    { daysAgo: 0, type: "quote", name: "Danish Hussain", email: "danish.h@example.com", phone: "+92 301 7788991", city: "Lahore", summary: "Executive cabin: 2 manager tables, 8 visitor chairs, 1 meeting table for 10", value: 1450000, status: "new", consent: true, consentVersion: "lead-privacy-v1", landingPath: "/quotation", utmSource: "google", utmMedium: "cpc", utmCampaign: "executive-iq" },
    { daysAgo: 1, type: "b2b", name: "Sana Malik", company: "Indus Developers", email: "projects@indusdevelopers.pk", phone: "+92 345 1122334", city: "Lahore", summary: "Fit-out for 3 sales centres — reception counters, lounge sofas, 40 workstations", value: 18500000, status: "new", consent: true, consentVersion: "lead-privacy-v1", landingPath: "/quotation", utmSource: "linkedin", utmMedium: "organic", utmCampaign: "fit-out-q4" },
    { daysAgo: 2, type: "quote", name: "Hira Zainab", email: "hira.z@example.com", phone: "+92 322 6677889", city: "Karachi", summary: "Home office: 1 executive desk, ergonomic chair, bookshelf", value: 385000, status: "new", consent: true, consentVersion: "lead-privacy-v1", landingPath: "/quotation" },
    { daysAgo: 3, type: "b2b", name: "Imran Sheikh", company: "Alpha Textiles Pvt Ltd", email: "procurement@alphatextiles.pk", phone: "+92 321 4567890", city: "Faisalabad", summary: "Factory office renovation — 25 staff tables, 60 chairs, storage units", value: 7200000, status: "contacted", consent: true, consentVersion: "lead-privacy-v1", landingPath: "/contact", referrer: "https://www.google.com/" },
    { daysAgo: 5, type: "quote", name: "Bilal Ahmed", email: "bilal.a@example.com", phone: "+92 315 8899007", city: "Islamabad", summary: "Conference room: 1 boardroom table, 14 recliner chairs, acoustic panels", value: 2100000, status: "quoted", consent: true, consentVersion: "lead-privacy-v1", landingPath: "/quotation", utmSource: "google", utmMedium: "cpc", utmCampaign: "boardroom-nov" },
    { daysAgo: 6, type: "quote", name: "Ayesha Siddiqui", email: "ayesha.s@example.com", phone: "+92 333 2211009", city: "Rawalpindi", summary: "Nursery + home office combo for villa, DHA Phase 5", value: 980000, status: "contacted" },
    { daysAgo: 8, type: "b2b", name: "Kashif Mirza", company: "Ravi Agro Foods", email: "ops@raviagrofoods.pk", phone: "+92 300 9988776", city: "Multan", summary: "Head office canteen + cafeteria furniture, 150 seats", value: 5400000, status: "quoted" },
    { daysAgo: 11, type: "quote", name: "Fatima Raza", email: "fatima.r@example.com", phone: "+92 308 6655443", city: "Lahore", summary: "2 storage cabinets + 1 L-shaped executive table", value: 520000, status: "won" },
    { daysAgo: 14, type: "b2b", name: "Omar Qureshi", company: "Nawaab Group of Companies", email: "facilities@nawaabgroup.pk", phone: "+92 312 5566778", city: "Islamabad", summary: "Complete HQ fit-out — 5 floors, ~300 workstations, boardroom, reception", value: 45000000, status: "won" },
    { daysAgo: 16, type: "quote", name: "Owais Khan", email: "owais.k@example.com", phone: "+92 300 4422118", city: "Faisalabad", summary: "Reception counter + waiting area sofa for clinic", value: 760000, status: "lost" },
    { daysAgo: 21, type: "quote", name: "Mahnoor Butt", email: "mahnoor.b@example.com", phone: "+92 345 9090901", city: "Lahore", summary: "Study room: 1 desk, task chair, shelving for kids' room", value: 240000, status: "won" },
    { daysAgo: 26, type: "b2b", name: "Mariam Chaudhry", company: "Crescent Logistics", email: "admin@crescentlogistics.pk", phone: "+92 333 7654321", city: "Karachi", summary: "Branch offices in 6 cities — workstations, chairs, meeting tables", value: 12800000, status: "lost" },
  ];
  const leads: AdminLead[] = leadDrafts.map((l, i) => {
    const { daysAgo, ...rest } = l;
    const consentAt = rest.consent ? new Date(Date.now() - daysAgo * 86400000 - 1800000).toISOString() : undefined;
    return { ...rest, consentAt, id: `lead-${1001 + i}`, createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString() };
  });

  return { products: adminProducts, orders, customers, leads, settings: { ...DEFAULT_SETTINGS }, categories: buildSeedCategories(), media: buildSeedMedia(), inventoryMeta: buildInventoryMeta(adminProducts), movements: buildSeedMovements(adminProducts), zones: buildSeedZones(), orderEvents: buildSeedOrderEvents(orders), collections: buildSeedCollections(adminProducts), companies: buildSeedCompanies(), priceLists: buildSeedPriceLists(), bundles: buildSeedBundles(), salesChannels: buildSeedSalesChannels(), showrooms: buildSeedShowrooms(), series: buildSeedSeries(), brands: buildSeedBrands(), homepageSections: HOMEPAGE_SECTIONS_SEED, warrantyPage: cloneWarrantyPage(WARRANTY_PAGE_SEED), customDesignPage: cloneDoc(CUSTOM_DESIGN_PAGE_SEED), virtualShowroomPage: cloneDoc(VIRTUAL_SHOWROOM_PAGE_SEED), pages: buildSeedPages(), pageFolders: buildSeedPageFolders(), materials: buildSeedMaterials(), projects: buildSeedProjects(), blogPosts: buildSeedBlogPosts(), services: buildSeedServices(), returns: buildSeedReturns(orders), exchanges: buildSeedExchanges(orders, adminProducts), claims: buildSeedClaims(orders), draftOrders: buildSeedDraftOrders(adminProducts), quotes: buildSeedQuotes(adminProducts), suppliers: buildSeedSuppliers(), purchaseOrders: buildSeedPurchaseOrders(adminProducts), stockTransfers: buildSeedTransfers(adminProducts), optionSets: buildSeedOptionSets() };
}

/* ── persistence (lazy; browser only) ───────────────────────────────────── */
let memory: DemoDb | null = null;

function persist(db: DemoDb) {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { /* quota / private mode */ }
}

function loadDb(): DemoDb {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const db = JSON.parse(raw) as DemoDb;
      // migrate payloads saved before categories/media/inventory existed
      if (!Array.isArray(db.categories)) db.categories = buildSeedCategories();
      if (!Array.isArray(db.media)) db.media = buildSeedMedia();
      if (!Array.isArray(db.movements)) db.movements = [];
      if (!Array.isArray(db.zones)) db.zones = buildSeedZones();
      if (!Array.isArray(db.orderEvents)) db.orderEvents = buildSeedOrderEvents(db.orders);
      if (!Array.isArray(db.collections)) db.collections = buildSeedCollections(db.products);
      if (!Array.isArray(db.companies)) db.companies = buildSeedCompanies();
      if (!Array.isArray(db.priceLists)) db.priceLists = buildSeedPriceLists();
      if (!Array.isArray(db.bundles)) db.bundles = buildSeedBundles();
      if (!Array.isArray(db.salesChannels)) db.salesChannels = buildSeedSalesChannels();
      if (!Array.isArray(db.showrooms)) db.showrooms = buildSeedShowrooms();
      if (!Array.isArray(db.series)) db.series = buildSeedSeries();
      if (!Array.isArray(db.brands)) db.brands = buildSeedBrands();
      if (!db.homepageSections || typeof db.homepageSections !== "object") db.homepageSections = { bestSellers: { mode: "auto", productIds: [] }, carousel: { mode: "auto", productIds: [] } };
      if (!db.warrantyPage || typeof db.warrantyPage !== "object" || !db.warrantyPage.hero || typeof db.warrantyPage.hero !== "object" || !Array.isArray(db.warrantyPage.tiers) || !Array.isArray(db.warrantyPage.steps) || !Array.isArray(db.warrantyPage.faqs)) db.warrantyPage = cloneWarrantyPage(warrantyPageSeed);
      if (!db.customDesignPage || typeof db.customDesignPage !== "object" || !db.customDesignPage.hero || typeof db.customDesignPage.hero !== "object" || !db.customDesignPage.spaces || !Array.isArray(db.customDesignPage.spaces.items) || !Array.isArray(db.customDesignPage.testimonials)) db.customDesignPage = cloneDoc(CUSTOM_DESIGN_PAGE_SEED);
      if (!db.virtualShowroomPage || typeof db.virtualShowroomPage !== "object" || !db.virtualShowroomPage.hero || typeof db.virtualShowroomPage.hero !== "object" || !Array.isArray(db.virtualShowroomPage.features)) db.virtualShowroomPage = cloneDoc(VIRTUAL_SHOWROOM_PAGE_SEED);
      if (!Array.isArray(db.pages)) db.pages = buildSeedPages();
      else db.pages = db.pages.filter((pg) => pg && typeof pg === "object" && typeof pg.slug === "string" && pg.doc && Array.isArray(pg.doc.content) && (pg.kind === "page" || pg.kind === "chrome"));
      if (!Array.isArray(db.pageFolders)) db.pageFolders = buildSeedPageFolders();
      else db.pageFolders = db.pageFolders.filter((f) => f && typeof f === "object" && typeof f.id === "string" && typeof f.name === "string");
      // one-time (2026-11-07): swap the untouched starter "home" page for the real storefront mirror.
      // Browsers that already persisted edits keep them — the swap only fires for the pristine starter template.
      try {
        if (localStorage.getItem(PAGES_HOME_V2_KEY) !== "1") {
          const home = db.pages.find((pg) => pg.slug === "home" && pg.kind === "page");
          const isPristineStarter =
            !!home && Array.isArray(home.doc?.content) &&
            home.doc.content.some((b) => typeof b.props?.id === "string" && b.props.id.startsWith("pb-seed-"));
          if (isPristineStarter) {
            const seed = buildSeedPages()[0];
            db.pages = db.pages.map((pg) => (pg.slug === "home" && pg.kind === "page" ? seed : pg));
          }
          localStorage.setItem(PAGES_HOME_V2_KEY, "1");
        }
      } catch {
        /* migration unavailable — page stays as stored; nothing crashes */
      }
      for (const p of db.products) if (p.brandId === undefined) p.brandId = "woodex";
      if (!Array.isArray(db.materials)) db.materials = buildSeedMaterials();
      if (!Array.isArray(db.projects)) db.projects = buildSeedProjects();
      if (!Array.isArray(db.blogPosts)) db.blogPosts = buildSeedBlogPosts();
      if (!Array.isArray(db.services)) db.services = buildSeedServices();
      if (!Array.isArray(db.returns)) db.returns = buildSeedReturns(db.orders);
      if (!Array.isArray(db.exchanges)) db.exchanges = buildSeedExchanges(db.orders, db.products);
      if (!Array.isArray(db.claims)) db.claims = buildSeedClaims(db.orders);
      if (!Array.isArray(db.draftOrders)) db.draftOrders = buildSeedDraftOrders(db.products);
      if (!Array.isArray(db.quotes)) db.quotes = buildSeedQuotes(db.products);
      if (!Array.isArray(db.suppliers)) db.suppliers = buildSeedSuppliers();
      if (!Array.isArray(db.purchaseOrders)) db.purchaseOrders = buildSeedPurchaseOrders(db.products);
      if (!Array.isArray(db.stockTransfers)) db.stockTransfers = buildSeedTransfers(db.products);
      if (!Array.isArray(db.optionSets)) db.optionSets = buildSeedOptionSets();
      for (const o of db.orders) {
        if (!o.channelId) o.channelId = channelFor(o.customerEmail ?? "", o.subtotal ?? 0);
      }
      if (!db.inventoryMeta || typeof db.inventoryMeta !== "object" || Array.isArray(db.inventoryMeta)) db.inventoryMeta = buildInventoryMeta(db.products);
      db.products.forEach((p, i) => {
        if (!p.sku) p.sku = `WDX-${String(i + 1001).padStart(4, "0")}`;
        if (!p.stockStatus) p.stockStatus = p.stock === 0 ? "out_of_stock" : "in_stock";
        if (!db.inventoryMeta[p.id]) db.inventoryMeta[p.id] = defaultInventoryMeta(p.id);
      });
      // legacy categories: synthesise an order + re-root dangling parents
      if (Array.isArray(db.categories)) {
        db.categories.forEach((c, i2) => {
          if (typeof c.sortOrder !== "number") c.sortOrder = i2;
          if (c.parentId && !db.categories.some((x) => x.id === c.parentId)) delete c.parentId;
        });
      }
      memory = db;
      return memory;
    }
  } catch { /* corrupted → reseed */ }
  memory = buildSeed();
  persist(memory);
  return memory;
}

const update = (fn: (db: DemoDb) => void) => {
  const db = loadDb();
  fn(db);
  persist(db);
};

/* ── query helpers ──────────────────────────────────────────────────────── */
const matchQuery = (q: string | undefined, haystacks: Array<string | undefined>) => {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return haystacks.some((h) => h?.toLowerCase().includes(needle));
};

/** Next catalogue SKU: max numeric suffix + 1 (seeds live at WDX-1001…). */
function nextProductSku(db: DemoDb): string {
  let max = 1000;
  for (const p of db.products) {
    const n = Number(String(p.sku ?? "").replace(/\D/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `WDX-${String(max + 1).padStart(4, "0")}`;
}

function paginate<T>(items: T[], { page = 1, perPage = 10, sort, direction }: ListParams) {
  if (sort) {
    const dir = direction === "desc" ? -1 : 1;
    items = [...items].sort((a, b) => {
      const ka = (a as unknown as Record<string, number | string>)[sort];
      const kb = (b as unknown as Record<string, number | string>)[sort];
      const cmp = typeof ka === "string" ? String(ka).localeCompare(String(kb)) : (Number(ka) || 0) - (Number(kb) || 0);
      return cmp * dir;
    });
  }
  const total = items.length;
  const start = (page - 1) * perPage;
  return { items: items.slice(start, start + perPage), total, page, perPage };
}

const PKR = (n: number) => n; // amounts stay numeric; UI formats with Intl.NumberFormat
const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.trunc(Number(n) || 0)));

/** Keeps stock/inStock/stockStatus coherent. `made_to_order` is preserved (built to order, shelf qty not relevant). */
const syncFulfilment = (p: AdminProduct) => {
  if (p.stockStatus !== "made_to_order") p.stockStatus = p.stock > 0 ? "in_stock" : "out_of_stock";
  p.inStock = p.stock > 0;
};

const inventoryItemFor = (db: DemoDb, p: AdminProduct): AdminInventoryItem => {
  const meta = db.inventoryMeta[p.id] ?? defaultInventoryMeta(p.id);
  return {
    productId: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    image: p.image,
    quantity: p.stock,
    lowStockThreshold: meta.lowStockThreshold,
    location: meta.location,
    stockStatus: p.stockStatus,
    lastUpdated: meta.lastUpdated,
  };
};

const touchProductMeta = (db: DemoDb, productId: string) => {
  const meta = (db.inventoryMeta[productId] ??= defaultInventoryMeta(productId));
  meta.lastUpdated = new Date().toISOString();
};

export const demoAdminApi: AdminApi = {
  async getDashboardStats(): Promise<DashboardStats> {
    const db = loadDb();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const live = db.orders.filter((o) => o.status !== "cancelled");
    const today = live.filter((o) => new Date(o.placedAt).getTime() >= startOfDay);
    const mtd = live.filter((o) => new Date(o.placedAt).getTime() >= startOfMonth);
    const revenueMtd = mtd.reduce((s, o) => s + o.total, 0);
    return {
      revenueToday: PKR(today.reduce((s, o) => s + o.total, 0)),
      revenueMtd: PKR(revenueMtd),
      ordersToday: today.length,
      ordersMtd: mtd.length,
      averageOrderValue: mtd.length ? Math.round(revenueMtd / mtd.length) : 0,
      pendingOrders: db.orders.filter((o) => o.status === "pending" || o.status === "processing").length,
      newLeads: db.leads.filter((l) => l.status === "new").length,
      lowStockProducts: db.products.filter((p) => p.inStock && p.stock < 10).length,
    };
  },

  async getRevenueSeries(days: number): Promise<RevenuePoint[]> {
    const db = loadDb();
    const out: RevenuePoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = d.toDateString();
      const dayOrders = db.orders.filter((o) => o.status !== "cancelled" && new Date(o.placedAt).toDateString() === dayKey);
      out.push({
        label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        revenue: dayOrders.reduce((s, o) => s + o.total, 0),
        orders: dayOrders.length,
      });
    }
    return out;
  },

  async listProducts(params = {}) {
    const db = loadDb();
    let items = [...db.products];
    if (params.category) items = items.filter((p) => p.category === params.category);
    if (params.brandId) items = items.filter((p) => p.brandId === params.brandId);
    if (typeof params.inStock === "boolean") items = items.filter((p) => p.inStock === params.inStock);
    items = items.filter((p) => matchQuery(params.query, [p.name, p.category, p.id, p.sku]));
    if (!params.sort) items.sort((a, b) => b.reviews - a.reviews);
    return paginate(items, { page: params.page, perPage: params.perPage ?? 10, sort: params.sort, direction: params.direction });
  },

  async createProduct(input) {
    let created: AdminProduct | undefined;
    update((db) => {
      const p: AdminProduct = {
        id: `prod-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        name: input.name.trim(),
        category: input.category,
        subcategory: input.subcategory,
        brandId: "woodex",
        sku: nextProductSku(db),
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        image: input.image,
        inStock: input.stock > 0,
        stock: input.stock,
        stockStatus: input.stockStatus ?? (input.stock > 0 ? "in_stock" : "out_of_stock"),
        isBestSeller: input.isBestSeller ?? false,
        rating: 0,
        reviews: 0,
        dimensions: input.dimensions,
        weightKg: input.weightKg,
        optionSetIds: optionSetIdsFor({ subcategory: input.subcategory, category: input.category }),
        images: input.image ? [input.image] : undefined,
      };
      syncFulfilment(p);
      if (input.stockStatus === "made_to_order") p.stockStatus = "made_to_order";
      db.products.push(p);
      db.inventoryMeta[p.id] = { ...defaultInventoryMeta(p.id), lastUpdated: new Date().toISOString() };
      created = { ...p };
    });
    if (!created) throw new Error("Failed to create product");
    return created;
  },

  async duplicateProduct(id) {
    let copy: AdminProduct | undefined;
    update((db) => {
      const src = db.products.find((x) => x.id === id);
      if (!src) return;
      const p: AdminProduct = {
        ...src,
        id: `prod-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        name: `${src.name} (Copy)`,
        sku: nextProductSku(db),
        reviews: 0,
        rating: 0,
        stock: 0,
        inStock: false,
        stockStatus: src.stockStatus === "made_to_order" ? "made_to_order" : "out_of_stock",
      };
      if (p.stockStatus !== "made_to_order") syncFulfilment(p);
      db.products.push(p);
      db.inventoryMeta[p.id] = { ...defaultInventoryMeta(p.id), lastUpdated: new Date().toISOString() };
      copy = { ...p };
    });
    return copy;
  },

  async deleteProduct(id) {
    let removed = false;
    update((db) => {
      const before = db.products.length;
      db.products = db.products.filter((p) => p.id !== id);
      removed = db.products.length < before;
      if (removed) delete db.inventoryMeta[id];
    });
    return removed;
  },

  /** Administrative import — no ledger movements (physical stock unchanged; meta.lastUpdated is). */
  async importProductsCsv(rows) {
    const errors: { row: number; message: string }[] = [];
    let created = 0, updated = 0, skipped = 0;
    update((db) => {
      const byId = new Map(db.products.map((p) => [p.id, p] as const));
      const bySku = new Map(db.products.map((p) => [String(p.sku).toLowerCase(), p] as const));
      const touch = (p: AdminProduct) => {
        const meta = (db.inventoryMeta[p.id] ??= defaultInventoryMeta(p.id));
        meta.lastUpdated = new Date().toISOString();
      };
      rows.forEach((row, i) => {
        const rowNo = i + 1;
        if (!row.name?.trim() && !row.id && !row.sku) { skipped += 1; return; }
        const match = (row.id ? byId.get(row.id) : undefined) ?? (row.sku ? bySku.get(String(row.sku).toLowerCase()) : undefined);
        const stockChange = row.stock !== undefined;
        const explicitStatus = row.stockStatus !== undefined;
        if (match) {
          const p = match;
          if (row.name?.trim()) p.name = row.name.trim();
          if (row.category) p.category = row.category;
          if (row.subcategory !== undefined) p.subcategory = row.subcategory;
          if (row.price !== undefined) p.price = row.price;
          if (row.compareAtPrice !== undefined) p.compareAtPrice = row.compareAtPrice;
          if (stockChange) p.stock = row.stock;
          if (row.inStock !== undefined) p.inStock = row.inStock;
          if (row.rating !== undefined) p.rating = row.rating;
          if (row.reviews !== undefined) p.reviews = row.reviews;
          if (row.isBestSeller !== undefined) p.isBestSeller = row.isBestSeller;
          if (row.dimensions !== undefined) p.dimensions = row.dimensions;
          if (row.weightKg !== undefined) p.weightKg = row.weightKg;
          if (explicitStatus) {
            p.stockStatus = row.stockStatus!;
            if (p.stockStatus === "out_of_stock") p.inStock = false;
            else if (p.stockStatus === "in_stock") p.inStock = true;
          } else if (stockChange) {
            syncFulfilment(p);
          }
          touch(p);
          updated += 1;
          return;
        }
        if (!row.name?.trim()) { errors.push({ row: rowNo, message: "name is required for new products" }); return; }
        if (!row.category) { errors.push({ row: rowNo, message: `category is required to create “${row.name.trim()}”` }); return; }
        if (row.price === undefined || Number.isNaN(row.price) || row.price < 0) {
          errors.push({ row: rowNo, message: `a valid price is required to create “${row.name.trim()}”` });
          return;
        }
        const p: AdminProduct = {
          id: `prod-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}-${rowNo}`,
          name: row.name.trim(),
          category: row.category,
          subcategory: row.subcategory,
          sku: row.sku?.trim() ? row.sku.trim().toUpperCase() : nextProductSku(db),
          price: row.price,
          compareAtPrice: row.compareAtPrice,
          image: undefined,
          inStock: (row.stock ?? 0) > 0,
          stock: row.stock ?? 0,
          stockStatus: row.stockStatus ?? ((row.stock ?? 0) > 0 ? "in_stock" : "out_of_stock"),
          isBestSeller: row.isBestSeller ?? false,
          rating: row.rating ?? 0,
          reviews: row.reviews ?? 0,
          dimensions: row.dimensions,
          weightKg: row.weightKg,
        };
        syncFulfilment(p);
        if (p.stockStatus === "made_to_order") p.inStock = p.stock > 0;
        bySku.set(String(p.sku).toLowerCase(), p);
        db.products.push(p);
        db.inventoryMeta[p.id] = { ...defaultInventoryMeta(p.id), lastUpdated: new Date().toISOString() };
        created += 1;
      });
    });
    return { created, updated, skipped, errors };
  },

  async updateProduct(id, patch) {
    let updated: AdminProduct | undefined;
    update((db) => {
      const p = db.products.find((x) => x.id === id);
      if (!p) return;
      const explicitStatus = patch.stockStatus !== undefined;
      Object.assign(p, patch);
      if (!explicitStatus && patch.stock !== undefined) syncFulfilment(p);      // shelf qty changed → derive fulfilment from it
      if (patch.stock !== undefined) touchProductMeta(db, p.id);
      if (explicitStatus && p.stockStatus === "out_of_stock") p.inStock = false;
      else if (explicitStatus && p.stock > 0) p.inStock = true;
      updated = { ...p };
    });
    return updated;
  },

  async listOrders(params = {}) {
    const db = loadDb();
    let items = [...db.orders].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
    if (params.status && params.status !== "all") items = items.filter((o) => o.status === params.status);
    items = items.filter((o) => matchQuery(params.query, [o.id, o.customerName, o.city, o.customerPhone]));
    return paginate(items, { page: params.page, perPage: params.perPage ?? 10 });
  },

  async getOrder(id) {
    return loadDb().orders.find((o) => o.id === id);
  },

  async updateOrderStatus(id, status, options) {
    let updated: AdminOrder | undefined;
    update((db) => {
      const o = db.orders.find((x) => x.id === id);
      if (!o) return;
      const from = o.status;
      if (options?.courierName !== undefined) o.courierName = options.courierName.trim() || undefined;
      if (options?.trackingNumber !== undefined) o.trackingNumber = options.trackingNumber.trim() || undefined;
      if (options?.internalNote?.trim()) {
        o.internalNotes = [o.internalNotes, options.internalNote.trim()].filter(Boolean).join("\n");
      }
      const now = new Date().toISOString();
      const note =
        options?.internalNote?.trim() ??
        (status === "shipped" ? "Dispatched — handed to courier"
          : status === "delivered" ? "Delivered"
          : status === "cancelled" ? "Order cancelled"
          : status === "processing" ? "Payment confirmed — preparing for dispatch"
          : undefined);
      if (from !== status) {
        o.status = status;
      }
      (db.orderEvents ??= []).push({
        id: `ev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        orderId: o.id,
        fromStatus: from !== status ? from : undefined,
        toStatus: from !== status ? status : undefined,
        note,
        createdAt: now,
      });

      // stock sync — shipped deducts; cancel only restocks what was already dispatched
      if (from !== "shipped" && status === "shipped") {
        for (const line of o.items) adjustLineStock(db, o.id, line, "out", "Dispatch", now);
      } else if (status === "cancelled") {
        const hadShipped = (db.orderEvents ?? []).some((e) => e.orderId === o.id && e.toStatus === "shipped");
        if (hadShipped) for (const line of o.items) adjustLineStock(db, o.id, line, "in", "Return to stock on cancellation —", now);
      }
      updated = { ...o };
    });
    return updated;
  },

  async updateOrderCourier(id, patch) {
    let updated: AdminOrder | undefined;
    update((db) => {
      const o = db.orders.find((x) => x.id === id);
      if (!o) return;
      if (patch.courierName !== undefined) o.courierName = patch.courierName.trim() || undefined;
      if (patch.trackingNumber !== undefined) o.trackingNumber = patch.trackingNumber.trim() || undefined;
      if (patch.internalNotes !== undefined) o.internalNotes = patch.internalNotes.trim() || undefined;
      const now = new Date().toISOString();
      const noteBits = [
        patch.courierName !== undefined ? `courier → ${patch.courierName.trim() || "—"}` : "",
        patch.trackingNumber !== undefined ? `consignment → ${patch.trackingNumber.trim() || "—"}` : "",
      ].filter(Boolean).join(", ");
      (db.orderEvents ??= []).push({
        id: `ev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        orderId: o.id,
        fromStatus: undefined,
        toStatus: undefined,
        note: noteBits ? `Dispatch details: ${noteBits}` : "Dispatch details updated",
        createdAt: now,
      });
      updated = { ...o };
    });
    return updated;
  },

  async getOrderEvents(orderId) {
    return [...(loadDb().orderEvents ?? [])]
      .filter((e) => e.orderId === orderId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async listCustomers(params = {}) {
    const db = loadDb();
    let items = [...db.customers].sort((a, b) => b.totalSpent - a.totalSpent);
    if (params.type && params.type !== "all") items = items.filter((c) => c.type === params.type);
    items = items.filter((c) => matchQuery(params.query, [c.name, c.company, c.email, c.city, c.phone]));
    return paginate(items, { page: params.page, perPage: params.perPage ?? 10 });
  },

  async getCustomer(id) {
    return loadDb().customers.find((c) => c.id === id);
  },

  async listLeads(params = {}) {
    const db = loadDb();
    let items = [...db.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (params.type && params.type !== "all") items = items.filter((l) => l.type === params.type);
    if (params.status && params.status !== "all") items = items.filter((l) => l.status === params.status);
    items = items.filter((l) => matchQuery(params.query, [l.name, l.company, l.city, l.phone, l.summary]));
    return paginate(items, { page: params.page, perPage: params.perPage ?? 10 });
  },

  async updateLeadStatus(id, status) {
    let updated: AdminLead | undefined;
    update((db) => {
      const l = db.leads.find((x) => x.id === id);
      if (l) { l.status = status; updated = { ...l }; }
    });
    return updated;
  },

  async getSettings() {
    return { ...loadDb().settings };
  },

  async saveSettings(settings) {
    update((db) => { db.settings = { ...settings }; });
    return { ...settings };
  },

  async listCompanies() {
    return [...(loadDb().companies ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  },

  async listPriceLists() {
    return [...(loadDb().priceLists ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  },

  async createPriceList(input) {
    let created: AdminPriceList | undefined;
    update((db) => {
      const name = input.name.trim();
      if (!name) return;
      const now = new Date().toISOString();
      created = {
        id: `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        name,
        description: input.description?.trim() || undefined,
        status: "draft", // born as draft — owner activates deliberately
        audience: input.audience,
        companyIds: [...new Set(input.companyIds ?? [])].filter((id) => db.companies.some((c) => c.id === id)),
        target: input.target,
        categoryIds: [...new Set(input.categoryIds ?? [])],
        discountPct: clampPct(input.discountPct),
        startsAt: isoDate(input.startsAt),
        endsAt: isoDate(input.endsAt),
        createdAt: now,
        updatedAt: now,
      };
      (db.priceLists ??= []).push(created);
    });
    if (!created) throw new Error("Give the price list a name.");
    return created;
  },

  async updatePriceList(id, patch) {
    let updated: AdminPriceList | undefined;
    update((db) => {
      const list = (db.priceLists ??= []).find((x) => x.id === id);
      if (!list) return;
      if (patch.name !== undefined) { const n = patch.name.trim(); if (n) list.name = n; }
      if (patch.description !== undefined) list.description = patch.description?.trim() || undefined;
      if (patch.audience !== undefined) list.audience = patch.audience;
      if (patch.companyIds !== undefined) list.companyIds = [...new Set(patch.companyIds)].filter((cid) => db.companies.some((c) => c.id === cid));
      if (patch.target !== undefined) list.target = patch.target;
      if (patch.categoryIds !== undefined) list.categoryIds = [...new Set(patch.categoryIds)];
      if (patch.discountPct !== undefined) list.discountPct = clampPct(patch.discountPct);
      if (patch.startsAt !== undefined) list.startsAt = isoDate(patch.startsAt);
      if (patch.endsAt !== undefined) list.endsAt = isoDate(patch.endsAt);
      list.updatedAt = new Date().toISOString();
      updated = { ...list, companyIds: [...list.companyIds], categoryIds: [...list.categoryIds] };
    });
    return updated;
  },

  async setPriceListStatus(id, status: PriceListStatus) {
    let updated: AdminPriceList | undefined;
    update((db) => {
      const list = (db.priceLists ??= []).find((x) => x.id === id);
      if (!list) return;
      list.status = status;
      list.updatedAt = new Date().toISOString();
      updated = { ...list, companyIds: [...list.companyIds], categoryIds: [...list.categoryIds] };
    });
    return updated;
  },

  async deletePriceList(id) {
    let ok = false;
    update((db) => {
      const arr = (db.priceLists ??= []);
      const i = arr.findIndex((x) => x.id === id);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  async bulkUpdateProducts(ids, patch) {
    const wanted = new Set(ids);
    if (wanted.size === 0) return { updated: 0 };
    let updated = 0;
    update((db) => {
      const round10 = (n: number) => Math.max(1, Math.round(n / 10) * 10);
      for (const p of db.products) {
        if (!wanted.has(p.id)) continue;
        switch (patch.kind) {
          case "pricePct": {
            const pct = Math.max(-50, Math.min(100, patch.pct));
            const apply = (n: number) => round10(n * (1 + pct / 100));
            p.price = apply(p.price);
            if (patch.includeCompareAt && p.compareAtPrice !== undefined) {
              p.compareAtPrice = apply(p.compareAtPrice);
              if (p.compareAtPrice < p.price) delete p.compareAtPrice;
            } else if (p.compareAtPrice !== undefined && p.compareAtPrice < p.price) {
              delete p.compareAtPrice;
            }
            updated++;
            break;
          }
          case "markOnSale": {
            const pct = Math.max(1, Math.min(60, Math.floor(patch.pct)));
            const candidate = round10(p.price * (1 - pct / 100));
            if (candidate >= p.price) break; // rounding collapsed — skip rather than zero-difference "sale"
            p.compareAtPrice = p.price;
            p.price = candidate;
            updated++;
            break;
          }
          case "clearSale":
            if (p.compareAtPrice !== undefined) { delete p.compareAtPrice; updated++; }
            break;
          case "stockStatus":
            p.stockStatus = patch.status;
            if (patch.status === "out_of_stock") { p.stock = 0; p.inStock = false; }
            else if (patch.status === "in_stock") { if (p.stock === 0) p.stock = 1; p.inStock = true; }
            else p.inStock = true; // made_to_order is sellable — qty untouched
            break;
          case "bestSeller":
            p.isBestSeller = Boolean(patch.value);
            updated++;
            break;
          case "brand": {
            const brand = (db.brands ?? []).find((b) => b.id === patch.brandId);
            if (!brand) break; // unknown brand — refuse silently rather than orphan FK
            p.brandId = brand.id;
            updated++;
            break;
          }
          case "stockDelta":
            p.stock = Math.max(0, p.stock + Math.trunc(patch.delta));
            touchProductMeta(db, p.id);
            syncFulfilment(p);
            updated++;
            break;
        }
      }
    });
    return { updated };
  },

  async listSalesChannels() {
    return [...(loadDb().salesChannels ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((c) => ({ ...c }));
  },

  async createSalesChannel(input) {
    let created: AdminSalesChannel | undefined;
    update((db) => {
      const name = input.name.trim();
      if (!name) return;
      const kinds = new Set(["web", "whatsapp", "instagram", "phone", "showroom", "b2b"]);
      const now = new Date().toISOString();
      const maxOrder = Math.max(0, ...(db.salesChannels ?? []).map((c) => c.sortOrder));
      created = {
        id: `ch-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        name,
        kind: kinds.has(input.kind) ? input.kind : "web",
        description: input.description?.trim() || undefined,
        enabled: input.enabled ?? true,
        sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : maxOrder + 10,
        createdAt: now,
        updatedAt: now,
      };
      (db.salesChannels ??= []).push(created);
    });
    if (!created) throw new Error("Give the channel a name.");
    return created;
  },

  async updateSalesChannel(id, patch) {
    let updated: AdminSalesChannel | undefined;
    update((db) => {
      const ch = (db.salesChannels ??= []).find((x) => x.id === id);
      if (!ch) return;
      if (patch.name !== undefined) { const n = patch.name.trim(); if (n) ch.name = n; }
      if (patch.kind !== undefined) ch.kind = patch.kind;
      if (patch.description !== undefined) ch.description = patch.description?.trim() || undefined;
      if (patch.enabled !== undefined) ch.enabled = Boolean(patch.enabled);
      if (patch.sortOrder !== undefined) ch.sortOrder = patch.sortOrder;
      ch.updatedAt = new Date().toISOString();
      updated = { ...ch };
    });
    return updated;
  },

  async setSalesChannelEnabled(id, enabled: boolean) {
    let updated: AdminSalesChannel | undefined;
    update((db) => {
      const ch = (db.salesChannels ??= []).find((x) => x.id === id);
      if (!ch) return;
      ch.enabled = Boolean(enabled);
      ch.updatedAt = new Date().toISOString();
      updated = { ...ch };
    });
    return updated;
  },

  async deleteSalesChannel(id) {
    if (id === "ch-web") throw new Error("Online Store is the storefront default — disable it instead of deleting.");
    const db = loadDb();
    const attributed = db.orders.filter((o) => o.channelId === id).length;
    if (attributed > 0) throw new Error(`${attributed} order(s) are attributed to this channel — disable it instead of deleting.`);
    let ok = false;
    update((db2) => {
      const arr = (db2.salesChannels ??= []);
      const i = arr.findIndex((x) => x.id === id);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  async getChannelSales() {
    const db = loadDb();
    const agg = new Map<string, { channelId: string; orders: number; revenue: number }>();
    for (const o of db.orders) {
      if (o.status === "cancelled") continue;
      const cid = o.channelId ?? "ch-web";
      const a = agg.get(cid) ?? { channelId: cid, orders: 0, revenue: 0 };
      a.orders += 1;
      a.revenue += o.total;
      agg.set(cid, a);
    }
    return [...agg.values()].sort((x, y) => y.revenue - x.revenue);
  },

  async listShowrooms() {
    return [...(loadDb().showrooms ?? [])].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => ({ ...r }));
  },

  async createShowroom(input) {
    let created: AdminShowroom | undefined;
    update((db) => {
      const name = input.name.trim(); const city = input.city.trim(); const address = input.address.trim(); const phone = input.phone.trim(); const hours = input.hours.trim();
      if (!name || !city || !address || !phone || !hours) return;
      const now = new Date().toISOString();
      const maxOrder = Math.max(0, ...(db.showrooms ?? []).map((r) => r.sortOrder));
      if (input.isHQ) (db.showrooms ??= []).forEach((r) => { r.isHQ = false; });
      created = {
        id: `sr-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        name, city, address, phone,
        whatsapp: input.whatsapp?.trim() || undefined,
        hours,
        lat: typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : undefined,
        lng: typeof input.lng === "number" && Number.isFinite(input.lng) ? input.lng : undefined,
        isHQ: Boolean(input.isHQ),
        active: input.active ?? true,
        sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : maxOrder + 10,
        createdAt: now,
        updatedAt: now,
      };
      (db.showrooms ??= []).push(created);
    });
    if (!created) throw new Error("Name, city, address, phone and hours are required.");
    return created;
  },

  async updateShowroom(id, patch) {
    let updated: AdminShowroom | undefined;
    update((db) => {
      const room = (db.showrooms ??= []).find((x) => x.id === id);
      if (!room) return;
      if (patch.isHQ === true) (db.showrooms ?? []).forEach((r) => { if (r.id !== id) r.isHQ = false; });
      for (const key of ["name", "city", "address", "phone", "hours"] as const) {
        const v = patch[key];
        if (typeof v === "string" && v.trim()) room[key] = v.trim();
      }
      if (patch.whatsapp !== undefined) room.whatsapp = patch.whatsapp?.trim() || undefined;
      if (patch.lat !== undefined) room.lat = typeof patch.lat === "number" && Number.isFinite(patch.lat) ? patch.lat : undefined;
      if (patch.lng !== undefined) room.lng = typeof patch.lng === "number" && Number.isFinite(patch.lng) ? patch.lng : undefined;
      if (patch.isHQ !== undefined) room.isHQ = Boolean(patch.isHQ);
      if (patch.active !== undefined) room.active = Boolean(patch.active);
      if (patch.sortOrder !== undefined) room.sortOrder = patch.sortOrder;
      room.updatedAt = new Date().toISOString();
      updated = { ...room };
    });
    return updated;
  },

  async setShowroomActive(id, active: boolean) {
    let updated: AdminShowroom | undefined;
    update((db) => {
      const room = (db.showrooms ??= []).find((x) => x.id === id);
      if (!room) return;
      room.active = Boolean(active);
      room.updatedAt = new Date().toISOString();
      updated = { ...room };
    });
    return updated;
  },

  async deleteShowroom(id) {
    let ok = false;
    update((db) => {
      const arr = (db.showrooms ??= []);
      const i = arr.findIndex((x) => x.id === id);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  async listSeries() {
    return [...(loadDb().series ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((r) => ({ ...r, features: [...r.features] }));
  },

  async createSeries(input: NewSeriesInput) {
    let created: AdminSeries | undefined;
    update((db) => {
      const arr = (db.series ??= []);
      const name = input.name.trim();
      if (!name) return;
      const base = (input.id?.trim() || name
        .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
      if (!base || arr.some((x) => x.id === base)) return;
      const now = new Date().toISOString();
      const maxOrder = Math.max(0, ...arr.map((r) => r.sortOrder));
      created = {
        id: base,
        name,
        tagline: input.tagline.trim(),
        badge: input.badge.trim(),
        description: input.description.trim(),
        features: input.features.map((f) => f.trim()).filter(Boolean),
        color: input.color.trim() || "#5a7a3a",
        active: input.active ?? true,
        sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : maxOrder + 10,
        createdAt: now,
        updatedAt: now,
      };
      arr.push(created);
    });
    if (!created) throw new Error("A series with that slug already exists, or the name is empty.");
    return created;
  },

  async updateSeries(id: string, patch: Partial<NewSeriesInput>) {
    let updated: AdminSeries | undefined;
    update((db) => {
      const room = (db.series ??= []).find((x) => x.id === id);
      if (!room) return;
      if (typeof patch.name === "string" && patch.name.trim()) room.name = patch.name.trim();
      if (typeof patch.tagline === "string") room.tagline = patch.tagline.trim();
      if (typeof patch.badge === "string") room.badge = patch.badge.trim();
      if (typeof patch.description === "string") room.description = patch.description.trim();
      if (Array.isArray(patch.features)) room.features = patch.features.map((f) => f.trim()).filter(Boolean);
      if (typeof patch.color === "string" && patch.color.trim()) room.color = patch.color.trim();
      if (patch.active !== undefined) room.active = Boolean(patch.active);
      if (patch.sortOrder !== undefined && Number.isFinite(patch.sortOrder)) room.sortOrder = patch.sortOrder;
      room.updatedAt = new Date().toISOString();
      updated = { ...room, features: [...room.features] };
    });
    return updated;
  },

  async setSeriesActive(id: string, active: boolean) {
    let updated: AdminSeries | undefined;
    update((db) => {
      const room = (db.series ??= []).find((x) => x.id === id);
      if (!room) return;
      room.active = Boolean(active);
      room.updatedAt = new Date().toISOString();
      updated = { ...room, features: [...room.features] };
    });
    return updated;
  },

  async deleteSeries(id: string) {
    if (products.some((p) => p.series === id)) return false; // referenced by the static catalogue
    let ok = false;
    update((db) => {
      const arr = (db.series ??= []);
      const i = arr.findIndex((x) => x.id === id);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  async listBrands() {
    return [...(loadDb().brands ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((r) => ({ ...r }));
  },

  async createBrand(input: NewBrandInput) {
    let created: AdminBrand | undefined;
    update((db) => {
      const arr = (db.brands ??= []);
      const name = input.name.trim();
      if (!name) return;
      const base = (input.id?.trim() || name
        .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
      if (!base || arr.some((x) => x.id === base)) return;
      const now = new Date().toISOString();
      const maxOrder = Math.max(0, ...arr.map((r) => r.sortOrder));
      created = {
        id: base,
        name,
        tagline: input.tagline.trim(),
        description: input.description.trim(),
        logo: input.logo?.trim() || undefined,
        website: input.website?.trim() || undefined,
        active: input.active ?? true,
        sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : maxOrder + 10,
        createdAt: now,
        updatedAt: now,
      };
      arr.push(created);
    });
    if (!created) throw new Error("A brand with that slug already exists, or the name is empty.");
    return created;
  },

  async updateBrand(id: string, patch: Partial<NewBrandInput>) {
    let updated: AdminBrand | undefined;
    update((db) => {
      const room = (db.brands ??= []).find((x) => x.id === id);
      if (!room) return;
      if (typeof patch.name === "string" && patch.name.trim()) room.name = patch.name.trim();
      if (typeof patch.tagline === "string") room.tagline = patch.tagline.trim();
      if (typeof patch.description === "string") room.description = patch.description.trim();
      if (patch.logo !== undefined) room.logo = patch.logo?.trim() || undefined;
      if (patch.website !== undefined) room.website = patch.website?.trim() || undefined;
      if (patch.active !== undefined) room.active = Boolean(patch.active);
      if (patch.sortOrder !== undefined && Number.isFinite(patch.sortOrder)) room.sortOrder = patch.sortOrder;
      room.updatedAt = new Date().toISOString();
      updated = { ...room };
    });
    return updated;
  },

  async setBrandActive(id: string, active: boolean) {
    let updated: AdminBrand | undefined;
    update((db) => {
      const room = (db.brands ??= []).find((x) => x.id === id);
      if (!room) return;
      room.active = Boolean(active);
      room.updatedAt = new Date().toISOString();
      updated = { ...room };
    });
    return updated;
  },

  async deleteBrand(id: string) {
    let ok = false;
    update((db) => {
      if ((db.products ?? []).some((p) => p.brandId === id)) return; // referenced by products — refuse
      const arr = (db.brands ??= []);
      const i = arr.findIndex((x) => x.id === id);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  async getHomepageSections() {
    const sections = loadDb().homepageSections ?? HOMEPAGE_SECTIONS_SEED;
    const cloneRail = (r: AdminHomepageSections["bestSellers"]): AdminHomepageSections["bestSellers"] =>
      ({ mode: r.mode === "manual" ? "manual" : "auto", productIds: [...r.productIds] });
    return { bestSellers: cloneRail(sections.bestSellers), carousel: cloneRail(sections.carousel) };
  },

  async updateHomepageSections(patch) {
    const validRail = (r: AdminHomepageSections["bestSellers"] | undefined) => {
      if (!r) return undefined;
      if (r.mode !== "auto" && r.mode !== "manual") throw new Error('Rail mode must be "auto" or "manual".');
      return r;
    };
    validRail(patch.bestSellers);
    validRail(patch.carousel);
    let merged: AdminHomepageSections | undefined;
    update((db) => {
      const current = (db.homepageSections ??= {
        bestSellers: { mode: "auto", productIds: [] },
        carousel: { mode: "auto", productIds: [] },
      });
      const knownIds = new Set((db.products ?? []).map((p) => p.id));
      const applyRail = (name: "bestSellers" | "carousel", rail: AdminHomepageSections["bestSellers"] | undefined) => {
        if (!rail) return;
        if (rail.mode === "auto") {
          current[name] = { mode: "auto", productIds: [] };
          return;
        }
        const ids = [...new Set(rail.productIds)].filter((id) => knownIds.has(id)).slice(0, 12);
        current[name] = { mode: "manual", productIds: ids };
      };
      applyRail("bestSellers", patch.bestSellers);
      applyRail("carousel", patch.carousel);
      merged = {
        bestSellers: { mode: current.bestSellers.mode, productIds: [...current.bestSellers.productIds] },
        carousel: { mode: current.carousel.mode, productIds: [...current.carousel.productIds] },
      };
    });
    if (!merged) throw new Error("Could not persist homepage sections.");
    return merged;
  },

  async getWarrantyPage() {
    return cloneWarrantyPage(loadDb().warrantyPage ?? WARRANTY_PAGE_SEED);
  },

  async updateWarrantyPage(content) {
    const clean = sanitizeWarrantyPage(content);
    update((db) => {
      db.warrantyPage = cloneWarrantyPage(clean);
    });
    return cloneWarrantyPage(clean);
  },

  async resetWarrantyPage() {
    update((db) => {
      db.warrantyPage = cloneWarrantyPage(warrantyPageSeed);
    });
    return cloneWarrantyPage(warrantyPageSeed);
  },

  async getCustomDesignPage() {
    return cloneDoc(loadDb().customDesignPage ?? CUSTOM_DESIGN_PAGE_SEED) as AdminCustomDesignPage;
  },

  async updateCustomDesignPage(content) {
    const clean = sanitizeCustomDesignPage(content);
    update((db) => {
      db.customDesignPage = cloneDoc(clean) as AdminCustomDesignPage;
    });
    return cloneDoc(clean) as AdminCustomDesignPage;
  },

  async resetCustomDesignPage() {
    update((db) => {
      db.customDesignPage = cloneDoc(CUSTOM_DESIGN_PAGE_SEED) as AdminCustomDesignPage;
    });
    return cloneDoc(CUSTOM_DESIGN_PAGE_SEED) as AdminCustomDesignPage;
  },

  async getVirtualShowroomPage() {
    return cloneDoc(loadDb().virtualShowroomPage ?? VIRTUAL_SHOWROOM_PAGE_SEED) as AdminVirtualShowroomPage;
  },

  async updateVirtualShowroomPage(content) {
    const clean = sanitizeVirtualShowroomPage(content);
    update((db) => {
      db.virtualShowroomPage = cloneDoc(clean) as AdminVirtualShowroomPage;
    });
    return cloneDoc(clean) as AdminVirtualShowroomPage;
  },

  async resetVirtualShowroomPage() {
    update((db) => {
      db.virtualShowroomPage = cloneDoc(VIRTUAL_SHOWROOM_PAGE_SEED) as AdminVirtualShowroomPage;
    });
    return cloneDoc(VIRTUAL_SHOWROOM_PAGE_SEED) as AdminVirtualShowroomPage;
  },

  // ------------------------------------------------------------------
  // Pages builder (Wave 1) — demo-DB pages slice (Puck-shaped JSON documents)
  // ------------------------------------------------------------------
  async listPages(kind) {
    const rows = loadDb().pages ?? buildSeedPages();
    const filtered = kind ? rows.filter((pg) => pg.kind === kind) : rows;
    return filtered.map(clonePage);
  },

  async getPage(idOrSlug) {
    const rows = loadDb().pages ?? buildSeedPages();
    const found = rows.find((pg) => pg.id === idOrSlug || pg.slug === idOrSlug);
    return found ? clonePage(found) : undefined;
  },

  async createPage(input) {
    if (!input?.title?.trim()) throw new Error("Page title is required.");
    let created!: AdminPage;
    update((db) => {
      const slug = uniquePageSlug(db.pages, slugifyPage(input.slug?.trim() || input.title));
      const folderId = input.folderId && db.pageFolders.some((f) => f.id === input.folderId) ? input.folderId : null;
      created = {
        id: newPageId(),
        slug,
        title: input.title.trim(),
        kind: input.kind === "chrome" ? "chrome" : "page",
        folderId,
        status: "draft",
        doc: input.starter === "blank" ? blankPageDoc() : starterPageDoc(),
        seo: {},
        updatedAt: new Date().toISOString(),
        publishedAt: null,
        version: 1,
        history: [],
      };
      db.pages = [...db.pages, created];
    });
    return clonePage(created);
  },

  async updatePage(id, patch) {
    const rows = loadDb().pages ?? [];
    const existing = rows.find((pg) => pg.id === id);
    if (!existing) return undefined;
    let updated!: AdminPage;
    update((db) => {
      const target = db.pages.find((pg) => pg.id === id)!;
      const nextSlug = patch.slug !== undefined ? uniquePageSlug(db.pages, slugifyPage(patch.slug), target.id) : target.slug;
      const nextFolderId =
        patch.folderId !== undefined
          ? patch.folderId === null || db.pageFolders.some((f) => f.id === patch.folderId)
            ? patch.folderId
            : target.folderId
          : target.folderId;
      updated = {
        ...target,
        ...(patch.title !== undefined ? { title: patch.title.trim() || target.title } : {}),
        slug: nextSlug,
        folderId: nextFolderId,
        ...(patch.doc !== undefined ? { doc: cloneDoc(patch.doc) } : {}),
        ...(patch.seo !== undefined ? { seo: { ...target.seo, ...patch.seo } } : {}),
        updatedAt: new Date().toISOString(),
      };
      db.pages = db.pages.map((pg) => (pg.id === id ? updated : pg));
    });
    return clonePage(updated);
  },

  async publishPage(id) {
    let updated: AdminPage | undefined;
    update((db) => {
      const target = db.pages.find((pg) => pg.id === id);
      if (!target) return;
      const now = new Date().toISOString();
      const version = (target.version ?? 1) + 1;
      const entry = { version, publishedAt: now, title: target.title, doc: cloneDoc(target.doc) };
      updated = {
        ...target,
        status: "published",
        publishedAt: now,
        updatedAt: now,
        version,
        history: [entry, ...(target.history ?? [])].slice(0, 20),
      };
      db.pages = db.pages.map((pg) => (pg.id === id ? updated! : pg));
    });
    return updated ? clonePage(updated) : undefined;
  },

  async unpublishPage(id) {
    let updated: AdminPage | undefined;
    update((db) => {
      const target = db.pages.find((pg) => pg.id === id);
      if (!target) return;
      updated = { ...target, status: "draft", updatedAt: new Date().toISOString() };
      db.pages = db.pages.map((pg) => (pg.id === id ? updated! : pg));
    });
    return updated ? clonePage(updated) : undefined;
  },

  async duplicatePage(id) {
    const rows = loadDb().pages ?? [];
    const source = rows.find((pg) => pg.id === id);
    if (!source) return undefined;
    let created!: AdminPage;
    update((db) => {
      const now = new Date().toISOString();
      created = {
        ...clonePage(source),
        id: newPageId(),
        title: `${source.title} (copy)`,
        slug: uniquePageSlug(db.pages, `${source.slug}-copy`),
        status: "draft",
        publishedAt: null,
        version: 1,
        history: [],
        updatedAt: now,
      };
      db.pages = [...db.pages, created];
    });
    return clonePage(created);
  },

  async deletePage(id) {
    let removed = false;
    update((db) => {
      const before = db.pages.length;
      db.pages = db.pages.filter((pg) => pg.id !== id);
      removed = db.pages.length < before;
    });
    return removed;
  },

  async revertPage(id, version) {
    let updated: AdminPage | undefined;
    update((db) => {
      const target = db.pages.find((pg) => pg.id === id);
      const entry = target?.history?.find((h) => h.version === version);
      if (!target || !entry) return;
      updated = {
        ...target,
        doc: cloneDoc(entry.doc),
        title: entry.title,
        status: "draft",
        updatedAt: new Date().toISOString(),
      };
      db.pages = db.pages.map((pg) => (pg.id === id ? updated! : pg));
    });
    return updated ? clonePage(updated) : undefined;
  },

  async listPageFolders() {
    const rows = loadDb().pageFolders ?? [];
    return [...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)).map((f) => ({ ...f }));
  },

  async createPageFolder(input) {
    if (!input?.name?.trim()) throw new Error("Folder name is required.");
    let created!: AdminPageFolder;
    update((db) => {
      const parentId = input.parentId && db.pageFolders.some((f) => f.id === input.parentId) ? input.parentId : null;
      const sortOrder = db.pageFolders.reduce((max, f) => Math.max(max, (f.sortOrder ?? 0) + 1), 0);
      created = { id: newFolderId(), name: input.name.trim(), parentId, sortOrder };
      db.pageFolders = [...db.pageFolders, created];
    });
    return { ...created };
  },

  async updatePageFolder(id, patch) {
    let updated: AdminPageFolder | undefined;
    update((db) => {
      const target = db.pageFolders.find((f) => f.id === id);
      if (!target) return;
      let parentId = patch.parentId !== undefined ? patch.parentId : target.parentId;
      if (parentId === id) parentId = target.parentId;
      // cycle guard: new parent must not be a descendant of this folder
      if (parentId) {
        let cursor: string | null = parentId;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === id || seen.has(cursor)) { parentId = target.parentId; break; }
          seen.add(cursor);
          cursor = db.pageFolders.find((f) => f.id === cursor)?.parentId ?? null;
        }
      } else if (patch.parentId === null) {
        parentId = null;
      }
      updated = {
        ...target,
        ...(patch.name !== undefined && patch.name.trim() ? { name: patch.name.trim() } : {}),
        parentId,
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      };
      db.pageFolders = db.pageFolders.map((f) => (f.id === id ? updated! : f));
    });
    return updated ? { ...updated } : undefined;
  },

  async deletePageFolder(id) {
    let removed = false;
    update((db) => {
      const target = db.pageFolders.find((f) => f.id === id);
      if (!target) return;
      db.pageFolders = db.pageFolders
        .filter((f) => f.id !== id)
        .map((f) => (f.parentId === id ? { ...f, parentId: target.parentId ?? null } : f));
      db.pages = db.pages.map((pg) => (pg.folderId === id ? { ...pg, folderId: null } : pg));
      removed = true;
    });
    return removed;
  },

  async listMaterials() {
    const db = loadDb();
    return [...(db.materials ??= [])]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((r) => ({ ...r, applicableTo: [...r.applicableTo] }));
  },

  async createMaterial(input) {
    let created: AdminMaterial | undefined;
    update((db) => {
      const name = input.name.trim();
      const arr = (db.materials ??= []);
      const base = `mat-${slugify(name) || "material"}`;
      const ids = new Set(arr.map((m) => m.id));
      let id = base;
      let n = 1;
      while (ids.has(id)) id = `${base}-${++n}`;
      const maxOrder = Math.max(0, ...arr.map((r) => r.sortOrder));
      const nowIso = new Date().toISOString();
      created = {
        id,
        name,
        category: input.category,
        brightness: input.brightness ?? "all",
        image: input.image?.trim() || undefined,
        hex: input.hex?.trim() || undefined,
        description: input.description?.trim() || undefined,
        applicableTo: input.applicableTo ? [...input.applicableTo] : [],
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? maxOrder + 10,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      arr.push(created);
    });
    if (!created) throw new Error("Failed to create material");
    return created;
  },

  async updateMaterial(id, patch) {
    let updated: AdminMaterial | undefined;
    update((db) => {
      const mat = (db.materials ??= []).find((x) => x.id === id);
      if (!mat) return;
      if (patch.name !== undefined) mat.name = patch.name.trim() || mat.name;
      if (patch.category !== undefined) mat.category = patch.category;
      if (patch.brightness !== undefined) mat.brightness = patch.brightness;
      if (patch.image !== undefined) mat.image = patch.image.trim() || undefined;
      if (patch.hex !== undefined) mat.hex = patch.hex.trim() || undefined;
      if (patch.description !== undefined) mat.description = patch.description.trim() || undefined;
      if (patch.applicableTo !== undefined) mat.applicableTo = [...patch.applicableTo];
      if (patch.active !== undefined) mat.active = patch.active;
      if (patch.sortOrder !== undefined) mat.sortOrder = patch.sortOrder;
      mat.updatedAt = new Date().toISOString();
      updated = { ...mat, applicableTo: [...mat.applicableTo] };
    });
    return updated;
  },

  async setMaterialActive(id, active: boolean) {
    let updated: AdminMaterial | undefined;
    update((db) => {
      const mat = (db.materials ??= []).find((x) => x.id === id);
      if (!mat) return;
      mat.active = active;
      mat.updatedAt = new Date().toISOString();
      updated = { ...mat, applicableTo: [...mat.applicableTo] };
    });
    return updated;
  },

  async deleteMaterial(id) {
    let ok = false;
    update((db) => {
      const arr = (db.materials ??= []);
      const i = arr.findIndex((x) => x.id === id);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  async listProjects() {
    const db = loadDb();
    return [...(db.projects ??= [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({ ...r, furnitureUsed: [...r.furnitureUsed], testimonial: r.testimonial ? { ...r.testimonial } : undefined }));
  },

  async createProject(input) {
    let created: AdminProject | undefined;
    update((db) => {
      const arr = (db.projects ??= []);
      const name = input.title.trim();
      const base = `proj-${slugify(name) || "project"}`;
      const ids = new Set(arr.map((m) => m.id));
      let id = base;
      let n = 1;
      while (ids.has(id)) id = `${base}-${++n}`;
      const maxOrder = Math.max(0, ...arr.map((r) => r.sortOrder));
      const nowIso = new Date().toISOString();
      created = {
        id,
        title: name,
        client: input.client.trim(),
        category: input.category.trim(),
        image: input.image?.trim() || "",
        beforeImage: input.beforeImage?.trim() || undefined,
        location: input.location?.trim() || "",
        sqft: input.sqft?.trim() || "",
        year: input.year?.trim() || "",
        employees: input.employees?.trim() || "",
        duration: input.duration?.trim() || "",
        description: input.description?.trim() || "",
        challenge: input.challenge?.trim() || undefined,
        solution: input.solution?.trim() || undefined,
        furnitureUsed: input.furnitureUsed ? [...input.furnitureUsed] : [],
        testimonial: input.testimonial ? { ...input.testimonial } : undefined,
        rating: input.rating,
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? maxOrder + 10,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      arr.push(created);
    });
    if (!created) throw new Error("Failed to create project");
    return created;
  },

  async updateProject(id, patch) {
    let updated: AdminProject | undefined;
    update((db) => {
      const proj = (db.projects ??= []).find((x) => x.id === id);
      if (!proj) return;
      if (patch.title !== undefined) proj.title = patch.title.trim() || proj.title;
      if (patch.client !== undefined) proj.client = patch.client.trim();
      if (patch.category !== undefined) proj.category = patch.category.trim();
      if (patch.image !== undefined) proj.image = patch.image.trim();
      if (patch.beforeImage !== undefined) proj.beforeImage = patch.beforeImage.trim() || undefined;
      if (patch.location !== undefined) proj.location = patch.location.trim();
      if (patch.sqft !== undefined) proj.sqft = patch.sqft.trim();
      if (patch.year !== undefined) proj.year = patch.year.trim();
      if (patch.employees !== undefined) proj.employees = patch.employees.trim();
      if (patch.duration !== undefined) proj.duration = patch.duration.trim();
      if (patch.description !== undefined) proj.description = patch.description.trim();
      if (patch.challenge !== undefined) proj.challenge = patch.challenge.trim() || undefined;
      if (patch.solution !== undefined) proj.solution = patch.solution.trim() || undefined;
      if (patch.furnitureUsed !== undefined) proj.furnitureUsed = [...patch.furnitureUsed];
      if (patch.testimonial !== undefined) proj.testimonial = patch.testimonial ? { ...patch.testimonial } : undefined;
      if (patch.rating !== undefined) proj.rating = patch.rating;
      if (patch.active !== undefined) proj.active = patch.active;
      if (patch.sortOrder !== undefined) proj.sortOrder = patch.sortOrder;
      proj.updatedAt = new Date().toISOString();
      updated = { ...proj, furnitureUsed: [...proj.furnitureUsed], testimonial: proj.testimonial ? { ...proj.testimonial } : undefined };
    });
    return updated;
  },

  async setProjectActive(id, active: boolean) {
    let updated: AdminProject | undefined;
    update((db) => {
      const proj = (db.projects ??= []).find((x) => x.id === id);
      if (!proj) return;
      proj.active = active;
      proj.updatedAt = new Date().toISOString();
      updated = { ...proj, furnitureUsed: [...proj.furnitureUsed], testimonial: proj.testimonial ? { ...proj.testimonial } : undefined };
    });
    return updated;
  },

  async deleteProject(id) {
    let ok = false;
    update((db) => {
      const arr = (db.projects ??= []);
      const i = arr.findIndex((x) => x.id === id);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  async listBlogPosts() {
    const db = loadDb();
    const epoch = (d: string) => {
      const t = Date.parse(d);
      return Number.isNaN(t) ? 0 : t;
    };
    return [...(db.blogPosts ??= [])]
      .sort((a, b) => epoch(b.date) - epoch(a.date))
      .map((r) => ({ ...r, content: r.content.map((c) => ({ ...c })), tags: [...r.tags] }));
  },

  async createBlogPost(input) {
    let created: AdminBlogPost | undefined;
    update((db) => {
      const arr = (db.blogPosts ??= []);
      const base = slugify(input.title.trim()) || "post";
      const ids = new Set(arr.map((m) => m.id));
      let id = base;
      let n = 1;
      while (ids.has(id)) id = `${base}-${++n}`;
      const nowIso = new Date().toISOString();
      created = {
        id,
        title: input.title.trim(),
        excerpt: input.excerpt?.trim() || "",
        image: input.image?.trim() || "",
        category: input.category.trim(),
        author: input.author.trim(),
        date: input.date.trim(),
        readTime: input.readTime?.trim() || "5 min read",
        featured: input.featured ?? false,
        active: input.active ?? true,
        content: input.content ? input.content.map((c) => ({ ...c })) : [],
        tags: input.tags ? [...input.tags] : [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      arr.push(created);
    });
    if (!created) throw new Error("Failed to create blog post");
    return created;
  },

  async updateBlogPost(id, patch) {
    let updated: AdminBlogPost | undefined;
    update((db) => {
      const post = (db.blogPosts ??= []).find((x) => x.id === id);
      if (!post) return;
      if (patch.title !== undefined) post.title = patch.title.trim() || post.title;
      if (patch.excerpt !== undefined) post.excerpt = patch.excerpt.trim();
      if (patch.image !== undefined) post.image = patch.image.trim();
      if (patch.category !== undefined) post.category = patch.category.trim();
      if (patch.author !== undefined) post.author = patch.author.trim();
      if (patch.date !== undefined) post.date = patch.date.trim();
      if (patch.readTime !== undefined) post.readTime = patch.readTime.trim();
      if (patch.featured !== undefined) post.featured = patch.featured;
      if (patch.active !== undefined) post.active = patch.active;
      if (patch.content !== undefined) post.content = patch.content.map((c) => ({ ...c }));
      if (patch.tags !== undefined) post.tags = [...patch.tags];
      post.updatedAt = new Date().toISOString();
      updated = { ...post, content: post.content.map((c) => ({ ...c })), tags: [...post.tags] };
    });
    return updated;
  },

  async setBlogPostActive(id, active: boolean) {
    let updated: AdminBlogPost | undefined;
    update((db) => {
      const post = (db.blogPosts ??= []).find((x) => x.id === id);
      if (!post) return;
      post.active = active;
      post.updatedAt = new Date().toISOString();
      updated = { ...post, content: post.content.map((c) => ({ ...c })), tags: [...post.tags] };
    });
    return updated;
  },

  async deleteBlogPost(id) {
    let ok = false;
    update((db) => {
      const arr = (db.blogPosts ??= []);
      const i = arr.findIndex((x) => x.id === id);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  async listServices() {
    const db = loadDb();
    return [...(db.services ??= [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => cloneService(s));
  },

  async createService(input) {
    let created: AdminService | undefined;
    update((db) => {
      const arr = (db.services ??= []);
      const slug = (input.slug?.trim() || slugify(input.title.trim())) || "service";
      if (arr.some((s) => s.slug === slug)) throw new Error(`A service with slug "${slug}" already exists`);
      const maxOrder = Math.max(0, ...arr.map((s) => s.sortOrder));
      const maxNumber = arr.reduce((max, s) => Math.max(max, parseInt(s.number, 10) || 0), 0);
      const nowIso = new Date().toISOString();
      created = {
        slug,
        number: input.number?.trim() || String(maxNumber + 1).padStart(2, "0"),
        title: input.title.trim(),
        shortTitle: input.shortTitle?.trim() || input.title.trim(),
        tagline: input.tagline?.trim() || "",
        hero: input.hero?.trim() || "",
        intro: input.intro?.trim() || "",
        metaTitle: input.metaTitle?.trim() || `${input.title.trim()} — WOODEX`,
        metaDescription: input.metaDescription?.trim() || input.tagline?.trim() || "",
        overview: input.overview ? cloneService(input.overview) : { heading: "", body: "" },
        process: input.process ? cloneService(input.process) : [],
        benefits: input.benefits ? cloneService(input.benefits) : [],
        inclusions: input.inclusions ? [...input.inclusions] : [],
        faqs: input.faqs ? cloneService(input.faqs) : [],
        caseStudy: input.caseStudy ? cloneService(input.caseStudy) : { client: "", sector: "", result: "" },
        related: input.related ? [...input.related] : [],
        active: input.active ?? true,
        sortOrder: input.sortOrder ?? maxOrder + 10,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      arr.push(created);
    });
    if (!created) throw new Error("Failed to create service");
    return created;
  },

  async updateService(slug, patch) {
    let updated: AdminService | undefined;
    update((db) => {
      const svc = (db.services ??= []).find((x) => x.slug === slug);
      if (!svc) return;
      if (patch.number !== undefined) svc.number = patch.number.trim();
      if (patch.title !== undefined) svc.title = patch.title.trim() || svc.title;
      if (patch.shortTitle !== undefined) svc.shortTitle = patch.shortTitle.trim();
      if (patch.tagline !== undefined) svc.tagline = patch.tagline.trim();
      if (patch.hero !== undefined) svc.hero = patch.hero.trim();
      if (patch.intro !== undefined) svc.intro = patch.intro.trim();
      if (patch.metaTitle !== undefined) svc.metaTitle = patch.metaTitle.trim();
      if (patch.metaDescription !== undefined) svc.metaDescription = patch.metaDescription.trim();
      if (patch.overview !== undefined) svc.overview = cloneService(patch.overview);
      if (patch.process !== undefined) svc.process = cloneService(patch.process);
      if (patch.benefits !== undefined) svc.benefits = cloneService(patch.benefits);
      if (patch.inclusions !== undefined) svc.inclusions = [...patch.inclusions];
      if (patch.faqs !== undefined) svc.faqs = cloneService(patch.faqs);
      if (patch.caseStudy !== undefined) svc.caseStudy = cloneService(patch.caseStudy);
      if (patch.related !== undefined) svc.related = [...patch.related];
      if (patch.active !== undefined) svc.active = patch.active;
      if (patch.sortOrder !== undefined) svc.sortOrder = patch.sortOrder;
      svc.updatedAt = new Date().toISOString();
      updated = cloneService(svc);
    });
    return updated;
  },

  async setServiceActive(slug, active: boolean) {
    let updated: AdminService | undefined;
    update((db) => {
      const svc = (db.services ??= []).find((x) => x.slug === slug);
      if (!svc) return;
      svc.active = active;
      svc.updatedAt = new Date().toISOString();
      updated = cloneService(svc);
    });
    return updated;
  },

  async deleteService(slug) {
    let ok = false;
    update((db) => {
      const arr = (db.services ??= []);
      const i = arr.findIndex((x) => x.slug === slug);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  /* ── Returns (RMA) ─────────────────────────────────────────── */
  async listReturns(params = {}) {
    const db = loadDb();
    let items = [...(db.returns ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const status = params.status ?? "all";
    if (status !== "all") items = items.filter((r) => r.status === status);
    items = items.filter((r) => matchQuery(params.query, [r.id, r.orderId, r.customerName, r.customerEmail, r.city, r.reason]));
    return paginate(items, params);
  },

  async getReturn(id) {
    return (loadDb().returns ?? []).find((r) => r.id === id);
  },

  async createReturn(input) {
    let created: AdminReturn | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const order = db.orders.find((o) => o.id === input.orderId);
      if (!order) return;
      if (order.status !== "delivered") throw new Error("Only delivered orders can be returned.");
      const wanted = new Map(input.items.map((l) => [l.productId, Math.max(0, Math.trunc(l.quantity) || 0)]));
      const items: AdminReturnItem[] = [];
      for (const line of order.items) {
        const qty = Math.min(wanted.get(line.id) ?? 0, line.quantity);
        if (qty > 0) items.push({ id: line.id, name: line.name, image: line.image, quantity: qty, price: line.price });
      }
      if (items.length === 0) throw new Error("Select at least one item to return.");
      const seq = (db.returns ?? []).reduce((max, r) => Math.max(max, Number(r.id.replace(/\D/g, "")) || 0), 1000) + 1;
      const refundAmount = items.reduce((s, it) => s + it.price * it.quantity, 0);
      created = {
        id: `RMA-${seq}`,
        orderId: order.id,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        city: order.city,
        items,
        reason: input.reason,
        reasonDetail: input.reasonDetail?.trim() || undefined,
        status: "requested",
        refundAmount,
        restock: input.restock ?? true,
        createdAt: now,
        updatedAt: now,
      };
      (db.returns ??= []).push(created);
      (db.orderEvents ??= []).push({
        id: newEventId(),
        orderId: order.id,
        note: `Return ${created.id} opened — ${RETURN_REASON_LABELS[created.reason]}`,
        createdAt: now,
      });
    });
    return created;
  },

  async updateReturn(id, patch: AdminReturnPatch) {
    let updated: AdminReturn | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const r = (db.returns ??= []).find((x) => x.id === id);
      if (!r) return;
      const terminal = r.status === "refunded" || r.status === "replaced" || r.status === "rejected";
      if (terminal) throw new Error(`Return ${r.id} is closed — no further edits.`);
      if (patch.inspectionNote !== undefined) r.inspectionNote = patch.inspectionNote.trim() || undefined;
      if (patch.restock !== undefined) r.restock = patch.restock;
      if (patch.refundAmount !== undefined) {
        const amt = Number(patch.refundAmount);
        if (!Number.isFinite(amt) || amt < 0) throw new Error("Refund amount must be a positive number.");
        r.refundAmount = Math.round(amt);
      }
      if (patch.status !== undefined && patch.status !== r.status) {
        const allowed = RETURN_TRANSITIONS[r.status] ?? [];
        if (!allowed.includes(patch.status)) {
          throw new Error(`Return ${r.id} cannot move from ${r.status} to ${patch.status}.`);
        }
        r.status = patch.status;
        if (patch.status === "received" && r.restock) {
          for (const line of r.items) adjustLineStock(db, r.orderId, line, "in", `Return ${r.id} restock —`, now);
        }
        const note =
          patch.status === "received" ? `Return ${r.id} received at warehouse`
          : patch.status === "inspected" ? `Return ${r.id} inspected${r.inspectionNote ? ` — ${r.inspectionNote}` : ""}`
          : patch.status === "refunded" ? `Return ${r.id} refunded — Rs ${(r.refundAmount ?? 0).toLocaleString("en-PK")}`
          : patch.status === "replaced" ? `Return ${r.id} — replacement to be dispatched`
          : `Return ${r.id} rejected${r.inspectionNote ? ` — ${r.inspectionNote}` : ""}`;
        (db.orderEvents ??= []).push({ id: newEventId(), orderId: r.orderId, note, createdAt: now });
      }
      r.updatedAt = now;
      updated = { ...r };
    });
    return updated;
  },

  /* ── Exchanges ─────────────────────────────────────────────── */
  async listExchanges(params = {}) {
    const db = loadDb();
    let items = [...(db.exchanges ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const status = params.status ?? "all";
    if (status !== "all") items = items.filter((e) => e.status === status);
    items = items.filter((e) => matchQuery(params.query, [e.id, e.orderId, e.returnId, e.customerName, e.customerEmail, e.city, e.reason]));
    return paginate(items, params);
  },

  async getExchange(id) {
    return (loadDb().exchanges ?? []).find((e) => e.id === id);
  },

  async createExchange(input) {
    let created: AdminExchange | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const order = db.orders.find((o) => o.id === input.orderId);
      if (!order) return;
      if (order.status !== "delivered") throw new Error("Only delivered orders can be exchanged.");
      if (input.returnId && !(db.returns ?? []).some((r) => r.id === input.returnId?.trim())) {
        throw new Error(`Linked return ${input.returnId} not found.`);
      }
      const wantedIn = new Map(input.incoming.map((l) => [l.productId, Math.max(0, Math.trunc(l.quantity) || 0)]));
      const incoming: AdminExchangeItem[] = [];
      for (const line of order.items) {
        const qty = Math.min(wantedIn.get(line.id) ?? 0, line.quantity);
        if (qty > 0) incoming.push({ id: line.id, name: line.name, image: line.image, quantity: qty, price: line.price });
      }
      if (incoming.length === 0) throw new Error("Select at least one item to take back.");
      const outgoing: AdminExchangeItem[] = [];
      for (const l of input.outgoing) {
        const p = db.products.find((x) => x.id === l.productId);
        const qty = Math.max(0, Math.trunc(l.quantity) || 0);
        if (p && qty > 0) outgoing.push({ id: p.id, name: p.name, image: p.image, quantity: qty, price: p.price });
      }
      if (outgoing.length === 0) throw new Error("Add at least one replacement item.");
      const inTotal = incoming.reduce((s, it) => s + it.price * it.quantity, 0);
      const outTotal = outgoing.reduce((s, it) => s + it.price * it.quantity, 0);
      const diff = outTotal - inTotal;
      const seq = (db.exchanges ?? []).reduce((max, e) => Math.max(max, Number(e.id.replace(/\D/g, "")) || 0), 1000) + 1;
      created = {
        id: `EXC-${seq}`,
        orderId: order.id,
        returnId: input.returnId?.trim() || undefined,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        city: order.city,
        incoming,
        outgoing,
        reason: input.reason?.trim() || undefined,
        status: "requested",
        priceDifference: diff,
        differenceSettled: diff === 0,
        createdAt: now,
        updatedAt: now,
      };
      (db.exchanges ??= []).push(created);
      (db.orderEvents ??= []).push({
        id: newEventId(),
        orderId: order.id,
        note: `Exchange ${created.id} opened${created.returnId ? ` — links ${created.returnId}` : ""}`,
        createdAt: now,
      });
    });
    return created;
  },

  async updateExchange(id, patch: AdminExchangePatch) {
    let updated: AdminExchange | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const e = (db.exchanges ??= []).find((x) => x.id === id);
      if (!e) return;
      const terminal = e.status === "completed" || e.status === "rejected";
      if (patch.differenceSettled !== undefined) {
        if (terminal) throw new Error(`Exchange ${e.id} is closed — no further edits.`);
        e.differenceSettled = patch.differenceSettled;
      }
      if (patch.status !== undefined && patch.status !== e.status) {
        if (terminal) throw new Error(`Exchange ${e.id} is closed — no further edits.`);
        const allowed = EXCHANGE_TRANSITIONS[e.status] ?? [];
        if (!allowed.includes(patch.status)) {
          throw new Error(`Exchange ${e.id} cannot move from ${e.status} to ${patch.status}.`);
        }
        e.status = patch.status;
        if (patch.status === "shipped") {
          for (const line of e.outgoing) adjustLineStock(db, e.orderId, line, "out", `Exchange ${e.id} dispatch —`, now);
        } else if (patch.status === "completed") {
          for (const line of e.incoming) adjustLineStock(db, e.orderId, line, "in", `Exchange ${e.id} restock —`, now);
        }
        const note =
          patch.status === "approved" ? `Exchange ${e.id} approved`
          : patch.status === "shipped" ? `Exchange ${e.id} — replacement dispatched`
          : patch.status === "completed" ? `Exchange ${e.id} completed${e.priceDifference !== 0 && !e.differenceSettled ? " — price difference still pending" : ""}`
          : `Exchange ${e.id} rejected`;
        (db.orderEvents ??= []).push({ id: newEventId(), orderId: e.orderId, note, createdAt: now });
      }
      e.updatedAt = now;
      updated = { ...e };
    });
    return updated;
  },

  /* ── Claims ────────────────────────────────────────────────── */
  async listClaims(params = {}) {
    const db = loadDb();
    let items = [...(db.claims ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const status = params.status ?? "all";
    if (status !== "all") items = items.filter((c) => c.status === status);
    const type = params.type ?? "all";
    if (type !== "all") items = items.filter((c) => c.type === type);
    items = items.filter((c) => matchQuery(params.query, [c.id, c.orderId, c.customerName, c.customerEmail, c.productName, c.city, c.issue]));
    return paginate(items, params);
  },

  async getClaim(id) {
    return (loadDb().claims ?? []).find((c) => c.id === id);
  },

  async createClaim(input) {
    let created: AdminClaim | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const productName = input.productName?.trim();
      const issue = input.issue?.trim();
      if (!productName) throw new Error("Tell us which product the claim is about.");
      if (!issue) throw new Error("Describe the issue the customer reported.");
      let customer = {
        customerName: input.customerName?.trim() || "",
        customerEmail: input.customerEmail?.trim() || "",
        customerPhone: input.customerPhone?.trim() || "",
        city: input.city?.trim() || "",
      };
      const order = input.orderId ? db.orders.find((o) => o.id === input.orderId) : undefined;
      if (input.orderId && !order) throw new Error(`Order ${input.orderId} not found.`);
      if (order) {
        customer = { customerName: order.customerName, customerEmail: order.customerEmail, customerPhone: order.customerPhone, city: order.city };
      }
      if (!customer.customerName) throw new Error("Link a delivered order or enter the customer's name.");
      const seq = (db.claims ?? []).reduce((max, c) => Math.max(max, Number(c.id.replace(/\D/g, "")) || 0), 1000) + 1;
      created = {
        id: `CLM-${seq}`,
        orderId: order?.id,
        customerName: customer.customerName,
        customerEmail: customer.customerEmail,
        customerPhone: customer.customerPhone,
        city: customer.city,
        productName,
        productId: input.productId,
        type: input.type,
        issue,
        status: "reported",
        createdAt: now,
        updatedAt: now,
      };
      (db.claims ??= []).push(created);
      if (order) {
        (db.orderEvents ??= []).push({
          id: newEventId(),
          orderId: order.id,
          note: `Claim ${created.id} filed — ${created.type}`,
          createdAt: now,
        });
      }
    });
    return created;
  },

  async updateClaim(id, patch: AdminClaimPatch) {
    let updated: AdminClaim | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const c = (db.claims ??= []).find((x) => x.id === id);
      if (!c) return;
      const terminal = c.status === "rejected" || c.status === "resolved";
      if (terminal && (patch.status !== undefined || patch.assessmentNote !== undefined || patch.resolutionNote !== undefined || patch.resolutionCost !== undefined)) {
        throw new Error(`Claim ${c.id} is closed — no further edits.`);
      }
      if (patch.assessmentNote !== undefined) c.assessmentNote = patch.assessmentNote.trim() || undefined;
      if (patch.resolutionNote !== undefined) c.resolutionNote = patch.resolutionNote.trim() || undefined;
      if (patch.resolutionCost !== undefined) {
        const amt = Number(patch.resolutionCost);
        if (!Number.isFinite(amt) || amt < 0) throw new Error("Resolution cost must be a positive number.");
        c.resolutionCost = Math.round(amt);
      }
      if (patch.status !== undefined && patch.status !== c.status) {
        const allowed = CLAIM_TRANSITIONS[c.status] ?? [];
        if (!allowed.includes(patch.status)) {
          throw new Error(`Claim ${c.id} cannot move from ${c.status} to ${patch.status}.`);
        }
        c.status = patch.status;
        if (c.orderId) {
          const note =
            patch.status === "assessing" ? `Claim ${c.id} — assessment started`
            : patch.status === "approved" ? `Claim ${c.id} approved${c.assessmentNote ? ` — ${c.assessmentNote}` : ""}`
            : patch.status === "rejected" ? `Claim ${c.id} rejected${c.assessmentNote ? ` — ${c.assessmentNote}` : ""}`
            : `Claim ${c.id} resolved${c.resolutionNote ? ` — ${c.resolutionNote}` : ""}`;
          (db.orderEvents ??= []).push({ id: newEventId(), orderId: c.orderId, note, createdAt: now });
        }
      }
      c.updatedAt = now;
      updated = { ...c };
    });
    return updated;
  },

  /* ── Draft Orders ───────────────────────────────────────────── */
  async listDraftOrders(params = {}) {
    const db = loadDb();
    let items = [...(db.draftOrders ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const status = params.status ?? "all";
    if (status !== "all") items = items.filter((t) => t.status === status);
    items = items.filter((t) => matchQuery(params.query, [t.id, t.customerName, t.customerPhone, t.customerEmail, t.city, t.notes, t.convertedOrderId]));
    return paginate(items, params);
  },

  async getDraftOrder(id) {
    return (loadDb().draftOrders ?? []).find((t) => t.id === id);
  },

  async createDraftOrder(input) {
    let created: AdminDraftOrder | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const customerName = input.customerName?.trim();
      const customerPhone = input.customerPhone?.trim();
      if (!customerName) throw new Error("Customer name is required.");
      if (!customerPhone) throw new Error("Customer phone is required.");
      const items = sanitizeDraftLines(input.items ?? []);
      if (items.length === 0) throw new Error("Add at least one line to the draft.");
      const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
      const shipping = input.shipping !== undefined ? Math.max(0, Math.round(Number(input.shipping) || 0)) : subtotal >= 150000 ? 0 : 1500;
      const maxSeq = (db.draftOrders ?? []).reduce((max, t) => Math.max(max, Number(t.id.replace(/\D/g, "")) || 0), 1000);
      created = {
        id: `DRF-${maxSeq + 1}`,
        customerName,
        customerPhone,
        customerEmail: input.customerEmail?.trim() ?? "",
        city: input.city?.trim() || undefined,
        address: input.address?.trim() || undefined,
        items,
        subtotal,
        shipping,
        total: subtotal + shipping,
        channelId: input.channelId?.trim() || "ch-manual",
        notes: input.notes?.trim() || undefined,
        status: "draft",
        createdAt: now,
        updatedAt: now,
      };
      (db.draftOrders ??= []).push(created);
    });
    if (!created) throw new Error("Failed to create draft order");
    return created;
  },

  async updateDraftOrder(id, patch: AdminDraftOrderPatch) {
    let updated: AdminDraftOrder | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const t = (db.draftOrders ??= []).find((x) => x.id === id);
      if (!t) return;
      if (t.status === "converted") throw new Error(`Draft ${t.id} is already converted — it can no longer be edited.`);
      if (patch.customerName !== undefined) {
        const v = patch.customerName.trim();
        if (!v) throw new Error("Customer name is required.");
        t.customerName = v;
      }
      if (patch.customerPhone !== undefined) {
        const v = patch.customerPhone.trim();
        if (!v) throw new Error("Customer phone is required.");
        t.customerPhone = v;
      }
      if (patch.customerEmail !== undefined) t.customerEmail = patch.customerEmail.trim();
      if (patch.city !== undefined) t.city = patch.city.trim() || undefined;
      if (patch.address !== undefined) t.address = patch.address.trim() || undefined;
      if (patch.notes !== undefined) t.notes = patch.notes.trim() || undefined;
      if (patch.channelId !== undefined) t.channelId = patch.channelId.trim() || undefined;
      if (patch.items !== undefined) {
        const items = sanitizeDraftLines(patch.items);
        if (items.length === 0) throw new Error("A draft needs at least one line.");
        t.items = items;
        t.subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
      }
      if (patch.shipping !== undefined) t.shipping = Math.max(0, Math.round(Number(patch.shipping) || 0));
      t.total = t.subtotal + t.shipping;
      t.updatedAt = now;
      updated = { ...t, items: [...t.items] };
    });
    return updated;
  },

  async deleteDraftOrder(id) {
    let okFlag = false;
    update((db) => {
      const t = (db.draftOrders ?? []).find((x) => x.id === id);
      if (!t || t.status === "converted") return;
      db.draftOrders = db.draftOrders.filter((x) => x.id !== id);
      okFlag = true;
    });
    return okFlag;
  },

  async convertDraftOrder(id, paymentMethod = "cod") {
    let order: AdminOrder | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const t = (db.draftOrders ??= []).find((x) => x.id === id);
      if (!t || t.status === "converted") return;
      if (t.items.length === 0) throw new Error(`Draft ${t.id} has no lines to convert.`);
      order = materializeOrder(db, {
        customerName: t.customerName,
        customerEmail: t.customerEmail || undefined,
        customerPhone: t.customerPhone,
        address: t.address,
        city: t.city ?? "",
        items: t.items.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, image: i.image })),
        subtotal: t.subtotal,
        shipping: t.shipping,
        total: t.total,
        paymentMethod,
        channelId: t.channelId ?? "ch-manual",
        notes: t.notes,
      });
      t.status = "converted";
      t.convertedOrderId = order.id;
      t.updatedAt = now;
      (db.orderEvents ??= []).push({
        id: newEventId(),
        orderId: order.id,
        note: `Converted from draft ${t.id} — manual order`,
        createdAt: now,
      });
    });
    return order;
  },

  async listQuotes(params?: ListParams & { status?: QuoteStatus | "all" }) {
    const db = loadDb();
    const q = (params?.query ?? "").trim().toLowerCase();
    let rows = [...(db.quotes ?? [])];
    if (params?.status && params.status !== "all") rows = rows.filter((r) => r.status === params.status);
    if (q) rows = rows.filter((r) => [r.id, r.customerName, r.company ?? "", r.customerPhone, r.customerEmail, r.leadId ?? ""].join(" ").toLowerCase().includes(q));
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const page = params?.page ?? 1;
    const perPage = params?.perPage ?? 60;
    return { items: rows.slice((page - 1) * perPage, page * perPage), total: rows.length, page, perPage };
  },

  async getQuote(id: string) {
    return (loadDb().quotes ?? []).find((x) => x.id === id);
  },

  async createQuote(input: NewQuoteInput) {
    let created: AdminQuote | undefined;
    update((db) => {
      created = createQuoteInDb(db, input);
    });
    if (!created) throw new Error("Failed to create quote");
    return created;
  },

  async createQuoteFromLead(leadId: string) {
    let quote: AdminQuote | undefined;
    update((db) => {
      const lead = db.leads.find((l) => l.id === leadId);
      if (!lead) return;
      quote = createQuoteInDb(db, {
        leadId: lead.id,
        customerName: lead.name,
        customerPhone: lead.phone,
        customerEmail: lead.email || undefined,
        company: lead.company,
        city: lead.city,
        items: [],
        validityDays: 14,
        notes: `Drafted from lead ${lead.id} · ${lead.type === "b2b" ? "B2B enquiry" : "Quote request"} — ${lead.summary}`,
      });
      if (lead.status === "new" || lead.status === "contacted") lead.status = "quoted";
    });
    return quote;
  },

  async updateQuote(id: string, patch: AdminQuotePatch) {
    let updated: AdminQuote | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const t = (db.quotes ??= []).find((x) => x.id === id);
      if (!t) return;
      if (t.status === "converted") throw new Error(`Quote ${t.id} is already converted — it can no longer be edited.`);
      if (patch.customerName !== undefined) {
        const v = patch.customerName.trim();
        if (!v) throw new Error("Customer name is required.");
        t.customerName = v;
      }
      if (patch.customerPhone !== undefined) {
        const v = patch.customerPhone.trim();
        if (!v) throw new Error("Customer phone is required.");
        t.customerPhone = v;
      }
      if (patch.customerEmail !== undefined) t.customerEmail = patch.customerEmail.trim();
      if (patch.company !== undefined) t.company = patch.company.trim() || undefined;
      if (patch.city !== undefined) t.city = patch.city.trim() || undefined;
      if (patch.address !== undefined) t.address = patch.address.trim() || undefined;
      if (patch.notes !== undefined) t.notes = patch.notes.trim() || undefined;
      if (patch.items !== undefined) t.items = sanitizeDraftLines(patch.items);
      if (patch.discountPct !== undefined) t.discountPct = clampPct(patch.discountPct);
      if (patch.validityDays !== undefined) {
        t.validityDays = Math.min(90, Math.max(1, Math.trunc(Number(patch.validityDays) || 14)));
        t.validUntil = new Date(Date.parse(now) + t.validityDays * 86400000).toISOString();
      }
      if (patch.shipping !== undefined) t.shipping = Math.max(0, Math.round(Number(patch.shipping) || 0));
      if (patch.status !== undefined) {
        if (patch.status === "converted") throw new Error("Use the Convert action to convert a quote.");
        t.status = patch.status;
      }
      const totals = quoteTotals(t.items, t.discountPct, t.shipping);
      t.subtotal = totals.subtotal;
      t.discountAmount = totals.discountAmount;
      t.shipping = totals.shipping;
      t.total = totals.total;
      if (t.status === "sent" && t.items.length === 0) throw new Error("Add at least one line before sending the quote.");
      t.updatedAt = now;
      updated = { ...t, items: [...t.items] };
    });
    return updated;
  },

  async deleteQuote(id: string) {
    let okFlag = false;
    update((db) => {
      const t = (db.quotes ?? []).find((x) => x.id === id);
      if (!t || t.status === "converted") return;
      db.quotes = db.quotes.filter((x) => x.id !== id);
      okFlag = true;
    });
    return okFlag;
  },

  async convertQuote(id: string, paymentMethod: PaymentMethod = "cod") {
    let order: AdminOrder | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const t = (db.quotes ??= []).find((x) => x.id === id);
      if (!t || t.status === "converted") return;
      if (t.items.length === 0) throw new Error(`Quote ${t.id} has no lines to convert.`);
      if (t.total <= 0) throw new Error(`Quote ${t.id} totals Rs 0 — price the lines before converting.`);
      order = materializeOrder(db, {
        customerName: t.customerName,
        customerEmail: t.customerEmail || undefined,
        customerPhone: t.customerPhone,
        address: t.address,
        city: t.city ?? "",
        items: t.items.map((i) => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity, image: i.image })),
        subtotal: t.subtotal,
        shipping: t.shipping,
        total: t.total,
        paymentMethod,
        channelId: "ch-manual",
        notes: [t.notes, `Quote ${t.id} — ${t.discountPct}% discount (−Rs ${t.discountAmount.toLocaleString("en-PK")})`].filter(Boolean).join(" · "),
        discountPct: t.discountPct,
        discountAmount: t.discountAmount,
      });
      t.status = "converted";
      t.convertedOrderId = order.id;
      t.updatedAt = now;
      (db.orderEvents ??= []).push({
        id: newEventId(),
        orderId: order.id,
        note: `Converted from quote ${t.id}${t.discountPct > 0 ? ` — ${t.discountPct}% corporate discount` : ""}`,
        createdAt: now,
      });
    });
    return order;
  },

  async listSuppliers(params?: ListParams & { active?: "all" | "active" | "inactive" }) {
    const db = loadDb();
    const q = (params?.query ?? "").trim().toLowerCase();
    let rows = [...(db.suppliers ?? [])];
    if (params?.active === "active") rows = rows.filter((r) => r.active);
    else if (params?.active === "inactive") rows = rows.filter((r) => !r.active);
    if (q) rows = rows.filter((r) => [r.id, r.name, r.contactName ?? "", r.city ?? "", r.email ?? "", r.phone ?? "", r.taxId ?? "", r.paymentTerms].join(" ").toLowerCase().includes(q));
    rows.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return rows;
  },

  async createSupplier(input: NewSupplierInput) {
    let created: AdminSupplier | undefined;
    update((db) => {
      const name = input.name?.trim();
      if (!name) throw new Error("Supplier name is required.");
      const now = new Date().toISOString();
      const maxSeq = (db.suppliers ?? []).reduce((max, s) => Math.max(max, Number(s.id.replace(/\D/g, "")) || 0), 1000);
      created = {
        id: `SUP-${maxSeq + 1}`,
        name,
        contactName: input.contactName?.trim() || undefined,
        email: input.email?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        city: input.city?.trim() || undefined,
        address: input.address?.trim() || undefined,
        taxId: input.taxId?.trim() || undefined,
        paymentTerms: input.paymentTerms ?? "net30",
        notes: input.notes?.trim() || undefined,
        active: input.active ?? true,
        createdAt: now,
        updatedAt: now,
      };
      (db.suppliers ??= []).push(created);
    });
    if (!created) throw new Error("Failed to create supplier");
    return created;
  },

  async updateSupplier(id: string, patch: AdminSupplierPatch) {
    let updated: AdminSupplier | undefined;
    update((db) => {
      const t = (db.suppliers ??= []).find((x) => x.id === id);
      if (!t) return;
      if (patch.name !== undefined) {
        const v = patch.name.trim();
        if (!v) throw new Error("Supplier name is required.");
        t.name = v;
      }
      if (patch.contactName !== undefined) t.contactName = patch.contactName.trim() || undefined;
      if (patch.email !== undefined) t.email = patch.email.trim() || undefined;
      if (patch.phone !== undefined) t.phone = patch.phone.trim() || undefined;
      if (patch.city !== undefined) t.city = patch.city.trim() || undefined;
      if (patch.address !== undefined) t.address = patch.address.trim() || undefined;
      if (patch.taxId !== undefined) t.taxId = patch.taxId.trim() || undefined;
      if (patch.paymentTerms !== undefined) t.paymentTerms = patch.paymentTerms;
      if (patch.notes !== undefined) t.notes = patch.notes.trim() || undefined;
      if (patch.active !== undefined) t.active = patch.active;
      t.updatedAt = new Date().toISOString();
      updated = { ...t };
    });
    return updated;
  },

  async deleteSupplier(id: string) {
    let okFlag = false;
    update((db) => {
      const t = (db.suppliers ?? []).find((x) => x.id === id);
      if (!t) return;
      const used = ((db as DemoDb & { purchaseOrders?: Array<{ supplierId: string }> }).purchaseOrders ?? []).some((po) => po.supplierId === id);
      if (used) throw new Error(`Supplier ${t.id} is referenced by purchase orders — deactivate it instead.`);
      db.suppliers = db.suppliers.filter((x) => x.id !== id);
      okFlag = true;
    });
    return okFlag;
  },

  async listPurchaseOrders(params?: ListParams & { status?: PurchaseOrderStatus | "all" }) {
    const db = loadDb();
    const q = (params?.query ?? "").trim().toLowerCase();
    let rows = [...(db.purchaseOrders ?? [])];
    if (params?.status && params.status !== "all") rows = rows.filter((r) => r.status === params.status);
    if (q) rows = rows.filter((r) => [r.id, r.supplierName, r.notes ?? "", r.expectedDate ?? "", ...r.lines.map((l) => l.name)].join(" ").toLowerCase().includes(q));
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const page = params?.page ?? 1;
    const perPage = params?.perPage ?? 60;
    return { items: rows.slice((page - 1) * perPage, page * perPage), total: rows.length, page, perPage };
  },

  async getPurchaseOrder(id: string) {
    return (loadDb().purchaseOrders ?? []).find((x) => x.id === id);
  },

  async createPurchaseOrder(input: NewPurchaseOrderInput) {
    let created: AdminPurchaseOrder | undefined;
    update((db) => {
      const supplier = (db.suppliers ?? []).find((s) => s.id === input.supplierId);
      if (!supplier) throw new Error("Pick a supplier first.");
      const lines = sanitizePoLines(input.lines ?? []);
      if (lines.length === 0) throw new Error("Add at least one line to the purchase order.");
      const now = new Date().toISOString();
      const maxSeq = (db.purchaseOrders ?? []).reduce((max, p) => Math.max(max, Number(p.id.replace(/\D/g, "")) || 0), 1000);
      created = {
        id: `PO-${maxSeq + 1}`,
        supplierId: supplier.id,
        supplierName: supplier.name,
        lines,
        subtotal: lines.reduce((s, l) => s + l.costPrice * l.quantity, 0),
        expectedDate: input.expectedDate || undefined,
        notes: input.notes?.trim() || undefined,
        status: input.status === "sent" ? "sent" : "draft",
        createdAt: now,
        updatedAt: now,
      };
      (db.purchaseOrders ??= []).push(created);
    });
    if (!created) throw new Error("Failed to create purchase order");
    return created;
  },

  async updatePurchaseOrder(id: string, patch: AdminPurchaseOrderPatch) {
    let updated: AdminPurchaseOrder | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const t = (db.purchaseOrders ??= []).find((x) => x.id === id);
      if (!t) return;
      if (t.status !== "draft") throw new Error(`PO ${t.id} is ${t.status} — only draft POs can be edited.`);
      if (patch.supplierId !== undefined) {
        const supplier = (db.suppliers ?? []).find((s) => s.id === patch.supplierId);
        if (!supplier) throw new Error("Supplier not found.");
        t.supplierId = supplier.id;
        t.supplierName = supplier.name;
      }
      if (patch.lines !== undefined) {
        const lines = sanitizePoLines(patch.lines);
        if (lines.length === 0) throw new Error("A purchase order needs at least one line.");
        t.lines = lines;
        t.subtotal = lines.reduce((s, l) => s + l.costPrice * l.quantity, 0);
      }
      if (patch.expectedDate !== undefined) t.expectedDate = patch.expectedDate || undefined;
      if (patch.notes !== undefined) t.notes = patch.notes.trim() || undefined;
      t.updatedAt = now;
      updated = { ...t, lines: t.lines.map((l) => ({ ...l })) };
    });
    return updated;
  },

  async setPurchaseOrderStatus(id: string, status: "sent" | "cancelled") {
    let updated: AdminPurchaseOrder | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const t = (db.purchaseOrders ??= []).find((x) => x.id === id);
      if (!t) return;
      const received = t.lines.some((l) => l.receivedQuantity > 0);
      if (status === "sent" && t.status !== "draft") throw new Error(`PO ${t.id} is already ${t.status}.`);
      if (status === "cancelled" && (t.status === "received" || t.status === "cancelled")) throw new Error(`PO ${t.id} is ${t.status} — it can no longer be cancelled.`);
      if (status === "cancelled" && received) throw new Error(`PO ${t.id} has received goods — cancel is blocked.`);
      t.status = status;
      t.updatedAt = now;
      updated = { ...t, lines: t.lines.map((l) => ({ ...l })) };
    });
    return updated;
  },

  async receivePurchaseOrder(id: string, receipts: PurchaseOrderReceipt[]) {
    let updated: AdminPurchaseOrder | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const t = (db.purchaseOrders ??= []).find((x) => x.id === id);
      if (!t) return;
      if (t.status === "cancelled") throw new Error(`PO ${t.id} is cancelled.`);
      if (t.status === "received") return;
      if (t.status === "draft") throw new Error(`PO ${t.id} is a draft — mark it sent first.`);
      for (const r of receipts ?? []) {
        const line = t.lines.find((l) => l.id === r.lineId);
        if (!line) continue;
        const qty = Math.min(Math.max(0, Math.trunc(Number(r.quantity) || 0)), line.quantity - line.receivedQuantity);
        if (qty <= 0) continue;
        line.receivedQuantity += qty;
        if (line.productId) {
          const p = db.products.find((x) => x.id === line.productId);
          if (p) {
            p.stock += qty;
            syncFulfilment(p);
            touchProductMeta(db, p.id);
            db.movements.unshift({
              id: `mov-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
              productId: p.id,
              productName: p.name,
              productSku: p.sku,
              type: "inbound",
              quantity: qty,
              notes: `Purchase order ${t.id} receipt`,
              createdAt: now,
            });
          }
        }
      }
      const totalReceived = t.lines.reduce((s, l) => s + l.receivedQuantity, 0);
      const allReceived = t.lines.every((l) => l.receivedQuantity >= l.quantity);
      if (totalReceived === 0) t.status = "sent";
      else if (allReceived) { t.status = "received"; t.receivedAt = now; }
      else t.status = "partial";
      t.updatedAt = now;
      updated = { ...t, lines: t.lines.map((l) => ({ ...l })) };
    });
    return updated;
  },

  async deletePurchaseOrder(id: string) {
    let okFlag = false;
    update((db) => {
      const t = (db.purchaseOrders ?? []).find((x) => x.id === id);
      if (!t || t.status !== "draft") return;
      db.purchaseOrders = db.purchaseOrders.filter((x) => x.id !== id);
      okFlag = true;
    });
    return okFlag;
  },

  async getTransferLocations() {
    const db = loadDb();
    const locations: TransferLocation[] = [
      { id: "loc-warehouse", name: "Warehouse — Lahore (factory)", kind: "warehouse" },
    ];
    for (const showroom of (db.showrooms ?? []).filter((x) => x.active).sort((a, b) => a.sortOrder - b.sortOrder)) {
      locations.push({ id: showroom.id, name: `${showroom.name} — ${showroom.city}`, kind: "showroom" });
    }
    return locations;
  },

  async listStockTransfers(params?: ListParams & { status?: TransferStatus | "all" }) {
    const db = loadDb();
    const q = (params?.query ?? "").trim().toLowerCase();
    let rows = [...(db.stockTransfers ?? [])];
    if (params?.status && params.status !== "all") rows = rows.filter((r) => r.status === params.status);
    if (q) rows = rows.filter((r) => [r.id, r.fromLocationName, r.toLocationName, r.notes ?? "", ...r.lines.map((l) => l.name)].join(" ").toLowerCase().includes(q));
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const page = params?.page ?? 1;
    const perPage = params?.perPage ?? 60;
    return { items: rows.slice((page - 1) * perPage, page * perPage), total: rows.length, page, perPage };
  },

  async getStockTransfer(id: string) {
    const t = (loadDb().stockTransfers ?? []).find((x) => x.id === id);
    return t ? { ...t, lines: t.lines.map((l) => ({ ...l })) } : undefined;
  },

  async createStockTransfer(input: NewStockTransferInput) {
    let created: AdminStockTransfer | undefined;
    update((db) => {
      const fromName = transferLocationName(db, input.fromLocationId);
      if (!fromName) throw new Error("Pick a source location.");
      const toName = transferLocationName(db, input.toLocationId);
      if (!toName) throw new Error("Pick a destination location.");
      if (input.fromLocationId === input.toLocationId) throw new Error("Source and destination must differ.");
      const lines = sanitizeTransferLines(input.lines ?? []);
      if (lines.length === 0) throw new Error("Add at least one line to the transfer.");
      const now = new Date().toISOString();
      const maxSeq = (db.stockTransfers ?? []).reduce((max, t) => Math.max(max, Number(t.id.replace(/\D/g, "")) || 0), 1000);
      created = {
        id: `TRF-${maxSeq + 1}`,
        fromLocationId: input.fromLocationId,
        fromLocationName: fromName,
        toLocationId: input.toLocationId,
        toLocationName: toName,
        lines,
        status: "draft",
        notes: input.notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      (db.stockTransfers ??= []).push(created);
    });
    if (!created) throw new Error("Failed to create transfer");
    return created;
  },

  async updateStockTransfer(id: string, patch: AdminStockTransferPatch) {
    let updated: AdminStockTransfer | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const t = (db.stockTransfers ??= []).find((x) => x.id === id);
      if (!t) throw new Error(`Transfer ${id} not found.`);
      if (t.status !== "draft") throw new Error(`Transfer ${t.id} is already dispatched — only drafts can be edited.`);
      const fromId = patch.fromLocationId ?? t.fromLocationId;
      const toId = patch.toLocationId ?? t.toLocationId;
      if (fromId === toId) throw new Error("Source and destination must differ.");
      const fromName = transferLocationName(db, fromId);
      const toName = transferLocationName(db, toId);
      if (!fromName) throw new Error("Pick a source location.");
      if (!toName) throw new Error("Pick a destination location.");
      t.fromLocationId = fromId;
      t.fromLocationName = fromName;
      t.toLocationId = toId;
      t.toLocationName = toName;
      if (patch.lines !== undefined) {
        const lines = sanitizeTransferLines(patch.lines);
        if (lines.length > 0) t.lines = lines;
      }
      if (patch.notes !== undefined) t.notes = patch.notes?.trim() || undefined;
      t.updatedAt = now;
      updated = { ...t, lines: t.lines.map((l) => ({ ...l })) };
    });
    return updated;
  },

  async dispatchStockTransfer(id: string) {
    let updated: AdminStockTransfer | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const t = (db.stockTransfers ??= []).find((x) => x.id === id);
      if (!t) throw new Error(`Transfer ${id} not found.`);
      if (t.status !== "draft") throw new Error(`Transfer ${t.id} is already dispatched.`);
      // Availability check first — nothing is deducted if any line is short.
      const shortfalls: string[] = [];
      for (const line of t.lines) {
        const p = db.products.find((x) => x.id === line.productId);
        if (!p) { shortfalls.push(`${line.name} is no longer in the catalogue`); continue; }
        if (p.stock < line.quantity) shortfalls.push(`${line.name}: only ${p.stock} on hand (needs ${line.quantity})`);
      }
      if (shortfalls.length) throw new Error(`Insufficient stock — ${shortfalls.join("; ")}`);
      for (const line of t.lines) {
        const p = db.products.find((x) => x.id === line.productId)!;
        p.stock = Math.max(0, p.stock - line.quantity);
        syncFulfilment(p);
        touchProductMeta(db, p.id);
        db.movements.unshift({
          id: `mov-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
          productId: p.id,
          productName: p.name,
          productSku: p.sku,
          type: "transfer",
          quantity: -line.quantity,
          notes: `Transfer ${t.id} dispatched to ${t.toLocationName}`,
          createdAt: now,
        });
      }
      t.status = "in_transit";
      t.updatedAt = now;
      updated = { ...t, lines: t.lines.map((l) => ({ ...l })) };
    });
    return updated;
  },

  async receiveStockTransfer(id: string, receipts: StockTransferReceipt[]) {
    let updated: AdminStockTransfer | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const t = (db.stockTransfers ??= []).find((x) => x.id === id);
      if (!t) throw new Error(`Transfer ${id} not found.`);
      if (t.status !== "in_transit") throw new Error(`Transfer ${t.id} is not awaiting receipt.`);
      for (const r of receipts ?? []) {
        const line = t.lines.find((l) => l.id === r.lineId);
        if (!line) continue;
        const qty = Math.min(Math.max(0, Math.trunc(Number(r.quantity) || 0)), line.quantity - line.receivedQuantity);
        if (qty <= 0) continue;
        line.receivedQuantity += qty;
        const p = db.products.find((x) => x.id === line.productId);
        if (p) {
          p.stock += qty;
          syncFulfilment(p);
          touchProductMeta(db, p.id);
          db.movements.unshift({
            id: `mov-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
            productId: p.id,
            productName: p.name,
            productSku: p.sku,
            type: "transfer",
            quantity: qty,
            notes: `Transfer ${t.id} received from ${t.fromLocationName}`,
            createdAt: now,
          });
        }
      }
      if (t.lines.every((l) => l.receivedQuantity >= l.quantity)) {
        t.status = "received";
        t.receivedAt = now;
      }
      t.updatedAt = now;
      updated = { ...t, lines: t.lines.map((l) => ({ ...l })) };
    });
    return updated;
  },

  async deleteStockTransfer(id: string) {
    let ok = false;
    update((db) => {
      const idx = (db.stockTransfers ?? []).findIndex((x) => x.id === id);
      if (idx === -1) return;
      if (db.stockTransfers[idx].status !== "draft") return;
      db.stockTransfers.splice(idx, 1);
      ok = true;
    });
    return ok;
  },

  async listOptionSets() {
    return [...(loadDb().optionSets ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((set) => ({ ...set, values: set.values.map((v) => ({ ...v })) }));
  },

  async createOptionSet(input: NewOptionSetInput) {
    let created: AdminOptionSet | undefined;
    update((db) => {
      const name = input.name?.trim();
      if (!name) throw new Error("Name the option set — e.g. Finish or Size.");
      const values = sanitizeOptionValues(input.values ?? [], "new");
      if (values.length === 0) throw new Error("Add at least one value — e.g. Natural Oak.");
      const now = new Date().toISOString();
      const id = `optset-${Date.now().toString(36)}`;
      created = { id, name, values, createdAt: now, updatedAt: now };
      (db.optionSets ??= []).push(created);
    });
    if (!created) throw new Error("Failed to create the option set");
    return created;
  },

  async updateOptionSet(id: string, patch: AdminOptionSetPatch) {
    let updated: AdminOptionSet | undefined;
    const now = new Date().toISOString();
    update((db) => {
      const set = (db.optionSets ??= []).find((x) => x.id === id);
      if (!set) throw new Error("Option set not found.");
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (name) set.name = name;
      }
      if (patch.values !== undefined) {
        const values = sanitizeOptionValues(patch.values, set.id);
        if (values.length === 0) throw new Error("An option set needs at least one value.");
        set.values = values;
      }
      set.updatedAt = now;
      updated = { ...set, values: set.values.map((v) => ({ ...v })) };
    });
    return updated;
  },

  async deleteOptionSet(id: string) {
    let ok = false;
    update((db) => {
      const attached = (db.products ?? []).some((p) => (p.optionSetIds ?? []).includes(id));
      if (attached) return;                       // refuse while products reference the set
      const before = (db.optionSets ?? []).length;
      db.optionSets = (db.optionSets ?? []).filter((x) => x.id !== id);
      ok = db.optionSets.length < before;
    });
    return ok;
  },

  async listBundles() {
    const db = loadDb();
    return [...(db.bundles ?? [])]
      .map((b) => ({ ...b, lines: b.lines.map((l) => ({ ...l })) }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  },

  async createBundle(input) {
    let created: AdminBundle | undefined;
    update((db) => {
      const name = input.name.trim();
      if (!name) return;
      const now = new Date().toISOString();
      const lines = sanitizeBundleLines(input.lines);
      if (lines.length === 0) return;
      const maxOrder = Math.max(0, ...(db.bundles ?? []).map((b) => b.sortOrder));
      created = {
        id: `bun-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        name,
        description: input.description?.trim() || undefined,
        image: input.image || "desk",
        lines,
        discountPct: clampPct(input.discountPct),
        popular: Boolean(input.popular),
        sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : maxOrder + 10,
        status: "draft", // born as draft — owner activates deliberately
        createdAt: now,
        updatedAt: now,
      };
      (db.bundles ??= []).push(created);
    });
    if (!created) throw new Error("Give the bundle a name and at least one product.");
    return created;
  },

  async updateBundle(id, patch) {
    let updated: AdminBundle | undefined;
    update((db) => {
      const bundle = (db.bundles ??= []).find((x) => x.id === id);
      if (!bundle) return;
      if (patch.name !== undefined) { const n = patch.name.trim(); if (n) bundle.name = n; }
      if (patch.description !== undefined) bundle.description = patch.description?.trim() || undefined;
      if (patch.image !== undefined) bundle.image = patch.image || "desk";
      if (patch.lines !== undefined) {
        const lines = sanitizeBundleLines(patch.lines);
        if (lines.length > 0) bundle.lines = lines;
      }
      if (patch.discountPct !== undefined) bundle.discountPct = clampPct(patch.discountPct);
      if (patch.popular !== undefined) bundle.popular = Boolean(patch.popular);
      if (patch.sortOrder !== undefined) bundle.sortOrder = patch.sortOrder;
      bundle.updatedAt = new Date().toISOString();
      updated = { ...bundle, lines: bundle.lines.map((l) => ({ ...l })) };
    });
    return updated;
  },

  async setBundleStatus(id, status: BundleStatus) {
    let updated: AdminBundle | undefined;
    update((db) => {
      const bundle = (db.bundles ??= []).find((x) => x.id === id);
      if (!bundle) return;
      bundle.status = status;
      bundle.updatedAt = new Date().toISOString();
      updated = { ...bundle, lines: bundle.lines.map((l) => ({ ...l })) };
    });
    return updated;
  },

  async deleteBundle(id) {
    let ok = false;
    update((db) => {
      const arr = (db.bundles ??= []);
      const i = arr.findIndex((x) => x.id === id);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  async listCollections() {
    return [...(loadDb().collections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  },

  async listCollectionProducts(id) {
    const db = loadDb();
    const c = (db.collections ?? []).find((x) => x.id === id);
    if (!c) return [];
    return resolveCollectionProducts(db, c);
  },

  async createCollection(input) {
    let created: AdminCollection | undefined;
    update((db) => {
      const arr = (db.collections ??= []);
      const name = input.name.trim();
      if (!name) return;
      const baseHandle = slugifyHandle(input.handle?.trim() || name);
      let handle = baseHandle;
      let n = 2;
      while (arr.some((c) => c.handle === handle)) handle = `${baseHandle}-${n++}`;
      const rule = input.kind === "automatic" ? input.rule ?? "best_selling" : undefined;
      const productIds = input.kind === "manual" ? [...new Set(input.productIds ?? [])].filter((pid) => db.products.some((p) => p.id === pid)) : [];
      created = {
        id: `col-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        name,
        handle,
        description: input.description?.trim() || undefined,
        kind: input.kind,
        rule,
        productIds,
        sortOrder: Math.max(-1, ...arr.map((c) => c.sortOrder)) + 1,
        createdAt: new Date().toISOString(),
      };
      arr.push(created);
    });
    return created as AdminCollection;
  },

  async updateCollection(id, patch) {
    let updated: AdminCollection | undefined;
    update((db) => {
      const arr = (db.collections ??= []);
      const c = arr.find((x) => x.id === id);
      if (!c) return;
      if (patch.name !== undefined) { const name = patch.name.trim(); if (name) c.name = name; }
      if (patch.handle !== undefined) {
        const base = slugifyHandle(patch.handle);
        let h = base, n = 2;
        while (arr.some((x) => x !== c && x.handle === h)) h = `${base}-${n++}`;
        c.handle = h;
      }
      if (patch.description !== undefined) c.description = patch.description.trim() || undefined;
      if (patch.kind !== undefined && patch.kind !== c.kind) {
        c.kind = patch.kind;
        if (c.kind === "automatic") { c.rule = c.rule ?? "best_selling"; c.productIds = []; } else { c.rule = undefined; }
      }
      if (patch.rule !== undefined && c.kind === "automatic") c.rule = patch.rule;
      if (patch.productIds !== undefined && c.kind === "manual") {
        c.productIds = [...new Set(patch.productIds)].filter((pid) => db.products.some((p) => p.id === pid));
      }
      if (patch.sortOrder !== undefined) c.sortOrder = patch.sortOrder;
      updated = { ...c, productIds: [...c.productIds] };
    });
    return updated;
  },

  async deleteCollection(id) {
    let ok = false;
    update((db) => {
      const arr = (db.collections ??= []);
      const i = arr.findIndex((x) => x.id === id);
      if (i === -1) return;
      arr.splice(i, 1);
      ok = true;
    });
    return ok;
  },

  async listCategories() {
    const db = loadDb();
    const counts = new Map<string, number>();
    for (const p of db.products) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
      if (p.subcategory) counts.set(p.subcategory, (counts.get(p.subcategory) ?? 0) + 1);
    }
    const groupRank = { office: 0, home: 1, ungrouped: 2 } as const;
    return [...db.categories]
      .sort((a, b) => groupRank[a.group] - groupRank[b.group] || (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.name.localeCompare(b.name))
      .map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 }));
  },

  async createCategory({ name, group, parentId }) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Category name is required");
    const base = slugify(trimmed);
    let created: AdminCategory | undefined;
    update((db) => {
      if (parentId) {
        const parent = db.categories.find((c) => c.id === parentId);
        if (!parent) throw new Error("Parent category not found.");
      }
      let id = base;
      let n = 2;
      while (db.categories.some((c) => c.id === id)) id = `${base}-${n++}`;
      const siblings = db.categories.filter((c) => (c.parentId ?? "") === (parentId ?? ""));
      const sortOrder = siblings.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0) + 1;
      created = { id, name: trimmed, group, visible: true, sortOrder, ...(parentId ? { parentId } : {}), createdAt: new Date().toISOString() };
      db.categories.push(created);
    });
    return { ...created! };
  },

  async updateCategory(id, patch) {
    let updated: AdminCategory | undefined;
    update((db) => {
      const c = db.categories.find((x) => x.id === id);
      if (!c) return;
      if (patch.name !== undefined) {
        const t = patch.name.trim();
        if (t) c.name = t;
      }
      if (patch.group !== undefined) c.group = patch.group;
      if (patch.visible !== undefined) c.visible = patch.visible;
      if (patch.heroStyle !== undefined) {
        const allowed = ["standard", "split", "full-width", "minimal"] as const;
        const v = typeof patch.heroStyle === "string" ? patch.heroStyle.trim() : "";
        if (v === "" ) delete c.heroStyle;
        else if ((allowed as readonly string[]).includes(v)) c.heroStyle = v as typeof allowed[number];
      }
      if (patch.homepageBestSellers !== undefined) c.homepageBestSellers = Boolean(patch.homepageBestSellers);
      if (patch.homepageCarousel !== undefined) c.homepageCarousel = Boolean(patch.homepageCarousel);
      for (const key of ["shortDescription", "backgroundImage", "longDescription"] as const) {
        const v = patch[key];
        if (v === undefined) continue;
        const t = v.trim();
        if (t) c[key] = t; else delete c[key];
      }
      if (patch.parentId !== undefined) {
        if (patch.parentId === "") {
          delete c.parentId;
          const roots = db.categories.filter((x) => x.id !== id && !x.parentId);
          c.sortOrder = roots.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) + 1;
        } else {
          if (patch.parentId === id) throw new Error("A category cannot be its own parent.");
          const parent = db.categories.find((x) => x.id === patch.parentId);
          if (!parent) throw new Error("Parent category not found.");
          let cursor: AdminCategory | undefined = parent;
          const seen = new Set<string>();
          while (cursor) {
            if (cursor.id === id) throw new Error("Cannot nest a category inside one of its own descendants.");
            if (seen.has(cursor.id)) break;
            seen.add(cursor.id);
            cursor = cursor.parentId ? db.categories.find((x) => x.id === cursor!.parentId) : undefined;
          }
          c.parentId = patch.parentId;
          if (patch.sortOrder === undefined) {
            const sib = db.categories.filter((x) => x.id !== id && (x.parentId ?? "") === patch.parentId);
            c.sortOrder = sib.reduce((m, r) => Math.max(m, r.sortOrder ?? 0), 0) + 1;
          }
        }
      }
      if (patch.sortOrder !== undefined) c.sortOrder = Math.trunc(patch.sortOrder);
      updated = { ...c };
    });
    return updated;
  },

  async deleteCategory(id) {
    const db = loadDb();
    const target = db.categories.find((c) => c.id === id);
    if (!target) return { ok: false, error: "Category not found" };
    const children = db.categories.filter((c) => c.parentId === id);
    if (children.length) {
      return {
        ok: false,
        error: `“${target.name}” contains ${children.length} child categor${children.length === 1 ? "y" : "ies"}. Move or delete those first.`,
      };
    }
    const inUse = db.products.filter((p) => p.category === id || p.subcategory === id).length;
    if (inUse) {
      return {
        ok: false,
        error: `${inUse} product${inUse === 1 ? "" : "s"} still use “${target.name}”. Reassign them to another category first.`,
      };
    }
    update((d) => { d.categories = d.categories.filter((c) => c.id !== id); });
    return { ok: true };
  },

  async listInventory(params = {}) {
    const db = loadDb();
    const filter = params.filter ?? "all";
    let items = db.products.map((p) => inventoryItemFor(db, p));
    if (filter === "in") items = items.filter((i) => i.stockStatus !== "made_to_order" && i.quantity > i.lowStockThreshold);
    else if (filter === "low") items = items.filter((i) => i.stockStatus !== "made_to_order" && i.quantity > 0 && i.quantity <= i.lowStockThreshold);
    else if (filter === "out") items = items.filter((i) => i.stockStatus !== "made_to_order" && i.quantity === 0);
    else if (filter === "made_to_order") items = items.filter((i) => i.stockStatus === "made_to_order");
    items = items.filter((i) => matchQuery(params.query, [i.name, i.sku, i.category]));
    return items.sort((a, b) => a.quantity - b.quantity || a.name.localeCompare(b.name));
  },

  async adjustStock(input) {
    let out: { item: AdminInventoryItem; movement: AdminStockMovement } | undefined;
    update((db) => {
      const p = db.products.find((x) => x.id === input.productId);
      if (!p) return;
      const magnitude = Math.abs(Math.trunc(Number(input.quantity)) || 0);
      const signed =
        input.type === "adjustment"
          ? Math.trunc(Number(input.quantity)) || 0
          : input.type === "inbound" || input.type === "return"
            ? magnitude
            : -magnitude;
      const before = p.stock;
      p.stock = Math.max(0, before + signed);
      syncFulfilment(p);
      touchProductMeta(db, p.id);
      const movement: AdminStockMovement = {
        id: `mov-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
        productId: p.id,
        productName: p.name,
        productSku: p.sku,
        type: input.type,
        quantity: p.stock - before, // applied delta after clamping — honest audit trail
        notes: input.notes?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      if (movement.quantity !== 0 || input.type === "adjustment" || movement.notes) db.movements.unshift(movement);
      out = { item: inventoryItemFor(db, p), movement };
    });
    return out;
  },

  async listStockMovements(params = {}) {
    let items = [...loadDb().movements];
    if (params.productId) items = items.filter((m) => m.productId === params.productId);
    return items.slice(0, params.limit ?? 60);
  },

  async listDeliveryZones() {
    return loadDb().zones.map((z) => ({ ...z, postalCodes: [...z.postalCodes] }));
  },

  async saveDeliveryZone(input) {
    const nowIso = new Date().toISOString();
    const clean = {
      zoneName: input.zoneName.trim() || "Untitled zone",
      city: input.city.trim() || "—",
      postalCodes: (input.postalCodes ?? []).map((s: string) => String(s).trim()).filter(Boolean).slice(0, 40),
      standardCost: Math.max(0, Number(input.standardCost) || 0),
      expressCost: Math.max(0, Number(input.expressCost) || 0),
      sameDayCost: Math.max(0, Number(input.sameDayCost) || 0),
      standardDays: clampInt(input.standardDays, 0, 30),
      expressDays: clampInt(input.expressDays, 0, 30),
      codAvailable: Boolean(input.codAvailable),
      isActive: Boolean(input.isActive),
    };
    let out: AdminDeliveryZone | undefined;
    update((db) => {
      const idx = input.id ? db.zones.findIndex((z) => z.id === input.id) : -1;
      if (idx >= 0) {
        const z = db.zones[idx];
        db.zones[idx] = { ...z, ...clean, updatedAt: nowIso };
        out = { ...db.zones[idx] };
      } else {
        out = { id: `zone-${slugify(clean.zoneName) || "zone"}-${Date.now().toString(36)}`, ...clean, createdAt: nowIso, updatedAt: nowIso };
        db.zones.push(out);
      }
    });
    return out!;
  },

  async deleteDeliveryZone(id) {
    let removed = false;
    update((db) => {
      const before = db.zones.length;
      db.zones = db.zones.filter((z) => z.id !== id);
      removed = db.zones.length < before;
    });
    return removed;
  },

  async listMediaAssets() {
    await ensureMediaSeeded();
    return idbGetAll();
  },

  async addMediaAsset(input) {
    await ensureMediaSeeded();
    const created: AdminMediaAsset = {
      id: `med-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      createdAt: new Date().toISOString(),
      ...input,
    };
    await idbPutMany([created]);
    return created;
  },

  async deleteMediaAsset(id) {
    return (await idbDeleteMany([id])) > 0;
  },

  async updateMediaAsset(id, patch) {
    await ensureMediaSeeded();
    const all = await idbGetAll();
    const current = all.find((a) => a.id === id);
    if (!current) return undefined;
    const next: AdminMediaAsset = { ...current, ...patch };
    if (next.folder !== undefined && !next.folder.trim()) delete next.folder;
    await idbPutMany([next]);
    return next;
  },

  async bulkDeleteMediaAssets(ids) {
    return idbDeleteMany(ids);
  },

  async moveMediaAssets(ids, folder) {
    await ensureMediaSeeded();
    const all = await idbGetAll();
    const sel = new Set(ids);
    const trimmed = folder?.trim();
    const moved = all.filter((a) => sel.has(a.id)).map((a) => {
      const next = { ...a };
      if (trimmed) next.folder = trimmed; else delete next.folder;
      return next;
    });
    await idbPutMany(moved);
    return moved.length;
  },

  async assignMediaToProduct(assetId, productId) {
    await ensureMediaSeeded();
    const all = await idbGetAll();
    if (!all.some((a) => a.id === assetId)) return false;
    let found = false;
    update((db) => {
      const p = db.products.find((x) => x.id === productId);
      if (p) {
        const asset = all.find((a) => a.id === assetId)!;
        p.image = asset.url;
        found = true;
      }
    });
    return found;
  },

  async createOrder(input: NewOrderInput): Promise<AdminOrder> {
    let created: AdminOrder | undefined;
    update((db) => {
      created = materializeOrder(db, input);
    });
    if (!created) throw new Error("Failed to create order");
    return created;
  },

  async createLead(input: NewLeadInput): Promise<AdminLead> {
    let created: AdminLead | undefined;
    update((db) => {
      const lead: AdminLead = {
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
        consent: input.consent,
        consentAt: input.consentAt,
        consentVersion: input.consentVersion,
        landingPath: input.landingPath,
        referrer: input.referrer,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
      };
      db.leads.push(lead);
      created = { ...lead };
    });
    if (!created) throw new Error("Failed to create lead");
    return created;
  },

  async resetDemoData() {
    memory = buildSeed();
    persist(memory);
  },
};
