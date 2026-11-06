import { useEffect, useState } from "react";
import { getAdminApi } from "@/api";
import { materials as staticMaterials, type Material } from "@/data/materials";
import type { AdminMaterial } from "@/api/types";

/**
 * Finishes for the room configurator: admin-managed demo DB when it holds
 * active image finishes, otherwise the bundled static catalogue.
 *
 * Only finishes with an image AND at least one applicable part are eligible for
 * the configurator; pure-color swatches (hex, empty applicableTo) manage the
 * /materials page instead. If the admin slice is empty or errors out, the static
 * catalogue keeps the configurator usable — resetting the demo DB re-seeds it.
 */
const toConfiguratorFinish = (m: AdminMaterial): Material | null =>
  m.image && m.applicableTo.length > 0
    ? {
        id: m.id,
        name: m.name,
        category: m.category,
        brightness: m.brightness,
        image: m.image,
        applicableTo: [...m.applicableTo],
      }
    : null;

export function useMaterials(): Material[] {
  const [list, setList] = useState<Material[]>(staticMaterials);

  useEffect(() => {
    let on = true;
    getAdminApi()
      .listMaterials()
      .then((rows) => {
        if (!on) return;
        const live = rows
          .filter((r) => r.active)
          .map(toConfiguratorFinish)
          .filter((m): m is Material => m !== null);
        if (live.length > 0) setList(live);
      })
      .catch(() => {
        /* demo DB unavailable — bundled catalogue stays */
      });
    return () => {
      on = false;
    };
  }, []);

  return list;
}
