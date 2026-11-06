import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eye, Loader2, Phone, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminOrder, OrderStatus } from "@/api/types";
import { formatPKR, formatDateTime, timeAgo, OrderStatusBadge, paymentLabel, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PER_PAGE = 10;

function exportOrdersCsv(rows: AdminOrder[]) {
  const escape = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["order_id", "placed_at", "customer", "phone", "city", "items", "payment", "status", "subtotal", "shipping", "total"].join(",");
  const body = rows.map((o) =>
    [o.id, o.placedAt, escape(o.customerName), escape(o.customerPhone), escape(o.city), o.items.reduce((s, i) => s + i.quantity, 0), o.paymentMethod, o.status, o.subtotal, o.shipping, o.total].join(","),
  );
  const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `woodex-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_TABS: Array<{ value: OrderStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];
const ALL_STATUSES: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];

export default function AdminOrders() {
  const api = useMemo(() => getAdminApi(), []);
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listOrders({ status, query: debounced || undefined, page, perPage: PER_PAGE });
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
      toast.error("Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [api, status, debounced, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, debounced]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const changeStatus = async (order: AdminOrder, next: OrderStatus) => {
    setSavingStatus(true);
    const updated = await api.updateOrderStatus(order.id, next);
    setSavingStatus(false);
    if (updated) {
      setSelected({ ...updated });
      setRows((rs) => rs.map((r) => (r.id === updated.id ? { ...r, status: updated.status } : r)));
      toast.success(`Order ${updated.id} → ${next}`);
    }
  };

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await api.listOrders({ status, query: debounced || undefined, page: 1, perPage: 500 });
      exportOrdersCsv(res.items);
      toast.success(`Exported ${res.items.length} order(s) to CSV.`);
    } catch (e) {
      console.error(e);
      toast.error("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={status} onValueChange={(v) => setStatus(v as OrderStatus | "all")}>
          <TabsList className="flex-wrap h-auto">
            {STATUS_TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <Input placeholder="Search order ID, customer, city, phone…" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-xs bg-white" />
      </div>

      <SectionCard title={`${total} order${total === 1 ? "" : "s"}`}>
        {loading ? (
          <SectionSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No orders found" hint="Try a different status tab or clear the search." />
        ) : (
          <>
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2.5">Order</th>
                    <th className="px-5 py-2.5">Customer</th>
                    <th className="px-5 py-2.5">Placed</th>
                    <th className="px-5 py-2.5">Payment</th>
                    <th className="px-5 py-2.5 text-right">Total</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5 text-right">View</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted">
                  {rows.map((o) => (
                    <tr key={o.id} className="cursor-pointer hover:bg-secondary" onClick={() => setSelected(o)}>
                      <td className="px-5 py-2.5 font-mono text-xs font-semibold text-foreground">{o.id}</td>
                      <td className="px-5 py-2.5">
                        <span className="block max-w-[150px] truncate font-medium text-foreground">{o.customerName}</span>
                        <span className="text-xs text-muted-foreground">{o.city}</span>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground" title={formatDateTime(o.placedAt)}>{timeAgo(o.placedAt)}</td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">{paymentLabel(o.paymentMethod)}</td>
                      <td className="px-5 py-2.5 text-right font-medium">{formatPKR(o.total)}</td>
                      <td className="px-5 py-2.5"><OrderStatusBadge status={o.status} /></td>
                      <td className="px-5 py-2.5 text-right">
                        <Button size="icon" variant="ghost" aria-label="View order" onClick={(e) => { e.stopPropagation(); setSelected(o); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-muted px-1 pt-4">
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          </>
        )}
      </SectionCard>

      {/* order detail */}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span>Order <span className="font-mono">{selected?.id}</span></span>
              {selected && <OrderStatusBadge status={selected.status} />}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-1 text-sm">
              {/* customer */}
              <div className="rounded-lg bg-secondary p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{selected.customerName}</p>
                    <p className="text-xs text-muted-foreground">{selected.customerEmail} · {selected.city}</p>
                  </div>
                  <a href={`tel:${selected.customerPhone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1.5 text-xs font-medium text-foreground hover:border-hon-green-light hover:text-hon-green-dark">
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{selected.customerPhone}</p>
              </div>

              {/* items */}
              <ul className="divide-y divide-muted rounded-lg border border-muted">
                {selected.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 p-3">
                    {item.image && <img src={item.image} alt="" className="h-12 w-12 rounded-md object-cover" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground">Qty {item.quantity} × {formatPKR(item.price)}</p>
                    </div>
                    <span className="text-xs font-semibold">{formatPKR(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>

              {/* totals */}
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatPKR(selected.subtotal)}</span></div>
                <div className="flex justify-between"><span>Delivery</span><span>{selected.shipping === 0 ? "FREE" : formatPKR(selected.shipping)}</span></div>
                <div className="flex justify-between border-t border-border pt-1 text-sm font-bold text-foreground"><span>Total</span><span>{formatPKR(selected.total)}</span></div>
                <p className="pt-1 text-muted-foreground">Payment: {paymentLabel(selected.paymentMethod)} · Placed {formatDateTime(selected.placedAt)}</p>
                <p className="text-muted-foreground">
                  Expected delivery: {new Date(new Date(selected.placedAt).getTime() + 5 * 86400000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {selected.items.reduce((s, i) => s + i.quantity, 0)} item(s)
                </p>
              </div>

              {/* status control */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="order-status">Update status</label>
                <Select value={selected.status} onValueChange={(v) => changeStatus(selected, v as OrderStatus)} disabled={savingStatus}>
                  <SelectTrigger id="order-status">
                    {savingStatus ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</span> : <SelectValue />}
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
