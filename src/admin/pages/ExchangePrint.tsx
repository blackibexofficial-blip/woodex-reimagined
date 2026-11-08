import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getAdminApi } from "@/api";
import { useAdminAuth } from "@/admin/auth";
import { formatPKR, formatDate } from "@/admin/components";
import type { AdminExchange } from "@/api/types";
import { WOODEX_LETTERHEAD, woodexThankYou, itemCode } from "@/admin/components/documents/letterhead";
import {
  A4Shell, A4Chrome, A4Page, A4Notice, A4Masthead, A4PartyGrid, A4ItemsTable, A4Summary, A4Terms, A4FooterBlock,
} from "@/admin/components/documents/A4";

const STATUS_LABELS: Record<AdminExchange["status"], string> = {
  requested: "Requested",
  approved: "Approved",
  shipped: "Shipped",
  completed: "Completed",
  rejected: "Rejected",
};

/** Chrome-free printable exchange authorization — /admin/exchange/:id */
export default function AdminExchangePrint() {
  const { user } = useAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [ex, setEx] = useState<AdminExchange | null | undefined>(undefined);

  useEffect(() => {
    if (!id) { setEx(null); return; }
    let alive = true;
    getAdminApi().getExchange(id)
      .then((e) => { if (alive) setEx(e ?? null); })
      .catch((e2) => { console.error(e2); if (alive) setEx(null); });
    return () => { alive = false; };
  }, [id]);

  if (!user) return <Navigate to="/admin/login" replace />;

  const incomingValue = ex?.incoming.reduce((s, i) => s + i.price * i.quantity, 0) ?? 0;
  const outgoingValue = ex?.outgoing.reduce((s, i) => s + i.price * i.quantity, 0) ?? 0;
  const diff = ex?.priceDifference ?? outgoingValue - incomingValue;
  const diffLabel = diff > 0 ? "Customer pays" : diff < 0 ? "Refund to customer" : "Even exchange";

  const lineRows = (items: AdminExchange["incoming"]) =>
    items.map((item, i) => [
      <span key="n" className="tabular-nums" style={{ color: "#5b6660" }}>{String(i + 1).padStart(2, "0")}</span>,
      <span key="code" className="break-all font-mono text-[10px] font-semibold" style={{ color: "#37433c" }}>{itemCode(undefined, item.id)}</span>,
      <span key="desc" className="font-semibold">{item.name}</span>,
      <span key="qty" className="tabular-nums">{item.quantity}</span>,
      <span key="rate" className="tabular-nums">{formatPKR(item.price)}</span>,
      <span key="amount" className="font-bold tabular-nums">{formatPKR(item.price * item.quantity)}</span>,
    ]);

  const columns = [
    { label: "#", width: "34px" },
    { label: "Item code", width: "96px" },
    { label: "Item" },
    { label: "Qty", width: "44px", align: "center" as const },
    { label: "Rate", width: "96px", align: "right" as const },
    { label: "Amount", width: "106px", align: "right" as const },
  ];

  return (
    <A4Shell>
      <A4Chrome backTo="/admin/exchanges" backLabel="Back to exchanges" />

      {ex === undefined ? (
        <A4Notice title="Loading exchange…" />
      ) : ex === null ? (
        <A4Notice title="Exchange not found" hint={`No exchange authorization exists for ID “${id}”.`} />
      ) : (
        <A4Page>
          <A4Masthead
            accent="#347647"
            brandLines={[...WOODEX_LETTERHEAD.lines]}
            docTitle="Exchange"
            refRows={[
              { label: "Ref", value: ex.id },
              { label: "Raised", value: formatDate(ex.createdAt) },
              { label: "Against", value: ex.orderId },
              { label: "Status", value: STATUS_LABELS[ex.status] },
            ]}
          />

          <A4PartyGrid
            cells={[
              {
                label: "Customer",
                title: ex.customerName,
                lines: [ex.customerPhone, ex.customerEmail].filter(Boolean),
              },
              {
                label: "Original order",
                title: ex.orderId,
                lines: [ex.city, ...(ex.returnId ? [`Linked RMA ${ex.returnId}`] : [])],
              },
              {
                label: "Reason",
                title: ex.reason ?? "Exchange",
              },
            ]}
          />

          <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: "#347647" }}>Coming back to WOODEX</p>
          <A4ItemsTable accent="#347647" columns={columns} rows={lineRows(ex.incoming)} emptyNote="Nothing recorded as returning." />

          <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: "#347647" }}>Dispatching to customer</p>
          <A4ItemsTable accent="#347647" columns={columns} rows={lineRows(ex.outgoing)} emptyNote="No replacement lines recorded yet." />

          <A4Summary
            accent="#347647"
            rows={[
              { label: "Incoming value", value: formatPKR(incomingValue) },
              { label: "Outgoing value", value: formatPKR(outgoingValue) },
              { label: "Price difference", value: diff === 0 ? "—" : `${diff < 0 ? "−" : "+"}${formatPKR(Math.abs(diff))}`, kind: "total" },
            ]}
            callout={{
              title: "Settlement",
              rows: [
                { label: diffLabel, value: diff === 0 ? "—" : formatPKR(Math.abs(diff)) },
                { label: "Difference status", value: ex.differenceSettled ? "Settled" : "Pending" },
              ],
            }}
            note="Outgoing value − incoming value. Positive = collected from customer; negative = refunded."
          />

          <A4Terms
            accent="#347647"
            rows={[
              { label: "Reason", text: ex.reason ?? "Customer-requested exchange — see original order." },
              { label: "Returns", text: "Returning lines come back to the WOODEX warehouse for inspection before replacements dispatch." },
              { label: "Settlement", text: diff > 0 ? `Customer settles the ${formatPKR(diff)} difference before dispatch.` : diff < 0 ? `WOODEX refunds the ${formatPKR(-diff)} difference to the original payment method.` : "Even exchange — no payment moves either way." },
              { label: "Timeline", text: "Replacement dispatches within 7 working days of the returning lines passing inspection." },
            ]}
          />

          <A4FooterBlock
            accent="#347647"
            contactLines={[...WOODEX_LETTERHEAD.lines]}
            addressLines={[...WOODEX_LETTERHEAD.addressLines]}
            phone={WOODEX_LETTERHEAD.phone}
            email={WOODEX_LETTERHEAD.email}
            signature={{ left: "Customer signature — sign & date", right: "WOODEX exchange desk — sign & date" }}
            thanks={woodexThankYou}
            captionLeft="Exchange Authorization"
            captionRight={WOODEX_LETTERHEAD.domain}
          />
        </A4Page>
      )}
    </A4Shell>
  );
}
