/**
 * Vendored from TailGrids (MIT © 2025 Tailgrids) — https://github.com/TailGrids/tailgrids
 * Token remap for WOODEX. Original: inline notice with icon + message.
 */
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TailgridsCallout({ children, tone = "info", className }: {
  children: React.ReactNode; tone?: "info" | "success"; className?: string;
}) {
  return (
    <div role="note" className={cn(
      "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-6",
      tone === "success" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-accent/30 bg-hon-green-pale/50 text-foreground",
      className,
    )}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
