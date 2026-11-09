import type { AdminOrder, OrderStatus, PaymentMethod, RevenuePoint } from "@/api/types";

const DAY_MS = 86_400_000;
export const ANALYTICS_ORDER_STATUSES: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];

/** A bounded, explicitly incomplete sample; UTC calendar days, not a financial ledger. */
export function summarizeOrderSample(orders: AdminOrder[], days: number, asOf: Date) {
  if (![7, 30, 90].includes(days) || !Number.isFinite(asOf.getTime())) throw new Error("Invalid analytics date range.");
  const today = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const start = today - (days - 1) * DAY_MS;
  const end = today + DAY_MS;
  let invalidDates = 0;
  const selected = orders.filter((o) => {
    const timestamp = Date.parse(o.placedAt);
    if (!Number.isFinite(timestamp)) { invalidDates++; return false; }
    return timestamp >= start && timestamp < end;
  });
  for (const o of selected) {
    if (!ANALYTICS_ORDER_STATUSES.includes(o.status) || !Number.isFinite(o.total)) throw new Error("An order has an invalid status or total. Analytics cannot be calculated safely.");
    if (!Array.isArray(o.items)) throw new Error("An order has invalid line items. Analytics cannot be calculated safely.");
  }
  const active = selected.filter((o) => o.status !== "cancelled");
  const orderValue = active.reduce((sum, order) => sum + order.total, 0);
  if (!Number.isFinite(orderValue)) throw new Error("Order value is outside the supported range.");
  const statusCounts = ANALYTICS_ORDER_STATUSES.map((status) => ({ name: status, value: selected.filter((o) => o.status === status).length })).filter((x) => x.value > 0);
  const products = new Map<string, { name: string; revenue: number; units: number }>();
  const series: RevenuePoint[] = Array.from({ length: days }, (_, index) => ({
    label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(start + index * DAY_MS)),
    revenue: 0,
    orders: 0,
  }));
  for (const order of active) {
    const index = Math.floor((Date.parse(order.placedAt) - start) / DAY_MS);
    series[index].revenue += order.total;
    if (!Number.isFinite(series[index].revenue)) throw new Error("Daily order value is outside the supported range.");
    series[index].orders++;
    for (const item of order.items) {
      if (!Number.isFinite(item.price) || !Number.isFinite(item.quantity)) throw new Error("An order line has an invalid price or quantity. Analytics cannot be calculated safely.");
      const entry = products.get(item.id) ?? { name: item.name, revenue: 0, units: 0 };
      entry.revenue += item.price * item.quantity;
      entry.units += item.quantity;
      if (!Number.isFinite(entry.revenue) || !Number.isFinite(entry.units)) throw new Error("Order lines exceed the supported range.");
      products.set(item.id, entry);
    }
  }
  const methodCounts = new Map<PaymentMethod, number>();
  for (const order of selected) methodCounts.set(order.paymentMethod, (methodCounts.get(order.paymentMethod) ?? 0) + 1);
  return {
    start: new Date(start).toISOString().slice(0, 10),
    endInclusive: new Date(today).toISOString().slice(0, 10),
    selectedCount: selected.length,
    invalidDates,
    orderValue,
    orders: active.length,
    aov: active.length ? Math.round(orderValue / active.length) : 0,
    cancelRate: selected.length ? Math.round((selected.length - active.length) / selected.length * 100) : 0,
    statusCounts,
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((p) => ({ ...p, name: p.name.length > 34 ? `${p.name.slice(0, 34)}…` : p.name })),
    paymentCounts: [...methodCounts.entries()].map(([method, count]) => ({ method, count })),
    series,
  };
}
