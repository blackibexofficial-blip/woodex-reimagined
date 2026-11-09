/** WOODEX — minimal CSV helpers (headers + rows → downloadable file). */

const escapeCell = (value: string | number | undefined | null): string => {
  let s = value === undefined || value === null ? "" : String(value);
  // Quoting CSV does not stop spreadsheet formulas. Keep actual numbers numeric,
  // but prefix risky text (including leading whitespace/control characters) with
  // an apostrophe. Spreadsheet behavior varies; review exports before opening.
  // eslint-disable-next-line no-control-regex -- spreadsheet imports may ignore leading controls.
  if (typeof value === "string" && (/^[\t\r\n]/.test(s) || /^[\s\u0000-\u001f\u007f\ufeff\u200b-\u200d\u2060]*[=+\-@]/u.test(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers: string[], rows: Array<Array<string | number | undefined | null>>): string {
  return [headers, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
