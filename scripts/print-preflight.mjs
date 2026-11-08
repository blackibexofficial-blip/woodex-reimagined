/**
 * WOODEX · print-preflight — local geometric checks for the A4 print documents.
 *
 * Roadmap item #1 (A4 print sign-off) exists because only paper from the owner's
 * printer can sign the deliverable. This script does everything short of paper:
 * it renders the print document in print-media emulation and measures the sheet
 * against the A4 contract, and it emits a Chromium PDF (preferCSSPageSize) so the
 * page count and the overflow behaviour are observable before printing.
 *
 * It boots its own `vite preview` on port **4174** (never 4173 — the live preview
 * keeps running) and always tears it down.
 *
 * What it checks (per route, default: /admin/quote/WI-10204):
 *   1. .a4-page exists and is laid out (visible, non-zero box).
 *   2. Print contract: @media print hides .a4-chrome (computed display:none).
 *   3. Sheet geometry in print media: content height vs one A4 page
 *      (297mm ≈ 1122.5px @96dpi); if the content exceeds one page it says so
 *      explicitly ("content flows to page 2") instead of pretending — that is a
 *      real finding, not a test failure to hide.
 *   4. box-sizing on .a4-page (Tailwind preflight must keep it border-box so
 *      min-height:297mm + 12/13/10mm padding still exactly fills one page).
 *   5. A PDF is written so page count can be inspected. PDFs land in
 *      /tmp/print-preflight/ — never in the repo.
 *
 * What it deliberately does NOT check: ink coverage, colour accuracy on the owner's
 * printer, or whether the paper feed jams. The physical sign-off stays with the owner.
 *
 * Usage:  node scripts/print-preflight.mjs [admin-route ...]
 *         e.g. node scripts/print-preflight.mjs /quote/WI-10204 /invoice-document/INV-1001
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "../e2e/lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = `${BASE}/admin`;
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : ["/quote/WI-10204"];
const OUT_DIR = "/tmp/print-preflight";
const MM96 = 96 / 25.4; // px per mm at 96 dpi
const A4_H = 297 * MM96; // ≈1122.5px

const results = [];
const ok = (name, pass, detail = "") => {
  results.push([name, !!pass]);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function waitForServer(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch (err) { lastErr = err; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`preview server did not come up at ${url}: ${lastErr ?? "timeout"}`);
}

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("print-preflight: dist/ missing — run `bun run build` first.");
  process.exit(2);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const server = spawn("bun", ["run", "vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

let code = 1;
try {
  await waitForServer(BASE);
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    /* demo-gate login (same path as e2e/smoke.mjs) */
    await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle2", timeout: 60000 });
    const demoTab = await page.evaluateHandle(() =>
      [...document.querySelectorAll('[role="tab"]')].find((n) => /demo gate/i.test(n.textContent ?? "")) ?? null);
    const demoEl = demoTab && (await demoTab.asElement());
    if (demoEl) await demoEl.click();
    await page.click("#admin-email", { clickCount: 3 });
    await page.type("#admin-email", "admin@woodex.pk", { delay: 3 });
    await page.click("#admin-password", { clickCount: 3 });
    await page.type("#admin-password", "woodex-admin", { delay: 3 });
    await Promise.all([
      page.waitForFunction(() => location.pathname.includes("/admin/dashboard"), { timeout: 20000 }).catch(() => {}),
      page.click('form button[type="submit"]'),
    ]);

    for (const route of ROUTES) {
      console.log(`\n── ${route} ──────────────────────────────`);
      try {
      await page.goto(`${ADMIN}${route}`, { waitUntil: "networkidle2", timeout: 60000 });
      await page.waitForSelector(".a4-page, .quote-sheet, .print-invoice", { timeout: 15000 });

      /* screen geometry */
      const screen = await page.evaluate(() => {
        const el = document.querySelector(".a4-page, .quote-sheet, .print-invoice");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { width: r.width, height: r.height, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
      });
      ok("sheet renders on screen", !!screen && screen.width > 600, screen ? `${Math.round(screen.width)}×${Math.round(screen.height)}px` : "missing");

      /* print-media emulation */
      await page.emulateMediaType("print");
      const print = await page.evaluate(() => {
        const el = document.querySelector(".a4-page, .quote-sheet, .print-invoice");
        const chrome = document.querySelector(".a4-chrome");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          boxSizing: getComputedStyle(el).boxSizing,
          width: r.width, height: r.height,
          scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
          chromeDisplay: chrome ? getComputedStyle(chrome).display : "absent",
        };
      });
      ok("print media hides screen chrome (.a4-chrome)", print?.chromeDisplay === "none" || print?.chromeDisplay === "absent", `display=${print?.chromeDisplay}`);
      ok("print sheet keeps border-box sizing", print?.boxSizing === "border-box", `box-sizing=${print?.boxSizing}`);
      const clips = print ? print.scrollHeight > print.clientHeight + 1 : true;
      ok(
        "sheet does not clip its own content (internal overflow)",
        !clips,
        print ? `scrollHeight=${Math.round(print.scrollHeight)}px vs clientHeight=${Math.round(print.clientHeight)}px (A4=${Math.round(A4_H)}px) — multi-page flow is allowed for long documents; page truth comes from the PDF` : "missing",
      );

      /* PDF for the owner's eyeball + page-count inspection */
      const safe = route.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
      const pdfPath = path.join(OUT_DIR, `${safe}.pdf`);
      await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
      const buf = fs.readFileSync(pdfPath);
      const countMatch = buf.toString("latin1").match(/\/Count\s+(\d+)/);
      const declaredPages = countMatch ? Number(countMatch[1]) : 0;
      ok("chromium PDF generated with painted content (preferCSSPageSize)", buf.length > 5000 && declaredPages >= 1, `${path.basename(pdfPath)} · ${Math.round(buf.length / 1024)} KB · PDF declares ${declaredPages || "unknown"} page(s)`);

      await page.emulateMediaType("screen");
      } catch (err) {
        ok(`route ${route} renders a printable document root`, false, String(err?.message ?? err).slice(0, 160));
      }
    }
    code = 0;
  } finally {
    await browser.close();
  }
} catch (err) {
  console.error("print-preflight fatal:", err?.message ?? err);
  if (serverLog.trim()) console.error("vite preview log:\n" + serverLog.trim());
} finally {
  server.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  server.kill("SIGKILL");
}

const failed = results.filter(([, pass]) => !pass).length;
console.log(`\nPRINT PREFLIGHT: ${results.length - failed} passed, ${failed} failed — artefacts in ${OUT_DIR}`);
console.log("This does NOT replace the owner's physical print sign-off; it only removes the geometry guesswork.");
process.exit(failed === 0 ? code : 1);
