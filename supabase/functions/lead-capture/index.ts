// lead-capture — public, consent-enforced lead intake.
//
// Contract:
//   POST { name, email?, phone?, interest?, source?, landing_path?, referrer?,
//          utm_source?, utm_medium?, utm_campaign?,
//          consent: true, consent_version: string } ->
//   202 { ok: true, id: number | null }
//   400 on validation failure; 410 when the client's consent_version is stale
//
// Writes ONLY via service-role (never the bundle). Anon has no direct INSERT on
// `leads` BY DESIGN (migration 20261107000001) — this function is the sole
// public intake path.
// Rate-limiting deferred: needs per-IP counter infra (e.g., Upstash); until
// wired, ops should monitor lead rate. No other abuse mitigation exists here.
//
// NOT verified against a hosted project (no Supabase egress in the authoring
// environment). Validation rules mirror the reimagined storefront's contact
// form; an outdated consent_version is rejected on purpose.
import { createClient } from "npm:@supabase/supabase-js@^2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const CONSENT_VERSION = "lead-privacy-v1";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const name = String(b.name ?? "").trim().slice(0, 160);
  const email = b.email ? String(b.email).trim().toLowerCase().slice(0, 254) : null;
  const phone = b.phone ? String(b.phone).trim().slice(0, 40) : null;
  const interest = b.interest ? String(b.interest).trim().slice(0, 120) : null;
  const source = b.source ? String(b.source).trim().slice(0, 80) : "storefront";
  const consent = b.consent === true;
  const consentVersion = String(b.consent_version ?? "");

  if (name.length < 2) return json({ error: "name is required" }, 400);
  if (!email && !phone) return json({ error: "email or phone is required" }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return json({ error: "email looks invalid" }, 400);
  if (!consent) return json({ error: "consent is required" }, 400);
  if (consentVersion !== CONSENT_VERSION) return json({ error: "stale or missing consent_version - reload the page" }, 410);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const clip = (v: unknown, n = 200) => (v == null ? null : String(v).trim().slice(0, n));
  const { data, error } = await admin.from("leads").insert({
    name, email, phone, interest, source,
    contact: email ?? phone,
    preferred_channel: email ? "email" : "phone",
    landing_path: clip(b.landing_path, 200),
    referrer: clip(b.referrer, 300),
    utm_source: clip(b.utm_source, 80),
    utm_medium: clip(b.utm_medium, 80),
    utm_campaign: clip(b.utm_campaign, 80),
    contact_consent: 1,
    consent_at: new Date().toISOString(),
    consent_version: CONSENT_VERSION,
  }).select("id").single();
  if (error) {
    console.error("lead-capture insert failed", error.message);
    return json({ error: "could not record lead" }, 500);
  }
  return json({ ok: true, id: data?.id ?? null }, 202);
});
