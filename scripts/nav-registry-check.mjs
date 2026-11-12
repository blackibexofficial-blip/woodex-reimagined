/**
 * WOODEX · nav-registry-check — validates the admin navigation registry.
 *
 * WOODEX 2030 Phase 1: the registry (src/admin/nav-registry.ts) is the single
 * source of truth for the sidebar IA. This gate keeps it honest without a TS
 * runtime loader:
 *   1. Parses nav-registry.ts for groups/items (regex on the data literals —
 *      same technique scripts/staging-smoke.mjs uses for DDL).
 *   2. Asserts: ≥1 group; 36 items (the owner-approved IA size); unique ids and
 *      unique `to` paths; kebab-case ids; every item has ≥2 non-empty keywords.
 *   3. Asserts every `to` resolves to a <Route path="..."> in AdminApp.tsx.
 *
 * Usage: node scripts/nav-registry-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = path.join(ROOT, "src", "admin", "nav-registry.ts");
const ADMIN_APP = path.join(ROOT, "src", "admin", "AdminApp.tsx");
const EXPECTED_ITEMS = 36;
const EXPECTED_GROUPS = 5;

const results = [];
const ok = (name, pass, detail = "") => {
  results.push([name, !!pass]);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const src = fs.readFileSync(REGISTRY, "utf8");
const app = fs.readFileSync(ADMIN_APP, "utf8");

/* groups + items straight out of the data literal */
const groupMatches = [...src.matchAll(/\{\s*id: "([a-z0-9-]+)",\s*label: "([^"]+)",\s*items: \[/g)];
const groups = groupMatches.map((m) => m[2]);
const itemMatches = [...src.matchAll(/\{\s*id: "([a-z0-9-]+)",\s*to: "(\/admin\/[^"]*)",\s*label: "([^"]+)",\s*icon:\s*[A-Za-z0-9_]+,\s*keywords: \[([^\]]*)\]/g)];
const items = itemMatches.map((m) => ({ id: m[1], to: m[2], label: m[3], keywords: [...m[4].matchAll(/"([^"]+)"/g)].map((k) => k[1]) }));

console.log(`nav-registry-check: ${groups.length} groups, ${items.length} items parsed from ${path.relative(ROOT, REGISTRY)}\n`);

ok(`registry has ${EXPECTED_GROUPS} groups (owner-approved IA)`, groups.length === EXPECTED_GROUPS, groups.join(" · "));
ok(`registry has ${EXPECTED_ITEMS} items (owner-approved IA)`, items.length === EXPECTED_ITEMS, `${items.length} found`);

const dupes = (arr) => arr.filter((v, i) => arr.indexOf(v) !== i);
const dupIds = dupes(items.map((i) => i.id));
const dupTos = dupes(items.map((i) => i.to));
ok("item ids unique", dupIds.length === 0, dupIds.join(","));
ok("item routes unique", dupTos.length === 0, dupTos.join(","));
ok("all ids kebab-case", items.every((i) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(i.id)));
ok("every item has ≥2 non-empty keywords", items.every((i) => i.keywords.length >= 2 && i.keywords.every((k) => k.trim().length > 0)));

/* routes: collect every path="..." on <Route> in AdminApp.tsx (nested admin paths are relative, e.g. path="quote/:id") */
const routePaths = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
const resolved = new Set(routePaths.map((p) => (p.startsWith("/") ? p : `/admin/${p}`)));
const missing = items.filter((i) => !resolved.has(i.to) && ![...resolved].some((r) => r.replace(/\/:?[^/]+$/, "") === i.to));
ok("every registry route exists in AdminApp.tsx", missing.length === 0, missing.map((m) => m.to).join(",") || "all 36 resolve");

/* every sidebar entry is reachable by prefix matching used by the layout auto-open logic */
const prefixOk = items.every((i) => i.to.startsWith("/admin/") || i.to === "/");
ok("all routes are admin-scoped", prefixOk);

const failed = results.filter(([, pass]) => !pass).length;
console.log(`\nNAV REGISTRY CHECK: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
