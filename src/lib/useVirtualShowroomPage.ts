import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";
import type { AdminVirtualShowroomPage } from "@/api/types";
import { virtualShowroomPageSeed } from "@/data/virtualShowroomPage";

/**
 * Virtual Showroom page content (B4): admin-managed demo DB singleton when seeded,
 * otherwise the bundled seed (identical to the old hardcoded /virtual-showroom copy).
 * `ready` flips once the live query settles.
 */
export function useVirtualShowroomPage(): { content: AdminVirtualShowroomPage; ready: boolean } {
  const [content, setContent] = useState<AdminVirtualShowroomPage>(() => virtualShowroomPageSeed);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let on = true;
    getAdminApi()
      .getVirtualShowroomPage()
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
