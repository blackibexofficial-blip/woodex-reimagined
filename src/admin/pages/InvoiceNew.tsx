import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminApi } from "@/api";
import { toast } from "sonner";
import SaleDocumentForm, { type SaleDocumentPayload } from "@/admin/components/SaleDocumentForm";

/**
 * Full-page direct invoice issuance — /admin/invoices/new.
 *
 * Invoices in this system are RPC-gated snapshots of quotes (quote_invoice_snapshot,
 * invoice_apply_payment) — there is deliberately no direct-insert path. So "New invoice"
 * issues through the same conversion: a linked draft quote is created behind the scenes
 * (catalogue reprice, second clerk can audit), then converted to the invoice. Both records
 * stay linked (invoice.quoteId ← quote.id) for the ledger.
 */
export default function AdminInvoiceNew() {
  const api = useMemo(() => getAdminApi(), []);
  const navigate = useNavigate();

  const onSubmit = async (payload: SaleDocumentPayload) => {
    try {
      const quote = await api.createQuote({
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        customerEmail: payload.customerEmail,
        city: payload.city,
        address: payload.address,
        notes: payload.notes,
        items: payload.items.map((l) => ({
          productId: l.productId,
          name: l.name,
          price: l.price,
          quantity: l.quantity,
          image: l.image,
          category: l.category,
          series: l.series,
          material: l.material,
          finish: l.finish,
          width: l.width,
          height: l.height,
          depth: l.depth,
          unit: l.unit,
        })),
        discountPct: payload.discountPct,
        validityDays: 14,
        shipping: payload.shipping,
      });
      const invoice = await api.convertQuoteToInvoice(quote.id);
      toast.success(`${invoice.id} issued against quote ${quote.id} — opening the printable invoice.`);
      navigate(`/admin/invoice-document/${invoice.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not issue the invoice.");
    }
  };

  return (
    <SaleDocumentForm
      mode="invoice"
      title="New invoice"
      subtitle="Direct invoice for a customer — issued through a linked quote snapshot for ledger audit integrity."
      submitLabel="Issue invoice"
      submitNote="Issuing runs createQuote → convertQuoteToInvoice: a hidden draft quote (catalogue-repriced, carrying the discount) is created and immediately snapshot-converted. The invoice keeps the quote link for audit; nothing is bypassed."
      backTo="/admin/invoices"
      backLabel="Back to invoices"
      onSubmit={onSubmit}
    />
  );
}
