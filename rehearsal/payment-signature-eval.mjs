/**
 * WOODEX · payment-signature-eval — offline tests for the gateway webhook
 * verifier (V5 Step 6).
 *
 * Bundles the REAL src/lib/payments/signature.ts with esbuild and checks:
 *   - oracle: HMAC-SHA256 matches node's own crypto implementation
 *   - happy path, tamper detection, wrong secret, missing/malformed header,
 *     case-insensitive hex, empty body, determinism, hex validation
 *
 * Run: npm run test:payments
 *
 * The payment GATEWAY itself is owner-blocked — no merchant account, no live
 * keys, no hosted webhook. This file proves only the verifier that will guard
 * the future webhook endpoint. See docs/08-master-plan/CREDENTIAL-BLOCKED.md.
 */
import esbuild from "esbuild";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "woodex-payments-eval-"));
esbuild.buildSync({
  entryPoints: [path.join(ROOT, "src/lib/payments/signature.ts")],
  bundle: true, format: "esm", platform: "node",
  outfile: path.join(bundleDir, "signature.mjs"), logLevel: "silent",
});
const lib = await import(pathToFileURL(path.join(bundleDir, "signature.mjs")).href);

const results = [];
const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? "PASS" : "FAIL") + "  " + name); };

const secret = "test-webhook-secret-do-not-use-in-prod";
const bodies = [
  '{"event":"payment.succeeded","order":"WDX-1001","amount":1427000,"currency":"PKR"}',
  "",                       // empty body is legal input — must still verify/fail cleanly
  "x".repeat(8192),         // multi-KB payload
  "یونیکوڈ ₨1,427,000 ✓",   // non-ASCII
];

/* ── oracle: our hex must equal node's HMAC-SHA256 ─────────────────────── */
for (const [i, body] of bodies.entries()) {
  const ours = await lib.hmacSha256Hex(secret, body);
  const oracle = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  ok(`oracle body#${i + 1} matches node crypto`, ours === oracle);
}

/* ── happy path / round trip ───────────────────────────────────────────── */
const body = bodies[0];
const sig = await lib.signWoodexPayload(secret, body);
ok("round trip verifies", (await lib.verifyWoodexSignature(body, sig, secret)).ok === true);
ok("uppercase hex header verifies (case-insensitive)", (await lib.verifyWoodexSignature(body, sig.toUpperCase(), secret)).ok === true);

/* ── refusal paths ─────────────────────────────────────────────────────── */
ok("tampered body rejected", (await lib.verifyWoodexSignature(body.replace("1427000", "1427001"), sig, secret)).reason === "mismatch");
ok("wrong secret rejected", (await lib.verifyWoodexSignature(body, sig, "other-secret")).reason === "mismatch");
ok("missing header rejected", (await lib.verifyWoodexSignature(body, null, secret)).reason === "missing_signature" && (await lib.verifyWoodexSignature(body, "", secret)).reason === "missing_signature");
ok("malformed header rejected", (await lib.verifyWoodexSignature(body, "zzzz", secret)).reason === "malformed_signature");
ok("truncated digest rejected (length != 32 bytes)", (await lib.verifyWoodexSignature(body, sig.slice(0, 32), secret)).reason === "malformed_signature");
ok("no secret configured rejects everything", (await lib.verifyWoodexSignature(body, sig, "")).ok === false);

/* ── integrity properties ──────────────────────────────────────────────── */
const sig2 = await lib.hmacSha256Hex(secret, body);
ok("deterministic — same inputs, same digest", sig === sig2);
ok("empty body signs + verifies", (await lib.verifyWoodexSignature("", await lib.signWoodexPayload(secret, ""), secret)).ok === true);
ok("whitespace-only header trimmed then rejected", (await lib.verifyWoodexSignature(body, "   ", secret)).reason === "missing_signature");

const failed = results.filter(([, pass]) => !pass).length;
console.log(`\nPAYMENT SIGNATURE EVAL (test:payments): ${results.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
