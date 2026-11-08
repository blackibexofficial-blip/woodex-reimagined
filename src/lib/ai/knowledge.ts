/**
 * WOODEX — sales-agent knowledge corpus (P1-6, Step 5 of the V5 go-live plan).
 *
 * Every entry below is a fact the business already publishes or has explicitly
 * approved (src/config/site.ts, the /warranty seed, the WI-10204 payment
 * policy, the delivery-zone model in the admin adapter). Nothing here is
 * invented copy, and no private/customer data may ever be added to this file.
 *
 * The corpus is used two ways:
 *   1. OFFLINE  — `retrieveKnowledge` grounds draft replies assembled by
 *      `src/lib/ai/agent.ts`. Fully deterministic, zero network, testable
 *      offline (see rehearsal/ai-eval.mjs).
 *   2. ONLINE   — when the owner deploys `supabase/functions/ai-agent` with an
 *      OpenAI-compatible API key, the client ships the retrieved snippets as
 *      `grounding` and the model is instructed to answer ONLY from them.
 *
 * Editing rule: change facts here only when the business fact itself changes
 * (showroom move, new warranty term, new advance policy…). Never paste
 * customer PII, unreleased pricing, or ad-hoc notes into this file.
 */

export interface KnowledgeEntry {
  /** Stable id — used as citation in evals and logs. */
  id: string;
  topic: string;
  /** Keyword stems (lowercase) that should boost retrieval for this entry. */
  keywords: string[];
  /** The grounded statement — complete sentences, safe to send to a visitor. */
  statement: string;
  /** Where the fact comes from — for reviewers, never rendered to visitors. */
  source: string;
}

export const KNOWLEDGE_CORPUS: KnowledgeEntry[] = [
  {
    id: "store-hours",
    topic: "Showroom hours",
    keywords: ["hour", "open", "timing", "time", "close", "saturday", "sunday", "visit", "showroom"],
    statement: "Our showroom is open Monday to Saturday, 9am to 7pm.",
    source: "src/config/site.ts — hours",
  },
  {
    id: "store-address",
    topic: "Showroom address",
    keywords: ["address", "location", "showroom", "gulberg", "visit", "where", "map", "direction"],
    statement: "The WOODEX showroom is at 123 Gulberg III, Main Boulevard, Lahore, Pakistan.",
    source: "src/config/site.ts — address.oneLine",
  },
  {
    id: "contact-phone",
    topic: "Contact — phone / WhatsApp",
    keywords: ["phone", "call", "contact", "number", "whatsapp", "mobile", "reach", "line"],
    statement: "You can reach us on +92 300 1234567 — the same number works on WhatsApp.",
    source: "src/config/site.ts — phone / whatsapp",
  },
  {
    id: "contact-email",
    topic: "Contact — email",
    keywords: ["email", "mail", "inbox", "write"],
    statement: "For general queries write to info@woodex.pk — quotes go to sales@woodex.pk and warranty claims to warranty@woodex.pk.",
    source: "src/config/site.ts — email / salesEmail / warrantyEmail",
  },
  {
    id: "catalog-scope",
    topic: "What WOODEX makes",
    keywords: ["range", "catalog", "catalogue", "product", "office", "sofa", "desk", "chair", "workstation", "furniture", "collection", "home", "hotel", "make"],
    statement: "WOODEX is an office & home furniture manufacturer — desks, ergonomic chairs, workstations, meeting tables, storage, sofas and made-to-order pieces, plus hotel and public-seating collections.",
    source: "src/config/site.ts — description; src/data/products.ts",
  },
  {
    id: "made-to-order",
    topic: "Made to order",
    keywords: ["custom", "made", "order", "size", "finish", "colour", "fabric", "leather", "bespoke", "dimension"],
    statement: "Many pieces are built to order — finishes, fabrics and dimensions can be adjusted. The sales team confirms lead times and specs on your formal quotation.",
    source: "products.ts isBestSeller/made-to-order mix; quotation flow",
  },
  {
    id: "delivery-zones",
    topic: "Delivery",
    keywords: ["delivery", "deliver", "shipping", "dispatch", "zone", "days", "charges", "install", "assembly"],
    statement: "We deliver with installation across Lahore and other cities — delivery days and charges depend on your zone and the items, and are confirmed on the formal quotation.",
    source: "delivery-zone model (admin adapter) — owner-confirm final rates",
  },
  {
    id: "payment-policy",
    topic: "Payment policy",
    keywords: ["payment", "advance", "installment", "bank", "cash", "transfer", "75", "25", "balance", "terms", "cod"],
    statement: "On contract signing we take a 75% advance; the remaining 25% is payable upon phase completion. Quotation rates stay valid for 30 days from the date of issuance.",
    source: "Owner-approved WI-10204 PAYMENT & POLICY TERMS (quote-templates.ts)",
  },
  {
    id: "quote-validity",
    topic: "Quote validity",
    keywords: ["valid", "validity", "expire", "days", "quotation", "quote"],
    statement: "Formal quotation rates are valid for 30 days from the date of issuance.",
    source: "Owner-approved WI-10204 wording (default validityDays = 30)",
  },
  {
    id: "warranty-ek",
    topic: "Warranty — Ek Series",
    keywords: ["warranty", "ek", "guarantee", "coverage"],
    statement: "Ek Series products carry a 3-year standard warranty — manufacturing defects in materials, structural frame integrity, drawer mechanisms and surface delamination.",
    source: "src/data/warrantyPage.ts — tier-standard",
  },
  {
    id: "warranty-infinity",
    topic: "Warranty — Infinity Series",
    keywords: ["warranty", "infinity", "guarantee", "coverage"],
    statement: "Infinity Series products carry a 5-year enhanced warranty — everything in the standard tier plus upholstery defects (first 2 years), chair pneumatic mechanisms, veneer defects and hardware.",
    source: "src/data/warrantyPage.ts — tier-enhanced",
  },
  {
    id: "warranty-woodex",
    topic: "Warranty — Woodex Series",
    keywords: ["warranty", "woodex series", "premium", "lifetime", "guarantee", "coverage"],
    statement: "Woodex Series products carry a 10-year premium warranty — complete structural warranty, free annual maintenance check and priority 48-hour repair response.",
    source: "src/data/warrantyPage.ts — tier-premium",
  },
  {
    id: "warranty-claim",
    topic: "Warranty — how to claim",
    keywords: ["warranty", "claim", "repair", "defect", "complaint", "register"],
    statement: "Warranty claims: keep your invoice as proof of purchase and email warranty@woodex.pk or call +92 300 1234567 with the order number, photos of the defect and the serial number on the product label. Coverage is registered automatically on delivery.",
    source: "src/data/warrantyPage.ts — steps / faqs",
  },
  {
    id: "warranty-excludes",
    topic: "Warranty — exclusions",
    keywords: ["warranty", "exclude", "wear", "accident", "not covered"],
    statement: "Normal wear and tear, accidental damage, sun fade, water damage and unauthorized modifications are outside warranty coverage.",
    source: "src/data/warrantyPage.ts — tier excludes",
  },
  {
    id: "b2b-projects",
    topic: "Projects / B2B fit-outs",
    keywords: ["project", "b2b", "office", "fit-out", "fitout", "boq", "turnkey", "company", "bulk", "corporate", "interior"],
    statement: "For office fit-outs, BOQs and turnkey interiors we assign a dedicated sales lead — share your floor plan or BOQ and we will prepare a formal quotation with milestones.",
    source: "CRM project pipeline (leads.kind = project / quotation flow)",
  },
  {
    id: "storefront-virtual",
    topic: "Virtual showroom",
    keywords: ["virtual", "tour", "360", "online", "showroom"],
    statement: "You can browse the virtual showroom online — live 360° rooms with the current collection, or visit us at the Gulberg III showroom (Mon–Sat 9–7).",
    source: "src/data/virtualShowroomPage.ts — /virtual-showroom",
  },
  {
    id: "trade-pricing",
    topic: "Trade / contractor pricing",
    keywords: ["trade", "contractor", "architect", "designer", "discount", "reseller", "dealer"],
    statement: "Architects, designers and trade partners are welcome — contact sales@woodex.pk and ask about trade pricing and project support.",
    source: "sales@woodex.pk channel (CRM lead source trade/interior)",
  },
  {
    id: "stock-and-orders",
    topic: "Order process",
    keywords: ["order", "stock", "available", "dispatch", "lead time", "delivery time", "how"],
    statement: "In-stock pieces are dispatched after confirmation; made-to-order pieces go into production after your advance and drawing sign-off. Exact dates are confirmed on the formal quotation and proforma.",
    source: "order + PO flow (quote → proforma → PO → dispatch)",
  },
];

export interface KnowledgeHit {
  entry: KnowledgeEntry;
  score: number;
}

const STOPWORDS = new Set(
  "a an the is are am was were be been being to of in on at for with and or but it this that these those i you he she we they me my your our their what which who whom how when where why do does did can could should would will may might shall please any some about into over under again once more most other such only own same so than too very just also not".split(" "),
);

export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

/**
 * Deterministic keyword/overlap retrieval. Score = 3×keyword-substring hits +
 * 1×token-overlap of the statement (with a small phrase bonus), so idiomatic
 * questions still land the right snippet. Ties break on corpus order for
 * stable, replayable results.
 */
export const retrieveKnowledge = (query: string, topK = 3): KnowledgeHit[] => {
  const tokens = tokenize(query);
  const q = query.toLowerCase();
  const scored = KNOWLEDGE_CORPUS.map((entry) => {
    let score = 0;
    for (const kw of entry.keywords) {
      const needle = kw.toLowerCase();
      if (q.includes(needle)) score += 3;
      else if (tokens.some((t) => t.includes(needle) || needle.includes(t))) score += 1.5;
    }
    const stmtTokens = new Set(tokenize(entry.statement));
    for (const t of tokens) if (stmtTokens.has(t)) score += 1;
    if (score > 0) {
      for (const phrase of [entry.topic.toLowerCase()]) {
        if (q.includes(phrase)) score += 2;
      }
    }
    return { entry, score };
  })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
};
