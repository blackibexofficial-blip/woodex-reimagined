import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Loader2, RefreshCw, Printer, Receipt, Landmark, BadgeCheck, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminInvoice, InvoiceStatus, PaymentMethod, AdminQuote } from "@/api/types";
import {
  formatPKR, formatDate, paymentLabel,
  SectionCard, SectionSkeleton, EmptyState,
} from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_FILTERS: Array<InvoiceStatus | "all"> = ["all", "Issued", "Partially paid", "Paid", "Overdue", "Cancelled"];
const PAY_METHODS: PaymentMethod[] = ["cod", "bank-transfer", "easypaisa", "jazzcash", "card"];

const STATUS_PILL: Record<InvoiceStatus, string> = {
  "Issued": "border-sky-300 bg-sky-50 text-sky-800",
  "Partially paid": "border-amber-300 bg-amber-50 text-amber-900",
  "Paid": "border-emerald-300 bg-emerald-50 text-emerald-800",
  "Overdue": "border-rose-300 bg-rose-50 text-rose-800",
  "Cancelled": "border-border bg-secondary text-muted-foreground",
};

export default function AdminInvoices() {
  const api = useMemo(() => getAdminApi(), []);

  /* list state */
  const [items, setItems] = useState<AdminInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");

  /* convert dialog */
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertible, setConvertible] = useState<AdminQuote[]>([]);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  /* record-payment dialog */
  const [payTarget, setPayTarget] = useState<AdminInvoice | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("bank-transfer");
  const [payReference, setPayReference] = useState("");
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listInvoices({ status: statusFilter, query, perPage: 100 });
      setItems(res.items);
    } catch {
      toast.error("Could not load invoices.");
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter, query]);

  useEffect(() => { load(); }, [load]);

  /* KPIs over the filtered set (counts the loaded slice — small by design) */
  const totals = useMemo(() => {
    const collected = items.reduce((s, i) => s + i.paid, 0);
    const outstanding = items.reduce((s, i) => s + i.balance, 0);
    return { collected, outstanding, count: items.length };
  }, [items]);

  const openConvert = async () => {
    setConvertOpen(true);
    try {
      const res = await api.listQuotes({ perPage: 50 });
      setConvertible(res.items.filter((q) => q.status !== "converted"));
    } catch {
      toast.error("Could not load quotes to convert.");
      setConvertible([]);
    }
  };

  const convertQuote = async (q: AdminQuote) => {
    setConvertingId(q.id);
    try {
      const inv = await api.convertQuoteToInvoice(q.id);
      toast.success(`${inv.id} issued from ${q.id}${inv.paid > 0 ? ` — ${formatPKR(inv.paid)} already received` : ""}.`);
      setConvertOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invoice creation failed.");
    } finally {
      setConvertingId(null);
    }
  };

  const openPayment = (inv: AdminInvoice) => {
    setPayTarget(inv);
    setPayAmount(String(inv.balance));
    setPayMethod("bank-transfer");
    setPayReference("");
  };

  const submitPayment = async () => {
    if (!payTarget) return;
    const amount = Math.round(Number(payAmount));
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Amount must be a positive number.");
    setPaying(true);
    try {
      const updated = await api.recordInvoicePayment(payTarget.id, { amount, method: paymentLabel(payMethod), reference: payReference.trim() || undefined });
      if (updated) {
        toast.success(amount >= payTarget.balance ? `${updated.id} settled in full.` : `${formatPKR(amount)} recorded on ${updated.id} — balance ${formatPKR(updated.balance)}.`);
      } else {
        toast.error("Invoice not found — the ledger was not changed.");
      }
      setPayTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment could not be recorded.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search INV, quote, customer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search invoices"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as InvoiceStatus | "all")}>
            <SelectTrigger className="w-40 bg-white" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} aria-label="Reload">
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button onClick={openConvert} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
            <Receipt className="mr-1.5 h-4 w-4" /> Invoice from quote
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><Landmark className="h-4 w-4 text-hon-green-dark" /> Collected</p>
          <p className="mt-1.5 text-2xl font-black text-foreground">{formatPKR(totals.collected)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><Clock className="h-4 w-4 text-amber-600" /> Outstanding</p>
          <p className="mt-1.5 text-2xl font-black text-foreground">{formatPKR(totals.outstanding)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><BadgeCheck className="h-4 w-4 text-sky-700" /> Invoices</p>
          <p className="mt-1.5 text-2xl font-black text-foreground">{totals.count}</p>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Invoices are created from accepted quotes (atomic, idempotent snapshot) or from the order path and never carry unauthorised terms.
        Payments post to the ledger immediately (finance) and flip <span className="font-semibold text-foreground">Issued → Partially paid → Paid</span> automatically.
        No deletions — the ledger is an audit record.
      </p>

      <SectionCard title="Invoices & payments">
        {loading ? (
          <SectionSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No invoices match"
            hint="Convert an accepted quote into an invoice, or wait for one to be raised against an order, then record payments as they arrive."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-secondary">
                    <TableCell>
                      <p className="font-mono text-xs font-semibold">{inv.id}</p>
                      {inv.quoteId && <p className="font-mono text-[10px] text-violet-700">← {inv.quoteId}</p>}
                      {inv.orderId && <p className="font-mono text-[10px] text-sky-700">← {inv.orderId}</p>}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug max-w-[180px]">{inv.customer}</p>
                      {inv.company && <p className="text-[11px] text-muted-foreground">{inv.company}</p>}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatPKR(inv.total)}</TableCell>
                    <TableCell className="text-right text-sm text-emerald-700">{inv.paid > 0 ? formatPKR(inv.paid) : "—"}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatPKR(inv.balance)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{inv.due ? formatDate(inv.due) : "—"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_PILL[inv.status]}`}>{inv.status}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <a href={`/admin/invoice-document/${inv.id}`} target="_blank" rel="noreferrer" aria-label={`Print ${inv.id}`} title="Printable invoice"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-border hover:text-foreground">
                          <Printer className="h-4 w-4" />
                        </a>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 whitespace-nowrap text-xs"
                          onClick={() => openPayment(inv)}
                          disabled={inv.status === "Paid" || inv.status === "Cancelled"}
                          title={inv.status === "Paid" ? "Settled — nothing due" : "Record a payment against this invoice"}
                        >
                          <Landmark className="mr-1 h-3.5 w-3.5" /> Pay
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

      {/* ── invoice from quote ─────────────────────────────────────── */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue an invoice from a quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <p className="text-[11px] leading-5 text-muted-foreground">
              The quote snapshot lands as an <span className="font-semibold text-foreground">Issued</span> invoice linked to the quote.
              Idempotent — runs once per quote; re-clicking reuses the same invoice.
            </p>
            {convertible.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No open quotes to convert.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {convertible.map((q) => (
                  <li key={q.id} className="flex items-center gap-3 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] font-semibold">{q.id}</p>
                      <p className="max-w-[220px] truncate text-xs text-foreground">{q.customerName}{q.company ? ` · ${q.company}` : ""}</p>
                      <p className="text-[10px] capitalize text-muted-foreground">{q.status} · {formatPKR(q.total)}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={convertingId !== null} onClick={() => convertQuote(q)}>
                      {convertingId === q.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Receipt className="mr-1 h-3.5 w-3.5" />}
                      {convertingId === q.id ? "Issuing…" : "Invoice"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── record payment ──────────────────────────────────────────── */}
      <Dialog open={payTarget !== null} onOpenChange={(open) => !open && setPayTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment — {payTarget?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 text-sm">
            <div className="rounded-lg bg-secondary p-3 text-xs">
              <p className="font-semibold">{payTarget?.customer}{payTarget?.company ? ` · ${payTarget.company}` : ""}</p>
              <p className="mt-0.5 text-muted-foreground">Outstanding <span className="font-semibold text-foreground">{formatPKR(payTarget?.balance ?? 0)}</span> of {formatPKR(payTarget?.total ?? 0)}</p>
            </div>
            <div>
              <Label htmlFor="pay-amount" className="mb-1.5 block text-xs font-medium text-muted-foreground">Amount (PKR)</Label>
              <Input id="pay-amount" type="number" min={1} inputMode="numeric" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="bg-white" aria-label="Payment amount" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pay-method" className="mb-1.5 block text-xs font-medium text-muted-foreground">Method</Label>
                <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                  <SelectTrigger id="pay-method" className="w-full bg-white" aria-label="Payment method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAY_METHODS.map((m) => <SelectItem key={m} value={m}>{paymentLabel(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pay-ref" className="mb-1.5 block text-xs font-medium text-muted-foreground">Reference</Label>
                <Input id="pay-ref" value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="TXN / cheque #" className="bg-white" aria-label="Payment reference" />
              </div>
            </div>
            <p className="text-[10px] leading-4 text-muted-foreground">Finance-only action — the ledger entry posts immediately on save (demo store in this preview; hosted RPC on the live project). Overpayment is allowed and records Paid.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
            <Button onClick={submitPayment} disabled={paying}>
              {paying ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Landmark className="mr-1.5 h-4 w-4" />}
              {paying ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
