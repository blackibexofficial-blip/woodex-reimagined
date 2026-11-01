/**
 * An enquiry from the public site.
 *
 * The storefront's forms post to `/api/forms.php` — the address the original site's JavaScript already
 * used, and the one Woodex OS answers by writing a real lead into the CRM (`LegacySiteBridgeController`,
 * source `website_form`). That bridge was written for the 142 interior pages and never for these: the
 * Contact and Quotation forms called `setSubmitted(true)` and nothing else. A visitor filled in a name
 * and a phone number, read "Message Sent!", and went to bed believing someone had it.
 *
 * Two rules, the same two the checkout follows:
 *
 * 1. Never report success the server did not confirm. The receipt the bridge returns carries the lead's
 *    reference (`L-2026-000027`), and that number is only shown when it came back from the server.
 * 2. Never swallow a failure. A dead network, a 429 from the rate limiter and a mistyped phone number
 *    are three different things to the person reading the message, so each one reaches them as itself.
 */

/** The bridge. Same origin, no CORS, no build-time configuration. */
const ENDPOINT = "/api/forms.php";

/** Longer than a catalog read: this writes a row, and a shared host can be slow under load. */
const TIMEOUT_MS = 10_000;

export interface EnquiryInput {
  /** Which form on the site sent it — recorded as the lead's `source_detail`. */
  form: "contact" | "quote";
  name: string;
  phone?: string;
  email?: string;
  /** The subject, the project type, whatever field stands in for "what is this about". */
  service?: string;
  message?: string;
  /** The page the visitor was on; defaults to the current path. */
  page?: string;
}

export interface EnquiryReceipt {
  /** The CRM lead id, and the reference the visitor can quote back to us. */
  id: number;
  reference: string;
}

export class EnquiryError extends Error {
  /** True when trying again in a moment could work: the network, a 429, a 500. */
  readonly retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = "EnquiryError";
    this.retryable = retryable;
  }
}

/** The message a person should read, whatever went wrong. */
export function enquiryErrorMessage(error: unknown): string {
  if (error instanceof EnquiryError) return error.message;

  return "We could not send that just now. Please try again, or message us on WhatsApp.";
}

export async function submitEnquiry(input: EnquiryInput): Promise<EnquiryReceipt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      // The bridge is a normal Laravel route on the same host; the session cookie is what makes a
      // repeat enquiry from the same browser recognisable, and what the rate limiter counts.
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify({
        ...input,
        line: "furniture",
        page: input.page ?? (typeof window === "undefined" ? "" : window.location.pathname),
        // The honeypot. A person never fills it; leaving it empty is what a person sends.
        _hp: "",
      }),
    });

    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; id?: number; reference?: string; error?: string }
      | null;

    if (!response.ok || body?.ok !== true) {
      throw new EnquiryError(
        body?.error ?? "We could not send that just now. Please try again, or message us on WhatsApp.",
        response.status === 429 || response.status >= 500,
      );
    }

    return { id: body.id ?? 0, reference: body.reference ?? "" };
  } catch (error) {
    if (error instanceof EnquiryError) throw error;

    // Offline, DNS, a blocked request, or the timeout above — all the same to the visitor: it did not go.
    throw new EnquiryError(
      "We could not reach the office — check your connection, or message us on WhatsApp.",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}
