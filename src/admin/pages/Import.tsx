import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileSpreadsheet, Upload, Lock, RotateCcw, Download, ArrowRight, CheckCircle2, CircleAlert, Loader2, FileUp } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { LeadImportResult } from "@/api/types";
import { isDemoMode } from "@/config/env";
import { parseLeadSheet, type ParsedLeadSheet } from "@/lib/leadImport";
import { toCsv, downloadCsv } from "@/lib/csv";
import { SectionCard, EmptyState, leadStatusLabel } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_FILE_MB = 20;
const PREVIEW_ROWS = 12;
const ISSUE_ROWS = 20;

type Dataset = "leads" | "ledger";
type Phase = "choose" | "preview" | "done";

const STATUS_HELP = [
  ["New Lead", "new"], ["Client / existing customer", "contacted"], ["Proposal / Quotation (any spelling)", "quoted"],
  ["Meeting / schedule", "meeting"], ["Won", "won"], ["Not Respoding / not responding", "not_responding"],
  ["Blank status", "falls back to the Action column (Meeting→meeting · Visit→contacted · Done→contacted · Not Respoding→not_responding)"],
  ["Anything unrecognised", "new — original text is kept in the note"],
];

/**
 * Admin import desk (V4 PR-A). Lead 2026 spreadsheets → demo CRM.
 * Demo-authoritative by design: the file is parsed in the browser, the adapter
 * only persists rows it can validate, and nothing ever touches the hosted
 * backend (hosted import is an owner-gated programme). The Income/Expense GL
 * import ships together with the ledger module it feeds.
 */
export default function AdminImport() {
  const api = useMemo(() => getAdminApi(), []);
  const [dataset, setDataset] = useState<Dataset>("leads");
  const [phase, setPhase] = useState<Phase>("choose");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedLeadSheet | null>(null);
  const [dryRun, setDryRun] = useState<LeadImportResult | null>(null);
  const [committed, setCommitted] = useState<LeadImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    setPhase("choose"); setFileName(null); setParsed(null); setDryRun(null); setCommitted(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const parseFile = useCallback(async (file: File) => {
    if (dataset !== "leads") { toast.message("Income & Expense import ships with the ledger module — this file belongs there."); return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { toast.error(`File is larger than ${MAX_FILE_MB} MB — export a smaller range.`); return; }
    setParsing(true); setDryRun(null); setCommitted(null);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("No sheets found in this file.");
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      const result = parseLeadSheet(aoa as unknown[][]);
      setParsed(result); setFileName(file.name); setPhase("preview");
      if (result.headerRow === -1) toast.error("Header row not recognised — see the issues list below.");
      else toast.success(`Parsed ${result.totalDataRows} data row(s) — review before committing.`);
    } catch (err) {
      console.error("import parse failed:", err);
      toast.error(err instanceof Error ? err.message : "Could not read this file — is it a real .xlsx/.csv export?");
      setParsed(null); setPhase("choose");
    } finally {
      setParsing(false);
    }
  }, [dataset]);

  const runPreview = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const res = await api.importLeads({ rows: parsed.rows, dryRun: true });
      setDryRun(res);
      toast.success(`Dry run — ${res.created} would be created, ${res.duplicates.length} duplicate(s), ${res.rejected.length + parsed.issues.length} rejected.`);
    } catch (err) { console.error(err); toast.error("Dry run failed — please try again."); } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!parsed || !isDemoMode) return;
    setBusy(true);
    try {
      const res = await api.importLeads({ rows: parsed.rows, dryRun: false });
      setCommitted(res); setPhase("done");
      toast.success(`${res.created} lead(s) added to the CRM.`);
    } catch (err) { console.error(err); toast.error("Commit failed — please try again."); } finally { setBusy(false); }
  };

  const downloadIssues = () => {
    if (!parsed) return;
    const all = [...parsed.issues.map((i) => ({ ...i, kind: "parse" })), ...(dryRun?.rejected ?? []).map((i) => ({ ...i, kind: "rejected" })), ...(dryRun?.duplicates ?? []).map((i) => ({ ...i, kind: "duplicate" }))];
    downloadCsv("lead-import-issues.csv", toCsv(["Row", "Kind", "Issue", "Name", "Phone"], all.map((i) => [String(i.row), i.kind, i.reason, i.name ?? "", i.phone ?? ""])));
  };

  useEffect(() => { setDryRun(null); }, [parsed]);

  const previewIssues = useMemo(() => parsed?.issues ?? [], [parsed]);
  const issueTotal = previewIssues.length + (dryRun ? dryRun.rejected.length + dryRun.duplicates.length : 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent" aria-hidden><FileUp className="h-5 w-5" /></div>
        <div>
          <h1 className="text-lg font-bold leading-tight text-foreground">Import data</h1>
          <p className="text-xs text-muted-foreground">Lead 2026 spreadsheets → your CRM. Parsed locally in the browser; nothing is uploaded anywhere.</p>
        </div>
        <span className="ml-auto rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">Demo workspace{isDemoMode ? "" : " — commit disabled on this backend"}</span>
      </div>

      {!isDemoMode && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This backend is read-only for imports — hosted lead/GL import is an owner-gated programme. You can still parse and preview; nothing will be written.
        </div>
      )}

      {/* step 1 — dataset */}
      <SectionCard title="1 · Choose the dataset">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { setDataset("leads"); reset(); }} aria-pressed={dataset === "leads"}
            className={cn("rounded-xl border p-4 text-left transition-colors", dataset === "leads" ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-border hover:border-accent/50")}>
            <FileSpreadsheet className="h-6 w-6 text-accent" aria-hidden />
            <p className="mt-2 text-sm font-bold text-foreground">Lead 2026 (CRM)</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Sr · Date · Company · Name · Contact · Lead Source · Status · Assigned to · Quotation · Meeting — maps straight into the Leads pipeline.</p>
          </button>
          <div className="rounded-xl border border-dashed border-border p-4 opacity-80" aria-disabled="true">
            <Lock className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-bold text-foreground">Income &amp; Expenditure (GL)</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Ships together with the ledger module it feeds — the GL columns (Project · Pay By · Debit/Credit · Category · Sub Category) land in the next PR, not before.</p>
          </div>
        </div>
      </SectionCard>

      {/* step 2 — upload */}
      <SectionCard title="2 · Upload your export" action={<Upload className="h-4 w-4 text-muted-foreground" />}>
        <label htmlFor="import-file"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void parseFile(f); }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-8 text-center transition-colors hover:border-accent">
          {parsing ? <Loader2 className="h-8 w-8 animate-spin text-accent" aria-hidden /> : <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden />}
          <span className="text-sm font-semibold text-foreground">{fileName ?? "Choose your Lead 2026 export…"}</span>
          <span className="text-[11px] text-muted-foreground">.xlsx · .xls · .csv — up to {MAX_FILE_MB} MB, up to 5,000 rows. Header row is detected automatically (the roll-up row on top is fine).</span>
          <input id="import-file" ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void parseFile(f); }} />
        </label>
        <details className="mt-3 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer font-semibold text-foreground">How rows are mapped</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="font-semibold text-foreground">Status → pipeline</p>
              <ul className="mt-1 space-y-0.5">{STATUS_HELP.map(([from, to]) => <li key={from}><code className="text-[10px]">{from}</code> → <code className="text-[10px]">{to}</code></li>)}</ul>
            </div>
            <div>
              <p className="font-semibold text-foreground">Everything else</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Lead Source → Furniture / Interior / Project (others kept as web/referral when obvious, else empty)</li>
                <li>Phone dedupe: last 10 digits — same phone in the CRM twice is skipped, and flagged</li>
                <li>Dates read as dd/mm/yyyy (Excel date cells supported); unknown dates fall back to today</li>
                <li>Consent is NOT carried — imported rows show no consent badge, and are never treated as opted-in</li>
              </ul>
            </div>
          </div>
        </details>
      </SectionCard>

      {/* step 3 — preview & commit */}
      {phase !== "choose" && parsed && (
        <SectionCard title="3 · Preview & commit" action={
          <span className="flex items-center gap-2">
            {(issueTotal > 0) && <Button variant="outline" size="sm" onClick={downloadIssues}><Download className="mr-1 h-3.5 w-3.5" /> Issues ({issueTotal})</Button>}
            <Button variant="outline" size="sm" onClick={reset}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Start over</Button>
          </span>}>
          {parsed.headerRow === -1 ? (
            <EmptyState icon={CircleAlert} title="Header row not recognised" hint="Expected a row containing Company, Name, Contact (or similar). Check the sheet layout and export again." />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="rounded-full border border-border px-2.5 py-1">Rows found: {parsed.totalDataRows}{parsed.truncated ? " (capped at 5,000)" : ""}</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">Valid: {parsed.rows.length}</span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">Issues: {previewIssues.length}</span>
                {dryRun && <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800">Dry run: {dryRun.created} new · {dryRun.duplicates.length} duplicates · {dryRun.rejected.length} rejected</span>}
              </div>

              {/* first valid rows */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-secondary/60 text-left text-muted-foreground"><tr>{["Row","Date","Company","Name","Contact","Source","Status","Assigned"].map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {parsed.rows.slice(0, PREVIEW_ROWS).map((r) => (
                      <tr key={r.row} className="border-t border-border">
                        <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{r.row}</td>
                        <td className="px-2 py-1.5">{r.date ? new Date(r.date).toLocaleDateString("en-GB") : "—"}</td>
                        <td className="px-2 py-1.5">{r.company ?? "—"}</td>
                        <td className="px-2 py-1.5 font-semibold text-foreground">{r.name}</td>
                        <td className="px-2 py-1.5">{r.phone ?? "—"}</td>
                        <td className="px-2 py-1.5 capitalize">{r.leadSource ?? "—"}</td>
                        <td className="px-2 py-1.5">{leadStatusLabel(r.status)}</td>
                        <td className="px-2 py-1.5">{r.assignedTo ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > PREVIEW_ROWS && <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">+ {parsed.rows.length - PREVIEW_ROWS} more valid row(s) — all of them are committed.</p>}
              </div>

              {/* issues */}
              {previewIssues.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900"><CircleAlert className="h-4 w-4" aria-hidden /> Skipped at parse ({previewIssues.length})</p>
                  <ul className="mt-1.5 space-y-0.5 text-[11px] text-amber-900">
                    {previewIssues.slice(0, ISSUE_ROWS).map((i, idx) => <li key={idx}>Row {i.row}: {i.reason}{i.phone ? ` (${i.phone})` : ""}</li>)}
                    {previewIssues.length > ISSUE_ROWS && <li>… and {previewIssues.length - ISSUE_ROWS} more — download the issues CSV.</li>}
                  </ul>
                </div>
              )}

              {phase === "done" && committed ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" aria-hidden />
                  <p className="mt-1.5 text-sm font-bold text-emerald-900">{committed.created} lead(s) added{committed.duplicates.length > 0 ? ` · ${committed.duplicates.length} duplicate(s) skipped` : ""}{committed.rejected.length > 0 ? ` · ${committed.rejected.length} rejected` : ""}.</p>
                  <p className="mt-0.5 text-[11px] text-emerald-800">Find them in Leads — filter by assignee or source, and open the merge queue if the CRM flagged lookalikes.</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-hon-green-dark"><Link to="/admin/leads">Open Leads <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
                    <Button variant="outline" size="sm" onClick={reset}>Import another file</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">Always review the dry run before committing — duplicates are phone-matched and skipped.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={runPreview} disabled={busy || parsed.rows.length === 0}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Dry run</Button>
                    <Button onClick={commit} disabled={busy || !isDemoMode || parsed.rows.length === 0} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">Commit {parsed.rows.length} lead{parsed.rows.length === 1 ? "" : "s"} <ArrowRight className="ml-1 h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
