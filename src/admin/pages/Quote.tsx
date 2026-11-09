import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Printer, ScrollText } from "lucide-react";
import { getAdminApi } from "@/api";
import { useAdminAuth } from "@/admin/auth";
import { formatPKR, formatDate, formatDateTime, QuoteStatusBadge } from "@/admin/components";
import type { AdminQuote, AdminQuoteTemplate, StoreSettings } from "@/api/types";
import { findTemplate, renderBlock, dimSpec, DEFAULT_QUOTE_TEMPLATE } from "@/api/quote-templates";
import { A4Shell, A4Chrome, A4Notice } from "@/admin/components/documents/A4";
import QuoteA4Sheet from "@/admin/components/documents/QuoteA4Sheet";

/** Chrome-free printable quotation — mounted at /admin/quote/:id outside the admin layout. */
export default function AdminQuotePrint() {
  const { user } = useAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<AdminQuote | null | undefined>(undefined);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [templates, setTemplates] = useState<AdminQuoteTemplate[]>([]);

  useEffect(() => {
    if (!id) { setQuote(null); return; }
    let alive = true;
    const api = getAdminApi();
    api.getQuote(id)
      .then((q) => { if (alive) setQuote(q ?? null); })
      .catch((e) => { console.error(e); if (alive) setQuote(null); });
    api.getSettings()
      .then((s2) => { if (alive) setSettings(s2); })
      .catch(() => { /* settings are decorative on the quote — keep defaults impression */ });
    api.listQuoteTemplates()
      .then((list) => { if (alive) setTemplates(list); })
      .catch(() => { /* builtin template still applies */ });
    return () => { alive = false; };
  }, [id]);

  if (!user) return <Navigate to="/admin/login" replace />;

  const tDoc = quote ? findTemplate(templates, quote.templateId) : DEFAULT_QUOTE_TEMPLATE;
  const brand = tDoc.brandColor || DEFAULT_QUOTE_TEMPLATE.brandColor;
  const hb = new Map(tDoc.header.map((b) => [b.type, b]));
  const fb = new Map(tDoc.footer.map((b) => [b.type, b]));
  const vars = { ref: quote?.id ?? "", version: quote?.version ?? 1, validUntil: quote ? formatDate(quote.validUntil) : "", customer: quote?.customerName ?? "" };
  const bill = settings ?? { storeName: "WOODEX", tagline: "Premium Office & Home Furniture", phone: "+92 300 1234567", whatsapp: "+92 300 1234567", email: "hello@woodex.pk", address: "Showroom & Factory, 12-km Sheikh Zayed Road", city: "Lahore", currency: "PKR", deliveryNote: "", taxRate: 0 };
  const itemQty = quote?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const expired = quote && ["draft", "review", "approval", "revised", "sent"].includes(quote.status) && new Date(quote.validUntil).getTime() < Date.now();

  // Woodex A4 layout — redesigned sheet; classic layout below is untouched.
  if (tDoc.layout === "a4") {
    return (
      <A4Shell>
        <A4Chrome backTo="/admin/quotes" backLabel="Back to quotes" />
        {quote === undefined ? (
          <A4Notice title="Loading quotation…" />
        ) : quote === null ? (
          <A4Notice title="Quotation not found" hint={`No quotation exists for ID “${id}”. It may have been removed from the demo store.`} />
        ) : (
          <>
            {expired && (
              <div className="mx-auto mb-3 w-full max-w-[794px] rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-[11px] font-semibold text-rose-800">
                This quotation expired on {formatDate(quote.validUntil)} — request a refreshed quotation.
              </div>
            )}
            <QuoteA4Sheet quote={quote} tDoc={tDoc} vars={vars} storeLogo={settings?.storeLogo ?? undefined} />
          </>
        )}
      </A4Shell>
    );
  }

  return (
    <div className="min-h-screen bg-[#eceae4] px-4 py-6 sm:py-10 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 13mm 12mm; }
          html, body { background: #ffffff !important; }
          .quote-chrome { display: none !important; }
          .quote-sheet { box-shadow: none !important; border: none !important; max-width: none !important; margin: 0 !important; border-radius: 0 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* screen-only toolbar */}
      <div className="quote-chrome mx-auto mb-4 flex max-w-[820px] items-center justify-between gap-3">
        <Link to="/admin/quotes" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to quotes
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-hon-green px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-hon-green-dark">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      {quote === undefined ? (
        <div className="mx-auto flex max-w-[820px] items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading quotation…
        </div>
      ) : quote === null ? (
        <div className="mx-auto max-w-[820px] rounded-lg border border-muted bg-white p-10 text-center">
          <ScrollText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Quotation not found</p>
          <p className="mt-1 text-xs text-muted-foreground">No quotation exists for ID “{id}”. It may have been removed from the demo store.</p>
        </div>
      ) : (
        <main className="quote-sheet mx-auto max-w-[820px] rounded-xl border border-[#e3e0d6] bg-white p-6 shadow-lg sm:p-10 print:p-0">
          {/* masthead — rendered from the quote's print template blocks */}
          <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 pb-6" style={{ borderColor: brand }}>
            {hb.get("letterhead")?.visible && (
              <div className="flex items-start gap-4">
                {settings?.storeLogo && (
                  <img src={settings.storeLogo} alt={bill.storeName} className="h-14 w-14 shrink-0 rounded-md border border-border object-contain p-1" />
                )}
                <div>
                  <p className="text-2xl font-black tracking-[0.28em]" style={{ color: brand }}>WOODEX</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{bill.tagline}</p>
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    {bill.address}<br />{bill.city}, Pakistan<br />{bill.phone} · {bill.email}
                  </p>
                </div>
              </div>
            )}
            <div className="text-right">
              {hb.get("doc-title")?.visible && (
                <p className="text-lg font-bold uppercase tracking-widest" style={{ color: brand }}>{renderBlock(tDoc, "doc-title", vars)}</p>
              )}
              {hb.get("doc-ref")?.visible && (
                <p className="mt-1 font-mono text-sm font-semibold text-foreground">{renderBlock(tDoc, "doc-ref", vars)}</p>
              )}
              <p className="text-[11px] text-muted-foreground">Issued {formatDateTime(quote.createdAt)} · v{quote.version ?? 1}</p>
              <div className="mt-2 flex justify-end"><QuoteStatusBadge status={quote.status} /></div>
            </div>
          </header>

          {/* validity banner — its visibility rides the validity template block */}
          {hb.get("validity")?.visible && (
            <div className={`mt-4 rounded-lg border px-4 py-2 text-[11px] font-semibold ${expired ? "border-rose-300 bg-rose-50 text-rose-800" : "border-hon-green-pale bg-hon-green-pale/50 text-hon-green-dark"}`}>
              {expired
                ? `This quotation expired on ${formatDate(quote.validUntil)} — request a refreshed quotation.`
                : `${renderBlock(tDoc, "validity", vars)} — ${quote.validityDays}-day validity from issue.`}
            </div>
          )}

          {/* bill to + terms */}
          <section className="grid grid-cols-1 gap-4 py-6 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Prepared for</p>
              <p className="mt-1.5 text-sm font-semibold text-foreground">{quote.customerName}</p>
              {quote.company && <p className="text-[11px] font-medium text-violet-700">{quote.company}</p>}
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {quote.address && <>{quote.address}<br /></>}{quote.city ? <>{quote.city}, Pakistan<br /></> : null}{quote.customerPhone}<br />{quote.customerEmail}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Terms</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Discount: <span className="font-semibold text-foreground">{quote.discountPct}%</span><br />
                Items: <span className="font-semibold text-foreground">{itemQty}</span><br />
                Made-to-order: 50% advance, 50% on delivery<br />
                Stock items: {quote.shipping === 0 ? "FREE delivery" : `Delivery ${formatPKR(quote.shipping)}`}
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
              {quote.items.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-[11px] text-muted-foreground">Line items pending — WOODEX will confirm the final scope with you.</td></tr>
              ) : quote.items.map((item, i) => (
                <tr key={item.id}>
                  <td className="py-2 pr-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-2">
                    <span className="font-medium text-foreground">{item.name}</span>
                    {(item.category || item.series || item.material || item.finish || dimSpec(item)) && (
                      <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">{[item.category, item.series, item.material, item.finish, dimSpec(item)].filter(Boolean).join(" · ")}</span>
                    )}
                  </td>
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
              <div className="flex justify-between"><span>Subtotal</span><span>{formatPKR(quote.subtotal)}</span></div>
              {quote.discountAmount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount ({quote.discountPct}%)</span><span>−{formatPKR(quote.discountAmount)}</span></div>}
              <div className="flex justify-between"><span>Delivery</span><span>{quote.shipping === 0 ? "FREE" : formatPKR(quote.shipping)}</span></div>
              <div className="flex justify-between border-t-2 pt-1.5 text-sm font-black text-foreground" style={{ borderColor: brand }}><span>Total</span><span>{formatPKR(quote.total)}</span></div>
            </div>
          </div>

          {/* footer — blocks rendered from the quote's print template */}
          <footer className="mt-8 space-y-3 border-t border-border pt-4 text-[10px] leading-relaxed text-muted-foreground">
            {fb.get("payment-note")?.visible && (
              <div className="rounded-md border-2 p-3" style={{ borderColor: brand }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: brand }}>Payment &amp; delivery</p>
                <p className="mt-1 whitespace-pre-line text-[11px] font-medium text-foreground">{renderBlock(tDoc, "payment-note", vars)}</p>
              </div>
            )}
            {fb.get("terms")?.visible && <p>{renderBlock(tDoc, "terms", vars)}</p>}
            {tDoc.footer.filter((b) => b.type === "custom" && b.visible).map((b) => <p key={b.id}>{b.content}</p>)}
            {fb.get("signature")?.visible && (
              <div className="grid grid-cols-2 gap-8 pt-6">
                <div className="border-t border-border pt-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground">Customer acceptance — sign &amp; date</div>
                <div className="border-t border-border pt-1 text-center text-[10px] uppercase tracking-widest text-muted-foreground">For WOODEX — authorised signatory</div>
              </div>
            )}
            <p>Confirm this quotation by replying on WhatsApp {bill.whatsapp} or emailing {bill.email} — quote <span className="font-mono">{quote.id}</span>.</p>
            <p className="mt-1">5-year structural warranty on WOODEX-built frames · installation available in Lahore, Karachi, Islamabad &amp; Rawalpindi · claims: quote your invoice number within 7 days of delivery.</p>
            <p className="mt-2 text-center text-[9px] uppercase tracking-[0.3em] text-muted-foreground/70">Thank you for choosing WOODEX</p>
          </footer>
        </main>
      )}
    </div>
  );
}
