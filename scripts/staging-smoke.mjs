/**
 * WOODEX · staging-smoke — read-only verification of a STAGING Supabase project.
 *
 * V5 Step 4 go-live gate helper. The authoring environment has NO egress to
 * Supabase — this script has never been run against a hosted project. The
 * owner runs it once against the staging project BEFORE flipping production.
 *
 * What it does (everything is a GET; nothing is written, ever):
 *   1. Parses supabase/migrations/*.sql and derives the set of public tables
 *      the DDL creates — no network knowledge needed.
 *   2. GET /rest/v1/<table>?select=*&limit=1 for every discovered table using
 *      the SERVICE-ROLE key → PASS when reachable, FAIL otherwise.
 *   3. Seed sanity: products / categories / series row counts via
 *      Prefer: count=exact → PASS when > 0 (warns loudly if catalogue seed
 *      was never applied).
 *   4. Prints the rehearsal edge (offline DDL proof: `npm run test:rehearsal`)
 *      and the rows an RLS sign-in check still needs (see the runbook).
 *
 * What it deliberately does NOT do:
 *   - No INSERT/UPDATE/DELETE anywhere (not even an expected-to-fail probe).
 *   - No DDL, no migration application — applying 0001→0014 is an explicit
 *     owner action (see docs/08-master-plan/STAGING-FLIP-RUNBOOK.md).
 *   - No production safety net — it checks whatever STAGING_SUPABASE_URL says.
 *     Point it at staging. Never at the live project.
 *
 * Usage:
 *   STAGING_SUPABASE_URL=https://<ref>.supabase.co \
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY=<service-role JWT> \
 *   node scripts/staging-smoke.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL_ = (process.env.STAGING_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const SERVICE_KEY = (process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!URL_ || !SERVICE_KEY) {
  console.error("staging-smoke: set STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY (service-role key of the STAGING project; never commit it).");
  process.exit(2);
}
if (!/supabase\.co$/.test(new URL(URL_).hostname) && !process.argv.includes("--allow-non-supabase-host")) {
  console.error(`staging-smoke: refusing — host "${new URL(URL_).hostname}" does not look like a Supabase project. Refusing to guess; pass --allow-non-supabase-host only if you know this is your staging URL.`);
  process.exit(2);
}

/** Discover public tables the migrations create. */
const MIGDIR = path.join(ROOT, "supabase", "migrations");
const tables = new Set();
for (const f of fs.readdirSync(MIGDIR).filter((f) => f.endsWith(".sql"))) {
  const sql = fs.readFileSync(path.join(MIGDIR, f), "utf8");
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)) tables.add(m[1]);
}
const discovered = [...tables].sort();
console.log(`staging-smoke: ${discovered.length} tables discovered from ${MIGDIR}`);

const headers = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" };
const results = [];
const record = (n, ok, detail = "") => { results.push([n, ok]); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${detail ? " — " + detail : ""}`); };

const rest = (table, qs = "select=*&limit=1", extra = {}) =>
  fetch(`${URL_}/rest/v1/${table}?${qs}`, { headers: { ...headers, ...extra } });

/* 1 · REST reachable + every discovered table readable with service role */
let reachable = false;
try {
  const r = await rest("products", "select=id&limit=1");
  reachable = r.status < 500;
  record("1 REST gateway reachable", reachable, `HTTP ${r.status}`);
} catch (e) {
  record("1 REST gateway reachable", false, String(e).slice(0, 120));
}

for (const t of discovered) {
  try {
    const r = await rest(t);
    record(`table readable: ${t}`, r.status === 200, `HTTP ${r.status}`);
  } catch (e) {
    record(`table readable: ${t}`, false, String(e).slice(0, 120));
  }
}

/* 2 · seed sanity — catalogue must be present or nothing downstream works */
for (const [t, min] of [["products", 1], ["categories", 1], ["series", 1]]) {
  try {
    const r = await rest(t, "select=*&limit=1", { prefer: "count=exact" });
    const range = r.headers.get("content-range") ?? "";
    const total = Number(range.split("/")[1] ?? "0");
    record(`seed rows in ${t} ≥ ${min}`, r.status === 200 && Number.isFinite(total) && total >= min, `content-range=${range || "n/a"}`);
  } catch (e) {
    record(`seed rows in ${t} ≥ ${min}`, false, String(e).slice(0, 120));
  }
}

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\nSTAGING SMOKE (read-only, staging-only): ${results.length - failed} passed, ${failed} failed`);
console.log("Not covered here (by design): RLS effectiveness under a real staff JWT, migration idempotency on YOUR project copy, storage bucket rules.");
console.log("Run `npm run test:rehearsal` (offline DDL+RLS proof) and the staging checklist in docs/08-master-plan/STAGING-FLIP-RUNBOOK.md.");
process.exit(failed === 0 ? 0 : 1);
