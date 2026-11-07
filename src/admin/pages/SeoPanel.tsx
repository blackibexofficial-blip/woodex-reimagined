import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, SearchCheck, ShieldCheck } from "lucide-react";
import type { AdminPageSeo } from "@/api/types";
import type { SeoReport, SeoSeverity } from "@/lib/seo/analyse";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Wave 5 · PB-5 — Pages SEO & readability panel.
 *
 * Fully local Yoast-style analysis (no network, no keys): live title/meta counters,
 * focus keyphrase, breadcrumb URL + Google SERP preview, red/amber/green checks,
 * SEO + readability badges and the configurable publish gate state. Edits land in
 * local state upstream and persist with the page on "Save draft" — the panel is a
 * pure view over them plus the shared `report` computed in the editor.
 */

export interface SeoPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  host: string;
  seo: AdminPageSeo;
  onSeoChange: (patch: Partial<AdminPageSeo>) => void;
  report: SeoReport;
  pageTitle: string;
}

const severityDot: Record<SeoSeverity, string> = {
  good: "bg-emerald-500",
  ok: "bg-amber-400",
  bad: "bg-red-500",
};
const severityText: Record<SeoSeverity, string> = {
  good: "text-emerald-700",
  ok: "text-amber-700",
  bad: "text-red-700",
};
const ratingBadge: Record<SeoSeverity, string> = {
  good: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ok: "bg-amber-100 text-amber-800 border-amber-200",
  bad: "bg-red-100 text-red-800 border-red-200",
};

const counterClass = (len: number, soft: number, hard: number) =>
  len === 0 ? "text-muted-foreground" : len <= soft ? "text-emerald-700" : len <= hard ? "text-amber-700" : "text-red-700";

const ratingLabel = (r: SeoSeverity) => (r === "good" ? "good" : r === "ok" ? "ok-ish" : "poor");

export default function SeoPanel({ open, onOpenChange, slug, host, seo, onSeoChange, report, pageTitle }: SeoPanelProps) {
  const serpTitle = (seo.title ?? "").trim() || pageTitle.trim() || "Untitled page";
  const serpDesc = (seo.description ?? "").trim() || "No meta description yet — Google will pick an excerpt from the page.";
  const serpHref = `${host.replace(/\/+$/, "")}/lab/${slug}`;
  const breadcrumb = ["Pakistan", "Pages", slug];
  const titleOk = (seo.title ?? "").trim().length;
  const metaLen = (seo.description ?? "").trim().length;
  const g = report.checks.filter((c) => c.severity === "good").length;
  const amber = report.checks.filter((c) => c.severity === "ok").length;
  const red = report.checks.filter((c) => c.severity === "bad").length;
  const strict = seo.strictGate !== false;
  const noindex = seo.noindex === true;
  const gateViolations = useMemo(
    () => [...report.blocked, ...(noindex ? ["noindex is ON — search engines will not index this page."] : [])],
    [report.blocked, noindex],
  );
  const [analysedAt, setAnalysedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (open) setAnalysedAt(new Date());
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <SheetHeader className="space-y-0 border-b border-border px-5 pb-3 pt-4 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <SearchCheck className="h-5 w-5 text-accent" /> SEO &amp; readability
          </SheetTitle>
          <SheetDescription className="text-xs">
            Local analysis, nothing leaves your browser. Saved with the page on <span className="font-semibold">Save draft</span>.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Breadcrumb URL preview */}
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">URL preview</p>
            <p className="mt-1 truncate text-xs text-emerald-800">
              {serpHref}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {breadcrumb[0]} › <span className="text-foreground">{breadcrumb[1]}</span> › <span className="text-foreground">{breadcrumb[2]}</span>
            </p>
          </div>

          {/* SERP preview */}
          <div className="rounded-lg border border-border bg-white px-4 py-3 shadow-sm dark:bg-card">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Google preview</p>
            <p className="mt-1 text-[15px] font-medium leading-snug text-[#1a0dab]">{serpTitle.length > 60 ? `${serpTitle.slice(0, 57)}…` : serpTitle}</p>
            <p className="text-xs leading-snug text-[#006621]">{serpHref}</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#4d5156]">{serpDesc}</p>
          </div>

          {/* Focus keyphrase */}
          <div className="space-y-1.5">
            <label htmlFor="seo-keyphrase" className="text-xs font-semibold">Focus keyphrase</label>
            <Input
              id="seo-keyphrase"
              value={seo.focusKeyphrase ?? ""}
              placeholder="e.g. office furniture"
              onChange={(e) => onSeoChange({ focusKeyphrase: e.target.value })}
              aria-describedby="seo-keyphrase-help"
            />
            <p id="seo-keyphrase-help" className="text-[11px] text-muted-foreground">The phrase this page should rank for. Analysed live against title, description, intro and body.</p>
          </div>

          {/* SEO title */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="seo-title" className="text-xs font-semibold">SEO title</label>
              <span className={cn("font-mono text-[11px] font-medium", counterClass(titleOk, 60, 70))}>{titleOk}/60</span>
            </div>
            <Input id="seo-title" value={seo.title ?? ""} placeholder={pageTitle.trim() ? `${pageTitle.trim()} (fallback)` : "60 characters max"} onChange={(e) => onSeoChange({ title: e.target.value })} />
          </div>

          {/* Meta description */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="seo-description" className="text-xs font-semibold">Meta description</label>
              <span className={cn("font-mono text-[11px] font-medium", counterClass(metaLen, 160, 200))}>{metaLen}/160</span>
            </div>
            <Textarea id="seo-description" value={seo.description ?? ""} placeholder="120–160 characters. Say what the page offers and end with a reason to click." rows={3} onChange={(e) => onSeoChange({ description: e.target.value })} />
          </div>

          {/* Scores */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("border px-2.5 py-1 text-[11px] font-semibold", ratingBadge[report.seoRating])}>
              SEO {report.seoScore} · {ratingLabel(report.seoRating)}
            </Badge>
            <Badge variant="outline" className={cn("border px-2.5 py-1 text-[11px] font-semibold", ratingBadge[report.readabilityRating])}>
              Readability {report.readabilityScore} · Flesch {report.flesch}
            </Badge>
            <span className="ml-auto text-[10px] text-muted-foreground">{report.wordCount} words · {g} green / {amber} amber / {red} red</span>
          </div>

          {/* Checks */}
          <div className="rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Analysis</p>
              <button
                type="button"
                onClick={() => setAnalysedAt(new Date())}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
              >
                <RefreshCw className="h-3 w-3" /> Analyse{analysedAt ? ` · ${analysedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
              </button>
            </div>
            <ul className="divide-y divide-border">
              {report.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2.5 px-3 py-2">
                  <span aria-hidden className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", severityDot[check.severity])} />
                  <div className="min-w-0">
                    <p className={cn("text-xs font-medium", severityText[check.severity])}>{check.label}</p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{check.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Publish readiness + gate switches */}
          <div className={cn("rounded-xl border px-3 py-2.5", gateViolations.length > 0 ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50")}>
            <div className="flex items-center gap-2">
              {gateViolations.length > 0 ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <ShieldCheck className="h-4 w-4 text-emerald-600" />}
              <p className={cn("text-xs font-semibold", gateViolations.length > 0 ? "text-red-800" : "text-emerald-800")}>
                {gateViolations.length > 0 ? "Not ready to publish" : "Ready to publish"}
              </p>
            </div>
            {gateViolations.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-1 pl-6 text-[11px] text-red-800">
                {gateViolations.map((violation) => <li key={violation}>{violation}</li>)}
              </ul>
            )}
            <div className="mt-3 space-y-3 border-t border-current/10 pt-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label htmlFor="seo-noindex" className="text-xs font-medium">noindex this page</label>
                  <p className="text-[10px] text-muted-foreground">Kept ON while the page is unfinished — blocks publishing when the strict gate is on.</p>
                </div>
                <Switch id="seo-noindex" checked={noindex} onCheckedChange={(v) => onSeoChange({ noindex: v })} aria-label="noindex this page" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label htmlFor="seo-strict-gate" className="text-xs font-medium">Block publish until SEO is ready</label>
                  <p className="text-[10px] text-muted-foreground">Recommended ON. When off, publishing proceeds with a confirmation instead.</p>
                </div>
                <Switch id="seo-strict-gate" checked={strict} onCheckedChange={(v) => onSeoChange({ strictGate: v })} aria-label="Block publish until SEO is ready" />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-2.5">
          <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenChange(false)}>Done — keep editing</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
