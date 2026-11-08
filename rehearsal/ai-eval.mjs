/**
 * WOODEX · ai-eval — offline evaluation for the sales-agent draft engine (V5 Step 5).
 *
 * Bundles the REAL src/lib/ai/{knowledge,agent}.ts with esbuild (a repo
 * devDependency) — no copies, no drift — and asserts retrieval grounding,
 * price honesty and the human-handoff contract on a fixed case set.
 *
 * Run: npm run test:ai-eval
 *
 * NOT a test of the hosted `supabase/functions/ai-agent` — that function has
 * never been deployed and can only be validated in staging with a key (see
 * docs/08-master-plan/CREDENTIAL-BLOCKED.md). This script proves the offline
 * engine, which is the only engine the demo build relies on.
 */
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "woodex-ai-eval-"));
esbuild.buildSync({
  entryPoints: [path.join(ROOT, "src/lib/ai/agent.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: path.join(bundleDir, "agent.mjs"),
  logLevel: "silent",
});
const agent = await import(pathToFileURL(path.join(bundleDir, "agent.mjs")).href);
esbuild.buildSync({
  entryPoints: [path.join(ROOT, "src/lib/ai/knowledge.ts")],
  bundle: true, format: "esm", platform: "node",
  outfile: path.join(bundleDir, "knowledge.mjs"), logLevel: "silent",
});
const { KNOWLEDGE_CORPUS: CORPUS, retrieveKnowledge } = await import(pathToFileURL(path.join(bundleDir, "knowledge.mjs")).href);

const records = [
  { id: "throne-executive-desk", name: "THRONE Executive Desk", sku: "WDX-THRONE-1", price: 235000 },
  { id: "summit-20-boardroom-table", name: "SUMMIT-20 Boardroom Table", sku: "WDX-SUMMIT20", price: 155000 },
];

const results = [];
const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? "PASS" : "FAIL") + "  " + name); };
const digits = (s) => (s.match(/\d[\d,]*/g) ?? []).map((d) => d.replace(/,/g, ""));

/* ── 1 · retrieval lands the right snippet ─────────────────────────────── */
const retrievalCases = [
  ["Do you deliver to DHA Lahore?", "delivery-zones"],
  ["what are your showroom timings", "store-hours"],
  ["I want to visit, where is your showroom", "store-address"],
  ["what is the advance payment policy", "payment-policy"],
  ["do you have warranty on the Infinity chairs", "warranty-infinity"],
  ["how do I claim warranty on a defective desk", "warranty-claim"],
  ["we need a BOQ for an office fit-out", "b2b-projects"],
  ["does the showroom open on Sunday", "store-hours"],
  ["email address for warranty claims", "contact-email"],
];
for (const [q, expected] of retrievalCases) {
  const ids = retrieveKnowledge(q, 3).map((h) => h.entry.id);
  ok(`retrieval "${q.slice(0, 48)}…" → ${expected}`, ids.includes(expected));
}

/* ── 2 · grounded replies cite only corpus entries ─────────────────────── */
const grounded = agent.draftAgentReply("Do you offer warranty and what is your showroom timing?", { records });
ok("grounded reply cites only existing corpus ids", grounded.sources.every((id) => CORPUS.some((e) => e.id === id)));
ok("grounded reply has real text", grounded.reply.length > 40);
ok("grounded reply invents no Rs figures", digits(grounded.reply).every((d) =>
  digits(CORPUS.filter((e) => grounded.sources.includes(e.id)).map((e) => e.statement).join(" ")).includes(d)
    || digits("Do you offer warranty and what is your showroom timing?").includes(d)));

/* ── 3 · price questions: records only, or honest hand-off ─────────────── */
const priced = agent.draftAgentReply("What is the price of the THRONE Executive Desk?", { records });
ok("price question quotes the record (Rs 235,000)", priced.reply.includes("235,000") && priced.quotedRecordIds.includes("throne-executive-desk"));
const rsFigures = [...priced.reply.matchAll(/Rs\s?([\d,]+)/g)].map((m) => m[1].replace(/,/g, ""));
ok("price question quotes exactly the record figure (235000) and nothing else", rsFigures.length === 1 && rsFigures[0] === "235000");
ok("price question is flagged for human confirmation", priced.requiresHuman === true);

const pricedUr = agent.draftAgentReply("قیمت کیا ہے THRONE Executive Desk کی؟", { records });
ok("Urdu price question resolves the same record", pricedUr.quotedRecordIds.includes("throne-executive-desk") && pricedUr.reply.includes("235,000"));

const unknownPrice = agent.draftAgentReply("How much would a 40-seat auditorium cost?", { records });
ok("unknown price → requiresHuman + NO invented Rs figure", unknownPrice.requiresHuman === true && !/Rs\s?[\d,]/.test(unknownPrice.reply));

/* ── 4 · no grounding → polite hand-off, never improvisation ───────────── */
const nonsense = agent.draftAgentReply("asdkfj qwxyz zztpt", { records });
ok("nonsense → confidence none, requiresHuman, no sources", nonsense.confidence === "none" && nonsense.requiresHuman && nonsense.sources.length === 0);

/* ── 5 · empty input is safe ───────────────────────────────────────────── */
const empty = agent.draftAgentReply("   ", { records });
ok("empty message → safe fallback requiresHuman", empty.requiresHuman === true && empty.confidence === "none");

const failed = results.filter(([, pass]) => !pass).length;
console.log(`\nAI EVAL (test:ai-eval): ${results.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
