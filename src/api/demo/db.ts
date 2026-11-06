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
  AdminCustomer,
  AdminLead,
  AdminMediaAsset,
  AdminOrder,
  AdminOrderItem,
  AdminProduct,
  DashboardStats,
  ListParams,
  NewLeadInput,
  NewOrderInput,
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

  return { products: adminProducts, orders, customers, leads, settings: { ...DEFAULT_SETTINGS }, categories: buildSeedCategories(), media: buildSeedMedia(), inventoryMeta: buildInventoryMeta(adminProducts), movements: buildSeedMovements(adminProducts), zones: buildSeedZones() };
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
      if (!db.inventoryMeta || typeof db.inventoryMeta !== "object" || Array.isArray(db.inventoryMeta)) db.inventoryMeta = buildInventoryMeta(db.products);
      db.products.forEach((p, i) => {
        if (!p.sku) p.sku = `WDX-${String(i + 1001).padStart(4, "0")}`;
        if (!p.stockStatus) p.stockStatus = p.stock === 0 ? "out_of_stock" : "in_stock";
        if (!db.inventoryMeta[p.id]) db.inventoryMeta[p.id] = defaultInventoryMeta(p.id);
      });
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

function paginate<T>(items: T[], { page = 1, perPage = 10 }: ListParams) {
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
    items = items.filter((p) => matchQuery(params.query, [p.name, p.category, p.id]));
    items.sort((a, b) => b.reviews - a.reviews);
    return paginate(items, { page: params.page, perPage: params.perPage ?? 10 });
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

  async updateOrderStatus(id, status) {
    let updated: AdminOrder | undefined;
    update((db) => {
      const o = db.orders.find((x) => x.id === id);
      if (o) { o.status = status; updated = { ...o }; }
    });
    return updated;
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

  async listCategories() {
    const db = loadDb();
    const counts = new Map<string, number>();
    for (const p of db.products) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
      if (p.subcategory) counts.set(p.subcategory, (counts.get(p.subcategory) ?? 0) + 1);
    }
    const groupRank = { office: 0, home: 1, ungrouped: 2 } as const;
    return [...db.categories]
      .sort((a, b) => groupRank[a.group] - groupRank[b.group] || a.name.localeCompare(b.name))
      .map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 }));
  },

  async createCategory({ name, group }) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Category name is required");
    const base = slugify(trimmed);
    let created: AdminCategory | undefined;
    update((db) => {
      let id = base;
      let n = 2;
      while (db.categories.some((c) => c.id === id)) id = `${base}-${n++}`;
      created = { id, name: trimmed, group, visible: true, createdAt: new Date().toISOString() };
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
      updated = { ...c };
    });
    return updated;
  },

  async deleteCategory(id) {
    const db = loadDb();
    const target = db.categories.find((c) => c.id === id);
    if (!target) return { ok: false, error: "Category not found" };
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
