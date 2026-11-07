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
import { supabaseAdminApi } from "@/api/supabase";
import type { AdminApi } from "@/api/types";

export function getAdminApi(): AdminApi {
  if (config.apiMode === "bagisto") return bagistoAdminApi;
  if (config.apiMode === "supabase") return supabaseAdminApi;
  return demoAdminApi; // demo + static both fall back to the offline demo DB
}

export * from "@/api/types";
