import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Printer, Receipt } from "lucide-react";
import { getAdminApi } from "@/api";
import { useAdminAuth } from "@/admin/auth";
import { formatPKR, formatDate, formatDateTime } from "@/admin/components";
import { PAYMENT_TERMS_NOTE } from "@/api/quote-templates";
import type { AdminInvoice, StoreSettings } from "@/api/types";

/** Chrome-free printable invoice — mounted at /admin/invoice-document/:id outside the admin layout. */
export default function AdminInvoiceDocument() {
  const { user } = useAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<AdminInvoice | null | undefined>(undefined);
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  useEffect(() => {
    if (!id) { setInvoice(null); return; }
    let alive = true;
    const api = getAdminApi();
    api.getInvoice(id)
      .then((inv) => { if (alive) setInvoice(inv ?? null); })
      .catch((e) => { console.error(e); if (alive) setInvoice(null); });
    api.getSettings()
      .then((s2) => { if (alive) setSettings(s2); })
      .catch(() => { /* settings are decorative on the invoice — keep defaults impression */ });
    return () => { alive = false; };
  }, [id]);

  if (!user) return <Navigate to="/admin/login" replace />;

  const bill = settings ?? { storeName: "WOODEX", tagline: "Premium Office & Home Furniture", phone: "+92 300 1234567", whatsapp: "+92 300 1234567", email: "hello@woodex.pk", address: "Showroom & Factory, 12-km Sheikh Zayed Road", city: "Lahore", currency: "PKR", deliveryNote: "", taxRate: 0 };
  const overdue = invoice && invoice.status !== "Paid" && invoice.status !== "Cancelled" && invoice.balance > 0 && !!invoice.due && Date.parse(invoice.due) < Date.now();
  const paidInFull = invoice?.status === "Paid";

  return (
    <div className="min-h-screen bg-[#eceae4] px-4 py-6 sm:py-10 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 13mm 12mm; }
          html, body { background: #ffffff !important; }
          .invdoc-chrome { display: none !important; }
          .invdoc-sheet { box-shadow: none !important; border: none !important; max-width: none !important; margin: 0 !important; border-radius: 0 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* screen-only toolbar */}
      <div className="invdoc-chrome mx-auto mb-4 flex max-w-[820px] items-center justify-between gap-3">
        <Link to="/admin/invoices" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to invoices
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-hon-green px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-hon-green-dark">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      {invoice === undefined ? (
        <div className="mx-auto flex max-w-[820px] items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading invoice…
        </div>
      ) : invoice === null ? (
        <div className="mx-auto max-w-[820px] rounded-lg border border-muted bg-white p-10 text-center">
          <Receipt className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Invoice not found</p>
          <p className="mt-1 text-xs text-muted-foreground">No invoice exists for ID “{id}”.</p>
        </div>
      ) : (
        <main className="invdoc-sheet mx-auto max-w-[820px] rounded-xl border border-[#e3e0d6] bg-white p-6 shadow-lg sm:p-10 print:p-0">
          {/* masthead */}
          <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-hon-green pb-6">
            <div>
              <p className="text-2xl font-black tracking-[0.28em] text-hon-green-dark">WOODEX</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{bill.tagline}</p>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {bill.address}<br />{bill.city}, Pakistan<br />{bill.phone} · {bill.email}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold uppercase tracking-widest text-foreground">Invoice</p>
              <p className="mt-1 font-mono text-sm font-semibold text-foreground">{invoice.id}</p>
              <p className="text-[11px] text-muted-foreground">Issued {formatDateTime(invoice.createdAt)}</p>
              {invoice.quoteId && <p className="text-[10px] text-muted-foreground">from quote <span className="font-mono">{invoice.quoteId}</span></p>}
              {invoice.orderId && <p className="text-[10px] text-muted-foreground">against order <span className="font-mono">{invoice.orderId}</span></p>}
              <div className="mt-2 flex justify-end">
                <span className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${paidInFull ? "bg-emerald-100 text-emerald-800" : overdue ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900"}`}>
                  {paidInFull ? "Paid in full" : overdue ? "Overdue" : invoice.status}
                </span>
              </div>
            </div>
          </header>

          {/* due banner */}
          <div className={`mt-4 rounded-lg border px-4 py-2 text-[11px] font-semibold ${overdue ? "border-rose-300 bg-rose-50 text-rose-800" : paidInFull ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-hon-green-pale bg-hon-green-pale/50 text-hon-green-dark"}`}>
            {paidInFull
              ? "Settled in full — thank you. No further action required."
              : overdue
                ? `Payment overdue — was due ${formatDate(invoice.due!)}. Outstanding ${formatPKR(invoice.balance)}.`
                : invoice.due
                  ? `Payment due by ${formatDate(invoice.due)} — outstanding ${formatPKR(invoice.balance)}.`
                  : `Outstanding ${formatPKR(invoice.balance)} of ${formatPKR(invoice.total)}.`}
          </div>

          {/* bill to */}
          <section className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Bill to</p>
              <p className="mt-1.5 text-sm font-semibold text-foreground">{invoice.customer}</p>
              {invoice.company && <p className="text-[11px] font-medium text-violet-700">{invoice.company}</p>}
              {invoice.city && <p className="text-[11px] text-muted-foreground">{invoice.city}, Pakistan</p>}
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Terms</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {PAYMENT_TERMS_NOTE}<br />
                {invoice.notes && <>{invoice.notes}<br /></>}
                Bank transfer to the WOODEX account shared with your order confirmation.
              </p>
            </div>
          </section>

          {/* items */}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Item</th>
                <th className="py-2 pr-2 text-right">Qty</th>
                <th className="py-2 pr-2 text-right">Rate</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoice.items.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-[11px] text-muted-foreground">Line breakdown not recorded for this invoice — see totals.</td></tr>
              ) : invoice.items.map((item, i) => (
                <tr key={item.id ?? i}>
                  <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium text-foreground">{item.name}</td>
                  <td className="py-2 pr-2 text-right">{item.quantity}</td>
                  <td className="py-2 pr-2 text-right">{formatPKR(item.price)}</td>
                  <td className="py-2 text-right font-semibold">{formatPKR(item.price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* totals + balance */}
          <div className="mt-4 flex flex-wrap justify-between gap-6">
            <div className="rounded-lg bg-secondary p-4 text-[11px] leading-6 text-muted-foreground">
              <p className="text-[9px] font-bold uppercase tracking-widest text-foreground">Ledger</p>
              <p>Invoice total <span className="font-semibold text-foreground">{formatPKR(invoice.total)}</span></p>
              <p>Paid to date <span className="font-semibold text-emerald-700">{formatPKR(invoice.paid)}</span></p>
              <p>Outstanding <span className="font-semibold text-foreground">{formatPKR(invoice.balance)}</span></p>
            </div>
            <div className="w-full max-w-[260px] space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPKR(invoice.subtotal)}</span></div>
              {invoice.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span>−{formatPKR(invoice.discount)}</span></div>}
              <div className="flex justify-between"><span>Delivery</span><span>{invoice.shipping === 0 ? "FREE" : formatPKR(invoice.shipping)}</span></div>
              {invoice.tax > 0 && <div className="flex justify-between"><span>Tax</span><span>{formatPKR(invoice.tax)}</span></div>}
              <div className="flex justify-between border-t-2 border-hon-green pt-1.5 text-sm font-black text-foreground"><span>Total</span><span>{formatPKR(invoice.total)}</span></div>
              {invoice.paid > 0 && <div className="flex justify-between text-emerald-700"><span>Paid</span><span>−{formatPKR(invoice.paid)}</span></div>}
              <div className="flex justify-between text-sm font-bold text-foreground"><span>Balance due</span><span>{formatPKR(invoice.balance)}</span></div>
            </div>
          </div>

          {/* footer */}
          <footer className="mt-8 border-t border-border pt-4 text-[10px] leading-relaxed text-muted-foreground">
            <p>Quote this invoice number on every bank transfer and WhatsApp follow-up. WOODEX reconciles payments weekly against the ledger.</p>
            <p className="mt-1">Claims: quote your invoice number within 7 days of delivery · 5-year structural warranty on WOODEX-built frames · installation available in Lahore, Karachi, Islamabad &amp; Rawalpindi.</p>
            <p className="mt-2 text-center text-[9px] uppercase tracking-[0.3em] text-muted-foreground/70">Thank you for choosing WOODEX</p>
          </footer>
        </main>
      )}
    </div>
  );
}
