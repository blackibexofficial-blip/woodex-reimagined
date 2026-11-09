import { useRef, useState } from "react";
import type { LeadSubmissionOutcome } from "@/api/types";

/** A response from the unverified Bagisto endpoint is not proof of delivery. */
export function unconfirmedLeadDetail(outcome?: LeadSubmissionOutcome): string | null {
  switch (outcome) {
    case "bagisto-response-unverified":
      return "The server response could not be verified as confirmation of your enquiry.";
    case "bagisto-queued-locally":
      return "A copy containing your contact and enquiry details was saved only in this browser. This app does not automatically send the saved copy to our team.";
    case "bagisto-not-saved":
      return "A local copy could not be saved in this browser.";
    default:
      return null;
  }
}

/** Component-local guard only; it is not an idempotency mechanism. */
export function useLeadSubmissionGuard() {
  const lock = useRef(false);
  const retryBlocked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const begin = () => {
    if (lock.current || retryBlocked.current) return false;
    lock.current = true;
    setBusy(true);
    return true;
  };
  const verificationFailed = () => { lock.current = false; setBusy(false); };
  const unconfirmed = (message: string | null) => {
    retryBlocked.current = true;
    setUnknown(true);
    setDetail(message);
    setAcknowledged(false);
    lock.current = false;
    setBusy(false);
  };
  // Keep the lock while the success UI is mounted to close the same-tick gap.
  const success = () => { setBusy(false); };
  const reset = () => {
    lock.current = false;
    retryBlocked.current = false;
    setUnknown(false);
    setDetail(null);
    setAcknowledged(false);
    setBusy(false);
  };
  const acknowledge = (value: boolean) => {
    retryBlocked.current = !value;
    setAcknowledged(value);
  };
  return { busy, unknown, detail, acknowledged, blocked: unknown && !acknowledged, begin, verificationFailed, unconfirmed, success, reset, acknowledge };
}
