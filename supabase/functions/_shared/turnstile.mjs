// Turnstile verification helper — shared by order-submit and lead-capture EFs.
// Plain .mjs (no Deno/Node-specific APIs, fetch injected) so the exact same code
// runs in the Supabase edge runtime and under `node --test` for rehearsal.
//
// Posture contract (documented in docs/08-master-plan/ANTI-ABUSE-DECISION.md):
//   - TURNSTILE_SECRET unset -> strict intake mode fails closed before calling this
//     helper; legacy/unset mode preserves the old fail-open behavior. Configure
//     both client key and server secret, and review the deployment policy.
//   - TURNSTILE_SECRET set, token missing/invalid -> 403 (caller rejects).
//   - siteverify unreachable / non-200 / non-JSON   -> 503 (fail-CLOSED on transport error
//     so a Cloudflare blip never silently waves bots through a COD checkout).
//   - success === true and action matches the EF's expected action -> ok.

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verify a Turnstile token against Cloudflare's siteverify endpoint.
 * @param {{ secret: string, token: unknown, remoteip?: string | null, action?: string, fetchImpl?: typeof fetch }} args
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string }>}
 */
export async function verifyTurnstileToken({ secret, token, remoteip, action, fetchImpl }) {
  const doFetch = fetchImpl ?? fetch;
  if (!secret) {
    return { ok: false, status: 500, error: "server is missing TURNSTILE_SECRET" };
  }
  const tok = typeof token === "string" ? token.trim() : "";
  if (!tok) {
    return { ok: false, status: 403, error: "missing challenge token — please retry" };
  }
  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", tok);
  if (remoteip) form.set("remoteip", String(remoteip));

  let resp;
  try {
    resp = await doFetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch (err) {
    console.error("turnstile: siteverify transport error", err?.message ?? err);
    return { ok: false, status: 503, error: "could not verify the challenge — please retry" };
  }
  if (!resp.ok) {
    console.error("turnstile: siteverify http", resp.status);
    return { ok: false, status: 503, error: "could not verify the challenge — please retry" };
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    console.error("turnstile: siteverify returned non-JSON");
    return { ok: false, status: 503, error: "could not verify the challenge — please retry" };
  }
  if (data?.success !== true) {
    console.error("turnstile: verification failed", data?.["error-codes"]);
    return { ok: false, status: 403, error: "challenge verification failed — please retry" };
  }
  // When an action is expected, a missing or non-string action is not a match.
  // Never accept an action-less token in an action-pinned flow.
  if (action && data?.action !== action) {
    console.error("turnstile: missing or mismatched action; expected", action);
    return { ok: false, status: 403, error: "challenge verification failed — please retry" };
  }
  return { ok: true };
}
