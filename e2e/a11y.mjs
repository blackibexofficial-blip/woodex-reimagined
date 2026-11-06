/**
 * WOODEX — accessibility scan (axe-core) across key routes.
 *
 * Report-only by default (exits 0 with a readable summary); pass --fail to
 * make critical/serious violations fatal. Run: bun run e2e:a11y [--fail]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, withServer, launchBrowser } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const axeSource = fs.readFileSync(path.join(__dirname, "..", "node_modules", "axe-core", "axe.min.js"), "utf8");
const FAIL_ON = process.argv.includes("--fail");

const ROUTES = ["/", "/shop", "/shop/ballmer-executive-desk", "/quotation", "/contact", "/blog", "/admin/login"];

process.exit(await withServer(async () => {
  const browser = await launchBrowser();
  const summary = [];
  let fatal = 0;
  try {
    for (const route of ROUTES) {
      const page = await browser.newPage();
      await page.goto(BASE + route, { waitUntil: "networkidle0", timeout: 60000 });
      await page.evaluate(axeSource);
      const report = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ["violations"] }));
      const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      for (const v of report.violations) byImpact[v.impact ?? "moderate"] += 1;
      const details = process.argv.includes("--verbose")
        ? report.violations.map((v) => ({
            id: `${v.impact}:${v.id}`,
            nodes: v.nodes.map((n) => `${n.target} — ${(n.failureSummary ?? "").split("\n")[0]}`).slice(0, 4),
          }))
        : null;
      summary.push({ route, total: report.violations.length, ...byImpact, ids: report.violations.map((v) => `${v.impact}:${v.id}`), details });
      if (FAIL_ON) fatal += report.violations.filter((v) => ["critical", "serious"].includes(v.impact)).length;
      await page.close();
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
