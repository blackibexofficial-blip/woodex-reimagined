import { authorizeAiStaff } from '../_shared/ai-authorization.mjs';

const json = (body, status) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});
const clip = (value, max) => String(value ?? '').slice(0, max);
const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGES = 10;

// Do not trust Content-Length: stop reading even chunked or mislabeled bodies.
async function readJsonBody(req) {
  const length = req.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > MAX_BODY_BYTES) return { status: 413 };
  if (!req.body) return { status: 400 };
  const reader = req.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return { status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return { body };
  } catch { return { status: 400 }; }
}

function limitFromEnv(value, max) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= max ? number : null;
}

// Dependencies are injected for offline regression tests. Client-provided
// grounding is NOT server-verified; keep hosted use disabled until trusted
// grounding, provider budget and privacy controls are designed and validated.
export function createAiAgentHandler({ apiKey, baseUrl, model, getUser, hasCapability, reserveUsage, userLimit, globalLimit, fetchImpl = fetch }) {
  return async (req) => {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    if (!apiKey) return json({ error: 'ai-agent is not configured; use the offline draft in the admin inbox' }, 501);
    if (!getUser || !hasCapability) return json({ error: 'authentication service unavailable' }, 503);

    const auth = await authorizeAiStaff(req, { getUser, hasCapability });
    if (!auth.ok) {
      const message = auth.status === 401 ? 'staff session required' : auth.status === 403 ? 'staff capability required' : 'authentication service unavailable';
      return json({ error: message }, auth.status);
    }

    const payload = await readJsonBody(req);
    if (payload.status) return json({ error: payload.status === 413 ? 'request too large' : 'invalid JSON' }, payload.status);
    const b = payload.body;
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'invalid JSON object' }, 400);
    const messagesRaw = Array.isArray(b.messages) ? b.messages : [];
    if (messagesRaw.length > MAX_MESSAGES) return json({ error: 'too many messages' }, 400);
    const messages = messagesRaw.map((m) => {
      const role = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null;
      const content = clip(m?.content, 4000).trim();
      return role && content ? { role, content } : null;
    }).filter(Boolean);
    if (!messages.length) return json({ error: 'messages[] is required' }, 400);
    const groundingRaw = Array.isArray(b.grounding) ? b.grounding : [];
    const grounding = groundingRaw.map((g) => clip(g, 900).trim()).filter(Boolean).slice(0, 6);
    if (!grounding.length) return json({ error: 'grounding[] is required — retrieve snippets from the knowledge corpus first' }, 400);

    const perUser = limitFromEnv(userLimit, 1000);
    const global = limitFromEnv(globalLimit, 100000);
    if (!reserveUsage || perUser === null || global === null) return json({ error: 'AI usage limits unavailable' }, 503);
    try {
      // auth.userId comes from verified Auth, never from request JSON.
      const reservation = await reserveUsage(auth.userId, perUser, global);
      if (reservation.error || typeof reservation.data !== 'boolean') return json({ error: 'AI usage limits unavailable' }, 503);
      if (!reservation.data) return json({ error: 'AI usage limit reached — try again later' }, 429);
    } catch {
      return json({ error: 'AI usage limits unavailable' }, 503);
    }

    const system = [
      'You are the WOODEX furniture sales assistant replying on behalf of the Woodex sales team.',
      'Answer ONLY from the GROUNDING FACTS below plus the thread. If the answer is not in the grounding, say',
      'exactly that you will have the sales team assist and give them the contact path.',
      'NEVER invent prices, stock, dates, ETAs, discounts or warranty terms. Quote money only when it appears verbatim in the grounding or the thread.',
      'Keep the reply under 120 words, warm and businesslike, in the same language the visitor used (English, Urdu, or roman-Urdu).',
      '', 'GROUNDING FACTS:', ...grounding.map((g) => `- ${g}`),
    ].join('\n');

    try {
      const upstream = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: 320, messages: [{ role: 'system', content: system }, ...messages] }),
      });
      if (!upstream.ok) return json({ error: 'upstream model error — try again or reply manually' }, 502);
      const data = await upstream.json();
      const reply = String(data?.choices?.[0]?.message?.content ?? '').trim();
      if (!reply) return json({ error: 'empty model reply' }, 502);
      return json({ reply, model }, 200);
    } catch {
      return json({ error: 'upstream model error — try again or reply manually' }, 502);
    }
  };
}
