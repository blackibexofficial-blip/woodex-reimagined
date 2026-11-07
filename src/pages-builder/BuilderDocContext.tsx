/**
 * Builder document context (Wave 4): exposes the current page's linked-style rules
 * (and hm-* usage counts, for the root panel manager) to the storefront section /
 * element shells. The LAB preview is a normal React tree, so the merge works there —
 * in the editor canvas the context is usually absent and the shells fall back to the
 * element-level values only (documented limitation; the canvas still shows the result
 * for element styles).
 */
import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { LinkedStyleRule } from "./inspector";

export interface BuilderDocContextValue {
  linkedStyles: LinkedStyleRule[];
  counts?: Map<string, number>;
}

const Ctx = createContext<BuilderDocContextValue | undefined>(undefined);

export const BuilderDocProvider = ({ children, linkedStyles, counts }: { children: ReactNode; linkedStyles: LinkedStyleRule[]; counts?: Map<string, number> }) => (
  <Ctx.Provider value={{ linkedStyles, counts }}>{children}</Ctx.Provider>
);

/** Full context (rules + counts) — undefined when outside a provider. */
export const useBuilderDocContext = (): BuilderDocContextValue | undefined => useContext(Ctx);

/** Returns linked rules when a provider is present (LAB preview), else [] (editor canvas). */
export const useBuilderLinkedStyles = (): LinkedStyleRule[] => useContext(Ctx)?.linkedStyles ?? [];
