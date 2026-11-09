import { config } from "@/config/env";
import type { AdminPageDoc } from "@/api/types";

/** Public projection only. This is not an AdminPage and has no draft/history fields. */
export interface StorefrontPageSnapshot {
  id: string;
  slug: string;
  title: string;
  publishedAt: string | null;
  seo: { title?: string; description?: string; noindex: boolean };
  doc: AdminPageDoc;
}

export class StorefrontPageReadError extends Error {
  constructor(public readonly code: "unavailable" | "invalid") {
    super(code === "invalid" ? "Invalid published page snapshot." : "Published page service unavailable.");
    this.name = "StorefrontPageReadError";
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Strictly shape the already-published payload; never repair it with admin data. */
export function normalizeStorefrontSnapshot(value: unknown, expectedSlug: string): StorefrontPageSnapshot {
  if (!isObject(value) || (typeof value.id !== "string" && typeof value.id !== "number") ||
      (typeof value.id === "number" && !Number.isSafeInteger(value.id)) ||
      typeof value.slug !== "string" || value.slug !== expectedSlug ||
      typeof value.title !== "string" || !Array.isArray(value.blocks) || !isObject(value.theme) || !isObject(value.seo) ||
      value.blocks.some((block: unknown) => !isObject(block) || typeof block.type !== "string" || !isObject(block.props))) {
    throw new StorefrontPageReadError("invalid");
  }
  const seo = value.seo as Record<string, unknown>;
  const seoTitle = typeof seo.title === "string" ? seo.title : typeof value.seo_title === "string" ? value.seo_title : undefined;
  const seoDescription = typeof seo.description === "string" ? seo.description : typeof value.seo_desc === "string" ? value.seo_desc : undefined;
  // A malformed noindex value should never silently become indexable.
  const noindex = seo.noindex === undefined ? false : typeof seo.noindex === "boolean" ? seo.noindex : true;
  return {
    id: String(value.id), slug: value.slug, title: value.title,
    publishedAt: typeof value.published_at === "string" ? value.published_at : null,
    seo: { ...(seoTitle !== undefined && {title: seoTitle}), ...(seoDescription !== undefined && {description: seoDescription}), noindex },
    doc: {
      root: { props: value.theme },
      content: value.blocks.map((block) => ({ type: block.type, props: block.props })),
    },
  };
}

/**
 * The future storefront should call only this reader, never getAdminApi().getPage.
 * Missing/ambiguous/invalid-at-the-database snapshots return undefined; transport
 * or invalid-response errors throw. No draft fallback is permitted for any role.
 */
export async function getStorefrontPageSnapshot(slug: string): Promise<StorefrontPageSnapshot | undefined> {
  if (!slug) return undefined;
  let value: unknown;
  if (config.apiMode === "demo") {
    try {
      const { getDemoStorefrontSnapshot } = await import("@/api/demo/db");
      value = getDemoStorefrontSnapshot(slug);
    } catch {
      throw new StorefrontPageReadError("unavailable");
    }
  } else if (config.apiMode === "supabase") {
    if (!config.supabase.enabled) throw new StorefrontPageReadError("unavailable");
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const result = await supabase.rpc("storefront_page_snapshot", { p_slug: slug });
      if (result.error) throw new StorefrontPageReadError("unavailable");
      value = result.data;
    } catch (error) {
      if (error instanceof StorefrontPageReadError) throw error;
      throw new StorefrontPageReadError("unavailable");
    }
  } else {
    // Neither static nor Bagisto has a tested published snapshot adapter.
    throw new StorefrontPageReadError("unavailable");
  }
  return value == null ? undefined : normalizeStorefrontSnapshot(value, slug);
}
