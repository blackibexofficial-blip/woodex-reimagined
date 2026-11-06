/**
 * Vendored from TailGrids (MIT © 2025 Tailgrids) — https://github.com/TailGrids/tailgrids
 * Token remap for WOODEX. Original: stat tile with value, label and optional delta chip.
 */
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TailgridsStatsCard({ value, label, delta, className }: {
  value: string; label: string; delta?: string; className?: string;
}) {
  const positive = delta ? !delta.trim().startsWith("-") : true;
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-2xl font-extrabold tabular-nums">{value}</p>
        {delta ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", positive ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>
            {positive ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
            {delta}
          </span>
        ) : null}
      </div>
    </div>
  );
}
