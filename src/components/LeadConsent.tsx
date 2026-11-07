/**
 * Explicit, affirmative consent gate for public lead capture.
 * Versioned (CONSENT_VERSION) so the storefront, the demo/bagisto API layers
 * and the Supabase `lead-capture` EF all speak the same contract. The current
 * notice is rendered inline — there is no /privacy route yet to link to.
 */
import { CONSENT_VERSION } from "@/lib/consent";
import { cn } from "@/lib/utils";

export function LeadConsent({
  checked,
  onChange,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer select-none items-start gap-2.5 rounded-sm border border-border bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <input
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
        aria-describedby="lead-consent-copy"
      />
      <span id="lead-consent-copy">
        I agree that WOODEX may store the details I enter here only to respond to this enquiry —
        no newsletters or third-party marketing without a separate explicit sign-up. Consent is
        recorded with a timestamp and a notice version (<code className="font-mono">{CONSENT_VERSION}</code>).
        I can ask for my details to be deleted at any time.
      </span>
    </label>
  );
}
