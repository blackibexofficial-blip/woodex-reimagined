/**
 * Built-in quotation templates — the printable artefacts WOODEX hands to a
 * customer before an order exists. Code-owned: builtin templates cannot be
 * deleted or mutated through the admin; editing one clones a custom template
 * instead. Required wording on the classic template is locked (it protects
 * the commercial posture negotiated with the owner, 2026-11).
 *
 * Built-ins:
 *  - "Woodex classic" (default) — original formal quotation sheet.
 *  - "Woodex A4" (new, 2026-11) — redesigned A4 letterhead artefact matching
 *    the owner's attached target document: brand green #347647, masthead with
 *    brand block + document identity, PREPARED FOR/LOCATION/ATTENTION grid,
 *    green-header items table, 75/25 advance callout, terms grid, icon footer.
 */
import type { AdminQuoteTemplate } from "@/api/types";

export const PAYMENT_TERMS_NOTE = "Final payment terms will be included in formal quotation.";

/** WOODEX Interior policy wording — the furniture A4 default (owner-approved, WI-10204). */
export const DEFAULT_TERMS_EN = `PAYMENT & POLICY TERMS
____________________
Advance Payment Policy ({advancePct}%): Rs {advance} due upon contract signing.
Balance Due ({balancePct}%): Rs {balance} payable upon phase completion.
Validity: Quotation rates are valid for 30 days from the date of issuance ({validUntil}).`;

export const DEFAULT_TERMS_UR = `ادائیگی اور پالیسی کی شرائط
____________________
پیشگی ادائیگی کی پالیسی ({advancePct}%): Rs {advance} — معاہدہ دستخط ہوتے ہی واجب الادا۔
بقایا ادائیگی ({balancePct}%): Rs {balance} — میعاد مکمل ہونے پر قابلِ ادا۔
میعاد: کوٹیشن کی قیمتیں اجراء کی تاریخ سے 30 دن تک درست ہیں ({validUntil})۔`;

/** Quick-pick advance chips offered in the template designer. */
export const ADVANCE_CHIPS = [50, 60, 70, 75, 80, 100] as const;

/** Clamp to a whole-point 0–100 advance percentage; garbage ⇒ 75 (the house default). */
export const clampAdvancePct = (n: unknown): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 75;
  return Math.max(0, Math.min(100, Math.round(v)));
};

/** Resolve the EN/UR policy wording against a quote total. Pure; used by sheet + designer preview. */
export const resolvePolicyTerms = (
  template: string,
  vars: { advance: number; balance: number; validUntil: string; advancePct: number },
): string =>
  template
    .split("{advancePct}").join(String(vars.advancePct))
    .split("{balancePct}").join(String(100 - vars.advancePct))
    .split("{advance}").join(vars.advance.toLocaleString("en-PK"))
    .split("{balance}").join(vars.balance.toLocaleString("en-PK"))
    .split("{validUntil}").join(vars.validUntil);

/** Signatory footer presets. Zainab Tower = WI-10204 house doc; store = the canonical storefront line (src/config/site.ts). */
export const FOOTER_PRESETS = {
  zainab: {
    contactLines: ["Woodex Furniture"],
    addressLines: ["LG 89 / M-71 Zainab Tower", "Model Town Link Road, Lahore"],
    phone: "+92 322 4000768",
    email: "info@woodex.com.pk",
  },
  store: {
    contactLines: ["WOODEX"],
    addressLines: ["123 Gulberg III, Main Boulevard", "Lahore"],
    phone: "+92 300 1234567",
    email: "info@woodex.pk",
  },
} as const;

export const DEFAULT_QUOTE_TEMPLATE: AdminQuoteTemplate = {
  id: "builtin-woodex-classic",
  name: "Woodex classic",
  brandColor: "#318b45",
  builtIn: true,
  layout: "classic",
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

/**
 * "Woodex A4" — the redesigned owner-target sheet. The letterhead block is
 * the single source of truth for the brand block: first line = wordmark,
 * following lines = address / contact, shown in both the masthead and the
 * icon footer. Edit any block in the template designer to customise.
 */
export const WOODEX_A4_TEMPLATE: AdminQuoteTemplate = {
  id: "builtin-woodex-a4",
  name: "Woodex A4",
  brandColor: "#347647",
  builtIn: true,
  layout: "a4",
  header: [
    {
      id: "letterhead",
      type: "letterhead",
      label: "Letterhead (wordmark + contact lines)",
      content: "Woodex Furniture\nLG 89, Zainab Tower, Model Town, Lahore\n+92 322 4000768 · info@woodex.com.pk",
      visible: true,
    },
    { id: "doc-title", type: "doc-title", label: "Document title", content: "Quotation", visible: true },
    { id: "doc-ref", type: "doc-ref", label: "Document ref", content: "Ref {ref} · v{version}", visible: true },
    { id: "validity", type: "validity", label: "Validity line", content: "Valid until {validUntil}", visible: true },
  ],
  footer: [
    { id: "payment-note", type: "payment-note", label: "Payment schedule", content: "75% advance with order confirmation · 25% balance on completion, against final site measurements.", visible: true },
    { id: "delivery", type: "custom", label: "Delivery timeline", content: "14–21 working days from advance receipt and confirmed site measurements.", visible: true },
    { id: "warranty", type: "custom", label: "Warranty terms", content: "1 year workmanship & structure against manufacturing defects.", visible: true },
    { id: "validity", type: "custom", label: "Validity", content: "Prices honoured until {validUntil}.", visible: true },
    { id: "terms", type: "terms", label: "Terms", content: "Prices in PKR. Delivery timeline is indicative and is confirmed in writing at order confirmation. Warranty and installation are covered per line item where stated.", visible: true },
    { id: "thanks", type: "custom", label: "Thank-you line", content: "Thank you for choosing Woodex Furniture", visible: true },
  ],
  advancePct: 75,
  validityDays: 30,
  termsEn: DEFAULT_TERMS_EN,
  termsUr: DEFAULT_TERMS_UR,
  acceptanceBlock: true,
  footerVariant: "zainab",
};

/** Every code-owned builtin, classic first (it stays the default selection). */
export const BUILTIN_TEMPLATES: AdminQuoteTemplate[] = [DEFAULT_QUOTE_TEMPLATE, WOODEX_A4_TEMPLATE];

export const isBuiltinTemplateId = (id: string | undefined): boolean =>
  !!id && BUILTIN_TEMPLATES.some((t) => t.id === id);

export const findTemplate = (list: AdminQuoteTemplate[], id: string | undefined): AdminQuoteTemplate =>
  (id ? (list.find((t) => t.id === id) ?? BUILTIN_TEMPLATES.find((t) => t.id === id)) : undefined) ?? DEFAULT_QUOTE_TEMPLATE;

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

/** Visible, single-line content of a template block (by id), e.g. for the A4 terms grid. */
export const renderGridBlock = (
  template: AdminQuoteTemplate,
  blockId: string,
  vars: TemplateVars,
): string | undefined => {
  const block = template.footer.find((b) => b.id === blockId);
  if (!block || !block.visible) return undefined;
  return renderBlockContent(block.content, vars).replace(/\s*\n\s*/g, " · ").trim();
};
