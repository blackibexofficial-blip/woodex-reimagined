/**
 * WOODEX builder — Wave 4 inspector: shared types + pure computation helpers.
 *
 * Element-level controls write flat `_inspector` props on each block:
 *   padding/radius/border/textAlign — per device (`desktop|tablet|mobile`), applied
 *     via static classes (see builder.css) so storefront + canvas share one source
 *   bg/textColor/headingColor — hex inline styles per device base (desktop/tablet/mobile),
 *     with an optional `hover` value wired through CSS custom properties
 *   Advanced — tag (sections only), id, title, aria-label, classes, hide chips, animation
 *
 * Linked styles ("element-only vs All .hm-name on this page (N)") live on the page root
 * (`root.props._linkedStyles`) and are merged UNDER the element-level values — element
 * overrides linked, exactly like the legacy panel. The merge happens per wrapper (no
 * stylesheet injection), so the editor canvas and the storefront share the same behaviour.
 */

export type Device = "desktop" | "tablet" | "mobile";
export type HoverState = "normal" | "hover";
export const DEVICES: Device[] = ["desktop", "tablet", "mobile"];

export interface LinkedStyleRule {
  id: string;
  /** Chip token, convention `hm-<name>` — blocks opt in by carrying it in Advanced classes. */
  name: string;
  declarations: {
    background?: string;
    color?: string;
    headingColor?: string;
    padding?: string;
    radius?: string;
  };
}

export interface InspectorValue {
  paddingDesktop?: string;
  paddingTablet?: string;
  paddingMobile?: string;
  radiusDesktop?: string;
  radiusTablet?: string;
  radiusMobile?: string;
  borderDesktop?: string;
  borderTablet?: string;
  borderMobile?: string;
  alignDesktop?: string;
  alignTablet?: string;
  alignMobile?: string;
  bg?: string;
  bgHover?: string;
  textColor?: string;
  textColorHover?: string;
  headingColor?: string;
  headingColorHover?: string;
  tag?: string;
  anchorId?: string;
  title?: string;
  aria?: string;
  classes?: string;
  hideDesktop?: boolean;
  hideTablet?: boolean;
  hideMobile?: boolean;
  animate?: string;
}

export const EMPTY_INSPECTOR: InspectorValue = {};

export const normalizeInspector = (v: unknown): InspectorValue => {
  const src = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const str = (k: string) => (typeof src[k] === "string" ? (src[k] as string) : undefined);
  const bool = (k: string) => (typeof src[k] === "boolean" ? (src[k] as boolean) : undefined);
  return {
    paddingDesktop: str("paddingDesktop"), paddingTablet: str("paddingTablet"), paddingMobile: str("paddingMobile"),
    radiusDesktop: str("radiusDesktop"), radiusTablet: str("radiusTablet"), radiusMobile: str("radiusMobile"),
    borderDesktop: str("borderDesktop"), borderTablet: str("borderTablet"), borderMobile: str("borderMobile"),
    alignDesktop: str("alignDesktop"), alignTablet: str("alignTablet"), alignMobile: str("alignMobile"),
    bg: str("bg"), bgHover: str("bgHover"),
    textColor: str("textColor"), textColorHover: str("textColorHover"),
    headingColor: str("headingColor"), headingColorHover: str("headingColorHover"),
    tag: str("tag"), anchorId: str("anchorId"), title: str("title"), aria: str("aria"), classes: str("classes"),
    hideDesktop: bool("hideDesktop"), hideTablet: bool("hideTablet"), hideMobile: bool("hideMobile"),
    animate: str("animate"),
  };
};

export const normalizeLinkedStyles = (v: unknown): LinkedStyleRule[] => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: LinkedStyleRule[] = [];
  for (const raw of v as Array<Record<string, unknown>>) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.slice(0, 48) : `ls-${out.length + 1}`;
    const name = typeof raw.name === "string" ? raw.name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const decls = raw.declarations && typeof raw.declarations === "object" ? (raw.declarations as Record<string, unknown>) : {};
    out.push({
      id,
      name,
      declarations: {
        background: typeof decls.background === "string" && decls.background.trim() ? decls.background.trim().slice(0, 40) : undefined,
        color: typeof decls.color === "string" && decls.color.trim() ? decls.color.trim().slice(0, 40) : undefined,
        headingColor: typeof decls.headingColor === "string" && decls.headingColor.trim() ? decls.headingColor.trim().slice(0, 40) : undefined,
        padding: typeof decls.padding === "string" && decls.padding.trim() ? decls.padding.trim() : undefined,
        radius: typeof decls.radius === "string" && decls.radius.trim() ? decls.radius.trim() : undefined,
      },
    });
  }
  return out;
};

export const hmTokenRe = /hm-[a-z0-9-]+/gi;

/** Count every `hm-*` token referenced by a block's props (whole-string scan, safe). */
export const hmTokensInBlock = (block: unknown): Set<string> => {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === "string") {
      const hits = v.match(hmTokenRe);
      if (hits) for (const h of hits) found.add(h.toLowerCase());
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === "object") for (const k of Object.keys(v as Record<string, unknown>)) walk((v as Record<string, unknown>)[k]);
  };
  walk(block);
  return found;
};

/** Count hm-* usage across the whole document, matched per rule name. */
export const scanHmTokens = (content: unknown[] | undefined): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const block of content ?? []) {
    for (const token of hmTokensInBlock(block)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
};

const deviceClass = (base: string | undefined, tablet: string | undefined, mobile: string | undefined): string[] => {
  const classes: string[] = [];
  if (base) classes.push(`bx-${base}-d`);
  if (tablet) classes.push(`bx-${tablet}-t`);
  if (mobile) classes.push(`bx-${mobile}-m`);
  return classes;
};

/** Static (builder.css) class list for the wrapper element. */
export const inspectorToClasses = (v: InspectorValue): string[] => {
  const classes: string[] = [...deviceClass(v.paddingDesktop, v.paddingTablet, v.paddingMobile)]
    .concat(deviceClass(v.radiusDesktop ? `radius-${v.radiusDesktop}` : undefined, v.radiusTablet ? `radius-${v.radiusTablet}` : undefined, v.radiusMobile ? `radius-${v.radiusMobile}` : undefined))
    .concat(deviceClass(v.borderDesktop ? `border-${v.borderDesktop}` : undefined, v.borderTablet ? `border-${v.borderTablet}` : undefined, v.borderMobile ? `border-${v.borderMobile}` : undefined))
    .concat(deviceClass(v.alignDesktop ? `align-${v.alignDesktop}` : undefined, v.alignTablet ? `align-${v.alignTablet}` : undefined, v.alignMobile ? `align-${v.alignMobile}` : undefined));
  if (v.hideDesktop) classes.push("bx-hide-d");
  if (v.hideTablet) classes.push("bx-hide-t");
  if (v.hideMobile) classes.push("bx-hide-m");
  return classes;
};

export interface InspectorStyleVars {
  style: Record<string, string>;
  hoverVars: Record<string, string>;
}

/** Inline style + CSS vars for the wrapper (element level; linked merges under this). */
export const inspectorToVars = (v: InspectorValue): InspectorStyleVars => {
  const style: Record<string, string> = {};
  const hoverVars: Record<string, string> = {};
  if (v.bg) style.background = v.bg;
  if (v.bgHover) hoverVars["--bx-bg-hover"] = v.bgHover;
  if (v.textColor) style.color = v.textColor;
  if (v.textColorHover) hoverVars["--bx-color-hover"] = v.textColorHover;
  if (v.headingColor) hoverVars["--bx-heading-color"] = v.headingColor;
  if (v.headingColorHover) hoverVars["--bx-heading-hover"] = v.headingColorHover;
  return { style, hoverVars };
};

export const classesCarry = (classes: string | undefined, name: string): boolean =>
  (classes ?? "").toLowerCase().split(/\s+/).filter(Boolean).includes(name.toLowerCase());

/** Linked rules targeting this block (by Advanced classes token), in order. */
export const linkedRulesForBlock = (rules: LinkedStyleRule[], classes: string | undefined): LinkedStyleRule[] =>
  rules.filter((r) => classesCarry(classes, r.name));

/** Declarations of linked rules, in application order — merged UNDER element style. */
export const linkedDeclarations = (rules: LinkedStyleRule[]): { background?: string; color?: string; headingColor?: string; padding?: string; radius?: string } => {
  const out: { background?: string; color?: string; headingColor?: string; padding?: string; radius?: string } = {};
  for (const rule of rules) {
    if (rule.declarations.background) out.background = rule.declarations.background;
    if (rule.declarations.color) out.color = rule.declarations.color;
    if (rule.declarations.headingColor) out.headingColor = rule.declarations.headingColor;
    if (rule.declarations.padding) out.padding = rule.declarations.padding;
    if (rule.declarations.radius) out.radius = rule.declarations.radius;
  }
  return out;
};
