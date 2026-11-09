/**
 * WOODEX — sales-agent draft replies (P1-6, Step 5 of the V5 go-live plan).
 *
 * Two engines behind one API:
 *
 *   OFFLINE (always available) — deterministic retrieval over the static
 *   `KNOWLEDGE_CORPUS` (src/lib/ai/knowledge.ts). Prices come ONLY from
 *   `records` the caller passes in (demo: the admin product list). Nothing
 *   else is ever quoted — if we cannot ground a sentence, we say so and hand
 *   off to a human instead of improvising.
 *
 *   ONLINE (opt-in, owner action) — `supabase/functions/ai-agent` accepts the
 *   retrieved snippets as `grounding` and asks an OpenAI-compatible model to
 *   phrase them. Its client-supplied facts are NOT trusted server grounding;
 *   hosted use should remain disabled pending grounding, rate and privacy controls.
 *   This module never calls the network; ChatInbox sets the draft
 *   into the composer for a human to review and send.
 *
 * Hard rules (mirrors docs/08-master-plan/MASTER-TODO.md):
 *  - Never invent numbers, dates, stock, discounts, ETAs or prices.
 *  - Every price token in a draft must trace to `records` (checked by the
 *    offline evaluator — see rehearsal/ai-eval.mjs).
 *  - Low-confidence or price-less product questions ⇒ requiresHuman = true.
 */

import { retrieveKnowledge, tokenize, type KnowledgeHit } from "./knowledge";

export interface AgentPriceRecord {
  id: string;
  name: string;
  sku?: string;
  price: number;
}

export interface AgentDraftOptions {
  /** Catalogue/price records the agent is allowed to quote from. */
  records?: AgentPriceRecord[];
  /** Number of knowledge snippets used at most (default 2). */
  maxSnippets?: number;
}

export type AgentConfidence = "high" | "low" | "none";

export interface AgentDraft {
  /** Draft text — goes into the composer, never straight into the thread. */
  reply: string;
  /** Knowledge entry ids that grounded the draft (eval/log citation). */
  sources: string[];
  /** Ids of price records quoted (empty when none were). */
  quotedRecordIds: string[];
  confidence: AgentConfidence;
  /** True when a human should review/own the follow-up (price, unknown, low grounding). */
  requiresHuman: boolean;
}

const PRICE_INTENT = /\b(price|prices|cost|costs|rate|rates|quotation|quote|qoute|kharcha|qeemat|price list|kitna|kh arch)\b|قیمت\s*کیا/i;

const formatPKR = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/** Token-overlap between the query and a record's name/sku — used for price lookups. */
const recordMatchScore = (tokens: string[], record: AgentPriceRecord): number => {
  const hay = tokenize(`${record.name} ${record.sku ?? ""}`);
  if (hay.length === 0) return 0;
  const set = new Set(hay);
  let hits = 0;
  for (const t of tokens) if (set.has(t)) hits += 1;
  return hits;
};

/** Best-scoring records for a price question (top `limit`). */
export const matchPriceRecords = (message: string, records: AgentPriceRecord[], limit = 3): AgentPriceRecord[] => {
  const tokens = tokenize(message);
  return records
    .map((record) => ({ record, score: recordMatchScore(tokens, record) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.record.price - b.record.price)
    .slice(0, limit)
    .map(({ record }) => record);
};

const priceSentence = (record: AgentPriceRecord): string =>
  `For the ${record.name} (SKU ${record.sku ?? record.id}) the catalogue price is ${formatPKR(record.price)}.`;

export const draftAgentReply = (rawMessage: string, options: AgentDraftOptions = {}): AgentDraft => {
  const message = rawMessage.trim();
  const records = options.records ?? [];
  const maxSnippets = Math.max(1, Math.min(3, options.maxSnippets ?? 2));

  if (!message) {
    return { reply: "Tell me what you are looking for and I will help.", sources: [], quotedRecordIds: [], confidence: "none", requiresHuman: true };
  }

  const tokens = tokenize(message);
  const hits: KnowledgeHit[] = retrieveKnowledge(message, 4);
  const snippets = hits.slice(0, maxSnippets);
  const hasPriceIntent = PRICE_INTENT.test(message);
  const priceHits = hasPriceIntent ? matchPriceRecords(message, records, 3) : [];

  /* ── price questions: records or an honest hand-off, never an invented number ── */
  if (hasPriceIntent && records.length > 0 && priceHits.length > 0) {
    const lines = priceHits.map(priceSentence);
    const reply = [
      "Salam! Happy to help with pricing.",
      ...lines,
      "Final quote (quantity, finish, delivery & installation) is confirmed in writing by the sales team — shall I share your details with them?",
    ].join(" ");
    return {
      reply,
      sources: [
        // nothing external — only records, which we cite by id
      ],
      quotedRecordIds: priceHits.map((r) => r.id),
      confidence: "high",
      requiresHuman: true, // prices always confirmed by a human
    };
  }

  /* ── grounded snippet answer ─────────────────────────────────────────────── */
  if (snippets.length > 0) {
    const confident = (hits[0]?.score ?? 0) >= 4;
    const facts = snippets.map((h) => h.entry.statement);
    const priceNudge = hasPriceIntent && records.length === 0
      ? " For an exact quote, please share the item, quantity, finish and delivery city — or visit sales@woodex.pk."
      : hasPriceIntent
        ? " I don't have a matching catalogue price for that configuration here — share the item details and the team will send a written quotation."
        : "";
    const reply = `Salam! ${facts.join(" ")}${priceNudge}`;
    return {
      reply,
      sources: snippets.map((h) => h.entry.id),
      quotedRecordIds: [],
      confidence: confident ? "high" : "low",
      requiresHuman: !confident || hasPriceIntent,
    };
  }

  /* ── nothing grounded: honest fallback, human takes over ─────────────────── */
  return {
    reply:
      "Salam! That's beyond what I can answer from our published information — I'll have our sales team assist you personally. Please leave your name, phone and what you need, or reach sales@woodex.pk / +92 300 1234567.",
    sources: [],
    quotedRecordIds: [],
    confidence: "none",
    requiresHuman: true,
  };
};
