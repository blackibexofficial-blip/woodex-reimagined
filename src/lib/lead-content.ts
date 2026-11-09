/** Frontend limits mirror lead-capture v2. Limits count JavaScript UTF-16 code units. */
export const LEAD_INTEREST_LIMIT = 4000;
export const CONTACT_SUBJECT_LIMIT = 120;
export const CONTACT_MESSAGE_LIMIT = 3000;
export const CHAT_MESSAGE_LIMIT = 2000;
export const PROJECT_TYPE_LIMIT = 500;
export const COMPANY_LIMIT = 160;

/** Plain-text snapshot only: no structured pricing, IDs, or quote acceptance. */
export function quoteLeadSummary(projectType: string, items: Array<{ name: string; quantity: number; variantLabel?: string; color?: string }>, estimate: string): string {
  const project = projectType.trim();
  if (!items.length) return project;
  const lines = items.map((item) => {
    const variant = item.variantLabel || item.color;
    return `- ${item.name}${variant ? ` (${variant})` : ""} x${item.quantity}`;
  });
  return `${project}\nRequested products (unpriced):\n${lines.join("\n")}\nDisplayed estimate: ${estimate} (not confirmed)`;
}
