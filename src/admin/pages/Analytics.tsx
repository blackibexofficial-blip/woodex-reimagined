import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import {
  Banknote, LineChart as LineChartIcon, Receipt, ShoppingCart, XCircle, RefreshCw,
} from "lucide-react";
import { getAdminApi } from "@/api";
import type { AdminOrder, OrderStatus } from "@/api/types";
import { summarizeOrderSample } from "@/lib/order-analytics";
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
const PAY_COLORS = ["#f59e0b", "#d97706", "#737373", "#a8a29e", "#44403c"];

const tooltipStyle = { borderRadius: 12, border: "1px solid #E0E0E0", fontSize: 12 } as const;
const axisTick = { fontSize: 11, fill: "#737373" };

export default function AdminAnalytics() {
  const api = useMemo(() => getAdminApi(), []);
  const [sample, setSample] = useState<{ orders: AdminOrder[]; asOf: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    setSample(null);
    // One bounded page only. Never imply that it is a complete backend report.
    api.listOrders({ perPage: 100, page: 1 })
      .then((res) => {
        if (!Array.isArray(res.items)) throw new Error("Invalid order sample response.");
        if (active) setSample({ orders: res.items.slice(0, 100), asOf: new Date() });
      })
      .catch((e) => { console.error(e); if (active) setError("Could not load the order sample. Please try again."); });
    return () => { active = false; };
  }, [api, refresh]);

  const result = useMemo(() => {
    if (!sample) return { data: null, error: null };
    try { return { data: summarizeOrderSample(sample.orders, days, sample.asOf), error: null }; }
    catch { return { data: null, error: "The order sample contains invalid data; analytics cannot be calculated safely." }; }
  }, [sample, days]);
  const derived = result.data;
  const series = derived?.series ?? [];
  const paymentSplit = derived?.paymentCounts.map(({ method, count }) => ({ name: paymentLabel(method), value: count })).sort((a, b) => b.value - a.value) ?? [];
  const aovSeries = series.map((p) => ({ label: p.label, aov: p.orders ? Math.round(p.revenue / p.orders) : null }));

  if (error || result.error) {
    return (
      <div role="alert" className="space-y-3">
        <EmptyState icon={LineChartIcon} title="Analytics unavailable" hint={error ?? result.error ?? undefined} />
        <Button variant="outline" onClick={() => setRefresh((v) => v + 1)}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
        <p className="font-semibold">Order sample, not a complete business report</p>
        <p>These figures use only the first page returned by the selected adapter (up to 100 orders). Older orders in the selected period may be missing, even when the page contains fewer than 100. Amounts are displayed in PKR; verify the source currency. Order value is not revenue or money received.</p>
        {derived && <p className="mt-1">UTC calendar dates: {derived.start} to {derived.endInclusive}; {sample?.orders.length} loaded, {derived.selectedCount} in range.{derived.invalidDates > 0 && ` ${derived.invalidDates} order(s) with invalid dates excluded.`}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="analytics-days" className="text-sm font-medium">Date range (UTC)</label>
        <select id="analytics-days" value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value={7}>Last 7 calendar days</option><option value={30}>Last 30 calendar days</option><option value={90}>Last 90 calendar days</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => setRefresh((v) => v + 1)}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh sample</Button>
      </div>
      {/* KPIs apply to this bounded sample, not all business orders. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Order value in sample" value={derived ? formatPKR(derived.orderValue) : "…"} sub="non-cancelled orders; not revenue" icon={Banknote} tone="emerald" />
        <StatCard label="Orders in sample" value={derived ? formatNumber(derived.orders) : "…"} sub={derived ? `${derived.statusCounts.reduce((s, x) => s + x.value, 0)} placed in total` : undefined} icon={ShoppingCart} tone="blue" />
        <StatCard label="Avg. order value" value={derived ? formatPKR(derived.aov) : "…"} sub="order value ÷ non-cancelled orders" icon={Receipt} tone="violet" />
        <StatCard label="Cancellation rate" value={derived ? `${derived.cancelRate}%` : "…"} sub="of all orders in view" icon={XCircle} tone="rose" />
      </div>

      {/* daily orders volume */}
      <SectionCard
        title={days === 30 ? "Order volume — last 30 days" : `Order volume — last ${days} days`}
        action={<span className="text-xs text-muted-foreground">Sample · non-cancelled</span>}
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
        <SectionCard title="Orders by status — sample">
          <div className="h-64 w-full">
            {!derived ? (
              <SectionSkeleton rows={5} />
            ) : derived.statusCounts.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No orders in this sample" />
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
        <SectionCard title="Average order value — daily sample">
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
        <SectionCard title="Top products by line value — sample (non-cancelled)">
          <div className="h-64 w-full">
            {!derived ? (
              <SectionSkeleton rows={5} />
            ) : derived.topProducts.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No line items in this sample" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={derived.topProducts} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" horizontal={false} />
                  <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#57534e" }} tickLine={false} axisLine={false} width={150} />
                  <Tooltip cursor={{ fill: "#F2F2F2" }} contentStyle={tooltipStyle}
                    formatter={(value: number, name: string) => [name === "revenue" ? formatPKR(value) : formatNumber(value), name === "revenue" ? "Line value" : "Units"]} />
                  <Bar dataKey="revenue" name="revenue" fill="#629924" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        {/* payment methods */}
        <SectionCard title="Orders by payment method — sample">
          <div className="h-64 w-full">
            {!derived ? (
              <SectionSkeleton rows={5} />
            ) : paymentSplit.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No orders in this sample" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentSplit} dataKey="value" nameKey="name" outerRadius={85} paddingAngle={3}>
                    {paymentSplit.map((entry, i) => (
                      <Cell key={entry.name} fill={PAY_COLORS[i % PAY_COLORS.length]} stroke="#fff" strokeWidth={2} aria-label={`${entry.name}: ${entry.value} orders`} />
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
