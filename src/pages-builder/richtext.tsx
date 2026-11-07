/**
 * WOODEX builder — rich-text helpers (Wave 4, inline text toolbar).
 *
 * The canvas inline toolbar and the panel richtext field both run on Puck's built-in
 * TipTap field (`type: "richtext"`, `@puckeditor/core@0.24`) — values are stored as an
 * HTML string in the block's prop. The Puck CANVAS, however, replaces contentEditable
 * richtext props with an inline-editor React element (Puck field transform) before handing
 * them to the render function, so `html` may arrive as a React element while editing —
 * render those as children instead of injecting sanitized markup. Persisted/storefront
 * renders always receive the HTML string.
 * Existing seeded documents hold PLAIN TEXT in those props; the sanitizer below escapes
 * anything that looks like an unknown tag, so plain content renders byte-identically
 * and styled content renders safely.
 *
 * Safety model: a tiny tokenizing scanner (not a regex wall) splits raw input into text
 * runs and candidate tags. A candidate may only start with `<[A-Za-z]` or `</[A-Za-z]`
 * (otherwise its `<` is escaped as text). Tags keep an INLINE allow-list (u, b, strong,
 * em, i, s, strike, a, br, span) — a hrefs restricted to http(s)?:/tel:/mailto:/root-relative/hash
 * with rel="noopener", spans carry no attributes, everything else is dropped (text kept).
 * script/style/iframe (and friends) are removed outright with their contents. No DOM is
 * needed, so the module is pure and unit-testable (node + esbuild alias of react).
 */
import { isValidElement, type ElementType } from "react";

export const richTextField = (label?: string, placeholder?: string) =>
  ({ type: "richtext" as const, label, placeholder, contentEditable: true, initialHeight: "auto" });

const INLINE_TAGS = new Set(["u", "b", "strong", "em", "i", "s", "strike", "a", "br", "span"]);
const DANGEROUS_PAIRS = /<(?:script|style|iframe|object|embed|form|noscript|template)(?:\s[^>]*)?>[\s\S]*?<\/(?:script|style|iframe|object|embed|form|noscript|template)\s*>/gi;
const DANGEROUS_OPEN = /<\/?(?:script|style|iframe|object|embed|form|noscript|template)(?:\s[^>]*)?\/?>/gi;

const escapeText = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Index of the `>` that terminates the tag which opens at `lt` — quote-aware, or -1. */
const findTagEnd = (source: string, lt: number): number => {
  let inDouble = false;
  let inSingle = false;
  for (let i = lt + 1; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c === 34 /* " */ && !inSingle) inDouble = !inDouble;
    else if (c === 39 /* ' */ && !inDouble) inSingle = !inSingle;
    else if (c === 62 /* > */ && !inDouble && !inSingle) return i;
    else if (c === 60 /* < */ && !inDouble && !inSingle) return -1; // nested '<' → not a tag
  }
  return -1;
};

const filterTag = (raw: string): string => {
  const match = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/.exec(raw.trim());
  if (!match) return escapeText(raw);
  const closing = match[1] === "/";
  const name = match[2].toLowerCase();
  if (!INLINE_TAGS.has(name)) return ""; // drop tag, keep inner text
  if (name === "br") return closing ? "" : "<br>";
  if (name === "a" && !closing) {
    const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[3])?.slice(2).find(Boolean) ?? "";
    const safe = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href.trim()) ? href.trim().replace(/"/g, "&quot;") : null;
    return safe ? `<a href="${safe}" rel="noopener">` : "";
  }
  if (name === "a" && closing) return "</a>";
  if (name === "span") return closing ? "</span>" : "<span>";
  return closing ? `</${name}>` : `<${name}>`;
};

/** Sanitize rich-text HTML to the inline allow-list. Pure string transform, DOM-free. */
export const sanitizeRichHtml = (value: string): string => {
  if (!value) return "";
  // Remove script-ish blocks (open+close pairs, or a lone dangling open/close tag) outright.
  const precleaned = String(value).replace(DANGEROUS_PAIRS, "").replace(DANGEROUS_OPEN, "");
  // Drop anchor pairs whose href is javascript: (keep their inner text).
  const anchorFree = precleaned.replace(
    /<a\b[^>]*href\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)[^>]*>([\s\S]*?)<\/a>/gi,
    "$2",
  );
  // Tokenize into trusted tags and escaped text.
  let output = "";
  let cursor = 0;
  while (cursor < anchorFree.length) {
    const lt = anchorFree.indexOf("<", cursor);
    if (lt === -1) {
      output += escapeText(anchorFree.slice(cursor));
      break;
    }
    output += escapeText(anchorFree.slice(cursor, lt));
    if (!/^<\/?[A-Za-z]/.test(anchorFree.slice(lt, lt + 3))) {
      output += "&lt;";
      cursor = lt + 1;
      continue;
    }
    const end = findTagEnd(anchorFree, lt);
    if (end === -1) {
      output += escapeText(anchorFree.slice(lt));
      break;
    }
    output += filterTag(anchorFree.slice(lt, end + 1));
    cursor = end + 1;
  }
  return output;
};

/**
 * Should a richtext prop render? Canvas passes an inline-editor React element (always render so the
 * editor stays mounted — clearing its text must not unmount it); storefront passes an HTML/plain string
 * (render only when it contains visible text, so an empty cleared field doesn't emit an empty tag).
 */
export const hasRichContent = (value: unknown): boolean => {
  if (isValidElement(value)) return true;
  // Strip tags to measure visible text — "", "<br>", "&nbsp;", "   " are all effectively empty.
  // The sanitizer escapes "&" → "&amp;" first, so decode it back before looking for &nbsp;.
  const text = sanitizeRichHtml(String(value ?? ""))
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return text.length > 0;
};

/**
 * Render rich-text into `Tag` (default span).
 *
 * - Puck canvas: contentEditable richtext props arrive as an inline-editor React element
 *   (Puck field transform) — spread it as children so the TipTap editor stays mounted.
 * - Anything else: treat as an HTML string, sanitize through the allow-list, and inject.
 */
export const RichHtml = ({ as: Tag = "span", html, className }: { as?: ElementType; html: unknown; className?: string }) => {
  if (isValidElement(html)) {
    return <Tag className={className}>{html}</Tag>;
  }
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(String(html ?? "")) }} />;
};
