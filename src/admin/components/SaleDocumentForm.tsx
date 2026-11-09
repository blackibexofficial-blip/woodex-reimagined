/**
 * Shared full-page form for the two manual sale documents:
 *  - /admin/orders/new   → New order (channel "manual")
 *  - /admin/invoices/new → New invoice (issues via quote → invoice conversion)
 *
 * Admin-side twin of the quote builder's line entry: catalogue search with
 * debounce, free lines, keyboard-friendly quantities. No fake fields — the
 * order path deliberately has no discount control because NewOrderInput
 * cannot carry one; the invoice path issues through a quote, which can.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Minus, Plus, Search, Trash2, ChevronRight } from "lucide-react";
import { getAdminApi } from "@/api";
import { toast } from "sonner";
import { formatPKR, SectionCard } from "@/admin/components";
import type { AdminProduct, PaymentMethod } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface SaleLineDraft {
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  sku?: string;
  category?: string;
  series?: string;
  material?: string;
  finish?: string;
  width?: number;
  height?: number;
  depth?: number;
  unit?: "mm" | "cm" | "in";
}

export interface SaleDocumentPayload {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  city: string;
  address?: string;
  notes?: string;
  paymentMethod: PaymentMethod;
  items: SaleLineDraft[];
  subtotal: number;
  shipping: number;
  total: number;
  discountPct: number;
}

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cod", label: "Cash on Delivery" },
  { value: "bank-transfer", label: "Bank Transfer" },
  { value: "easypaisa", label: "Easypaisa" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "card", label: "Card" },
];

interface Props {
  mode: "order" | "invoice";
  title: string;
  subtitle: string;
  submitLabel: string;
  /** Honesty note rendered under the submit button (document-type explanation). */
  submitNote: string;
  backTo: string;
  backLabel: string;
  submitWarning?: ReactNode;
  submitBlocked?: boolean;
  onSubmit: (payload: SaleDocumentPayload) => Promise<void>;
}

export default function SaleDocumentForm({ mode, title, subtitle, submitLabel, submitNote, backTo, backLabel, submitWarning, submitBlocked = false, onSubmit }: Props) {
  const api = useMemo(() => getAdminApi(), []);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [lines, setLines] = useState<SaleLineDraft[]>([]);
  const [shipping, setShipping] = useState("0");
  const [discountPct, setDiscountPct] = useState("0");
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);

  /* catalogue picker */
  const [catQuery, setCatQuery] = useState("");
  const [catResults, setCatResults] = useState<AdminProduct[]>([]);
  const [catSearching, setCatSearching] = useState(false);
  const [freeName, setFreeName] = useState("");
  const [freePrice, setFreePrice] = useState("");
  const [freeQty, setFreeQty] = useState("1");

  useEffect(() => {
    const q = catQuery.trim();
    if (!q) { setCatResults([]); return; }
    const t = setTimeout(() => {
      setCatSearching(true);
      api.listProducts({ query: q, perPage: 6 })
        .then((res) => setCatResults(res.items))
        .catch(() => setCatResults([]))
        .finally(() => setCatSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [api, catQuery]);

  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const discountPctNum = mode === "invoice" ? Math.min(60, Math.max(0, Math.round(Number(discountPct) || 0))) : 0;
  const discountAmount = Math.round((subtotal * discountPctNum) / 100);
  const shippingNum = Math.max(0, Math.round(Number(shipping) || 0));
  const grandTotal = subtotal - discountAmount + shippingNum;

  const addFromCatalog = (p: AdminProduct) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.productId === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...prev, {
        productId: p.id,
        name: p.name,
        price: Math.round(p.price),
        quantity: 1,
        image: p.image ?? p.images?.[0],
        sku: p.sku ?? p.id,
        category: p.category,
      }];
    });
    setCatQuery("");
    setCatResults([]);
  };

  const addFreeLine = () => {
    const n = freeName.trim();
    const price = Math.max(0, Math.round(Number(freePrice) || 0));
    const qty = Math.max(1, Math.round(Number(freeQty) || 1));
    if (!n) return;
    setLines((prev) => [...prev, { name: n, price, quantity: qty }]);
    setFreeName(""); setFreePrice(""); setFreeQty("1");
  };

  const bumpQty = (index: number, delta: number) => {
    setLines((prev) => prev.flatMap((l, i) => {
      if (i !== index) return [l];
      const quantity = l.quantity + delta;
      return quantity <= 0 ? [] : [{ ...l, quantity }];
    }));
  };

  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index));

  const submit = async () => {
    if (submitLock.current || submitBlocked) return;
    if (!name.trim() || !phone.trim() || !city.trim()) {
      toast.error("Customer name, phone and city are required.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one line — from the catalogue or as a free line.");
      return;
    }
    if (grandTotal <= 0) {
      toast.error("Document total must be greater than zero.");
      return;
    }
    submitLock.current = true;
    setBusy(true);
    try {
      await onSubmit({
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || undefined,
        city: city.trim(),
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        paymentMethod,
        items: lines,
        subtotal,
        shipping: shippingNum,
        total: grandTotal,
        discountPct: discountPctNum,
      });
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to={backTo} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {/* left column */}
        <div className="space-y-6">
          <SectionCard title="Customer">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="sale-name">Name *</label>
                <Input id="sale-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ahmed Khan" className="mt-1" />
              </div>
              <div className="sm:col-span-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="sale-phone">Phone *</label>
                <Input id="sale-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 3xx xxxxxxx" className="mt-1" inputMode="tel" />
              </div>
              <div className="sm:col-span-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="sale-email">Email</label>
                <Input id="sale-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="mt-1" />
              </div>
              <div className="sm:col-span-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="sale-city">City *</label>
                <Input id="sale-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lahore" className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="sale-address">Address</label>
                <Input id="sale-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House / street, area" className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="sale-notes">Notes</label>
                <Textarea id="sale-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Delivery instructions, site details, payment context…" className="mt-1" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Lines">
            {/* catalogue search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={catQuery}
                onChange={(e) => setCatQuery(e.target.value)}
                placeholder="Search catalogue — name, SKU, material…"
                className="pl-9"
                aria-label="Search catalogue"
              />
              {catSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
              {catResults.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-white shadow-lg">
                  {catResults.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addFromCatalog(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50">
                        <img src={p.image ?? p.images?.[0] ?? ""} alt="" className="h-10 w-10 rounded border object-cover" loading="lazy" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-foreground">{p.name}</span>
                          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{p.sku ?? p.id}</span>
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-foreground">{formatPKR(Math.round(p.price))}</span>
                        <Plus className="h-4 w-4 text-hon-green" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* free line */}
            <div className="mt-3 grid grid-cols-[1fr_110px_84px_auto] gap-2">
              <Input value={freeName} onChange={(e) => setFreeName(e.target.value)} placeholder="Free line — custom item / service" aria-label="Free line name" onKeyDown={(e) => e.key === "Enter" && addFreeLine()} />
              <Input value={freePrice} onChange={(e) => setFreePrice(e.target.value)} placeholder="Price PKR" inputMode="numeric" aria-label="Free line price" onKeyDown={(e) => e.key === "Enter" && addFreeLine()} />
              <Input value={freeQty} onChange={(e) => setFreeQty(e.target.value)} placeholder="Qty" inputMode="numeric" aria-label="Free line quantity" onKeyDown={(e) => e.key === "Enter" && addFreeLine()} />
              <Button type="button" variant="outline" className="h-10" onClick={addFreeLine}><Plus className="mr-1 h-4 w-4" /> Add</Button>
            </div>

            {/* lines table */}
            {lines.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-md border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-center">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2" aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-muted">
                    {lines.map((l, i) => (
                      <tr key={`${l.productId ?? "free"}-${i}`}>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{String(i + 1).padStart(2, "0")}</td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-foreground">{l.name}</span>
                          {[l.category, l.material, l.finish].filter(Boolean).length > 0 && (
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">{[l.category, l.series, l.material, l.finish].filter(Boolean).join(" · ")}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-md border">
                            <button type="button" onClick={() => bumpQty(i, -1)} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label={`Decrease quantity of ${l.name}`}><Minus className="h-3 w-3" /></button>
                            <span className="w-8 text-center tabular-nums font-semibold">{l.quantity}</span>
                            <button type="button" onClick={() => bumpQty(i, 1)} className="p-1.5 text-muted-foreground hover:text-foreground" aria-label={`Increase quantity of ${l.name}`}><Plus className="h-3 w-3" /></button>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPKR(l.price)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatPKR(l.price * l.quantity)}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => removeLine(i)} className="rounded p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${l.name}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Commercial">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="sale-shipping">Delivery (PKR)</label>
                <Input id="sale-shipping" value={shipping} onChange={(e) => setShipping(e.target.value)} inputMode="numeric" className="mt-1" placeholder="0" />
                <p className="mt-1 text-[10px] text-muted-foreground">0 = free delivery</p>
              </div>
              {mode === "invoice" && (
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="sale-discount">Discount %</label>
                  <Input id="sale-discount" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} inputMode="numeric" className="mt-1" placeholder="0" />
                  <p className="mt-1 text-[10px] text-muted-foreground">0–60 — rides the backing quote, like the builder</p>
                </div>
              )}
              {mode === "order" && (
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="sale-method">Payment method *</label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                    <SelectTrigger id="sale-method" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* right rail — totals + submit */}
        <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <div className="border-b bg-muted/40 px-5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Totals</p>
            </div>
            <div className="space-y-1.5 px-5 py-4 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{formatPKR(subtotal)}</span></div>
              {discountPctNum > 0 && (
                <div className="flex justify-between text-emerald-700"><span>Discount ({discountPctNum}%)</span><span className="tabular-nums">−{formatPKR(discountAmount)}</span></div>
              )}
              <div className="flex justify-between text-muted-foreground"><span>Delivery</span><span className="tabular-nums">{shippingNum === 0 ? "FREE" : formatPKR(shippingNum)}</span></div>
              <div className="mt-2 border-t-2 border-hon-green pt-2">
                <div className="rounded-lg bg-hon-green-pale px-4 py-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-hon-green-dark">Document total</p>
                  <p className="mt-0.5 text-2xl font-black tabular-nums text-hon-green-dark">{formatPKR(grandTotal)}</p>
                  <p className="mt-0.5 text-[10px] text-hon-green-dark">{lines.length} line{lines.length === 1 ? "" : "s"} · {lines.reduce((s, l) => s + l.quantity, 0)} unit{lines.reduce((s, l) => s + l.quantity, 0) === 1 ? "" : "s"}</p>
                </div>
              </div>
            </div>
            <div className="border-t px-5 py-4">
              {submitWarning}
              <Button onClick={submit} disabled={busy || submitBlocked} className="h-11 w-full bg-hon-green-dark text-sm font-bold text-white hover:bg-hon-green-dark">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {submitLabel}
                {!busy && <ChevronRight className="ml-1 h-4 w-4" />}
              </Button>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{submitNote}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
