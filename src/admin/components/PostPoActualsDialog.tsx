/**
 * "Post PO → job actuals" — one click, no re-typing.
 *
 * From a COMMITTED purchase order (sent / partial / received), bulk-create
 * `po`-source lines in the job-costing ledger (migration 0013, relational —
 * never the payload BOQ). The human picks the job and (per line) the cost
 * code — the only real judgment calls. Amounts copy at PO prices with a
 * per-line override. poRef carries the PO id, so the ledger ↔ PO link is
 * explicit and re-posting is guarded.
 *
 * Honesty rails:
 *  · default basis is RECEIVED qty (an actual, not a promise) — ordered qty
 *    is an explicit opt-in toggle;
 *  · lines with zero basis-qty are excluded automatically and shown muted;
 *  · if the ledger already holds lines for this PO (poRef match), every
 *    checkbox starts UNCHECKED and a warning banner explains why — duplicate
 *    cost lines are never posted by default;
 *  · partial failure is reported as such — never "all posted" when some
 *    lines failed;
 *  · draft / cancelled POs get no entry point at all.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, ClipboardList, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getAdminApi } from "@/api";
import type { AdminProject, AdminPurchaseOrder, ProjectActualLine, ProjectCostCode } from "@/api/types";
import { formatPKR } from "@/admin/components";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Basis = "received" | "ordered";

interface LineState {
  checked: boolean;
  code: string;
  rate: string;
}

export default function PostPoActualsDialog({ po, onClose, onPosted }: {
  po: AdminPurchaseOrder;
  onClose: () => void;
  onPosted?: (posted: number) => void;
}) {
  const api = useMemo(() => getAdminApi(), []);
  const [projects, setProjects] = useState<AdminProject[] | null>(null);
  const [projectId, setProjectId] = useState("");
  const [codes, setCodes] = useState<ProjectCostCode[] | null>(null);
  const [postedBefore, setPostedBefore] = useState(0);
  const [basis, setBasis] = useState<Basis>("received");
  const [incurredOn, setIncurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(po.lines.map((l) => [l.id, { checked: l.quantity > 0, code: "", rate: String(l.costPrice) }])));
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [posting, setPosting] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  // projects for the picker
  useEffect(() => {
    let alive = true;
    api.listProjects()
      .then((list) => { if (alive) setProjects(list); })
      .catch(() => { if (alive) { setProjects([]); toast.error("Could not load the projects list."); } });
    return () => { alive = false; };
  }, [api]);

  // cost codes + already-posted guard, re-run per project
  useEffect(() => {
    if (!projectId) { setCodes(null); setPostedBefore(0); return; }
    let alive = true;
    setLoadingRefs(true);
    Promise.all([api.listProjectCostCodes(projectId), api.listProjectActuals(projectId)])
      .then(([ccs, als]) => {
        if (!alive) return;
        setCodes(ccs);
        const dup = als.filter((a: ProjectActualLine) => a.poRef === po.id).length;
        setPostedBefore(dup);
        // duplicates default to UNCHECKED — enforced once per project pick
        if (dup > 0) {
          setLines((s) => {
            const next = { ...s };
            for (const k of Object.keys(next)) next[k] = { ...next[k], checked: false };
            return next;
          });
        }
      })
      .catch(() => { if (alive) { setCodes([]); toast.error("Could not load the job's cost codes."); } })
      .finally(() => { if (alive) setLoadingRefs(false); });
    return () => { alive = false; };
  }, [api, projectId, po.id]);

  const basisQty = (lineId: string) => {
    const l = po.lines.find((x) => x.id === lineId);
    return l ? (basis === "received" ? l.receivedQuantity : l.quantity) : 0;
  };
  const lineRate = (lineId: string) => {
    const n = Number(lines[lineId]?.rate);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const lineAmount = (lineId: string) => basisQty(lineId) * lineRate(lineId);

  const selected = po.lines.filter((l) => lines[l.id]?.checked && basisQty(l.id) > 0);
  const total = selected.reduce((s, l) => s + lineAmount(l.id), 0);
  const missingCode = selected.some((l) => !lines[l.id]?.code);
  const project = projects?.find((p) => p.id === projectId);
  const receivedTotal = po.lines.reduce((s, l) => s + l.receivedQuantity, 0);

  const setAllCodes = (code: string) =>
    setLines((s) => {
      const next = { ...s };
      for (const l of po.lines) next[l.id] = { ...next[l.id], code };
      return next;
    });

  const post = async () => {
    if (!projectId) return;
    setPosting(true);
    setFailures([]);
    const jobs = selected.map((l) => ({
      line: l,
      run: () => api.addProjectActual({
        projectId,
        costCode: lines[l.id].code,
        description: l.sku ? `${l.name} (${l.sku})` : l.name,
        qty: basisQty(l.id),
        unit: "units",
        rate: lineRate(l.id),
        source: "po",
        poRef: po.id,
        incurredOn,
      }),
    }));
    const results = await Promise.allSettled(jobs.map((j) => j.run()));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        failed.push(`${jobs[i].line.name} — ${r.reason instanceof Error ? r.reason.message : "failed"}`);
      }
    });
    setPosting(false);
    if (failed.length === 0) {
      toast.success(`${ok} line${ok === 1 ? "" : "s"} posted from ${po.id} to “${project?.title ?? "the job"}” — ${formatPKR(total)} at PO prices.`);
      onPosted?.(ok);
      onClose();
    } else {
      // keep the dialog open — the failures must not read as success
      setFailures(failed);
      if (ok > 0) toast.error(`${ok} posted, ${failed.length} failed — fix the failures and re-post only those lines.`);
      else toast.error("Nothing posted — see the errors below.");
      onPosted?.(ok);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-hon-green-dark" /> Post {po.id} to job actuals</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-xs leading-snug text-muted-foreground">
            Supplier <span className="font-semibold text-foreground">{po.supplierName}</span> · {po.lines.length} line(s) · {formatPKR(po.subtotal)} committed.
            Copies the chosen lines into the job-costing ledger at PO prices — nothing re-types itself. You pick the job and the cost code per line; amounts stay editable until you post.
          </p>

          {/* project picker */}
          <div>
            <Label htmlFor="pp-project" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Job / project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="pp-project" aria-label="Job / project"><SelectValue placeholder={projects ? "Select the job this PO pays for…" : "Loading projects…"} /></SelectTrigger>
              <SelectContent>
                {(projects ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.title} <span className="text-muted-foreground">· {p.client}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {projectId && loadingRefs && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the job's cost codes…</p>}
          {projectId && !loadingRefs && codes && codes.length === 0 && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
              “{project?.title}” has no cost codes yet — add them in <span className="font-bold">Projects → Practice workspace → Actuals tab</span> first, then post here.
            </p>
          )}
          {projectId && !loadingRefs && postedBefore > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> The ledger already holds {postedBefore} line{postedBefore === 1 ? "" : "s"} with poRef “{po.id}”. All checkboxes start unchecked — re-check only lines that are genuinely missing, or delete the duplicates in the job's Actuals tab first.
            </p>
          )}

          {/* basis toggle */}
          <div>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Post at which quantity?</span>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Quantity basis">
              {([
                { key: "received" as Basis, name: "Received qty", hint: `What has actually arrived (${receivedTotal} units) — the honest job-cost basis` },
                { key: "ordered" as Basis, name: "Ordered qty", hint: "Commit the full PO now — use when receipts follow later" },
              ]).map((opt) => {
                const active = basis === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setBasis(opt.key)}
                    className={`rounded-md border px-3 py-2 text-left transition ${active ? "border-hon-green bg-hon-green-pale/40 ring-1 ring-hon-green" : "border-border hover:border-hon-green/60"}`}
                  >
                    <span className="block text-xs font-bold text-foreground">{opt.name}</span>
                    <span className="mt-0.5 block text-[9px] leading-snug text-muted-foreground">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
            {basis === "received" && receivedTotal === 0 && (
              <p className="mt-1.5 text-[10px] font-medium text-amber-800">Nothing has been received against this PO yet — receive first, or switch to Ordered qty.</p>
            )}
          </div>

          {/* per-line table */}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] border-collapse text-[11px]">
              <thead className="bg-secondary">
                <tr>
                  <th className="px-2 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Post</th>
                  <th className="px-2 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground">PO line</th>
                  <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{basis === "received" ? "Rcvd" : "Qty"}</th>
                  <th className="px-2 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Cost code</th>
                  <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Rate</th>
                  <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {po.lines.map((l) => {
                  const qty = basisQty(l.id);
                  const st = lines[l.id];
                  const muted = qty <= 0;
                  return (
                    <tr key={l.id} className={muted ? "opacity-50" : undefined}>
                      <td className="px-2 py-2 align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-hon-green"
                          aria-label={`Post ${l.name}`}
                          checked={!muted && !!st?.checked}
                          disabled={muted}
                          onChange={(e) => setLines((s) => ({ ...s, [l.id]: { ...s[l.id], checked: e.target.checked } }))}
                        />
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <span className="block font-semibold text-foreground">{l.name}</span>
                        {l.sku && <span className="text-[9px] text-muted-foreground">{l.sku}</span>}
                        {muted && <span className="block text-[9px] font-semibold uppercase text-amber-800">0 {basis === "received" ? "received" : "ordered"} — skipped</span>}
                      </td>
                      <td className="px-2 py-2 align-middle text-right tabular-nums">{qty}</td>
                      <td className="px-2 py-2 align-middle">
                        <Select value={st?.code ?? ""} onValueChange={(v) => setLines((s) => ({ ...s, [l.id]: { ...s[l.id], code: v } }))} disabled={!codes || codes.length === 0}>
                          <SelectTrigger className="h-8 text-[11px]" aria-label={`Cost code for ${l.name}`}><SelectValue placeholder="Pick code…" /></SelectTrigger>
                          <SelectContent>{(codes ?? []).map((c) => <SelectItem key={c.code} value={c.code}>{c.code}{c.description ? ` — ${c.description}` : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <Input type="number" min={0} step={1} className="h-8 w-24 text-right text-[11px] tabular-nums" aria-label={`Rate for ${l.name}`} value={st?.rate ?? ""} onChange={(e) => setLines((s) => ({ ...s, [l.id]: { ...s[l.id], rate: e.target.value } }))} />
                      </td>
                      <td className="px-2 py-2 align-middle text-right font-semibold tabular-nums">{formatPKR(lineAmount(l.id))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* bulk code + date */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pp-bulk" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Apply one code to all lines</Label>
              <Select value="" onValueChange={(v) => { if (v) setAllCodes(v); }} disabled={!codes || codes.length === 0}>
                <SelectTrigger id="pp-bulk" aria-label="Apply one cost code to all lines"><SelectValue placeholder="Pick a code to fill every line…" /></SelectTrigger>
                <SelectContent>{(codes ?? []).map((c) => <SelectItem key={c.code} value={c.code}>{c.code}{c.description ? ` — ${c.description}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pp-incurred" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Incurred on</Label>
              <Input id="pp-incurred" type="date" value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} />
            </div>
          </div>

          {failures.length > 0 && (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-800" role="alert">
              <p>These lines did NOT post — fix and re-post only them:</p>
              <ul className="mt-1 list-disc pl-4 font-normal">{failures.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-2">
          <span className="mr-auto text-[11px] font-semibold text-muted-foreground">
            {selected.length} line{selected.length === 1 ? "" : "s"} selected · <span className="text-foreground">{formatPKR(total)}</span>
            {missingCode && selected.length > 0 && <span className="ml-1 text-amber-800">— pick a code for every selected line</span>}
          </span>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button type="button" disabled={posting || selected.length === 0 || missingCode || !codes || codes.length === 0} onClick={post} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
            {posting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />} Post {selected.length > 0 ? selected.length : ""} to actuals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
