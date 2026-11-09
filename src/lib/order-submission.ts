import type { AdminOrder } from "@/api/types";

/** Bagisto's current endpoint/response and browser outbox are not a receipt. */
export function unconfirmedOrderDetail(outcome: AdminOrder["submissionOutcome"]): string | null {
  switch (outcome) {
    case "bagisto-response-unverified":
      return "The server response could not be verified as an order confirmation. The local reference is not a confirmed order number.";
    case "bagisto-queued-locally":
      return "A copy containing contact and order details was saved only in this browser. This app does not automatically send the saved copy to our team.";
    case "bagisto-not-saved":
      return "A local copy could not be saved in this browser.";
    default:
      return null;
  }
}
