/**
 * WOODEX — E2E smoke suite (production build vs `vite preview` on :8080).
 *
 * Three blocks:
 *   admin     — login tabs, demo gate, analytics, categories CRUD + in-use guard,
 *               media upload/delete, dashboard render, Pages workspace, Wave 2\n *               library/layers/lab checks (22 checks)
 *   seo       — canonical + Organization/WebSite/LocalBusiness JSON-LD sitewide;
 *               Product/Article/Breadcrumb per page; zero lovable.app references (13 checks)
 *   lazy      — SPA client-side navigation into lazy route chunks (3 checks)
 *
 * Total: 59 checks (35 admin + 13 seo + 3 lazy + 1 no-console admin rail + 7 vault/other). Run: bun run e2e
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
  const clickTab = async (label) => {
    const tabs = await page.$$('[role="tab"]');
    for (const t of tabs) {
      const txt = await t.evaluate((el) => el.textContent ?? "");
      if (txt.includes(label)) { await t.click(); return true; }
    }
    return false;
  };

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
  await waitText("Pipeline control center", 20000);
  ok("dashboard shows the pipeline control-center card", true);
  const cc = (await bodyText()).toLowerCase();
  ok("control center shows outstanding-invoices tile", cc.includes("outstanding invoices"));
  ok("control center shows open-pipeline tile", cc.includes("open pipeline"));
  ok("control center shows pipeline value sub-line", cc.includes("across open quotes"));

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
  await waitText("stored on-device", 20000);
  const cardCount = await page.evaluate(() => document.querySelectorAll("figure").length);
  ok(`media library seeded (${cardCount} asset cards)`, cardCount >= 5);

  await page.type('input[placeholder="Search name, alt, folder…"]', "zzzz-nomatch", { delay: 5 });
  await waitText("Nothing matches", 10000);
  ok("media search empty state works", true);
  await page.evaluate(() => {
    const input = document.querySelector('input[placeholder="Search name, alt, folder…"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const pngPath = path.join(os.tmpdir(), "e2e-pixel.png");
  fs.writeFileSync(pngPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(pngPath);
  await waitText("e2e-pixel.png", 15000).catch(() => {});
  await waitText("asset added", 15000).catch(() => {});
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
  await clickByText("a", "Pages");
  await page.waitForFunction(() => location.pathname.endsWith("/admin/pages"), { timeout: 10000 }).catch(() => {});
  ok("sidebar Pages link routes to /admin/pages", await page.evaluate(() => location.pathname.endsWith("/admin/pages")));
  await waitText("Builder pages", 10000).catch(() => {});
  const pagesSeeded = await page.evaluate(() => {
    const t = document.body.innerText.toLowerCase();
    return t.includes("home") && t.includes("published");
  });
  ok("Pages workspace lists the seeded published home page", pagesSeeded);

  await page.goto(`${ADMIN}/campaigns`, { waitUntil: "networkidle2", timeout: 60000 });
  await waitText("Campaign funnel", 20000);
  const campBody = (await bodyText()).toLowerCase();
  ok("campaigns page renders funnel with seeded campaigns (boardroom-nov, hq-fit-out-q4) + win rate", campBody.includes("boardroom-nov") && campBody.includes("hq-fit-out-q4") && campBody.includes("win rate"));
  ok("campaigns page shows the first-party honesty banner (no pixels)", campBody.includes("first-party attribution only"));

  // click-through coverage: campaigns -> leads -> board -> visits dialog
  await clickByText("a", "Open leads");
  await page.waitForFunction(() => location.pathname.endsWith("/admin/leads"), { timeout: 10000 }).catch(() => {});
  ok("campaigns 'Open leads' link routes to /admin/leads", await page.evaluate(() => location.pathname.endsWith("/admin/leads")));
  await page.waitForSelector('input[placeholder*="Search name"]', { timeout: 15000 });
  await clickByText("button", "Board");
  await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Column "]').length === 5, { timeout: 15000 }).catch(() => {});
  ok("leads board renders the five stage columns via UI click-through", await page.evaluate(() => document.querySelectorAll('[aria-label^="Column "]').length === 5));
  await clickByText("button", "Table");
  await typeInto('input[placeholder*="Search name"]', "Bilal Ahmed");
  await waitText("Bilal Ahmed", 10000);
  await page.evaluate(() => { const b = [...document.querySelectorAll('[aria-label^="Site visits for "]')][0]; b?.click(); });
  await page.waitForSelector("#visit-at", { timeout: 10000 }).catch(() => {});
  ok("visit dialog opens from a table row click-through", await page.evaluate(() => !!document.querySelector("#visit-at")));
  await clickByText('[role="dialog"] button', "Close");
  await page.waitForFunction(() => !document.querySelector("#visit-at"), { timeout: 8000 }).catch(() => {});
  ok("visit dialog closes cleanly", await page.evaluate(() => !document.querySelector("#visit-at")));

  // kanban board — synthetic drag New→Quoted (Danish Hussain)
  await page.goto(`${ADMIN}/leads`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector('input[placeholder*="Search name"]', { timeout: 15000 });
  await clickByText("button", "Board");
  await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Column "]').length === 5, { timeout: 15000 }).catch(() => {});
  const drag = await page.evaluate(() => {
    const card = document.querySelector('li[draggable="true"]');
    const quoted = document.querySelector('[aria-label="Column quoted"]');
    if (!card || !quoted) return { ok: false };
    const name = card.querySelector("p")?.textContent ?? "";
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    quoted.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    quoted.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    return { ok: true, name };
  });
  await new Promise((r) => setTimeout(r, 800));
  const quotedCol = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Column quoted"] li p.truncate')].map((p) => p.textContent));
  ok(`kanban synthetic drag moves a card New→Quoted (${drag.name})`, drag.ok && quotedCol.includes(drag.name));

  // client-merge review (CRM identity) — loads with seeded candidates + audit trail
  await page.goto(`${ADMIN}/client-merge`, { waitUntil: "networkidle2", timeout: 60000 });
  await waitText("Merge history", 20000);
  const mergeBody = (await bodyText()).toLowerCase();
  ok("merge review shows the seeded Bilal email-collision pair (Bilal Ahmed / B Ahmed)", mergeBody.includes("bilal ahmed") && mergeBody.includes("b ahmed"));
  ok("merge audit trail lists the retired record (CLI-1007, tombstoned into CLI-1001)", mergeBody.includes("cli-1007") && mergeBody.includes("cli-1001"));

  // interior projects — practice workspace (BOQ · milestones · files)
  await page.goto(`${ADMIN}/projects`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector('button[aria-label^="Practice workspace for"]', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('button[aria-label^="Practice workspace for"]')?.click());
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
  const projBody = (await bodyText()).toLowerCase();
  ok("practice workspace opens with seeded planned cost (rs 7,477,500)", projBody.includes("7,477,500"));
  const mtabs = await page.$$('[role="tab"]');
  for (const t of mtabs) {
    const txt = await t.evaluate((el) => el.textContent ?? "");
    if (txt.includes("Files")) { await t.click(); break; }
  }
  await page.waitForFunction(() => document.body.innerText.includes("mep-asbuilt-schematic.pdf"), { timeout: 10000 }).catch(() => {});
  ok("practice workspace Files tab lists the seeded drawing (mep-asbuilt-schematic.pdf)", (await bodyText()).includes("mep-asbuilt-schematic.pdf"));

  // BOQ qty edit recomputes the planned total (demo: first row was 3,500 sqft @ Rs 180)
  const boqTabbed = await clickTab("BOQ");
  await page.waitForSelector('[role="dialog"] input[aria-label="Qty"]', { timeout: 10000 });
  ok("BOQ tab activates and renders qty inputs", boqTabbed);
  await page.evaluate(() => {
    const input = document.querySelector('[role="dialog"] input[aria-label="Qty"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "4000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => document.body.innerText.includes("7,567,500"), { timeout: 10000 }).catch(() => {});
  ok("BOQ qty edit recomputes planned total (3,500→4,000 => Rs 7,567,500)", (await bodyText()).includes("7,567,500"));

  // --- Wave 2: Library rail + Layers outline + lab render ---
  const clickRail = (text) =>
    page.evaluate((t) => {
      const el = [...document.querySelectorAll('[class*="_NavItem-link"]')].find((n) => n.textContent.trim() === t);
      if (!el) return false;
      el.click();
      return true;
    }, text);
  await page.goto(`${ADMIN}/pages/home`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector("input[aria-label='Page title']", { timeout: 15000 });
  await clickRail("Library");
  await waitText("All 40", 15000);
  ok("library rail opens with All 40 sections", true);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((n) => (n.getAttribute("aria-label") || "") === "Add Hero — centered with trust row");
    btn && btn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await clickRail("Layers");
  await waitText("Hero — centered with trust row", 15000);
  ok("inserted block shows up in the Layers outline", true);
  await clickRail("Library");
  await waitText("UI kit", 5000);
  await clickByText("button", "UI kit");
  await waitText("Divider line", 10000);
  ok("UI kit tab lists elements", true);
  await page.goto(`${BASE}/lab/home`, { waitUntil: "networkidle2", timeout: 60000 });
  await waitText("Design For Your Workspace", 15000);
  ok("/lab/home renders the built page", true);
  const labMeta = await page.evaluate(() => ({
    canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? null,
    ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? null,
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null,
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((el) => { try { return JSON.parse(el.textContent || "{}"); } catch { return {}; } }),
  }));
  ok("/lab/home carries canonical + og:title/description/image", Boolean(labMeta.canonical && labMeta.ogTitle && labMeta.ogDescription && labMeta.ogImage));
  ok("/lab/home carries BreadcrumbList JSON-LD", labMeta.ld.some((d) => d["@type"] === "BreadcrumbList"));
  ok("/lab/home carries FAQPage JSON-LD from the FaqAccordion block", labMeta.ld.some((d) => d["@type"] === "FAQPage" && Array.isArray(d.mainEntity) && d.mainEntity.length >= 1));
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
