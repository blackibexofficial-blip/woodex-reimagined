/**
 * Client-side B2B trade pricing engine + session.
 *
 * The demo storefront has no accounts backend — trade customers pick a seeded company
 * on the /b2b page ("Trade sign in"), stored in localStorage. Eligibility for a discount
 * is resolved live off the admin-managed price lists, so activating/archiving a list in
 * /admin/price-lists changes what the customer sees immediately.
 */
import type { AdminPriceList } from "@/api/types";

export interface TradeSession {
  companyId: string;
  companyName: string;
  contactName: string;
  signedInAt: string;
}

const KEY = "woodex.b2b.session";

export const readTradeSession = (): TradeSession | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TradeSession) : null;
  } catch {
    return null;
  }
};

export const writeTradeSession = (session: TradeSession): void => {
  localStorage.setItem(KEY, JSON.stringify(session));
};

export const clearTradeSession = (): void => {
  localStorage.removeItem(KEY);
};

/** Whole-PKR discounted price — round to the nearest 10 like real trade quotes. */
export const discounted = (unitPrice: number, pct: number): number =>
  Math.max(0, Math.round((unitPrice * (1 - pct / 100)) / 10) * 10);

export interface AppliedTradeDiscount {
  pct: number;
  listId: string;
  listName: string;
}

/**
 * Best applicable discount for (company, product category), considering only
 * active lists inside their validity window. Highest percentage wins.
 */
export function applicableDiscount(
  lists: AdminPriceList[],
  companyId: string,
  category: string,
  now: Date = new Date(),
): AppliedTradeDiscount | null {
  const t = now.getTime();
  let best: AppliedTradeDiscount | null = null;
  for (const list of lists) {
    if (list.status !== "active") continue;
    if (list.startsAt && new Date(list.startsAt).getTime() > t) continue;
    if (list.endsAt && new Date(list.endsAt).getTime() < t) continue;
    if (list.audience === "companies" && !list.companyIds.includes(companyId)) continue;
    if (list.target === "categories" && !list.categoryIds.includes(category)) continue;
    if (!best || list.discountPct > best.pct) best = { pct: list.discountPct, listId: list.id, listName: list.name };
  }
  return best;
}
