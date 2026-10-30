/**
 * The only place the storefront talks to the network.
 *
 * Two rules, both learned from shared hosting rather than from taste:
 *
 * 1. Every request has a deadline. A PHP worker that is out of capacity does not answer
 *    slowly, it hangs until the proxy gives up, and a fetch with no timeout waits just as
 *    long as the proxy does. Three seconds is long enough for a cached catalog page on the
 *    same host and short enough that a visitor on a slow connection sees the bundled
 *    snapshot instead of a blank grid.
 *
 * 2. A failure is never thrown as an `Error` with a vague message. The API's error envelope
 *    (`{ error: { code, message, fields } }`) is parsed into an `ApiError`, so the UI can
 *    tell "this product does not exist" apart from "the network is down" — one deserves a
 *    404 page, the other deserves the offline catalogue.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string[]>;

  constructor(message: string, status: number, code = "unknown", fields: Record<string, string[]> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  /** True when the request never reached the server — the caller should degrade. */
  get isNetworkFailure(): boolean {
    return this.status === 0;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/**
 * Where the API lives.
 *
 * Same-origin by default: on Hostinger the SPA and the Laravel app share a domain, so
 * `/api/storefront/v1` is correct with no configuration and no CORS preflight. Set
 * `VITE_API_BASE_URL` to point a local dev server at staging.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "/api/storefront/v1").replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 3000;

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // A caller's abort (the query being cancelled) has to propagate too, or a cancelled query
  // keeps a worker busy for its full timeout.
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      signal: controller.signal,
    });

    if (response.status === 304) {
      // A 304 can only happen if a conditional request was sent; nothing is cached here, so
      // treat it as "no content" rather than pretending it is a body.
      throw new ApiError("The catalog answered 304 with no body.", 304, "not_modified");
    }

    const body = await response.json().catch(() => null);
    const envelope = (body as { error?: { code?: string; message?: string; fields?: Record<string, string[]> } } | null)?.error;

    /**
     * A response that is not our API is not an answer from our API.
     *
     * This matters more than it looks: a dev server with no backend, a static host with no
     * rewrite rule and a CDN error page all answer 404 or 200 with HTML. If a bare 404 were
     * read as "this product does not exist", every product page in a preview would claim it
     * had been withdrawn from the catalogue. Our API always answers an error with
     * `{ error: { code, message } }`, so anything else means we never reached it — status 0,
     * and the caller degrades to the snapshot instead of lying to the visitor.
     */
    if (!response.ok) {
      if (!envelope || typeof envelope.code !== "string") {
        throw new ApiError(
          `Reached something at ${API_BASE_URL} that is not the catalog API.`,
          0,
          "unexpected_response",
        );
      }

      throw new ApiError(
        envelope.message ?? `The catalog answered ${response.status}.`,
        response.status,
        envelope.code,
        envelope.fields ?? {},
      );
    }

    if (body === null) {
      throw new ApiError("The catalog answered with something that is not JSON.", 0, "unexpected_response");
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof DOMException && error.name === "AbortError" && signal?.aborted) {
      // Cancelled by the caller, not a timeout — re-throw so React Query can ignore it.
      throw error;
    }

    // Offline, DNS failure, refused connection, blocked by an ad blocker, or the timeout
    // above. All of them mean the same thing to the storefront: use the snapshot.
    throw new ApiError("Could not reach the catalog service.", 0, "network_error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
