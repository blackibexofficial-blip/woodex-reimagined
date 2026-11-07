// order-tracking — public, digest-gated order lookup.
//
// Contract (the ONLY public disclosure channel for order state):
//   POST { ref, token } -> 200 { ref, status, stage, placedAt } | 404 (uniform)
// - `ref` must match ^WX-[A-Za-z0-9-]{1,32}$ (display-only identity — NEVER a lookup key alone)
// - `token` is the 32-byte base64url access code issued at checkout; only its
//   sha256 hex digest is compared against orders.tracking_token_hash (constant-time)
// - any failure returns the same 404 body: no enumeration, no presence oracles
// - projection is narrow: ref, status, stage, placedAt — no items, totals, or customer data
//
// NOT verified against a hosted project (no Supabase egress in the authoring
// environment). Logic mirrors src/lib/tracking.ts (unit-tested there, 6/6).
import { createClient } from "npm:@supabase/supabase-js@^2.57.4";
import { createHash } from "node:crypto";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const NOT_FOUND = { error: "tracking details not found; check the reference and private access code" };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: "server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);

  let body: { ref?: string; token?: string } = {};
  try { body = await req.json(); } catch { return json({ ...NOT_FOUND }, 404); }

  const ref = String(body.ref ?? "").trim().slice(0, 64);
  const token = String(body.token ?? "").trim();
  if (!/^WX-[A-Za-z0-9-]{1,32}$/.test(ref) || /[\s]/.test(token) || token.length < 40 || token.length > 48) {
    return json({ ...NOT_FOUND }, 404);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin
    .from("orders")
    .select("ref,status,stage,created_at,tracking_token_hash")
    .eq("ref", ref)
    .maybeSingle();
  if (error || !data?.tracking_token_hash) return json({ ...NOT_FOUND }, 404);

  const provided = createHash("sha256").update(token).digest("hex");
  const expected = String(data.tracking_token_hash).trim().toLowerCase();
  let diff = expected.length === 64 ? 0 : 1;
  for (let i = 0; i < 64; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return json({ ...NOT_FOUND }, 404);

  return json({ ref: data.ref, status: data.status, stage: data.stage, placedAt: data.created_at });
});
