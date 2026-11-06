import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar,
} from "recharts";
import {
  Banknote, ShoppingCart, Receipt, Clock3, ClipboardList, AlertTriangle, ArrowRight, CalendarDays, PackageX,
} from "lucide-react";
import { getAdminApi } from "@/api";
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

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, rev, orders, productsRes] = await Promise.all([
        api.getDashboardStats(),
        api.getRevenueSeries(30),
        api.listOrders({ perPage: 6, page: 1 }),
        api.listProducts({ perPage: 50, page: 1 }),
      ]);
      if (!alive) return;
      setStats(s);
      setSeries(rev);
      setRecentOrders(orders.items);
      setLowStock(productsRes.items.filter((p) => p.inStock && p.stock < 10).slice(0, 5));
    })().catch(console.error);
    return () => { alive = false; };
  }, [api]);

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Revenue (MTD)" value={stats ? formatPKR(stats.revenueMtd) : "…"} sub={stats ? `${formatPKR(stats.revenueToday)} today` : undefined} icon={Banknote} tone="emerald" />
        <StatCard label="Orders (MTD)" value={stats ? formatNumber(stats.ordersMtd) : "…"} sub={stats ? `${stats.ordersToday} today` : undefined} icon={ShoppingCart} tone="blue" />
        <StatCard label="Avg. order value" value={stats ? formatPKR(stats.averageOrderValue) : "…"} sub="month to date" icon={Receipt} tone="violet" />
        <StatCard label="Pending fulfilment" value={stats ? String(stats.pendingOrders) : "…"} sub="pending + processing" icon={Clock3} tone="amber" />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-2">
        <StatCard label="New leads" value={stats ? String(stats.newLeads) : "…"} sub="quote + B2B awaiting contact" icon={ClipboardList} tone="blue" />
        <StatCard label="Low stock" value={stats ? String(stats.lowStockProducts) : "…"} sub="in-stock items under 10 units" icon={AlertTriangle} tone="rose" />
      </div>

      {/* revenue chart */}
      <SectionCard
        title="Revenue — last 30 days"
        action={<Link to="/admin/orders" className="inline-flex items-center gap-1 text-xs font-medium text-hon-green-dark hover:text-hon-green-dark">All orders <ArrowRight className="h-3.5 w-3.5" /></Link>}
      >
        <div className="h-64 w-full">
          {series.length === 0 ? (
            <SectionSkeleton rows={4} />
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
                  formatter={(value: number, name: string) => [name === "revenue" ? formatPKR(value) : formatNumber(value), name === "revenue" ? "Revenue" : "Orders"]}
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
          {recentOrders.length === 0 ? <SectionSkeleton /> : (
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
          {lowStock.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <PackageX className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Everything is comfortably stocked. 🎉</p>
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
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
            <CalendarDays className="h-4 w-4 shrink-0" /> Reorder from the factory on TPL Sheikh Zayed Rd — lead time 7–14 days.
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
