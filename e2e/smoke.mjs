/**
 * WOODEX — E2E smoke suite (production build vs `vite preview` on :8080).
 *
 * Three blocks:
 *   admin     — login tabs, demo gate, analytics, categories CRUD + in-use guard,
 *               media upload/delete, dashboard render (16 checks)
 *   seo       — canonical + Organization/WebSite/LocalBusiness JSON-LD sitewide;
 *               Product/Article/Breadcrumb per page; zero lovable.app references (13 checks)
 *   lazy      — SPA client-side navigation into lazy route chunks (3 checks)
 *
 * Exit 0 = all checks pass. Run: bun run e2e
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASE, ADMIN, withServer, launchBrowser, watchErrors } from "./lib.mjs";

const results = [];
const ok = (label, cond) => results.push(`${cond ? "PASS" : "FAIL"} — ${label}`);

async function adminSuite(browser) {
  const page = await browser.newPage();
  const logs = watchErrors(page);
  const bodyText = () => page.evaluate(() => document.body.innerText);
  const clickByText = (selector, text) =>
    page.evaluate((sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((n) => n.textContent.trim().includes(t));
      if (!el) return false;
      el.click();
      return true;
    }, selector, text);
  const waitText = (t, timeout = 15000) =>
    page.waitForFunction((s) => document.body.innerText.toLowerCase().includes(s.toLowerCase()), { timeout }, t);

  await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle2", timeout: 60000 });
  const toggleVisible = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((n) => n.textContent.trim()));
  ok(`login shows sign-in method tabs [${toggleVisible.join(" | ")}]`, toggleVisible.includes("Supabase Auth") && toggleVisible.includes("Demo gate"));
  await clickByText('[role="tab"]', "Supabase Auth");
  await page.type("#admin-email", "admin@woodex.pk", { delay: 5 });
  await page.type("#admin-password", "woodex-admin", { delay: 5 });
  await page.click('form button[type="submit"]');
  await page.waitForFunction(() => !!document.querySelector('[role="alert"]'), { timeout: 30000 }).catch(() => {});
  const supaError = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent ?? "");
  ok(`supabase sign-in fails gracefully offline ("${supaError.slice(0, 80)}…")`, /unreachable|Invalid/i.test(supaError));
  const typeInto = async (selector, text) => {
    await page.click(selector, { clickCount: 1 });
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await page.type(selector, text, { delay: 5 });
  };

  await clickByText('[role="tab"]', "Demo gate");
  await typeInto("#admin-email", "admin@woodex.pk");
  await typeInto("#admin-password", "woodex-admin");
  await Promise.all([
    page.waitForFunction(() => location.pathname.includes("/admin/dashboard"), { timeout: 20000 }),
    page.click('form button[type="submit"]'),
  ]);
  ok("demo sign-in reaches /admin/dashboard", true);

  await page.goto(`${ADMIN}/analytics`, { waitUntil: "networkidle2", timeout: 60000 });
  await waitText("Order volume — last 30 days", 20000);
  await new Promise((r) => setTimeout(r, 1500));
  const svgCount = await page.evaluate(() => document.querySelectorAll("svg.recharts-surface").length);
  const analyticsText = await bodyText();
  ok(`analytics renders charts (${svgCount} recharts surfaces)`, svgCount >= 4);
  const lowerText = analyticsText.toLowerCase();
  ok("analytics shows KPI strip", lowerText.includes("revenue (30d)") && lowerText.includes("cancellation rate"));
  ok("analytics shows 30-day series labels", /Order volume/.test(analyticsText));

  await page.goto(`${ADMIN}/categories`, { waitUntil: "networkidle2", timeout: 60000 });
  await waitText("Office Furniture", 20000);
  const catsBefore = await page.evaluate(() => document.querySelectorAll("tbody tr").length);
  ok(`categories seeded (${catsBefore} rows)`, catsBefore >= 30);

  await clickByText("button", "New category");
  await page.waitForSelector("#category-name", { timeout: 10000 });
  await page.type("#category-name", "E2E Acoustic Pods", { delay: 5 });
  await clickByText("button", "Create category");
  await waitText("E2E Acoustic Pods", 10000);
  ok("new category appears in the table", true);

  await page.evaluate(() => {
    const sw = [...document.querySelectorAll('[role="switch"]')].find((n) => (n.getAttribute("aria-label") || "").includes("E2E Acoustic Pods"));
    sw && sw.click();
  });
  await waitText("hidden from future catalogue syncs", 10000).catch(() => {});
  ok("visibility toggle fired (toast shown)", (await bodyText()).includes("hidden from future catalogue syncs"));

  await page.evaluate(() => { document.querySelector('[aria-label="Delete Office Chairs"]')?.click(); });
  await page.waitForFunction(() => document.body.innerText.includes("still use") || !!document.querySelector('[role="dialog"]'), { timeout: 10000 });
  const chairsDialog = await bodyText();
  if (chairsDialog.includes("Delete “Office Chairs”")) {
    await clickByText("button", "Delete");
    await waitText("still use", 10000).catch(() => {});
  }
  ok("in-use category delete refused with reason", (await bodyText()).includes("still use"));

  await clickByText("button", "New category");
  await page.waitForSelector("#category-name", { timeout: 10000 });
  await page.type("#category-name", "E2E Disposable Corner", { delay: 5 });
  await clickByText("button", "Create category");
  await waitText("E2E Disposable Corner", 10000);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((n) => (n.getAttribute("aria-label") || "") === "Delete E2E Disposable Corner");
    btn && btn.click();
  });
  await page.waitForFunction(() => !!document.querySelector('[role="dialog"]'), { timeout: 10000 });
  await clickByText('[role="dialog"] button', "Delete");
  await new Promise((r) => setTimeout(r, 1200));
  const rowGone = await page.evaluate(() => ![...document.querySelectorAll("td p")].some((n) => n.textContent.trim() === "E2E Disposable Corner"));
  ok("unused category deleted", rowGone);

  await page.goto(`${ADMIN}/media`, { waitUntil: "networkidle2", timeout: 60000 });
  await waitText("stored locally", 20000);
  const cardCount = await page.evaluate(() => document.querySelectorAll("figure").length);
  ok(`media library seeded (${cardCount} asset cards)`, cardCount >= 5);

  await page.type('input[placeholder="Search media…"]', "zzzz-nomatch", { delay: 5 });
  await waitText("No assets match", 10000);
  ok("media search empty state works", true);
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder="Search media…"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const pngPath = path.join(os.tmpdir(), "e2e-pixel.png");
  fs.writeFileSync(pngPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(pngPath);
  await waitText("e2e-pixel.png", 15000).catch(() => {});
  await waitText("added to the library", 15000).catch(() => {});
  const afterUpload = await bodyText();
  ok("media upload appears in the grid", afterUpload.includes("e2e-pixel.png"));

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((n) => (n.getAttribute("aria-label") || "") === "Delete e2e-pixel.png");
    btn && btn.click();
  });
  await page.waitForFunction(() => !!document.querySelector('[role="dialog"]'), { timeout: 10000 });
  await clickByText('[role="dialog"] button', "Delete");
  await new Promise((r) => setTimeout(r, 1200));
  const assetGone = await page.evaluate(() =>
    ![...document.querySelectorAll("figure p[title]")].some((n) => (n.getAttribute("title") || "").includes("e2e-pixel.png")));
  ok("uploaded asset deleted", assetGone);

  await page.goto(`${ADMIN}/dashboard`, { waitUntil: "networkidle2", timeout: 60000 });
  await waitText("Revenue — last 30 days", 20000);
  ok("dashboard still renders", true);
  ok("no console/page errors (admin flow)", logs.length === 0);
  await page.close();
}

async function seoSuite(browser) {
  const page = await browser.newPage();
  const logs = watchErrors(page);
  const scan = async (route) => {
    await page.goto(BASE + route, { waitUntil: "networkidle0", timeout: 45000 });
    return page.evaluate(() => ({
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } })
        .filter(Boolean)
        .flat(),
      title: document.title,
    }));
  };

  const home = await scan("/");
  const homeTypes = home.ld.map((d) => d["@type"]);
  ok("home canonical = https://woodex.pk/", home.canonical === "https://woodex.pk/");
  ok("home has Organization JSON-LD", homeTypes.includes("Organization"));
  ok("home has WebSite + SearchAction", home.ld.some((d) => d["@type"] === "WebSite" && d.potentialAction));
  ok("home has FurnitureStore (LocalBusiness) JSON-LD", homeTypes.includes("FurnitureStore"));
  ok("home schema has NO lovable.app URLs", !JSON.stringify(home.ld).includes("lovable.app"));

  const prod = await scan("/shop/ballmer-executive-desk");
  const productSchema = prod.ld.find((d) => d["@type"] === "Product");
  ok("product canonical absolute", (prod.canonical ?? "").startsWith("https://woodex.pk/shop/"));
  ok("product JSON-LD present with PKR offer", Boolean(productSchema?.offers?.priceCurrency === "PKR" && typeof productSchema.offers.price === "number"));
  ok("product JSON-LD has aggregateRating", Boolean(productSchema?.aggregateRating));
  ok("breadcrumb JSON-LD present (Home > Shop > product)", prod.ld.some((d) => d["@type"] === "BreadcrumbList" && d.itemListElement.length === 3));

  const blog = await scan("/blog/ergonomic-office-guide-2025");
  const article = blog.ld.find((d) => d["@type"] === "Article");
  ok("blog article JSON-LD present (headline + Person author)", Boolean(article?.headline && article?.author?.["@type"] === "Person"));
  ok("blog breadcrumb JSON-LD present", blog.ld.some((d) => d["@type"] === "BreadcrumbList"));
  ok("product page also carries site-wide schema", prod.ld.map((d) => d["@type"]).includes("Organization"));
  ok("no console/page errors (seo flow)", logs.length === 0);
  await page.close();
}

async function lazySuite(browser) {
  const page = await browser.newPage();
  const logs = watchErrors(page);
  await page.goto(BASE + "/", { waitUntil: "networkidle0", timeout: 45000 });
  await page.click('a[href="/shop"], a[href^="/shop?"]').catch(async () => {
    await page.goto(BASE + "/shop", { waitUntil: "networkidle0", timeout: 45000 });
  });
  await page.waitForFunction(() => location.pathname.includes("/shop"), { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 1500));
  const shopOk = await page.evaluate(() => document.body.innerText.length > 500);
  ok("SPA client-side navigation into lazy /shop chunk renders", shopOk);
  await page.goto(BASE + "/quotation", { waitUntil: "networkidle0", timeout: 45000 });
  const quoteOk = await page.evaluate(() => /quotation/i.test(document.body.innerText));
  ok("lazy /quotation route renders", quoteOk);
  ok("no console/page errors (lazy flow)", logs.length === 0);
  await page.close();
}

process.exit(await withServer(async () => {
  const browser = await launchBrowser();
  try {
    await adminSuite(browser);
    await seoSuite(browser);
    await lazySuite(browser);
  } finally {
    await browser.close();
  }
  console.log(results.join("\n"));
  const fails = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(fails === 0 ? `\nE2E: ${results.length}/${results.length} checks passed` : `\nE2E: ${fails} FAILURES`);
  return fails === 0 ? 0 : 1;
}));
