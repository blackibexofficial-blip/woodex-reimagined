import { useEffect, useId } from "react";

/**
 * Unsaved-changes guard for browser navigation (M5 PROD-007).
 *
 * The editors already refuse to close themselves while dirty, but a sidebar link or
 * a browser reload still threw the work away silently. React Router is mounted as a
 * plain `BrowserRouter` here (not a data router), so `useBlocker` is unavailable —
 * this hook installs one capture-phase click listener plus the `beforeunload`
 * warning, and each editor registers its own dirty flag.
 */

const DIRTY = new Map<string, string>();

function message(): string {
  for (const m of DIRTY.values()) return m;
  return "You have unsaved changes. Leave without saving?";
}

let installed = false;

function onClickCapture(event: MouseEvent) {
  if (DIRTY.size === 0) return;
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = event.target as Element | null;
  const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return;
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
  const href = anchor.getAttribute("href") ?? "";
  if (!href || href.startsWith("#")) return;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return;
  }
  // External links leave the app through the browser; `beforeunload` still covers them.
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
  if (!window.confirm(message())) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  // Only while an editor actually holds unsaved work: a permanent handler would
  // make every admin reload ask a pointless question.
  if (DIRTY.size === 0) return;
  event.preventDefault();
  event.returnValue = "";
}

function install() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  document.addEventListener("click", onClickCapture, true);
  window.addEventListener("beforeunload", onBeforeUnload);
}

/**
 * Register the editor's dirty flag. Call it unconditionally (hooks rule) and pass
 * whether the editor currently has unsaved work.
 */
export function useUnsavedChanges(isDirty: boolean, warning?: string) {
  const id = useId();
  useEffect(() => {
    install();
    if (isDirty) DIRTY.set(id, warning ?? "You have unsaved changes. Leave without saving?");
    else DIRTY.delete(id);
    return () => { DIRTY.delete(id); };
  }, [id, isDirty, warning]);
}

/** True while any mounted editor holds unsaved work (used by tests and the shell). */
export function hasUnsavedChanges(): boolean {
  return DIRTY.size > 0;
}
