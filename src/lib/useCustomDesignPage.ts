import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";
import type { AdminCustomDesignPage } from "@/api/types";
import { customDesignPageSeed } from "@/data/customDesignPage";

/**
 * Custom Design page content (B4): admin-managed demo DB singleton when seeded,
 * otherwise the bundled seed (identical to the old hardcoded /custom-design copy).
 * `ready` flips once the live query settles.
 */
export function useCustomDesignPage(): { content: AdminCustomDesignPage; ready: boolean } {
  const [content, setContent] = useState<AdminCustomDesignPage>(() => customDesignPageSeed);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let on = true;
    getAdminApi()
      .getCustomDesignPage()
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
