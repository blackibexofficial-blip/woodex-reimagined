import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getAdminApi } from "@/api";
import { useAdminAuth } from "@/admin/auth";
import { formatPKR, formatDate } from "@/admin/components";
import type { AdminPurchaseOrder, AdminSupplier } from "@/api/types";
import { WOODEX_LETTERHEAD, woodexThankYou } from "@/admin/components/documents/letterhead";
import {
  A4Shell, A4Chrome, A4Page, A4Notice, A4Masthead, A4PartyGrid, A4ItemsTable, A4Summary, A4Terms, A4FooterBlock,
} from "@/admin/components/documents/A4";

const SUPPLIER_TERMS_LABEL: Record<AdminSupplier["paymentTerms"], string> = {
  advance: "100% advance with order confirmation",
  cod: "Cash on delivery",
  net15: "Net 15 days from invoice",
  net30: "Net 30 days from invoice",
  net45: "Net 45 days from invoice",
};

/** Chrome-free printable purchase order — /admin/purchase-order/:id */
export default function AdminPurchaseOrderPrint() {
  const { user } = useAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [po, setPo] = useState<AdminPurchaseOrder | null | undefined>(undefined);
  const [supplier, setSupplier] = useState<AdminSupplier | undefined>(undefined);

  useEffect(() => {
    if (!id) { setPo(null); return; }
    let alive = true;
    const api = getAdminApi();
    api.getPurchaseOrder(id)
      .then((p) => { if (alive) { setPo(p ?? null); if (p?.supplierId) {
        api.listSuppliers({}).then((sups) => { if (alive) setSupplier(sups.find((s) => s.id === p.supplierId)); }).catch(() => undefined);
      } } })
      .catch((e) => { console.error(e); if (alive) setPo(null); });
    return () => { alive = false; };
  }, [id]);

  if (!user) return <Navigate to="/admin/login" replace />;

  const anyReceived = !!po && po.lines.some((l) => (l.receivedQuantity ?? 0) > 0);
  const statusText = po ? po.status.charAt(0).toUpperCase() + po.status.slice(1) : undefined;

  return (
    <A4Shell>
      <A4Chrome backTo="/admin/purchase-orders" backLabel="Back to purchase orders" />

      {po === undefined ? (
        <A4Notice title="Loading purchase order…" />
      ) : po === null ? (
        <A4Notice title="Purchase order not found" hint={`No purchase order exists for ID “${id}”.`} />
      ) : (
        <A4Page>
          <A4Masthead
            accent="#347647"
            brandLines={[...WOODEX_LETTERHEAD.lines]}
            docTitle="Purchase Order"
            refRows={[
              { label: "Ref", value: po.id },
              { label: "Raised", value: formatDate(po.createdAt) },
              { label: "Expected", value: po.expectedDate ? formatDate(po.expectedDate) : "To be confirmed" },
              { label: "Status", value: statusText ?? "Draft" },
            ]}
          />

          <A4PartyGrid
            cells={[
              {
                label: "Supplier",
                title: po.supplierName,
                lines: [
                  supplier?.contactName,
                  supplier?.address,
                  supplier?.city,
                  supplier?.taxId ? `NTN / STRN ${supplier.taxId}` : undefined,
                ].filter((l): l is string => !!l),
              },
              {
                label: "Deliver to",
                title: "Woodex Furniture — Warehouse",
                lines: [...WOODEX_LETTERHEAD.addressLines, WOODEX_LETTERHEAD.phone],
              },
              {
                label: "Attention",
                title: supplier?.contactName ?? po.supplierName,
                lines: [supplier?.phone, supplier?.email].filter((l): l is string => !!l),
              },
            ]}
          />

          {po.notes && <p className="mt-3 text-[10px] leading-relaxed" style={{ color: "#37433c" }}>Notes: {po.notes}</p>}

          <A4ItemsTable
            accent="#347647"
            columns={[
              { label: "#", width: "34px" },
              { label: "SKU", width: "88px" },
              { label: "Description" },
              { label: "Qty", width: "44px", align: "center" },
              ...(anyReceived ? [{ label: "Received", width: "66px", align: "center" as const }] : []),
              { label: "Unit cost", width: "96px", align: "right" },
              { label: "Amount", width: "106px", align: "right" },
            ]}
            rows={po.lines.map((line, i) => {
              const cells = [
                <span key="n" className="tabular-nums" style={{ color: "#5b6660" }}>{String(i + 1).padStart(2, "0")}</span>,
                <span key="sku" className="break-all font-mono text-[10px] font-semibold" style={{ color: "#37433c" }}>{line.sku ?? line.productId ?? "—"}</span>,
                <span key="desc" className="font-semibold">{line.name}</span>,
                <span key="qty" className="tabular-nums">{line.quantity}</span>,
              ];
              if (anyReceived) cells.push(<span key="recv" className="tabular-nums">{line.receivedQuantity ?? 0}</span>);
              cells.push(
                <span key="cost" className="tabular-nums">{formatPKR(line.costPrice)}</span>,
                <span key="amount" className="font-bold tabular-nums">{formatPKR(line.costPrice * line.quantity)}</span>,
              );
              return cells;
            })}
            emptyNote="No lines on this purchase order."
          />

          <A4Summary
            accent="#347647"
            rows={[
              { label: "Lines", value: String(po.lines.length) },
              { label: "PO total", value: formatPKR(po.subtotal), kind: "total" },
            ]}
            note="Subtotal = Σ unit cost × quantity, excluding taxes and freight unless stated."
          />

          <A4Terms
            accent="#347647"
            rows={[
              { label: "Payment", text: supplier ? SUPPLIER_TERMS_LABEL[supplier.paymentTerms] : "Per supplier agreement — see master file." },
              { label: "Delivery", text: po.expectedDate ? `Goods to reach the WOODEX warehouse by ${formatDate(po.expectedDate)}.` : "Delivery schedule to be confirmed in writing with the supplier." },
              { label: "Quality", text: "All lines are inspected on receipt. Shortages and damages are notified to the supplier within 7 days of delivery." },
              { label: "Invoice ref", text: "Supplier invoice must quote this PO number. Unmatched invoices are held at accounts." },
            ]}
          />

          <A4FooterBlock
            accent="#347647"
            contactLines={[...WOODEX_LETTERHEAD.lines]}
            addressLines={[...WOODEX_LETTERHEAD.addressLines]}
            phone={WOODEX_LETTERHEAD.phone}
            email={WOODEX_LETTERHEAD.email}
            signature={{ left: "Supplier acceptance — stamp & sign", right: "For Woodex — procurement" }}
            thanks={woodexThankYou}
            captionLeft="Authorized Purchase Order"
            captionRight={WOODEX_LETTERHEAD.domain}
          />
        </A4Page>
      )}
    </A4Shell>
  );
}
