/**
 * Storefront-side read hook for the Pages builder (Wave 1).
 *
 * Supabase mode: staff read the draft through `page_preview` (00036, `page.manage`
 * only) and everyone else falls back to `published_page`, which serves the immutable
 * snapshot. Demo mode: the local store stands in for both.
 * The LabPreview badge says which one you are looking at.
 */
import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";
import { isSupabaseMode } from "@/config/env";
import { getPagePreview, getPublishedPage } from "@/api/supabase";
import type { AdminPage } from "@/api/types";

export function usePagePreview(slug: string | undefined): { page: AdminPage | null; ready: boolean } {
  const [page, setPage] = useState<AdminPage | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let on = true;
    setReady(false);
    if (!slug) {
      setPage(null);
      setReady(true);
      return () => {
        on = false;
      };
    }
    const load = async () => {
      if (isSupabaseMode) {
        // Staff preview the draft through page_preview (00036); anyone else can only
        // ever read the published snapshot. Both paths are server-enforced.
        const draft = await getPagePreview(slug).catch(() => undefined);
        return draft ?? (await getPublishedPage(slug));
      }
      return getAdminApi().getPage(slug);
    };
    load()
      .then((result) => {
        if (on) setPage(result ?? null);
      })
      .catch(() => {
        if (on) setPage(null); // demo seed absent / bagisto 501 — treated as "no page"
      })
      .finally(() => {
        if (on) setReady(true);
      });
    return () => {
      on = false;
    };
  }, [slug]);

  return { page, ready };
}
