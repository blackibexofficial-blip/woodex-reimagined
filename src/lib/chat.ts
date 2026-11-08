/**
 * WOODEX — live chat shared constants & helpers (V4 P0).
 *
 * Storefront bubble (src/components/chat) and the admin inbox
 * (src/admin/pages/ChatInbox) both speak from this file so the two surfaces
 * never drift apart on wording, quick prompts or storage keys.
 */
import { site, waLink } from "@/config/site";

/** sessionStorage key holding the visitor's open thread id (browser-local, demo). */
export const CHAT_THREAD_KEY = "woodex.chat.conversationId";
/** sessionStorage key holding the ISO time the visitor last opened the thread. */
export const CHAT_SEEN_KEY = "woodex.chat.seenAt";
/** Poll interval for agent/visitor updates (bounded, visibility-gated). */
export const CHAT_POLL_MS = 3000;
/** Sidebar/inbox badge refresh. */
export const CHAT_BADGE_POLL_MS = 15000;

/** Storefront greeting + quick-action prompts (each becomes the first visitor message). */
export const CHAT_QUICK_PROMPTS = [
  { id: "callback", label: "Request a callback", message: "Salam! Please call me back — I'd like a callback from the Wwoodex team." },
  { id: "quotation", label: "Ask about a quotation", message: "Salam! I need a quotation — please share details and next steps." },
  { id: "showroom", label: "Visit showroom", message: "Salam! I'd like to visit your showroom — please share timings and address." },
] as const;

/** Agent quick-reply templates in the inbox composer. */
export const CHAT_AGENT_TEMPLATES = [
  "We'll have someone call you back within the working hour.",
  `Our showroom hours: ${site.hours}. Address: ${site.address.oneLine}.`,
  "Please share your BOQ / requirements — we'll price it within one business day.",
] as const;

export const WA_CHAT_HANDOFF = waLink("Salam! I was on the WOODEX site and I'd like to talk to your team.");

/** Pakistani mobile: 03xx-xxxxxxx / +923xxxxxxxxx / 003xx…; landline kept permissive. */
export const PK_PHONE_RE = /^(\+92|0092|0)?3\d{2}[\s-]?\d{7}$/;

export function isPkPhone(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (PK_PHONE_RE.test(v)) return true;
  // landline fallback: at least 10 digits with leading 0 or +92
  return /^(\+92|0092|0)?[2-9]\d{1,2}[\s-]?\d{6,7}$/.test(v);
}

/** "2m ago"-style relative time for dense chat rows. */
export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
