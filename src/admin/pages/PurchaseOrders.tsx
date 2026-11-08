import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Loader2, Pencil, Trash2, PackagePlus, ClipboardCheck, Send, Ban, Minus, X, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type {
  AdminProduct, AdminPurchaseOrder, AdminSupplier, PurchaseOrderStatus,
} from "@/api/types";
import {
  formatPKR, formatDate, timeAgo,
  PurchaseOrderStatusBadge, SectionCard, SectionSkeleton, EmptyState,
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

const STATUSES: Array<PurchaseOrderStatus | "all"> = ["all", "draft", "sent", "partial", "received", "cancelled"];

type LineDraft = { productId?: string; name: string; sku?: string; image?: string; costPrice: number; quantity: number };

export default function AdminPurchaseOrders() {
  const api = useMemo(() => getAdminApi(), []);

  /* list state */
  const [items, setItems] = useState<AdminPurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<AdminSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | "all">("all");

  /* editor dialog state (create + edit drafts) */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminPurchaseOrder | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  /* catalogue picker state */
  const [catQuery, setCatQuery] = useState("");
  const [catResults, setCatResults] = useState<AdminProduct[]>([]);
  const [catSearching, setCatSearching] = useState(false);

  /* free-line row state */
  const [freeName, setFreeName] = useState("");
  const [freeCost, setFreeCost] = useState("");
  const [freeQty, setFreeQty] = useState("1");

  /* receive dialog state */
  const [receiveTarget, setReceiveTarget] = useState<AdminPurchaseOrder | null>(null);
  const [receiptQty, setReceiptQty] = useState<Record<string, string>>({});
  const [receiving, setReceiving] = useState(false);

  /* delete + cancel confirms */
  const [deleteTarget, setDeleteTarget] = useState<AdminPurchaseOrder | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminPurchaseOrder | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sup] = await Promise.all([
        api.listPurchaseOrders({ status: statusFilter, query, perPage: 60 }),
        api.listSuppliers({ active: "active" }),
      ]);
      setItems(res.items);
      setSuppliers(sup);
    } catch {
      toast.error("Could not load purchase orders.");
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

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.costPrice * l.quantity, 0), [lines]);
  const lineUnits = (l: { quantity: number }) => l.quantity;

  const openCreate = () => {
    setEditTarget(null);
    setSupplierId(suppliers[0]?.id ?? "");
    setExpectedDate("");
    setLines([]);
    setNotes("");
    setCatQuery(""); setCatResults([]); setFreeName(""); setFreeCost(""); setFreeQty("1");
    setEditorOpen(true);
  };

  const openEdit = (t: AdminPurchaseOrder) => {
    if (t.status !== "draft") {
      toast.error(`PO ${t.id} is ${t.status} — only draft POs can be edited.`);
      return;
    }
    setEditTarget(t);
    setSupplierId(t.supplierId);
    setExpectedDate(t.expectedDate ?? "");
    setLines(t.lines.map((l) => ({ productId: l.productId, name: l.name, sku: l.sku, image: l.image, costPrice: l.costPrice, quantity: l.quantity })));
    setNotes(t.notes ?? "");
    setCatQuery(""); setCatResults([]);
    setEditorOpen(true);
  };

  const addCatalogueLine = (p: AdminProduct) => {
    setLines((d) => {
      const existing = d.find((l) => l.productId === p.id);
      if (existing) return d.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...d, { productId: p.id, name: p.name, sku: p.sku, image: p.image, costPrice: Math.max(1, Math.round(p.price * 0.6)), quantity: 1 }];
    });
  };

  const addFreeLine = () => {
    const n = freeName.trim();
    const cost = Math.max(0, Math.round(Number(freeCost) || 0));
    const qty = Math.max(1, Math.trunc(Number(freeQty) || 1));
    if (!n) return toast.error("Free line needs a name.");
    setLines((d) => [...d, { name: n, costPrice: cost, quantity: qty }]);
    setFreeName(""); setFreeCost(""); setFreeQty("1");
  };

  const save = async () => {
    const expected = expectedDate || undefined;
    const note = notes.trim() || undefined;
    const linesPayload = lines.map((l) => ({ productId: l.productId, name: l.name, sku: l.sku, image: l.image, costPrice: l.costPrice, quantity: l.quantity }));
    if (!supplierId) return toast.error("Pick a supplier first.");
    if (linesPayload.length === 0) return toast.error("Add at least one line to the purchase order.");
    setSaving(true);
    try {
      if (editTarget) {
        const updated = await api.updatePurchaseOrder(editTarget.id, { supplierId, expectedDate: expected, notes: note, lines: linesPayload });
        if (updated) toast.success(`${updated.id} saved.`);
      } else {
        const created = await api.createPurchaseOrder({ supplierId, expectedDate: expected, notes: note, lines: linesPayload });
        toast.success(`${created.id} created as draft — mark it sent when you confirm with the supplier.`);
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the purchase order.");
    } finally {
      setSaving(false);
    }
  };

  const markSent = async (t: AdminPurchaseOrder) => {
    setActing(true);
    try {
      const updated = await api.setPurchaseOrderStatus(t.id, "sent");
      if (updated) toast.success(`${t.id} marked sent.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the PO.");
    } finally {
      setActing(false);
    }
  };

  const openReceive = (t: AdminPurchaseOrder) => {
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
      const updated = await api.receivePurchaseOrder(receiveTarget.id, receipts);
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

  const doCancel = async () => {
    if (!cancelTarget) return;
    setActing(true);
    try {
      const updated = await api.setPurchaseOrderStatus(cancelTarget.id, "cancelled");
      if (updated) toast.success(`${cancelTarget.id} cancelled.`);
      setCancelTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the PO.");
    } finally {
      setActing(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setActing(true);
    try {
      const okFlag = await api.deletePurchaseOrder(deleteTarget.id);
      if (okFlag) {
        toast.success(`${deleteTarget.id} deleted.`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Only draft POs can be deleted.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setActing(false);
    }
  };

  const receivedUnits = (t: AdminPurchaseOrder) => t.lines.reduce((s, l) => s + l.receivedQuantity, 0);
  const totalUnits = (t: AdminPurchaseOrder) => t.lines.reduce((s, l) => s + lineUnits(l), 0);
  const overdue = (t: AdminPurchaseOrder) =>
    t.expectedDate && (t.status === "sent" || t.status === "partial") && new Date(t.expectedDate).getTime() < Date.now();

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search PO, supplier, notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search purchase orders"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PurchaseOrderStatus | "all")}>
            <SelectTrigger className="w-36 bg-white" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
            <Plus className="mr-1.5 h-4 w-4" /> New PO
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Purchase orders replenish stock from suppliers. Receiving against a PO writes <span className="font-semibold text-foreground">inbound stock movements</span> and
        lifts on-hand stock immediately. Flow: draft → sent → partial → received. Cancel only before anything is received.
      </p>

      <SectionCard title="Purchase Orders">
        {loading ? (
          <SectionSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={PackagePlus}
            title="No purchase orders match"
            hint="Create a PO against a supplier — lines, expected date and costs — then receive against it when goods arrive."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id} className={t.status === "cancelled" ? "opacity-60" : "hover:bg-secondary"}>
                    <TableCell>
                      <p className="font-mono text-xs font-semibold">{t.id}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug max-w-[180px]">{t.supplierName}</p>
                      <p className="text-[11px] text-muted-foreground">{t.supplierId}</p>
                    </TableCell>
                    <TableCell className="text-sm">{receivedUnits(t)}/{totalUnits(t)} units · {t.lines.length} line(s)</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatPKR(t.subtotal)}</TableCell>
                    <TableCell className={cn("text-xs", overdue(t) ? "font-semibold text-rose-600" : "text-muted-foreground")}>
                      {t.expectedDate ? formatDate(t.expectedDate) : "—"}{overdue(t) && <span className="block text-[10px] uppercase">overdue</span>}
                    </TableCell>
                    <TableCell><PurchaseOrderStatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(t.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <a href={`/admin/purchase-order/${t.id}`} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-border hover:text-foreground" aria-label={`Print ${t.id}`} title="Printable purchase order"><Printer className="h-4 w-4" /></a>
                        {t.status === "draft" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} aria-label={`Edit ${t.id}`} title="Edit PO">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-sky-700 hover:text-sky-800" onClick={() => markSent(t)} disabled={acting} aria-label={`Mark ${t.id} sent`} title="Mark sent">
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(t)} aria-label={`Delete ${t.id}`} title="Delete draft PO">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {(t.status === "sent" || t.status === "partial") && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-700 hover:text-emerald-800" onClick={() => openReceive(t)} aria-label={`Receive against ${t.id}`} title="Receive goods">
                              <ClipboardCheck className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setCancelTarget(t)} aria-label={`Cancel ${t.id}`} title="Cancel PO">
                              <Ban className="h-4 w-4" />
                            </Button>
                          </>
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

      {/* ── create / edit dialog ──────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={(open) => !open && setEditorOpen(false)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-hon-green-dark" /> {editTarget ? `Edit ${editTarget.id}` : "New purchase order"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="po-supplier" className="mb-1.5 block text-xs font-medium text-muted-foreground">Supplier *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="po-supplier" className="bg-white" aria-label="Supplier"><SelectValue placeholder="Pick a supplier…" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.id} — {s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="po-expected" className="mb-1.5 block text-xs font-medium text-muted-foreground">Expected date</Label>
                <Input id="po-expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="bg-white" />
              </div>
            </div>

            {/* catalogue picker */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Add from catalogue <span className="font-normal">(cost defaults to 60% of retail — edit per line)</span></p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder="Search products…" className="pl-9 bg-white" aria-label="Search catalogue products" />
              </div>
              {catQuery.trim() && (
                <ul className="mt-2 divide-y divide-muted rounded-lg border border-muted max-h-40 overflow-y-auto">
                  {catSearching ? (
                    <li className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…</li>
                  ) : catResults.length === 0 ? (
                    <li className="p-3 text-xs text-muted-foreground">No products match “{catQuery.trim()}”.</li>
                  ) : (
                    catResults.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 p-2.5">
                        {p.image && <img src={p.image} alt="" className="h-9 w-9 rounded-md object-cover" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">{p.sku} · retail {formatPKR(p.price)}</p>
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => addCatalogueLine(p)} aria-label={`Add ${p.name}`}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              )}
              {/* free line */}
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-2.5">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="po-free-name" className="mb-1 block text-[10px] font-medium text-muted-foreground">Free line (not in catalogue)</Label>
                  <Input id="po-free-name" value={freeName} onChange={(e) => setFreeName(e.target.value)} placeholder="e.g. Soft-close hinges 107°" className="h-9 bg-white text-xs" />
                </div>
                <div className="w-28">
                  <Label htmlFor="po-free-cost" className="mb-1 block text-[10px] font-medium text-muted-foreground">Cost (PKR)</Label>
                  <Input id="po-free-cost" type="number" min={0} inputMode="numeric" value={freeCost} onChange={(e) => setFreeCost(e.target.value)} placeholder="0" className="h-9 bg-white text-xs" />
                </div>
                <div className="w-16">
                  <Label htmlFor="po-free-qty" className="mb-1 block text-[10px] font-medium text-muted-foreground">Qty</Label>
                  <Input id="po-free-qty" type="number" min={1} inputMode="numeric" value={freeQty} onChange={(e) => setFreeQty(e.target.value)} className="h-9 bg-white text-xs" />
                </div>
                <Button type="button" variant="outline" className="h-9" onClick={addFreeLine}><Plus className="mr-1 h-4 w-4" /> Add</Button>
              </div>
            </div>

            {/* lines */}
            {lines.length > 0 && (
              <ul className="divide-y divide-muted rounded-lg border border-muted">
                {lines.map((l, i) => (
                  <li key={`${l.productId ?? "free"}-${i}`} className="flex items-center gap-3 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{l.name}</p>
                      <p className="text-[11px] text-muted-foreground">{l.sku ?? "free line"}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number" min={0} aria-label="Unit cost"
                        value={l.costPrice}
                        onChange={(e) => setLines((d) => d.map((x, j) => (j === i ? { ...x, costPrice: Math.max(0, Math.round(Number(e.target.value) || 0)) } : x)))}
                        className="h-7 w-24 bg-white text-right text-xs"
                      />
                      <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={l.quantity <= 1}
                        onClick={() => setLines((d) => d.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}
                        aria-label="Decrease quantity"><Minus className="h-3.5 w-3.5" /></Button>
                      <span className="w-7 text-center text-sm font-semibold">{l.quantity}</span>
                      <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                        onClick={() => setLines((d) => d.map((x, j) => (j === i ? { ...x, quantity: x.quantity + 1 } : x)))}
                        aria-label="Increase quantity"><Plus className="h-3.5 w-3.5" /></Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setLines((d) => d.filter((_, j) => j !== i))} aria-label={`Remove ${l.name}`}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div />
              <div className="text-right text-xs text-muted-foreground">
                <p className="mt-0.5 text-sm font-bold text-foreground">Total cost {formatPKR(subtotal)}</p>
              </div>
            </div>

            <div>
              <Label htmlFor="po-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">Internal note</Label>
              <Textarea id="po-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment terms, advance, delivery instructions…" className="bg-white text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-1.5 h-4 w-4" />}
              {saving ? "Saving…" : editTarget ? "Save changes" : "Create PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── receive dialog ─────────────────────────────────────────── */}
      <Dialog open={receiveTarget !== null} onOpenChange={(open) => !open && setReceiveTarget(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Receive against {receiveTarget?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 text-sm">
            <p className="text-xs leading-5 text-muted-foreground">
              Enter units received now — catalogue lines lift on-hand stock and write <span className="font-semibold text-foreground">inbound movements</span> immediately.
              Partial receipts keep the PO open; fully received lines complete the PO.
            </p>
            <ul className="divide-y divide-muted rounded-lg border border-muted">
              {receiveTarget?.lines.map((l) => {
                const remaining = l.quantity - l.receivedQuantity;
                return (
                  <li key={l.id} className="flex items-center gap-3 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{l.name}</p>
                      <p className="text-[11px] text-muted-foreground">{l.receivedQuantity}/{l.quantity} received{remaining > 0 ? ` · ${remaining} remaining` : " · complete"}</p>
                    </div>
                    {remaining > 0 ? (
                      <Input
                        type="number" min={0} max={remaining} inputMode="numeric"
                        aria-label={`Receive ${l.name}`}
                        value={receiptQty[l.id] ?? "0"}
                        onChange={(e) => setReceiptQty((d) => ({ ...d, [l.id]: e.target.value }))}
                        className="h-8 w-20 bg-white text-right text-xs"
                      />
                    ) : (
                      <span className="text-[11px] font-semibold text-emerald-700">Done</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveTarget(null)}>Close</Button>
            <Button onClick={doReceive} disabled={receiving}>
              {receiving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-1.5 h-4 w-4" />}
              {receiving ? "Receiving…" : "Receive goods"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── cancel confirm ─────────────────────────────────────────── */}
      <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {cancelTarget?.id}?</DialogTitle>
          </DialogHeader>
          <p className="py-1 text-xs leading-5 text-muted-foreground">
            Cancelling is only possible before any goods are received. The PO stays on record as cancelled.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Keep PO</Button>
            <Button variant="destructive" onClick={doCancel} disabled={acting}>
              {acting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Ban className="mr-1.5 h-4 w-4" />}
              {acting ? "Cancelling…" : "Cancel PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── delete confirm ─────────────────────────────────────────── */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.id}?</DialogTitle>
          </DialogHeader>
          <p className="py-1 text-xs leading-5 text-muted-foreground">
            Only draft POs can be deleted. Sent POs must be cancelled instead — they stay on record.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep PO</Button>
            <Button variant="destructive" onClick={doDelete} disabled={acting}>
              {acting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              {acting ? "Deleting…" : "Delete PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
