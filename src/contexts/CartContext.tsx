import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getAdminApi } from "@/api";
import type { AdminPriceList } from "@/api/types";
import {
  applicableDiscount,
  clearTradeSession,
  discounted,
  readTradeSession,
  writeTradeSession,
  type AppliedTradeDiscount,
  type TradeSession,
} from "@/lib/tradePricing";

export interface CartItem {
  id: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  color?: string;
  image?: string;
  /** Deterministic key of the chosen variant (product id + selected option value ids). */
  variantKey?: string;
  /** Human-readable selection, e.g. "Finish: Dark Walnut · Fabric: Sand Beige". */
  variantLabel?: string;
  /** SKU with option suffixes, e.g. "WDX-1001|DW-FI-S" — or the static product id for un-configured PDP. */
  variantSku?: string;
}

/** Line-identity key — variant combination when present, else product + color. */
export const cartLineKey = (i: Pick<CartItem, "id" | "color" | "variantKey">): string =>
  i.variantKey ?? `${i.id}::${i.color ?? ""}`;

interface CartSnapshot {
  serialized: string;
  revision: number;
}

interface CartContextType {
  items: CartItem[];
  snapshotCart: () => CartSnapshot;
  isCartSnapshotCurrent: (snapshot: CartSnapshot) => boolean;
  clearCartIfUnchanged: (snapshot: CartSnapshot) => void;
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (lineKey: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  /** Grand total the customer will pay — trade-aware when signed in. */
  totalPrice: number;
  /** Always retail. */
  retailTotal: number;
  tradeSavings: number;
  tradeSession: TradeSession | null;
  refreshTradeLists: () => Promise<void>;
  signInTrade: (company: { id: string; name: string; contactName: string }) => void;
  signOutTrade: () => void;
  effectiveUnitPrice: (item: Pick<CartItem, "price" | "category">) => number;
  tradeDiscountFor: (item: Pick<CartItem, "category">) => AppliedTradeDiscount | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("woodex-cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  // Increment before scheduling edits so even same-tick edits invalidate a checkout snapshot.
  const revision = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [tradeSession, setTradeSession] = useState<TradeSession | null>(() => readTradeSession());
  const [priceLists, setPriceLists] = useState<AdminPriceList[]>([]);

  useEffect(() => {
    localStorage.setItem("woodex-cart", JSON.stringify(items));
  }, [items]);

  const refreshTradeLists = useCallback(async () => {
    try {
      setPriceLists(await getAdminApi().listPriceLists());
    } catch (e) {
      console.warn("[woodex] trade price lists unavailable — pricing stays retail", e);
      setPriceLists([]);
    }
  }, []);

  // Load on mount and whenever the signed-in company changes
  useEffect(() => {
    void refreshTradeLists();
  }, [refreshTradeLists, tradeSession?.companyId]);

  const signInTrade = useCallback((company: { id: string; name: string; contactName: string }) => {
    const session: TradeSession = { companyId: company.id, companyName: company.name, contactName: company.contactName, signedInAt: new Date().toISOString() };
    writeTradeSession(session);
    setTradeSession(session);
  }, []);

  const signOutTrade = useCallback(() => {
    clearTradeSession();
    setTradeSession(null);
  }, []);

  const tradeDiscountFor = useCallback(
    (item: Pick<CartItem, "category">): AppliedTradeDiscount | null =>
      tradeSession ? applicableDiscount(priceLists, tradeSession.companyId, item.category) : null,
    [priceLists, tradeSession],
  );

  const effectiveUnitPrice = useCallback(
    (item: Pick<CartItem, "price" | "category">): number => {
      const d = tradeDiscountFor(item);
      return d ? discounted(item.price, d.pct) : item.price;
    },
    [tradeDiscountFor],
  );

  const addItem = useCallback((item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    revision.current++;
    setItems((prev) => {
      const key = cartLineKey(item);
      const existing = prev.find((i) => cartLineKey(i) === key);
      if (existing) {
        return prev.map((i) =>
          cartLineKey(i) === key ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i
        );
      }
      return [...prev, { ...item, quantity: item.quantity || 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((key: string) => {
    revision.current++;
    setItems((prev) => prev.filter((i) => cartLineKey(i) !== key));
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    revision.current++;
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => cartLineKey(i) !== key));
    } else {
      setItems((prev) =>
        prev.map((i) => (cartLineKey(i) === key ? { ...i, quantity } : i))
      );
    }
  }, []);

  const clearCart = useCallback(() => {
    revision.current++;
    setItems([]);
  }, []);

  // Associate the version with this rendered item array, not a possibly newer
  // queued edit, so an edit followed immediately by submit fails the check.
  const renderedSnapshot = useMemo((): CartSnapshot => ({
    serialized: JSON.stringify(items),
    revision: revision.current,
  }), [items]);
  const snapshotCart = useCallback((): CartSnapshot => renderedSnapshot, [renderedSnapshot]);

  const isCartSnapshotCurrent = useCallback((snapshot: CartSnapshot): boolean => {
    if (revision.current !== snapshot.revision) return false;
    // Another tab may have written a different cart. Fail conservatively if
    // storage is unavailable or differs. This is not an atomic cross-tab lock.
    try { return localStorage.getItem("woodex-cart") === snapshot.serialized; }
    catch { return false; }
  }, []);

  const clearCartIfUnchanged = useCallback((snapshot: CartSnapshot) => {
    setItems((current) => {
      if (JSON.stringify(current) !== snapshot.serialized || !isCartSnapshotCurrent(snapshot)) return current;
      return [];
    });
  }, [isCartSnapshotCurrent]);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + effectiveUnitPrice(i) * i.quantity, 0);
  const retailTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tradeSavings = retailTotal - totalPrice;

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, snapshotCart, isCartSnapshotCurrent, clearCartIfUnchanged, totalItems, totalPrice, retailTotal, tradeSavings, tradeSession, refreshTradeLists, signInTrade, signOutTrade, effectiveUnitPrice, tradeDiscountFor, isOpen, setIsOpen }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};
