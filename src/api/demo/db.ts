/**
 * WOODEX demo database — seeded from the real storefront catalogue and persisted to
 * localStorage so the /admin preview is fully interactive (edits survive reloads).
 *
 * This is the `demo` adapter behind AdminApi. When VITE_API_MODE=bagisto the same
 * interface is served by src/api/bagisto/* instead — no UI changes required.
 */
import { idbDeleteMany, idbGetAll, idbPutMany } from "@/api/demo/mediaStore";
import { products, categoryGroups } from "@/data/products";
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
  NewShowroomInput,
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

const clampPct = (n: number) => Math.min(60, Math.max(0, Math.round(Number(n) || 0)));
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
    { daysAgo: 0, type: "quote", name: "Danish Hussain", email: "danish.h@example.com", phone: "+92 301 7788991", city: "Lahore", summary: "Executive cabin: 2 manager tables, 8 visitor chairs, 1 meeting table for 10", value: 1450000, status: "new" },
    { daysAgo: 1, type: "b2b", name: "Sana Malik", company: "Indus Developers", email: "projects@indusdevelopers.pk", phone: "+92 345 1122334", city: "Lahore", summary: "Fit-out for 3 sales centres — reception counters, lounge sofas, 40 workstations", value: 18500000, status: "new" },
    { daysAgo: 2, type: "quote", name: "Hira Zainab", email: "hira.z@example.com", phone: "+92 322 6677889", city: "Karachi", summary: "Home office: 1 executive desk, ergonomic chair, bookshelf", value: 385000, status: "new" },
    { daysAgo: 3, type: "b2b", name: "Imran Sheikh", company: "Alpha Textiles Pvt Ltd", email: "procurement@alphatextiles.pk", phone: "+92 321 4567890", city: "Faisalabad", summary: "Factory office renovation — 25 staff tables, 60 chairs, storage units", value: 7200000, status: "contacted" },
    { daysAgo: 5, type: "quote", name: "Bilal Ahmed", email: "bilal.a@example.com", phone: "+92 315 8899007", city: "Islamabad", summary: "Conference room: 1 boardroom table, 14 recliner chairs, acoustic panels", value: 2100000, status: "quoted" },
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
    return { ...rest, id: `lead-${1001 + i}`, createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString() };
  });

  return { products: adminProducts, orders, customers, leads, settings: { ...DEFAULT_SETTINGS }, categories: buildSeedCategories(), media: buildSeedMedia(), inventoryMeta: buildInventoryMeta(adminProducts), movements: buildSeedMovements(adminProducts), zones: buildSeedZones(), orderEvents: buildSeedOrderEvents(orders), collections: buildSeedCollections(adminProducts), companies: buildSeedCompanies(), priceLists: buildSeedPriceLists(), bundles: buildSeedBundles(), salesChannels: buildSeedSalesChannels(), showrooms: buildSeedShowrooms() };
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
      created = { ...order };
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
