import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Printer, Receipt } from "lucide-react";
import { getAdminApi } from "@/api";
import { useAdminAuth } from "@/admin/auth";
import { formatPKR, formatDateTime, paymentLabel, OrderStatusBadge } from "@/admin/components";
import type { AdminOrder, StoreSettings } from "@/api/types";
import { site } from "@/config/site";

/** Chrome-free printable invoice — mounted at /admin/invoice/:id outside the admin layout. */
export default function AdminInvoice() {
  const { user } = useAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<AdminOrder | null | undefined>(undefined);
  const [settings, setSettings] = useState<StoreSettings | null>(null);

  useEffect(() => {
    if (!id) { setOrder(null); return; }
    let alive = true;
    const api = getAdminApi();
    api.getOrder(id)
      .then((o) => { if (alive) setOrder(o ?? null); })
      .catch((e) => { console.error(e); if (alive) setOrder(null); });
    api.getSettings()
      .then((s2) => { if (alive) setSettings(s2); })
      .catch(() => { /* settings are decorative on the invoice — keep defaults impression */ });
    return () => { alive = false; };
  }, [id]);

  if (!user) return <Navigate to="/admin/login" replace />;

  const bill = settings ?? { storeName: "WOODEX", tagline: "Premium Office & Home Furniture", phone: site.phone, whatsapp: site.whatsappDisplay, email: site.email, address: `Showroom & Factory, ${site.address.line1}`, city: site.address.city, currency: "PKR", deliveryNote: "", taxRate: 0 };
  const itemQty = order?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;

  return (
    <div className="min-h-screen bg-[#eceae4] px-4 py-6 sm:py-10 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 13mm 12mm; }
          html, body { background: #ffffff !important; }
          .invoice-chrome { display: none !important; }
          .invoice-sheet { box-shadow: none !important; border: none !important; max-width: none !important; margin: 0 !important; border-radius: 0 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* screen-only toolbar */}
      <div className="invoice-chrome mx-auto mb-4 flex max-w-[820px] items-center justify-between gap-3">
        <Link to="/admin/orders" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to orders
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-hon-green px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-hon-green-dark">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      {order === undefined ? (
        <div className="mx-auto flex max-w-[820px] items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading order…
        </div>
      ) : order === null ? (
        <div className="mx-auto max-w-[820px] rounded-lg border border-muted bg-white p-10 text-center">
          <Receipt className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Order not found</p>
          <p className="mt-1 text-xs text-muted-foreground">No order exists for ID “{id}”. It may have been removed from the demo store.</p>
        </div>
      ) : (
        <main className="invoice-sheet mx-auto max-w-[820px] rounded-xl border border-[#e3e0d6] bg-white p-6 shadow-lg sm:p-10 print:p-0">
          {/* masthead */}
          <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-hon-green pb-6">
            <div className="flex items-start gap-4">
              {settings?.storeLogo && (
                <img src={settings.storeLogo} alt={bill.storeName} className="h-14 w-14 shrink-0 rounded-md border border-border object-contain p-1" />
              )}
              <div>
                <p className="text-2xl font-black tracking-[0.28em] text-hon-green-dark">WOODEX</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{bill.tagline}</p>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  {bill.address}<br />{bill.city}, Pakistan<br />{bill.phone} · {bill.email}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold uppercase tracking-widest text-foreground">Invoice</p>
              <p className="mt-1 font-mono text-sm font-semibold text-foreground">{order.id}</p>
              <p className="text-[11px] text-muted-foreground">Placed {formatDateTime(order.placedAt)}</p>
              <div className="mt-2 flex justify-end"><OrderStatusBadge status={order.status} /></div>
            </div>
          </header>

          {/* bill to + fulfilment */}
          <section className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Bill to</p>
              <p className="mt-1.5 text-sm font-semibold text-foreground">{order.customerName}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {order.address && <>{order.address}<br /></>}{order.city}, Pakistan<br />{order.customerPhone}<br />{order.customerEmail}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fulfilment</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Payment: <span className="font-semibold text-foreground">{paymentLabel(order.paymentMethod)}</span><br />
                Items: <span className="font-semibold text-foreground">{itemQty}</span><br />
                {order.courierName && <>Courier: <span className="font-semibold text-foreground">{order.courierName}</span><br /></>}
                {order.trackingNumber && <>Consignment: <span className="font-mono font-semibold text-foreground">{order.trackingNumber}</span></>}
              </p>
              {order.paymentMethod === "cod" && (
                <p className="mt-2 inline-block rounded-full border border-amber-400 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                  Cash on Delivery — collect Rs {order.total.toLocaleString("en-PK")} at the door
                </p>
              )}
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
              {order.items.map((item, i) => (
                <tr key={item.id}>
                  <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium text-foreground">{item.name}</td>
                  <td className="py-2 pr-2 text-right">{item.quantity}</td>
                  <td className="py-2 pr-2 text-right">{formatPKR(item.price)}</td>
                  <td className="py-2 text-right font-semibold">{formatPKR(item.price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* totals */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-[240px] space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPKR(order.subtotal)}</span></div>
              {order.discountAmount ? <div className="flex justify-between text-emerald-700"><span>Discount{order.discountPct ? ` (${order.discountPct}%)` : ""}</span><span>−{formatPKR(order.discountAmount)}</span></div> : null}
              <div className="flex justify-between"><span>Delivery</span><span>{order.shipping === 0 ? "FREE" : formatPKR(order.shipping)}</span></div>
              {bill.taxRate > 0 && <div className="flex justify-between"><span>Tax</span><span>{bill.taxRate}%</span></div>}
              <div className="flex justify-between border-t-2 border-hon-green pt-1.5 text-sm font-black text-foreground"><span>Total</span><span>{formatPKR(order.total)}</span></div>
            </div>
          </div>

          {/* footer */}
          <footer className="mt-8 border-t border-border pt-4 text-[10px] leading-relaxed text-muted-foreground">
            {bill.deliveryNote && <p>{bill.deliveryNote}</p>}
            <p className="mt-1">Claims &amp; returns: quote invoice <span className="font-mono">{order.id}</span> within 7 days of delivery — {bill.phone} (WhatsApp {bill.whatsapp}) or {bill.email}.</p>
            <p className="mt-2 text-center text-[9px] uppercase tracking-[0.3em] text-muted-foreground/70">Thank you for choosing WOODEX</p>
          </footer>
        </main>
      )}
    </div>
  );
}
