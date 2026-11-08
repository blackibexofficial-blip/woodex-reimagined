import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { getAdminApi } from "@/api";
import { useAdminAuth } from "@/admin/auth";
import { formatPKR, formatDate } from "@/admin/components";
import type { AdminInvoice } from "@/api/types";
import { WOODEX_LETTERHEAD, woodexThankYou, itemCode } from "@/admin/components/documents/letterhead";
import {
  A4Shell, A4Chrome, A4Page, A4Notice, A4Masthead, A4PartyGrid, A4ItemsTable, A4Summary, A4Terms, A4FooterBlock,
} from "@/admin/components/documents/A4";
import { useStoreLogo } from "@/admin/components/documents/useStoreLogo";

/** Chrome-free printable invoice — mounted at /admin/invoice-document/:id outside the admin layout. */
export default function AdminInvoiceDocument() {
  const { user } = useAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<AdminInvoice | null | undefined>(undefined);

  useEffect(() => {
    if (!id) { setInvoice(null); return; }
    let alive = true;
    const api = getAdminApi();
    api.getInvoice(id)
      .then((inv) => { if (alive) setInvoice(inv ?? null); })
      .catch((e) => { console.error(e); if (alive) setInvoice(null); });
    return () => { alive = false; };
  }, [id]);

  const storeLogo = useStoreLogo();
  if (!user) return <Navigate to="/admin/login" replace />;

  const overdue = invoice && invoice.status !== "Paid" && invoice.status !== "Cancelled" && invoice.balance > 0 && !!invoice.due && Date.parse(invoice.due) < Date.now();
  const paidInFull = invoice?.status === "Paid";
  const statusText = paidInFull ? "Paid in full" : overdue ? "Overdue" : invoice?.status;

  return (
    <A4Shell>
      <A4Chrome backTo="/admin/invoices" backLabel="Back to invoices" />

      {invoice === undefined ? (
        <A4Notice title="Loading invoice…" />
      ) : invoice === null ? (
        <A4Notice title="Invoice not found" hint={`No invoice exists for ID “${id}”. It may have been removed from the demo store.`} />
      ) : (
        <A4Page>
          <A4Masthead
            logo={storeLogo}
            accent="#347647"
            brandLines={[...WOODEX_LETTERHEAD.lines]}
            docTitle="Invoice"
            refRows={[
              { label: "Ref", value: invoice.ref ?? invoice.id },
              { label: "Issued", value: formatDate(invoice.createdAt) },
              { label: "Due", value: invoice.due ? formatDate(invoice.due) : "On receipt" },
              { label: "Status", value: statusText ?? "Issued" },
            ]}
          />

          {(overdue || paidInFull) && (
            <div
              className={`mt-4 w-full rounded-md border px-4 py-2 text-[10.5px] font-semibold ${paidInFull ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-300 bg-rose-50 text-rose-800"}`}
            >
              {paidInFull
                ? "Settled in full — thank you. No further action required."
                : `Payment overdue — was due ${invoice.due ? formatDate(invoice.due) : "earlier"}. Outstanding ${formatPKR(invoice.balance)}.`}
            </div>
          )}

          <A4PartyGrid
            cells={[
              {
                label: "Bill to",
                title: invoice.customer,
                lines: [invoice.company, invoice.city ? `${invoice.city}, Pakistan` : undefined].filter((l): l is string => !!l),
              },
              {
                label: "References",
                title: invoice.quoteId ? `Quote ${invoice.quoteId}` : invoice.orderId ? `Order ${invoice.orderId}` : "Direct issue",
                lines: [invoice.quoteId && invoice.orderId ? `Order ${invoice.orderId}` : undefined].filter((l): l is string => !!l),
              },
              {
                label: "Attention",
                title: invoice.customer,
                lines: [invoice.company ? "Accounts / procurement" : undefined].filter((l): l is string => !!l),
              },
            ]}
          />

          <A4ItemsTable
            accent="#347647"
            columns={[
              { label: "#", width: "34px" },
              { label: "Item code", width: "112px" },
              { label: "Description" },
              { label: "Qty", width: "44px", align: "center" },
              { label: "Rate", width: "96px", align: "right" },
              { label: "Amount", width: "106px", align: "right" },
            ]}
            rows={invoice.items.map((item, i) => [
              <span key="n" className="tabular-nums" style={{ color: "#5b6660" }}>{String(i + 1).padStart(2, "0")}</span>,
              <span key="code" className="break-all font-mono text-[10px] font-semibold" style={{ color: "#37433c" }}>{itemCode(undefined, item.id)}</span>,
              <span key="desc" className="font-semibold">{item.name}</span>,
              <span key="qty" className="tabular-nums">{item.quantity}</span>,
              <span key="rate" className="tabular-nums">{formatPKR(item.price)}</span>,
              <span key="amount" className="font-bold tabular-nums">{formatPKR(item.price * item.quantity)}</span>,
            ])}
            emptyNote="Line breakdown not recorded for this invoice — see totals."
          />

          <A4Summary
            accent="#347647"
            rows={[
              { label: "Subtotal", value: formatPKR(invoice.subtotal) },
              ...(invoice.discount > 0 ? [{ label: "Discount", value: `−${formatPKR(invoice.discount)}`, kind: "discount" as const }] : []),
              { label: "Sales tax", value: invoice.tax > 0 ? formatPKR(invoice.tax) : "—" },
              { label: "Delivery & logistics", value: invoice.shipping === 0 ? "FREE" : formatPKR(invoice.shipping) },
              { label: "Invoice total", value: formatPKR(invoice.total), kind: "total" },
            ]}
            callout={{
              title: "Ledger",
              rows: [
                { label: "Paid to date", value: formatPKR(invoice.paid) },
                { label: "Balance due", value: formatPKR(invoice.balance) },
              ],
            }}
            note="Balance = total − paid, recomputed on every read."
          />

          {invoice.notes && <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#37433c" }}>{invoice.notes}</p>}

          <A4Terms
            accent="#347647"
            rows={[
              { label: "Payment", text: "Bank transfer to the WOODEX account shared with your order confirmation, quoting this invoice number." },
              { label: "Due", text: invoice.due ? `Payment due by ${formatDate(invoice.due)}. Part payments accepted via the accounts desk.` : "Payment due on receipt." },
              { label: "Claims", text: "Quote this invoice number within 7 days of delivery. 5-year structural warranty on WOODEX-built frames." },
              { label: "Reconciliation", text: "WOODEX reconciles payments weekly against the ledger. Receipts shared on WhatsApp on working days." },
            ]}
          />

          <A4FooterBlock
            accent="#347647"
            contactLines={[...WOODEX_LETTERHEAD.lines]}
            addressLines={[...WOODEX_LETTERHEAD.addressLines]}
            phone={WOODEX_LETTERHEAD.phone}
            email={WOODEX_LETTERHEAD.email}
            thanks={woodexThankYou}
            captionLeft="Authorized Invoice"
            captionRight={WOODEX_LETTERHEAD.domain}
          />
        </A4Page>
      )}
    </A4Shell>
  );
}
