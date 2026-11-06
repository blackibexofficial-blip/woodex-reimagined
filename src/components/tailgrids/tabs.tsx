/**
 * Vendored from TailGrids (MIT © 2025 Tailgrids) — https://github.com/TailGrids/tailgrids
 * Token remap for WOODEX (house tokens only; no Tailgrids palette). Structure kept;
 * keyboard/ARIA semantics preserved. Do not fork casually — re-sync from upstream if needed.
 */
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export interface TailgridsTab { id: string; label: string; content: React.ReactNode }

export default function TailgridsTabs({ tabs, className }: { tabs: TailgridsTab[]; className?: string }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const baseId = useId();
  if (!tabs.length) return null;
  return (
    <div className={className}>
      <div role="tablist" aria-label="Tabs" className="inline-flex rounded-lg border border-border bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`${baseId}-${tab.id}-tab`}
            aria-selected={active === tab.id}
            aria-controls={`${baseId}-${tab.id}-panel`}
            onClick={() => setActive(tab.id)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              active === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) =>
        active === tab.id ? (
          <div key={tab.id} role="tabpanel" id={`${baseId}-${tab.id}-panel`} aria-labelledby={`${baseId}-${tab.id}-tab`} className="mt-4">
            {tab.content}
          </div>
        ) : null,
      )}
    </div>
  );
}
