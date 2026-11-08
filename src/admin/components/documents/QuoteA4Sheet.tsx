/**
 * "Woodex A4" quotation sheet — renders a quote against the redesigned A4
 * document engine (src/admin/components/documents/A4). All text comes from
 * the quote's template blocks (letterhead feeds both masthead and footer),
 * so every region stays editable in the template designer.
 */
import type { AdminQuote, AdminQuoteTemplate } from "@/api/types";
import { renderBlock, renderGridBlock, dimSpec, clampAdvancePct, resolvePolicyTerms, FOOTER_PRESETS, type TemplateVars } from "@/api/quote-templates";
import { formatPKR, formatDate, formatDateTime } from "@/admin/components";
import { itemCode } from "@/admin/components/documents/letterhead";
import { A4Page, A4Masthead, A4PartyGrid, A4ItemsTable, A4Summary, A4Terms, A4FooterBlock } from "@/admin/components/documents/A4";

interface Props {
  quote: AdminQuote;
  tDoc: AdminQuoteTemplate;
  vars: TemplateVars;
  /** Store-level logo (Settings → Documents) — outranks the template's own logo. */
  storeLogo?: string;
}

/** Split the letterhead block into wordmark / address / phone / email groups. */
function parseLetterhead(content: string | undefined): { brandLines: string[]; addressLines: string[]; phone?: string; email?: string } {
  const lines = (content ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const [wordmark, ...rest] = lines.length > 0 ? lines : ["WOODEX"];
  const parts = rest.flatMap((l) => l.split("·").map((p) => p.trim()).filter(Boolean));
  const emailPart = parts.find((p) => p.includes("@"));
  const phonePart = parts.find((p) => /\+?\d[\d ()-]{6,}/.test(p));
  const addressLines = parts.filter((p) => p !== emailPart && p !== phonePart);
  return {
    brandLines: [wordmark, ...rest],
    addressLines: addressLines.length > 0 ? addressLines : (phonePart || emailPart ? [] : parts),
    phone: phonePart,
    email: emailPart,
  };
}

export default function QuoteA4Sheet({ quote, tDoc, vars, storeLogo }: Props) {
  const accent = tDoc.brandColor || "#347647";
  const hb = new Map(tDoc.header.map((b) => [b.id, b]));
  const fb = new Map(tDoc.footer.map((b) => [b.id, b]));
  const letterhead = hb.get("letterhead")?.visible ? parseLetterhead(hb.get("letterhead")?.content) : undefined;
  const advancePct = clampAdvancePct(tDoc.advancePct ?? 75);
  const balancePct = 100 - advancePct;
  const advance = Math.round((quote.total * advancePct) / 100);
  const balance = quote.total - advance;
  const policyTerms = tDoc.termsEn
    ? resolvePolicyTerms(tDoc.termsEn, { advance, balance, validUntil: vars.validUntil, advancePct })
    : "";
  const policyTermsUr = tDoc.termsUr
    ? resolvePolicyTerms(tDoc.termsUr, { advance, balance, validUntil: vars.validUntil, advancePct })
    : "";
  const footerVariant = tDoc.footerVariant ?? "zainab";
  const footerPreset = footerVariant === "zainab" ? FOOTER_PRESETS.zainab : footerVariant === "store" ? FOOTER_PRESETS.store : undefined;
  const customLines = (tDoc.footerCustomLines ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const footerContact = footerVariant === "custom"
    ? { contactLines: customLines.slice(0, 1), addressLines: customLines.slice(1), phone: undefined, email: undefined }
    : footerPreset
      ? { contactLines: [...footerPreset.contactLines], addressLines: [...footerPreset.addressLines], phone: footerPreset.phone, email: footerPreset.email }
      : { contactLines: letterhead?.brandLines, addressLines: letterhead?.addressLines, phone: letterhead?.phone, email: letterhead?.email };
  const acceptanceBlock = tDoc.acceptanceBlock ?? true;

  const specLine = (item: AdminQuote["items"][number]) =>
    [item.category, item.series, item.material, item.finish, dimSpec(item)].filter(Boolean).join(" · ");

  const itemRows = quote.items.map((item, i) => [
    <span key="n" className="tabular-nums" style={{ color: "#5b6660" }}>{String(i + 1).padStart(2, "0")}</span>,
    <span key="code" className="break-all font-mono text-[10px] font-semibold" style={{ color: "#37433c" }}>{itemCode(item.sku, item.id)}</span>,
    <span key="desc">
      <span className="font-semibold">{item.name}</span>
      {specLine(item) && <span className="mt-0.5 block text-[9px] font-normal" style={{ color: "#5b6660" }}>{specLine(item)}</span>}
    </span>,
    <span key="qty" className="tabular-nums">{item.quantity}</span>,
    <span key="rate" className="tabular-nums">{formatPKR(item.price)}</span>,
    <span key="amount" className="font-bold tabular-nums">{formatPKR(item.price * item.quantity)}</span>,
  ]);

  const terms = [
    ...(policyTerms ? [{ label: "Payment & policy terms", text: policyTerms.replace(/\n+/g, " · ").replace(/· _+·/g, "·").trim() }] : []),
    { label: "Payment schedule", text: fb.get("payment-note")?.visible ? renderGridBlock(tDoc, "payment-note", vars) ?? "" : "" },
    { label: "Delivery timeline", text: renderGridBlock(tDoc, "delivery", vars) ?? "" },
    { label: "Warranty terms", text: renderGridBlock(tDoc, "warranty", vars) ?? "" },
    { label: "Validity", text: renderGridBlock(tDoc, "validity", vars) ?? (hb.get("validity")?.visible ? renderBlock(tDoc, "validity", vars) : "") },
  ].filter((t) => t.text);

  const extraCustoms = tDoc.footer.filter((b) => b.type === "custom" && b.visible && !["delivery", "warranty", "validity", "thanks"].includes(b.id));

  return (
    <A4Page>
      {hb.get("letterhead")?.visible !== false && letterhead && (
        <A4Masthead
          accent={accent}
          logo={storeLogo ?? tDoc.logo}
          brandLines={letterhead.brandLines}
          docTitle={hb.get("doc-title")?.visible ? renderBlock(tDoc, "doc-title", vars) : "Quotation"}
          refRows={[
            ...(hb.get("doc-ref")?.visible ? [{ label: "Ref", value: renderBlock(tDoc, "doc-ref", vars).replace(/^Ref\s*/i, "") }] : []),
            { label: "Date", value: formatDate(quote.createdAt) },
            ...(hb.get("validity")?.visible ? [{ label: "Validity", value: renderBlock(tDoc, "validity", vars).replace(/^Valid until\s*/i, "") }] : []),
          ]}
        />
      )}

      <A4PartyGrid
        cells={[
          {
            label: "Prepared for",
            accent,
            title: quote.company || quote.customerName,
            lines: [quote.company ? quote.customerName : undefined, quote.address].filter((l): l is string => !!l),
          },
          {
            label: "Location",
            accent,
            title: quote.city ? `${quote.city}` : "Pakistan",
            lines: [quote.city ? "Delivery & site measurements" : undefined].filter((l): l is string => !!l),
          },
          {
            label: "Attention",
            accent,
            title: quote.customerName,
            lines: [quote.customerPhone, quote.customerEmail].filter(Boolean),
          },
        ]}
      />

      <A4ItemsTable
        accent={accent}
        columns={[
          { label: "#", width: "34px" },
          { label: "Item code", width: "86px" },
          { label: "Description & specs" },
          { label: "Qty", width: "38px", align: "center" },
          { label: "Rate", width: "92px", align: "right" },
          { label: "Amount", width: "102px", align: "right" },
        ]}
        rows={itemRows}
        emptyNote="Line items pending — WOODEX will confirm the final scope with you."
      />

      <A4Summary
        accent={accent}
        rows={[
          { label: "Subtotal", value: formatPKR(quote.subtotal) },
          ...(quote.discountAmount > 0 ? [{ label: `Discount (${quote.discountPct}%)`, value: `−${formatPKR(quote.discountAmount)}`, kind: "discount" as const }] : []),
          { label: "Delivery & logistics", value: quote.shipping === 0 ? "FREE" : formatPKR(quote.shipping) },
          { label: "Quotation total", value: formatPKR(quote.total), kind: "total" },
        ]}
        callout={{
          title: `Payment schedule — ${advancePct} / ${balancePct}`,
          rows: [
            { label: `Advance required (${advancePct}%)`, value: formatPKR(advance) },
            { label: `Balance due (${balancePct}%)`, value: formatPKR(balance) },
          ],
        }}
        note={`Advance computed at ${advancePct}% of total. Final amount settled against site measurements.`}
      />

      {policyTerms && (
        <section aria-label="Payment and policy terms" className="mt-3 rounded-md border border-[#e3e0d6] bg-[#fbfaf6] px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#5b6660]">Payment &amp; policy terms</p>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-[9.5px] leading-relaxed text-[#37433c]">{policyTerms}</pre>
          {policyTermsUr && <pre dir="rtl" lang="ur" className="mt-1.5 whitespace-pre-wrap font-sans text-[10px] leading-relaxed text-[#37433c]">{policyTermsUr}</pre>}
        </section>
      )}
      {extraCustoms.map((b) => (
        <p key={b.id} className="mt-2 text-[10px] leading-relaxed" style={{ color: "#37433c" }}>{b.content}</p>
      ))}
      {fb.get("terms")?.visible && (
        <p className="mt-2 text-[8.5px] leading-relaxed" style={{ color: "#8a938d" }}>{renderBlock(tDoc, "terms", vars)}</p>
      )}

      <A4Terms rows={terms} accent={accent} />

      <A4FooterBlock
        accent={accent}
        contactLines={footerContact.contactLines}
        addressLines={footerContact.addressLines}
        phone={footerContact.phone}
        email={footerContact.email}
        signature={acceptanceBlock ? { left: "CLIENT ACCEPTANCE — Signature & Date", right: "WOODEX — Authorized Signatory & Stamp" } : undefined}
        thanks={fb.get("thanks")?.visible ? fb.get("thanks")?.content : undefined}
        captionLeft="Authorized Quotation Document"
        captionRight={`Issued ${formatDateTime(quote.createdAt)}`}
      />
    </A4Page>
  );
}
