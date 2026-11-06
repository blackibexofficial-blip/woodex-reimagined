import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface QuoteItem {
  id: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  color?: string;
  image?: string;
  /** Deterministic key of the chosen variant (product id + option value ids). */
  variantKey?: string;
  variantLabel?: string;
  variantSku?: string;
}

/** Line-identity key — variant combination when present, else product + color. */
export const quoteLineKey = (i: Pick<QuoteItem, "id" | "color" | "variantKey">): string =>
  i.variantKey ?? `${i.id}::${i.color ?? ""}`;

interface QuoteContextType {
  items: QuoteItem[];
  addItem: (item: Omit<QuoteItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (lineKey: string) => void;
  updateQuantity: (lineKey: string, quantity: number) => void;
  clearQuote: () => void;
  totalItems: number;
  totalPrice: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const QuoteContext = createContext<QuoteContextType | undefined>(undefined);

export const QuoteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<QuoteItem[]>(() => {
    try {
      const saved = localStorage.getItem("woodex-quote");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("woodex-quote", JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((item: Omit<QuoteItem, "quantity"> & { quantity?: number }) => {
    setItems((prev) => {
      const key = quoteLineKey(item);
      const existing = prev.find((i) => quoteLineKey(i) === key);
      if (existing) {
        return prev.map((i) =>
          quoteLineKey(i) === key ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i
        );
      }
      return [...prev, { ...item, quantity: item.quantity || 1 }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => quoteLineKey(i) !== key));
  }, []);

  const updateQuantity = useCallback((key: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => quoteLineKey(i) !== key));
    } else {
      setItems((prev) =>
        prev.map((i) => (quoteLineKey(i) === key ? { ...i, quantity } : i))
      );
    }
  }, []);

  const clearQuote = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <QuoteContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearQuote, totalItems, totalPrice, isOpen, setIsOpen }}
    >
      {children}
    </QuoteContext.Provider>
  );
};

export const useQuote = () => {
  const ctx = useContext(QuoteContext);
  if (!ctx) throw new Error("useQuote must be used within QuoteProvider");
  return ctx;
};
