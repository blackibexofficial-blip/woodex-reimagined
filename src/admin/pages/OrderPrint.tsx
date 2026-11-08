import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getAdminApi } from "@/api";
import { useAdminAuth } from "@/admin/auth";
import { formatPKR, formatDate, paymentLabel } from "@/admin/components";
import type { AdminOrder } from "@/api/types";
import { WOODEX_LETTERHEAD, woodexThankYou, itemCode } from "@/admin/components/documents/letterhead";
import { dimSpec } from "@/api/quote-templates";
import {
  A4Shell, A4Chrome, A4Page, A4Notice, A4Masthead, A4PartyGrid, A4ItemsTable, A4Summary, A4Terms, A4FooterBlock,
} from "@/admin/components/documents/A4";
import { useStoreLogo } from "@/admin/components/documents/useStoreLogo";

/** Chrome-free printable order confirmation — /admin/order/:id */
export default function AdminOrderPrint() {
  const { user } = useAdminAuth();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<AdminOrder | null | undefined>(undefined);

  useEffect(() => {
    if (!id) { setOrder(null); return; }
    let alive = true;
    getAdminApi().getOrder(id)
      .then((o) => { if (alive) setOrder(o ?? null); })
      .catch((e) => { console.error(e); if (alive) setOrder(null); });
    return () => { alive = false; };
  }, [id]);

  const storeLogo = useStoreLogo();
  if (!user) return <Navigate to="/admin/login" replace />;

  const hasDiscount = !!order && ((order.discountPct ?? 0) > 0 || (order.discountAmount ?? 0) > 0);
  const discountAmount = order?.discountAmount ?? (order ? Math.round(order.subtotal * ((order.discountPct ?? 0) / 100)) : 0);
  const statusText = order ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : undefined;

  return (
    <A4Shell>
      <A4Chrome backTo="/admin/orders" backLabel="Back to orders" />

      {order === undefined ? (
        <A4Notice title="Loading order…" />
      ) : order === null ? (
        <A4Notice title="Order not found" hint={`No order exists for ID “${id}”. It may have been removed from the demo store.`} />
      ) : (
        <A4Page>
          <A4Masthead
            logo={storeLogo}
            accent="#347647"
            brandLines={[...WOODEX_LETTERHEAD.lines]}
            docTitle="Order"
            refRows={[
              { label: "Ref", value: order.id },
              { label: "Placed", value: formatDate(order.placedAt) },
              { label: "Payment", value: paymentLabel(order.paymentMethod) },
              { label: "Status", value: statusText ?? "Pending" },
            ]}
          />

          <A4PartyGrid
            cells={[
              {
                label: "Prepared for",
                title: order.customerName,
                lines: [order.address].filter((l): l is string => !!l),
              },
              {
                label: "Delivery location",
                title: order.city,
                lines: [order.address ?? "Address on file with your order"].filter((l): l is string => !!l),
              },
              {
                label: "Attention",
                title: order.customerName,
                lines: [order.customerPhone, order.customerEmail].filter(Boolean),
              },
            ]}
          />

          {(order.courierName || order.trackingNumber) && (
            <div className="mt-4 rounded-md border px-4 py-2 text-[10.5px] font-semibold" style={{ borderColor: "#dfe9df", background: "#F1F6F1", color: "#2b5c38" }}>
              Dispatch: {order.courierName ?? "Courier to be confirmed"}{order.trackingNumber ? ` · consignment ${order.trackingNumber}` : ""}
            </div>
          )}

          <A4ItemsTable
            accent="#347647"
            columns={[
              { label: "#", width: "34px" },
              { label: "Item code", width: "86px" },
              { label: "Description & specs" },
              { label: "Qty", width: "44px", align: "center" },
              { label: "Rate", width: "96px", align: "right" },
              { label: "Amount", width: "106px", align: "right" },
            ]}
            rows={order.items.map((item, i) => [
              <span key="n" className="tabular-nums" style={{ color: "#5b6660" }}>{String(i + 1).padStart(2, "0")}</span>,
              <span key="code" className="break-all font-mono text-[10px] font-semibold" style={{ color: "#37433c" }}>{itemCode(item.sku, item.id)}</span>,
              <span key="desc">
                <span className="font-semibold">{item.name}</span>
                {[item.category, item.series, item.material, item.finish, dimSpec(item)].filter(Boolean).join(" · ") && (
                  <span className="mt-0.5 block text-[9px] font-normal" style={{ color: "#5b6660" }}>
                    {[item.category, item.series, item.material, item.finish, dimSpec(item)].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>,
              <span key="qty" className="tabular-nums">{item.quantity}</span>,
              <span key="rate" className="tabular-nums">{formatPKR(item.price)}</span>,
              <span key="amount" className="font-bold tabular-nums">{formatPKR(item.price * item.quantity)}</span>,
            ])}
            emptyNote="No lines recorded for this order."
          />

          <A4Summary
            accent="#347647"
            rows={[
              { label: "Subtotal", value: formatPKR(order.subtotal) },
              ...(hasDiscount ? [{ label: `Discount${order.discountPct ? ` (${order.discountPct}%)` : ""}`, value: `−${formatPKR(discountAmount)}`, kind: "discount" as const }] : []),
              { label: "Delivery & logistics", value: order.shipping === 0 ? "FREE" : formatPKR(order.shipping) },
              { label: "Order total", value: formatPKR(order.total), kind: "total" },
            ]}
            callout={{
              title: "Settlement",
              rows: [{ label: "Payment method", value: paymentLabel(order.paymentMethod) }],
            }}
            note="Prices and availability confirmed at dispatch. Order total covers goods, delivery and installation where stated."
          />

          {order.notes && <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#37433c" }}>Order notes: {order.notes}</p>}

          <A4Terms
            accent="#347647"
            rows={[
              { label: "Payment", text: `${paymentLabel(order.paymentMethod)} — quote order ${order.id} on every transfer and WhatsApp follow-up.` },
              { label: "Fulfilment", text: "Made-to-order pieces dispatch after measurements are confirmed. Stock pieces dispatch on the next freight run." },
              { label: "Courier", text: order.courierName ? `Dispatched via ${order.courierName}${order.trackingNumber ? ` — consignment ${order.trackingNumber}` : ""}.` : "You will receive courier name and consignment number once this order ships." },
              { label: "Claims", text: "Quote your invoice number within 7 days of delivery. 5-year structural warranty on WOODEX-built frames." },
            ]}
          />

          <A4FooterBlock
            accent="#347647"
            contactLines={[...WOODEX_LETTERHEAD.lines]}
            addressLines={[...WOODEX_LETTERHEAD.addressLines]}
            phone={WOODEX_LETTERHEAD.phone}
            email={WOODEX_LETTERHEAD.email}
            signature={{ left: "Customer acknowledgement — sign & date", right: "For Woodex — dispatch signatory" }}
            thanks={woodexThankYou}
            captionLeft="Order Confirmation"
            captionRight={WOODEX_LETTERHEAD.domain}
          />
        </A4Page>
      )}
    </A4Shell>
  );
}
