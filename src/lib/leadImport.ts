/**
 * WOODEX — Lead 2026 import parser (V4 PR-A).
 *
 * Pure client-side mapping from the owner's real spreadsheet layout
 * (`Sr · Date · Company · Name · Contact · Designation · Location · Lead Source ·
 *  Status · Assassin to · Quotation · Last Contact · Action · Meeting Schedule · Note`)
 * into the CRM's `LeadImportRow` contract. The file never leaves the browser —
 * XLSX parsing happens in a lazy chunk and the adapter only ever sees rows.
 *
 * Status/source vocabulary is mapped case-insensitively; unknown non-empty
 * statuses degrade to "new" with the original value preserved in `note`.
 */
import type { LeadImportIssue, LeadImportRow, LeadSource, LeadStatus } from "@/api/types";

export interface ParsedLeadSheet {
  rows: LeadImportRow[];
  /** rows skipped before the adapter (e.g. missing name) */
  issues: LeadImportIssue[];
  /** 0-based index of the header row that was detected */
  headerRow: number;
  /** detected column mapping (field → source header) for transparency */
  columnMap: Partial<Record<string, string>>;
  /** total non-empty data rows seen */
  totalDataRows: number;
  /** true when the file exceeded the row cap and was truncated */
  truncated: boolean;
}

const ROW_CAP = 5000;

const norm = (v: unknown): string =>
  v === undefined || v === null ? "" : String(v).trim();

const ALIASES: Record<Exclude<keyof LeadImportRow, "row">, string[]> = {
  date: ["date"],
  company: ["company"],
  name: ["name"],
  phone: ["contact", "phone", "mobile", "contact no", "contact number"],
  email: ["email", "e-mail"],
  designation: ["designation", "position", "title"],
  location: ["location", "city"],
  leadSource: ["lead source", "source"],
  status: ["status"],
  assignedTo: ["assassin to", "assigned to", "assign to", "assignee", "sales rep", "owner"],
  quotationRef: ["quotation", "quotation no", "quote", "quotation number"],
  lastContact: ["last contact", "lastcontacted", "last contact date"],
  nextAction: ["action", "next action", "actions", "follow up", "follow-up"],
  meetingAt: ["meeting schedule", "meeting", "meeting date", "next meeting"],
  note: ["note", "notes", "remark", "remarks", "comment"],
};

const normHeader = (v: unknown): string => norm(v).toLowerCase().replace(/[._/]+/g, " ").replace(/\s+/g, " ").trim();

/** Find the most plausible header row: the first row scoring ≥3 alias hits. */
export function findHeaderRow(aoa: unknown[][]): number {
  const allAliases = new Map<string, Exclude<keyof LeadImportRow, "row">>();
  for (const [field, aliases] of Object.entries(ALIASES) as Array<[Exclude<keyof LeadImportRow, "row">, string[]]>) {
    for (const a of aliases) allAliases.set(a, field);
  }
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const cells = (aoa[i] ?? []).map(normHeader);
    const hits = cells.filter((c) => allAliases.has(c)).length;
    // also count the Sr/# marker common in the real sheet
    if (hits >= 3) return i;
  }
  return -1;
}

export function detectColumns(header: unknown[]): Partial<Record<Exclude<keyof LeadImportRow, "row">, number>> {
  const cells = (header ?? []).map(normHeader);
  const map: Partial<Record<Exclude<keyof LeadImportRow, "row">, number>> = {};
  for (const [field, aliases] of Object.entries(ALIASES) as Array<[Exclude<keyof LeadImportRow, "row">, string[]]>) {
    const idx = cells.findIndex((c) => aliases.includes(c));
    if (idx !== -1) map[field] = idx;
  }
  return map;
}

/* ── value mapping ─────────────────────────────────────────────────────── */

export function parseLeadDate(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const s = norm(v);
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  // dd/mm/yyyy (Pakistan locale)
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const fallback = Date.parse(s);
  return Number.isNaN(fallback) ? undefined : new Date(fallback).toISOString();
}

export function mapLeadStatus(rawStatus: unknown, rawAction: unknown): LeadStatus {
  const s = norm(rawStatus).toLowerCase();
  const a = norm(rawAction).toLowerCase();
  const fromText = (text: string): LeadStatus | null => {
    if (/not.?res/.test(text)) return "not_responding";
    if (/meeting|schedule/.test(text)) return "meeting";
    if (/proposal|perposal|quotation|quoted|quote sent/.test(text)) return "quoted";
    if (/^won$|close.?won/.test(text)) return "won";
    if (/lost|close.?lost|closed/.test(text)) return "lost";
    if (/^client|existing|bought|repeat/.test(text)) return "contacted";
    if (/visit/.test(text)) return "contacted";
    if (/not.?answer|unreachable|no.?pick/.test(text)) return "not_responding";
    if (/done|sent/.test(text)) return "contacted";
    if (/^new( lead)?$/.test(text)) return "new";
    if (/won/.test(text)) return "won";
    return null;
  };
  return (s && fromText(s)) || (a && fromText(a)) || "new";
}

export function mapLeadSource(raw: unknown): LeadSource | undefined {
  const s = norm(raw).toLowerCase();
  if (!s) return undefined;
  if (s.includes("furnitur")) return "furniture";
  if (s.includes("interior")) return "interior";
  if (s.includes("project")) return "project";
  if (s.includes("web") || s.includes("site") || s.includes("online")) return "website";
  if (s.includes("referr")) return "referral";
  if (s.includes("chat")) return "storefront_chat";
  return undefined;
}

const isBlankRow = (cells: unknown[]): boolean => cells.every((c) => norm(c) === "");

export function parseLeadSheet(aoaRaw: unknown[][]): ParsedLeadSheet {
  const aoa = aoaRaw.filter((r) => Array.isArray(r));
  const headerRow = findHeaderRow(aoa);
  if (headerRow === -1) {
    return { rows: [], issues: [{ row: 1, reason: "Could not find the header row (expected columns like Company, Name, Contact…)" }], headerRow: -1, columnMap: {}, totalDataRows: 0, truncated: false };
  }
  const colIdx = detectColumns(aoa[headerRow]);
  const columnMap: ParsedLeadSheet["columnMap"] = {};
  for (const [field, idx] of Object.entries(colIdx)) {
    columnMap[field] = norm(aoa[headerRow][idx!]);
  }
  const get = (cells: unknown[], field: Exclude<keyof LeadImportRow, "row">): unknown => {
    const idx = colIdx[field];
    return idx === undefined ? undefined : cells[idx];
  };

  const rows: LeadImportRow[] = [];
  const issues: LeadImportIssue[] = [];
  let totalDataRows = 0;
  let truncated = false;

  for (let i = headerRow + 1; i < aoa.length; i++) {
    if (totalDataRows >= ROW_CAP) { truncated = true; break; }
    const cells = aoa[i] ?? [];
    if (isBlankRow(cells)) continue;
    totalDataRows += 1;
    const line = i + 1; // 1-based for humans
    const name = norm(get(cells, "name"));
    if (name.length < 2) {
      issues.push({ row: line, reason: "Missing name — row skipped", phone: norm(get(cells, "phone")) || undefined });
      continue;
    }
    const rawStatus = get(cells, "status");
    const action = get(cells, "nextAction");
    const statusNote = (() => {
      const s = norm(rawStatus);
      return s && !/new|client|proposal|perposal|quotation|quoted|meeting|schedule|won|lost|not.?res/i.test(s) ? `status was "${s}"` : undefined;
    })();
    const note = [norm(get(cells, "note")), statusNote].filter(Boolean).join(" · ") || undefined;
    const composed: LeadImportRow = {
      row: line,
      date: parseLeadDate(get(cells, "date")),
      company: norm(get(cells, "company")) || undefined,
      name,
      phone: norm(get(cells, "phone")) || undefined,
      email: norm(get(cells, "email")) || undefined,
      designation: norm(get(cells, "designation")) || undefined,
      location: norm(get(cells, "location")) || undefined,
      leadSource: mapLeadSource(get(cells, "leadSource")),
      status: mapLeadStatus(rawStatus, action),
      assignedTo: norm(get(cells, "assignedTo")) || undefined,
      quotationRef: norm(get(cells, "quotationRef")) || undefined,
      lastContact: parseLeadDate(get(cells, "lastContact")),
      nextAction: norm(get(cells, "nextAction")) || undefined,
      meetingAt: parseLeadDate(get(cells, "meetingAt")),
      note,
    };
    rows.push(composed);
  }
  return { rows, issues, headerRow, columnMap, totalDataRows, truncated };
}
