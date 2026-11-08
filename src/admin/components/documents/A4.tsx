/**
 * Shared A4 print-document engine — one visual language for every printable
 * admin artefact (quotation, invoice, order, purchase order, return, exchange).
 * Redesigned 2026-11 to match the owner's attached "Woodex A4" target:
 * brand green (#347647), Inter-like sans, letterhead masthead, green items
 * table header, right-aligned summary column, terms grid, icon footer.
 *
 * Print contract: `@page size A4`, zero page margin (the sheet paints its own
 * padding), exact color adjustment, and `.a4-chrome` (back link + print
 * button) hidden only on print. No trackers, no external assets.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Printer, MapPin, Phone, Mail } from "lucide-react";

const A4_BRAND = "#347647";
const A4_BRAND_DARK = "#2b5c38";
const A4_PALE = "#F1F6F1";
const A4_INK = "#1c2b23";
const A4_MUTED = "#5b6660";
const A4_LINE = "#e2e5e0";
const A4_SOFT_LINE = "#eef0ec";
const A4_STRIPE = "#FAFBF9";


const PRINT_CSS = `
.a4doc { background: #e9e8e3; min-height: 100vh; padding: 24px 16px 48px; }
@media (min-width: 640px) { .a4doc { padding: 32px 24px 64px; } }
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #ffffff !important; }
  .a4doc { background: #ffffff !important; padding: 0 !important; min-height: 0 !important; }
  .a4-chrome { display: none !important; }
  .a4-page {
    width: auto !important; min-height: 297mm !important; box-shadow: none !important;
    border-radius: 0 !important; border: none !important; margin: 0 !important; padding: 12mm 13mm 10mm !important;
  }
  /* Pagination guards: repeat the items-table header on page 2, never split a row,
     and keep the signature/footer block whole. */
  .a4-page thead { display: table-header-group; }
  .a4-page tr { break-inside: avoid; page-break-inside: avoid; }
  .a4-page footer { break-inside: avoid; page-break-inside: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/** Screen-only toolbar: back link + print/save button. Hidden in print via .a4-chrome. */
export function A4Chrome({ backTo, backLabel }: { backTo: string; backLabel: string }) {
  return (
    <div className="a4-chrome mx-auto mb-4 flex w-full max-w-[794px] items-center justify-between gap-3">
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md bg-hon-green px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-hon-green-dark"
      >
        <Printer className="h-4 w-4" /> Print / Save PDF
      </button>
    </div>
  );
}

/** Outer wrapper for a standalone print document route. */
export function A4Shell({ children }: { children: ReactNode }) {
  return (
    <div className="a4doc">
      <style>{PRINT_CSS}</style>
      {children}
    </div>
  );
}

/** The A4 sheet itself (794×1123 logical). */
export function A4Page({ children }: { children: ReactNode }) {
  return (
    <main className="a4-page mx-auto flex w-full max-w-[794px] flex-col rounded-[6px] border border-[#e3e0d6] bg-white p-[34px_40px_22px] shadow-[0_18px_50px_rgba(15,23,18,0.18)]" style={{ minHeight: "1123px", color: A4_INK }}>
      {children}
    </main>
  );
}

/** Loading / empty states rendered inside A4Shell without a sheet. */
export function A4Notice({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mx-auto w-full max-w-[794px] rounded-lg border border-muted bg-white p-10 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface A4RefRow { label: string; value: string }

/**
 * Letterhead masthead: brand accent bar, brand identity (optional logo +
 * wordmark + contact lines) on the left, document identity on the right.
 */
export function A4Masthead({
  accent = A4_BRAND,
  logo,
  brandLines,
  docTitle,
  refRows,
}: {
  accent?: string;
  logo?: string;
  /** First line renders as the bold wordmark; the rest are contact lines. */
  brandLines: string[];
  docTitle: string;
  refRows: A4RefRow[];
}) {
  const [wordmark, ...contact] = brandLines.filter((l) => l.trim().length > 0);
  return (
    <>
      <div aria-hidden className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${accent} 0%, ${accent} 62%, ${accent}33 100%)` }} />
      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-5 pt-4" style={{ borderColor: A4_LINE }}>
        <div className="flex items-start gap-4">
          {logo && (
            <img src={logo} alt={wordmark ?? "Company logo"} className="h-14 w-14 shrink-0 rounded-md border object-contain p-1" style={{ borderColor: A4_LINE }} />
          )}
          <div>
            <p className="text-[26px] font-extrabold leading-none tracking-[0.06em]" style={{ color: accent }}>{wordmark ?? "WOODEX"}</p>
            {contact.length > 0 && (
              <div className="mt-2 text-[10px] leading-[1.55]" style={{ color: A4_MUTED }}>
                {contact.map((line, i) => <p key={i}>{line}</p>)}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[25px] font-black uppercase leading-none tracking-[0.16em]" style={{ color: A4_INK }}>{docTitle}</p>
          <dl className="mt-3 space-y-1.5">
            {refRows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-end gap-3">
                <dt className="text-[8.5px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>{row.label}</dt>
                <dd className="text-[11px] font-semibold" style={{ color: A4_INK }}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>
    </>
  );
}

export interface A4PartyCell { label: string; title: string; detail?: string; lines?: string[]; accent?: string }

/** PREPARED FOR / LOCATION / ATTENTION-style three-cell party grid. */
export function A4PartyGrid({ cells }: { cells: A4PartyCell[] }) {
  return (
    <section className="grid gap-6 border-b py-4 sm:grid-cols-3" style={{ borderColor: A4_SOFT_LINE }}>
      {cells.map((cell) => (
        <div key={cell.label}>
          <p className="text-[8.5px] font-bold uppercase tracking-[0.22em]" style={{ color: cell.accent ?? A4_BRAND }}>{cell.label}</p>
          <p className="mt-1.5 text-[13px] font-bold leading-snug" style={{ color: A4_INK }}>{cell.title}</p>
          {cell.detail && <p className="mt-0.5 text-[10px] font-medium" style={{ color: A4_MUTED }}>{cell.detail}</p>}
          {cell.lines?.filter(Boolean).map((line, i) => (
            <p key={i} className="mt-0.5 text-[10px] leading-relaxed" style={{ color: A4_MUTED }}>{line}</p>
          ))}
        </div>
      ))}
    </section>
  );
}

export interface A4Column { label: string; width?: string; align?: "left" | "right" | "center" }

/** Green-header items table with subtle zebra striping. */
export function A4ItemsTable({ accent = A4_BRAND, columns, rows, emptyNote }: {
  accent?: string;
  columns: A4Column[];
  rows: ReactNode[][];
  emptyNote?: string;
}) {
  const align = (a?: A4Column["align"]) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  return (
    <div className="mt-4 overflow-hidden rounded-[4px] border" style={{ borderColor: A4_LINE }}>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr style={{ background: accent }}>
            {columns.map((col, i) => (
              <th key={i} scope="col" style={{ width: col.width }} className={`px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.16em] text-white ${align(col.align)}`}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-[11px]" style={{ color: A4_MUTED }}>{emptyNote ?? "No lines on this document yet."}</td></tr>
          ) : rows.map((cells, r) => (
            <tr key={r} style={{ background: r % 2 === 1 ? A4_STRIPE : "#ffffff" }}>
              {cells.map((cell, c) => (
                <td key={c} className={`border-t px-3 py-2.5 align-top ${align(columns[c]?.align)}`} style={{ borderColor: A4_SOFT_LINE, color: A4_INK }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface A4SummaryRow { label: string; value: string; kind?: "default" | "discount" | "total" }
export interface A4CalloutRow { label: string; value: string }

/** Right-aligned totals column; optional green callout (advance/balance) block below it. */
export function A4Summary({ accent = A4_BRAND, rows, callout, note }: {
  accent?: string;
  rows: A4SummaryRow[];
  callout?: { title?: string; rows: A4CalloutRow[] };
  note?: string;
}) {
  return (
    <div className="mt-4 flex justify-end">
      <div className="w-full max-w-[330px]">
        <div className="space-y-1">
          {rows.map((row) => {
            if (row.kind === "total") {
              return (
                <div key={row.label} className="flex items-baseline justify-between border-t-2 pt-2" style={{ borderColor: accent }}>
                  <span className="text-[12px] font-extrabold uppercase tracking-[0.08em]" style={{ color: A4_INK }}>{row.label}</span>
                  <span className="text-[15px] font-black" style={{ color: A4_INK }}>{row.value}</span>
                </div>
              );
            }
            return (
              <div key={row.label} className="flex items-baseline justify-between text-[11px]" style={{ color: row.kind === "discount" ? "#1e5e2e" : A4_MUTED }}>
                <span>{row.label}</span>
                <span className="font-semibold tabular-nums" style={{ color: row.kind === "discount" ? "#1e5e2e" : A4_INK }}>{row.value}</span>
              </div>
            );
          })}
        </div>
        {callout && (
          <div className="mt-2 rounded-[4px] border p-3" style={{ background: A4_PALE, borderColor: "#dfe9df" }}>
            {callout.title && <p className="text-[8px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>{callout.title}</p>}
            {callout.rows.map((row) => (
              <div key={row.label} className="mt-1.5 flex items-baseline justify-between">
                <span className="text-[10px] font-semibold" style={{ color: A4_INK }}>{row.label}</span>
                <span className="text-[12px] font-black tabular-nums" style={{ color: A4_BRAND_DARK }}>{row.value}</span>
              </div>
            ))}
          </div>
        )}
        {note && <p className="mt-1.5 text-right text-[8.5px] italic" style={{ color: A4_MUTED }}>{note}</p>}
      </div>
    </div>
  );
}

export interface A4TermRow { label: string; text: string }

/** Two-column terms grid (payment / delivery / warranty / validity…). */
export function A4Terms({ rows, accent = A4_BRAND }: { rows: A4TermRow[]; accent?: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-5 grid gap-x-8 gap-y-3 border-t pt-4 sm:grid-cols-2" style={{ borderColor: A4_SOFT_LINE }}>
      {rows.map((row) => (
        <div key={row.label}>
          <p className="text-[8px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>{row.label}</p>
          <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: "#37433c" }}>{row.text}</p>
        </div>
      ))}
    </section>
  );
}

export interface A4Signature { left: string; right: string }

/**
 * Brand footer: green divider, three icon contact groups (address / phone /
 * email — sourced from the template's letterhead block so the whole sheet
 * shares one source of truth), optional signature strip, thank-you line, and
 * the closing captions.
 */
export function A4FooterBlock({
  accent = A4_BRAND,
  contactLines,
  phone,
  email,
  addressLines,
  signature,
  thanks,
  captionLeft,
  captionRight,
}: {
  accent?: string;
  /** Letters from the letterhead block — [name, ...lines]. */
  contactLines?: string[];
  phone?: string;
  email?: string;
  addressLines?: string[];
  signature?: A4Signature;
  thanks?: string;
  captionLeft?: string;
  captionRight?: string;
}) {
  const groups = [
    { icon: MapPin, label: "Visit", lines: addressLines ?? [] },
    { icon: Phone, label: "Call", lines: phone ? [phone] : [] },
    { icon: Mail, label: "Email", lines: email ? [email] : [] },
  ].filter((g) => g.lines.length > 0);
  const derived = (contactLines ?? []).slice(1);
  const hasGroups = groups.some((g) => g.lines.length > 0);

  return (
    <footer className="mt-auto pt-6">
      <div aria-hidden className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, ${accent} 0%, ${accent}55 55%, transparent 100%)` }} />
      {signature && (
        <div className="grid grid-cols-2 gap-10 pt-6">
          {[signature.left, signature.right].map((label) => (
            <div key={label} className="border-t pt-1.5 text-center text-[8.5px] font-semibold uppercase tracking-[0.18em]" style={{ borderColor: A4_LINE, color: A4_MUTED }}>{label}</div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-6 py-4">
        {hasGroups ? groups.map((group, i) => {
          const Icon = group.icon;
          return (
            <div key={i} className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} strokeWidth={1.8} />
              <div>
                <p className="text-[8px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>{group.label}</p>
                {group.lines.map((line, j) => <p key={j} className="text-[9.5px] leading-snug" style={{ color: A4_MUTED }}>{line}</p>)}
              </div>
            </div>
          );
        }) : derived.map((line, i) => (
          <p key={i} className="text-[9.5px] leading-snug" style={{ color: A4_MUTED }}>{line}</p>
        ))}
      </div>
      {thanks && (
        <p className="pb-2 text-center text-[17px]" style={{ color: accent, fontFamily: "'Segoe Script','Brush Script MT','Snell Roundhand',cursive" }}>{thanks}</p>
      )}
      <div className="flex items-center justify-between gap-4 border-t pt-2.5" style={{ borderColor: A4_SOFT_LINE }}>
        <p className="text-[8px] font-semibold uppercase tracking-[0.22em]" style={{ color: A4_MUTED }}>{captionLeft ?? ""}</p>
        <p className="text-[8px] font-semibold uppercase tracking-[0.22em]" style={{ color: accent }}>{captionRight ?? ""}</p>
      </div>
    </footer>
  );
}
