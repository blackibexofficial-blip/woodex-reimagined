import type { AdminPageDoc, AdminPageSeo } from "@/api/types";
import { analyseSeo, extractBodyText, type SeoReport } from "./analyse";

/** The same advisory SEO analysis is used by both editor and list publishing.
 * This is a browser-side workflow check, not a database authorization boundary. */
export function analysePageSeo(doc: AdminPageDoc, seo: AdminPageSeo): SeoReport {
  const { bodyText, firstParagraph, h1Count } = extractBodyText(doc);
  return analyseSeo({
    title: seo.title ?? "",
    metaDescription: seo.description ?? "",
    focusKeyphrase: seo.focusKeyphrase ?? "",
    bodyText,
    firstParagraph,
    h1Count,
  });
}

export function seoPublishViolations(report: SeoReport, seo: AdminPageSeo): string[] {
  return [...report.blocked, ...(seo.noindex === true ? ["noindex is ON — flip it off in the SEO panel before going live."] : [])];
}

export function summarizeSeoViolations(violations: string[]): string {
  return violations.slice(0, 2).join(" ") + (violations.length > 2 ? ` (+${violations.length - 2} more)` : "");
}
