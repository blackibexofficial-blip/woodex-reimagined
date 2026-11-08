import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminApi } from "@/api";
import { toast } from "sonner";
import SaleDocumentForm, { type SaleDocumentPayload } from "@/admin/components/SaleDocumentForm";

/** Full-page manual order entry — /admin/orders/new (channel "manual"). */
export default function AdminOrderNew() {
  const api = useMemo(() => getAdminApi(), []);
  const navigate = useNavigate();

  const onSubmit = async (payload: SaleDocumentPayload) => {
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
      toast.success(`${created.id} created — opening the printable order document.`);
      navigate(`/admin/order/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the order.");
    }
  };

  return (
    <SaleDocumentForm
      mode="order"
      title="New order"
      subtitle="Manual order on channel “manual” — same materialisation path the quotation conversion uses."
      submitLabel="Create order"
      submitNote="Creates a persisted order (status: pending). Stock is not deducted until dispatch — move it through the order lifecycle, exactly like a storefront order."
      backTo="/admin/orders"
      backLabel="Back to orders"
      onSubmit={onSubmit}
    />
  );
}
