import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import {
  Banknote, LineChart as LineChartIcon, Receipt, ShoppingCart, XCircle, RefreshCw,
} from "lucide-react";
import { getAdminApi } from "@/api";
import type { AdminOrder, OrderStatus, PaymentMethod, RevenuePoint } from "@/api/types";
import {
  formatPKR, formatNumber, paymentLabel, StatCard, SectionCard, SectionSkeleton, EmptyState,
} from "@/admin/components";
import { Button } from "@/components/ui/button";

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: "#f59e0b",
  processing: "#3b82f6",
  shipped: "#8b5cf6",
  delivered: "#10b981",
  cancelled: "#f43f5e",
};
const STATUS_ORDER: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];
const PAY_COLORS = ["#f59e0b", "#d97706", "#737373", "#a8a29e", "#44403c"];

const tooltipStyle = { borderRadius: 12, border: "1px solid #E0E0E0", fontSize: 12 } as const;
const axisTick = { fontSize: 11, fill: "#737373" };

export default function AdminAnalytics() {
  const api = useMemo(() => getAdminApi(), []);
  const [series, setSeries] = useState<RevenuePoint[]>([]);
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setOrders(null);
    Promise.all([api.getRevenueSeries(30), api.listOrders({ perPage: 500, page: 1 })])
      .then(([rev, res]) => { setSeries(rev); setOrders(res.items); })
      .catch((e) => { console.error(e); setError(e instanceof Error ? e.message : "Could not load analytics."); });
  };

  useEffect(load, [api]);

  const derived = useMemo(() => {
    if (!orders) return null;
    const live = orders.filter((o) => o.status !== "cancelled");
    const revenue30 = live.reduce((s, o) => s + o.total, 0);
    const orders30 = live.length;
    const aov = orders30 ? Math.round(revenue30 / orders30) : 0;
    const cancelled = orders.length - live.length;
    const cancelRate = orders.length ? Math.round((cancelled / orders.length) * 100) : 0;

    const statusCounts = STATUS_ORDER.map((status) => ({
      name: status,
      value: orders.filter((o) => o.status === status).length,
    })).filter((s) => s.value > 0);

    const productTotals = new Map<string, { name: string; revenue: number; units: number }>();
    for (const o of live) {
      for (const item of o.items) {
        const entry = productTotals.get(item.id) ?? { name: item.name, revenue: 0, units: 0 };
        entry.revenue += item.price * item.quantity;
        entry.units += item.quantity;
        productTotals.set(item.id, entry);
      }
    }
    const topProducts = [...productTotals.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((p) => ({ name: p.name.length > 34 ? `${p.name.slice(0, 34)}…` : p.name, revenue: p.revenue, units: p.units }));

    const methodCounts = new Map<PaymentMethod, number>();
    for (const o of orders) methodCounts.set(o.paymentMethod, (methodCounts.get(o.paymentMethod) ?? 0) + 1);
    const paymentSplit = [...methodCounts.entries()]
      .map(([method, count]) => ({ name: paymentLabel(method), value: count }))
      .sort((a, b) => b.value - a.value);

    return { revenue30, orders30, aov, cancelRate, statusCounts, topProducts, paymentSplit };
  }, [orders]);

  const aovSeries = useMemo(
    () => series.map((p) => ({ label: p.label, aov: p.orders ? Math.round(p.revenue / p.orders) : 0 })),
    [series],
  );

  if (error) {
    return (
      <EmptyState
        icon={LineChartIcon}
        title="Analytics unavailable"
        hint={error}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* 30-day KPI strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Revenue (30d)" value={derived ? formatPKR(derived.revenue30) : "…"} sub="excl. cancelled orders" icon={Banknote} tone="emerald" />
        <StatCard label="Orders (30d)" value={derived ? formatNumber(derived.orders30) : "…"} sub={derived ? `${derived.statusCounts.reduce((s, x) => s + x.value, 0)} placed in total` : undefined} icon={ShoppingCart} tone="blue" />
        <StatCard label="Avg. order value" value={derived ? formatPKR(derived.aov) : "…"} sub="revenue ÷ orders" icon={Receipt} tone="violet" />
        <StatCard label="Cancellation rate" value={derived ? `${derived.cancelRate}%` : "…"} sub="of all orders in view" icon={XCircle} tone="rose" />
      </div>

      {/* daily orders volume */}
      <SectionCard
        title="Order volume — last 30 days"
        action={
          <Button variant="ghost" size="sm" onClick={load} className="text-muted-foreground hover:text-foreground">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
        }
      >
        <div className="h-56 w-full">
          {series.length === 0 ? (
            <SectionSkeleton rows={4} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" vertical={false} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={4} />
                <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={36} />
                <Tooltip cursor={{ fill: "#F2F2F2" }} contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => [formatNumber(value), name === "orders" ? "Orders" : name]} />
                <Bar dataKey="orders" name="orders" fill="#629924" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* orders by status */}
        <SectionCard title="Orders by status">
          <div className="h-64 w-full">
            {!derived ? (
              <SectionSkeleton rows={5} />
            ) : derived.statusCounts.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No orders yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={derived.statusCounts} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {derived.statusCounts.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name as OrderStatus] ?? "#a8a29e"} stroke="#fff" strokeWidth={2} aria-label={`${entry.name}: ${entry.value} orders`} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [formatNumber(value), name]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        {/* AOV trend */}
        <SectionCard title="Average order value — daily">
          <div className="h-64 w-full">
            {series.length === 0 ? (
              <SectionSkeleton rows={5} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={aovSeries} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={56}
                    tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [formatPKR(value), "AOV"]} />
                  <Line type="monotone" dataKey="aov" name="aov" stroke="#4B7915" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        {/* top products by revenue */}
        <SectionCard title="Top products by revenue (non-cancelled)">
          <div className="h-64 w-full">
            {!derived ? (
              <SectionSkeleton rows={5} />
            ) : derived.topProducts.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No line items yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={derived.topProducts} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" horizontal={false} />
                  <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#57534e" }} tickLine={false} axisLine={false} width={150} />
                  <Tooltip cursor={{ fill: "#F2F2F2" }} contentStyle={tooltipStyle}
                    formatter={(value: number, name: string) => [name === "revenue" ? formatPKR(value) : formatNumber(value), name === "revenue" ? "Revenue" : "Units"]} />
                  <Bar dataKey="revenue" name="revenue" fill="#629924" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        {/* payment methods */}
        <SectionCard title="Orders by payment method">
          <div className="h-64 w-full">
            {!derived ? (
              <SectionSkeleton rows={5} />
            ) : derived.paymentSplit.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No orders yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={derived.paymentSplit} dataKey="value" nameKey="name" outerRadius={85} paddingAngle={3}>
                    {derived.paymentSplit.map((entry, i) => (
                      <Cell key={entry.name} fill={PAY_COLORS[i % PAY_COLORS.length]} stroke="#fff" strokeWidth={2} aria-label={`${entry.name}: ${entry.value} payments`} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [formatNumber(value), name]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
