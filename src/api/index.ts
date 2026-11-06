/**
 * WOODEX — data adapter factory.
 *
 *   import { getAdminApi } from "@/api";
 *   const api = getAdminApi();
 *
 * VITE_API_MODE=demo (default) → localStorage demo DB seeded from the catalogue.
 * VITE_API_MODE=bagisto        → live Bagisto REST API (see docs/07-admin-integration).
 */
import { config } from "@/config/env";
import { demoAdminApi } from "@/api/demo/db";
import { bagistoAdminApi } from "@/api/bagisto/admin";
import type { AdminApi } from "@/api/types";

export function getAdminApi(): AdminApi {
  return config.apiMode === "bagisto" ? bagistoAdminApi : demoAdminApi;
}

export * from "@/api/types";
