/**
 * WOODEX demo database — seeded from the real storefront catalogue and persisted to
 * localStorage so the /admin preview is fully interactive (edits survive reloads).
 *
 * This is the `demo` adapter behind AdminApi. When VITE_API_MODE=bagisto the same
 * interface is served by src/api/bagisto/* instead — no UI changes required.
 */
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
        name: `${String(p.id).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${out.length + 1}.jpg`,
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

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "category";

function buildSeed(): DemoDb {
  const rand = mulberry32(20261106);

  /* products from the live catalogue */
  const adminProducts: AdminProduct[] = products.map((p) => {
    const stock = p.inStock ? (hashString(p.id) % 90) + 3 : 0;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      subcategory: (p as { subcategory?: string }).subcategory,
      price: p.price,
      compareAtPrice: p.originalPrice,
      image: p.images[0],
      inStock: p.inStock,
      stock,
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

  return { products: adminProducts, orders, customers, leads, settings: { ...DEFAULT_SETTINGS }, categories: buildSeedCategories(), media: buildSeedMedia() };
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
      // migrate payloads saved before categories/media existed
      if (!Array.isArray(db.categories)) db.categories = buildSeedCategories();
      if (!Array.isArray(db.media)) db.media = buildSeedMedia();
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
      if (p) { Object.assign(p, patch); updated = { ...p }; }
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

  async listMediaAssets() {
    return [...loadDb().media].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async addMediaAsset(input) {
    if (input.size > 4 * 1024 * 1024) throw new Error("File exceeds the 4 MB demo-library limit");
    let created: AdminMediaAsset | undefined;
    update((db) => {
      created = { id: `med-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), ...input };
      db.media.unshift(created);
    });
    return { ...created! };
  },

  async deleteMediaAsset(id) {
    let removed = false;
    update((db) => {
      const before = db.media.length;
      db.media = db.media.filter((m) => m.id !== id);
      removed = db.media.length < before;
    });
    return removed;
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
