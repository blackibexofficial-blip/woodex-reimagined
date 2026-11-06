import { useMemo, useState } from "react";
import { Hammer, ExternalLink } from "lucide-react";
import { Puck } from "@puckeditor/core";
import "@/pages-builder/puck-editor.css";
import type { Data } from "@puckeditor/core";
import { toast } from "sonner";
import { woodexConfig } from "@/pages-builder/blocks";
import { LAB_DEFAULT_SLUG, labHomeStarter, readLabPage, writeLabPage } from "@/pages-builder/starter";

/**
 * Pages Lab (SPIKE — page-builder master plan Wave 0).
 *
 * Drag-and-drop editing of a storefront page built from real WOODEX blocks.
 * Persistence is deliberately local: this browser's localStorage only — the
 * demo-DB pages bundle, draft/publish flow, versioning and the theme blocks
 * (header/footer/announcement) all land in later waves. See
 * docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.
 */
export default function AdminPagesLab() {
  const [data, setData] = useState<Data>(() => readLabPage(LAB_DEFAULT_SLUG) ?? labHomeStarter);
  const previewHref = `/lab/${LAB_DEFAULT_SLUG}`;

  const banner = useMemo(
    () => (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
        <span className="flex items-center gap-2">
          <Hammer className="h-4 w-4 shrink-0" />
          <span>
            <strong>Spike — not wired to the site.</strong> Edits persist only in this browser. Publishing, versioning,
            theme blocks and Bagisto mapping are planned in the page-builder master plan.
          </span>
        </span>
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1.5 font-semibold text-amber-900 transition hover:bg-amber-100"
        >
          Open storefront preview
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    ),
    [previewHref],
  );

  return (
    <div className="flex h-[calc(100vh-9.5rem)] min-h-[560px] flex-col gap-3">
      {banner}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border shadow-sm">
        <Puck
          config={woodexConfig}
          data={data}
          onChange={setData}
          onPublish={(d) => {
            try {
              writeLabPage(LAB_DEFAULT_SLUG, d);
              toast.success("Lab page saved — visible at /lab/home in this browser.");
            } catch {
              toast.error("Could not save the lab page (localStorage full?).");
            }
          }}
        />
      </div>
    </div>
  );
}
