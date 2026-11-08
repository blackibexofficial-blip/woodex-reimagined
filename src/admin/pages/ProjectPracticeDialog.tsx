import { useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseMode } from "@/config/env";
import {
  Briefcase, CalendarDays, FilePlus2, FileText, Image as ImageIcon, Loader2, ListChecks, MapPin, Trash2, Ruler, Save,
  Box, FilePenLine, Table2, Plus, ReceiptText,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import { PROJECT_MILESTONE_STATUSES, PROJECT_PRODUCTION_STAGES, PROJECT_PRODUCTION_STAGE_LABELS, PROJECT_QC_RESULTS, PROJECT_ACTUAL_SOURCES, PROJECT_ACTUAL_SOURCE_LABELS, type AdminProject, type NewProjectInput, type ProjectActualLine, type ProjectActualSource, type ProjectBoqRow, type ProjectCostCode, type ProjectFileItem, type ProjectMilestone, type ProjectMilestoneStatus, type ProjectPractice, type ProjectProduction, type ProjectProductionStageKey, type ProjectQcResult } from "@/api/types";
import { formatPKR, SectionSkeleton } from "@/admin/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const defaultProduction = (): ProjectProduction => ({
  stages: PROJECT_PRODUCTION_STAGES.map((stage) => ({ id: `prod-${stage}-${uid()}`, stage, pct: 0, note: "" })),
  qc: { result: "pending", defectNote: "", inspectedBy: "", inspectedAt: "" },
  dispatch: { date: "", vehicle: "", driver: "", driverPhone: "", challanRef: "" },
});
const clone = (p: ProjectPractice): ProjectPractice => ({
  boq: p.boq.map((r) => ({ ...r })),
  milestones: p.milestones.map((m) => ({ ...m })),
  files: p.files.map((f) => ({ ...f })),
  production: p.production
    ? { stages: p.production.stages.map((s) => ({ ...s })), qc: { ...p.production.qc }, dispatch: { ...p.production.dispatch } }
    : defaultProduction(),
});
const emptyPractice = (): ProjectPractice => ({ boq: [], milestones: [], files: [], production: defaultProduction() });
const productionProgress = (p?: ProjectProduction): number => {
  const stages = p?.stages ?? [];
  if (stages.length === 0) return 0;
  return Math.round(stages.reduce((s, x) => s + (Number.isFinite(x.pct) ? Math.min(100, Math.max(0, x.pct)) : 0), 0) / stages.length);
};
const uid = () => `x-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const fmtSize = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : n >= 1000 ? `${Math.round(n / 1000)} KB` : `${n} B`);
const FILE_ICON = { drawing: Ruler, image: ImageIcon, document: FileText, model: Box } as const;
const STATUS_META: Record<ProjectMilestoneStatus, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  in_progress: { label: "In progress", cls: "bg-sky-100 text-sky-800 border-sky-200" },
  blocked: { label: "Blocked", cls: "bg-rose-100 text-rose-800 border-rose-200" },
  done: { label: "Done", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};
const MILESTONE_WEIGHT: Record<ProjectMilestoneStatus, number> = { done: 1, in_progress: 0.5, blocked: 0, not_started: 0 };
/** A tiny deterministic pool of demo files — metadata-only, no bytes ever leave the page. */
const DEMO_FILE_POOL: Array<Omit<ProjectFileItem, "id" | "uploadedAt" | "uploadedBy">> = [
  { name: "site-walkthrough-notes.pdf", size: 486_000, kind: "document" },
  { name: "electrical-layout-rev2.dwg", size: 2_050_000, kind: "drawing" },
  { name: "client-approval-moodboard.png", size: 6_300_000, kind: "image" },
  { name: "built-in-wardrobe-detail.3d", size: 14_800_000, kind: "model" },
  { name: "boq-client-signoff.pdf", size: 212_000, kind: "document" },
];

const inputCls = "h-8 bg-white text-xs";

function milestoneProgress(ms: ProjectMilestone[]): number {
  if (ms.length === 0) return 0;
  return Math.round((ms.reduce((s, m) => s + MILESTONE_WEIGHT[m.status], 0) / ms.length) * 100);
}

export default function ProjectPracticeDialog({ project, onClose, onSaved }: { project: AdminProject; onClose: () => void; onSaved: (updated: AdminProject) => void }) {
  const api = useMemo(() => getAdminApi(), []);
  const [tab, setTab] = useState<"overview" | "boq" | "milestones" | "files" | "production" | "actuals">("overview");
  const [draft, setDraft] = useState<ProjectPractice>(() => clone(project.practice ?? emptyPractice()));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(clone(project.practice ?? emptyPractice()));
    setDirty(false);
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = true;
  const plannedTotal = draft.boq.reduce((s, r) => s + (Number.isFinite(r.qty) ? r.qty : 0) * (Number.isFinite(r.rate) ? r.rate : 0), 0);
  const doneCount = draft.milestones.filter((m) => m.status === "done").length;
  const progress = milestoneProgress(draft.milestones);
  const nextDue = draft.milestones.filter((m) => m.status !== "done" && m.due).sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];

  const touch = (mut: (d: ProjectPractice) => void) => {
    setDraft((prev) => { const next = clone(prev); mut(next); return next; });
    setDirty(true);
  };

  /* BOQ */
  const addBoqRow = () => touch((d) => { d.boq.push({ id: uid(), section: d.boq.at(-1)?.section ?? "General", item: "", qty: 1, unit: "sqft", rate: 0 }); });
  const setBoq = (id: string, patch: Partial<ProjectBoqRow>) => touch((d) => { Object.assign(d.boq.find((r) => r.id === id) ?? {}, patch); });
  const removeBoq = (id: string) => touch((d) => { d.boq = d.boq.filter((r) => r.id !== id); });
  const boqBySection = useMemo(() => {
    const m = new Map<string, ProjectBoqRow[]>();
    for (const r of draft.boq) { const list = m.get(r.section || "General") ?? []; list.push(r); m.set(r.section || "General", list); }
    return [...m.entries()];
  }, [draft.boq]);

  /* milestones */
  const addMilestone = () => touch((d) => { d.milestones.push({ id: uid(), phase: "", owner: "Site team", due: "", status: "not_started" }); });
  const setMilestone = (id: string, patch: Partial<ProjectMilestone>) => touch((d) => { Object.assign(d.milestones.find((m) => m.id === id) ?? {}, patch); });
  const removeMilestone = (id: string) => touch((d) => { d.milestones = d.milestones.filter((m) => m.id !== id); });

  /* actuals ledger — relational (migration 0013); NOT payload state, loaded live */
  const [codes, setCodes] = useState<ProjectCostCode[]>([]);
  const [actuals, setActuals] = useState<ProjectActualLine[]>([]);
  const [actualsLoading, setActualsLoading] = useState(false);
  const [actualsError, setActualsError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState({ code: "", boqSection: "", description: "" });
  const [newActual, setNewActual] = useState({ costCode: "", description: "", qty: "1", unit: "lot", rate: "", source: "po" as ProjectActualSource, poRef: "", incurredOn: new Date().toISOString().slice(0, 10) });

  const loadActuals = async () => {
    setActualsLoading(true);
    setActualsError(null);
    try {
      const [ccs, als] = await Promise.all([api.listProjectCostCodes(project.id), api.listProjectActuals(project.id)]);
      setCodes(ccs);
      setActuals(als);
    } catch (e) {
      setActualsError(e instanceof Error ? e.message : "Could not load actuals");
    } finally {
      setActualsLoading(false);
    }
  };
  useEffect(() => { void loadActuals(); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const boqSections = useMemo(() => [...new Set(draft.boq.map((r) => r.section || "General"))], [draft.boq]);
  const plannedBySection = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of draft.boq) m.set(r.section || "General", (m.get(r.section || "General") ?? 0) + (Number.isFinite(r.qty) ? r.qty : 0) * (Number.isFinite(r.rate) ? r.rate : 0));
    return m;
  }, [draft.boq]);
  const actualByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of actuals) m.set(a.costCode, (m.get(a.costCode) ?? 0) + a.amount);
    return m;
  }, [actuals]);
  const totalActual = useMemo(() => actuals.reduce((s, a) => s + a.amount, 0), [actuals]);
  const grandVariance = totalActual - plannedTotal;
  const spentPct = plannedTotal > 0 ? Math.round((totalActual / plannedTotal) * 100) : null;
  const varianceRows = useMemo(() => codes.map((c) => {
    const planned = c.boqSection ? (plannedBySection.get(c.boqSection) ?? 0) : null;
    const actual = actualByCode.get(c.code) ?? 0;
    return { code: c, planned, actual, variance: planned == null ? null : actual - planned };
  }), [codes, plannedBySection, actualByCode]);

  const refreshActuals = async () => {
    try {
      const [ccs, als] = await Promise.all([api.listProjectCostCodes(project.id), api.listProjectActuals(project.id)]);
      setCodes(ccs); setActuals(als);
    } catch { /* initial load already surfaced any error */ }
  };
  const addCode = async () => {
    const code = newCode.code.trim().toUpperCase();
    if (!code) return;
    try {
      await api.upsertProjectCostCode({ projectId: project.id, code, boqSection: newCode.boqSection || null, description: newCode.description });
      setNewCode({ code: "", boqSection: "", description: "" });
      await refreshActuals();
      toast.success(`Cost code ${code} saved`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the cost code"); }
  };
  const removeCode = async (code: string) => {
    try {
      await api.deleteProjectCostCode(project.id, code);
      await refreshActuals();
      toast.success(`Cost code ${code} removed`);
    } catch (e) { toast.error(e instanceof Error ? e.message : `Cost code ${code} could not be removed`); }
  };
  const addActualLine = async () => {
    if (!newActual.costCode) { toast.error("Pick a cost code first — add one above if the job is missing it."); return; }
    const rate = Number(newActual.rate);
    const qty = Number(newActual.qty);
    if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(qty) || qty < 0) { toast.error("Qty and rate must be zero or more."); return; }
    try {
      await api.addProjectActual({ projectId: project.id, costCode: newActual.costCode, description: newActual.description, qty, unit: newActual.unit, rate, source: newActual.source, poRef: newActual.source === "po" ? newActual.poRef : null, incurredOn: newActual.incurredOn });
      setNewActual((s) => ({ ...s, description: "", qty: "1", rate: "", poRef: "" }));
      await refreshActuals();
      toast.success("Actual line added");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not add the actual line"); }
  };
  const removeActualLine = async (id: number) => {
    try {
      await api.deleteProjectActual(id, project.id);
      await refreshActuals();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete the line"); }
  };

  /* files — real upload (supabase mode only; demo stays simulated) */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const uploadFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) { toast.error("File is larger than the 50 MB bucket cap."); return; }
    setUploading(true);
    try {
      const bytes = await file.arrayBuffer();
      const item = await api.uploadProjectFile(project.id, file.name, bytes, file.type);
      touch((d) => { d.files.push(item); });
      toast.success(`Uploaded ${item.name} — save the workspace to keep it on the job.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed — the hosted bucket (migration 0014) may not be applied yet.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* production */
  const prod = draft.production ?? defaultProduction();
  const prodPct = productionProgress(prod);
  const touchProduction = (mut: (p: ProjectProduction) => void) =>
    touch((d) => {
      const p = d.production ? { stages: d.production.stages.map((s) => ({ ...s })), qc: { ...d.production.qc }, dispatch: { ...d.production.dispatch } } : defaultProduction();
      mut(p);
      d.production = p;
    });
  const setStage = (stage: ProjectProductionStageKey, patch: Partial<{ pct: number; note: string }>) =>
    touchProduction((p) => {
      const row = p.stages.find((s) => s.stage === stage);
      if (!row) return;
      if (patch.pct !== undefined) row.pct = Math.min(100, Math.max(0, Number.isFinite(patch.pct) ? patch.pct : 0));
      if (patch.note !== undefined) row.note = patch.note;
    });
  const setQc = (patch: Partial<ProjectProduction["qc"]>) => touchProduction((p) => { Object.assign(p.qc, patch); });
  const setDispatch = (patch: Partial<ProjectProduction["dispatch"]>) => touchProduction((p) => { Object.assign(p.dispatch, patch); });

  /* files */
  const addDemoFile = () => touch((d) => {
    const pick = DEMO_FILE_POOL[d.files.length % DEMO_FILE_POOL.length];
    d.files.push({ ...pick, id: uid(), uploadedBy: "You", uploadedAt: new Date().toISOString() });
  });
  const removeFile = (id: string) => touch((d) => { d.files = d.files.filter((f) => f.id !== id); });

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProject(project.id, { practice: draft } as Partial<NewProjectInput>);
      if (updated) {
        toast.success("Practice workspace saved");
        setDirty(false);
        onSaved(updated);
      } else {
        toast.error("Project not found.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl gap-0 p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent"><Briefcase className="h-4.5 w-4.5" /></span>
            <span>
              <span className="block">{project.title}</span>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Practice workspace · BOQ · milestones · files</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 pt-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="boq">BOQ · {draft.boq.length}</TabsTrigger>
              <TabsTrigger value="milestones">Milestones · {doneCount}/{draft.milestones.length}</TabsTrigger>
              <TabsTrigger value="files">Files · {draft.files.length}</TabsTrigger>
              <TabsTrigger value="production">Production · {prodPct}%</TabsTrigger>
              <TabsTrigger value="actuals">Actuals · {actuals.length}</TabsTrigger>
            </TabsList>

            {/* ── overview ─────────────────────────────────────────── */}
            <TabsContent value="overview" className="py-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <img src={project.image} alt="" className="h-40 w-full rounded-xl border border-border object-cover sm:w-56" />
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {project.client} · {project.location} {project.sqft ? `· ${project.sqft}` : ""} {project.duration ? `· ${project.duration}` : ""}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Planned cost", value: plannedTotal > 0 ? formatPKR(plannedTotal) : "—", tone: "text-foreground" },
                      { label: `Milestones done`, value: `${doneCount}/${draft.milestones.length}`, tone: progress === 100 ? "text-emerald-700" : "text-sky-700" },
                      { label: "Next due", value: nextDue ? new Date(`${nextDue.due}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—", tone: nextDue && nextDue.status === "blocked" ? "text-rose-700" : "text-amber-700" },
                    ].map(({ label, value, tone }) => (
                      <div key={label} className="rounded-xl border border-border bg-card p-3">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
                        <p className={`mt-1 text-sm font-black sm:text-base ${tone}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                  {/* progress roll-up */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><span>Overall progress</span><span>{progress}%</span></div>
                    <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-hon-green transition-all" style={{ width: `${progress}%` }} /></div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Progress is a roll-up of milestone status weights (Done 100 · In-progress 50 · Blocked/Not-started 0). BOQ totals are <span className="font-semibold">planned</span> cost — see <span className="font-semibold">Actuals</span> for spend vs plan. {isSupabaseMode ? <>Files upload to the job&rsquo;s private <span className="font-semibold">projects</span> bucket.</> : <>Files are <span className="font-semibold">metadata-only</span>; no bytes are stored.</>} Production tracks the five shop-floor stages; QC gates dispatch.</p>
                </div>
              </div>
            </TabsContent>

            {/* ── BOQ ──────────────────────────────────────────────── */}
            <TabsContent value="boq" className="py-4">
              <div className="flex items-center justify-between pb-2">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><ListChecks className="h-4 w-4" /> Bill of quantities — planned cost</p>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={addBoqRow}><FilePenLine className="h-3.5 w-3.5" /> Add row</Button>
              </div>
              {draft.boq.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No rows yet — start the measurement sheet for this job.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto pr-1">
                  {boqBySection.map(([section, rows]) => {
                    const sub = rows.reduce((s, r) => s + (Number.isFinite(r.qty) ? r.qty : 0) * (Number.isFinite(r.rate) ? r.rate : 0), 0);
                    return (
                      <div key={section} className="mb-3">
                        <p className="flex items-center justify-between rounded-t-lg bg-secondary px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><span>{section}</span><span>{formatPKR(sub)}</span></p>
                        <div className="rounded-b-lg border border-t-0 border-border">
                          {rows.map((r) => (
                            <div key={r.id} className="grid grid-cols-12 items-center gap-1.5 border-b border-muted p-1.5 last:border-b-0">
                              <Input aria-label="Section" value={r.section} onChange={(e) => setBoq(r.id, { section: e.target.value })} className={`${inputCls} col-span-2`} />
                              <Input aria-label="Item" placeholder="Item / spec" value={r.item} onChange={(e) => setBoq(r.id, { item: e.target.value })} className={`${inputCls} col-span-4`} />
                              <Input aria-label="Qty" type="number" min={0} value={Number.isFinite(r.qty) ? r.qty : 0} onChange={(e) => setBoq(r.id, { qty: Number(e.target.value) })} className={`${inputCls} col-span-1`} />
                              <Input aria-label="Unit" value={r.unit} onChange={(e) => setBoq(r.id, { unit: e.target.value })} className={`${inputCls} col-span-1`} />
                              <Input aria-label="Rate" type="number" min={0} value={Number.isFinite(r.rate) ? r.rate : 0} onChange={(e) => setBoq(r.id, { rate: Number(e.target.value) })} className={`${inputCls} col-span-2`} />
                              <span className="col-span-1 truncate text-right font-mono text-[10px] text-muted-foreground" title={formatPKR((r.qty || 0) * (r.rate || 0))}>{formatPKR((r.qty || 0) * (r.rate || 0))}</span>
                              <button type="button" aria-label="Remove row" onClick={() => removeBoq(r.id)} className="col-span-1 flex justify-center rounded p-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs font-black"><span>Planned total</span><span>{plannedTotal > 0 ? formatPKR(plannedTotal) : "—"}</span></div>
            </TabsContent>

            {/* ── milestones ─────────────────────────────────────────── */}
            <TabsContent value="milestones" className="py-4">
              <div className="flex items-center justify-between pb-2">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><CalendarDays className="h-4 w-4" /> Phases & milestones — {progress}% complete</p>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={addMilestone}><FilePlus2 className="h-3.5 w-3.5" /> Add phase</Button>
              </div>
              {draft.milestones.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No milestones yet — phase the job from survey to handover.</p>
              ) : (
                <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {draft.milestones.map((m) => (
                    <li key={m.id} className="grid grid-cols-12 items-center gap-1.5 rounded-xl border border-border bg-card p-2">
                      <Input aria-label="Phase" placeholder="Phase — e.g. Joinery manufacture" value={m.phase} onChange={(e) => setMilestone(m.id, { phase: e.target.value })} className={`${inputCls} col-span-4`} />
                      <Input aria-label="Owner" placeholder="Owner" value={m.owner} onChange={(e) => setMilestone(m.id, { owner: e.target.value })} className={`${inputCls} col-span-2`} />
                      <Input aria-label="Due" type="date" value={m.due ?? ""} onChange={(e) => setMilestone(m.id, { due: e.target.value })} className={`${inputCls} col-span-2`} />
                      <Select value={m.status} onValueChange={(v) => setMilestone(m.id, { status: v as ProjectMilestoneStatus })}>
                        <SelectTrigger className="col-span-3 h-8 border px-2 text-[10px] font-semibold" aria-label="Status"><SelectValue /></SelectTrigger>
                        <SelectContent>{PROJECT_MILESTONE_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-[11px]">{STATUS_META[s].label}</SelectItem>)}</SelectContent>
                      </Select>
                      <button type="button" aria-label="Remove milestone" onClick={() => removeMilestone(m.id)} className="col-span-1 flex justify-center rounded p-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      <span className={`col-span-12 inline-flex w-fit rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${STATUS_META[m.status].cls}`}>{STATUS_META[m.status].label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            {/* ── actuals (relational ledger, migration 0013) ───────── */}
            <TabsContent value="actuals" className="py-4">
              <div className="flex items-center justify-between pb-2">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><ReceiptText className="h-4 w-4" /> Job costing — planned vs actual</p>
                <p className="text-[9px] text-muted-foreground">Ledger rows, not payload · read: crm.manage | finance.manage · write: crm.manage</p>
              </div>
              {actualsError && (
                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
                  <span>{actualsError}</span>
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void loadActuals()}>Retry</Button>
                </div>
              )}
              {/* KPI strip */}
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Planned (BOQ)", value: plannedTotal > 0 ? formatPKR(plannedTotal) : "—", cls: "text-foreground" },
                  { label: "Actual (ledger)", value: formatPKR(totalActual), cls: "text-foreground" },
                  { label: "Variance", value: `${grandVariance >= 0 ? "+" : "−"}${formatPKR(Math.abs(grandVariance))}`, cls: grandVariance > 0 ? "text-rose-700" : "text-emerald-700" },
                  { label: "Spent", value: spentPct === null ? "—" : `${spentPct}%`, cls: spentPct !== null && spentPct > 100 ? "text-rose-700" : "text-sky-700" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-border bg-card p-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
                    <p className={`pt-0.5 text-xs font-black leading-tight ${s.cls}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* per-code variance table */}
              <p className="pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Variance by cost code</p>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-[10px]">
                  <thead><tr className="bg-secondary text-left text-[9px] uppercase tracking-widest text-muted-foreground"><th className="px-2 py-1.5">Code · BOQ section</th><th className="px-2 py-1.5 text-right">Planned</th><th className="px-2 py-1.5 text-right">Actual</th><th className="px-2 py-1.5 text-right">Variance</th><th className="px-2 py-1.5"></th></tr></thead>
                  <tbody>
                    {varianceRows.map(({ code, planned, actual, variance }) => (
                      <tr key={code.id} className="border-t border-border">
                        <td className="px-2 py-1.5"><span className="font-mono font-bold">{code.code}</span>{code.boqSection ? <span className="text-muted-foreground"> · {code.boqSection}</span> : <span className="text-muted-foreground"> · shop code</span>}{code.description ? <span className="block text-[9px] text-muted-foreground">{code.description}</span> : null}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{planned === null ? "—" : formatPKR(planned)}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{formatPKR(actual)}</td>
                        <td className={`px-2 py-1.5 text-right font-mono font-bold ${variance === null ? "text-muted-foreground" : variance > 0 ? "text-rose-700" : "text-emerald-700"}`}>{variance === null ? "—" : `${variance >= 0 ? "+" : "−"}${formatPKR(Math.abs(variance))}`}</td>
                        <td className="px-2 py-1.5 text-right"><button type="button" aria-label={`Delete cost code ${code.code}`} title="Delete code (blocked while actuals reference it)" onClick={() => void removeCode(code.code)} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hon-green"><Trash2 className="h-3.5 w-3.5" /></button></td>
                      </tr>
                    ))}
                    {varianceRows.length === 0 && !actualsLoading && (
                      <tr><td colSpan={5} className="px-2 py-3 text-center text-[10px] text-muted-foreground">No cost codes yet — add the shop/BOQ codes below.</td></tr>
                    )}
                    <tr className="border-t border-border bg-secondary/60 font-black"><td className="px-2 py-1.5">Grand total</td><td className="px-2 py-1.5 text-right font-mono">{plannedTotal > 0 ? formatPKR(plannedTotal) : "—"}</td><td className="px-2 py-1.5 text-right font-mono">{formatPKR(totalActual)}</td><td className={`px-2 py-1.5 text-right font-mono ${grandVariance > 0 ? "text-rose-700" : "text-emerald-700"}`}>{`${grandVariance >= 0 ? "+" : "−"}${formatPKR(Math.abs(grandVariance))}`}</td><td></td></tr>
                  </tbody>
                </table>
              </div>

              {/* add cost code */}
              <div className="mt-2 grid grid-cols-12 gap-2">
                <Input aria-label="New cost code" placeholder="Code (e.g. JNR)" value={newCode.code} onChange={(e) => setNewCode((s) => ({ ...s, code: e.target.value }))} className={`${inputCls} col-span-2 font-mono uppercase`} />
                <Select value={newCode.boqSection || "__none__"} onValueChange={(v) => setNewCode((s) => ({ ...s, boqSection: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="h-8 border px-2 text-[11px]" aria-label="BOQ section for cost code"><SelectValue placeholder="Maps to section…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-[11px]">— no BOQ section (shop code) —</SelectItem>
                    {boqSections.map((s) => <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input aria-label="Cost code description" placeholder="Description (optional)" value={newCode.description} onChange={(e) => setNewCode((s) => ({ ...s, description: e.target.value }))} className={`${inputCls} col-span-5`} />
                <Button size="sm" variant="outline" className="col-span-2 h-8 text-[10px]" onClick={() => void addCode()}><Plus className="mr-1 h-3.5 w-3.5" /> Add code</Button>
              </div>

              {/* actuals lines */}
              <p className="pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Actual lines</p>
              <ul className="space-y-1.5">
                {actuals.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5">
                    <span className="w-10 shrink-0 font-mono text-[10px] font-bold">{a.costCode}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] font-semibold" title={a.description}>{a.description || "Untitled actual"}</span>
                      <span className="block text-[9px] text-muted-foreground">{a.qty} {a.unit} @ {formatPKR(a.rate)} · {PROJECT_ACTUAL_SOURCE_LABELS[a.source]}{a.poRef ? ` · ${a.poRef}` : ""} · {a.incurredOn}{a.note ? ` · ${a.note}` : ""}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] font-bold">{formatPKR(a.amount)}</span>
                    <button type="button" aria-label={`Delete actual line ${a.description || a.costCode}`} title="Delete line" onClick={() => void removeActualLine(a.id)} className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hon-green"><Trash2 className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
                {actuals.length === 0 && !actualsLoading && (
                  <li className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[10px] text-muted-foreground">No actuals recorded yet — add the first line below. PO references stay manual; allocation to BOQ rows happens here, not automatically.</li>
                )}
              </ul>

              {/* add actual line */}
              <div className="mt-2 grid grid-cols-12 gap-2 rounded-xl border border-border bg-card p-2">
                <Select value={newActual.costCode || "__none__"} onValueChange={(v) => setNewActual((s) => ({ ...s, costCode: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="col-span-2 h-8 border px-2 text-[11px]" aria-label="Actual cost code"><SelectValue placeholder="Code…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-[11px]">— code —</SelectItem>
                    {codes.map((c) => <SelectItem key={c.id} value={c.code} className="text-[11px]">{c.code}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input aria-label="Actual description" placeholder="What was bought / done?" value={newActual.description} onChange={(e) => setNewActual((s) => ({ ...s, description: e.target.value }))} className={`${inputCls} col-span-4`} />
                <Input aria-label="Actual qty" type="number" min={0} step="any" value={newActual.qty} onChange={(e) => setNewActual((s) => ({ ...s, qty: e.target.value }))} className={`${inputCls} col-span-1`} />
                <Input aria-label="Actual unit" value={newActual.unit} onChange={(e) => setNewActual((s) => ({ ...s, unit: e.target.value }))} className={`${inputCls} col-span-1`} />
                <Input aria-label="Actual rate" type="number" min={0} step="any" placeholder="Rate" value={newActual.rate} onChange={(e) => setNewActual((s) => ({ ...s, rate: e.target.value }))} className={`${inputCls} col-span-2`} />
                <Input aria-label="Incurred on" type="date" value={newActual.incurredOn} onChange={(e) => setNewActual((s) => ({ ...s, incurredOn: e.target.value }))} className={`${inputCls} col-span-2`} />
                <Select value={newActual.source} onValueChange={(v) => setNewActual((s) => ({ ...s, source: v as ProjectActualSource }))}>
                  <SelectTrigger className="col-span-2 h-8 border px-2 text-[11px]" aria-label="Actual source"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_ACTUAL_SOURCES.map((s) => <SelectItem key={s} value={s} className="text-[11px]">{PROJECT_ACTUAL_SOURCE_LABELS[s]}</SelectItem>)}</SelectContent>
                </Select>
                {newActual.source === "po" && <Input aria-label="PO ref" placeholder="PO ref (e.g. PO-1044)" value={newActual.poRef} onChange={(e) => setNewActual((s) => ({ ...s, poRef: e.target.value }))} className={`${inputCls} col-span-3`} />}
                <Button size="sm" className="col-span-2 h-8 bg-hon-green text-[10px] font-bold text-white hover:bg-hon-green/90" onClick={() => void addActualLine()}><Plus className="mr-1 h-3.5 w-3.5" /> Add line</Button>
              </div>
            </TabsContent>

            {/* ── production ────────────────────────────────────── */}
            <TabsContent value="production" className="py-4">
              <div className="flex items-center justify-between pb-2">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><Box className="h-4 w-4" /> Shop floor — {prodPct}% complete · QC gates dispatch</p>
              </div>
              <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-hon-green transition-all" style={{ width: `${prodPct}%` }} /></div>
              <ul className="space-y-2">
                {PROJECT_PRODUCTION_STAGES.map((stage) => {
                  const row = prod.stages.find((s) => s.stage === stage);
                  const pct = row?.pct ?? 0;
                  const done = pct >= 100;
                  return (
                    <li key={stage} className="grid grid-cols-12 items-center gap-2 rounded-xl border border-border bg-card p-2">
                      <span className="col-span-2 text-[11px] font-bold text-foreground">{PROJECT_PRODUCTION_STAGE_LABELS[stage]}</span>
                      <Input aria-label={`${PROJECT_PRODUCTION_STAGE_LABELS[stage]} note`} placeholder="Note — e.g. CNC slot booked" value={row?.note ?? ""} onChange={(e) => setStage(stage, { note: e.target.value })} className={`${inputCls} col-span-5`} />
                      <Input aria-label={`${PROJECT_PRODUCTION_STAGE_LABELS[stage]} percent`} type="number" min={0} max={100} step={5} value={pct} onChange={(e) => setStage(stage, { pct: Number(e.target.value) })} className={`${inputCls} col-span-2`} />
                      <span className="col-span-3 flex justify-end"><span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${done ? "border-emerald-200 bg-emerald-100 text-emerald-800" : pct > 0 ? "border-sky-200 bg-sky-100 text-sky-800" : "border-slate-200 bg-slate-100 text-slate-700"}`}>{done ? "Done" : pct > 0 ? `In progress · ${pct}%` : "Pending"}</span></span>
                    </li>
                  );
                })}
              </ul>

              {/* QC gate */}
              <div className="mt-4 rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">QC gate</p>
                  <div className="flex items-center gap-2">
                    <Select value={prod.qc.result} onValueChange={(v) => setQc({ result: v as ProjectQcResult })}>
                      <SelectTrigger className="h-8 w-32 border px-2 text-[11px] font-semibold" aria-label="QC result"><SelectValue /></SelectTrigger>
                      <SelectContent>{PROJECT_QC_RESULTS.map((r) => <SelectItem key={r} value={r} className="text-[11px]">{r === "pending" ? "Pending" : r === "passed" ? "Passed" : "Failed"}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input aria-label="QC inspected by" placeholder="Inspected by" value={prod.qc.inspectedBy} onChange={(e) => setQc({ inspectedBy: e.target.value })} className={`${inputCls} w-32`} />
                    <Input aria-label="QC inspected at" type="date" value={prod.qc.inspectedAt} onChange={(e) => setQc({ inspectedAt: e.target.value })} className={`${inputCls} w-36`} />
                  </div>
                </div>
                <Input aria-label="QC defect note" placeholder="Defect note (when failed — e.g. veneer chip on console no. 3)" value={prod.qc.defectNote} onChange={(e) => setQc({ defectNote: e.target.value })} className={`${inputCls} mt-2 w-full`} />
                <p className="mt-1.5 text-[10px] text-muted-foreground">Dispatch should not leave the yard until QC is <span className="font-semibold">Passed</span>. Informational only in this slice — enforcement needs a hosted migration.</p>
              </div>

              {/* dispatch */}
              <div className="mt-3 rounded-xl border border-border bg-card p-3">
                <p className="pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dispatch</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <Input aria-label="Dispatch date" type="date" value={prod.dispatch.date} onChange={(e) => setDispatch({ date: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-1`} />
                  <Input aria-label="Vehicle" placeholder="Vehicle" value={prod.dispatch.vehicle} onChange={(e) => setDispatch({ vehicle: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-1`} />
                  <Input aria-label="Driver" placeholder="Driver" value={prod.dispatch.driver} onChange={(e) => setDispatch({ driver: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-1`} />
                  <Input aria-label="Driver phone" placeholder="Driver phone" value={prod.dispatch.driverPhone} onChange={(e) => setDispatch({ driverPhone: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-1`} />
                  <Input aria-label="Challan ref" placeholder="Challan ref" value={prod.dispatch.challanRef} onChange={(e) => setDispatch({ challanRef: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-2`} />
                </div>
              </div>
            </TabsContent>

            {/* ── files ──────────────────────────────────────────────── */}
            <TabsContent value="files" className="py-4">
              <div className="flex items-center justify-between pb-2">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><FileText className="h-4 w-4" /> Drawings & papers{isSupabaseMode ? "" : " — metadata only"}</p>
                <span className="flex items-center gap-2">
                  {isSupabaseMode && (
                    <>
                      <input ref={fileInputRef} type="file" className="sr-only" aria-label="Upload file to the job bucket" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); }} />
                      <Button size="sm" className="h-8 gap-1.5 bg-hon-green text-xs font-bold text-white hover:bg-hon-green/90" disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />} {uploading ? "Uploading…" : "Upload file"}</Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={addDemoFile}><FilePlus2 className="h-3.5 w-3.5" /> Simulate upload</Button>
                </span>
              </div>
              {draft.files.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No files on record — drawings, approvals and reports live here.</p>
              ) : (
                <ul className="max-h-80 divide-y divide-muted overflow-y-auto rounded-xl border border-border">
                  {draft.files.map((f) => {
                    const Icon = FILE_ICON[f.kind];
                    return (
                      <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-[11px] font-semibold text-foreground" title={f.storagePath ?? f.name}>{f.name}</span>
                          <span className="text-[10px] text-muted-foreground">{fmtSize(f.size)} · {f.uploadedBy} · {new Date(f.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                        </span>
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeFile(f.id)} className="rounded p-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {isSupabaseMode
                ? <p className="pt-2 text-[10px] text-muted-foreground">Files upload to the private <span className="font-semibold">projects</span> bucket (job-scoped path, crm.manage only — migration 0014); metadata saves with the workspace. Bucket is not applied on hosted yet — see docs/07-admin-integration §8.</p>
                : <p className="pt-2 text-[10px] text-muted-foreground">Demo flow: uploads are <span className="font-semibold">simulated</span> — names/sizes only, no bytes stored or sent. Real file storage rides the hosted bucket (migration 0014, crm.manage).</p>}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border px-5 py-3 sm:justify-between">
          <p className="text-[10px] text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={save} disabled={saving || !dirty} className="gap-1.5">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? "Saving…" : "Save workspace"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
