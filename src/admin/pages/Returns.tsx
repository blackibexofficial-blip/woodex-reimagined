import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Undo2, Plus, Search, Loader2, PackageCheck, ClipboardCheck, Banknote, Replace, Ban, Minus, Send, Printer,
} from "lucide-react";
import { getAdminApi } from "@/api";
import type { AdminOrder, AdminReturn, ReturnReason, ReturnStatus } from "@/api/types";
import {
  formatPKR, timeAgo, ReturnStatusBadge, SectionCard, SectionSkeleton, EmptyState,
} from "@/admin/components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const REASON_LABELS: Record<ReturnReason, string> = {
  damaged: "Damaged in transit",
  wrong_item: "Wrong item delivered",
  not_as_described: "Not as described",
  changed_mind: "Changed mind",
  other: "Other",
};
const REASONS = Object.keys(REASON_LABELS) as ReturnReason[];
const STATUSES: Array<ReturnStatus | "all"> = ["all", "requested", "received", "inspected", "refunded", "replaced", "rejected"];
const TERMINAL: ReturnStatus[] = ["refunded", "replaced", "rejected"];

type ConfirmAction = "refund" | "replace" | "reject" | null;

export default function AdminReturns() {
  const api = useMemo(() => getAdminApi(), []);
  const [searchParams, setSearchParams] = useSearchParams();

  /* list state */
  const [items, setItems] = useState<AdminReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | "all">("all");

  /* detail dialog state */
  const [selected, setSelected] = useState<AdminReturn | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [refundDraft, setRefundDraft] = useState("");
  const [busy, setBusy] = useState(false);

  /* create dialog state */
  const [createOpen, setCreateOpen] = useState(false);
  const [deliveredOrders, setDeliveredOrders] = useState<AdminOrder[] | null>(null);
  const [orderId, setOrderId] = useState("");
  const [lineDraft, setLineDraft] = useState<Array<{ productId: string; name: string; image?: string; price: number; max: number; checked: boolean; qty: number }>>([]);
  const [reason, setReason] = useState<ReturnReason>("damaged");
  const [reasonDetail, setReasonDetail] = useState("");
  const [restock, setRestock] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listReturns({ status: statusFilter, query, perPage: 60 });
      setItems(res.items);
    } catch {
      toast.error("Could not load returns.");
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

  /* rebuild line draft when the chosen order changes */
  useEffect(() => {
    const order = deliveredOrders?.find((o) => o.id === orderId);
    if (!order) { setLineDraft([]); return; }
    setLineDraft(order.items.map((l) => ({
      productId: l.id, name: l.name, image: l.image, price: l.price, max: l.quantity, checked: true, qty: 1,
    })));
  }, [orderId, deliveredOrders]);

  /* sync the note/refund drafts when a different record opens */
  useEffect(() => {
    setNoteDraft(selected?.inspectionNote ?? "");
    setRefundDraft(String(selected?.refundAmount ?? ""));
    setConfirmAction(null);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPatch = async (patch: Parameters<typeof api.updateReturn>[1], success: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await api.updateReturn(selected.id, patch);
      if (updated) {
        setSelected(updated);
        setConfirmAction(null);
        toast.success(success);
        await load();
      } else {
        toast.error("Return not found — refresh and try again.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    const chosen = lineDraft.filter((l) => l.checked && l.qty > 0);
    if (!orderId) return toast.error("Pick the delivered order first.");
    if (chosen.length === 0) return toast.error("Select at least one line to return.");
    setCreating(true);
    try {
      const created = await api.createReturn({
        orderId,
        items: chosen.map((l) => ({ productId: l.productId, quantity: l.qty })),
        reason,
        reasonDetail: reasonDetail.trim() || undefined,
        restock,
      });
      if (created) {
        toast.success(`${created.id} opened for ${orderId}.`);
        setCreateOpen(false);
        setOrderId("");
        setLineDraft([]);
        setReasonDetail("");
        setReason("damaged");
        setRestock(true);
        await load();
      } else {
        toast.error("Order not found — only delivered orders can be returned.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the return.");
    } finally {
      setCreating(false);
    }
  };

  const isTerminal = selected ? TERMINAL.includes(selected.status) : false;
  const itemsQty = (r: AdminReturn) => r.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search RMA, order, customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search returns"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ReturnStatus | "all")}>
            <SelectTrigger className="w-40 bg-white" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
            <Plus className="mr-1.5 h-4 w-4" /> New return
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Returns are accepted within 7 days of delivery. Restock posts <code className="rounded bg-muted px-1">return</code> movements
        against inventory automatically when a package is marked received. The refund or replacement decision is recorded at
        inspection and noted on the order timeline.
      </p>

      <SectionCard title="Returns (RMA)">
        {loading ? (
          <SectionSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Undo2}
            title="No returns match"
            hint="Open a delivered order from the Orders screen and choose Request return, or create one here."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RMA</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-secondary" onClick={() => setSelected(r)}>
                    <TableCell className="font-mono text-xs font-semibold">{r.id}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.orderId}</TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug max-w-[160px]">{r.customerName}</p>
                      <p className="text-[11px] text-muted-foreground">{r.city}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[150px]">{REASON_LABELS[r.reason]}</TableCell>
                    <TableCell className="text-sm">{itemsQty(r)} × {r.items.length} line(s)</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatPKR(r.refundAmount ?? 0)}</TableCell>
                    <TableCell><ReturnStatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(r.updatedAt)}</TableCell>
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
            <DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5 text-hon-green-dark" /> New return request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label htmlFor="ret-order" className="mb-1.5 block text-xs font-medium text-muted-foreground">Delivered order</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger id="ret-order" className="bg-white" aria-label="Delivered order">
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
                <p className="mt-1.5 text-[11px] text-amber-700">No delivered orders yet — returns unlock once an order is marked delivered.</p>
              )}
            </div>

            {lineDraft.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Lines to return</p>
                <ul className="divide-y divide-muted rounded-lg border border-muted">
                  {lineDraft.map((l, i) => (
                    <li key={l.productId} className="flex items-center gap-3 p-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#1c3a2e]"
                        checked={l.checked}
                        onChange={(e) => setLineDraft((d) => d.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))}
                        aria-label={`Return ${l.name}`}
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ret-reason" className="mb-1.5 block text-xs font-medium text-muted-foreground">Reason</Label>
                <Select value={reason} onValueChange={(v) => setReason(v as ReturnReason)}>
                  <SelectTrigger id="ret-reason" className="bg-white" aria-label="Reason"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => <SelectItem key={r} value={r}>{REASON_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-muted p-3">
                <div>
                  <p className="text-xs font-medium leading-snug">Restock on receipt</p>
                  <p className="text-[11px] leading-4 text-muted-foreground">Adds units back to stock when marked received.</p>
                </div>
                <Switch checked={restock} onCheckedChange={setRestock} aria-label="Restock on receipt" />
              </div>
            </div>

            <div>
              <Label htmlFor="ret-detail" className="mb-1.5 block text-xs font-medium text-muted-foreground">Details <span className="font-normal">(optional)</span></Label>
              <Input id="ret-detail" value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} placeholder="e.g. Leg wobbles under load — customer sent a video" className="bg-white" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={creating || !orderId}>
              {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              {creating ? "Opening…" : "Open return request"}
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
                  <span className="font-mono">{selected.id} <span className="text-muted-foreground font-sans font-normal">· {selected.orderId}</span></span>
                  <ReturnStatusBadge status={selected.status} />
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-1 text-sm">
                {/* customer */}
                <div className="rounded-lg bg-secondary p-3">
                  <p className="font-semibold">{selected.customerName}</p>
                  <p className="text-xs text-muted-foreground">{selected.customerEmail} · {selected.city}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{selected.customerPhone}</p>
                </div>

                {/* items */}
                <ul className="divide-y divide-muted rounded-lg border border-muted">
                  {selected.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 p-3">
                      {item.image && <img src={item.image} alt="" className="h-12 w-12 rounded-md object-cover" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">Qty {item.quantity} × {formatPKR(item.price)}</p>
                      </div>
                      <span className="text-xs font-semibold">{formatPKR(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-muted p-3 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reason</p>
                    <p className="font-medium">{REASON_LABELS[selected.reason]}</p>
                    {selected.reasonDetail && <p className="mt-0.5 max-w-[260px] leading-snug text-muted-foreground">{selected.reasonDetail}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Refund</p>
                    <p className="text-base font-bold text-hon-green-dark">{formatPKR(selected.refundAmount ?? 0)}</p>
                  </div>
                </div>

                {/* requested: receipt step */}
                {selected.status === "requested" && (
                  <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Awaiting package</p>
                    <p className="text-xs leading-5 text-amber-900">When the parcel lands at the warehouse, mark it received. Restock happens at that moment.</p>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium">Restock on receipt</p>
                        <p className="text-[11px] text-amber-800">Posts return movements into inventory.</p>
                      </div>
                      <Switch checked={selected.restock} onCheckedChange={(v) => applyPatch({ restock: v }, v ? "Restock enabled." : "Restock disabled.")} aria-label="Restock on receipt" disabled={busy} />
                    </div>
                    <Button className="w-full" onClick={() => applyPatch({ status: "received" }, `${selected.id} marked received${selected.restock ? " — stock updated" : ""}.`)} disabled={busy}>
                      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />}
                      Mark received at warehouse
                    </Button>
                  </div>
                )}

                {/* received / inspected: inspection note + decision */}
                {(selected.status === "received" || selected.status === "inspected") && (
                  <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">{selected.status === "received" ? "Package received — inspect the units" : "Inspection done — record the decision"}</p>
                    <Textarea
                      rows={2}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Inspection note (condition, mismatch confirmed, damage photos…)"
                      aria-label="Inspection note"
                      className="bg-white text-xs"
                    />
                    {selected.status === "received" ? (
                      <Button className="w-full" variant="outline" onClick={() => applyPatch({ status: "inspected", inspectionNote: noteDraft }, `${selected.id} marked inspected.`)} disabled={busy}>
                        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-1.5 h-4 w-4" />}
                        Mark inspected
                      </Button>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <Button variant="outline" className="flex-col gap-1 h-auto py-2 text-emerald-800 border-emerald-300 hover:bg-emerald-50" onClick={() => setConfirmAction(confirmAction === "refund" ? null : "refund")} disabled={busy}>
                            <Banknote className="h-4 w-4" /><span className="text-[11px] font-semibold">Refund</span>
                          </Button>
                          <Button variant="outline" className="flex-col gap-1 h-auto py-2 text-sky-800 border-sky-300 hover:bg-sky-50" onClick={() => setConfirmAction(confirmAction === "replace" ? null : "replace")} disabled={busy}>
                            <Replace className="h-4 w-4" /><span className="text-[11px] font-semibold">Replace</span>
                          </Button>
                          <Button variant="outline" className="flex-col gap-1 h-auto py-2 text-rose-800 border-rose-300 hover:bg-rose-50" onClick={() => setConfirmAction(confirmAction === "reject" ? null : "reject")} disabled={busy}>
                            <Ban className="h-4 w-4" /><span className="text-[11px] font-semibold">Reject</span>
                          </Button>
                        </div>

                        {confirmAction && (
                          <div className="space-y-2 rounded-lg border border-border bg-white p-3">
                            {confirmAction === "refund" && (
                              <div>
                                <Label htmlFor="ret-refund" className="mb-1 block text-[11px] font-medium text-muted-foreground">Refund amount (PKR)</Label>
                                <Input id="ret-refund" type="number" inputMode="numeric" min={0} value={refundDraft} onChange={(e) => setRefundDraft(e.target.value)} className="bg-white" />
                              </div>
                            )}
                            <p className="text-xs leading-5 text-foreground">
                              {confirmAction === "refund" && <>Confirm refund of <span className="font-semibold">{formatPKR(Number(refundDraft) || 0)}</span> via the original payment method?</>}
                              {confirmAction === "replace" && <>Confirm replacement — the warehouse will dispatch new units against <span className="font-semibold">{selected.orderId}</span>.</>}
                              {confirmAction === "reject" && <>Reject this return. The inspection note above is recorded as the rejection reason on the order timeline.</>}
                            </p>
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setConfirmAction(null)}>Cancel</Button>
                              <Button
                                size="sm"
                                className={confirmAction === "reject" ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-emerald-700 hover:bg-emerald-800 text-white"}
                                onClick={() =>
                                  confirmAction === "refund"
                                    ? applyPatch({ status: "refunded", refundAmount: Number(refundDraft) || 0, inspectionNote: noteDraft }, `${selected.id} refunded.`)
                                    : confirmAction === "replace"
                                      ? applyPatch({ status: "replaced", inspectionNote: noteDraft }, `${selected.id} — replacement approved.`)
                                      : applyPatch({ status: "rejected", inspectionNote: noteDraft }, `${selected.id} rejected.`)
                                }
                                disabled={busy || (confirmAction === "refund" && !(Number(refundDraft) >= 0))}
                              >
                                {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                Confirm {confirmAction}
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* terminal summary */}
                {isTerminal && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
                    This return is closed ({selected.status}). The decision was noted on the {selected.orderId} timeline.
                    {selected.inspectionNote && <p className="mt-1 text-emerald-800">Note: {selected.inspectionNote}</p>}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">Opened {timeAgo(selected.createdAt)} · last updated {timeAgo(selected.updatedAt)}</p>
              </div>
              <DialogFooter>
                <a href={`/admin/return/${selected.id}`} target="_blank" rel="noreferrer" aria-label="Open printable return document" title="Printable return document" className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-medium text-foreground hover:border-hon-green-light hover:text-hon-green-dark"><Printer className="h-4 w-4" /> Print document</a>
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
