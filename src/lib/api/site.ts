/**
 * The content API — the words, not the catalogue.
 *
 * The catalogue has lived behind `/api/storefront/v1` since the shop went live; everything else was
 * written into `src/data/*.ts`, which meant a service page could be edited only by a developer with a
 * deploy. `/api/site/v1` is the other half: pages, records and the theme, read straight from the rows the
 * WOODEX OS admin edits.
 *
 * Two rules, inherited from `client.ts` because they were learned the hard way on shared hosting:
 *
 *   - every request has a deadline, so a starved PHP worker degrades instead of hanging;
 *   - a response that is not our API is not an answer from our API — status 0, and the caller falls back
 *     to the bundled snapshot rather than telling a visitor a service does not exist.
 */

import { ApiError } from "./client";

export const SITE_API_BASE_URL = (import.meta.env.VITE_SITE_API_BASE_URL ?? "/api/site/v1").replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 3000;

/** A record as the API lists it: enough for a card, no body. */
export interface SiteContentCard<TType extends string = string> {
  type: TType;
  slug: string;
  path: string;
  title: string;
  excerpt: string;
  image: string;
  seo: SiteSeo;
  updated_at?: string | null;
}

/** A record with its body. `sections` follows the same block vocabulary the builder writes. */
export interface SiteContentDetail<TType extends string = string, TPayload = Record<string, unknown>>
  extends SiteContentCard<TType> {
  sections: SiteSection[];
  payload: TPayload;
}

export interface SiteSeo {
  title: string;
  description: string;
  canonical: string;
  image: string;
  schema: string;
}

export interface SiteSection {
  type: string;
  heading?: string;
  sub?: string;
  text?: string;
  [key: string]: unknown;
}

export interface SitePage {
  key: string;
  path: string;
  title: string;
  kind: string;
  status: string;
  seo: SiteSeo;
  puck_data?: SiteSection[];
  html?: string | null;
  updated_at?: string | null;
}

export type SiteContentType = "service" | "post" | "project" | "showroom" | "series";

interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

async function getJson<T>(url: string, options: { signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      // Laravel answers 404 with `{ message }` for an unknown record. Anything else — HTML from a
      // static host, a proxy error page — means we never reached our API, so the caller must degrade
      // rather than believe the record is gone.
      const parsed = body as { message?: string; types?: string[] } | null;

      if (parsed && typeof parsed.message === "string") {
        throw new ApiError(parsed.message, response.status, "not_found");
      }

      throw new ApiError(`Reached something at ${SITE_API_BASE_URL} that is not the content API.`, 0, "unexpected_response");
    }

    if (body === null) {
      throw new ApiError("The content API answered with something that is not JSON.", 0, "unexpected_response");
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof DOMException && error.name === "AbortError" && options.signal?.aborted) {
      throw error;
    }

    throw new ApiError("Could not reach the content service.", 0, "network_error");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export async function fetchSiteContent<T extends SiteContentCard = SiteContentCard>(
  type: SiteContentType,
  options: { signal?: AbortSignal } = {},
): Promise<T[]> {
  const body = await getJson<Envelope<T[]>>(`${SITE_API_BASE_URL}/content/${type}`, options);

  return Array.isArray(body.data) ? body.data : [];
}

export async function fetchSiteContentItem<T extends SiteContentDetail = SiteContentDetail>(
  type: SiteContentType,
  slug: string,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const body = await getJson<Envelope<T>>(`${SITE_API_BASE_URL}/content/${type}/${encodeURIComponent(slug)}`, options);

  return body.data;
}

export async function fetchSitePage(key: string, options: { signal?: AbortSignal } = {}): Promise<SitePage> {
  const body = await getJson<Envelope<SitePage>>(`${SITE_API_BASE_URL}/pages/${encodeURIComponent(key)}`, options);

  return body.data;
}

/** The theme as the admin edits it: a token list and the same tokens as a `:root` block. */
export interface SiteTheme {
  tokens: Array<{ group: string; key: string; value: string; label: string; type: string }>;
  css: string;
}

export async function fetchSiteTheme(options: { signal?: AbortSignal } = {}): Promise<SiteTheme> {
  const body = await getJson<Envelope<SiteTheme>>(`${SITE_API_BASE_URL}/theme`, options);

  return { tokens: Array.isArray(body.data?.tokens) ? body.data.tokens : [], css: String(body.data?.css ?? "") };
}
