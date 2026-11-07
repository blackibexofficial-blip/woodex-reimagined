import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FileEdit, Plus, Search, Loader2, Minus, X, Trash2, Pencil, PackageCheck, ShoppingCart,
} from "lucide-react";
import { getAdminApi } from "@/api";
import type { AdminDraftOrder, AdminProduct, DraftOrderStatus, PaymentMethod } from "@/api/types";
import {
  formatPKR, timeAgo, paymentLabel, DraftOrderStatusBadge, SectionCard, SectionSkeleton, EmptyState,
} from "@/admin/components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const STATUSES: Array<DraftOrderStatus | "all"> = ["all", "draft", "converted"];
const PAYMENT_METHODS: PaymentMethod[] = ["cod", "bank-transfer", "easypaisa", "jazzcash", "card"];

type LineDraft = { productId?: string; name: string; price: number; quantity: number; image?: string };


export default function AdminDrafts() {
  const api = useMemo(() => getAdminApi(), []);

  /* list state */
  const [items, setItems] = useState<AdminDraftOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DraftOrderStatus | "all">("all");

  /* editor dialog state (create + edit) */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminDraftOrder | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [shipping, setShipping] = useState("1500");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  /* catalogue picker state */
  const [catQuery, setCatQuery] = useState("");
  const [catResults, setCatResults] = useState<AdminProduct[]>([]);
  const [catSearching, setCatSearching] = useState(false);

  /* free-line row state */
  const [freeName, setFreeName] = useState("");
  const [freePrice, setFreePrice] = useState("");
  const [freeQty, setFreeQty] = useState("1");

  /* convert dialog state */
  const [convertTarget, setConvertTarget] = useState<AdminDraftOrder | null>(null);
  const [convertMethod, setConvertMethod] = useState<PaymentMethod>("cod");
  const [converting, setConverting] = useState(false);
  /* reprice preview state (convert dialog) */
  const [previewPrices, setPreviewPrices] = useState<Map<string, number>>(new Map());
  const [overrideInputs, setOverrideInputs] = useState<Record<number, string>>({});
  const [previewLoading, setPreviewLoading] = useState(false);

  /* delete confirm */
  const [deleteTarget, setDeleteTarget] = useState<AdminDraftOrder | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listDraftOrders({ status: statusFilter, query, perPage: 60 });
      setItems(res.items);
    } catch {
      toast.error("Could not load drafts.");
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

  const linesTotal = useMemo(() => lines.reduce((s, l) => s + l.price * l.quantity, 0), [lines]);
  const shippingNum = Math.max(0, Math.round(Number(shipping) || 0));
  const grandTotal = linesTotal + shippingNum;

  /* convert-dialog preview: effective prices = override ?? catalogue ?? draft (freehand needs override) */
  const overrideByLine = useMemo(() => {
    const m = new Map<number, number>();
    for (const [idx, raw] of Object.entries(overrideInputs)) {
      const rawT = raw.trim();
      if (rawT === "") continue;
      const price = Math.round(Number(rawT));
      if (Number.isFinite(price) && price >= 0) m.set(Number(idx), price);
    }
    return m;
  }, [overrideInputs]);
  const preview = useMemo(() => {
    if (!convertTarget) return null;
    let subtotal = 0;
    let needsPricing = false;
    const finalPrices: number[] = [];
    convertTarget.items.forEach((line, idx) => {
      const cat = previewPrices.get(line.id);
      const override = overrideByLine.get(idx);
      const price = override ?? cat ?? line.price;
      if (cat === undefined && override === undefined) needsPricing = true;
      finalPrices.push(price);
      subtotal += price * line.quantity;
    });
    return { finalPrices, subtotal, needsPricing };
  }, [convertTarget, previewPrices, overrideByLine]);

  const openCreate = () => {
    setEditTarget(null);
    setName(""); setPhone(""); setEmail(""); setCity(""); setAddress("");
    setLines([]); setShipping("1500"); setNotes("");
    setCatQuery(""); setCatResults([]); setFreeName(""); setFreePrice(""); setFreeQty("1");
    setEditorOpen(true);
  };

  const openEdit = (t: AdminDraftOrder) => {
    if (t.status === "converted") {
      toast.error(`Draft ${t.id} is converted — it can no longer be edited.`);
      return;
    }
    setEditTarget(t);
    setName(t.customerName); setPhone(t.customerPhone); setEmail(t.customerEmail);
    setCity(t.city ?? ""); setAddress(t.address ?? "");
    setLines(t.items.map((i) => ({ productId: i.id.startsWith("free-") ? undefined : i.id, name: i.name, price: i.price, quantity: i.quantity, image: i.image })));
    setShipping(String(t.shipping));
    setNotes(t.notes ?? "");
    setCatQuery(""); setCatResults([]);
    setEditorOpen(true);
  };

  const addCatalogueLine = (p: AdminProduct) => {
    setLines((d) => {
      const existing = d.find((l) => l.productId === p.id);
      if (existing) return d.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...d, { productId: p.id, name: p.name, price: p.price, quantity: 1, image: p.image }];
    });
  };

  const addFreeLine = () => {
    const n = freeName.trim();
    const price = Math.round(Number(freePrice) || 0);
    const qty = Math.max(1, Math.trunc(Number(freeQty) || 1));
    if (!n) return toast.error("Free line needs a name.");
    if (price <= 0) return toast.error("Free line needs a price.");
    setLines((d) => [...d, { name: n, price, quantity: qty }]);
    setFreeName(""); setFreePrice(""); setFreeQty("1");
  };

  const saveDraft = async () => {
    const payload = {
      customerName: name.trim(),
      customerPhone: phone.trim(),
      customerEmail: email.trim() || undefined,
      city: city.trim() || undefined,
      address: address.trim() || undefined,
      items: lines.map((l) => ({ productId: l.productId, name: l.name, price: l.price, quantity: l.quantity, image: l.image })),
      shipping: shippingNum,
      notes: notes.trim() || undefined,
    };
    if (!payload.customerName) return toast.error("Customer name is required.");
    if (!payload.customerPhone) return toast.error("Customer phone is required.");
    if (payload.items.length === 0) return toast.error("Add at least one line.");
    setSaving(true);
    try {
      if (editTarget) {
        const updated = await api.updateDraftOrder(editTarget.id, payload);
        if (updated) toast.success(`${updated.id} saved.`);
      } else {
        const created = await api.createDraftOrder(payload);
        toast.success(`${created.id} saved as draft.`);
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the draft.");
    } finally {
      setSaving(false);
    }
  };

  const openConvert = (t: AdminDraftOrder) => {
    if (t.status === "converted") return;
    setConvertMethod("cod");
    setOverrideInputs({});
    setPreviewPrices(new Map());
    setPreviewLoading(true);
    setConvertTarget(t);
    api.listProducts({ perPage: 300 })
      .then((res) => setPreviewPrices(new Map(res.items.map((p) => [p.id, p.price]))))
      .catch(() => setPreviewPrices(new Map()))
      .finally(() => setPreviewLoading(false));
  };

  const doConvert = async () => {
    if (!convertTarget || !preview) return;
    if (preview.needsPricing) {
      toast.error("Freehand (non-catalogue) lines need a negotiated price you set first.");
      return;
    }
    const overrides = Object.entries(overrideInputs)
      .filter(([, raw]) => raw.trim() !== "")
      .map(([idx, raw]) => ({ line: Number(idx), price: Math.round(Number(raw)) }))
      .filter((o) => Number.isFinite(o.price) && o.price >= 0);
    setConverting(true);
    try {
      const order = await api.convertDraftOrder(convertTarget.id, convertMethod, overrides.length ? overrides : undefined);
      if (order) {
        toast.success(`${convertTarget.id} converted → ${order.id} (${paymentLabel(order.paymentMethod)}). Stock deducts on dispatch as usual.`);
        setOverrideInputs({});
        setConvertTarget(null);
        await load();
      } else {
        toast.error("Draft not found or already converted.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Conversion failed.");
    } finally {
      setConverting(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const okFlag = await api.deleteDraftOrder(deleteTarget.id);
      if (okFlag) {
        toast.success(`${deleteTarget.id} deleted.`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Draft is converted or missing — it stays on record.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const linesQty = (t: AdminDraftOrder) => t.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search DRF, customer, note…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search draft orders"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DraftOrderStatus | "all")}>
            <SelectTrigger className="w-36 bg-white" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
            <Plus className="mr-1.5 h-4 w-4" /> New draft
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Drafts never touch stock, customers or WhatsApp. Lines come from the catalogue or as free lines. Converting a draft
        creates a <span className="font-semibold text-foreground">pending order</span> via the normal order path — it then
        flows through Pending → Processing → Shipped → Delivered like any other order (source channel: manual).
      </p>

      <SectionCard title="Draft Orders">
        {loading ? (
          <SectionSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={FileEdit}
            title="No drafts match"
            hint="Build a manual order — customer + catalogue/free lines — and save it for later or convert it immediately."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Draft</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id} className={t.status === "converted" ? "opacity-70" : "hover:bg-secondary"}>
                    <TableCell>
                      <p className="font-mono text-xs font-semibold">{t.id}</p>
                      {t.convertedOrderId && <p className="font-mono text-[10px] text-emerald-700">→ {t.convertedOrderId}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug max-w-[180px]">{t.customerName}</p>
                      <p className="text-[11px] text-muted-foreground">{t.city ?? t.customerPhone}</p>
                    </TableCell>
                    <TableCell className="text-sm">{linesQty(t)} × {t.items.length} line(s)</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatPKR(t.total)}</TableCell>
                    <TableCell><DraftOrderStatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(t.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} disabled={t.status === "converted"} aria-label={`Edit ${t.id}`} title={t.status === "converted" ? "Converted — locked" : "Edit draft"}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openConvert(t)} disabled={t.status === "converted"} aria-label={`Convert ${t.id} to order`} title="Convert to order">
                          <PackageCheck className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(t)} disabled={t.status === "converted"} aria-label={`Delete ${t.id}`} title="Delete draft">
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
            <DialogTitle className="flex items-center gap-2"><FileEdit className="h-5 w-5 text-hon-green-dark" /> {editTarget ? `Edit ${editTarget.id}` : "New draft order"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* customer */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="drf-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer name *</Label>
                <Input id="drf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Indus Developers — Procurement" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="drf-phone" className="mb-1.5 block text-xs font-medium text-muted-foreground">Phone *</Label>
                <Input id="drf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 3xx …" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="drf-email" className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</Label>
                <Input id="drf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="drf-city" className="mb-1.5 block text-xs font-medium text-muted-foreground">City</Label>
                <Input id="drf-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lahore" className="bg-white" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="drf-address" className="mb-1.5 block text-xs font-medium text-muted-foreground">Address</Label>
                <Input id="drf-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city" className="bg-white" />
              </div>
            </div>

            {/* catalogue picker */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Add from catalogue</p>
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
                          <p className="text-[11px] text-muted-foreground">{p.sku} · {formatPKR(p.price)}</p>
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
                  <Label htmlFor="free-name" className="mb-1 block text-[10px] font-medium text-muted-foreground">Free line (not in catalogue)</Label>
                  <Input id="free-name" value={freeName} onChange={(e) => setFreeName(e.target.value)} placeholder="e.g. Installation labour" className="h-9 bg-white text-xs" />
                </div>
                <div className="w-28">
                  <Label htmlFor="free-price" className="mb-1 block text-[10px] font-medium text-muted-foreground">Price (PKR)</Label>
                  <Input id="free-price" type="number" min={0} inputMode="numeric" value={freePrice} onChange={(e) => setFreePrice(e.target.value)} placeholder="0" className="h-9 bg-white text-xs" />
                </div>
                <div className="w-16">
                  <Label htmlFor="free-qty" className="mb-1 block text-[10px] font-medium text-muted-foreground">Qty</Label>
                  <Input id="free-qty" type="number" min={1} inputMode="numeric" value={freeQty} onChange={(e) => setFreeQty(e.target.value)} className="h-9 bg-white text-xs" />
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
                      <p className="text-[11px] text-muted-foreground">{formatPKR(l.price)} each{l.productId ? "" : " · free line"}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" variant="outline" size="icon" className="h-7 w-7" disabled={l.quantity <= 1}
                        onClick={() => setLines((d) => d.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}
                        aria-label="Decrease quantity"><Minus className="h-3.5 w-3.5" /></Button>
                      <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
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

            {/* shipping + totals */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="w-32">
                <Label htmlFor="drf-shipping" className="mb-1.5 block text-xs font-medium text-muted-foreground">Shipping (PKR)</Label>
                <Input id="drf-shipping" type="number" min={0} inputMode="numeric" value={shipping} onChange={(e) => setShipping(e.target.value)} className="bg-white" />
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Subtotal <span className="font-medium text-foreground">{formatPKR(linesTotal)}</span></p>
                <p>Shipping <span className="font-medium text-foreground">{shippingNum === 0 ? "FREE" : formatPKR(shippingNum)}</span></p>
                <p className="mt-0.5 text-sm font-bold text-foreground">Total {formatPKR(grandTotal)}</p>
              </div>
            </div>

            <div>
              <Label htmlFor="drf-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">Internal note <span className="font-normal">(staff only)</span></Label>
              <Textarea id="drf-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="PO reference, site contact, special instructions…" className="bg-white text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={saveDraft} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-1.5 h-4 w-4" />}
              {saving ? "Saving…" : editTarget ? "Save changes" : "Save draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── convert confirm + reprice preview ─────────────────────── */}
      <Dialog open={convertTarget !== null} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Convert {convertTarget?.id} into an order?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 text-sm">
            <p className="text-xs leading-5 text-muted-foreground">
              Prices recompute from the <span className="font-semibold text-foreground">current catalogue</span> at confirm
              (server-authoritative — draft totals are never trusted). Edit a line's price to negotiate it — overrides are
              audited and need order.manage on the server. Freehand lines must be priced explicitly. Shipping applies the
              zone rate for “{convertTarget?.city ?? "—"}” on confirm (dispatch-confirmed).
            </p>
            {previewLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-6 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading catalogue prices…
              </div>
            ) : preview && convertTarget ? (
              <div className="max-h-[46vh] overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary text-left">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Line</th>
                      <th className="px-2 py-1.5 text-right font-medium">Catalogue</th>
                      <th className="px-2 py-1.5 text-right font-medium">Your price</th>
                      <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                      <th className="px-2 py-1.5 text-right font-medium">Line</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convertTarget.items.map((line, idx) => {
                      const cat = previewPrices.get(line.id);
                      const raw = overrideInputs[idx] ?? "";
                      const eff = preview.finalPrices[idx];
                      const unpriced = cat === undefined && overrideByLine.get(idx) === undefined;
                      return (
                        <tr key={idx} className={unpriced ? "bg-amber-50" : undefined}>
                          <td className="px-2 py-1.5">
                            <span className="font-medium">{line.name}</span>
                            {unpriced && <span className="ml-1 text-[10px] font-semibold text-amber-800">needs a price</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right">{cat !== undefined ? formatPKR(cat) : "—"}</td>
                          <td className="px-2 py-1.5 text-right">
                            <Input
                              className="ml-auto h-7 w-24 text-right"
                              inputMode="numeric"
                              aria-label={`Line ${idx + 1} price`}
                              placeholder={String(cat ?? line.price)}
                              value={raw}
                              onChange={(e) => setOverrideInputs((m) => ({ ...m, [idx]: e.target.value }))}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">{line.quantity}</td>
                          <td className="px-2 py-1.5 text-right">{formatPKR(eff * line.quantity)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="rounded-lg bg-secondary p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Draft total (display cache — ignored)</span>
                <span className="line-through">{formatPKR(convertTarget?.total ?? 0)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Recomputed subtotal (indicative)</span>
                <span className="font-semibold">{preview ? formatPKR(preview.subtotal) : "—"}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Zone shipping on confirm</span>
                <span>Dispatch-confirmed</span>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                {convertTarget?.customerName} · {convertTarget?.items.length} line(s). Stock is checked and deducted inside one transaction at confirm; any shortfall rolls everything back.
              </p>
            </div>
            <div>
              <Label htmlFor="convert-method" className="mb-1.5 block text-xs font-medium text-muted-foreground">Payment method</Label>
              <Select value={convertMethod} onValueChange={(v) => setConvertMethod(v as PaymentMethod)}>
                <SelectTrigger id="convert-method" className="bg-white" aria-label="Payment method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{paymentLabel(m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertTarget(null)}>Keep draft</Button>
            <Button onClick={doConvert} disabled={converting || previewLoading || !preview || preview.needsPricing}>
              {converting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />}
              {converting ? "Converting…" : "Convert to order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── delete confirm ───────────────────────────────────────────── */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.id}?</DialogTitle>
          </DialogHeader>
          <p className="text-xs leading-5 text-muted-foreground">This removes the draft and its lines permanently. Converted drafts stay on record and can't be deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep it</Button>
            <Button variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
