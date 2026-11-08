import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getAdminApi } from "@/api";
import { useAdminAuth } from "@/admin/auth";
import { formatPKR, formatDate } from "@/admin/components";
import type { AdminReturn, ReturnReason } from "@/api/types";
import { WOODEX_LETTERHEAD, woodexThankYou, itemCode } from "@/admin/components/documents/letterhead";
import {
  A4Shell, A4Chrome, A4Page, A4Notice, A4Masthead, A4PartyGrid, A4ItemsTable, A4Summary, A4Terms, A4FooterBlock,
} from "@/admin/components/documents/A4";

const REASON_LABELS: Record<ReturnReason, string> = {
  damaged: "Damaged in transit",
  wrong_item: "Wrong item delivered",
  not_as_described: "Not as described",
  changed_mind: "Changed mind",
  other: "Other",
};

const STATUS_LABELS: Record<AdminReturn["status"], string> = {
  requested: "Requested",
  received: "Received",
  inspected: "Inspected",
  refunded: "Refunded",
  replaced: "Replaced",
  rejected: "Rejected",
};

/** Chrome-free printable return authorization (RMA) — /admin/return/:id */
export default function AdminReturnPrint() {
  const { user } = useAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [ret, setRet] = useState<AdminReturn | null | undefined>(undefined);

  useEffect(() => {
    if (!id) { setRet(null); return; }
    let alive = true;
    getAdminApi().getReturn(id)
      .then((r) => { if (alive) setRet(r ?? null); })
      .catch((e) => { console.error(e); if (alive) setRet(null); });
    return () => { alive = false; };
  }, [id]);

  if (!user) return <Navigate to="/admin/login" replace />;

  const returnValue = ret?.items.reduce((s, i) => s + i.price * i.quantity, 0) ?? 0;
  const refund = ret?.refundAmount ?? returnValue;
  const refundEstimated = ret ? ret.refundAmount === undefined : false;

  return (
    <A4Shell>
      <A4Chrome backTo="/admin/returns" backLabel="Back to returns" />

      {ret === undefined ? (
        <A4Notice title="Loading return…" />
      ) : ret === null ? (
        <A4Notice title="Return not found" hint={`No return authorization exists for ID “${id}”.`} />
      ) : (
        <A4Page>
          <A4Masthead
            accent="#347647"
            brandLines={[...WOODEX_LETTERHEAD.lines]}
            docTitle="Return"
            refRows={[
              { label: "Ref", value: ret.id },
              { label: "Raised", value: formatDate(ret.createdAt) },
              { label: "Against", value: ret.orderId },
              { label: "Status", value: STATUS_LABELS[ret.status] },
            ]}
          />

          <A4PartyGrid
            cells={[
              {
                label: "Customer",
                title: ret.customerName,
                lines: [ret.customerPhone, ret.customerEmail].filter(Boolean),
              },
              {
                label: "Original order",
                title: ret.orderId,
                lines: [ret.city],
              },
              {
                label: "Reason",
                title: REASON_LABELS[ret.reason],
                detail: ret.reasonDetail,
              },
            ]}
          />

          <A4ItemsTable
            accent="#347647"
            columns={[
              { label: "#", width: "34px" },
              { label: "Item code", width: "96px" },
              { label: "Item" },
              { label: "Qty", width: "44px", align: "center" },
              { label: "Rate", width: "96px", align: "right" },
              { label: "Amount", width: "106px", align: "right" },
            ]}
            rows={ret.items.map((item, i) => [
              <span key="n" className="tabular-nums" style={{ color: "#5b6660" }}>{String(i + 1).padStart(2, "0")}</span>,
              <span key="code" className="break-all font-mono text-[10px] font-semibold" style={{ color: "#37433c" }}>{itemCode(undefined, item.id)}</span>,
              <span key="desc" className="font-semibold">{item.name}</span>,
              <span key="qty" className="tabular-nums">{item.quantity}</span>,
              <span key="rate" className="tabular-nums">{formatPKR(item.price)}</span>,
              <span key="amount" className="font-bold tabular-nums">{formatPKR(item.price * item.quantity)}</span>,
            ])}
            emptyNote="No lines recorded for this return."
          />

          <A4Summary
            accent="#347647"
            rows={[
              { label: "Return value", value: formatPKR(returnValue), kind: "total" },
            ]}
            callout={{
              title: "Refund",
              rows: [
                { label: refundEstimated ? "Estimated refund (100%)" : "Approved refund", value: formatPKR(refund) },
                { label: "Restock to inventory", value: ret.restock ? "Yes" : "No" },
              ],
            }}
            note={refundEstimated
              ? "≈ full value of returned lines — final amount set after warehouse inspection."
              : "Final amount set at inspection; updates post to the refund ledger."}
          />

          {ret.inspectionNote && <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#37433c" }}>Inspection note: {ret.inspectionNote}</p>}

          <A4Terms
            accent="#347647"
            rows={[
              { label: "Reason", text: `${REASON_LABELS[ret.reason]}${ret.reasonDetail ? ` — ${ret.reasonDetail}` : ""}` },
              { label: "Inspection", text: "Lines are inspected within 3 working days of receipt at the WOODEX warehouse." },
              { label: "Refund", text: "Approved refunds are processed to the original payment method within 7 working days of inspection sign-off." },
              { label: "Restock", text: ret.restock ? "Accepted lines return to live inventory on receipt." : "Returned lines are quarantined and do not restock to live inventory." },
            ]}
          />

          <A4FooterBlock
            accent="#347647"
            contactLines={[...WOODEX_LETTERHEAD.lines]}
            addressLines={[...WOODEX_LETTERHEAD.addressLines]}
            phone={WOODEX_LETTERHEAD.phone}
            email={WOODEX_LETTERHEAD.email}
            signature={{ left: "Customer signature — sign & date", right: "WOODEX inspector — sign & date" }}
            thanks={woodexThankYou}
            captionLeft="Return Authorization"
            captionRight={WOODEX_LETTERHEAD.domain}
          />
        </A4Page>
      )}
    </A4Shell>
  );
}
