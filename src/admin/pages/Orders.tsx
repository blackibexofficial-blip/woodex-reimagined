import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Eye, History, Loader2, MessageCircle, Phone, Printer, Save, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminOrder, AdminOrderEvent, OrderStatus } from "@/api/types";
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

/** wa.me expects digits-only, international format — map local PK mobile forms. */
function whatsAppNumber(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
}

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
  const [courierDraft, setCourierDraft] = useState("");
  const [trackingDraft, setTrackingDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [savingCourier, setSavingCourier] = useState(false);
  const [events, setEvents] = useState<AdminOrderEvent[] | null>(null);

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

  useEffect(() => {
    if (!selected) { setEvents(null); return; }
    setCourierDraft(selected.courierName ?? "");
    setTrackingDraft(selected.trackingNumber ?? "");
    setNotesDraft(selected.internalNotes ?? "");
    let alive = true;
    setEvents(null);
    api.getOrderEvents(selected.id)
      .then((list) => { if (alive) setEvents(list); })
      .catch((e) => { console.warn("[woodex admin] order events unavailable", e); if (alive) setEvents([]); });
    return () => { alive = false; };
    // only reset when the dialog target changes — draft edits must not clobber in-flight loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, api]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const changeStatus = async (order: AdminOrder, next: OrderStatus) => {
    setSavingStatus(true);
    const updated = await api.updateOrderStatus(order.id, next);
    setSavingStatus(false);
    if (updated) {
      setSelected({ ...updated, courierName: updated.courierName, trackingNumber: updated.trackingNumber, internalNotes: updated.internalNotes });
      setRows((rs) => rs.map((r) => (r.id === updated.id ? { ...r, status: updated.status } : r)));
      void refreshEvents(updated.id);
      toast.success(`Order ${updated.id} → ${next}`);
    }
  };

  const refreshEvents = async (orderId: string) => {
    try {
      const list = await api.getOrderEvents(orderId);
      setEvents(list);
    } catch {
      // timeline stays as-is when the ledger can't be reached
    }
  };

  const saveCourier = async () => {
    if (!selected) return;
    setSavingCourier(true);
    try {
      const updated = await api.updateOrderCourier(selected.id, {
        courierName: courierDraft,
        trackingNumber: trackingDraft,
        internalNotes: notesDraft,
      });
      if (updated) {
        setSelected({ ...updated });
        setRows((rs) => rs.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
        await refreshEvents(selected.id);
        toast.success("Dispatch details saved.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not save dispatch details.");
    } finally {
      setSavingCourier(false);
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

  const waHref = selected
    ? `https://wa.me/${whatsAppNumber(selected.customerPhone)}?text=${encodeURIComponent(`Hi ${selected.customerName.split(" ")[0]}, this is WOODEX about your order ${selected.id} — ${paymentLabel(selected.paymentMethod)}, total ${formatPKR(selected.total)}.`)}`
    : "#";

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

              {/* dispatch & fulfilment */}
              <div className="space-y-2 rounded-lg border border-muted p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Dispatch &amp; fulfilment</p>
                  <div className="flex items-center gap-1.5">
                    <a href={waHref} target="_blank" rel="noreferrer" aria-label="WhatsApp customer" title="Message customer on WhatsApp" className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1.5 text-xs font-medium text-foreground hover:border-hon-green-light hover:text-hon-green-dark">
                      <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                    <a href={`/admin/invoice/${selected.id}`} target="_blank" rel="noreferrer" aria-label="Print invoice" title="Open printable invoice" className="flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1.5 text-xs font-medium text-foreground hover:border-hon-green-light hover:text-hon-green-dark">
                      <Printer className="h-3.5 w-3.5" /> Invoice
                    </a>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input value={courierDraft} onChange={(e) => setCourierDraft(e.target.value)} placeholder="Courier (TCS, Leopards…)" aria-label="Courier name" className="h-9 bg-white text-xs" />
                  <Input value={trackingDraft} onChange={(e) => setTrackingDraft(e.target.value)} placeholder="Consignment / tracking #" aria-label="Consignment number" className="h-9 bg-white text-xs" />
                </div>
                <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Internal notes (gate code, call-back, damage…)" aria-label="Internal notes" rows={2} className="w-full rounded-md border border-input bg-white px-3 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-hon-green-light" />
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={saveCourier} disabled={savingCourier}>
                    {savingCourier ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                    Save dispatch details
                  </Button>
                </div>
              </div>

              {/* activity timeline */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Activity
                </div>
                {events === null ? (
                  <p className="text-xs text-muted-foreground">Loading timeline…</p>
                ) : events.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No recorded activity for this order yet.</p>
                ) : (
                  <ol className="max-h-44 space-y-1.5 overflow-y-auto pr-1 text-xs">
                    {[...events].reverse().map((ev) => (
                      <li key={ev.id} className="flex items-start gap-2 rounded-md bg-secondary px-2.5 py-2 leading-snug">
                        <span className="whitespace-nowrap text-[10px] leading-5 text-muted-foreground">{formatDateTime(ev.createdAt)}</span>
                        <span className="min-w-0 text-foreground">
                          {ev.fromStatus && ev.toStatus && (
                            <span className="mr-1.5 font-mono text-[10px] font-semibold uppercase text-muted-foreground">{ev.fromStatus} → {ev.toStatus}</span>
                          )}
                          {ev.note ?? "Status updated"}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
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
