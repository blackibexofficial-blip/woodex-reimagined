// lead-capture — public, consent-enforced lead intake.
//
// Contract:
//   POST { name, email?, phone?, interest?, source?, landing_path?, referrer?,
//          utm_source?, utm_medium?, utm_campaign?,
//          consent: true, consent_version: string, cfTurnstileToken?, capture_version? } ->
//   202 { ok: true, id: number | null, capture_version?: 2 }
// V2 requires a bounded complete interest string and preserves company; older
// clients retain the 120-character interest behavior and receive no v2 marker.
//   400 on validation failure; 410 when the client's consent_version is stale;
//   413 for a body over 64 KiB; 429 when the fixed-window limiter trips
//   (20 / 10 min per edge caller key)
//
// Writes ONLY via service-role (never the bundle). Anon has no direct INSERT on
// `leads` BY DESIGN (migration 20261107000001) — this function is the sole
// public intake path.
// Fixed-window caller-key limiter (migration 20261107000006): the EF stamps
// the key from the edge x-forwarded-for and calls service-role RPC
// lead_rate_limit_hit BEFORE the insert. Spoofable first line, not a sovereign
// wall — WAF/Upstash global counters remain the owner's production decision.
// In INTAKE_ABUSE_MODE=strict a missing Turnstile secret or limiter error/invalid
// result fails closed with 503. Unset/legacy mode preserves prior fail-open
// behavior; invalid explicit modes fail closed. Configured challenges still fail
// closed on verification or transport errors. This is not a WAF or global limit.
//
// NOT verified against a hosted project (no Supabase egress in the authoring
// environment). Validation rules mirror the reimagined storefront's contact
// form; an outdated consent_version is rejected on purpose.
import { createClient } from "npm:@supabase/supabase-js@^2.57.4";
import { verifyTurnstileToken } from "../_shared/turnstile.mjs";
import { readIntakeJson } from "../_shared/intake-json.mjs";
import { isValidLeadHitCount, resolveIntakePolicy } from "../_shared/intake-policy.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET");
const INTAKE_POLICY = resolveIntakePolicy(Deno.env.get("INTAKE_ABUSE_MODE"), TURNSTILE_SECRET);

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const CONSENT_VERSION = "lead-privacy-v1";
// Match src/lib/lead-content.ts; JavaScript length is in UTF-16 code units.
const MAX_V2_INTEREST_LENGTH = 4000;
const MAX_V2_COMPANY_LENGTH = 160;

const clipKey = (v: unknown, n = 64) => String(v ?? "").trim().slice(0, n);
const headerRateKey = (req: Request): string =>
  clipKey((req.headers.get("x-forwarded-for") ?? "").split(",")[0]) || "unknown";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server is missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }
  if (!INTAKE_POLICY.ok) {
    console.error("lead-capture: intake security configuration unavailable");
    return json({ error: "enquiry intake temporarily unavailable — please try again later" }, 503);
  }

  const payload = await readIntakeJson(req);
  if (!payload.ok) return json({ error: payload.status === 413 ? "request too large" : "invalid JSON object" }, payload.status);
  const b = payload.body;

  // ---- Turnstile gate (anti-bot) ----
  // The policy guard requires a nonblank secret in strict mode. Legacy mode
  // preserves the prior fail-open behavior when the secret is unset.
  if (!TURNSTILE_SECRET) {
    console.warn("lead-capture: TURNSTILE_SECRET not set — challenge gate disabled (fail-open)");
  } else {
    const verify = await verifyTurnstileToken({
      secret: TURNSTILE_SECRET,
      token: b.cfTurnstileToken,
      remoteip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null,
      action: "lead",
    });
    if (!verify.ok) return json({ error: verify.error }, verify.status);
  }

  const name = String(b.name ?? "").trim().slice(0, 160);
  const email = b.email ? String(b.email).trim().toLowerCase().slice(0, 254) : null;
  const phone = b.phone ? String(b.phone).trim().slice(0, 40) : null;
  const captureV2 = b.capture_version === 2;
  if (b.capture_version !== undefined && !captureV2) return json({ error: "unsupported capture version" }, 400);
  if (captureV2 && (typeof b.interest !== "string" || !b.interest.trim() || b.interest.length > MAX_V2_INTEREST_LENGTH)) {
    return json({ error: "enquiry details are missing or too long" }, 400);
  }
  if (captureV2 && b.company != null && (typeof b.company !== "string" || b.company.length > MAX_V2_COMPANY_LENGTH)) {
    return json({ error: "company is invalid or too long" }, 400);
  }
  const interest = captureV2 ? (b.interest as string).trim() : b.interest ? String(b.interest).trim().slice(0, 120) : null;
  const company = captureV2 && typeof b.company === "string" ? b.company.trim() || null : null;
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
  const key = headerRateKey(req);
  try {
    const { data: hits, error: rlError } = await admin.rpc("lead_rate_limit_hit", { p_key: key, p_limit: 20, p_window_minutes: 10 });
    if (rlError || (INTAKE_POLICY.mode === "strict" && !isValidLeadHitCount(hits))) {
      if (INTAKE_POLICY.mode === "strict") {
        console.error("lead-capture: limiter unavailable (strict mode)");
        return json({ error: "enquiry intake temporarily unavailable — please try again later" }, 503);
      }
      console.error("lead-capture: limiter rpc failed (legacy mode, failing open)");
    } else if (typeof hits === "number" && hits > 20) {
      return json({ error: "too many enquiries - please try again in a few minutes" }, 429);
    }
  } catch (error) {
    if (INTAKE_POLICY.mode === "strict") {
      console.error("lead-capture: limiter unavailable (strict mode)");
      return json({ error: "enquiry intake temporarily unavailable — please try again later" }, 503);
    }
    // Preserve legacy behavior for unexpected exceptions: do not insert.
    throw error;
  }
  const clip = (v: unknown, n = 200) => (v == null ? null : String(v).trim().slice(0, n));
  const insert = admin.from("leads").insert({
    name, email, phone, interest, source,
    ...(captureV2 ? { company } : {}),
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
  });
  const { data, error } = captureV2
    ? await insert.select("id,interest,company").single()
    : await insert.select("id").single();
  if (error) {
    console.error("lead-capture insert failed", error.message);
    return json({ error: "could not record lead" }, 500);
  }
  // A hosted trigger/schema could change the returned values. Never claim a
  // complete v2 capture if they differ; an insert may already have committed.
  if (captureV2 && (!data || !("interest" in data) || !("company" in data) || data.interest !== interest || data.company !== company)) {
    console.error("lead-capture: could not verify stored enquiry details");
    return json({ error: "could not confirm enquiry details" }, 500);
  }
  return json({ ok: true, id: data?.id ?? null, ...(captureV2 ? { capture_version: 2 } : {}) }, 202);
});
