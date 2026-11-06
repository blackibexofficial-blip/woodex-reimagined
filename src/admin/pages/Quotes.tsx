import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Loader2, Pencil, Trash2, PackageCheck, Printer, ScrollText, Minus, X,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminProduct, AdminQuote, PaymentMethod, QuoteStatus } from "@/api/types";
import {
  formatPKR, formatDate, timeAgo, paymentLabel,
  QuoteStatusBadge, SectionCard, SectionSkeleton, EmptyState,
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

const STATUSES: Array<QuoteStatus | "all"> = ["all", "draft", "sent", "accepted", "declined", "converted"];
const EDITABLE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "declined"];
const PAYMENT_METHODS: PaymentMethod[] = ["cod", "bank-transfer", "easypaisa", "jazzcash", "card"];

type LineDraft = { productId?: string; name: string; price: number; quantity: number; image?: string };

export default function AdminQuotes() {
  const api = useMemo(() => getAdminApi(), []);

  /* list state */
  const [items, setItems] = useState<AdminQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");

  /* editor dialog state (create + edit) */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminQuote | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [discountPct, setDiscountPct] = useState("0");
  const [validityDays, setValidityDays] = useState("14");
  const [shipping, setShipping] = useState("0");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<QuoteStatus>("draft");
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
  const [convertTarget, setConvertTarget] = useState<AdminQuote | null>(null);
  const [convertMethod, setConvertMethod] = useState<PaymentMethod>("cod");
  const [converting, setConverting] = useState(false);

  /* delete confirm */
  const [deleteTarget, setDeleteTarget] = useState<AdminQuote | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listQuotes({ status: statusFilter, query, perPage: 60 });
      setItems(res.items);
    } catch {
      toast.error("Could not load quotes.");
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

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.price * l.quantity, 0), [lines]);
  const discountPctNum = Math.min(60, Math.max(0, Math.round(Number(discountPct) || 0)));
  const discountAmount = Math.round((subtotal * discountPctNum) / 100);
  const shippingNum = Math.max(0, Math.round(Number(shipping) || 0));
  const grandTotal = subtotal - discountAmount + shippingNum;

  const openCreate = () => {
    setEditTarget(null);
    setName(""); setPhone(""); setEmail(""); setCompany(""); setCity(""); setAddress("");
    setLines([]); setDiscountPct("0"); setValidityDays("14"); setShipping("0"); setNotes(""); setStatus("draft");
    setCatQuery(""); setCatResults([]); setFreeName(""); setFreePrice(""); setFreeQty("1");
    setEditorOpen(true);
  };

  const openEdit = (t: AdminQuote) => {
    if (t.status === "converted") {
      toast.error(`Quote ${t.id} is converted — it can no longer be edited.`);
      return;
    }
    setEditTarget(t);
    setName(t.customerName); setPhone(t.customerPhone); setEmail(t.customerEmail);
    setCompany(t.company ?? ""); setCity(t.city ?? ""); setAddress(t.address ?? "");
    setLines(t.items.map((i) => ({ productId: i.id.startsWith("free-") ? undefined : i.id, name: i.name, price: i.price, quantity: i.quantity, image: i.image })));
    setDiscountPct(String(t.discountPct)); setValidityDays(String(t.validityDays)); setShipping(String(t.shipping));
    setNotes(t.notes ?? ""); setStatus(t.status);
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
    if (price < 0) return toast.error("Price can't be negative.");
    setLines((d) => [...d, { name: n, price, quantity: qty }]);
    setFreeName(""); setFreePrice(""); setFreeQty("1");
  };

  const saveQuote = async () => {
    const payload = {
      customerName: name.trim(),
      customerPhone: phone.trim(),
      customerEmail: email.trim() || undefined,
      company: company.trim() || undefined,
      city: city.trim() || undefined,
      address: address.trim() || undefined,
      items: lines.map((l) => ({ productId: l.productId, name: l.name, price: l.price, quantity: l.quantity, image: l.image })),
      discountPct: discountPctNum,
      validityDays: Math.min(90, Math.max(1, Math.trunc(Number(validityDays) || 14))),
      shipping: shippingNum,
      notes: notes.trim() || undefined,
    };
    if (!payload.customerName) return toast.error("Customer name is required.");
    if (!payload.customerPhone) return toast.error("Customer phone is required.");
    setSaving(true);
    try {
      if (editTarget) {
        const updated = await api.updateQuote(editTarget.id, { ...payload, status });
        if (updated) toast.success(`${updated.id} saved.`);
      } else {
        const created = await api.createQuote(payload);
        toast.success(`${created.id} saved as draft.`);
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the quote.");
    } finally {
      setSaving(false);
    }
  };

  const doConvert = async () => {
    if (!convertTarget) return;
    setConverting(true);
    try {
      const order = await api.convertQuote(convertTarget.id, convertMethod);
      if (order) {
        toast.success(`${convertTarget.id} converted → ${order.id} (${paymentLabel(order.paymentMethod)}). Stock deducts on dispatch as usual.`);
        setConvertTarget(null);
        await load();
      } else {
        toast.error("Quote not found or already converted.");
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
      const okFlag = await api.deleteQuote(deleteTarget.id);
      if (okFlag) {
        toast.success(`${deleteTarget.id} deleted.`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Quote is converted or missing — it stays on record.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const linesQty = (t: AdminQuote) => t.items.reduce((s, i) => s + i.quantity, 0);
  const isExpired = (t: AdminQuote) => (t.status === "draft" || t.status === "sent") && new Date(t.validUntil).getTime() < Date.now();

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search QOT, customer, company…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search quotes"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as QuoteStatus | "all")}>
            <SelectTrigger className="w-36 bg-white" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
            <Plus className="mr-1.5 h-4 w-4" /> New quote
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Quotes never touch stock or WhatsApp. Drafted from a B2B / quote lead (Leads → “Create quote”) or built from scratch —
        catalogue lines, free lines, discount % and validity. Converting creates a <span className="font-semibold text-foreground">pending order</span> via the
        normal order path (channel: manual) and carries the discount onto the order; stock deducts on dispatch as usual.
      </p>

      <SectionCard title="Quotes">
        {loading ? (
          <SectionSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No quotes match"
            hint="Create a priced quotation — discount and validity included — and convert it to an order when the customer confirms."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Valid until</TableHead>
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
                      {t.leadId && <p className="font-mono text-[10px] text-violet-700">← {t.leadId}</p>}
                      {t.convertedOrderId && <p className="font-mono text-[10px] text-emerald-700">→ {t.convertedOrderId}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug max-w-[180px]">{t.customerName}</p>
                      <p className="text-[11px] text-muted-foreground">{t.company ?? t.city ?? t.customerPhone}</p>
                    </TableCell>
                    <TableCell className="text-sm">{linesQty(t)} × {t.items.length} line(s)</TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {t.discountPct > 0 && <span className="mr-1.5 text-[10px] font-semibold text-emerald-700">−{t.discountPct}%</span>}
                      {formatPKR(t.total)}
                    </TableCell>
                    <TableCell className={`text-xs ${isExpired(t) ? "font-semibold text-rose-600" : "text-muted-foreground"}`}>
                      {formatDate(t.validUntil)}{isExpired(t) && <span className="block text-[10px] uppercase">expired</span>}
                    </TableCell>
                    <TableCell><QuoteStatusBadge status={t.status} /></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(t.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <a href={`/admin/quote/${t.id}`} target="_blank" rel="noreferrer" aria-label={`Print ${t.id}`} title="Printable quotation"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-border hover:text-foreground">
                          <Printer className="h-4 w-4" />
                        </a>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} disabled={t.status === "converted"} aria-label={`Edit ${t.id}`} title={t.status === "converted" ? "Converted — locked" : "Edit quote"}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setConvertMethod("cod"); setConvertTarget(t); }} disabled={t.status === "converted"} aria-label={`Convert ${t.id} to order`} title="Convert to order">
                          <PackageCheck className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(t)} disabled={t.status === "converted"} aria-label={`Delete ${t.id}`} title="Delete quote">
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
            <DialogTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5 text-hon-green-dark" /> {editTarget ? `Edit ${editTarget.id}` : "New quotation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* customer */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="qot-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer / company contact *</Label>
                <Input id="qot-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Bilal Ahmed" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="qot-phone" className="mb-1.5 block text-xs font-medium text-muted-foreground">Phone *</Label>
                <Input id="qot-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 3xx …" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="qot-email" className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</Label>
                <Input id="qot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="optional" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="qot-company" className="mb-1.5 block text-xs font-medium text-muted-foreground">Company</Label>
                <Input id="qot-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ravi Agro Foods" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="qot-city" className="mb-1.5 block text-xs font-medium text-muted-foreground">City</Label>
                <Input id="qot-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lahore" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="qot-address" className="mb-1.5 block text-xs font-medium text-muted-foreground">Address</Label>
                <Input id="qot-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Site address for delivery" className="bg-white" />
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
                  <Label htmlFor="qot-free-name" className="mb-1 block text-[10px] font-medium text-muted-foreground">Free line (not in catalogue)</Label>
                  <Input id="qot-free-name" value={freeName} onChange={(e) => setFreeName(e.target.value)} placeholder="e.g. Installation labour" className="h-9 bg-white text-xs" />
                </div>
                <div className="w-28">
                  <Label htmlFor="qot-free-price" className="mb-1 block text-[10px] font-medium text-muted-foreground">Price (PKR)</Label>
                  <Input id="qot-free-price" type="number" min={0} inputMode="numeric" value={freePrice} onChange={(e) => setFreePrice(e.target.value)} placeholder="0" className="h-9 bg-white text-xs" />
                </div>
                <div className="w-16">
                  <Label htmlFor="qot-free-qty" className="mb-1 block text-[10px] font-medium text-muted-foreground">Qty</Label>
                  <Input id="qot-free-qty" type="number" min={1} inputMode="numeric" value={freeQty} onChange={(e) => setFreeQty(e.target.value)} className="h-9 bg-white text-xs" />
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

            {/* discount + validity + shipping + totals */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <div className="w-24">
                  <Label htmlFor="qot-discount" className="mb-1.5 block text-xs font-medium text-muted-foreground">Discount %</Label>
                  <Input id="qot-discount" type="number" min={0} max={60} inputMode="numeric" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} className="bg-white" />
                </div>
                <div className="w-24">
                  <Label htmlFor="qot-validity" className="mb-1.5 block text-xs font-medium text-muted-foreground">Validity (days)</Label>
                  <Input id="qot-validity" type="number" min={1} max={90} inputMode="numeric" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} className="bg-white" />
                </div>
                <div className="w-28">
                  <Label htmlFor="qot-shipping" className="mb-1.5 block text-xs font-medium text-muted-foreground">Shipping (PKR)</Label>
                  <Input id="qot-shipping" type="number" min={0} inputMode="numeric" value={shipping} onChange={(e) => setShipping(e.target.value)} className="bg-white" />
                </div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Subtotal <span className="font-medium text-foreground">{formatPKR(subtotal)}</span></p>
                {discountAmount > 0 && <p>Discount ({discountPctNum}%) <span className="font-medium text-emerald-700">−{formatPKR(discountAmount)}</span></p>}
                <p>Shipping <span className="font-medium text-foreground">{shippingNum === 0 ? "FREE" : formatPKR(shippingNum)}</span></p>
                <p className="mt-0.5 text-sm font-bold text-foreground">Total {formatPKR(grandTotal)}</p>
              </div>
            </div>

            {/* status (edit only) */}
            {editTarget && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-2.5">
                <Label htmlFor="qot-status" className="text-xs font-medium text-muted-foreground">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as QuoteStatus)}>
                  <SelectTrigger id="qot-status" className="w-36 bg-white" aria-label="Quote status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EDITABLE_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="qot-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">Internal note <span className="font-normal">(staff only)</span></Label>
              <Textarea id="qot-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="PO reference, payment terms, validity confirmation…" className="bg-white text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={saveQuote} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ScrollText className="mr-1.5 h-4 w-4" />}
              {saving ? "Saving…" : editTarget ? "Save changes" : "Save quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── convert confirm ─────────────────────────────────────────── */}
      <Dialog open={convertTarget !== null} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convert {convertTarget?.id} into an order?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 text-sm">
            <p className="text-xs leading-5 text-muted-foreground">
              A <span className="font-semibold text-foreground">pending order</span> will be created via the normal order path
              (channel: manual) — it appears in Orders immediately, the quote's discount carries onto the order, and stock
              deducts on dispatch. The quote will be locked as converted.
            </p>
            <div className="rounded-lg bg-secondary p-3 text-xs">
              <p className="font-semibold">{convertTarget?.customerName}{convertTarget?.company ? ` · ${convertTarget.company}` : ""} · {convertTarget?.items.length} line(s) · {formatPKR(convertTarget?.total ?? 0)}</p>
              <p className="mt-0.5 text-muted-foreground">{convertTarget?.items.map((i) => `${i.name} ×${i.quantity}`).join(", ").slice(0, 140)}</p>
              {(convertTarget?.discountPct ?? 0) > 0 && <p className="mt-0.5 font-semibold text-emerald-700">Includes {convertTarget?.discountPct}% (−{formatPKR(convertTarget?.discountAmount ?? 0)})</p>}
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
            <Button variant="outline" onClick={() => setConvertTarget(null)}>Keep quote</Button>
            <Button onClick={doConvert} disabled={converting}>
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
          <p className="py-1 text-xs leading-5 text-muted-foreground">
            This removes the quote permanently. Converted quotes cannot be deleted — they stay on record and are locked.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep quote</Button>
            <Button variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              {deleting ? "Deleting…" : "Delete quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
