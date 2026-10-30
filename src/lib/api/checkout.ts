/**
 * The checkout calls: price a basket, then place it.
 *
 * Both send the same lines. The server re-prices them every time, so the browser's own
 * arithmetic is never what gets charged — which is why `fetchQuote` exists at all: without it
 * the summary on the right of the checkout form would be one opinion and the invoice another.
 */

import { postJson } from "./client";

export interface OrderLineInput {
  slug: string;
  qty: number;
  color?: string;
}

export interface QuoteLine {
  slug: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price_minor: number;
  unit_price: string;
  line_total_minor: number;
  line_total: string;
  tax_minor: number;
  tax_rate_bp: number;
  discount_minor: number;
  image: string | null;
  color: string | null;
}

export interface QuoteTotals {
  currency: string;
  subtotal: number;
  discount_total: number;
  net_total: number;
  tax_total: number;
  tax_on_goods: number;
  shipping_total: number;
  shipping_tax: number;
  grand_total: number;
  free_shipping: boolean;
  prices_include_tax: boolean;
  applied_rules: string[];
}

export interface Quote {
  currency: string;
  lines: QuoteLine[];
  totals: QuoteTotals;
  item_count: number;
  free_shipping: boolean;
  savings_bp: number;
}

export interface PlaceOrderInput {
  lines: OrderLineInput[];
  gateway: "cod" | "bank";
  customer: { name: string; phone: string; email?: string };
  shipping: {
    line1: string;
    line2?: string;
    city: string;
    province?: string;
    postcode?: string;
  };
  notes?: string;
}

export interface OrderReceipt {
  number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  currency: string;
  total_minor: number;
  total: string;
  amount_due_minor: number;
  placed_at: string | null;
  invoice_number: string | null;
  lines: { slug: string; name: string; quantity: number; line_total_minor: number; line_total: string }[];
  shipping_estimate_days: number;
}

interface Envelope<T> {
  data: T;
}

/** The authoritative basket. Writes nothing; safe to call on every quantity change. */
export async function fetchQuote(lines: OrderLineInput[], signal?: AbortSignal): Promise<Quote> {
  const body = await postJson<Envelope<Quote>>("/checkout/quote", { lines }, { signal });
  return body.data;
}

/**
 * Place the order.
 *
 * There is deliberately no fallback. If this throws, the cart is untouched and the customer
 * is told — the one thing a checkout must never do is pretend.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<OrderReceipt> {
  const body = await postJson<Envelope<OrderReceipt>>("/checkout", input);
  return body.data;
}
