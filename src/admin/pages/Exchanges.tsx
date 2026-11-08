import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeftRight, Plus, Search, Loader2, Minus, X, Send, Truck, PackageCheck, BadgeCheck, Ban, ArrowRight, Printer,
} from "lucide-react";
import { getAdminApi } from "@/api";
import type { AdminExchange, AdminOrder, AdminProduct, ExchangeStatus } from "@/api/types";
import {
  formatPKR, timeAgo, ExchangeStatusBadge, SectionCard, SectionSkeleton, EmptyState,
} from "@/admin/components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUSES: Array<ExchangeStatus | "all"> = ["all", "requested", "approved", "shipped", "completed", "rejected"];
const TERMINAL: ExchangeStatus[] = ["completed", "rejected"];

const diffLabel = (diff: number) =>
  diff === 0 ? "Nil" : diff > 0 ? `+${formatPKR(diff)}` : `−${formatPKR(-diff)}`;
const diffHint = (diff: number) =>
  diff === 0
    ? "No price difference — straight swap."
    : diff > 0
      ? `Customer pays ${formatPKR(diff)} — collect on delivery or take advance.`
      : `Refund ${formatPKR(-diff)} to the customer via the original payment method.`;

export default function AdminExchanges() {
  const api = useMemo(() => getAdminApi(), []);
  const [searchParams, setSearchParams] = useSearchParams();

  /* list state */
  const [items, setItems] = useState<AdminExchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ExchangeStatus | "all">("all");

  /* detail dialog state */
  const [selected, setSelected] = useState<AdminExchange | null>(null);
  const [busy, setBusy] = useState(false);

  /* create dialog state */
  const [createOpen, setCreateOpen] = useState(false);
  const [deliveredOrders, setDeliveredOrders] = useState<AdminOrder[] | null>(null);
  const [orderId, setOrderId] = useState("");
  const [linkedReturns, setLinkedReturns] = useState<Array<{ id: string; status: string }>>([]);
  const [returnId, setReturnId] = useState("");
  const [lineDraft, setLineDraft] = useState<Array<{ productId: string; name: string; image?: string; price: number; max: number; checked: boolean; qty: number }>>([]);
  const [outgoing, setOutgoing] = useState<Array<{ productId: string; name: string; image?: string; price: number; qty: number }>>([]);
  const [outQuery, setOutQuery] = useState("");
  const [outResults, setOutResults] = useState<AdminProduct[]>([]);
  const [outSearching, setOutSearching] = useState(false);
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listExchanges({ status: statusFilter, query, perPage: 60 });
      setItems(res.items);
    } catch {
      toast.error("Could not load exchanges.");
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter, query]);

  useEffect(() => {
    load();
  }, [load]);

  /* consumed ?new=1&order=WDX-… deep link from the delivered-order dialog */
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const oid = searchParams.get("order") ?? "";
    setCreateOpen(true);
    if (oid) setOrderId(oid);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* load delivered orders when the create dialog opens */
  useEffect(() => {
    if (!createOpen || deliveredOrders !== null) return;
    api.listOrders({ status: "delivered", perPage: 50 })
      .then((res) => setDeliveredOrders(res.items))
      .catch(() => { setDeliveredOrders([]); toast.error("Could not load delivered orders."); });
  }, [api, createOpen, deliveredOrders]);

  /* rebuild incoming draft + fetch linkable returns when the order changes */
  useEffect(() => {
    const order = deliveredOrders?.find((o) => o.id === orderId);
    setReturnId("");
    setLinkedReturns([]);
    if (!order) { setLineDraft([]); return; }
    setLineDraft(order.items.map((l) => ({
      productId: l.id, name: l.name, image: l.image, price: l.price, max: l.quantity, checked: true, qty: 1,
    })));
    api.listReturns({ query: order.id, perPage: 10 })
      .then((res) => setLinkedReturns(res.items.filter((r) => r.orderId === order.id).map((r) => ({ id: r.id, status: r.status }))))
      .catch(() => setLinkedReturns([]));
  }, [api, orderId, deliveredOrders]);

  /* debounced product search for the outgoing picker */
  useEffect(() => {
    const q = outQuery.trim();
    if (!q) { setOutResults([]); return; }
    const t = setTimeout(() => {
      setOutSearching(true);
      api.listProducts({ query: q, perPage: 6 })
        .then((res) => setOutResults(res.items))
        .catch(() => setOutResults([]))
        .finally(() => setOutSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [api, outQuery]);

  const incomingTotal = useMemo(
    () => lineDraft.filter((l) => l.checked).reduce((s, l) => s + l.price * l.qty, 0),
    [lineDraft],
  );
  const outgoingTotal = useMemo(
    () => outgoing.reduce((s, l) => s + l.price * l.qty, 0),
    [outgoing],
  );
  const draftDifference = outgoingTotal - incomingTotal;

  const applyPatch = async (patch: Parameters<typeof api.updateExchange>[1], success: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await api.updateExchange(selected.id, patch);
      if (updated) {
        setSelected(updated);
        toast.success(success);
        await load();
      } else {
        toast.error("Exchange not found — refresh and try again.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const addOutgoing = (p: AdminProduct) => {
    setOutgoing((d) => {
      const existing = d.find((x) => x.productId === p.id);
      if (existing) return d.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x));
      return [...d, { productId: p.id, name: p.name, image: p.image, price: p.price, qty: 1 }];
    });
  };

  const submitCreate = async () => {
    const incomingSel = lineDraft.filter((l) => l.checked && l.qty > 0);
    if (!orderId) return toast.error("Pick the delivered order first.");
    if (incomingSel.length === 0) return toast.error("Select at least one item to take back.");
    if (outgoing.length === 0) return toast.error("Add at least one replacement item.");
    setCreating(true);
    try {
      const created = await api.createExchange({
        orderId,
        returnId: returnId || undefined,
        incoming: incomingSel.map((l) => ({ productId: l.productId, quantity: l.qty })),
        outgoing: outgoing.map((l) => ({ productId: l.productId, quantity: l.qty })),
        reason: reason.trim() || undefined,
      });
      if (created) {
        toast.success(`${created.id} opened for ${orderId}.`);
        setCreateOpen(false);
        setOrderId(""); setLineDraft([]); setOutgoing([]); setOutQuery(""); setOutResults([]); setReason(""); setReturnId("");
        await load();
      } else {
        toast.error("Order not found — only delivered orders can be exchanged.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the exchange.");
    } finally {
      setCreating(false);
    }
  };

  const isTerminal = selected ? TERMINAL.includes(selected.status) : false;
  const qtyOf = (lines: Array<{ quantity: number }>) => lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search EXC, order, customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search exchanges"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ExchangeStatus | "all")}>
            <SelectTrigger className="w-40 bg-white" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
            <Plus className="mr-1.5 h-4 w-4" /> New exchange
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Exchanges swap items on a delivered order. The price difference (replacement − returned) is shown on every step —
        positive means the customer pays it, negative means WOODEX refunds it. Stock moves out of inventory on dispatch and
        back in when the returned items are received, and each step is noted on the order timeline.
      </p>

      <SectionCard title="Exchanges">
        {loading ? (
          <SectionSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No exchanges match"
            hint="Open a delivered order from the Orders screen and choose Request exchange, or create one here."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exchange</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>In → Out</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <TableRow key={e.id} className="cursor-pointer hover:bg-secondary" onClick={() => setSelected(e)}>
                    <TableCell>
                      <p className="font-mono text-xs font-semibold">{e.id}</p>
                      {e.returnId && <p className="font-mono text-[10px] text-muted-foreground">↔ {e.returnId}</p>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.orderId}</TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug max-w-[160px]">{e.customerName}</p>
                      <p className="text-[11px] text-muted-foreground">{e.city}</p>
                    </TableCell>
                    <TableCell className="text-sm">{qtyOf(e.incoming)} → {qtyOf(e.outgoing)}</TableCell>
                    <TableCell className={`text-right text-sm font-medium ${e.priceDifference > 0 ? "text-sky-800" : e.priceDifference < 0 ? "text-amber-800" : "text-muted-foreground"}`}>
                      {diffLabel(e.priceDifference)}{e.priceDifference !== 0 && !e.differenceSettled && <span className="ml-1 text-[10px] text-muted-foreground" title="Difference not settled yet">•</span>}
                    </TableCell>
                    <TableCell><ExchangeStatusBadge status={e.status} /></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(e.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* ── create dialog ─────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-hon-green-dark" /> New exchange</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label htmlFor="exc-order" className="mb-1.5 block text-xs font-medium text-muted-foreground">Delivered order</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger id="exc-order" className="bg-white" aria-label="Delivered order">
                  <SelectValue placeholder={deliveredOrders === null ? "Loading delivered orders…" : "Pick a delivered order…"} />
                </SelectTrigger>
                <SelectContent>
                  {(deliveredOrders ?? []).slice(0, 30).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.id} — {o.customerName} · {formatPKR(o.total)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {deliveredOrders !== null && deliveredOrders.length === 0 && (
                <p className="mt-1.5 text-[11px] text-amber-700">No delivered orders yet — exchanges unlock once an order is marked delivered.</p>
              )}
            </div>

            {orderId && linkedReturns.length > 0 && (
              <div>
                <Label htmlFor="exc-return" className="mb-1.5 block text-xs font-medium text-muted-foreground">Link to a return <span className="font-normal">(optional)</span></Label>
                <Select value={returnId || "none"} onValueChange={(v) => setReturnId(v === "none" ? "" : v)}>
                  <SelectTrigger id="exc-return" className="bg-white" aria-label="Linked return"><SelectValue placeholder="No linked return" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked return</SelectItem>
                    {linkedReturns.map((r) => <SelectItem key={r.id} value={r.id}>{r.id} — {r.status}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {lineDraft.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Taking back</p>
                <ul className="divide-y divide-muted rounded-lg border border-muted">
                  {lineDraft.map((l, i) => (
                    <li key={l.productId} className="flex items-center gap-3 p-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#1c3a2e]"
                        checked={l.checked}
                        onChange={(e) => setLineDraft((d) => d.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))}
                        aria-label={`Take back ${l.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{l.name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatPKR(l.price)} · ordered {l.max}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={!l.checked || l.qty <= 1}
                          onClick={() => setLineDraft((d) => d.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}
                          aria-label="Decrease quantity"><Minus className="h-3.5 w-3.5" /></Button>
                        <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={!l.checked || l.qty >= l.max}
                          onClick={() => setLineDraft((d) => d.map((x, j) => (j === i ? { ...x, qty: Math.min(x.max, x.qty + 1) } : x)))}
                          aria-label="Increase quantity"><Plus className="h-3.5 w-3.5" /></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Sending instead</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={outQuery} onChange={(e) => setOutQuery(e.target.value)} placeholder="Search the catalogue to add a replacement…" className="pl-9 bg-white" aria-label="Search replacement products" />
              </div>
              {outQuery.trim() && (
                <ul className="mt-2 divide-y divide-muted rounded-lg border border-muted max-h-44 overflow-y-auto">
                  {outSearching ? (
                    <li className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…</li>
                  ) : outResults.length === 0 ? (
                    <li className="p-3 text-xs text-muted-foreground">No products match “{outQuery.trim()}”.</li>
                  ) : (
                    outResults.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 p-2.5">
                        {p.image && <img src={p.image} alt="" className="h-10 w-10 rounded-md object-cover" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">{p.sku} · {formatPKR(p.price)}</p>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => addOutgoing(p)} aria-label={`Add ${p.name} as replacement`}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              )}
              {outgoing.length > 0 && (
                <ul className="mt-2 divide-y divide-muted rounded-lg border border-emerald-200 bg-emerald-50/40">
                  {outgoing.map((l, i) => (
                    <li key={l.productId} className="flex items-center gap-3 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{l.name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatPKR(l.price)} each</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={l.qty <= 1}
                          onClick={() => setOutgoing((d) => d.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}
                          aria-label="Decrease quantity"><Minus className="h-3.5 w-3.5" /></Button>
                        <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                        <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                          onClick={() => setOutgoing((d) => d.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))}
                          aria-label="Increase quantity"><Plus className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setOutgoing((d) => d.filter((_, j) => j !== i))} aria-label={`Remove ${l.name}`}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={`rounded-lg border px-4 py-3 text-xs ${draftDifference > 0 ? "border-sky-200 bg-sky-50 text-sky-900" : draftDifference < 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border bg-secondary text-muted-foreground"}`}>
              <p className="font-semibold">{draftDifference === 0 ? "Nil difference" : draftDifference > 0 ? `Customer pays ${formatPKR(draftDifference)}` : `Refund ${formatPKR(-draftDifference)} to customer`}</p>
              <p className="mt-0.5 leading-4">{diffHint(draftDifference)}</p>
            </div>

            <div>
              <Label htmlFor="exc-reason" className="mb-1.5 block text-xs font-medium text-muted-foreground">Reason <span className="font-normal">(optional)</span></Label>
              <Input id="exc-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective unit — swap for the alternate model" className="bg-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={creating || !orderId || outgoing.length === 0}>
              {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              {creating ? "Opening…" : "Open exchange"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── detail dialog ─────────────────────────────────────────── */}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">{selected.id} <span className="text-muted-foreground font-sans font-normal">· {selected.orderId}{selected.returnId ? ` · ↔ ${selected.returnId}` : ""}</span></span>
                  <ExchangeStatusBadge status={selected.status} />
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-1 text-sm">
                {/* customer */}
                <div className="rounded-lg bg-secondary p-3">
                  <p className="font-semibold">{selected.customerName}</p>
                  <p className="text-xs text-muted-foreground">{selected.customerEmail} · {selected.city}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{selected.customerPhone}</p>
                  {selected.reason && <p className="mt-1.5 text-xs text-foreground">{selected.reason}</p>}
                </div>

                {/* in → out */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Taking back</p>
                    <ul className="space-y-1.5">
                      {selected.incoming.map((l) => (
                        <li key={l.id} className="rounded-lg border border-muted p-2">
                          <p className="line-clamp-2 text-[11px] font-medium leading-snug">{l.name}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">Qty {l.quantity} × {formatPKR(l.price)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex h-full items-center pt-6"><ArrowRight className="h-5 w-5 text-muted-foreground" /></div>
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sending</p>
                    <ul className="space-y-1.5">
                      {selected.outgoing.map((l) => (
                        <li key={l.id} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
                          <p className="line-clamp-2 text-[11px] font-medium leading-snug">{l.name}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">Qty {l.quantity} × {formatPKR(l.price)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* difference banner + settled toggle */}
                <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs ${selected.priceDifference > 0 ? "border-sky-200 bg-sky-50 text-sky-900" : selected.priceDifference < 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border bg-secondary text-muted-foreground"}`}>
                  <div>
                    <p className="font-semibold">{selected.priceDifference === 0 ? "Nil difference" : selected.priceDifference > 0 ? `Customer pays ${formatPKR(selected.priceDifference)}` : `Refund ${formatPKR(-selected.priceDifference)} to customer`}</p>
                    <p className="mt-0.5 max-w-[300px] leading-4">{diffHint(selected.priceDifference)}</p>
                    {selected.priceDifference !== 0 && (
                      <label className="mt-2 flex cursor-pointer items-center gap-2 font-medium">
                        <Switch checked={selected.differenceSettled} onCheckedChange={(v) => applyPatch({ differenceSettled: v }, v ? "Difference marked settled." : "Difference marked pending.")} disabled={busy || isTerminal} aria-label="Difference settled" />
                        {selected.differenceSettled ? "Settled ✓" : "Mark settled"}
                      </label>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide opacity-75">Difference</p>
                    <p className="text-lg font-bold">{diffLabel(selected.priceDifference)}</p>
                  </div>
                </div>

                {/* stage actions */}
                {selected.status === "requested" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="text-rose-800 border-rose-300 hover:bg-rose-50" onClick={() => applyPatch({ status: "rejected" }, `${selected.id} rejected.`)} disabled={busy}>
                      <Ban className="mr-1.5 h-4 w-4" /> Reject
                    </Button>
                    <Button onClick={() => applyPatch({ status: "approved" }, `${selected.id} approved.`)} disabled={busy}>
                      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-1.5 h-4 w-4" />} Approve
                    </Button>
                  </div>
                )}
                {selected.status === "approved" && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">Approved — dispatch the replacement</p>
                    <p className="mt-1 text-xs leading-5 text-violet-900">Dispatching moves the replacement units out of stock and notes the hand-off on the order timeline.</p>
                    <Button className="mt-2 w-full" onClick={() => applyPatch({ status: "shipped" }, `${selected.id} — replacement dispatched (stock updated).`)} disabled={busy}>
                      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Truck className="mr-1.5 h-4 w-4" />} Mark replacement dispatched
                    </Button>
                  </div>
                )}
                {selected.status === "shipped" && (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">Dispatched — waiting for the returned items</p>
                    <p className="mt-1 text-xs leading-5 text-sky-900">Completing the exchange restocks the returned units into inventory and closes the loop on the order timeline.</p>
                    <Button className="mt-2 w-full" variant="outline" onClick={() => applyPatch({ status: "completed" }, `${selected.id} completed — returned units restocked.`)} disabled={busy}>
                      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />} Mark completed (restock returned)
                    </Button>
                  </div>
                )}
                {isTerminal && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
                    This exchange is closed ({selected.status}). The decision was noted on the {selected.orderId} timeline.
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">Opened {timeAgo(selected.createdAt)} · last updated {timeAgo(selected.updatedAt)}</p>
              </div>
              <DialogFooter>
                <a href={`/admin/exchange/${selected.id}`} target="_blank" rel="noreferrer" aria-label="Open printable exchange document" title="Printable exchange document" className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:border-hon-green-light hover:text-hon-green-dark"><Printer className="h-4 w-4" /> Print document</a>
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
