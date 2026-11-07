import { useEffect, useMemo, useState } from "react";
import {
  Briefcase, CalendarDays, FilePlus2, FileText, Image as ImageIcon, Loader2, ListChecks, MapPin, Trash2, Ruler, Save,
  Box, FilePenLine,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import { PROJECT_MILESTONE_STATUSES, type AdminProject, type NewProjectInput, type ProjectBoqRow, type ProjectFileItem, type ProjectMilestone, type ProjectMilestoneStatus, type ProjectPractice } from "@/api/types";
import { formatPKR, SectionSkeleton } from "@/admin/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const clone = (p: ProjectPractice): ProjectPractice => ({
  boq: p.boq.map((r) => ({ ...r })),
  milestones: p.milestones.map((m) => ({ ...m })),
  files: p.files.map((f) => ({ ...f })),
});
const emptyPractice = (): ProjectPractice => ({ boq: [], milestones: [], files: [] });
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
  const [tab, setTab] = useState<"overview" | "boq" | "milestones" | "files">("overview");
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
                  <p className="text-[10px] text-muted-foreground">Progress is a roll-up of milestone status weights (Done 100 · In-progress 50 · Blocked/Not-started 0). BOQ totals are <span className="font-semibold">planned</span> cost — no actuals/variance (needs owner sign-off on a costing model). Files are <span className="font-semibold">metadata-only</span>; no bytes are stored.</p>
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

            {/* ── files ──────────────────────────────────────────────── */}
            <TabsContent value="files" className="py-4">
              <div className="flex items-center justify-between pb-2">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><FileText className="h-4 w-4" /> Drawings & papers — metadata only</p>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={addDemoFile}><FilePlus2 className="h-3.5 w-3.5" /> Simulate upload</Button>
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
                          <span className="block truncate font-mono text-[11px] font-semibold text-foreground">{f.name}</span>
                          <span className="text-[10px] text-muted-foreground">{fmtSize(f.size)} · {f.uploadedBy} · {new Date(f.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                        </span>
                        <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeFile(f.id)} className="rounded p-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="pt-2 text-[10px] text-muted-foreground">Demo flow: uploads are <span className="font-semibold">simulated</span> — names/sizes only, no bytes stored or sent. Real file storage (Supabase Storage + RLS) is an owner-gated hosted step.</p>
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
