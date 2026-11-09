import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar,
} from "recharts";
import {
  Banknote, ShoppingCart, Receipt, Clock3, ClipboardList, AlertTriangle, ArrowRight, PackageX, Sigma, Inbox, Globe,
} from "lucide-react";
import { getAdminApi } from "@/api";
import { config, isDemoMode } from "@/config/env";
import { Button } from "@/components/ui/button";
import type { AdminOrder, AdminProduct, DashboardStats, RevenuePoint } from "@/api/types";
import {
  formatPKR, formatNumber, formatDateTime, timeAgo, OrderStatusBadge, SectionCard, StatCard, SectionSkeleton,
} from "@/admin/components";

export default function AdminDashboard() {
  const api = useMemo(() => getAdminApi(), []);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [series, setSeries] = useState<RevenuePoint[]>([]);
  const [recentOrders, setRecentOrders] = useState<AdminOrder[]>([]);
  const [lowStock, setLowStock] = useState<AdminProduct[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const bagisto = config.apiMode === "bagisto";
  const supabase = config.apiMode === "supabase";

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setError(false);
    setStats(null);
    setSeries([]);
    setRecentOrders([]);
    setLowStock([]);
    (async () => {
      const [s, rev, orders, productsRes] = await Promise.all([
        api.getDashboardStats(),
        // Bagisto currently returns fabricated zero points; do not present them as data.
        bagisto ? Promise.resolve([]) : api.getRevenueSeries(30),
        api.listOrders({ perPage: 6, page: 1 }),
        api.listProducts({ perPage: 50, page: 1 }),
      ]);
      if (!alive) return;
      setStats(s);
      setSeries(rev);
      setRecentOrders(orders.items);
      setLowStock(productsRes.items.filter((p) => p.inStock && p.stock < 10).slice(0, 5));
      setLoaded(true);
    })().catch((e) => { console.error(e); if (alive) { setError(true); setLoaded(true); } });
    return () => { alive = false; };
  }, [api, bagisto, refresh]);

  if (error) return <div role="alert" className="space-y-3"><p>Dashboard data is unavailable. No totals have been confirmed.</p><Button variant="outline" onClick={() => setRefresh((v) => v + 1)}>Try again</Button></div>;
  const unavailable = bagisto ? "Unavailable" : "…";

  return (
    <div className="space-y-6">
      <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">{isDemoMode ? "Browser-local demo figures" : "Figures are preliminary and backend-dependent"}</p>
        <p>Order values are not revenue or payments received. Amounts are formatted in PKR; verify the source currency. Data may be incomplete or unavailable. See Analytics for a bounded, date-filtered sample.</p>
        {bagisto && <p>Bagisto order totals are based on at most one 100-order page; several signals and the trend are unavailable.</p>}
        {supabase && <p>Supabase month-to-date totals include cancelled orders and may be limited by backend row limits. Its trend excludes cancelled orders.</p>}
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Order value (MTD)" value={stats ? formatPKR(stats.revenueMtd) : "…"} sub={stats ? `${formatPKR(stats.revenueToday)} today · ${supabase ? "incl. cancelled" : "excl. cancelled"}` : undefined} icon={Banknote} tone="emerald" />
        <StatCard label="Orders (MTD)" value={stats ? formatNumber(stats.ordersMtd) : "…"} sub={stats ? `${stats.ordersToday} today` : undefined} icon={ShoppingCart} tone="blue" />
        <StatCard label="Avg. order value" value={stats ? formatPKR(stats.averageOrderValue) : "…"} sub={supabase ? "MTD · incl. cancelled" : "MTD · excl. cancelled"} icon={Receipt} tone="violet" />
        <StatCard label="Open orders" value={stats ? String(stats.pendingOrders) : "…"} sub={supabase ? "excl. delivered, closed, cancelled" : "pending + processing"} icon={Clock3} tone="amber" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-2">
        <StatCard label={supabase ? "Leads created (7d)" : "New leads"} value={bagisto ? unavailable : stats ? String(stats.newLeads) : "…"} sub={supabase ? "all leads created in last 7 days" : bagisto ? "not supplied by this adapter" : "demo leads with new status"} icon={ClipboardList} tone="blue" />
        <StatCard label="Low stock" value={bagisto ? unavailable : stats ? String(stats.lowStockProducts) : "…"} sub={supabase ? "per-product threshold" : bagisto ? "not supplied by this adapter" : "in-stock items under 10 units"} icon={AlertTriangle} tone="rose" />
      </div>

      {/* control center — legacy "ecommerce overview" (Backlog #2); same query as the KPI strip, zero extra RPCs */}
      <SectionCard
        title="Pipeline control center"
        action={<Link to="/admin/analytics" className="inline-flex items-center gap-1 text-xs font-medium text-hon-green-dark hover:text-hon-green-dark">Sample analytics <ArrowRight className="h-3.5 w-3.5" /></Link>}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              to: "/admin/quotes", label: "Open pipeline", icon: Sigma, tone: "text-violet-600",
              value: bagisto ? unavailable : stats ? formatNumber(stats.openQuotes) : "…",
              sub: bagisto ? "not supplied by this adapter" : stats ? `${formatPKR(stats.pipelineValue)} across open quotes` : "pipeline value",
            },
            {
              to: "/admin/invoices", label: "Outstanding invoices", icon: Receipt, tone: "text-amber-600",
              value: bagisto ? unavailable : stats ? formatNumber(stats.outstandingInvoices) : "…",
              sub: bagisto ? "not supplied by this adapter" : "Issued + Partially paid · count, not amount",
            },
            {
              to: "/admin/returns", label: "Needs attention", icon: Inbox, tone: "text-rose-600",
              value: bagisto ? unavailable : stats ? formatNumber(stats.overdueReturns) : "…",
              sub: bagisto ? "not supplied by this adapter" : "requested returns · not an ageing calculation",
            },
            {
              to: "/admin/pages", label: "Published page records", icon: Globe, tone: "text-emerald-600",
              value: bagisto ? unavailable : stats ? formatNumber(stats.publishedPages) : "…",
              sub: bagisto ? "not supplied by this adapter" : supabase ? "pages with a stored published snapshot" : "demo pages with published status",
            },
          ].map(({ to, label, icon: Icon, tone, value, sub }) => (
            <Link
              key={to}
              to={to}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-white p-4 text-left transition hover:border-hon-green hover:shadow-sm"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><Icon className={`h-4 w-4 ${tone}`} /> {label}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </span>
              <span className="text-2xl font-black tracking-tight text-foreground">{value}</span>
              <span className="text-[10px] leading-4 text-muted-foreground">{sub}</span>
            </Link>
          ))}
        </div>
      </SectionCard>

      {/* revenue chart */}
      <SectionCard
        title="Order value — last 30 days"
        action={<Link to="/admin/orders" className="inline-flex items-center gap-1 text-xs font-medium text-hon-green-dark hover:text-hon-green-dark">All orders <ArrowRight className="h-3.5 w-3.5" /></Link>}
      >
        <div className="h-64 w-full">
          {bagisto ? (
            <p className="p-4 text-sm text-muted-foreground">Trend unavailable for this adapter; zero-filled placeholder data is not shown.</p>
          ) : !loaded ? (
            <SectionSkeleton rows={4} />
          ) : series.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No trend data returned.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#629924" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#629924" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#737373" }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 11, fill: "#737373" }} tickLine={false} axisLine={false} width={60}
                  tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip
                  cursor={{ stroke: "#629924" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E0E0E0", fontSize: 12 }}
                  formatter={(value: number, name: string) => [name === "revenue" ? formatPKR(value) : formatNumber(value), name === "revenue" ? "Order value" : "Orders"]}
                />
                <Area type="monotone" dataKey="revenue" stroke="#629924" strokeWidth={2.5} fill="url(#rev)" name="revenue" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* recent orders */}
        <SectionCard
          title="Latest orders"
          className="xl:col-span-3"
          action={<Link to="/admin/orders" className="inline-flex items-center gap-1 text-xs font-medium text-hon-green-dark hover:text-hon-green-dark">View all <ArrowRight className="h-3.5 w-3.5" /></Link>}
        >
          {!loaded ? <SectionSkeleton /> : recentOrders.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No orders returned.</p> : (
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2">Order</th>
                    <th className="px-5 py-2">Customer</th>
                    <th className="px-5 py-2">Placed</th>
                    <th className="px-5 py-2 text-right">Total</th>
                    <th className="px-5 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted">
                  {recentOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-secondary">
                      <td className="px-5 py-2.5 font-mono text-xs font-semibold text-foreground">{o.id}</td>
                      <td className="px-5 py-2.5">
                        <span className="block max-w-[140px] truncate font-medium text-foreground">{o.customerName}</span>
                        <span className="text-xs text-muted-foreground">{o.city}</span>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground" title={formatDateTime(o.placedAt)}>{timeAgo(o.placedAt)}</td>
                      <td className="px-5 py-2.5 text-right font-medium">{formatPKR(o.total)}</td>
                      <td className="px-5 py-2.5 text-right"><OrderStatusBadge status={o.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* low stock */}
        <SectionCard
          title="Low stock watchlist"
          className="xl:col-span-2"
          action={<Link to="/admin/products" className="inline-flex items-center gap-1 text-xs font-medium text-hon-green-dark hover:text-hon-green-dark">All products <ArrowRight className="h-3.5 w-3.5" /></Link>}
        >
          {!loaded ? <SectionSkeleton /> : lowStock.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <PackageX className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No matching low-stock items in the first 50 products returned.</p>
            </div>
          ) : (
            <ul className="divide-y divide-muted">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  {p.image && <img src={p.image} alt="" className="h-11 w-11 rounded-md object-cover" loading="lazy" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{p.category.replace(/-/g, " ")}</p>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${p.stock <= 3 ? "bg-rose-100 text-rose-700" : "bg-hon-green-pale text-hon-green-dark"}`}>
                    {p.stock} left
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Sample: first 50 returned products, in stock and below 10 units; at most five shown. Thresholds can differ from the KPI.</p>
        </SectionCard>
      </div>
    </div>
  );
}
