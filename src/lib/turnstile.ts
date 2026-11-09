/**
 * WOODEX — Cloudflare Turnstile (anti-bot) helper.
 *
 * The storefront renders an invisible Turnstile challenge at submit time and passes
 * the token through to the public intake edge functions, which verify it against
 * Cloudflare's siteverify endpoint BEFORE touching the database (see
 * supabase/functions/_shared/turnstile.mjs + docs/08-master-plan/ANTI-ABUSE-DECISION.md).
 *
 * Rollout posture:
 *   - Demo / preview builds (VITE_API_MODE != "supabase") and builds WITHOUT
 *     VITE_TURNSTILE_SITE_KEY get NO widget and NO script injection — the app behaves
 *     as before. The EF decides: legacy mode fails open when unconfigured; strict
 *     intake mode refuses requests without its server-side secret.
 *   - Configured builds (site key set) REQUIRE the challenge to succeed at submit time;
 *     a failed/timed-out challenge aborts the submit with a visible toast.
 *
 * Enablement checklist (owner): set VITE_TURNSTILE_SITE_KEY for the web build AND
 * `supabase secrets set TURNSTILE_SECRET=...` for the EFs — both together.
 */
import { config } from "@/config/env";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>
      ) => string;
    };
  }
}

const SCRIPT_ID = "cf-turnstile-api";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export type TurnstileAction = "order" | "lead";

/** Site key from the baked-in env (public key — safe to ship). Null when unset/blank. */
export function turnstileSiteKey(): string | null {
  const key = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim();
  return key ? key : null;
}

/** Turnstile is active only in supabase mode with a configured site key. */
export function turnstileEnabled(): boolean {
  return config.apiMode === "supabase" && Boolean(turnstileSiteKey());
}

let scriptLoader: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoader) return scriptLoader;
  scriptLoader = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptLoader = null;
      reject(new Error("turnstile script failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptLoader;
}

/**
 * Run an invisible challenge for `action` and resolve its token.
 *   - returns null when Turnstile is NOT enabled for this build (caller proceeds;
 *     the EF's configured intake policy decides whether to accept the request);
 *   - throws when Turnstile IS enabled but cannot produce a token (offline,
 *     script blocked, timeout) — the caller must NOT submit.
 */
export async function getTurnstileToken(
  action: TurnstileAction
): Promise<string | null> {
  if (!turnstileEnabled()) return null;
  const sitekey = turnstileSiteKey() as string;
  await loadTurnstileScript();
  const turnstile = window.turnstile;
  if (!turnstile) throw new Error("turnstile failed to initialize");

  return new Promise<string>((resolve, reject) => {
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-9999px;top:-9999px";
    document.body.appendChild(holder);
    const cleanup = () => {
      try {
        holder.remove();
      } catch {
        /* already detached */
      }
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("challenge timed out — please try again"));
    }, 15000);

    try {
      turnstile.render(holder, {
        sitekey,
        size: "invisible",
        action,
        // invisible widgets execute on render by default ("execution: render")
        callback: (token: string) => {
          window.clearTimeout(timer);
          cleanup();
          resolve(token);
        },
        "error-callback": () => {
          window.clearTimeout(timer);
          cleanup();
          reject(new Error("challenge failed — please try again"));
        },
        "expired-callback": () => {
          window.clearTimeout(timer);
          cleanup();
          reject(new Error("challenge expired — please try again"));
        },
      });
    } catch (err) {
      window.clearTimeout(timer);
      cleanup();
      reject(err instanceof Error ? err : new Error("challenge failed — please try again"));
    }
  });
}
