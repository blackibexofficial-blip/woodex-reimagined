/**
 * Shared defaults for the storefront singleton pages (warranty / custom-design /
 * virtual-showroom). Extracted (Wave 3, 2026-11-07) so BOTH adapters restore the
 * exact same source-of-truth copy:
 *   - demo adapter: clone into the localStorage demo DB on reset/seed-repair
 *   - supabase adapter: upsert into the warranty_page / custom_design_page /
 *     virtual_showroom_page singleton rows (public read, page.manage write — RLS)
 * Sources of truth are the bundle's default content modules in @/data/*.
 * Every export returns a deep clone — callers must never mutate module state.
 */
import { warrantyPageSeed } from "@/data/warrantyPage";
import { customDesignPageSeed } from "@/data/customDesignPage";
import { virtualShowroomPageSeed } from "@/data/virtualShowroomPage";
import type { AdminWarrantyPage, AdminCustomDesignPage, AdminVirtualShowroomPage } from "@/api/types";

const cloneDoc = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const defaultWarrantyPage = (): AdminWarrantyPage => cloneDoc(warrantyPageSeed);
export const defaultCustomDesignPage = (): AdminCustomDesignPage => cloneDoc(customDesignPageSeed);
export const defaultVirtualShowroomPage = (): AdminVirtualShowroomPage => cloneDoc(virtualShowroomPageSeed);
