import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
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
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
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
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id && i.color === item.color);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id && i.color === item.color ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i
        );
      }
      return [...prev, { ...item, quantity: item.quantity || 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantity } : i))
      );
    }
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + effectiveUnitPrice(i) * i.quantity, 0);
  const retailTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const tradeSavings = retailTotal - totalPrice;

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice, retailTotal, tradeSavings, tradeSession, refreshTradeLists, signInTrade, signOutTrade, effectiveUnitPrice, tradeDiscountFor, isOpen, setIsOpen }}
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
