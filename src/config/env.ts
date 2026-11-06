/**
 * WOODEX — central, typed environment configuration.
 *
 * Every environment variable the app consumes is read and validated here exactly once.
 * Components and adapters import `config` (or the `isBagisto*` helpers) instead of
 * touching `import.meta.env` directly, so swapping backends later is a config change,
 * not a code hunt.
 *
 * Modes (VITE_API_MODE):
 *   demo    → admin panel reads/writes a localStorage-backed demo database seeded
 *             from the storefront catalogue. Default. Everything works offline.
 *   static  → storefront seed data, read-only (used implicitly by the storefront).
 *   bagisto → admin panel + storefront talk to a Bagisto instance over its REST API
 *             (requires VITE_BAGISTO_API_URL + keys — see docs/07-admin-integration).
 */

const raw = import.meta.env;

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

export type ApiMode = "demo" | "static" | "bagisto";

const apiMode = str(raw.VITE_API_MODE, "demo") as ApiMode;

export const config = {
  appName: "WOODEX",

  /** Which backend adapter the app uses. */
  apiMode: (["demo", "static", "bagisto"] as const).includes(apiMode) ? apiMode : "demo",

  supabase: {
    url: str(raw.VITE_SUPABASE_URL),
    publishableKey: str(raw.VITE_SUPABASE_PUBLISHABLE_KEY),
    projectId: str(raw.VITE_SUPABASE_PROJECT_ID),
    /** True when both required values are present. */
    enabled: Boolean(str(raw.VITE_SUPABASE_URL) && str(raw.VITE_SUPABASE_PUBLISHABLE_KEY)),
  },

  bagisto: {
    /** Base URL of the Bagisto site, e.g. https://admin.yourdomain.pk (no trailing slash needed). */
    baseUrl: str(raw.VITE_BAGISTO_API_URL).replace(/\/+$/, ""),
    /** Public "pk_storefront_…" key — safe for the browser, rate-limited per key. */
    storefrontKey: str(raw.VITE_BAGISTO_STOREFRONT_KEY),
    /**
     * Admin integration token (id|token) from Bagisto → Settings → Integration.
     * SECRET: only acceptable for local demos / private previews. In production the
     * admin API must be called from the Laravel backend (or a server proxy), never
     * shipped to browsers — see docs/07-admin-integration.
     */
    adminToken: str(raw.VITE_BAGISTO_ADMIN_TOKEN),
    channel: str(raw.VITE_BAGISTO_CHANNEL, "default"),
    locale: str(raw.VITE_BAGISTO_LOCALE, "en"),
    currency: str(raw.VITE_BAGISTO_CURRENCY, "PKR"),
  },

  /** Google Analytics 4 measurement id ("G-XXXXXXX"). Blank = analytics fully disabled. */
  ga4: {
    id: str(raw.VITE_GA4_ID),
  },

  admin: {
    /** Demo-only gate for the /admin preview. NOT a real access control in demo mode. */
    email: str(raw.VITE_ADMIN_EMAIL, "admin@woodex.pk"),
    password: str(raw.VITE_ADMIN_PASSWORD, "woodex-admin"),
    sessionKey: "woodex.admin.session",
  },
} as const;

export type AppConfig = typeof config;

export const isSupabaseConfigured = config.supabase.enabled;
export const isBagistoShopConfigured =
  config.apiMode === "bagisto" && Boolean(config.bagisto.baseUrl && config.bagisto.storefrontKey);
export const isBagistoAdminConfigured =
  config.apiMode === "bagisto" && Boolean(config.bagisto.baseUrl && config.bagisto.adminToken);

/** True when the SPA is serving demo (localStorage) data rather than a live Bagisto backend. */
export const isDemoMode = config.apiMode !== "bagisto";
