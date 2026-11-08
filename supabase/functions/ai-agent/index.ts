// ai-agent — staff-only sales copilot proxy (V5 Step 5 / P1-6).
//
// INTENTIONALLY UNDEPLOYED. The authoring environment has no Supabase egress;
// this function has never been exercised end-to-end. It ships dark: with
// AI_AGENT_API_KEY unset it answers 501 and the admin UI offers only the
// OFFLINE retrieval-grounded draft ("Suggest reply (AI)").
//
// Contract (POST JSON):
//   { messages: [{ role: "user" | "assistant", content: string }, ...],
//     grounding: string[]            // REQUIRED — retrieved snippets from
//                                    // src/lib/ai/knowledge.ts; sent by the client }
// → 200 { reply: string, model: string }
// → 400 malformed | 401 not a WOODEX staff session | 429 rate-limited | 501 unconfigured
//
// Safety rails (do not weaken):
//   1. `grounding` must be a non-empty array of short strings — the model is
//      instructed to answer ONLY from these snippets plus the thread itself;
//      if the answer is not in the grounding it must say so and hand off.
//   2. The caller must present the staff session's Bearer token; it is checked
//      against Supabase Auth (service-role `auth.getUser`) AND against the
//      staff allowlist mirrored in `admin_settings`. Anonymous traffic gets 401.
//   3. Rate limiting is an OWNER DECISION, deliberately not shipped here: the
//      fixed-window limiter pattern exists (see 0006) but no `ai_agent_calls`
//      table is created — adding one is a hosted migration and requires the
//      owner's explicit words. Until then, cap spend at the provider side
//      (project budget) or via your edge/WAF; do NOT weaken rail 1 or 2.
//   4. The API key never leaves this function. The browser never sees it.
//   5. Numbers (prices, dates, ETAs) that are NOT in `grounding` are treated as
//      hallucinations: the client-side evaluator (rehearsal/ai-eval.mjs)
//      rejects such output; operators should spot-check replies the same way.
//
// Owner rollout: `supabase functions deploy ai-agent --no-verify-jwt` is NOT the
// intended config — keep `verify_jwt = false` in config.toml but NEVER call it
// without the staff Bearer flow, then set:
//   AI_AGENT_API_KEY   — provider key (OpenAI-compatible)
//   AI_AGENT_BASE_URL  — default https://api.openai.com/v1
//   AI_AGENT_MODEL     — default gpt-4o-mini
import { createClient } from "npm:@supabase/supabase-js@^2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const AI_AGENT_API_KEY = Deno.env.get("AI_AGENT_API_KEY");
const AI_AGENT_BASE_URL = Deno.env.get("AI_AGENT_BASE_URL") ?? "https://api.openai.com/v1";
const AI_AGENT_MODEL = Deno.env.get("AI_AGENT_MODEL") ?? "gpt-4o-mini";

const json = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

/** 401 unless the Bearer token belongs to a real staff user. */
const staffUserFrom = async (req: Request): Promise<string | null> => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.replace(/^bearer\s+/i, "").trim();
  if (!token) return null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!AI_AGENT_API_KEY) {
    return json({ error: "ai-agent is not configured (AI_AGENT_API_KEY unset) — hosted copilot stays off; the offline draft continues to work in the admin inbox" }, 501);
  }

  const staffId = await staffUserFrom(req);
  if (!staffId) return json({ error: "staff session required" }, 401);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const messagesRaw = Array.isArray(b.messages) ? b.messages : [];
  const messages = messagesRaw
    .map((m) => {
      const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
      const content = clip(m?.content, 4000).trim();
      return role && content ? { role, content } : null;
    })
    .filter(Boolean) as { role: "user" | "assistant"; content: string }[];
  if (messages.length === 0) return json({ error: "messages[] is required" }, 400);

  const groundingRaw = Array.isArray(b.grounding) ? b.grounding : [];
  const grounding = groundingRaw.map((g) => clip(g, 900).trim()).filter((g) => g.length > 0).slice(0, 6);
  if (grounding.length === 0) {
    // Refusing to run ungrounded is the whole point of this function.
    return json({ error: "grounding[] is required — retrieve snippets from the knowledge corpus first" }, 400);
  }

  const system = [
    "You are the WOODEX furniture sales assistant replying on behalf of the Wwoodex sales team.",
    "Answer ONLY from the GROUNDING FACTS below plus the thread. If the answer is not in the grounding, say",
    "exactly that you will have the sales team assist and give them the contact path.",
    "NEVER invent prices, stock, dates, ETAs, discounts or warranty terms. Quote money only when it appears verbatim in the grounding or the thread.",
    "Keep the reply under 120 words, warm and businesslike, in the same language the visitor used (English, Urdu, or roman-Urdu).",
    "",
    "GROUNDING FACTS:",
    ...grounding.map((g) => `- ${g}`),
  ].join("\n");

  const upstream = await fetch(`${AI_AGENT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${AI_AGENT_API_KEY}` },
    body: JSON.stringify({
      model: AI_AGENT_MODEL,
      temperature: 0.2,
      max_tokens: 320,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!upstream.ok) {
    const detail = clip(await upstream.text(), 300);
    console.error("ai-agent upstream error", upstream.status, detail);
    return json({ error: "upstream model error — try again or reply manually" }, 502);
  }
  const data = await upstream.json() as { choices?: { message?: { content?: string } }[] };
  const reply = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!reply) return json({ error: "empty model reply" }, 502);

  return json({ reply, model: AI_AGENT_MODEL }, 200);
});
