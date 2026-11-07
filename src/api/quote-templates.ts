/**
 * Built-in quotation template — the printable artefact WOODEX hands to a
 * customer before an order exists. Code-owned: the "Woodex classic" default
 * cannot be deleted or mutated through the admin; editing it clones a custom
 * template instead. Required wording is locked (it protects the commercial
 * posture negotiated with the owner, 2026-11).
 */
import type { AdminQuoteTemplate } from "@/api/types";

export const PAYMENT_TERMS_NOTE = "Final payment terms will be included in formal quotation.";

export const DEFAULT_QUOTE_TEMPLATE: AdminQuoteTemplate = {
  id: "builtin-woodex-classic",
  name: "Woodex classic",
  brandColor: "#318b45",
  builtIn: true,
  header: [
    { id: "letterhead", type: "letterhead", label: "Letterhead", content: "WOODEX · woodexfurniture.pk", visible: true },
    { id: "doc-ref", type: "doc-ref", label: "Document ref", content: "Quote {ref} · version {version}", visible: true },
    { id: "doc-title", type: "doc-title", label: "Document title", content: "Formal Quotation", visible: true },
    { id: "validity", type: "validity", label: "Validity line", content: "Valid until {validUntil} · subject to availability at the time of order.", visible: true },
  ],
  footer: [
    { id: "payment-note", type: "payment-note", label: "Payment note (required wording)", content: PAYMENT_TERMS_NOTE, visible: true },
    { id: "terms", type: "terms", label: "Terms", content: "Prices in PKR. Delivery timeline is indicative and is confirmed in writing at order confirmation. Warranty and installation are covered per line item where stated.", visible: true },
  ],
};

export const findTemplate = (list: AdminQuoteTemplate[], id: string | undefined): AdminQuoteTemplate =>
  (id ? list.find((t) => t.id === id) : undefined) ?? DEFAULT_QUOTE_TEMPLATE;

/** Compact engineering-dimension string for a quote line, e.g. "900 × 450 × 700 mm". Empty when no dims. */
export function dimSpec(item: { width?: number; height?: number; depth?: number; unit?: string }): string {
  const dims = [item.width, item.height, item.depth].filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
  if (dims.length === 0) return "";
  return `${dims.join(" × ")} ${item.unit ?? "mm"}`;
}

export type TemplateVars = { ref: string; version: number | string | undefined; validUntil: string; customer?: string };

/** Replace {placeholders} in a template block's content with live quote values. */
const sub = (haystack: string, needle: string, value: string): string => haystack.split(needle).join(value);

export const renderBlockContent = (content: string, vars: TemplateVars): string =>
  sub(sub(sub(sub(content, "{ref}", vars.ref), "{version}", String(vars.version ?? 1)), "{validUntil}", vars.validUntil), "{customer}", vars.customer ?? "");

/** Render a block (by id) from a template against the live quote values. Empty string when the block is missing. */
export const renderBlock = (
  template: AdminQuoteTemplate,
  blockId: string,
  vars: TemplateVars,
): string => {
  const block = [...template.header, ...template.footer].find((b) => b.id === blockId);
  return block ? renderBlockContent(block.content, vars) : "";
};
