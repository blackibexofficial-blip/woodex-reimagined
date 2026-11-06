import type { AdminBundle } from "@/api/types";
import { discounted } from "@/lib/tradePricing";

export interface BundleMath {
  /** Sum of line prices at catalogue retail. */
  retail: number;
  /** What the customer pays — catalogue sum minus the bundle discount. */
  price: number;
  /** retail − price, always >= 0. */
  save: number;
}

/**
 * Bundle pricing derived live off the catalogue — the admin never stores a price,
 * so catalogue edits reprice bundles automatically. Trade pricing deliberately does
 * NOT stack with bundles (bundle price is the commercial offer).
 */
export function bundleMath<T extends { price: number }>(
  bundle: Pick<AdminBundle, "lines" | "discountPct">,
  priceOf: (productId: string) => T | undefined,
): BundleMath {
  const retail = bundle.lines.reduce((sum, l) => {
    const unit = priceOf(l.productId)?.price ?? 0;
    return sum + unit * Math.max(1, Math.floor(l.quantity));
  }, 0);
  const price = discounted(retail, Math.max(0, Math.min(60, bundle.discountPct)));
  return { retail, price, save: Math.max(0, retail - price) };
}

/** Total unit count across lines — for "Includes … × N" summaries. */
export const bundleUnitCount = (bundle: Pick<AdminBundle, "lines">): number =>
  bundle.lines.reduce((sum, l) => sum + Math.max(1, Math.floor(l.quantity)), 0);
