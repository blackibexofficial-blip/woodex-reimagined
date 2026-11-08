/**
 * WOODEX — CRM client category (V4 PR-C).
 *
 * Explicit `category` on the record always wins. When unset (legacy rows,
 * hosted rows before the owner-gated migration), derive a display category
 * from kind + tags — migration-free, never persisted implicitly.
 */
import type { ClientCategory } from "@/api/types";

const INTERIORISH = /interior|turnkey|boq|project|fit.?out/i;

export const deriveClientCategory = (c: { category?: ClientCategory; kind: "retail" | "business"; tags?: string[] }): ClientCategory => {
  if (c.category) return c.category;
  const tags = (c.tags ?? []).join(" ");
  if (INTERIORISH.test(tags)) return "interior";
  if (c.kind === "retail") return "retail";
  return "business";
};

export const CLIENT_CATEGORY_LABELS: Record<ClientCategory, string> = {
  furniture: "Furniture",
  interior: "Interior",
  project: "Project",
  retail: "Retail",
  business: "Business",
};
