import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";
import type { AdminService } from "@/api/types";
import { services } from "@/data/services";

/**
 * Service catalogue: admin-managed demo DB when seeded, otherwise the bundled
 * static catalogue. `ready` flips once the live query settles — deep links to
 * admin-created services depend on it (absent from the fallback pre-fetch).
 */
const staticFallback = (): AdminService[] =>
  services.map((s, i) => ({
    ...s,
    active: true,
    sortOrder: (i + 1) * 10,
    createdAt: "",
    updatedAt: "",
  }));

export function useServices(): { services: AdminService[]; ready: boolean } {
  const [list, setList] = useState<AdminService[]>(staticFallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let on = true;
    getAdminApi()
      .listServices()
      .then((rows) => {
        if (!on) return;
        if (rows.length > 0) setList([...rows].sort((a, b) => a.sortOrder - b.sortOrder));
      })
      .catch(() => {
        /* demo API unavailable — bundled catalogue stays */
      })
      .finally(() => {
        if (on) setReady(true);
      });
    return () => {
      on = false;
    };
  }, []);

  return { services: list, ready };
}
