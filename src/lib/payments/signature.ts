/**
 * WOODEX — payment gateway signature verification (V5 Step 6 spike).
 *
 * The merchant integration itself is OWNER-BLOCKED (no gateway account, no live
 * keys, no hosted webhook — see docs/08-master-plan/CREDENTIAL-BLOCKED.md).
 * This module is the part we CAN ship and test today: a small, audited
 * HMAC-SHA256 verifier for the webhook payload the gateway will eventually
 * call, plus its mirror signer for integration tests and owner tooling.
 *
 * Wire format contract (agreed with the eventual JazzCash/Easypaisa-class
 * integration, single canonical choice, no silent fallbacks):
 *   header:  x-woodex-signature: <lowercase hex sha256 hmac>
 *   payload: the RAW request body bytes (exact bytes received, before JSON parse)
 *   secret:  WOODEX_GATEWAY_WEBHOOK_SECRET (never in the bundle)
 *
 * Verification is constant-time and never throws. Any deviation — missing
 * header, malformed hex, length mismatch, digest mismatch — is a refusal.
 * No partial credit, no "warn and continue" path exists on purpose.
 */

export const WOODEX_SIGNATURE_HEADER = "x-woodex-signature";

export type VerificationResult =
  | { ok: true }
  | { ok: false; reason: "missing_signature" | "malformed_signature" | "mismatch" };

const encoder = new TextEncoder();

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

const hexToBytes = (hex: string): Uint8Array | null => {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    // Node ≥19, Deno and all modern browsers expose Web Crypto here.
    throw new Error("Web Crypto (crypto.subtle) is unavailable in this runtime — cannot verify payment signatures.");
  }
  return c.subtle;
};

export const sha256Hex = async (text: string): Promise<string> =>
  bytesToHex(new Uint8Array(await subtle().digest("SHA-256", encoder.encode(text))));

/** HMAC-SHA256 of `rawBody` under `secret`, lowercase hex. */
export const hmacSha256Hex = async (secret: string, rawBody: string): Promise<string> => {
  const key = await subtle().importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await subtle().sign("HMAC", key, encoder.encode(rawBody));
  return bytesToHex(new Uint8Array(mac));
};

/** Mirror of the gateway's sender — used by rehearsal tests and owner tooling. */
export const signWoodexPayload = (secret: string, rawBody: string): Promise<string> => hmacSha256Hex(secret, rawBody);

/** XOR-compare equal-length byte arrays without early exit. */
const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
};

/**
 * Verify a webhook. `rawBody` MUST be the exact bytes the gateway sent —
 * verifying a re-serialized JSON object is not equivalent and is not supported.
 */
export const verifyWoodexSignature = async (
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): Promise<VerificationResult> => {
  const provided = (signatureHeader ?? "").trim().toLowerCase();
  if (!provided) return { ok: false, reason: "missing_signature" };
  const providedBytes = hexToBytes(provided);
  if (!providedBytes || providedBytes.length !== 32) return { ok: false, reason: "malformed_signature" };
  if (!secret) return { ok: false, reason: "mismatch" }; // no secret ⇒ nothing can verify
  const expected = await hmacSha256Hex(secret, rawBody);
  const expectedBytes = hexToBytes(expected) as Uint8Array;
  return constantTimeEqual(expectedBytes, providedBytes) ? { ok: true } : { ok: false, reason: "mismatch" };
};
