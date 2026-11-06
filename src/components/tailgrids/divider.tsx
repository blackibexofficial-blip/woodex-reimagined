/**
 * Vendored from TailGrids (MIT © 2025 Tailgrids) — https://github.com/TailGrids/tailgrids
 * Token remap for WOODEX. Original: section divider with optional label.
 */
import { cn } from "@/lib/utils";

export default function TailgridsDivider({ label, className }: { label?: string; className?: string }) {
  if (!label) return <hr className={cn("border-border", className)} />;
  return (
    <div role="separator" aria-orientation="horizontal" className={cn("flex items-center gap-3", className)}>
      <span className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
