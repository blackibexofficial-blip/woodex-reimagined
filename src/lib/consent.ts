/**
 * Consent + attribution contract for public storefront lead capture (v3 P1).
 *
 * The admin lead record (`AdminLead`), the demo/bagisto `NewLeadInput`
 * implementations, and the public `lead-capture` edge function all speak this
 * vocabulary. The DB stores consent_at / consent_version / utm_* — here they are
 * camelCased to match the frontend API types.
 *
 * Keep the version in lock-step with supabase/functions/lead-capture/index.ts.
 */
export const CONSENT_VERSION = "lead-privacy-v1";

const clip = (v: string | null | undefined, n: number): string | null => {
  const t = v?.trim();
  return t ? t.slice(0, n) : null;
};

export interface Attribution {
  landingPath: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

/** Pure: parses a query string + document context. All params optional-safe. */
export function collectAttribution(
  search: string,
  pathname: string | null = null,
  referrer: string | null = null,
): Attribution {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    params = new URLSearchParams();
  }
  return {
    landingPath: clip(pathname, 200),
    referrer: clip(referrer, 300),
    utmSource: clip(params.get("utm_source"), 80),
    utmMedium: clip(params.get("utm_medium"), 80),
    utmCampaign: clip(params.get("utm_campaign"), 80),
  };
}

export interface ConsentPayload {
  consent: true;
  consentAt: string;
  consentVersion: string;
}

export function buildConsent(now: Date = new Date()): ConsentPayload {
  return { consent: true, consentAt: now.toISOString(), consentVersion: CONSENT_VERSION };
}

/** Convenience for browser call sites (never throws). */
export function collectAttributionBrowser(): Attribution {
  if (typeof window === "undefined") {
    return { landingPath: null, referrer: null, utmSource: null, utmMedium: null, utmCampaign: null };
  }
  return collectAttribution(window.location.search, window.location.pathname, typeof document !== "undefined" ? document.referrer || null : null);
}
