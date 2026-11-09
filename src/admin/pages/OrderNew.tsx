import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminApi } from "@/api";
import { toast } from "sonner";
import SaleDocumentForm, { type SaleDocumentPayload } from "@/admin/components/SaleDocumentForm";
import { unconfirmedOrderDetail } from "@/lib/order-submission";

/** Full-page manual order entry — /admin/orders/new (channel "manual"). */
export default function AdminOrderNew() {
  const api = useMemo(() => getAdminApi(), []);
  const navigate = useNavigate();
  const retryBlocked = useRef(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const [unconfirmedDetail, setUnconfirmedDetail] = useState<string | null>(null);
  const [retryAcknowledged, setRetryAcknowledged] = useState(false);
  const markUnconfirmed = (detail: string | null) => {
    retryBlocked.current = true;
    setUnknownOutcome(true);
    setUnconfirmedDetail(detail);
    setRetryAcknowledged(false);
    toast.error("Order outcome could not be confirmed. Reconcile before submitting again.");
  };

  const onSubmit = async (payload: SaleDocumentPayload) => {
    if (retryBlocked.current) return;
    try {
      const created = await api.createOrder({
        channelId: "manual",
        customerName: payload.customerName,
        customerEmail: payload.customerEmail,
        customerPhone: payload.customerPhone,
        address: payload.address,
        city: payload.city,
        notes: payload.notes,
        paymentMethod: payload.paymentMethod,
        items: payload.items.map((l, i) => ({
          id: l.productId ?? `free-${Date.now().toString(36)}-${i}`,
          name: l.name,
          price: l.price,
          quantity: l.quantity,
          image: l.image,
          sku: l.sku,
          category: l.category,
          series: l.series,
          material: l.material,
          finish: l.finish,
          width: l.width,
          height: l.height,
          depth: l.depth,
          unit: l.unit,
        })),
        subtotal: payload.subtotal,
        shipping: payload.shipping,
        total: payload.total,
      });
      const detail = unconfirmedOrderDetail(created.submissionOutcome);
      if (detail) {
        markUnconfirmed(detail);
        return;
      }
      toast.success(`${created.id} created — opening the printable order document.`);
      navigate(`/admin/order/${created.id}`);
    } catch (e) {
      console.error("Order outcome could not be confirmed:", e);
      markUnconfirmed(null);
    }
  };

  return (
    <SaleDocumentForm
      mode="order"
      title="New order"
      subtitle="Manual order on channel “manual” — same materialisation path the quotation conversion uses."
      submitLabel="Create order"
      submitNote="Order creation and stock handling depend on the configured backend. Verify the result before fulfilling an order."
      submitBlocked={unknownOutcome && !retryAcknowledged}
      submitWarning={unknownOutcome ? (
        <div role="alert" className="mb-3 space-y-2 rounded border border-amber-600 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Order creation could not be confirmed.</p>
          {unconfirmedDetail && <p>{unconfirmedDetail}</p>}
          <p>The order may already exist. Reconcile with the backend before retrying to avoid duplicates.</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={retryAcknowledged} onChange={(e) => { retryBlocked.current = !e.target.checked; setRetryAcknowledged(e.target.checked); }} />
            <span>I understand another submission may create a duplicate order.</span>
          </label>
        </div>
      ) : undefined}
      backTo="/admin/orders"
      backLabel="Back to orders"
      onSubmit={onSubmit}
    />
  );
}
