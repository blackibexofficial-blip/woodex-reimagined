/**
 * Storefront-side read hook for the Pages builder (Wave 1):
 * fetches a page document by slug from the demo DB (or, later, Bagisto puck_data).
 * Any status renders — the LabPreview badge distinguishes published vs draft.
 */
import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";
import { isSupabaseMode } from "@/config/env";
import { getPublishedPage } from "@/api/supabase";
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
    getAdminApi()
      .getPage(slug)
      .then(async (doc) => {
        // Editors may preview drafts; everyone else receives the published snapshot only.
        const result = doc ?? (isSupabaseMode ? await getPublishedPage(slug) : undefined);
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
