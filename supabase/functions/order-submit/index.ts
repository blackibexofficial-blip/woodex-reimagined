// order-submit — public, server-priced order intake for the storefront checkout.
//
// Contract:
//   POST { items: [{ productId, quantity }], name, email?, phone, address?, city,
//          notes?, paymentMethod, channelId?, clientRef?, cfTurnstileToken? } ->
//   200 { ok: true, order: <AdminOrder-shaped JSON> }
//   400 on validation failure; 409 on insufficient stock; 429 rate-limit; 500 otherwise.
//
// Prices and totals are computed INSIDE Postgres by public.order_submit
// (catalog re-read, SELECT ... FOR UPDATE stock atomicity, client_ref replay
// idempotency). Nothing sent by the client is trusted — including the
// subtotal/total the browser may display for convenience.
//
// Anti-abuse: Turnstile challenge verified before any RPC when TURNSTILE_SECRET is
// set (fail-open when unset, fail-closed 503 on siteverify transport errors), plus a
// fixed-window caller-key limit inside the RPC (migration 0005). Global budgets
// (WAF/Upstash) remain the owner's decision — see docs/08-master-plan/ANTI-ABUSE-DECISION.md.
// Migration 0015 restricts order_submit RPC execution to service_role; browser
// roles must use this function so the challenge and validation cannot be bypassed.
//
// NOT verified against a hosted project (no Supabase egress in the authoring
// environment). EF logic = thin pass-through; correctness lives in the RPC
// (rehearsed under pglite, 20261107000003).
import { createClient } from "npm:@supabase/supabase-js@^2.57.4";
import { verifyTurnstileToken } from "../_shared/turnstile.mjs";
import { publicOrderReceipt } from "../_shared/order-response.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET");

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const PAYMENT_METHODS = new Set(["cod", "bank-transfer", "easypaisa", "jazzcash", "card"]);
const clip = (v: unknown, n = 400) => (v == null ? null : String(v).trim().slice(0, n));
const headerRateKey = (req: Request): string | null =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim().slice(0, 64) || null;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const items = Array.isArray(b.items)
    ? b.items
        .map((it) => ({
          productId: clip((it as Record<string, unknown>)?.productId, 128),
          quantity: Math.floor(Number((it as Record<string, unknown>)?.quantity)),
        }))
        .filter((it) => it.productId && Number.isFinite(it.quantity) && it.quantity >= 1 && it.quantity <= 99)
    : [];
  if (items.length === 0) return json({ error: "at least one valid line is required" }, 400);

  // ---- Turnstile gate (anti-bot) ----
  // Unconfigured (TURNSTILE_SECRET unset) -> fail OPEN with a log, same posture as the
  // fixed-window limiter. Configured -> token REQUIRED and verified before any RPC;
  // Cloudflare transport errors fail CLOSED (503) so a blip never waves bots through
  // a cash-on-delivery checkout.
  if (!TURNSTILE_SECRET) {
    console.warn("order-submit: TURNSTILE_SECRET not set — challenge gate disabled (fail-open)");
  } else {
    const verify = await verifyTurnstileToken({
      secret: TURNSTILE_SECRET,
      token: b.cfTurnstileToken,
      remoteip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null,
      action: "order",
    });
    if (!verify.ok) return json({ error: verify.error }, verify.status);
  }

  const name = clip(b.name, 160) ?? "";
  const phone = clip(b.phone, 40);
  const email = b.email ? String(b.email).trim().toLowerCase().slice(0, 254) : null;
  const city = clip(b.city, 80);
  const address = clip(b.address, 300);
  const notes = clip(b.notes, 600);
  const paymentMethod = String(b.paymentMethod ?? "cod");
  const channelId = clip(b.channelId, 40);
  const clientRef = clip(b.clientRef, 64);

  if (name.length < 2) return json({ error: "name is required" }, 400);
  if (!phone && !email) return json({ error: "phone or email is required" }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return json({ error: "email looks invalid" }, 400);
  if (!PAYMENT_METHODS.has(paymentMethod)) return json({ error: "unknown payment method" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc("order_submit", {
    p_lines: items,
    p_customer: {
      name,
      phone,
      email,
      city,
      address,
      notes,
      paymentMethod,
      // server-stamped abuse key — any client-sent value is discarded
      rateKey: headerRateKey(req),
    },
    p_channel_id: channelId,
    p_client_ref: clientRef,
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (/rate limit/i.test(msg)) return json({ error: "too many orders — please try again in a few minutes" }, 429);
    if (/out of stock/i.test(msg)) return json({ error: "insufficient stock", detail: msg }, 409);
    if (/not found/i.test(msg) || /unknown payment/i.test(msg) || /quantity/i.test(msg)) {
      return json({ error: msg }, 400);
    }
    console.error("order_submit rpc failed", msg);
    return json({ error: "could not create the order" }, 500);
  }
  // The SQL replay result contains the original buyer's contact details.
  // Never return those to the caller merely because it supplied a clientRef.
  try {
    return json({ ok: true, order: publicOrderReceipt(data) }, 200);
  } catch {
    console.error("order_submit returned an invalid receipt");
    return json({ error: "could not create the order" }, 500);
  }
});
