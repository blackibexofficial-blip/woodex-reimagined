/**
 * WOODEX letterhead constants for print documents that have no template
 * (invoice / order / purchase order / return / exchange). Mirrors the
 * contact block carried by the "Woodex A4" quotation template so every
 * artefact in the family shares one source of truth.
 */
export const WOODEX_LETTERHEAD = {
  lines: ["Woodex Furniture", "LG 89, Zainab Tower, Model Town, Lahore", "+92 322 4000768 · info@woodex.com.pk"],
  addressLines: ["LG 89, Zainab Tower, Model Town, Lahore"],
  phone: "+92 322 4000768",
  email: "info@woodex.com.pk",
  domain: "woodexfurniture.pk",
} as const;

export const woodexThankYou = "Thank you for choosing Woodex Furniture";

/** Best display reference for a line's code cell: sku, else the (non-free-form) product id. */
export const itemCode = (sku: string | undefined, id: string | undefined): string =>
  sku ?? (id && !/^(free-|line-)/.test(id) ? id : "—");
