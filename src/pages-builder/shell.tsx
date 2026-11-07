/**
 * WOODEX builder — shared section/element infrastructure (Wave 2 + Wave 4).
 *
 * BuilderModeContext distinguishes the storefront render ("store") from the
 * Puck editor canvas ("editor"): hidden sections render `null` on the store,
 * a greyed placeholder in the editor.
 *
 * Wave 4: every wrapper merges the block's `_inspector` flat props (attached by
 * the catalogue/element factories as `inspector`) with any page-scoped linked
 * styles referenced by Advanced → Classes (`hm-*` tokens). Merge order is
 * linked < element — element-level always wins (legacy semantics). Hover and
 * heading colours ride on CSS custom properties (see builder.css cascade
 * islands), so no stylesheet injection is needed.
 */
import { createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import { EyeOff, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  inspectorToClasses,
  inspectorToVars,
  linkedDeclarations,
  linkedRulesForBlock,
  normalizeInspector,
} from "./inspector";
import { useBuilderLinkedStyles } from "./BuilderDocContext";

export type BuilderMode = "store" | "editor";
export const BuilderModeContext = createContext<BuilderMode>("store");

export type InsertFn = (type: string) => void;
export const LibraryActionsContext = createContext<{ insert: InsertFn } | null>(null);

/** Radio-pair field config for canvas layer controls. */
export const commonLayerFields = {
  hidden: { type: "radio" as const, label: "Visibility", options: [{ label: "Visible on storefront", value: "visible" }, { label: "Hidden on storefront", value: "hidden" }] },
  locked: { type: "radio" as const, label: "Editing lock", options: [{ label: "Unlocked", value: "unlocked" }, { label: "Locked — no edits", value: "locked" }] },
};

/** Defaults matching `commonLayerFields` (string radio pairs). */
export const commonLayerDefaults = {
  hidden: "visible" as const,
  locked: "unlocked" as const,
};

export const isHidden = (v?: string) => v === "hidden";
export const isLocked = (v?: string) => v === "locked";

/** Dynamic permissions: a locked block is inert until unlocked (native Puck enforcement). */
export const resolveLayerPermissions = (data: { props?: Record<string, unknown> }) =>
  isLocked(data?.props?.locked as string | undefined)
    ? { drag: false, duplicate: false, delete: false, edit: false, insert: false }
    : {};

const TAGS = new Set(["section", "div", "article", "aside", "header", "main"]);

/**
 * Build the wrapper props for a block: classes, inline style (linked < element),
 * data attributes and Advanced attrs. Single injection point shared by both shells.
 */
export function useWrapperProps(inspectorRaw: unknown, extraClasses?: string) {
  const linkedStyles = useBuilderLinkedStyles();
  const value = normalizeInspector(inspectorRaw);
  const linkedDecls = linkedDeclarations(linkedRulesForBlock(linkedStyles, value.classes));
  const { style, hoverVars } = inspectorToVars(value);

  const classes: string[] = [...inspectorToClasses(value)];
  if (value.classes) classes.push(...value.classes.split(/\s+/).filter(Boolean));
  if (extraClasses) classes.push(extraClasses);
  if (value.bgHover) classes.push("bx-has-bg-hover");
  if (value.textColorHover) classes.push("bx-has-color-hover");
  if (value.headingColor || linkedDecls.headingColor) classes.push("bx-has-heading-color");
  if (value.headingColorHover) classes.push("bx-has-heading-hover");

  const merged: Record<string, string> = {};
  const bg = style.background ?? linkedDecls.background;
  if (bg) merged.background = bg;
  const color = style.color ?? linkedDecls.color;
  if (color) merged.color = color;
  if (linkedDecls.padding) merged.padding = linkedDecls.padding;
  if (linkedDecls.radius) merged.borderRadius = linkedDecls.radius;
  Object.assign(merged, hoverVars);
  if (value.headingColor) merged["--bx-heading-color"] = value.headingColor;
  else if (linkedDecls.headingColor) merged["--bx-heading-color"] = linkedDecls.headingColor;

  const attrs: Record<string, string> = {};
  if (value.anchorId) attrs.id = value.anchorId;
  if (value.title) attrs.title = value.title;
  if (value.aria) attrs["aria-label"] = value.aria;
  if (value.animate && value.animate !== "none") attrs["data-animate"] = value.animate;

  return { classes: classes.join(" "), style: merged as CSSProperties, attrs, value };
}

/** Shell for sections: hidden handling + locked badge + Wave 4 inspector wrapper. */
export function SectionShell({ hidden, locked, children, className, label, inspector }: {
  hidden?: string;
  locked?: string;
  children?: ReactNode;
  className?: string;
  label?: string;
  inspector?: unknown;
}) {
  const mode = useContext(BuilderModeContext);
  const wrapper = useWrapperProps(inspector, className);
  const hiddenOn = isHidden(hidden);
  if (hiddenOn && mode === "store") return null;

  const Tag = TAGS.has(wrapper.value.tag ?? "") && wrapper.value.tag !== "section" ? (wrapper.value.tag as "div") : "section";
  const classNameMerged = cn(wrapper.classes);
  const placeholderClasses = cn("relative border-y border-dashed border-amber-400/60 opacity-60", wrapper.classes);

  if (!hiddenOn) {
    return <Tag className={classNameMerged} style={wrapper.style} {...wrapper.attrs}>{children}</Tag>;
  }
  // Editor: greyed placeholder so structure stays visible while editing stays possible.
  return (
    <Tag className={placeholderClasses} style={wrapper.style} {...wrapper.attrs} aria-label="Hidden on storefront">
      <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
        <EyeOff className="h-3 w-3" /> Hidden on storefront{label ? ` · ${label}` : ""}
      </div>
      <div className="pointer-events-none grayscale">{children}</div>
    </Tag>
  );
}

/** Shell for elements: store renders null when hidden; editor renders a compact chip.
 *  Elements always get a wrapper so classes/Advanced attrs/animation land — it is
 *  `contents` (layout-transparent) unless an animation is requested, in which case the
 *  wrapper must render a box for the keyframes to apply. */
export function ElementShell({ hidden, locked, children, label, inspector }: {
  hidden?: string;
  locked?: string;
  children?: ReactNode;
  label?: string;
  inspector?: unknown;
}) {
  const mode = useContext(BuilderModeContext);
  const wrapper = useWrapperProps(inspector);
  if (isHidden(hidden)) {
    if (mode === "store") return null;
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-2 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
          <EyeOff className="h-3 w-3" /> {label ?? "Element"} hidden on storefront
        </span>
      </div>
    );
  }
  const animated = Boolean(wrapper.attrs["data-animate"]);
  const Wrapper = animated ? "span" : "div";
  const wrapperClass = cn(animated ? "inline-block" : "contents", wrapper.classes);
  if (isLocked(locked)) {
    return (
      <Wrapper className={wrapperClass} style={wrapper.style} {...wrapper.attrs}>
        <span className="relative inline-block">
          {children}
          <span className="absolute -right-2 -top-2 rounded-full border border-border bg-card p-1 shadow-sm" title="Locked — no edits">
            <Lock className="h-3 w-3 text-muted-foreground" />
          </span>
        </span>
      </Wrapper>
    );
  }
  return <Wrapper className={wrapperClass} style={wrapper.style} {...wrapper.attrs}>{children}</Wrapper>;
}
