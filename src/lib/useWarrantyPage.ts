import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";
import type { AdminWarrantyPage } from "@/api/types";
import { warrantyPageSeed } from "@/data/warrantyPage";

/**
 * Warranty policy page content (B2): admin-managed demo DB singleton when seeded,
 * otherwise the bundled seed (identical to the old hardcoded /warranty copy).
 * `ready` flips once the live query settles.
 */
export function useWarrantyPage(): { content: AdminWarrantyPage; ready: boolean } {
  const [content, setContent] = useState<AdminWarrantyPage>(() => warrantyPageSeed);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let on = true;
    getAdminApi()
      .getWarrantyPage()
      .then((doc) => {
        if (on) setContent(doc);
      })
      .catch(() => {
        /* demo API unavailable — bundled seed stays */
      })
      .finally(() => {
        if (on) setReady(true);
      });
    return () => {
      on = false;
    };
  }, []);

  return { content, ready };
}
