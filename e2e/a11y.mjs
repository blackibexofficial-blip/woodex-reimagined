/**
 * WOODEX — accessibility scan (axe-core) across the public storefront and the
 * authenticated admin rail.
 *
 * Report-only by default (exits 0 with a readable summary); pass --fail to
 * make critical/serious violations fatal. Run: bun run e2e:a11y [--fail]
 *
 * Public routes are scanned unauthenticated. Admin routes sign in through the
 * demo gate once (pages share the default browser context, so the session
 * persists) and then scan every static /admin route. Legacy parameterised
 * routes (/admin/quote/:id, /admin/invoice/:id, /admin/page-editor pages)
 * are covered implicitly by smoke.mjs interactions, not axe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, ADMIN, withServer, launchBrowser } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const axeSource = fs.readFileSync(path.join(__dirname, "..", "node_modules", "axe-core", "axe.min.js"), "utf8");
const FAIL_ON = process.argv.includes("--fail");
const VERBOSE = process.argv.includes("--verbose");

const ROUTES = ["/", "/shop", "/shop/ballmer-executive-desk", "/quotation", "/contact", "/blog", "/admin/login"];
const ADMIN_ROUTES = [
  "/dashboard", "/analytics", "/blog", "/brands", "/bulk-editor", "/bundles", "/campaigns",
  "/categories", "/claims", "/client-merge", "/collections", "/content", "/custom-design",
  "/customers", "/drafts", "/exchanges", "/homepage", "/inventory", "/invoices", "/leads",
  "/materials", "/media", "/options", "/orders", "/orders/new", "/invoices/new", "/chat", "/pages", "/price-lists",
  "/products", "/products/acoustic-desk-panel-48/edit", "/products/new",
  "/projects", "/purchase-orders", "/returns", "/sales-channels", "/series", "/services",
  "/settings", "/showrooms", "/suppliers", "/tasks", "/transfers", "/virtual-showroom", "/warranty",
];

const typeInto = async (page, selector, text) => {
  await page.click(selector, { clickCount: 1 });
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, text, { delay: 5 });
};

const signInToAdmin = async (browser) => {
  const page = await browser.newPage();
  await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle2", timeout: 60000 });
  const tabs = await page.$$('[role="tab"]');
  for (const t of tabs) {
    const label = await t.evaluate((el) => el.textContent ?? "");
    if (label.includes("Demo gate")) { await t.click(); break; }
  }
  await typeInto(page, "#admin-email", "admin@woodex.pk");
  await typeInto(page, "#admin-password", "woodex-admin");
  await Promise.all([
    page.waitForFunction(() => location.pathname.includes("/admin/dashboard"), { timeout: 20000 }),
    page.click('form button[type="submit"]'),
  ]);
  await page.close();
};

const scan = async (browser, route, url) => {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.evaluate(axeSource);
  const report = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ["violations"] }));
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of report.violations) byImpact[v.impact ?? "moderate"] += 1;
  const details = VERBOSE
    ? report.violations.map((v) => ({
        id: `${v.impact}:${v.id}`,
        nodes: v.nodes.map((n) => `${n.target} — ${(n.failureSummary ?? "").split("\n")[0]}`).slice(0, 4),
      }))
    : null;
  await page.close();
  return {
    route,
    total: report.violations.length,
    ...byImpact,
    ids: report.violations.map((v) => `${v.impact}:${v.id}`),
    details,
  };
};

process.exit(await withServer(async () => {
  const browser = await launchBrowser();
  const summary = [];
  let fatal = 0;
  try {
    for (const route of ROUTES) {
      const r = await scan(browser, route, BASE + route);
      if (FAIL_ON) fatal += r.critical + r.serious;
      summary.push(r);
    }
    await signInToAdmin(browser);
    for (const route of ADMIN_ROUTES) {
      const r = await scan(browser, `/admin${route}`, `${ADMIN}${route}`);
      if (FAIL_ON) fatal += r.critical + r.serious;
      summary.push(r);
    }
  } finally {
    await browser.close();
  }

  console.log("route                          crit  serious  mod  minor  violations");
  console.log("─".repeat(78));
  for (const s of summary) {
    console.log(
      `${s.route.padEnd(31)}${String(s.critical).padEnd(6)}${String(s.serious).padEnd(9)}${String(s.moderate).padEnd(5)}${String(s.minor).padEnd(7)}${s.total}`,
    );
    if (s.details) {
      for (const d of s.details) {
        console.log(`      · ${d.id}`);
        for (const n of d.nodes) console.log(`          ${n}`);
      }
    } else {
      for (const id of s.ids.slice(0, 12)) console.log(`      · ${id}`);
    }
  }
  const totals = summary.reduce((acc, s) => acc + s.total, 0);
  console.log(`\na11y: ${totals} violations across ${summary.length} routes (report-only${FAIL_ON ? ", --fail active" : ""})`);
  return FAIL_ON && fatal > 0 ? 1 : 0;
}));
