import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Render } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { FileQuestion, Pencil } from "lucide-react";
import { woodexConfig } from "./blocks";
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

  const published = page?.status === "published";

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
        <Render config={woodexConfig} data={toPuckData(page.doc)} />
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
