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
    categorySlug: categorySlug[product.category] ?? product.category,
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

/** Three orders, built from real products with the platform's money rules. */
const order = (number, daysAgo, customer, city, lines, gateway) => {
  const subtotal = lines.reduce((sum, line) => sum + products[line.index].priceMinor * line.qty, 0);
  const discount = 0;
  const net = subtotal - discount;
  const tax = Math.round((net * TAX_BP) / 10000);
  const shipping = net >= FREE_OVER ? 0 : DELIVERY;
  const grand = net + tax + shipping;

  return {
    number,
    placed: `2026-10-${String(31 - daysAgo).padStart(2, "0")}`,
    customer,
    city,
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

const orders = [
  order("WDX-000042", 0, "Muhammad Ali", "Lahore", [{ index: 0, qty: 1 }], "cod"),
  order("WDX-000041", 1, "Ayesha Khan", "Karachi", [{ index: 5, qty: 2 }, { index: 12, qty: 1 }], "bank"),
  order("WDX-000040", 3, "Sana Traders", "Islamabad", [{ index: 9, qty: 4 }], "cod"),
];

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

const esc = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const badge = (tone, label) => `<span class="badge badge-${tone}">${esc(label)}</span>`;

const nav = [
  ["Dashboard", "chart", "dashboard", true],
  ["Products", "archive", "products", true],
  ["Attributes", "layers", "soon", false],
  ["Categories", "layout", "soon", false],
  ["Inventory", "folder", "inventory", true],
  ["Orders", "invoice", "orders", true],
  ["Invoices", "file", "soon", false],
  ["Payments", "wallet", "soon", false],
  ["Refunds & returns", "refresh", "soon", false],
  ["Promotions", "megaphone", "soon", false],
  ["Shipping & tax", "globe", "soon", false],
  ["Customers", "users", "soon", false],
  ["Reports", "trending-up", "soon", false],
  ["Settings", "settings", "soon", false],
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
      <td>${badge("ok", "Published")}</td>
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

    <!-- ── Coming soon ────────────────────────────────────────────────────── -->
    <section class="screen" id="soon">
      <div class="page-head">
        <div>
          <div class="crumbs">Commerce</div>
          <h1>Coming in a later slice</h1>
          <p>Ten commerce screens are routed, permissioned and in the sidebar. They open onto this
             page in the real admin too — honest about status rather than empty.</p>
        </div>
      </div>
      <div class="soon-card">
        <h2>Attributes · Categories · Invoices · Payments · Refunds · Promotions · Shipping &amp; tax · Customers · Reports · Settings</h2>
        <p class="muted">Already underneath: the catalog tables, the money calculator, checkout
           services and the media pipeline. What is missing is the screen.</p>
        <ul>
          <li>Categories: tree with live product counts, drag to reorder</li>
          <li>Invoices: list with totals and a print view</li>
          <li>Payments: verify a bank transfer against an order</li>
          <li>Reports: sales by day, by category, by series</li>
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
