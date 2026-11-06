/**
 * WOODEX builder — shared section/element infrastructure (Wave 2).
 *
 * - BuilderModeContext distinguishes the storefront render ("store") from the
 *   Puck editor canvas ("editor"): hidden sections render `null` on the store,
 *   a greyed placeholder in the editor.
 * - Every catalogued block gets custom field metadata (hidden/locked) and a
 *   dynamic `resolvePermissions` so a locked block cannot be edited, dragged,
 *   duplicated or deleted until unlocked.
 */
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { EyeOff, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type BuilderMode = "store" | "editor";
export const BuilderModeContext = createContext<BuilderMode>("store");

export type InsertFn = (type: string) => void;
export const LibraryActionsContext = createContext<{ insert: InsertFn } | null>(null);

/** Checkbox field config for a catalogued block, spread into `fields`. */
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

/** Shell for sections: hidden handling + locked badge. */
export function SectionShell({ hidden, locked, children, className, label }: {
  hidden?: string;
  locked?: string;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const mode = useContext(BuilderModeContext);
  const hiddenOn = isHidden(hidden);
  if (hiddenOn && mode === "store") return null;
  if (!hiddenOn) return <section className={className}>{children}</section>;
  // Editor: greyed placeholder so structure stays visible while editing stays possible.
  return (
    <section className={cn("relative border-y border-dashed border-amber-400/60 opacity-60", className)} aria-label="Hidden on storefront">
      <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
        <EyeOff className="h-3 w-3" /> Hidden on storefront{label ? ` · ${label}` : ""}
      </div>
      <div className="pointer-events-none grayscale">{children}</div>
    </section>
  );
}

/** Shell for elements: store renders null when hidden; editor renders a compact chip. */
export function ElementShell({ hidden, locked, children, label }: {
  hidden?: string;
  locked?: string;
  children?: ReactNode;
  label?: string;
}) {
  const mode = useContext(BuilderModeContext);
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
  if (isLocked(locked)) {
    return (
      <div className="relative inline-block">
        {children}
        <span className="absolute -right-2 -top-2 rounded-full border border-border bg-card p-1 shadow-sm" title="Locked — no edits">
          <Lock className="h-3 w-3 text-muted-foreground" />
        </span>
      </div>
    );
  }
  return <>{children}</>;
}
