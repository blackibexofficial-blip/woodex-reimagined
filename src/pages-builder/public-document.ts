import type { AdminPageDoc } from "@/api/types";
import { safeBuilderHref } from "./safe-url";

/**
 * A deliberately narrow, provisional profile for a future storefront renderer.
 * It is not an HTML sanitizer, authorization check, or proof that content is true.
 * Unsupported documents are rejected as a whole, never partly rendered. The caller
 * must render the returned copy (not the original mutable input), in public mode.
 */
export type PublicDocumentIssueCode =
  | "invalid_document" | "too_many_blocks" | "unsupported_root" | "invalid_block"
  | "unsupported_block" | "duplicate_id" | "unsupported_style" | "invalid_property"
  | "unsafe_link" | "rich_text_unsupported" | "size_limit";
export interface PublicDocumentIssue { code: PublicDocumentIssueCode; block?: number; field?: string }
export type PublicDocumentResult =
  | { ok: true; doc: AdminPageDoc; issues: [] }
  | { ok: false; issues: PublicDocumentIssue[] };

type Rule = "text" | "plainRich" | "link" | readonly string[];
const schemas: Record<string, Record<string, Rule>> = {
  Heading: { eyebrow: "text", title: "plainRich", level: ["h1", "h2", "h3", "h4"], align: ["left", "center"] },
  SubHeading: { text: "plainRich", align: ["left", "center"] },
  Paragraph: { text: "plainRich" },
  SmallLabel: { text: "plainRich", tone: ["accent", "muted"] },
  SectionHeading: { eyebrow: "text", title: "plainRich", subtitle: "plainRich", align: ["left", "center"] },
  ButtonLink: { label: "text", href: "link", variant: ["accent", "outline"] },
  Button: { label: "text", href: "link", variant: ["accent", "outline", "ghost"] },
  TwoButtons: { primaryLabel: "text", primaryHref: "link", secondaryLabel: "text", secondaryHref: "link" },
  Spacer: { size: ["sm", "md", "lg"] },
  DividerLine: { label: "text", tone: ["subtle", "accent"] },
  HeroCentered: { eyebrow: "text", title: "text", subtitle: "text", ctaLabel: "text", ctaHref: "link" },
  HeroCenteredTrust: { title: "text", subtitle: "text", trust: "text" },
  CtaStrip: { text: "text", ctaLabel: "text", ctaHref: "link" },
};
const common: Record<string, Rule> = { id: "text", hidden: ["visible", "hidden"], locked: ["locked", "unlocked"] };
const MAX_BLOCKS = 50;
const MAX_FIELD_LENGTH = 4000;
const MAX_TEXT_LENGTH = 100000;
const MAX_ISSUES = 20;
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);
const isPlainText = (text: string) => !text.includes("<") && !text.includes(">");
const hasControl = (text: string) => Array.from(text).some((char) => {
  const n = char.charCodeAt(0);
  return (n < 32 && n !== 9 && n !== 10 && n !== 13) || n === 127;
});

export function preparePublicDocument(value: unknown): PublicDocumentResult {
  const issues: PublicDocumentIssue[] = [];
  const add = (code: PublicDocumentIssueCode, block?: number, field?: string) => {
    if (issues.length < MAX_ISSUES) issues.push({ code, ...(block !== undefined ? { block } : {}), ...(field ? { field } : {}) });
  };
  if (!isObject(value) || !isObject(value.root) || !isObject(value.root.props) || !Array.isArray(value.content)) {
    return { ok: false, issues: [{ code: "invalid_document" }] };
  }
  if (value.content.length > MAX_BLOCKS) return { ok: false, issues: [{ code: "too_many_blocks" }] };
  if (Object.keys(value).some((key) => key !== "root" && key !== "content") ||
      Object.keys(value.root).some((key) => key !== "props") ||
      Object.keys(value.root.props).some((key) => key !== "_linkedStyles") ||
      (value.root.props._linkedStyles !== undefined && (!Array.isArray(value.root.props._linkedStyles) || value.root.props._linkedStyles.length !== 0))) {
    add("unsupported_root");
  }
  const content: AdminPageDoc["content"] = [];
  const seen = new Set<string>();
  let totalText = 0;
  value.content.forEach((block: unknown, index: number) => {
    const number = index + 1;
    if (!isObject(block) || typeof block.type !== "string" || !isObject(block.props) || Object.keys(block).some((key) => key !== "type" && key !== "props")) {
      add("invalid_block", number); return;
    }
    if (!has(schemas, block.type)) { add("unsupported_block", number); return; }
    const props = block.props;
    const rules = { ...common, ...schemas[block.type] };
    if (Object.keys(props).length > Object.keys(rules).length + 1) { add("invalid_property", number); return; }
    if (typeof props.id !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(props.id)) add("invalid_property", number, "id");
    else if (seen.has(props.id)) add("duplicate_id", number, "id");
    else seen.add(props.id);
    const clean: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(props)) {
      if (key === "_inspector") {
        if (!isObject(v) || Object.keys(v).length !== 0) add("unsupported_style", number, "_inspector");
        else clean._inspector = {};
        continue;
      }
      if (!has(rules, key) || typeof v !== "string") { add("invalid_property", number, key.slice(0, 40)); continue; }
      totalText += v.length;
      if (v.length > MAX_FIELD_LENGTH || hasControl(v)) { add("invalid_property", number, key); continue; }
      const rule = rules[key];
      if (Array.isArray(rule) && !rule.includes(v)) { add("invalid_property", number, key); continue; }
      if (rule === "plainRich" && !isPlainText(v)) { add("rich_text_unsupported", number, key); continue; }
      if (rule === "link" && !safeBuilderHref(v)) { add("unsafe_link", number, key); continue; }
      clean[key] = v;
    }
    content.push({ type: block.type, props: clean });
  });
  if (totalText > MAX_TEXT_LENGTH) add("size_limit");
  if (issues.length) return { ok: false, issues };
  return { ok: true, doc: { root: { props: value.root.props._linkedStyles === undefined ? {} : { _linkedStyles: [] } }, content }, issues: [] };
}
