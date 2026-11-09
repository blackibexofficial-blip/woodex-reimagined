import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";
import { isSupabaseMode } from "@/config/env";
import { listPublishedProjects } from "@/api/supabase";
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
  const [list, setList] = useState<AdminProject[]>(() => isSupabaseMode ? [] : staticFallback());

  useEffect(() => {
    let on = true;
    const load = isSupabaseMode ? listPublishedProjects() : getAdminApi().listProjects();
    load
      .then((rows) => {
        // A successful empty hosted result is authoritative, not a reason to show seed projects.
        if (on && (isSupabaseMode || rows.length > 0)) setList([...rows].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      })
      .catch(() => {
        // Offline demo retains its catalogue; Supabase mode stays empty on error.
      });
    return () => {
      on = false;
    };
  }, []);

  return list;
}
