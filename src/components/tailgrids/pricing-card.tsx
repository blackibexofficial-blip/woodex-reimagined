/**
 * Vendored from TailGrids (MIT © 2025 Tailgrids) — https://github.com/TailGrids/tailgrids
 * Token remap for WOODEX. Original: pricing card with plan name, price, feature list and CTA.
 */
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TailgridsPricingCard({
  name, price, blurb, features, ctaLabel = "Get started", ctaHref = "/contact", featured = false, className,
}: {
  name: string; price: string; blurb?: string; features: string[]; ctaLabel?: string; ctaHref?: string; featured?: boolean; className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col rounded-2xl border bg-card p-6", featured ? "border-accent shadow-md" : "border-border", className)}>
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{name}</p>
      <p className="mt-2 text-3xl font-extrabold">{price}</p>
      {blurb ? <p className="mt-1 text-xs text-muted-foreground">{blurb}</p> : null}
      <ul className="mt-4 space-y-2 text-sm">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{f}</li>
        ))}
      </ul>
      <Button asChild className={cn("mt-6", featured && "bg-accent text-accent-foreground hover:bg-hon-green-dark")} variant={featured ? "default" : "outline"}>
        <a href={ctaHref}>{ctaLabel}</a>
      </Button>
    </div>
  );
}
