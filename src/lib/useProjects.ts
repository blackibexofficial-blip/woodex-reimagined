import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";
import type { AdminProject } from "@/api/types";
import { projectsDisplay } from "@/data/projects";

/**
 * Projects / case-study portfolio: admin-managed demo DB when seeded, otherwise
 * the bundled static catalogue. Sorted by sortOrder either way. Rows carry their
 * `active` flag — storefront pages filter it.
 */
const staticFallback = (): AdminProject[] =>
  projectsDisplay.map((p, i) => ({
    ...p,
    furnitureUsed: [...p.furnitureUsed],
    active: true,
    sortOrder: (i + 1) * 10,
    createdAt: "",
    updatedAt: "",
  }));

export function useProjects(): AdminProject[] {
  const [list, setList] = useState<AdminProject[]>(staticFallback);

  useEffect(() => {
    let on = true;
    getAdminApi()
      .listProjects()
      .then((rows) => {
        if (on && rows.length > 0) setList([...rows].sort((a, b) => a.sortOrder - b.sortOrder));
      })
      .catch(() => {
        /* demo API unavailable — bundled catalogue stays */
      });
    return () => {
      on = false;
    };
  }, []);

  return list;
}
