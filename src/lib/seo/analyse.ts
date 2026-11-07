/**
 * Local, deterministic Yoast-style SEO + readability analyser (Wave 5 · PB-5).
 *
 * Pure functions, zero dependencies, zero network — the "analyse" verdict of the Pages SEO panel
 * and the publish gate. Mirrors the checks called out in the master plan (§0A.7):
 *   keyphrase in title / meta description / introduction / body
 *   title 30–60 · meta 120–160 · exactly one H1 · word count ≥ 300 · Flesch reading ease ≥ 60
 *
 * Readability uses the Flesch Reading Ease index with a vowel-group syllable heuristic — good
 * enough for English commerce copy, deterministic, and honest about being an estimate.
 */

export type SeoSeverity = "good" | "ok" | "bad";

export interface SeoCheck {
  id: string;
  label: string;
  severity: SeoSeverity;
  detail: string;
}

export interface SeoReport {
  checks: SeoCheck[];
  wordCount: number;
  flesch: number;
  /** 0–100 — share of checks at good (ok counts as 0.55, bad as 0), equal weights. */
  seoScore: number;
  /** Flesch clamped to 0–100. */
  readabilityScore: number;
  seoRating: SeoSeverity;
  readabilityRating: SeoSeverity;
  /** Hard publish-gate violations (empty title/description, ≠1 H1, empty keyphrase). */
  blocked: string[];
}

export interface AnalyseInput {
  title: string;
  metaDescription: string;
  focusKeyphrase: string;
  bodyText: string;
  /** Lead paragraph — first ~200 words of bodyText is fine. */
  firstParagraph?: string;
  /** Number of h1-rendering blocks in the document (heroes render h1, sections h2). */
  h1Count: number;
}

const countWords = (text: string) => (text.trim().match(/\S+/g) ?? []).length;

const countSentences = (text: string) => Math.max(1, (text.match(/[.!?]+(\s|$|”|")/g) ?? []).length || 1);

/** Vowel-group heuristic with silent-e adjustment. Deliberately simple and deterministic. */
const syllablesInWord = (raw: string): number => {
  const w = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const groupMatch = w.match(/[aeiouy]+/g);
  const groups: string[] = groupMatch ?? [];
  let count = groups.length;
  if (w.endsWith("e") && !w.endsWith("le")) count -= 1; // silent e
  return Math.max(1, count);
};

export const fleschReadingEase = (text: string): number => {
  const wordMatch = text.trim().match(/[A-Za-z0-9']+/g);
  const words: string[] = wordMatch ?? [];
  if (words.length === 0) return 0;
  const sentences = countSentences(text);
  const syllables = words.reduce((sum, w) => sum + syllablesInWord(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length);
  return Math.round(score);
};

const occurrences = (haystack: string, needle: string): number => {
  if (!needle) return 0;
  const hay = haystack.toLowerCase();
  let count = 0;
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = hay.indexOf(needle, idx + needle.length);
  }
  return count;
};

const CREDIT: Record<SeoSeverity, number> = { good: 1, ok: 0.55, bad: 0 };
const ratingFor = (score: number): SeoSeverity => (score >= 80 ? "good" : score >= 50 ? "ok" : "bad");

/** Block types whose render outputs the page's single h1. */
export const H1_BLOCK_TYPES = new Set([
  "HeroCentered", "HeroCenteredTrust", "HeroForm", "HeroSplitForm", "HeroSplitStats", "HeroDark",
]);

/** Flatten a Puck document's string props into body text + the first block's intro paragraph. */
export const extractBodyText = (doc: { content?: unknown[] } | null | undefined): { bodyText: string; firstParagraph: string; h1Count: number } => {
  const strings: string[] = [];
  let h1Count = 0;
  const isNoiseString = (s: string): boolean => {
    const t = s.trim();
    if (t.length < 3) return true;                                // "Rs.", "—", stray punctuation
    if (/^(\/ [^ ]|https?:\/\/|www\.)/i.test(t)) return true; // paths & urls (leading "/ " handled below)
    if (t.startsWith("/") || t.startsWith("http") || t.startsWith("www.")) return true;
    if (/^pb-[a-z0-9-]*$/i.test(t)) return true;                  // internal block ids
    if (/^[#0-9\s.,%–—-]+$/.test(t)) return true;                // prices / digits / separators
    if (/\.(webp|png|jpe?g|svg|avif|mp4|webm|ico)(\?.*)?$/i.test(t)) return true; // asset filenames
    return false;
  };
  const walk = (value: unknown) => {
    if (value == null) return;
    if (typeof value === "string") { if (!isNoiseString(value)) strings.push(value); return; }
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "id" || k === "type" || k === "hidden" || k === "locked") continue;
        walk(v);
      }
    }
  };
  const content = Array.isArray(doc?.content) ? doc.content : [];
  for (const block of content as Array<{ type?: string; props?: unknown }>) {
    if (block?.type && H1_BLOCK_TYPES.has(block.type)) h1Count += 1;
    walk(block?.props);
  }
  const bodyText = strings.join(" ").replace(/\s+/g, " ").trim();
  // "Introduction" for a block document ≈ opening ~200 words (hero + lead copy) — slice at a word boundary.
  const firstParagraph = bodyText.split(" ").slice(0, 200).join(" ");
  return { bodyText, firstParagraph, h1Count };
};

export function analyseSeo(input: AnalyseInput): SeoReport {
  const title = input.title.trim();
  const meta = input.metaDescription.trim();
  const key = input.focusKeyphrase.trim().toLowerCase();
  const body = input.bodyText.trim();
  const first = (input.firstParagraph ?? body).trim();
  const words = countWords(body);
  const flesch = fleschReadingEase(body);

  const checks: SeoCheck[] = [];

  // 1 — keyphrase in title
  if (!key) {
    checks.push({ id: "keyphrase-in-title", label: "Focus keyphrase in title", severity: "bad", detail: "No focus keyphrase set." });
  } else if (title.toLowerCase().includes(key)) {
    const pos = title.toLowerCase().indexOf(key);
    checks.push({ id: "keyphrase-in-title", label: "Focus keyphrase in title", severity: pos <= 40 ? "good" : "ok", detail: pos <= 40 ? "Present near the start of the title." : "Present, but late in the title — move it forward." });
  } else {
    checks.push({ id: "keyphrase-in-title", label: "Focus keyphrase in title", severity: "bad", detail: "Missing from the page title." });
  }

  // 2 — keyphrase in meta description
  checks.push(
    key && meta.toLowerCase().includes(key)
      ? { id: "keyphrase-in-description", label: "Focus keyphrase in description", severity: "good", detail: "Present in the meta description." }
      : { id: "keyphrase-in-description", label: "Focus keyphrase in description", severity: meta ? "bad" : "bad", detail: meta ? "Missing from the meta description." : "Meta description is empty." },
  );

  // 3 — keyphrase in introduction
  checks.push(
    key && first.toLowerCase().includes(key)
      ? { id: "keyphrase-in-introduction", label: "Focus keyphrase in introduction", severity: "good", detail: "Present in the opening copy." }
      : { id: "keyphrase-in-introduction", label: "Focus keyphrase in introduction", severity: "ok", detail: "Not in the first sentences — lead with what the reader came for." },
  );

  // 4 — keyphrase in body
  const bodyHits = occurrences(body, key);
  checks.push(
    bodyHits >= 2 ? { id: "keyphrase-in-body", label: "Focus keyphrase in content", severity: "good", detail: `${bodyHits} occurrences (2–5 reads naturally).` }
    : bodyHits === 1 ? { id: "keyphrase-in-body", label: "Focus keyphrase in content", severity: "ok", detail: "Only one occurrence — weave it in 1–2 more times." }
    : { id: "keyphrase-in-body", label: "Focus keyphrase in content", severity: "bad", detail: "Never used in the page content." },
  );

  // 5 — title length
  const tlen = title.length;
  checks.push(
    tlen >= 30 && tlen <= 60 ? { id: "title-length", label: "Title length (30–60)", severity: "good", detail: `${tlen} characters.` }
    : (tlen >= 10 && tlen < 30) || (tlen > 60 && tlen <= 70) ? { id: "title-length", label: "Title length (30–60)", severity: "ok", detail: `${tlen} characters — ${tlen < 30 ? "a little thin" : "a little long"}.` }
    : { id: "title-length", label: "Title length (30–60)", severity: "bad", detail: `${tlen} characters — ${tlen < 10 ? "missing/too short" : "too long"}.` },
  );

  // 6 — meta description length
  const mlen = meta.length;
  checks.push(
    mlen >= 120 && mlen <= 160 ? { id: "meta-length", label: "Meta description (120–160)", severity: "good", detail: `${mlen} characters.` }
    : (mlen >= 70 && mlen < 120) || (mlen > 160 && mlen <= 200) ? { id: "meta-length", label: "Meta description (120–160)", severity: "ok", detail: `${mlen} characters — ${mlen < 120 ? "a little thin" : "slightly long"}.` }
    : { id: "meta-length", label: "Meta description (120–160)", severity: "bad", detail: mlen === 0 ? "Missing meta description." : `${mlen} characters — far ${mlen < 70 ? "too short" : "too long"}.` },
  );

  // 7 — exactly one H1
  checks.push(
    input.h1Count === 1 ? { id: "single-h1", label: "Exactly one H1", severity: "good", detail: "One hero-level heading." }
    : input.h1Count === 0 ? { id: "single-h1", label: "Exactly one H1", severity: "bad", detail: "No H1 found — a hero section provides one." }
    : { id: "single-h1", label: "Exactly one H1", severity: "bad", detail: `${input.h1Count} H1s found — keep exactly one.` },
  );

  // 8 — word count
  checks.push(
    words >= 300 ? { id: "word-count", label: "Word count (≥300)", severity: "good", detail: `${words} words.` }
    : words >= 150 ? { id: "word-count", label: "Word count (≥300)", severity: "ok", detail: `${words} words — aim for 300+.` }
    : { id: "word-count", label: "Word count (≥300)", severity: "bad", detail: `${words} words — thin for search.` },
  );

  // 9 — readability
  checks.push(
    flesch >= 60 ? { id: "readability", label: "Readability (Flesch ≥ 60)", severity: "good", detail: `Flesch ${flesch} — plain English.` }
    : flesch >= 45 ? { id: "readability", label: "Readability (Flesch ≥ 60)", severity: "ok", detail: `Flesch ${flesch} — tighten sentences and words.` }
    : { id: "readability", label: "Readability (Flesch ≥ 60)", severity: "bad", detail: `Flesch ${flesch} — harder to read than a newspaper.` },
  );

  const credit = checks.reduce((sum, c) => sum + CREDIT[c.severity], 0);
  const seoScore = Math.round((credit / checks.length) * 100);
  const readabilityScore = Math.max(0, Math.min(100, flesch));

  const blocked: string[] = [];
  if (title.length < 10) blocked.push("Page title is missing or too short (under 10 characters).");
  if (meta.length === 0) blocked.push("Meta description is missing.");
  if (input.h1Count !== 1) blocked.push(`Exactly one H1 is required (found ${input.h1Count}).`);
  if (!key) blocked.push("Focus keyphrase is empty.");

  return {
    checks,
    wordCount: words,
    flesch,
    seoScore,
    readabilityScore,
    seoRating: ratingFor(seoScore),
    readabilityRating: ratingFor(readabilityScore),
    blocked,
  };
}
