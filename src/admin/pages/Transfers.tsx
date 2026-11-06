import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Loader2, Pencil, Trash2, ArrowLeftRight, PackageCheck, Send, Minus, X, Truck,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type {
  AdminProduct, AdminStockTransfer, TransferLocation, TransferStatus,
} from "@/api/types";
import {
  formatDate, timeAgo,
  TransferStatusBadge, SectionCard, SectionSkeleton, EmptyState,
} from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const STATUSES: Array<TransferStatus | "all"> = ["all", "draft", "in_transit", "received", "cancelled"];
const STATUS_LABEL: Record<TransferStatus | "all", string> = {
  all: "All statuses",
  draft: "Draft",
  in_transit: "In transit",
  received: "Received",
  cancelled: "Cancelled",
};

type LineDraft = { productId: string; name: string; sku?: string; image?: string; quantity: number };

export default function AdminTransfers() {
  const api = useMemo(() => getAdminApi(), []);

  /* list state */
  const [items, setItems] = useState<AdminStockTransfer[]>([]);
  const [locations, setLocations] = useState<TransferLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransferStatus | "all">("all");

  /* editor dialog state (create + edit drafts) */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminStockTransfer | null>(null);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  /* catalogue picker state */
  const [catQuery, setCatQuery] = useState("");
  const [catResults, setCatResults] = useState<AdminProduct[]>([]);
  const [catSearching, setCatSearching] = useState(false);

  /* receive dialog state */
  const [receiveTarget, setReceiveTarget] = useState<AdminStockTransfer | null>(null);
  const [receiptQty, setReceiptQty] = useState<Record<string, string>>({});
  const [receiving, setReceiving] = useState(false);

  /* dispatch + delete confirms */
  const [dispatchTarget, setDispatchTarget] = useState<AdminStockTransfer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminStockTransfer | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, locs] = await Promise.all([
        api.listStockTransfers({ status: statusFilter, query, perPage: 60 }),
        api.getTransferLocations(),
      ]);
      setItems(res.items);
      setLocations(locs);
    } catch {
      toast.error("Could not load stock transfers.");
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter, query]);

  useEffect(() => {
    load();
  }, [load]);

  /* debounced catalogue search */
  useEffect(() => {
    const q = catQuery.trim();
    if (!q) { setCatResults([]); return; }
    const t = setTimeout(() => {
      setCatSearching(true);
      api.listProducts({ query: q, perPage: 5 })
        .then((res) => setCatResults(res.items))
        .catch(() => setCatResults([]))
        .finally(() => setCatSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [api, catQuery]);

  const openCreate = () => {
    const warehouse = locations.find((l) => l.kind === "warehouse")?.id ?? locations[0]?.id ?? "";
    const hq = locations.find((l) => l.id !== warehouse)?.id ?? "";
    setEditTarget(null);
    setFromId(warehouse);
    setToId(hq);
    setLines([]);
    setNotes("");
    setCatQuery(""); setCatResults([]);
    setEditorOpen(true);
  };

  const openEdit = (t: AdminStockTransfer) => {
    if (t.status !== "draft") {
      toast.error(`Transfer ${t.id} is in ${STATUS_LABEL[t.status].toLowerCase()} — only drafts can be edited.`);
      return;
    }
    setEditTarget(t);
    setFromId(t.fromLocationId);
    setToId(t.toLocationId);
    setLines(t.lines.map((l) => ({ productId: l.productId, name: l.name, sku: l.sku, image: l.image, quantity: l.quantity })));
    setNotes(t.notes ?? "");
    setCatQuery(""); setCatResults([]);
    setEditorOpen(true);
  };

  const addCatalogueLine = (p: AdminProduct) => {
    setLines((d) => {
      const existing = d.find((l) => l.productId === p.id);
      if (existing) return d.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...d, { productId: p.id, name: p.name, sku: p.sku, image: p.image, quantity: 1 }];
    });
  };

  const save = async () => {
    if (!fromId) return toast.error("Pick a source location.");
    if (!toId) return toast.error("Pick a destination location.");
    if (fromId === toId) return toast.error("Source and destination must differ.");
    if (lines.length === 0) return toast.error("Add at least one catalogue line to the transfer.");
    setSaving(true);
    const linesPayload = lines.map((l) => ({ productId: l.productId, name: l.name, sku: l.sku, image: l.image, quantity: l.quantity }));
    try {
      if (editTarget) {
        const updated = await api.updateStockTransfer(editTarget.id, { fromLocationId: fromId, toLocationId: toId, notes: notes.trim() || undefined, lines: linesPayload });
        if (updated) toast.success(`${updated.id} saved.`);
      } else {
        const created = await api.createStockTransfer({ fromLocationId: fromId, toLocationId: toId, notes: notes.trim() || undefined, lines: linesPayload });
        toast.success(`${created.id} created as draft — dispatch it when the lorry leaves.`);
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the transfer.");
    } finally {
      setSaving(false);
    }
  };

  const doDispatch = async () => {
    if (!dispatchTarget) return;
    setActing(true);
    try {
      const updated = await api.dispatchStockTransfer(dispatchTarget.id);
      if (updated) toast.success(`${updated.id} dispatched — ${updated.toLocationName}. OUT movements logged; stock awaits receipt.`);
      setDispatchTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed.");
      setDispatchTarget(null);
    } finally {
      setActing(false);
    }
  };

  const openReceive = (t: AdminStockTransfer) => {
    const initial: Record<string, string> = {};
    for (const l of t.lines) {
      const remaining = l.quantity - l.receivedQuantity;
      if (remaining > 0) initial[l.id] = String(remaining);
    }
    setReceiptQty(initial);
    setReceiveTarget(t);
  };

  const doReceive = async () => {
    if (!receiveTarget) return;
    const receipts = receiveTarget.lines
      .map((l) => ({ lineId: l.id, quantity: Math.trunc(Number(receiptQty[l.id]) || 0) }))
      .filter((r) => r.quantity > 0);
    if (receipts.length === 0) return toast.error("Enter at least one received quantity.");
    setReceiving(true);
    try {
      const updated = await api.receiveStockTransfer(receiveTarget.id, receipts);
      if (updated) {
        toast.success(`${updated.id} — goods received recorded${updated.status === "received" ? " (fully received)" : " (partial)"}. Stock updated.`);
        setReceiveTarget(null);
        await load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Receipt failed.");
    } finally {
      setReceiving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setActing(true);
    try {
      const okFlag = await api.deleteStockTransfer(deleteTarget.id);
      if (okFlag) {
        toast.success(`${deleteTarget.id} deleted.`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Only draft transfers can be deleted.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setActing(false);
    }
  };

  const receivedUnits = (t: AdminStockTransfer) => t.lines.reduce((s, l) => s + l.receivedQuantity, 0);
  const totalUnits = (t: AdminStockTransfer) => t.lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search transfer, location…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search stock transfers"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TransferStatus | "all")}>
            <SelectTrigger className="w-36 bg-white" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
            <Plus className="mr-1.5 h-4 w-4" /> New Transfer
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Stock moves between the factory warehouse and the showrooms. <span className="font-semibold text-foreground">Dispatch</span> checks on-hand stock, deducts it and writes
        <span className="font-semibold text-foreground"> OUT transfer legs</span>; <span className="font-semibold text-foreground">Receipt</span> (full or partial) writes
        <span className="font-semibold text-foreground"> IN legs</span> back into available stock. Flow: draft → in transit → received. Only drafts can be edited or deleted.
      </p>

      <SectionCard title="Stock Transfers">
        {loading ? (
          <SectionSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="No transfers match"
            hint="Create a transfer — pick a source and destination, then add catalogue lines and dispatch when the lorry leaves."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transfer</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Dispatched / Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id} className={t.status === "received" ? "opacity-70 hover:bg-secondary" : "hover:bg-secondary"}>
                    <TableCell>
                      <p className="font-mono text-xs font-semibold">{t.id}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug">{t.fromLocationName}</p>
                      <p className="text-[11px] text-muted-foreground">→ {t.toLocationName}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {receivedUnits(t)}/{totalUnits(t)} units · {t.lines.length} line(s)
                      <span className="block text-[11px] text-muted-foreground max-w-[220px] truncate">{t.lines.map((l) => `${l.name} ×${l.quantity}`).join(", ")}</span>
                    </TableCell>
                    <TableCell><TransferStatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {t.status === "received" && t.receivedAt ? formatDate(t.receivedAt) : timeAgo(t.updatedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {t.status === "draft" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} aria-label={`Edit ${t.id}`} title="Edit transfer">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-sky-600 hover:text-sky-700" onClick={() => setDispatchTarget(t)} aria-label={`Dispatch ${t.id}`} title="Dispatch (deduct stock, OUT legs)">
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-600" onClick={() => setDeleteTarget(t)} aria-label={`Delete ${t.id}`} title="Delete draft">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {t.status === "in_transit" && (
                          <Button variant="outline" size="sm" className="h-8 border-sky-300 text-sky-700 hover:bg-sky-50 hover:text-sky-800" onClick={() => openReceive(t)} aria-label={`Receive ${t.id}`}>
                            <PackageCheck className="mr-1.5 h-4 w-4" /> Receive
                          </Button>
                        )}
                        {(t.status === "received" || t.status === "cancelled") && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">locked</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* editor dialog */}
      <Dialog open={editorOpen} onOpenChange={(open) => !saving && setEditorOpen(open)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-accent" /> {editTarget ? `Edit ${editTarget.id}` : "New stock transfer"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="trf-from">From</Label>
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger id="trf-from" aria-label="Source location"><SelectValue placeholder="Pick source…" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trf-to">To</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger id="trf-to" aria-label="Destination location"><SelectValue placeholder="Pick destination…" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* catalogue line picker */}
            <div className="space-y-1.5">
              <Label htmlFor="trf-cat">Add from catalogue</Label>
              <Input id="trf-cat" placeholder="Search catalogue — name, sku…" value={catQuery} onChange={(e) => setCatQuery(e.target.value)} />
              {catSearching && <p className="text-[11px] text-muted-foreground">Searching…</p>}
              {catResults.length > 0 && (
                <div className="rounded-md border border-border bg-white shadow-sm">
                  {catResults.map((p) => (
                    <button key={p.id} type="button" onClick={() => addCatalogueLine(p)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-secondary first:rounded-t-md last:rounded-b-md">
                      <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{p.sku ?? p.id} · {p.stock} on hand</span></span>
                      <Plus className="h-4 w-4 shrink-0 text-accent" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* lines */}
            <div className="space-y-1.5">
              <Label>Lines</Label>
              {lines.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">No lines yet — search the catalogue above.</p>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {lines.map((l, idx) => (
                    <div key={`${l.productId}-${idx}`} className="flex items-center gap-2 px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs">{l.name}{l.sku && <span className="text-muted-foreground"> · {l.sku}</span>}</span>
                      <div className="flex h-7 shrink-0 items-center rounded-md border border-border">
                        <button type="button" className="flex h-full w-6 items-center justify-center hover:bg-secondary" aria-label="Decrease quantity"
                          onClick={() => setLines((d) => d.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x))}>
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-7 text-center text-xs font-semibold tabular-nums">{l.quantity}</span>
                        <button type="button" className="flex h-full w-6 items-center justify-center hover:bg-secondary" aria-label="Increase quantity"
                          onClick={() => setLines((d) => d.map((x, i) => i === idx ? { ...x, quantity: x.quantity + 1 } : x))}>
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button type="button" className="shrink-0 text-muted-foreground hover:text-rose-500" aria-label="Remove line"
                        onClick={() => setLines((d) => d.filter((_, i) => i !== idx))}>
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trf-notes">Notes</Label>
              <Textarea id="trf-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Courier consignment number, delivery instructions…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {editTarget ? "Save changes" : "Create draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* dispatch confirm */}
      <Dialog open={!!dispatchTarget} onOpenChange={(open) => !open && !acting && setDispatchTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="h-4 w-4 text-accent" /> Dispatch {dispatchTarget?.id}?</DialogTitle>
          </DialogHeader>
          {dispatchTarget && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Stock for these lines leaves <span className="font-semibold text-foreground">available</span> and <span className="font-semibold text-foreground">OUT movements</span> are written to the ledger:</p>
              <ul className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs">
                {dispatchTarget.lines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 py-0.5"><span className="truncate">{l.name}</span><span className="tabular-nums font-medium">×{l.quantity}</span></li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">To → {dispatchTarget.toLocationName}. Goods stay “in transit” until received (on-hand returns on receipt).</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchTarget(null)} disabled={acting}>Cancel</Button>
            <Button onClick={doDispatch} disabled={acting} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {acting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* receive dialog — partial allowed */}
      <Dialog open={!!receiveTarget} onOpenChange={(open) => !open && !receiving && setReceiveTarget(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-accent" /> Receive {receiveTarget?.id}</DialogTitle>
          </DialogHeader>
          {receiveTarget && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Remaining quantities are pre-filled. Enter less to record a partial receipt — it stays in transit until every line is fully received. IN movements are written per receipt.</p>
              <div className="divide-y divide-border rounded-md border border-border">
                {receiveTarget.lines.filter((l) => l.receivedQuantity < l.quantity).map((l) => (
                  <div key={l.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{l.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{l.receivedQuantity}/{l.quantity} received</span>
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={l.quantity - l.receivedQuantity}
                      value={receiptQty[l.id] ?? ""}
                      onChange={(e) => setReceiptQty((d) => ({ ...d, [l.id]: e.target.value }))}
                      className="h-8 w-20 text-right tabular-nums"
                      aria-label={`Received units for ${l.name}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveTarget(null)} disabled={receiving}>Cancel</Button>
            <Button onClick={doReceive} disabled={receiving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {receiving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Receive goods
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !acting && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.id}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Only un-dispatched drafts can be deleted. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={acting}>Cancel</Button>
            <Button onClick={doDelete} disabled={acting} className="bg-rose-600 hover:bg-rose-700 text-white">
              {acting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
