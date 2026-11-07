import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Render } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { FileQuestion, Pencil } from "lucide-react";
import { woodexConfig } from "./blocks";
import "./builder.css";
import { BuilderDocProvider } from "./BuilderDocContext";
import { normalizeLinkedStyles, scanHmTokens } from "./inspector";
import { usePagePreview } from "@/lib/usePages";
import type { AdminPageDoc } from "@/api/types";

/**
 * Storefront preview of a Pages-workspace document (Wave 1).
 * Renders any page by slug — published or draft (the badge says which).
 * noindex; meant for owner review, not public linking. Builder page chrome
 * (header/footer) arrives with the linked-master chrome in Wave 4.
 */
const toPuckData = (doc: AdminPageDoc): Data => doc as unknown as Data;

const LabPreview = () => {
  const { slug } = useParams<{ slug: string }>();
  const { page, ready } = usePagePreview(slug);

  useEffect(() => {
    document.title = page ? `Preview — ${page.title} · WOODEX` : "Pages preview — WOODEX";
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    const previous = meta.getAttribute("content");
    meta.setAttribute("content", "noindex,nofollow");
    return () => {
      if (previous) meta.setAttribute("content", previous);
      else meta.remove();
    };
  }, [page]);

  // Canonical + Open Graph/Twitter card + JSON-LD (Wave 5 · PB-5).
  // BreadcrumbList always; FAQPage when the document contains a FaqAccordion block.
  // Builder pages are noindex until they ship on a public route (Bagisto wave) —
  // these tags are harmless on preview and correct the moment a public URL exists.
  useEffect(() => {
    if (!page) return;
    const created: HTMLElement[] = [];
    const origin = window.location.origin;
    const canonical = `${origin}/lab/${page.slug}`;
    const seoTitle = page.seo?.title?.trim() || page.title;
    const seoDesc = page.seo?.description?.trim() || "";
    const ogImage = `${origin}/og-cover.jpg`;
    const add = (el: HTMLElement) => { document.head.appendChild(el); created.push(el); };
    const addMeta = (attr: "name" | "property", key: string, content: string) => {
      if (!content) return;
      const meta = document.createElement("meta");
      meta.setAttribute(attr, key);
      meta.setAttribute("content", content);
      add(meta);
    };

    const canonicalLink = document.createElement("link");
    canonicalLink.rel = "canonical";
    canonicalLink.href = canonical;
    add(canonicalLink);

    addMeta("property", "og:site_name", "WOODEX");
    addMeta("property", "og:type", "website");
    addMeta("property", "og:url", canonical);
    addMeta("property", "og:title", seoTitle);
    addMeta("property", "og:description", seoDesc);
    addMeta("property", "og:image", ogImage);
    addMeta("property", "og:image:alt", "WOODEX — office furniture manufacturer, Lahore");
    if (page.status === "published" && page.publishedAt) addMeta("property", "article:published_time", page.publishedAt);
    addMeta("name", "twitter:card", "summary_large_image");
    addMeta("name", "twitter:title", seoTitle);
    addMeta("name", "twitter:description", seoDesc);
    addMeta("name", "twitter:image", ogImage);

    const plain = (v: unknown) => String(v ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const addJsonLd = (obj: Record<string, unknown>) => {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(obj);
      add(script);
    };

    addJsonLd({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: page.title, item: canonical },
      ],
    });

    const faqItems: Array<{ q: string; a: string }> = [];
    for (const block of page.doc?.content ?? []) {
      if (block?.type !== "FaqAccordion") continue;
      const items = (block.props as { items?: Array<{ q?: string; a?: string }> } | undefined)?.items ?? [];
      for (const item of items) {
        const q = plain(item?.q);
        const a = plain(item?.a);
        if (q && a) faqItems.push({ q, a });
      }
    }
    if (faqItems.length > 0) {
      addJsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqItems.slice(0, 10).map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      });
    }

    return () => { for (const el of created) el.remove(); };
  }, [page]);

  const published = page?.status === "published";
  const linkedStyles = normalizeLinkedStyles(
    (page?.doc as { root?: { props?: Record<string, unknown> } } | undefined)?.root?.props?._linkedStyles,
  );
  const hmCounts = scanHmTokens((page?.doc as { content?: unknown[] } | undefined)?.content);

  return (
    <div className="min-h-screen bg-background">
      <div
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-lg ${
          published
            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
            : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
      >
        {published ? "PUBLISHED — from the Pages workspace" : "DRAFT — not published, owner preview"}
        <Link to="/admin/pages" className="inline-flex items-center gap-1 underline underline-offset-2 hover:opacity-80">
          <Pencil className="h-3.5 w-3.5" /> edit
        </Link>
      </div>

      {!ready ? (
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">Loading page…</div>
      ) : page ? (
        <BuilderDocProvider linkedStyles={linkedStyles} counts={hmCounts}>
          <Render config={woodexConfig} data={toPuckData(page.doc)} />
        </BuilderDocProvider>
      ) : (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <FileQuestion className="h-10 w-10 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Page not found</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              No builder page with slug <code className="rounded bg-muted px-1.5 py-0.5">{slug}</code> exists yet.
            </p>
          </div>
          <Link
            to="/admin/pages"
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Open the Pages workspace
          </Link>
        </div>
      )}
    </div>
  );
};

export default LabPreview;
