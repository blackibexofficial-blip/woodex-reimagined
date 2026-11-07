/**
 * Digest-gated public order tracking.
 *
 * Design (carried from the Agency OS remediation plan; see docs/08-master-plan):
 *   - A 32-byte random token is issued at order creation; ONLY its sha256 hex
 *     digest is stored on the order row (orders.tracking_token_hash).
 *   - The public lookup surface returns NOTHING about the order unless the
 *     caller presents the full ref + token; any mismatch is a uniform 404 —
 *     no sequential-reference enumeration, no presence oracles.
 *   - The public projection is deliberately narrow: ref, status, stage, placedAt.
 *
 * Pure + isomorphic (browser / node / edge) — no secrets here; hashing only.
 */

const B64URL_43 = /^[A-Za-z0-9_-]{43}$/;
const HEX64 = /^[0-9a-f]{64}$/i;

/** 256-bit random token, base64url (43 chars, unpadded). */
export async function generateTrackingToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** sha256 hex of a token — this is what gets persisted. */
export async function hashTrackingToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare for sha256 hex digests; false unless both are well-formed. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (!HEX64.test(a) || !HEX64.test(b)) return false;
  let diff = 0;
  for (let i = 0; i < 64; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Ref shape we accept from the public form; everything else is rejected pre-lookup. */
export function isWellFormedRef(ref: string): boolean {
  return /^WX-[A-Za-z0-9-]{1,32}$/.test(ref.trim());
}

export const ORDER_STAGES = ["intake", "production", "ready", "delivered", "closed", "cancelled"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export function isOrderStage(value: string): value is OrderStage {
  return (ORDER_STAGES as readonly string[]).includes(value);
}

/** What the public /order-status surface is ALLOWed to see. */
export type PublicTrackingView = {
  ref: string;
  status: string;
  stage: OrderStage | string;
  placedAt: string;
};
