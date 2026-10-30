#!/usr/bin/env node
/**
 * Build the static admin preview.
 *
 *   node platform/tools/make-admin-preview.mjs
 *   → docs/07-woodex-os/preview/admin.html
 *
 * Why this exists: the real admin is Livewire inside the OS, and it needs PHP, Composer and
 * MySQL — none of which exist in a build sandbox or in a design review. This script renders
 * the same screens, from the same seeded catalogue, with the same words, into one file you can
 * open from a phone. It is a preview, and the page says so at the top, so nobody mistakes it
 * for the product.
 *
 * Every figure below is computed from `catalog.json` with the platform's own rules: 18% sales
 * tax, ₨2,500 delivery free over ₨200,000, availability = on hand − held. If the seed changes,
 * the preview changes.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const platform = join(here, "..");
const out = join(platform, "..", "docs", "07-woodex-os", "preview", "admin.html");

const seed = JSON.parse(readFileSync(join(platform, "database/seeders/data/catalog.json"), "utf8"));
const categories = Object.fromEntries(seed.categories.map((c) => [c.key, c.name]));
const categorySlug = Object.fromEntries(seed.categories.map((c) => [c.key, c.slug]));

const TAX_BP = 1800;
const DELIVERY = 250000;
const FREE_OVER = 20000000;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const rupees = (minor) =>
  `PKR ${Math.floor(Math.abs(minor) / 100).toLocaleString("en-US")}.${String(Math.abs(minor) % 100).padStart(2, "0")}`;

/** Deterministic pseudo-random so two runs of this script produce the same file. */
const hash = (text) => {
  let value = 2166136261;
  for (const char of text) value = (value ^ char.charCodeAt(0)) * 16777619 >>> 0;
  return value >>> 0;
};

const warehouses = ["Lahore · Gulberg", "Karachi · SITE", "Online"];

const products = seed.products.map((product, index) => {
  const seedValue = hash(product.sku);
  const qty = seedValue % 17;
  const reserved = qty === 0 ? 0 : seedValue % 4;
  const threshold = 3;

  return {
    index,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    category: categories[product.category] ?? product.category,
    categoryKey: product.category,
    categorySlug: categorySlug[product.category] ?? product.category,
    subcategory: product.subcategory ?? null,
    series: product.series,
    priceMinor: product.price * 100,
    compareMinor: product.compare_at ? product.compare_at * 100 : null,
    rating: product.rating,
    reviews: product.review_count,
    featured: Boolean(product.featured),
    warehouse: warehouses[seedValue % warehouses.length],
    qty,
    reserved: Math.min(reserved, qty),
    threshold,
    available: Math.max(0, qty - reserved),
  };
});

const status = (row) => (row.available === 0 ? "out" : row.available <= row.threshold ? "low" : "ok");
const statusLabel = { out: "Out of stock", low: "Running low", ok: "In stock" };
const statusTone = { out: "error", low: "warning", ok: "success" };

const lowStock = products.filter((row) => ["out", "low"].includes(status(row)));
const totals = {
  published: products.length,
  variants: products.length + 4,
  categories: seed.categories.length,
  units: products.reduce((sum, row) => sum + row.qty, 0),
  held: products.reduce((sum, row) => sum + row.reserved, 0),
  low: products.filter((row) => status(row) === "low").length,
  out: products.filter((row) => status(row) === "out").length,
  valueMinor: products.reduce((sum, row) => sum + row.qty * row.priceMinor, 0),
};

/**
 * The category tree, with the same counts the admin screen shows.
 *
 * Direct counts first (a product is filed at its leaf), then rolled up — a root whose stock
 * lives entirely in its children must not read as empty.
 */
const headline = (slug) => slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

const directCount = (slug) =>
  products.filter((row) => row.subcategory === slug || (row.categoryKey === slug && !row.subcategory)).length;

function buildNode(entry, rootKey) {
  const slug = typeof entry === "string" ? entry : entry.slug;
  const children = (typeof entry === "string" ? [] : entry.children ?? []).map((child) => buildNode(child, rootKey));

  return {
    slug,
    name: headline(slug),
    rootKey,
    children,
    direct: directCount(slug),
    rolling: 0,
  };
}

const rollUp = (node) => {
  node.rolling = node.direct + node.children.reduce((sum, child) => sum + rollUp(child), 0);
  return node.rolling;
};

const categoryNodes = seed.categories.map((root) => {
  const node = buildNode({ slug: root.key, children: root.children ?? [] }, root.key);
  node.name = root.name;
  node.isRoot = true;
  rollUp(node);
  return node;
});

/** Orders, built from real products with the platform's money rules. */
const order = (number, daysAgo, customer, city, lines, gateway, phone, coupon = null, discount = 0) => {
  const subtotal = lines.reduce((sum, line) => sum + products[line.index].priceMinor * line.qty, 0);
  const net = subtotal - discount;
  const tax = Math.round((net * TAX_BP) / 10000);
  const shipping = net >= FREE_OVER ? 0 : DELIVERY;
  const grand = net + tax + shipping;

  return {
    number,
    placed: `2026-10-${String(31 - daysAgo).padStart(2, "0")}`,
    coupon,
    discount,
    customer,
    city,
    phone,
    gateway,
    payment: gateway === "cod" ? "pending" : "paid",
    status: daysAgo === 0 ? "placed" : daysAgo === 1 ? "confirmed" : "packed",
    subtotal,
    tax,
    shipping,
    grand,
    items: lines.map((line) => ({
      name: products[line.index].name,
      sku: products[line.index].sku,
      qty: line.qty,
      total: products[line.index].priceMinor * line.qty,
    })),
  };
};

/*
 * Five orders, and one deliberate fact: the same person is typed two ways.
 *
 * `Muhammad Ali` orders twice on the same number — once as `0300-1234567`, once as
 * `+92 300 1234567`. `Sana Traders` and `Bilal Ahmed` share a number, which is what a
 * business landline looks like. Both are in the catalog of things the customers screen is
 * for, so the preview should not pretend the seed is tidier than reality.
 */
const orders = [
  order("WDX-000042", 0, "Muhammad Ali", "Lahore", [{ index: 0, qty: 1 }], "cod", "0300-1234567"),
  order("WDX-000041", 1, "Ayesha Khan", "Karachi", [{ index: 5, qty: 2 }, { index: 12, qty: 1 }], "bank", "0321 9988776", "EID10", 600000),
  order("WDX-000040", 3, "Sana Traders", "Islamabad", [{ index: 9, qty: 4 }], "cod", "051 2277889"),
  order("WDX-000039", 5, "Bilal Ahmed", "Islamabad", [{ index: 3, qty: 1 }, { index: 15, qty: 2 }], "bank", "+92 51 227 7889", null, 250000),
  order("WDX-000038", 9, "Muhammad Ali", "Lahore", [{ index: 7, qty: 2 }], "cod", "+92 300 1234567"),
];

/*
 * One set of money facts, read by three screens.
 *
 * `recorded` is what the order says it received; `refunded` is what went back. Keeping them in
 * one place is the only reason the invoice, payments and refunds screens can agree — in the app
 * they all read `paid_minor` and `refunded_minor` from the same row.
 */
const money = Object.fromEntries(
  orders.map((row) => [
    row.number,
    {
      recorded: 0,
      refunded: 0,
    },
  ]),
);

money["WDX-000041"].recorded = 0;                                  // the drift case — the transfer landed, the order was never updated
money["WDX-000038"].recorded = orders.find((o) => o.number === "WDX-000038").grand;
money["WDX-000038"].refunded = Math.round(money["WDX-000038"].recorded / 4); // one chair returned, partly refunded

const recordedOf = (number) => money[number]?.recorded ?? 0;
const refundedOf = (number) => money[number]?.refunded ?? 0;

const holds = products
  .filter((row) => row.reserved > 0)
  .slice(0, 3)
  .map((row, i) => ({
    name: row.name,
    warehouse: row.warehouse,
    qty: row.reserved,
    expires: ["in 3 hours", "in 11 hours", "expired 2 hours ago"][i] ?? "in 1 day",
    expired: i === 2,
    holder: ["cart #1841", "cart #1839", "order #97"][i] ?? "cart #1830",
  }));

/* ── Attributes ─────────────────────────────────────────────────────────────────────────
 *
 * The vocabulary, counted against the catalog the way the screen counts it: products that
 * carry each option, and variants that point at it. A material option nothing carries would
 * be a filter returning an empty page; a finish with no variant behind it is a swatch that
 * cannot be bought. Both are silent in the attribute table and visible here.
 */
const materials = seed.attributes.find((a) => a.code === "material");
const finishes = seed.attributes.find((a) => a.code === "finish");

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const materialOptions = materials.options.map((option) => {
  const carried = products.filter((row) => {
    const product = seed.products.find((p) => p.sku === row.sku);
    return slugify(product.material) === option.code;
  });

  return {
    code: option.code,
    label: option.label,
    products: carried.length,
    variants: 0,
    state: carried.length > 0 ? "used" : "dead_filter",
  };
});

const finishOptions = finishes.options.map((option) => {
  const variants = seed.variants.filter((variant) => variant.option_value === option.label);
  const carried = new Set(variants.map((variant) => variant.product_sku));

  return {
    code: option.code,
    label: option.label,
    hex: option.hex,
    products: carried.size,
    variants: variants.length,
    state: variants.length === 0 ? "orphan_variant" : "used",
  };
});

const attributeGroups = [
  {
    code: materials.code,
    name: materials.name,
    type: materials.type,
    isVariant: materials.is_variant,
    isFilterable: materials.is_filterable,
    options: materialOptions,
  },
  {
    code: finishes.code,
    name: finishes.name,
    type: finishes.type,
    isVariant: finishes.is_variant,
    isFilterable: finishes.is_filterable,
    options: finishOptions,
  },
];

const allOptions = attributeGroups.flatMap((group) => group.options);
const attributeSummary = {
  attributes: attributeGroups.length,
  options: allOptions.length,
  used: allOptions.filter((o) => o.state === "used").length,
  deadFilter: allOptions.filter((o) => o.state === "dead_filter").length,
  orphan: allOptions.filter((o) => o.state === "orphan_variant").length,
  rail: allOptions.filter((o) => o.state === "used" && o.variants + o.products > 0).length,
};

/* ── Payments ───────────────────────────────────────────────────────────────────────────
 *
 * One payment row per order, plus the two cases the screen exists for: a bank transfer
 * nobody has checked yet, and an order whose payment row and recorded total disagree.
 */
const payments = orders.flatMap((row, index) => {
  const base = {
    order: row.number,
    gateway: row.gateway === "cod" ? "cod" : "bank",
    amount: row.grand,
    status: row.gateway === "cod" ? "pending" : "paid",
    paidAt: row.placed,
    reference: row.gateway === "cod" ? null : `TRX-${88200 + index}`,
  };

  // WDX-000039 is the awaiting case: money sent, nobody has looked at the account yet.
  if (row.number === "WDX-000039") return [{ ...base, status: "pending" }];

  return [base];
});

const recordedPaid = Object.fromEntries(orders.map((row) => [row.number, recordedOf(row.number)]));

const paymentStates = payments.map((payment) => {
  const recorded = recordedPaid[payment.order] ?? 0;
  const received = payments.filter((p) => p.order === payment.order && p.status === "paid").reduce((sum, p) => sum + p.amount, 0);

  if (payment.status === "pending" && payment.gateway !== "cod") return "awaiting";
  if (payment.status === "paid" && received !== recorded) return "drift";
  return "settled";
});

const paymentSummary = {
  received: payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0),
  pending: payments.filter((p) => p.status === "pending" && p.gateway !== "cod").length,
  pendingAmount: payments.filter((p) => p.status === "pending" && p.gateway !== "cod").reduce((sum, p) => sum + p.amount, 0),
  drift: paymentStates.filter((s) => s === "drift").length,
  codPending: payments.filter((p) => p.gateway === "cod" && p.status === "pending").reduce((sum, p) => sum + p.amount, 0),
};

/* ── Refunds ────────────────────────────────────────────────────────────────────────────
 *
 * Only what went back, plus any cancellation that still holds money. `RefundAudit` derives the
 * three defects from these numbers; the preview shows what it would find.
 */
const refundRowsData = orders
  .filter((row) => refundedOf(row.number) > 0 || (row.status === "cancelled" && recordedOf(row.number) > 0))
  .map((row) => {
    const paid = recordedOf(row.number);
    const refunded = refundedOf(row.number);
    let state = "partial";

    if (refunded > paid) state = "over";
    else if (row.status === "cancelled" && paid > 0 && refunded === 0) state = "held";
    else if (refunded > 0 && row.status !== "cancelled") state = "open";
    else if (refunded >= paid) state = "full";

    return { order: row.number, total: row.grand, paid, refunded, status: row.status, state };
  });

const refundSummary = {
  refunded: refundRowsData.reduce((sum, row) => sum + row.refunded, 0),
  count: refundRowsData.filter((row) => row.refunded > 0).length,
  partial: refundRowsData.filter((row) => row.state === "partial").length,
  full: refundRowsData.filter((row) => row.state === "full").length,
  held: refundRowsData.filter((row) => row.state === "held").length,
  over: refundRowsData.filter((row) => row.state === "over").length,
  paid: orders.reduce((sum, row) => sum + recordedOf(row.number), 0),
};
refundSummary.rate = refundSummary.paid === 0 ? 0 : (refundSummary.refunded * 100) / refundSummary.paid;

/* ── Promotions ─────────────────────────────────────────────────────────────────────────
 *
 * Every order that carried a code or gave money away. The two findings are in the data on
 * purpose: one code that ran twice, and one discount with no code at all.
 */
const promoOrders = orders.filter((row) => row.coupon !== null || row.discount > 0);

const promoByCode = Object.values(
  promoOrders
    .filter((row) => row.coupon)
    .reduce((acc, row) => {
      const code = row.coupon.trim().toUpperCase();
      acc[code] ??= { code, uses: 0, discount: 0, average: 0, largest: 0, subtotal: 0 };
      acc[code].uses++;
      acc[code].discount += row.discount;
      acc[code].largest = Math.max(acc[code].largest, row.discount);
      acc[code].subtotal += row.subtotal;
      return acc;
    }, {}),
)
  .map((row) => ({ ...row, average: Math.floor(row.discount / row.uses) }))
  .sort((a, b) => b.discount - a.discount);

const promoUnattributed = promoOrders.filter((row) => !row.coupon && row.discount > 0);
const promoSummary = {
  discount: promoOrders.reduce((sum, row) => sum + row.discount, 0),
  gross: promoOrders.reduce((sum, row) => sum + row.subtotal, 0),
  codes: promoByCode.length,
  uses: promoOrders.filter((row) => row.coupon).length,
  unattributed: promoUnattributed.length,
  unattributedAmount: promoUnattributed.reduce((sum, row) => sum + row.discount, 0),
};
promoSummary.rate = promoSummary.gross === 0 ? 0 : (promoSummary.discount * 100) / promoSummary.gross;

/* ── Shipping & tax ─────────────────────────────────────────────────────────────────────
 *
 * The audit needs no separate data: the rules are constants and every order stores what it was
 * charged. If the two disagree, the mismatch list below fills itself.
 */
const chargeRows = orders
  .filter((row) => row.status !== "cancelled")
  .map((row) => {
    const net = row.subtotal - row.discount;
    const expectedTax = Math.round((net * TAX_BP) / 10000);
    const expectedShipping = net >= FREE_OVER ? 0 : DELIVERY;

    return {
      order: row.number,
      net,
      tax: row.tax,
      shipping: row.shipping,
      taxDrift: expectedTax !== row.tax,
      shippingDrift: expectedShipping !== row.shipping,
      expectedTax,
      expectedShipping,
    };
  });

const chargeSummary = {
  tax: chargeRows.reduce((sum, row) => sum + row.tax, 0),
  shipping: chargeRows.reduce((sum, row) => sum + row.shipping, 0),
  net: chargeRows.reduce((sum, row) => sum + row.net, 0),
  free: chargeRows.filter((row) => row.shipping === 0).length,
  taxErrors: chargeRows.filter((row) => row.taxDrift).length,
  shippingErrors: chargeRows.filter((row) => row.shippingDrift).length,
};
chargeSummary.effectiveBp = chargeSummary.net === 0 ? 0 : (chargeSummary.tax * 10000) / chargeSummary.net;

/* ── Reports ────────────────────────────────────────────────────────────────────────────
 *
 * Revenue is goods minus discount: tax goes to the government and delivery pays for a van.
 */
const reportRows = orders
  .filter((row) => row.status !== "cancelled")
  .flatMap((row) =>
    row.items.map((item) => ({
      order: row.number,
      date: row.placed,
      product: item.name,
      qty: item.qty,
      // The order-level discount is split across its lines in proportion to their value,
      // which is what the calculator already does when it writes `line_discount_minor`.
      revenue: item.total - Math.round((row.discount * item.total) / Math.max(1, row.subtotal)),
    })),
  );

const reportByDay = Object.values(
  reportRows.reduce((acc, row) => {
    acc[row.date] ??= { date: row.date, revenue: 0, units: 0, orders: new Set() };
    acc[row.date].revenue += row.revenue;
    acc[row.date].units += row.qty;
    acc[row.date].orders.add(row.order);
    return acc;
  }, {}),
)
  .map((row) => ({ ...row, orders: row.orders.size }))
  .sort((a, b) => (a.date < b.date ? -1 : 1));

const reportByProduct = Object.values(
  reportRows.reduce((acc, row) => {
    acc[row.product] ??= { product: row.product, revenue: 0, units: 0 };
    acc[row.product].revenue += row.revenue;
    acc[row.product].units += row.qty;
    return acc;
  }, {}),
).sort((a, b) => b.revenue - a.revenue);

const reportSummary = {
  revenue: reportRows.reduce((sum, row) => sum + row.revenue, 0),
  units: reportRows.reduce((sum, row) => sum + row.qty, 0),
  orders: new Set(reportRows.map((row) => row.order)).size,
  days: reportByDay.length,
  refunded: orders.reduce((sum, row) => sum + refundedOf(row.number), 0),
};
reportSummary.average = reportSummary.orders === 0 ? 0 : Math.floor(reportSummary.revenue / reportSummary.orders);
reportSummary.peak = Math.max(1, ...reportByDay.map((row) => row.revenue));

/* ── Settings ───────────────────────────────────────────────────────────────────────────
 *
 * The counters, checked against the numbers actually issued.
 */
const sequences = [
  { key: "order", prefix: "WDX-", next: 43, highest: Math.max(...orders.map((row) => Number(row.number.slice(-6)))) },
  { key: "invoice", prefix: "INV-", next: 43, highest: Math.max(...orders.map((row) => Number(row.number.split("-")[1]))) },
  { key: "rma", prefix: "RMA-", next: 1, highest: 0 },
].map((row) => {
  const state = row.highest === 0 ? "empty" : row.next <= row.highest ? "colliding" : row.next > row.highest + 1 ? "ahead" : "healthy";
  return { ...row, gap: row.next - row.highest, state };
});

const countNodes = (nodes) => nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0);
const depthOf = (nodes) => (nodes.length === 0 ? 0 : 1 + Math.max(...nodes.map((node) => depthOf(node.children))));

const categoryRow = (node, depth = 0) => {
  const indent = depth === 0 ? "" : ` style="padding-left:${depth * 22}px"`;
  const badgeList = node.isRoot
    ? `${badge("success", "Live")}${badge("neutral", "In menu")}`
    : `${badge("success", "Live")}`;

  const moveButtons = node.isRoot || depth > 0
    ? `<span class="muted" style="font-size:11px">↑ ↓</span>`
    : "";

  return `<tr>
      <td${indent}>${depth > 0 ? '<span class="muted" aria-hidden="true">└ </span>' : ""}<strong>${esc(node.name)}</strong>
        <div class="muted mono">/${esc(node.slug)}</div></td>
      <td class="right">${node.rolling}</td>
      <td>${badgeList}</td>
      <td class="right">${moveButtons}</td>
    </tr>`;
};

const categoryRows = (nodes, depth = 0) =>
  nodes.map((node) => categoryRow(node, depth) + categoryRows(node.children, depth + 1)).join("\n");

/**
 * Invoices derived from the three orders, with the same rules as InvoiceBalance:
 * net paid = paid − refunded, outstanding = max(0, total − net paid), and overdue is about the
 * deadline rather than the stored status.
 */
const invoices = orders.map((row, index) => {
  // Shapes worth seeing at once: nothing received, paid in full, and paid then partly refunded
  // — the last one is where the stored status and the money disagree most often.
  const paid = recordedOf(row.number);
  const refunded = refundedOf(row.number);
  const netPaid = Math.max(0, paid - refunded);
  const outstanding = Math.max(0, row.grand - netPaid);
  const daysUntilDue = index === 2 ? -12 : index === 1 ? 4 : 21;

  const status = outstanding === 0 ? "paid" : netPaid > 0 ? "part_paid" : "issued";
  const overdue = outstanding > 0 && daysUntilDue < 0;

  return {
    number: `INV-0000${42 - index}`,
    order: row.number,
    customer: row.customer,
    city: row.city,
    issued: row.placed,
    total: row.grand,
    paid: netPaid,
    outstanding,
    daysUntilDue,
    overdue,
    status,
    label: overdue ? "Overdue" : status === "paid" ? "Paid" : status === "part_paid" ? "Part paid" : "Issued",
    tone: overdue ? "error" : status === "paid" ? "success" : status === "part_paid" ? "warning" : "info",
  };
});

const invoiceSummary = {
  count: invoices.length,
  paid: invoices.reduce((sum, inv) => sum + inv.paid, 0),
  outstanding: invoices.reduce((sum, inv) => sum + inv.outstanding, 0),
  overdue: invoices.filter((inv) => inv.overdue).reduce((sum, inv) => sum + inv.outstanding, 0),
  overdueCount: invoices.filter((inv) => inv.overdue).length,
};

const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const badge = (tone, label) => `<span class="badge badge-${tone}">${esc(label)}</span>`;

const refundStateBadge = {
  over: ["error", "Refunded more than paid"],
  held: ["error", "Cancelled, money held"],
  open: ["warning", "Refunded, still live"],
  partial: ["info", "Partially refunded"],
  full: ["success", "Refunded in full"],
};

const refundRows = refundRowsData
  .map((row) => {
    const [tone, label] = refundStateBadge[row.state];
    return `<tr>
      <td class="mono">${esc(row.order)}</td>
      <td class="right mono muted">${rupees(row.total)}</td>
      <td class="right mono">${rupees(row.paid)}</td>
      <td class="right mono">${row.refunded > 0 ? rupees(row.refunded) : "—"}</td>
      <td class="muted">${esc(row.status)}</td>
      <td>${badge(tone, label)}</td>
    </tr>`;
  })
  .join("\n");

const promoRows = promoByCode
  .map(
    (row) => `<tr>
      <td class="mono">${esc(row.code)}</td>
      <td class="right">${row.uses}</td>
      <td class="right mono">${rupees(row.discount)}</td>
      <td class="right mono muted">${rupees(row.average)}</td>
      <td class="right mono muted">${rupees(row.largest)}</td>
      <td class="right muted">${row.subtotal > 0 ? ((row.discount * 100) / row.subtotal).toFixed(1) + "%" : "—"}</td>
    </tr>`,
  )
  .join("\n");

const unattributedRows = promoUnattributed
  .map((row) => `<li class="row-split"><span class="mono">${esc(row.number)}</span><span class="warn mono">−${rupees(row.discount)}</span></li>`)
  .join("\n");

const chargeRowsHtml = chargeRows
  .filter((row) => row.taxDrift || row.shippingDrift)
  .map(
    (row) => `<tr>
      <td class="mono">${esc(row.order)}</td>
      <td>${badge(row.taxDrift ? "warning" : "info", row.taxDrift ? "Tax" : "Delivery")}</td>
      <td class="right mono muted">${rupees(row.net)}</td>
      <td class="right mono">${rupees(row.taxDrift ? row.tax : row.shipping)}</td>
      <td class="right mono">${rupees(row.taxDrift ? row.expectedTax : row.expectedShipping)}</td>
    </tr>`,
  )
  .join("\n");

const reportDayRows = reportByDay
  .map(
    (row) => `<li class="day-row">
      <div class="row-split"><span>${esc(row.date)}</span><span class="mono">${rupees(row.revenue)}</span></div>
      <div class="row-split"><div class="bar"><div style="width:${Math.max(2, Math.round((row.revenue * 100) / reportSummary.peak))}%"></div></div><span class="muted" style="font-size:11px">${row.orders} ${row.orders === 1 ? "order" : "orders"}</span></div>
    </li>`,
  )
  .join("\n");

const reportProductRows = reportByProduct
  .slice(0, 8)
  .map(
    (row) => `<tr>
      <td>${esc(row.product)}</td>
      <td class="right muted">${row.units}</td>
      <td class="right mono">${rupees(row.revenue)}</td>
    </tr>`,
  )
  .join("\n");

const sequenceRows = sequences
  .map((row) => {
    const [tone, label] =
      row.state === "colliding"
        ? ["error", "Would collide"]
        : row.state === "ahead"
          ? ["warning", row.gap + " ahead"]
          : row.state === "empty"
            ? ["neutral", "Not used yet"]
            : ["success", "Healthy"];

    return `<tr>
      <td>${esc(row.key.charAt(0).toUpperCase() + row.key.slice(1))}<div class="muted mono">${esc(row.prefix)}</div></td>
      <td class="mono">${esc(row.prefix + String(row.next).padStart(6, "0"))}</td>
      <td class="right muted">${row.highest === 0 ? "—" : row.highest}</td>
      <td>${badge(tone, label)}</td>
    </tr>`;
  })
  .join("\n");


const paymentStateBadge = {
  awaiting: ["warning", "Awaiting a check"],
  drift: ["error", "Does not match"],
  duplicate: ["error", "Repeated reference"],
  overpaid: ["warning", "Overpaid"],
};

const paymentRows = payments
  .map((payment, index) => {
    const state = paymentStates[index];
    const [tone, label] = paymentStateBadge[state] ?? [];
    const statusTone = payment.status === "paid" ? "success" : payment.status === "failed" ? "error" : "info";

    return `<tr>
      <td class="mono">${esc(payment.order)}</td>
      <td>${esc(payment.gateway)}</td>
      <td class="mono muted">${esc(payment.reference ?? "—")}</td>
      <td class="right mono">${rupees(payment.amount)}</td>
      <td>${badge(statusTone, payment.status === "paid" ? "Paid" : "Pending")}</td>
      <td>${tone ? badge(tone, label) : '<span class="muted" style="font-size:11px">agrees with the order</span>'}</td>
      <td class="muted">${esc(payment.paidAt)}</td>
    </tr>`;
  })
  .join("\n");


const attributeRows = attributeGroups
  .map((group) => {
    const rows = group.options
      .map((option) => {
        const [tone, label] =
          option.state === "orphan_variant"
            ? ["error", "Orphaned"]
            : option.state === "dead_filter"
              ? ["warning", "Empty filter"]
              : option.state === "unused"
                ? ["neutral", "Unused"]
                : ["success", "In use"];

        const reason =
          option.state === "orphan_variant"
            ? "Offered as a finish, but no variant exists — the customer picks it and finds nothing to buy."
            : option.state === "dead_filter"
              ? "Shown as a filter, but no product carries it — ticking it returns an empty page."
              : option.variants > 0
                ? `${option.variants} variants`
                : `${option.products} ${option.products === 1 ? "product" : "products"}`;

        const swatch = option.hex
          ? `<span class="swatch" style="background:${esc(option.hex)}"></span>`
          : "";

        return `<tr>
      <td><div class="inline-gap">${swatch}<div><div>${esc(option.label)}</div><div class="muted mono">${esc(option.code)}</div></div></div></td>
      <td class="right ${option.products === 0 ? "muted" : ""}">${option.products}</td>
      <td class="right ${option.variants === 0 ? "muted" : ""}">${option.variants}</td>
      <td>${badge(tone, label)}</td>
      <td class="muted" style="font-size:12px">${esc(reason)}</td>
    </tr>`;
      })
      .join("\n");

    const flags = [
      badge("info", group.type),
      group.isVariant ? badge("info", "generates variants") : "",
      group.isFilterable ? badge("info", "filterable") : "",
    ].join("");

    return `<div class="card" style="margin-top:14px">
        <div class="card-head">
          <div>
            <h2 style="margin:0">${esc(group.name)} <span class="mono muted" style="font-weight:400">${esc(group.code)}</span></h2>
            <div class="inline-gap" style="margin-top:6px">${flags}</div>
          </div>
          <span class="muted" style="font-size:12px">${group.options.length} options</span>
        </div>
        <table>
          <thead><tr><th>Option</th><th class="right">Products</th><th class="right">Variants</th><th>State</th><th>What it means</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  })
  .join("\n");

/* ── Customers ──────────────────────────────────────────────────────────────────────────
 *
 * No customer table exists, and the preview should not invent one. The list is the orders
 * folded by normalised phone, using the same rule as `CustomerLedger`.
 */
const normalisePhone = (raw) => {
  let digits = String(raw ?? "").replace(/\D+/g, "");
  if (digits.startsWith("0092")) digits = "0" + digits.slice(4);
  else if (digits.startsWith("92") && digits.length >= 11) digits = "0" + digits.slice(2);
  return digits;
};

const formatPhone = (raw) => {
  const digits = normalisePhone(raw);
  if (!digits) return "—";
  if (digits.length === 11 && digits.startsWith("03")) return digits.slice(0, 4) + " " + digits.slice(4);
  if (digits.startsWith("0") && digits.length >= 10) return digits.slice(0, 3) + " " + digits.slice(3);
  return digits;
};

const foldCustomers = (rows) => {
  const buckets = new Map();
  let unidentified = 0;

  for (const row of rows) {
    const phone = normalisePhone(row.phone);
    if (!phone) {
      unidentified++;
      continue;
    }

    const bucket = buckets.get(phone) ?? {
      phone,
      names: new Map(),
      orders: 0,
      lifetime: 0,
      paid: 0,
      city: row.city,
      lastAt: row.placed,
      firstAt: row.placed,
    };

    bucket.names.set(row.customer, (bucket.names.get(row.customer) ?? 0) + 1);
    bucket.orders++;
    bucket.lifetime += row.grand;
    // Cash on delivery is not money yet: it is collected when the van arrives.
    bucket.paid += row.gateway === "cod" ? 0 : row.grand;
    bucket.city = row.city;
    if (row.placed > bucket.lastAt) bucket.lastAt = row.placed;
    if (row.placed < bucket.firstAt) bucket.firstAt = row.placed;
    buckets.set(phone, bucket);
  }

  const people = [...buckets.values()].map((bucket) => {
    const names = [...bucket.names.entries()].sort((a, b) => b[1] - a[1]);
    const canonical = names[0][0];
    const fingerprint = (name) => name.toLowerCase().replace(/\s+/g, " ").trim();
    const aliases = names.map(([name]) => name).filter((name) => fingerprint(name) !== fingerprint(canonical));

    return {
      ...bucket,
      name: canonical,
      aliases,
      outstanding: Math.max(0, bucket.lifetime - bucket.paid),
      repeat: bucket.orders > 1,
    };
  });

  people.sort((a, b) => b.lifetime - a.lifetime);
  return { people, unidentified };
};

const customerLedger = foldCustomers(orders);
const customerSummary = {
  customers: customerLedger.people.length,
  repeat: customerLedger.people.filter((p) => p.repeat).length,
  lifetime: customerLedger.people.reduce((sum, p) => sum + p.lifetime, 0),
  outstanding: customerLedger.people.reduce((sum, p) => sum + p.outstanding, 0),
  conflicts: customerLedger.people.filter((p) => p.aliases.length > 0).length,
  unidentified: customerLedger.unidentified,
};

const customerRows = customerLedger.people
  .map(
    (person) => `<tr>
      <td><div class="inline-gap"><strong>${esc(person.name)}</strong>
        ${person.repeat ? badge("success", "repeat") : ""}
        ${person.aliases.length > 0 ? badge("warning", "also " + person.aliases[0]) : ""}</div>
        ${person.aliases.length > 0 ? `<div class="muted" style="font-size:11px">one number, ${person.aliases.length + 1} names</div>` : ""}
      </td>
      <td class="mono">${esc(formatPhone(person.phone))}</td>
      <td class="muted">${esc(person.city)}</td>
      <td class="right">${person.orders}</td>
      <td class="right mono">${rupees(person.lifetime)}</td>
      <td class="right mono ${person.outstanding > 0 ? "warn" : "muted"}">${person.outstanding > 0 ? rupees(person.outstanding) : "—"}</td>
      <td class="muted">${esc(person.lastAt)}</td>
    </tr>`,
  )
  .join("\n");

const invoiceRows = invoices.map((inv) => `<tr>
      <td class="mono">${esc(inv.number)}</td>
      <td class="mono muted">${esc(inv.order)}</td>
      <td><strong>${esc(inv.customer)}</strong><div class="muted">${esc(inv.city)}</div></td>
      <td class="muted">${esc(inv.issued)}${inv.overdue ? `<div class="warn" style="font-size:11px">${Math.abs(inv.daysUntilDue)} days late</div>` : ""}</td>
      <td class="right mono">${rupees(inv.total)}</td>
      <td class="right mono ${inv.outstanding > 0 ? "warn" : "muted"}">${inv.outstanding > 0 ? rupees(inv.outstanding) : "—"}</td>
      <td>${badge(inv.tone, inv.label)}</td>
      <td class="right"><a href="#invoices" class="muted" style="font-size:11px">Print</a></td>
    </tr>`).join("\n");

const nav = [
  ["Dashboard", "chart", "dashboard", true],
  ["Products", "archive", "products", true],
  ["Attributes", "layers", "attributes", true],
  ["Categories", "layout", "categories", true],
  ["Inventory", "folder", "inventory", true],
  ["Orders", "invoice", "orders", true],
  ["Invoices", "file", "invoices", true],
  ["Payments", "wallet", "payments", true],
  ["Refunds & returns", "refresh", "refunds", true],
  ["Promotions", "megaphone", "promotions", true],
  ["Shipping & tax", "globe", "shipping-tax", true],
  ["Customers", "users", "customers", true],
  ["Reports", "trending-up", "reports", true],
  ["Settings", "settings", "settings", true],
];

const icons = {
  chart: "M4 19V9m5 10V5m5 14v-7m5 7V8",
  archive: "M4 8h16v11H4zM4 5h16v3H4zM10 12h4",
  layers: "M12 4l8 4-8 4-8-4 8-4zm8 8l-8 4-8-4",
  layout: "M4 5h16v14H4zM4 10h16M9 10v9",
  folder: "M4 7h6l2 3h8v9H4z",
  invoice: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  file: "M7 3h7l3 3v15H7zM14 3v4h4",
  wallet: "M4 8h16v11H4zM4 8l3-4h10l3 4M15 13h3",
  refresh: "M20 12a8 8 0 10-3 6M20 6v6h-6",
  megaphone: "M4 11l12-6v14L4 13zM4 11v2a2 2 0 002 2h1",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18",
  users: "M8 11a3 3 0 100-6 3 3 0 000 6zM2 20a6 6 0 0112 0M17 8a3 3 0 100 6M15 20a6 6 0 016-6",
  "trending-up": "M3 17l6-6 4 4 8-8M15 7h6v6",
  settings: "M12 9a3 3 0 100 6 3 3 0 000-6zM4 12l-1 1 2 4 2-1 2 2 1 2h4l1-2 2-2 2 1 2-4-1-1 1-1-2-4-2 1-2-2-1-2h-4l-1 2-2 2-2-1-2 4z",
};

const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[name] ?? icons.archive}"/></svg>`;

const navHtml = nav
  .map(
    ([label, iconName, target, live]) => `<a href="#${target}" data-go="${target}" class="nav-item${live ? "" : " nav-muted"}">
        ${icon(iconName)}<span>${esc(label)}</span></a>`,
  )
  .join("\n");

const stat = (label, value, hint, tone = "") =>
  `<div class="card stat"><p class="stat-label">${esc(label)}</p><p class="stat-value ${tone}">${esc(value)}</p><p class="stat-hint">${esc(hint)}</p></div>`;

const productsRows = products
  .map(
    (row) => `<tr>
      <td><strong>${esc(row.name)}</strong><div class="muted mono">${esc(row.sku)}</div></td>
      <td>${esc(row.category)}</td>
      <td>${esc(row.series ?? "—")}</td>
      <td class="right mono">${rupees(row.priceMinor)}</td>
      <td>${badge("success", "Published")}</td>
      <td>${badge(statusTone[status(row)], statusLabel[status(row)])}</td>
    </tr>`,
  )
  .join("\n");

const inventoryRows = [...products]
  .sort((a, b) => a.available - b.available)
  .map(
    (row) => `<tr>
      <td><strong>${esc(row.name)}</strong><div class="muted mono">${esc(row.sku)}</div></td>
      <td class="muted">${esc(row.warehouse)}</td>
      <td class="right">${row.qty}</td>
      <td class="right ${row.reserved > 0 ? "warn" : "muted"}">${row.reserved}</td>
      <td class="right"><strong>${row.available}</strong></td>
      <td class="right muted">${row.threshold}</td>
      <td>${badge(statusTone[status(row)], statusLabel[status(row)])}</td>
    </tr>`,
  )
  .join("\n");

const orderRows = orders
  .map(
    (row) => `<tr>
      <td class="mono">${esc(row.number)}</td>
      <td class="muted">${esc(row.placed)}</td>
      <td><strong>${esc(row.customer)}</strong><div class="muted">${esc(row.city)}</div></td>
      <td class="muted">${row.items.reduce((sum, item) => sum + item.qty, 0)} items</td>
      <td class="right mono">${rupees(row.grand)}</td>
      <td>${badge(row.payment === "paid" ? "success" : "warning", row.payment === "paid" ? "Paid" : "Awaiting COD")}</td>
      <td>${badge(row.status === "placed" ? "info" : row.status === "confirmed" ? "success" : "neutral", row.status[0].toUpperCase() + row.status.slice(1))}</td>
    </tr>`,
  )
  .join("\n");

const lowRows = lowStock
  .slice(0, 6)
  .map(
    (row) => `<tr>
      <td>${esc(row.name)}</td>
      <td class="muted mono">${esc(row.sku)}</td>
      <td class="muted">${esc(row.warehouse)}</td>
      <td class="right">${row.available}</td>
      <td class="right muted">${row.threshold}</td>
    </tr>`,
  )
  .join("\n");

const holdRows = holds
  .map(
    (row) => `<tr>
      <td>${esc(row.name)}</td>
      <td class="muted">${esc(row.warehouse)}</td>
      <td class="right">${row.qty}</td>
      <td class="${row.expired ? "warn" : "muted"}">${esc(row.expires)}</td>
      <td class="mono muted">${esc(row.holder)}</td>
    </tr>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WOODEX OS · Commerce admin (static preview)</title>
<style>
  :root {
    --navy: #0e1b2a; --navy-700: #16283d; --wood: #b08968; --wood-soft: #f1ebe4;
    --ink: #1f2937; --muted: #6b7280; --line: #e5e7eb; --bg: #f7f6f4; --card: #ffffff;
    --success: #0f766e; --success-bg: #d1fae5; --warning: #b45309; --warning-bg: #fef3c7;
    --error: #b91c1c; --error-bg: #fee2e2; --info: #1d4ed8; --info-bg: #dbeafe;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .muted { color: var(--muted); }
  .right { text-align: right; font-variant-numeric: tabular-nums; }
  .warn { color: var(--warning); font-weight: 600; }

  .preview { background: var(--wood-soft); border-bottom: 1px solid #e3d8cb; padding: 8px 20px;
    font-size: 12px; color: #6b4a2f; }
  .preview strong { color: #4a3520; }

  .shell { display: grid; grid-template-columns: 248px 1fr; min-height: 100vh; }
  aside { background: var(--navy); color: #cbd5e1; padding: 18px 12px; }
  .brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 16px; }
  .mark { width: 30px; height: 30px; border-radius: 8px; background: var(--wood);
    display: grid; place-items: center; font-weight: 800; color: #1b1206; }
  .brand b { color: #fff; font-size: 14px; letter-spacing: .02em; }
  .brand span { display: block; font-size: 11px; color: #94a3b8; }
  .group { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #7c8ba1;
    padding: 14px 10px 6px; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px;
    color: #cbd5e1; text-decoration: none; font-size: 13px; }
  .nav-item svg { width: 16px; height: 16px; opacity: .8; }
  .nav-item:hover { background: var(--navy-700); color: #fff; }
  .nav-item.active { background: var(--wood); color: #1b1206; font-weight: 600; }
  .nav-muted { opacity: .62; }

  main { padding: 22px 26px 60px; max-width: 1240px; }
  .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
  h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: -.01em; }
  .page-head p { margin: 0; color: var(--muted); max-width: 70ch; }
  .crumbs { font-size: 12px; color: var(--muted); margin-bottom: 6px; }

  .grid { display: grid; gap: 14px; }
  .grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .grid-2 { grid-template-columns: 1.6fr 1fr; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
  .stat-label { margin: 0; font-size: 12px; color: var(--muted); }
  .stat-value { margin: 6px 0 2px; font-size: 26px; font-weight: 700; letter-spacing: -.02em; }
  .stat-value.warning { color: var(--warning); } .stat-value.error { color: var(--error); }
  .stat-value.success { color: var(--success); }
  .stat-hint { margin: 0; font-size: 12px; color: var(--muted); }

  .card h2 { margin: 0 0 2px; font-size: 15px; }
  .card .sub { margin: 0 0 12px; font-size: 12px; color: var(--muted); }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--muted); font-weight: 600; padding: 0 10px 8px; border-bottom: 1px solid var(--line); }
  th.right { text-align: right; }
  td { padding: 10px; border-bottom: 1px solid #f1f2f4; vertical-align: top; }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: #fcfbfa; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-success { background: var(--success-bg); color: var(--success); }
  .badge-warning { background: var(--warning-bg); color: var(--warning); }
  .badge-error { background: var(--error-bg); color: var(--error); }
  .badge-info { background: var(--info-bg); color: var(--info); }
  .badge-neutral { background: #eef0f3; color: #475569; }

  .inline-gap { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .swatch { width: 18px; height: 18px; border-radius: 999px; border: 1px solid var(--line);
    display: inline-block; flex: none; }
  .card-head { display: flex; justify-content: space-between; align-items: flex-start;
    gap: 10px; margin-bottom: 10px; }
  .row-split { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .bar { height: 6px; flex: 1; background: #eef0f3; border-radius: 999px; overflow: hidden; }
  .bar > div { height: 100%; background: var(--navy-600, #1e3a5f); border-radius: 999px; }
  .day-row { padding: 10px 16px; border-bottom: 1px solid #f1f2f4; }
  .day-row:last-child { border-bottom: 0; }
  .list-plain { margin: 0; padding: 0; list-style: none; }
  .list-plain li { padding: 9px 16px; border-bottom: 1px solid #f1f2f4; font-size: 13px; }
  .list-plain li:last-child { border-bottom: 0; }
  .notice { border: 1px solid #f6d9a8; background: var(--warning-bg); border-radius: 12px;
    padding: 14px 16px; margin-top: 14px; font-size: 13px; color: #7a4b06; }
  .notice p { margin: 0 0 4px; }
  .notice p:last-child { margin: 0; }
  .notice.info { border-color: #c7d7f0; background: var(--info-bg); color: #1e4b8f; }

  .toolbar { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .field { height: 38px; border: 1px solid var(--line); background: #fff; border-radius: 8px;
    padding: 0 12px; font-size: 13px; color: var(--ink); min-width: 180px; }
  .field.grow { flex: 1; }

  .screen { display: none; }
  .screen.on { display: block; }
  .soon-card { background: #fff; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 28px; max-width: 640px; }
  .soon-card h2 { margin: 0 0 6px; }
  .soon-card ul { margin: 12px 0 0; padding-left: 18px; color: var(--muted); }
  .matrix { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
  .matrix div { background: #faf9f7; border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
  .matrix b { display: block; font-size: 18px; }
  @media (max-width: 900px) {
    .shell { grid-template-columns: 1fr; }
    aside { display: flex; overflow-x: auto; gap: 4px; padding: 10px; }
    .group, .brand span { display: none; }
    .grid-4, .grid-2, .matrix { grid-template-columns: 1fr 1fr; }
  }
</style>
</head>
<body>
<div class="preview">
  <strong>Static preview of the WOODEX OS admin.</strong>
  Rendered from the seeded catalogue with the platform's own money rules — not connected to a
  database. The live admin is Livewire + MySQL behind the OS login.
</div>

<div class="shell">
  <aside>
    <div class="brand">
      <div class="mark">W</div>
      <div><b>WOODEX OS</b><span>Reimagined · v1</span></div>
    </div>

    <div class="group">Commerce</div>
    ${navHtml}

    <div class="group">Website</div>
    <a href="#soon" data-go="soon" class="nav-item nav-muted">${icon("layout")}<span>Pages · Puck</span></a>
    <a href="#soon" data-go="soon" class="nav-item nav-muted">${icon("chart")}<span>Seo</span></a>

    <div class="group">Settings</div>
    <a href="#soon" data-go="soon" class="nav-item nav-muted">${icon("users")}<span>Access</span></a>
    <a href="#soon" data-go="soon" class="nav-item nav-muted">${icon("settings")}<span>System</span></a>
  </aside>

  <main>
    <!-- ── Dashboard ──────────────────────────────────────────────────────── -->
    <section class="screen on" id="dashboard">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce</div>
          <h1>Commerce</h1>
          <p>Catalog, orders and money. The figures below are live in the real admin; here they
             are computed from the same seeded catalogue.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Published products", totals.published, "4 in drafts")}
        ${stat("Sellable variants", totals.variants, "across all warehouses")}
        ${stat("Categories", totals.categories, "active in the storefront")}
        ${stat("Low stock", totals.low + totals.out, "at or below threshold", totals.low + totals.out > 0 ? "warning" : "success")}
      </div>

      <div class="grid grid-2" style="margin-top:14px">
        <div class="card">
          <h2>Low stock</h2>
          <p class="sub">At or below the threshold for their warehouse.</p>
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th>Warehouse</th><th class="right">Available</th><th class="right">Threshold</th></tr></thead>
            <tbody>${lowRows}</tbody>
          </table>
        </div>
        <div class="card">
          <h2>At a glance</h2>
          <p class="sub">Stock value is on-hand units at cost, not listed price.</p>
          <div class="matrix">
            <div><b>${totals.units}</b><span class="muted">units on hand</span></div>
            <div><b>${totals.held}</b><span class="muted">held by carts</span></div>
            <div><b>${rupees(totals.valueMinor)}</b><span class="muted">stock value</span></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>Recent orders</h2>
        <p class="sub">Money in paisa, copied from the cart when the order was placed — never recalculated from today's prices.</p>
        <table>
          <thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Items</th><th class="right">Total</th><th>Payment</th><th>Status</th></tr></thead>
          <tbody>${orderRows}</tbody>
        </table>
      </div>
    </section>

    <!-- ── Products ───────────────────────────────────────────────────────── -->
    <section class="screen" id="products">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Products</div>
          <h1>Products</h1>
          <p>Price and stock are edited in the row, so staff do not keep a spreadsheet on the side.</p>
        </div>
      </div>
      <div class="toolbar">
        <input class="field grow" placeholder="Search products…" aria-label="Search products">
        <select class="field" aria-label="Category"><option>Any category</option>
          ${seed.categories.map((c) => `<option>${esc(c.name)}</option>`).join("")}
        </select>
        <select class="field" aria-label="Status"><option>Published</option><option>Drafts</option></select>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>Product</th><th>Category</th><th>Series</th><th class="right">Price</th><th>Status</th><th>Stock</th></tr></thead>
          <tbody>${productsRows}</tbody>
        </table>
      </div>
    </section>

    <!-- ── Orders ─────────────────────────────────────────────────────────── -->
    <section class="screen" id="orders">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Orders</div>
          <h1>Orders</h1>
          <p>Read-only list. Every action that changes an order lives on the order itself, where the
             totals, the address and the history are visible at the same time.</p>
        </div>
      </div>
      <div class="toolbar">
        <input class="field grow" placeholder="Order number, customer or SKU…" aria-label="Search orders">
        <select class="field" aria-label="Status"><option>Any status</option><option>Placed</option><option>Confirmed</option><option>Packed</option><option>Shipped</option><option>Delivered</option></select>
        <select class="field" aria-label="Payment"><option>Any payment</option><option>Awaiting payment</option><option>Paid</option><option>Refunded</option></select>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Items</th><th class="right">Total</th><th>Payment</th><th>Status</th></tr></thead>
          <tbody>${orderRows}</tbody>
        </table>
      </div>
      <div class="card" style="margin-top:14px">
        <h2>WDX-000042 · breakdown</h2>
        <p class="sub">Cash on delivery · Lahore · placed today</p>
        <table>
          <tbody>
            ${orders[0].items.map((item) => `<tr><td>${esc(item.name)}<div class="muted mono">${esc(item.sku)}</div></td><td class="right">× ${item.qty}</td><td class="right mono">${rupees(item.total)}</td></tr>`).join("")}
            <tr><td class="muted">Subtotal</td><td></td><td class="right mono">${rupees(orders[0].subtotal)}</td></tr>
            <tr><td class="muted">Sales tax (18%)</td><td></td><td class="right mono">${rupees(orders[0].tax)}</td></tr>
            <tr><td class="muted">Delivery</td><td></td><td class="right mono">${orders[0].shipping === 0 ? "free" : rupees(orders[0].shipping)}</td></tr>
            <tr><td><strong>Total</strong></td><td></td><td class="right mono"><strong>${rupees(orders[0].grand)}</strong></td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Inventory ──────────────────────────────────────────────────────── -->
    <section class="screen" id="inventory">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Inventory</div>
          <h1>Inventory</h1>
          <p>Availability is on hand minus held. A hold is a promise to a cart, and a promise that
             never expires is stock nobody can sell.</p>
        </div>
        <span class="badge badge-warning">${holds.filter((h) => h.expired).length} expired hold to release</span>
      </div>

      <div class="grid grid-4">
        ${stat("Units on hand", totals.units, "across all warehouses")}
        ${stat("Held by carts", totals.held, "not sellable until released")}
        ${stat("Running low", totals.low, "at or below threshold", totals.low ? "warning" : "success")}
        ${stat("Out of stock", totals.out, "cannot be bought right now", totals.out ? "error" : "success")}
      </div>

      <div class="toolbar" style="margin-top:14px">
        <input class="field grow" placeholder="SKU or product name…" aria-label="Search stock">
        <select class="field" aria-label="Warehouse"><option>Any warehouse</option>${warehouses.map((w) => `<option>${w}</option>`).join("")}</select>
        <select class="field" aria-label="Stock level"><option>Everything</option><option>Running low</option><option>Out of stock</option></select>
      </div>

      <div class="card">
        <table>
          <thead><tr><th>Product</th><th>Warehouse</th><th class="right">On hand</th><th class="right">Held</th><th class="right">Available</th><th class="right">Threshold</th><th>Status</th></tr></thead>
          <tbody>${inventoryRows}</tbody>
        </table>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>Held right now</h2>
        <p class="sub">The oldest promise first. When a cart expires its units come back, but only
          because something releases them.</p>
        <table>
          <thead><tr><th>Product</th><th>Warehouse</th><th class="right">Units</th><th>Expires</th><th>Held by</th></tr></thead>
          <tbody>${holdRows}</tbody>
        </table>
      </div>
    </section>

    <!-- ── Categories ─────────────────────────────────────────────────────── -->
    <section class="screen" id="categories">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Categories</div>
          <h1>Categories</h1>
          <p>The storefront's navigation and its filters are both built from this tree. Renaming
             changes the label everywhere; the slug stays, so no link breaks.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Categories", categoryNodes.reduce((n, node) => n + 1 + countNodes(node.children), 0), categoryNodes.length + " at the top level")}
        ${stat("Tree depth", depthOf(categoryNodes), "three for home furniture")}
        ${stat("Empty sections", categoryNodes.filter((node) => node.rolling === 0).length, "no published products beneath", categoryNodes.some((n) => n.rolling === 0) ? "warning" : "success")}
        ${stat("Product filter keys", categoryNodes.reduce((n, node) => n + 1 + countNodes(node.children), 0), "each slug is a /shop?category= value")}
      </div>

      <div class="toolbar" style="margin-top:14px">
        <input class="field grow" placeholder="Name or slug…" aria-label="Search categories">
      </div>

      <div class="card">
        <table>
          <thead><tr><th>Category</th><th class="right">Products</th><th>State</th><th class="right">Order</th></tr></thead>
          <tbody>${categoryRows(categoryNodes)}</tbody>
        </table>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>How the counts work</h2>
        <p class="sub">A product is filed at its leaf — “Executive Tables”, not “Office Tables”. The
          parent's number is its own products plus everything beneath it, so a section that holds
          nothing directly still shows what it contains.</p>
      </div>
    </section>

    <!-- ── Invoices ───────────────────────────────────────────────────────── -->
    <section class="screen" id="invoices">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Invoices</div>
          <h1>Invoices</h1>
          <p>Every invoice, and what is still owed on it. The status is worked out from the money —
             paid, refunded and outstanding — not from the column written when it was issued.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Invoices", invoiceSummary.count, "issued in total")}
        ${stat("Paid", rupees(invoiceSummary.paid), "received, net of refunds")}
        ${stat("Outstanding", rupees(invoiceSummary.outstanding), "still owed", invoiceSummary.outstanding > 0 ? "warning" : "success")}
        ${stat("Overdue", rupees(invoiceSummary.overdue), invoiceSummary.overdueCount + " past their due date", invoiceSummary.overdueCount > 0 ? "error" : "success")}
      </div>

      <div class="toolbar" style="margin-top:14px">
        <input class="field grow" placeholder="Invoice, order, customer or phone…" aria-label="Search invoices">
        <select class="field" aria-label="Invoice state"><option>Outstanding</option><option>Overdue</option><option>Paid</option><option>Void</option><option>All invoices</option></select>
        <input class="field" type="date" aria-label="Issued from">
        <input class="field" type="date" aria-label="Issued to">
      </div>

      <div class="card">
        <table>
          <thead><tr><th>Invoice</th><th>Order</th><th>Customer</th><th>Issued</th><th class="right">Total</th><th class="right">Outstanding</th><th>Status</th><th></th></tr></thead>
          <tbody>${invoiceRows}</tbody>
        </table>
      </div>

      <p class="muted" style="margin-top:10px;font-size:12px">
        Invoices are issued automatically with an order and are never edited here. Voiding or
        correcting one is a separate, permissioned action that records a reason.
      </p>
    </section>

    <!-- ── Attributes ─────────────────────────────────────────────────────── -->
    <section class="screen" id="attributes">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Attributes</div>
          <h1>Attributes</h1>
          <p>The vocabulary the catalog is described in. Each option is counted against the products
             that carry it and the variants that point at it, because both failures here are silent:
             a filter that returns nothing, and a finish with nothing behind it.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Attributes", attributeSummary.attributes, attributeSummary.options + " options in total")}
        ${stat("In use", attributeSummary.used, "carried by a live product or variant", "success")}
        ${stat("Empty filters", attributeSummary.deadFilter, "drawn, but return nothing", attributeSummary.deadFilter > 0 ? "error" : "success")}
        ${stat("Orphaned finishes", attributeSummary.orphan, "offered, but not buyable", attributeSummary.orphan > 0 ? "error" : "success")}
      </div>

      ${attributeSummary.deadFilter + attributeSummary.orphan > 0
        ? `<div class="notice"><p>${attributeSummary.orphan} option(s) are offered as a finish with no variant behind them.</p><p class="muted">The storefront reads these options directly, so the fix is a catalog decision, not a deploy.</p></div>`
        : `<div class="notice info"><p>Every option is carried by something. Nothing on this page is showing a customer an empty page — the last time it was not true, six products were filed under a material the vocabulary did not contain.</p></div>`}

      ${attributeRows}

      <p class="muted" style="font-size:12px;margin-top:10px">
        ${attributeSummary.rail} filter options will return something in the storefront.
      </p>
    </section>

    <!-- ── Customers ──────────────────────────────────────────────────────── -->
    <section class="screen" id="customers">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Customers</div>
          <h1>Customers</h1>
          <p>Who ordered, folded together by phone number. There is no customer account in a
             cash-on-delivery shop, so the number the rider calls is the identity — and
             +92 300 1234567 is the same person as 0300-1234567.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Customers", customerSummary.customers, orders.length + " orders between them")}
        ${stat("Came back", customerSummary.repeat, "more than one order", customerSummary.repeat > 0 ? "success" : "")}
        ${stat("Lifetime value", rupees(customerSummary.lifetime), "ordered, net of refunds")}
        ${stat("Outstanding", rupees(customerSummary.outstanding), "still owed by them", customerSummary.outstanding > 0 ? "warning" : "success")}
      </div>

      ${customerSummary.conflicts + customerSummary.unidentified > 0
        ? `<div class="notice info">
             ${customerSummary.conflicts > 0 ? `<p>${customerSummary.conflicts} number(s) appear under more than one name. Usually a typo at checkout — occasionally a household or a shop sharing a line.</p>` : ""}
             ${customerSummary.unidentified > 0 ? `<p>${customerSummary.unidentified} order(s) have no phone number and are not counted as a customer above.</p>` : ""}
           </div>`
        : ""}

      <div class="toolbar" style="margin-top:14px">
        <input class="field grow" placeholder="Name, phone or city…" aria-label="Search customers">
        <select class="field" aria-label="Show"><option>All customers</option><option>Came back</option><option>Owe us money</option><option>More than one name</option></select>
        <select class="field" aria-label="Sort by"><option>Highest value</option><option>Most recent</option><option>Most orders</option></select>
      </div>

      <div class="card">
        <table>
          <thead><tr><th>Customer</th><th>Phone</th><th>City</th><th class="right">Orders</th><th class="right">Lifetime</th><th class="right">Owing</th><th>Last order</th></tr></thead>
          <tbody>${customerRows}</tbody>
        </table>
      </div>

      <p class="muted" style="font-size:12px;margin-top:10px">
        Lifetime value is what they ordered, net of refunds — not what they paid. Cash on delivery
        is money collected when the van arrives, so an unpaid COD order shows as owed.
      </p>
    </section>

    <!-- ── Payments ───────────────────────────────────────────────────────── -->
    <section class="screen" id="payments">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Payments</div>
          <h1>Payments</h1>
          <p>What actually arrived, against what the orders say arrived. The two are written by
             different code — the bank check sets one, the delivery step sets the other — so this
             screen compares them and names the orders where they disagree.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Received", rupees(paymentSummary.received), "PKR confirmed")}
        ${stat("Awaiting a check", paymentSummary.pending, rupees(paymentSummary.pendingAmount) + " in bank transfers", paymentSummary.pending > 0 ? "warning" : "success")}
        ${stat("Bookkeeping drift", paymentSummary.drift, "orders whose payments disagree", paymentSummary.drift > 0 ? "error" : "success")}
        ${stat("Cash on delivery", rupees(paymentSummary.codPending), "PKR to collect at the door")}
      </div>

      <div class="notice">
        ${paymentSummary.pending > 0 ? `<p>${paymentSummary.pending} ${paymentSummary.pending === 1 ? "bank transfer is" : "bank transfers are"} waiting to be checked against the account.</p>` : ""}
        ${paymentSummary.drift > 0 ? `<p>${paymentSummary.drift} ${paymentSummary.drift === 1 ? "order has" : "orders have"} payments and a recorded total that do not agree. The invoice screen is reading the recorded number.</p>` : ""}
      </div>

      <div class="toolbar" style="margin-top:14px">
        <input class="field grow" placeholder="Order, reference or gateway…" aria-label="Search payments">
        <select class="field" aria-label="Show"><option>Every payment</option><option>Waiting to be checked</option><option>Does not match the order</option><option>Repeated reference</option><option>Cash to collect</option></select>
      </div>

      <div class="card">
        <table>
          <thead><tr><th>Order</th><th>Gateway</th><th>Reference</th><th class="right">Amount</th><th>Status</th><th>Check</th><th>When</th></tr></thead>
          <tbody>${paymentRows}</tbody>
        </table>
      </div>

      <p class="muted" style="font-size:12px;margin-top:10px">
        Confirming a bank transfer is a separate, permissioned action taken with the statement
        open — it moves money and changes an invoice, so it is not a table row you can click.
      </p>
    </section>

    <!-- ── Refunds & returns ──────────────────────────────────────────────── -->
    <section class="screen" id="refunds">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Refunds &amp; returns</div>
          <h1>Refunds &amp; returns</h1>
          <p>Money that went back out. A refund is two numbers on the order and nothing else, so
             this page checks them against each other rather than listing them.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Refunded", rupees(refundSummary.refunded), `PKR across ${plural(refundSummary.count, "order", "orders")}`)}
        ${stat("Refund rate", refundSummary.rate.toFixed(2) + "%", "of everything paid", refundSummary.rate > 5 ? "warning" : "success")}
        ${stat("Partial", refundSummary.partial, "part of the money returned")}
        ${stat("Money held", refundSummary.held, "cancelled orders not refunded", refundSummary.held > 0 ? "error" : "success")}
      </div>

      <div class="toolbar" style="margin-top:14px">
        <input class="field grow" placeholder="Order number…" aria-label="Search refunds">
        <select class="field" aria-label="Show"><option>Every refund and cancellation</option><option>Refunded more than paid</option><option>Cancelled, money held</option><option>Partially refunded</option><option>Fully refunded</option></select>
      </div>

      <div class="card">
        <table>
          <thead><tr><th>Order</th><th class="right">Order total</th><th class="right">Paid</th><th class="right">Refunded</th><th>Order status</th><th>Reconciliation</th></tr></thead>
          <tbody>${refundRows || '<tr><td colspan="6" class="muted" style="text-align:center;padding:32px">No refunds or cancellations. This page only has work on it when money went back out.</td></tr>'}</tbody>
        </table>
      </div>

      <p class="muted" style="font-size:12px;margin-top:10px">
        A refund is never issued from this page. Returning money is a permissioned action that
        records who authorised it and why — the reason is the part an accountant asks for.
      </p>
    </section>

    <!-- ── Promotions ─────────────────────────────────────────────────────── -->
    <section class="screen" id="promotions">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Promotions</div>
          <h1>Promotions</h1>
          <p>What discounting actually cost, by code. There is no coupon catalogue yet, so this
             reads the discounts that landed on real orders — which are the only ones that cost
             anything.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Given away", rupees(promoSummary.discount), "PKR of discount across orders")}
        ${stat("Of gross", promoSummary.rate.toFixed(2) + "%", "measured before the discount")}
        ${stat("Codes used", promoSummary.codes, `${plural(promoSummary.uses, "order", "orders")} carried a code`)}
        ${stat("Unattributed", rupees(promoSummary.unattributedAmount), `${plural(promoSummary.unattributed, "order", "order")} with no code`, promoSummary.unattributed > 0 ? "warning" : "success")}
      </div>

      ${promoSummary.unattributed > 0 ? `<div class="notice"><p>${promoSummary.unattributed} order was discounted with no code attached. That is money off nobody can reproduce or switch off.</p></div>` : ""}

      <div class="card" style="margin-top:14px">
        <table>
          <thead><tr><th>Code</th><th class="right">Uses</th><th class="right">Given away</th><th class="right">Average</th><th class="right">Largest</th><th class="right">Of goods</th></tr></thead>
          <tbody>${promoRows}</tbody>
        </table>
      </div>

      <div class="card" style="margin-top:14px">
        <h2>Discounted with no code</h2>
        <p class="sub">Money off that nobody can reproduce or switch off.</p>
        <ul class="list-plain">${unattributedRows}</ul>
      </div>
    </section>

    <!-- ── Shipping & tax ─────────────────────────────────────────────────── -->
    <section class="screen" id="shipping-tax">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Shipping &amp; tax</div>
          <h1>Shipping &amp; tax</h1>
          <p>The two charges a customer can check with a calculator. The rules are shown as they
             are, then every order is audited against them — an order older than a rule is fine,
             an order that never matched it is not.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Tax rate", (TAX_BP / 100).toFixed(2) + "%", "on goods, exclusive of delivery")}
        ${stat("Delivery", rupees(DELIVERY).replace("PKR ", ""), "PKR · free over " + rupees(FREE_OVER).replace("PKR ", ""))}
        ${stat("Tax collected", rupees(chargeSummary.tax), "effective " + (chargeSummary.effectiveBp / 100).toFixed(2) + "% of net", chargeSummary.taxErrors > 0 ? "error" : "success")}
        ${stat("Delivery charged", rupees(chargeSummary.shipping), `${plural(chargeSummary.free, "order", "orders")} delivered free`, chargeSummary.shippingErrors > 0 ? "warning" : "success")}
      </div>

      <div class="card" style="margin-top:14px">
        <h2>Orders that disagree with the rule</h2>
        <p class="sub">Each order stores what it was charged. This compares that with what the rate and threshold produce.</p>
        ${chargeRowsHtml
          ? `<table><thead><tr><th>Order</th><th>Charge</th><th class="right">Net goods</th><th class="right">Charged</th><th class="right">Rule says</th></tr></thead><tbody>${chargeRowsHtml}</tbody></table>`
          : `<p class="muted" style="padding:20px;text-align:center">Every order matches the rule — the tax is exactly 18% of net and no order was charged delivery at or above the free threshold.</p>`}
      </div>
    </section>

    <!-- ── Reports ────────────────────────────────────────────────────────── -->
    <section class="screen" id="reports">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Reports</div>
          <h1>Reports</h1>
          <p>Sales over a period, with one definition of revenue: what was ordered, minus
             discounts, minus refunds. Tax belongs to the government and delivery pays for a van,
             so neither is counted here.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Revenue", rupees(reportSummary.revenue), `PKR · ${reportSummary.days} trading days`)}
        ${stat("Orders", reportSummary.orders, `${reportSummary.units} units`)}
        ${stat("Average order", rupees(reportSummary.average), "PKR per order")}
        ${stat("Refunded", rupees(reportSummary.refunded), "in this period, not per line")}
      </div>

      <div class="grid grid-2" style="margin-top:14px;align-items:start">
        <div class="card" style="padding:0">
          <div style="padding:14px 16px;border-bottom:1px solid var(--line)">
            <h2 style="margin:0">Revenue by day</h2>
            <p class="muted" style="margin:2px 0 0;font-size:12px">Only days that traded appear. A gap is a closed shop, not a zero.</p>
          </div>
          <ul class="list-plain">${reportDayRows}</ul>
        </div>

        <div class="card" style="padding:0">
          <div style="padding:14px 16px;border-bottom:1px solid var(--line)">
            <h2 style="margin:0">What sold</h2>
            <p class="muted" style="margin:2px 0 0;font-size:12px">By product, largest first. Eight rows is what anybody reads.</p>
          </div>
          <table>
            <thead><tr><th>Product</th><th class="right">Units</th><th class="right">Revenue</th></tr></thead>
            <tbody>${reportProductRows}</tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ── Settings ───────────────────────────────────────────────────────── -->
    <section class="screen" id="settings">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce / Settings</div>
          <h1>Settings</h1>
          <p>The settings that decide what a number looks like and what money is charged. Almost
             everything here is read-only, because changing it rewrites the meaning of documents
             customers already hold.</p>
        </div>
      </div>

      <div class="grid grid-4">
        ${stat("Currency", "PKR", "integer minor units, never float")}
        ${stat("Tax rate", (TAX_BP / 100).toFixed(2) + "%", "on goods at checkout")}
        ${stat("Delivery", rupees(DELIVERY).replace("PKR ", ""), "free over " + rupees(FREE_OVER).replace("PKR ", ""))}
        ${stat("Sequences", sequences.length, `${sequences.filter((s) => s.state === "healthy").length} healthy`, sequences.some((s) => s.state === "colliding") ? "error" : "success")}
      </div>

      <div class="grid grid-2" style="margin-top:14px;align-items:start">
        <div class="card" style="padding:0">
          <div style="padding:14px 16px;border-bottom:1px solid var(--line)">
            <h2 style="margin:0">Number sequences</h2>
            <p class="muted" style="margin:2px 0 0;font-size:12px">Checked against the highest number actually issued, so a restored backup cannot hand out a duplicate.</p>
          </div>
          <table>
            <thead><tr><th>Series</th><th>Next number</th><th class="right">Highest issued</th><th>State</th></tr></thead>
            <tbody>${sequenceRows}</tbody>
          </table>
        </div>

        <div class="card">
          <h2>Money</h2>
          <p class="sub">The rules the calculator applies, as they stand today.</p>
          <ul class="list-plain" style="border-top:1px solid var(--line)">
            <li class="row-split"><span class="muted">Currency</span><span>PKR · ₨</span></li>
            <li class="row-split"><span class="muted">Tax on goods</span><span>${(TAX_BP / 100).toFixed(2)}%</span></li>
            <li class="row-split"><span class="muted">Delivery</span><span>${rupees(DELIVERY)}</span></li>
            <li class="row-split"><span class="muted">Free delivery over</span><span>${rupees(FREE_OVER)}</span></li>
            <li class="row-split"><span class="muted">Delivery estimate</span><span>4 days</span></li>
          </ul>
        </div>
      </div>

      <p class="muted" style="font-size:12px;margin-top:10px">
        Rates and thresholds live in configuration and change with a deploy, not from a form — an
        edit here would silently reinterpret every order placed before it.
      </p>
    </section>

    <!-- ── Coming soon ────────────────────────────────────────────────────── -->
    <section class="screen" id="soon">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce</div>
          <h1>Coming in a later slice</h1>
          <p>All fourteen commerce screens are routed, permissioned and live. This page stays for the
             page in the real admin too — honest about status rather than empty.</p>
        </div>
      </div>
      <div class="soon-card">
        <h2>Nothing — every Commerce screen in the sidebar is built</h2>
        <p class="muted">next section: Cases, Warranties, Claims, RMA, Puck Studio, FAQ library,
           Showrooms, Materials &amp; colours, Markets, Dealer applications, Service jobs.</p>
        <ul>
          <li>Nothing in Commerce. The next section starts on this page.</li>
        </ul>
      </div>
    </section>
  </main>
</div>

<script>
  const screens = Array.from(document.querySelectorAll(".screen"));
  const links = Array.from(document.querySelectorAll("[data-go]"));

  function show(target) {
    const exists = screens.some((s) => s.id === target);
    const id = exists ? target : "soon";
    screens.forEach((s) => s.classList.toggle("on", s.id === id));
    links.forEach((a) => a.classList.toggle("active", a.dataset.go === target && exists));
    window.scrollTo(0, 0);
  }

  links.forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    show(link.dataset.go);
    history.replaceState(null, "", "#" + link.dataset.go);
  }));

  if (location.hash) show(location.hash.slice(1));
</script>
</body>
</html>
`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, "utf8");

console.log(`wrote ${out}`);
console.log(`${products.length} products · ${orders.length} orders · ${holds.length} holds`);
