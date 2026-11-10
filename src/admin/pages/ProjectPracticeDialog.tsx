import { useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseMode } from "@/config/env";
import {
  Briefcase, CalendarDays, FilePlus2, FileText, Image as ImageIcon, Loader2, ListChecks, MapPin, Trash2, Ruler, Save,
  Box, FilePenLine, Table2, Plus, ReceiptText, Download, Truck, Wrench, ShieldCheck, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import { PROJECT_MILESTONE_STATUSES, PROJECT_PRODUCTION_STAGES, PROJECT_PRODUCTION_STAGE_LABELS, PROJECT_ACTUAL_SOURCES, PROJECT_ACTUAL_SOURCE_LABELS, type AdminProject, type ProjectActualLine, type ProjectActualSource, type ProjectBoqRow, type ProjectCostCode, type ProjectFileItem, type ProjectMilestone, type ProjectMilestoneStatus, type ProjectPractice, type ProjectProduction, type ProjectProductionStageKey, type ProjectQcInspection, type ProjectPostDispatch, type ProjectHandoverKind, type ProjectWarrantyClaim, type ProjectWarrantyResolutionKind, type StaffSeat, type AdminProduct } from "@/api/types";
import { normalizePractice } from "@/lib/projectPractice";
import { useAdminAuth } from "@/admin/auth";
import { useUnsavedChanges } from "@/admin/unsavedChanges";
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
  const stages = Array.isArray(p?.stages) ? p.stages : [];
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
  const [tab, setTab] = useState<"overview" | "boq" | "milestones" | "files" | "production" | "handover" | "actuals">("overview");
  const [draft, setDraft] = useState<ProjectPractice>(() => normalizePractice(project.practice).practice);
  const [repairNotice, setRepairNotice] = useState(() => normalizePractice(project.practice).repaired);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const editRevision = useRef(0);
  const saveInFlight = useRef(false);
  const uploadInFlight = useRef(false);
  const [revision, setRevision] = useState(project.revision ?? 0);
  const [conflict, setConflict] = useState(false);
  const [inspections, setInspections] = useState<ProjectQcInspection[]>([]);
  const [inspectionResult, setInspectionResult] = useState<"passed" | "failed">("passed");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [recording, setRecording] = useState(false);
  /* ── post-dispatch: delivery / installation / warranty (candidate 00025) ── */
  const todayIso = () => new Date().toISOString().slice(0, 10);
  const [post, setPost] = useState<ProjectPostDispatch | null>(null);
  const [postBusy, setPostBusy] = useState(false);
  const [handoverKind, setHandoverKind] = useState<ProjectHandoverKind>("delivery");
  const [handoverDate, setHandoverDate] = useState(todayIso);
  const [handoverLead, setHandoverLead] = useState("");
  const [handoverNotes, setHandoverNotes] = useState("");
  const [handoverSignedBy, setHandoverSignedBy] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState("12");
  const [warrantyCoverage, setWarrantyCoverage] = useState("");
  const [warrantyExclusions, setWarrantyExclusions] = useState("");
  const [warrantyReason, setWarrantyReason] = useState("");
  const [warrantySlaDays, setWarrantySlaDays] = useState("7");
  const [claims, setClaims] = useState<ProjectWarrantyClaim[]>([]);
  const [claimSummary, setClaimSummary] = useState("");
  const [claimDetails, setClaimDetails] = useState("");
  const [claimResolutions, setClaimResolutions] = useState<Record<string, string>>({});
  const [claimCosts, setClaimCosts] = useState<Record<string, string>>({});
  const [claimKinds, setClaimKinds] = useState<Record<string, ProjectWarrantyResolutionKind>>({});
  const [claimReplaceQty, setClaimReplaceQty] = useState<Record<string, string>>({});
  const [claimReplaceProduct, setClaimReplaceProduct] = useState<Record<string, string>>({});
  const [seats, setSeats] = useState<StaffSeat[]>([]);
  const [catalogue, setCatalogue] = useState<AdminProduct[] | null>(null);
  const { user } = useAdminAuth();
  /** Separation of duties: whoever last moved the stages cannot record the pass. */
  const lastStageEditor = project.productionUpdatedBy;
  const selfEdited = Boolean(lastStageEditor && user?.email && lastStageEditor.toLowerCase() === user.email.toLowerCase());

  useEffect(() => {
    const normalized = normalizePractice(project.practice);
    setDraft(normalized.practice);
    setRepairNotice(normalized.repaired);
    setRevision(project.revision ?? 0);
    setConflict(false);
    setDirty(false);
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once the delivery is in, the only handover left is the installation.
  useEffect(() => {
    if (post?.delivery && !post?.installation) setHandoverKind("installation");
  }, [post?.delivery, post?.installation]);

  const reloadClaims = async () => {
    try { setClaims(await api.listProjectWarrantyClaims(project.id)); }
    catch { setClaims([]); }
  };
  useEffect(() => {
    let active = true;
    void api.listProjectWarrantyClaims(project.id)
      .then((rows) => { if (active) setClaims(rows); })
      .catch(() => { if (active) setClaims([]); });
    return () => { active = false; };
  }, [api, project.id]);
  // Claim owners come from staff_seats (00033); the list is guarded, so a viewer
  // simply gets nothing rather than an error banner.
  useEffect(() => {
    let active = true;
    void api.listStaffSeats()
      .then((rows) => { if (active) setSeats(rows); })
      .catch(() => { if (active) setSeats([]); });
    return () => { active = false; };
  }, [api]);
  /** The catalogue is only needed when someone settles a claim with a replacement. */
  const ensureCatalogue = async () => {
    if (catalogue) return catalogue;
    try {
      const res = await api.listProducts({ perPage: 100 });
      setCatalogue(res.items);
      return res.items;
    } catch {
      setCatalogue([]);
      return [] as AdminProduct[];
    }
  };
  const seatEmail = (id?: string) => {
    if (!id) return "";
    const seat = seats.find((s) => s.userId === id);
    return seat ? seat.name || seat.email : id;
  };

  const loadPost = async () => {
    try { setPost(await api.getProjectPostDispatch(project.id)); }
    catch { setPost({ projectId: project.id, warrantyState: "none" }); }
  };
  useEffect(() => {
    let active = true;
    void api.getProjectPostDispatch(project.id)
      .then((row) => { if (active) setPost(row); })
      .catch(() => { if (active) setPost({ projectId: project.id, warrantyState: "none" }); });
    return () => { active = false; };
  }, [api, project.id]);

  useEffect(() => {
    let active = true;
    void api.listProjectQcInspections(project.id)
      .then((rows) => { if (active) setInspections(rows); })
      .catch(() => { if (active) setInspections([]); });
    return () => { active = false; };
  }, [api, project.id]);

  const open = true;
  const plannedTotal = draft.boq.reduce((s, r) => s + (Number.isFinite(r.qty) ? r.qty : 0) * (Number.isFinite(r.rate) ? r.rate : 0), 0);
  const doneCount = draft.milestones.filter((m) => m.status === "done").length;
  const progress = milestoneProgress(draft.milestones);
  const nextDue = draft.milestones.filter((m) => m.status !== "done" && m.due).sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];

  const touch = (mut: (d: ProjectPractice) => void) => {
    editRevision.current += 1;
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

  /* files — real upload + signed-URL download (supabase mode only; demo stays simulated) */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // The dialog refuses to close while dirty; this covers reloads and any link that
  // escapes the modal (the shared guard asks before navigating).
  useUnsavedChanges(dirty || saving || uploading || recording);

  const requestClose = () => {
    if (saveInFlight.current || uploadInFlight.current || recording) {
      toast.error("Wait for the workspace operation to finish before closing.");
      return;
    }
    if (dirty && !window.confirm("You have unsaved workspace changes. Close without saving?")) return;
    onClose();
  };
  const downloadFile = async (f: ProjectFileItem) => {
    if (!f.storagePath) return;
    setDownloadingId(f.id);
    try {
      const url = await api.getProjectFileDownloadUrl(f.storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed — the hosted bucket (migration 0014) may not be applied yet.");
    } finally {
      setDownloadingId(null);
    }
  };
  const uploadFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) { toast.error("File is larger than the 50 MB bucket cap."); return; }
    if (saveInFlight.current || uploadInFlight.current) return;
    uploadInFlight.current = true;
    setUploading(true);
    try {
      const bytes = await file.arrayBuffer();
      const item = await api.uploadProjectFile(project.id, file.name, bytes, file.type);
      touch((d) => { d.files.push(item); });
      toast.success(`Uploaded ${item.name} — save the workspace to keep it on the job.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed — the hosted bucket (migration 0014) may not be applied yet.");
    } finally {
      uploadInFlight.current = false;
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* production */
  const prod = draft.production ?? defaultProduction();
  const prodPct = productionProgress(prod);
  const qcPassed = prod.qc.result === "passed";
  const dispatchHasData = Object.values(prod.dispatch).some((v) => (typeof v === "string" ? v.trim() !== "" : v != null));
  const clearDispatch = () => {
    touchProduction((p) => { p.dispatch = { date: "", vehicle: "", driver: "", driverPhone: "", challanRef: "" }; });
    toast.message("Dispatch details cleared — save to remove them from the job.");
  };
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
  const setDispatch = (patch: Partial<ProjectProduction["dispatch"]>) => touchProduction((p) => { Object.assign(p.dispatch, patch); });

  /* files */
  const addDemoFile = () => touch((d) => {
    const pick = DEMO_FILE_POOL[d.files.length % DEMO_FILE_POOL.length];
    d.files.push({ ...pick, id: uid(), uploadedBy: "You", uploadedAt: new Date().toISOString() });
  });
  const removeFile = (id: string) => touch((d) => { d.files = d.files.filter((f) => f.id !== id); });

  /** Recording an inspection is the only way a job's QC result changes. The
   *  demo store and the candidate Supabase RPC (00022) apply the same rule. */
  const recordInspection = async () => {
    if (recording) return;
    if (saveInFlight.current || uploadInFlight.current) {
      toast.error("Finish the current save or upload before recording an inspection.");
      return;
    }
    setRecording(true);
    const wasDirty = dirty;
    try {
      const { project: updated } = await api.recordProjectQcInspection({
        projectId: project.id,
        result: inspectionResult,
        notes: inspectionNotes,
      });
      const rows = await api.listProjectQcInspections(project.id);
      setInspections(rows);
      setInspectionNotes("");
      if (updated) {
        const normalized = normalizePractice(updated.practice);
        setRepairNotice(normalized.repaired);
        const fresh = normalized.practice;
        if (wasDirty) {
          // Keep the user's unsaved work; only the server-owned QC block changes.
          setDraft((prev) => ({
            ...prev,
            production: prev.production && fresh.production
              ? { ...prev.production, qc: { ...fresh.production.qc } }
              : fresh.production ?? prev.production,
          }));
        } else {
          setDraft(fresh);
          setDirty(false);
        }
        setRevision(updated.revision ?? revision);
        setConflict(false);
        onSaved(updated);
      }
      toast.success(`QC inspection recorded as ${inspectionResult}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the inspection.");
    } finally {
      setRecording(false);
    }
  };

  const reloadLatest = async () => {
    if (!window.confirm("Reload the saved workspace? Unsaved edits on this screen will be discarded.")) return;
    try {
      const rows = await api.listProjects();
      const fresh = rows.find((p) => p.id === project.id);
      if (!fresh) { toast.error("Project not found."); return; }
      editRevision.current += 1;
      const normalized = normalizePractice(fresh.practice);
      setDraft(normalized.practice);
      setRepairNotice(normalized.repaired);
      setRevision(fresh.revision ?? 0);
      setDirty(false);
      setConflict(false);
      onSaved(fresh);
      toast.success("Reloaded the latest workspace");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reload the project.");
    }
  };

  /** Post-dispatch records. The server decides sequence (QC pass → dispatch → delivery
   *  → installation → warranty); this only surfaces the message. */
  const recordHandover = async (kind: ProjectHandoverKind) => {
    if (postBusy) return;
    setPostBusy(true);
    try {
      await api.recordProjectHandover({ projectId: project.id, kind, happenedOn: handoverDate, lead: handoverLead, notes: handoverNotes, signedBy: handoverSignedBy });
      await loadPost();
      setHandoverLead(""); setHandoverNotes(""); setHandoverSignedBy("");
      toast.success(`${kind === "delivery" ? "Delivery" : "Installation"} recorded.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the handover.");
    } finally { setPostBusy(false); }
  };
  const openWarranty = async () => {
    if (postBusy) return;
    setPostBusy(true);
    try {
      await api.openProjectWarranty({
        projectId: project.id,
        months: Number(warrantyMonths),
        coverage: warrantyCoverage,
        exclusions: warrantyExclusions,
        slaDays: Number(warrantySlaDays) || 7,
      });
      await loadPost();
      setWarrantyCoverage(""); setWarrantyExclusions("");
      toast.success("Warranty opened from the installation date.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the warranty.");
    } finally { setPostBusy(false); }
  };
  const cancelWarranty = async () => {
    if (postBusy) return;
    setPostBusy(true);
    try {
      await api.cancelProjectWarranty({ projectId: project.id, reason: warrantyReason });
      await loadPost();
      setWarrantyReason("");
      toast.success("Warranty cancelled — the record is kept.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel the warranty.");
    } finally { setPostBusy(false); }
  };

  const openClaim = async () => {
    if (postBusy) return;
    setPostBusy(true);
    try {
      await api.openProjectWarrantyClaim({ projectId: project.id, summary: claimSummary, details: claimDetails });
      await reloadClaims();
      setClaimSummary(""); setClaimDetails("");
      toast.success("Warranty claim opened.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the claim.");
    } finally { setPostBusy(false); }
  };
  const moveClaim = async (claim: ProjectWarrantyClaim, status: "scheduled" | "resolved" | "rejected") => {
    if (postBusy) return;
    setPostBusy(true);
    try {
      const kind = claimKinds[claim.id];
      const costText = (claimCosts[claim.id] ?? "").trim();
      const qtyText = (claimReplaceQty[claim.id] ?? "").trim();
      await api.updateProjectWarrantyClaim({
        claimId: claim.id,
        status,
        resolution: claimResolutions[claim.id] ?? "",
        ...(status === "resolved" && costText !== "" ? { cost: Number(costText) } : {}),
        ...(status === "resolved" && kind ? { resolutionKind: kind } : {}),
        // A replacement names a catalogue product; the server takes the stock.
        ...(status === "resolved" && kind === "replacement" && qtyText !== "" && claimReplaceProduct[claim.id]
          ? { replacement: { productId: claimReplaceProduct[claim.id], qty: Number(qtyText) } }
          : {}),
      });
      await reloadClaims();
      setClaimResolutions((prev) => ({ ...prev, [claim.id]: "" }));
      setClaimCosts((prev) => ({ ...prev, [claim.id]: "" }));
      setClaimReplaceQty((prev) => ({ ...prev, [claim.id]: "" }));
      setClaimReplaceProduct((prev) => ({ ...prev, [claim.id]: "" }));
      toast.success(`Claim ${status}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the claim.");
    } finally { setPostBusy(false); }
  };
  const assignClaim = async (claim: ProjectWarrantyClaim, userId: string) => {
    if (postBusy || !userId) return;
    setPostBusy(true);
    try {
      await api.assignProjectWarrantyClaim({ claimId: claim.id, userId });
      await reloadClaims();
      toast.success("Claim owner updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not assign the claim.");
    } finally { setPostBusy(false); }
  };

  const save = async () => {
    if (saveInFlight.current || uploadInFlight.current || recording) return;
    // client-side dispatch gate — production data rides the payload; refuse to
    // persist dispatch details (or a dispatched stage) while QC is not passed.
    const d = draft.production;
    const dispatchStage = d?.stages.find((s) => s.stage === "dispatch");
    const hasDispatchData = Boolean(d && (
      Object.values(d.dispatch).some((v) => String(v).trim() !== "") ||
      (Number.isFinite(dispatchStage?.pct ?? 0) && (dispatchStage?.pct ?? 0) > 0)
    ));
    if (d && d.qc.result !== "passed" && hasDispatchData) {
      setTab("production");
      toast.error("QC is not passed — dispatch data can't be saved until QC is Passed (or clear the dispatch block).");
      return;
    }
    saveInFlight.current = true;
    const editSnapshot = editRevision.current;
    const expectedRevision = revision;
    setSaving(true);
    try {
      const updated = await api.saveProjectPractice(project.id, draft, expectedRevision);
      if (updated) {
        setRevision(updated.revision ?? expectedRevision + 1);
        setConflict(false);
        if (editRevision.current === editSnapshot) {
          setDirty(false);
          toast.success("Practice workspace saved");
        } else {
          toast.warning("An earlier workspace snapshot was saved. Newer changes are still unsaved; save again.");
        }
        onSaved(updated);
      } else {
        toast.error("Project not found.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Save failed.";
      if (/changed elsewhere/i.test(message)) {
        setConflict(true);
        toast.error(message);
      } else {
        toast.error(message);
      }
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) requestClose(); }}>
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
          {conflict && (
            <div role="alert" className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
              <span>This job changed elsewhere while you were editing. Your edits are still on screen — reload the saved version before saving, or keep editing and save once you have reloaded.</span>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" aria-label="Reload latest workspace" onClick={() => void reloadLatest()}>Reload latest</Button>
            </div>
          )}
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="boq">BOQ · {draft.boq.length}</TabsTrigger>
              <TabsTrigger value="milestones">Milestones · {doneCount}/{draft.milestones.length}</TabsTrigger>
              <TabsTrigger value="files">Files · {draft.files.length}</TabsTrigger>
              <TabsTrigger value="production">Production · {prodPct}%</TabsTrigger>
              <TabsTrigger value="handover">Handover</TabsTrigger>
              <TabsTrigger value="actuals">Actuals · {actuals.length}</TabsTrigger>
            </TabsList>

            {/* ── overview ─────────────────────────────────────────── */}
            <TabsContent value="overview" className="py-4">
              <div className="flex flex-col gap-4 sm:flex-row">
                <img src={project.image} alt="" className="h-40 w-full rounded-xl border border-border object-cover sm:w-56" />
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {project.client} · {project.location} {project.sqft ? `· ${project.sqft}` : ""} {project.duration ? `· ${project.duration}` : ""}</p>
                  {project.orderId && (
                    <p className="text-[11px] text-muted-foreground" aria-label="Linked order">
                      Started from order <span className="font-mono font-semibold text-foreground">{project.orderId}</span> — production and QC stay on this job.
                    </p>
                  )}
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
            {/* ── handover: delivery · installation · warranty ──────── */}
            <TabsContent value="handover" className="py-4">
              <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground">
                  Delivery and installation are recorded only after the QC pass and stored dispatch details; the warranty runs from the installation date and its state is derived by the server, never typed.
                </p>
                {!qcPassed && (
                  <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900">
                    Handover is locked until QC is passed — record the inspection on the Production tab first.
                  </p>
                )}

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-3" aria-label="Delivery handover">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><Truck className="h-3.5 w-3.5" /> Delivery</p>
                    {post?.delivery ? (
                      <div className="mt-1 space-y-0.5 text-[11px]">
                        <p className="font-semibold text-foreground">{new Date(`${post.delivery.happenedOn}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                        <p className="text-muted-foreground">{post.delivery.lead || "—"}{post.delivery.signedBy ? ` · signed by ${post.delivery.signedBy}` : ""}</p>
                        {post.delivery.notes && <p className="text-muted-foreground">{post.delivery.notes}</p>}
                      </div>
                    ) : <p className="mt-1 text-[11px] text-muted-foreground">Not recorded.</p>}
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3" aria-label="Installation handover">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><Wrench className="h-3.5 w-3.5" /> Installation</p>
                    {post?.installation ? (
                      <div className="mt-1 space-y-0.5 text-[11px]">
                        <p className="font-semibold text-foreground">{new Date(`${post.installation.happenedOn}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                        <p className="text-muted-foreground">{post.installation.lead || "—"}{post.installation.signedBy ? ` · signed by ${post.installation.signedBy}` : ""}</p>
                        {post.installation.notes && <p className="text-muted-foreground">{post.installation.notes}</p>}
                      </div>
                    ) : <p className="mt-1 text-[11px] text-muted-foreground">{post?.delivery ? "Not recorded." : "Record the delivery first."}</p>}
                  </div>
                </div>

                {(!post?.delivery || !post?.installation) && (
                  <div className="rounded-xl border border-border bg-card p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Record handover</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Select value={handoverKind} onValueChange={(v) => setHandoverKind(v as ProjectHandoverKind)}>
                        <SelectTrigger className="h-8 w-32 border px-2 text-[11px] font-semibold" aria-label="Handover kind"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="delivery" disabled={Boolean(post?.delivery)} className="text-[11px]">Delivery</SelectItem>
                          <SelectItem value="installation" disabled={Boolean(post?.installation) || !post?.delivery} className="text-[11px]">Installation</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input aria-label="Handover date" type="date" value={handoverDate} max={todayIso()} onChange={(e) => setHandoverDate(e.target.value)} className={`${inputCls} w-36`} />
                      <Input aria-label="Handover lead" placeholder="Team lead" value={handoverLead} onChange={(e) => setHandoverLead(e.target.value)} className={`${inputCls} w-32`} />
                      <Input aria-label="Handover signed by" placeholder="Signed by (customer)" value={handoverSignedBy} onChange={(e) => setHandoverSignedBy(e.target.value)} className={`${inputCls} w-36`} />
                    </div>
                    <Input aria-label="Handover notes" placeholder="Condition, site notes, anything the next person needs" value={handoverNotes} onChange={(e) => setHandoverNotes(e.target.value)} className={`${inputCls} mt-2 w-full`} />
                    <Button
                      size="sm"
                      aria-label="Record handover"
                      className="mt-2 h-8 gap-1.5 bg-hon-green text-xs font-bold text-white hover:bg-hon-green/90"
                      disabled={postBusy || !qcPassed || handoverKind === "installation" && !post?.delivery}
                      onClick={() => void recordHandover(handoverKind)}
                    >
                      {postBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />} Record handover
                    </Button>
                  </div>
                )}

                <div className="rounded-xl border border-border bg-card p-3" aria-label="Warranty">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> Warranty</p>
                    <span
                      aria-label="Warranty state"
                      className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${post?.warrantyState === "active" ? "border-emerald-200 bg-emerald-100 text-emerald-800" : post?.warrantyState === "expired" ? "border-rose-200 bg-rose-100 text-rose-800" : post?.warrantyState === "cancelled" ? "border-slate-300 bg-slate-100 text-slate-700" : "border-amber-300 bg-amber-100 text-amber-900"}`}
                    >
                      {post?.warrantyState ?? "none"}
                    </span>
                  </div>
                  {post?.warranty ? (
                    <div className="mt-1 space-y-1 text-[11px]">
                      <p className="font-semibold text-foreground">{post.warranty.months} months · {new Date(`${post.warranty.startsOn}T00:00:00`).toLocaleDateString("en-GB")} → {new Date(`${post.warranty.endsOn}T00:00:00`).toLocaleDateString("en-GB")}</p>
                      {post.warranty.coverage && <p className="text-muted-foreground">Covered: {post.warranty.coverage}</p>}
                      {post.warranty.exclusions && <p className="text-muted-foreground">Excluded: {post.warranty.exclusions}</p>}
                      {post.warranty.cancelReason && <p className="text-muted-foreground">Cancelled: {post.warranty.cancelReason}</p>}
                      {post.warrantyState === "active" && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Input aria-label="Warranty cancellation reason" placeholder="Cancellation reason" value={warrantyReason} onChange={(e) => setWarrantyReason(e.target.value)} className={`${inputCls} w-56`} />
                          <Button size="sm" variant="outline" aria-label="Cancel warranty" className="h-8 gap-1.5 text-xs font-bold" disabled={postBusy} onClick={() => void cancelWarranty()}>
                            {postBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Cancel warranty
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="text-[11px] text-muted-foreground">{post?.installation ? "No warranty recorded yet." : "Record the installation before opening a warranty."}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input aria-label="Warranty months" type="number" min={1} max={120} value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} className={`${inputCls} w-24`} />
                        <Input aria-label="Warranty coverage" placeholder="Covered (structure, hardware…)" value={warrantyCoverage} onChange={(e) => setWarrantyCoverage(e.target.value)} className={`${inputCls} w-64`} />
                        <Input aria-label="Warranty exclusions" placeholder="Exclusions (damage, misuse…)" value={warrantyExclusions} onChange={(e) => setWarrantyExclusions(e.target.value)} className={`${inputCls} w-64`} />
                        <Input aria-label="Claim SLA days" title="Calendar days a claim may stay open before it counts as a breach" type="number" min={1} max={90} value={warrantySlaDays} onChange={(e) => setWarrantySlaDays(e.target.value)} className={`${inputCls} w-24`} />
                        <Button
                          size="sm"
                          aria-label="Open warranty"
                          className="h-8 gap-1.5 bg-hon-green text-xs font-bold text-white hover:bg-hon-green/90"
                          disabled={postBusy || !post?.installation}
                          onClick={() => void openWarranty()}
                        >
                          {postBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Open warranty
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* warranty claims (candidate 00026) */}
                <div className="rounded-xl border border-border bg-card p-3" aria-label="Warranty claims">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Claims</p>
                    <span className="text-[10px] text-muted-foreground">{claims.length} recorded</span>
                  </div>
                  {post?.warrantyState !== "active" && (
                    <p className="mt-1 text-[11px] text-muted-foreground">A claim can only be opened while the warranty is active.</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input aria-label="Claim summary" placeholder="Short summary (what failed)" value={claimSummary} onChange={(e) => setClaimSummary(e.target.value)} className={`${inputCls} w-64`} />
                    <Input aria-label="Claim details" placeholder="Details for the workshop" value={claimDetails} onChange={(e) => setClaimDetails(e.target.value)} className={`${inputCls} min-w-[220px] flex-1`} />
                    <Button
                      size="sm"
                      aria-label="Open warranty claim"
                      className="h-8 gap-1.5 bg-hon-green text-xs font-bold text-white hover:bg-hon-green/90"
                      disabled={postBusy || post?.warrantyState !== "active"}
                      onClick={() => void openClaim()}
                    >
                      {postBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Open claim
                    </Button>
                  </div>
                  {claims.length > 0 && (
                    <ul className="mt-2 space-y-2 border-t border-border pt-2">
                      {claims.map((claim) => (
                        <li key={claim.id} className="rounded-lg border border-border p-2 text-[11px]" aria-label={`Claim ${claim.summary}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${claim.status === "resolved" ? "border-emerald-200 bg-emerald-100 text-emerald-800" : claim.status === "rejected" ? "border-rose-200 bg-rose-100 text-rose-800" : claim.status === "scheduled" ? "border-sky-200 bg-sky-100 text-sky-800" : "border-amber-300 bg-amber-100 text-amber-900"}`}>{claim.status}</span>
                            <span className="font-semibold text-foreground">{claim.summary}</span>
                            <span className="text-muted-foreground">opened {claim.openedOn}{claim.openedBy ? ` by ${claim.openedBy}` : ""}</span>
                            {claim.dueOn && (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${claim.status !== "open" && claim.status !== "scheduled" ? "border-border text-muted-foreground" : claim.dueOn < todayIso() ? "border-rose-200 bg-rose-100 text-rose-800" : "border-slate-200 bg-slate-100 text-slate-700"}`} title="Promised by the warranty SLA">
                                {claim.status !== "open" && claim.status !== "scheduled" ? "due" : claim.dueOn < todayIso() ? "overdue" : "due"} {claim.dueOn}
                              </span>
                            )}
                            {claim.assignedTo && <span className="text-muted-foreground">owner {seatEmail(claim.assignedTo)}</span>}
                            {claim.cost > 0 && <span className="font-medium text-foreground">{formatPKR(claim.cost)}{claim.resolutionKind ? ` · ${claim.resolutionKind}` : ""}</span>}
                          </div>
                          {claim.details && <p className="mt-1 text-muted-foreground">{claim.details}</p>}
                          {claim.resolution && <p className="mt-1 font-medium text-foreground">Resolution: {claim.resolution}</p>}
                          {(claim.status === "open" || claim.status === "scheduled") && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <Input
                                aria-label={`Claim resolution for ${claim.summary}`}
                                placeholder="Resolution note (required to resolve/reject)"
                                value={claimResolutions[claim.id] ?? ""}
                                onChange={(e) => setClaimResolutions((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                                className={`${inputCls} w-56`}
                              />
                              {seats.length > 0 && (
                                <Select value={claim.assignedTo ?? ""} onValueChange={(v) => void assignClaim(claim, v)}>
                                  <SelectTrigger aria-label={`Claim owner for ${claim.summary}`} className="h-7 w-44 text-[11px]">
                                    <SelectValue placeholder="Assign owner" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {seats.map((seat) => (
                                      <SelectItem key={seat.userId} value={seat.userId} className="text-[11px]">
                                        {seat.name || seat.email} · {seat.role}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {claim.status === "open" && (
                                <Button size="sm" variant="outline" className="h-7 text-[11px] font-bold" aria-label={`Schedule claim ${claim.summary}`} disabled={postBusy} onClick={() => void moveClaim(claim, "scheduled")}>Schedule</Button>
                              )}
                              <Select
                                value={claimKinds[claim.id] ?? ""}
                                onValueChange={(v) => {
                                  setClaimKinds((prev) => ({ ...prev, [claim.id]: v as ProjectWarrantyResolutionKind }));
                                  if (v === "replacement") void ensureCatalogue();
                                }}
                              >
                                <SelectTrigger aria-label={`Settlement kind for ${claim.summary}`} className="h-7 w-32 text-[11px]">
                                  <SelectValue placeholder="Kind" />
                                </SelectTrigger>
                                <SelectContent>
                                  {(["repair", "replacement", "refund", "goodwill", "none"] as ProjectWarrantyResolutionKind[]).map((k) => (
                                    <SelectItem key={k} value={k} className="text-[11px]">{k}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                aria-label={`Claim cost for ${claim.summary}`}
                                placeholder="Cost (PKR)"
                                inputMode="decimal"
                                value={claimCosts[claim.id] ?? ""}
                                onChange={(e) => setClaimCosts((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                                className={`${inputCls} w-24`}
                              />
                              {claimKinds[claim.id] === "replacement" && (
                                <>
                                  <Select
                                    value={claimReplaceProduct[claim.id] ?? ""}
                                    onValueChange={(v) => setClaimReplaceProduct((prev) => ({ ...prev, [claim.id]: v }))}
                                  >
                                    <SelectTrigger aria-label={`Replacement product for ${claim.summary}`} className="h-7 w-40 text-[11px]">
                                      <SelectValue placeholder="Product" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(catalogue ?? []).map((prod) => (
                                        <SelectItem key={prod.id} value={prod.id} className="text-[11px]">
                                          {prod.name} · {prod.stock} left
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    aria-label={`Replacement quantity for ${claim.summary}`}
                                    placeholder="Qty"
                                    inputMode="numeric"
                                    value={claimReplaceQty[claim.id] ?? ""}
                                    onChange={(e) => setClaimReplaceQty((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                                    className={`${inputCls} w-16`}
                                  />
                                </>
                              )}
                              <Button size="sm" variant="outline" className="h-7 text-[11px] font-bold" aria-label={`Resolve claim ${claim.summary}`} disabled={postBusy} onClick={() => void moveClaim(claim, "resolved")}>Resolve</Button>
                              <Button size="sm" variant="outline" className="h-7 text-[11px] font-bold text-destructive" aria-label={`Reject claim ${claim.summary}`} disabled={postBusy} onClick={() => void moveClaim(claim, "rejected")}>Reject</Button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </TabsContent>

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
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><Box className="h-4 w-4" /> Shop floor — {prodPct}% recorded progress · QC UI check</p>
              </div>
              <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-hon-green transition-all" style={{ width: `${prodPct}%` }} /></div>
              {repairNotice && (
                <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-900">
                  Some stored production values were incomplete or invalid and were filled with blanks so the job could open. Save the workspace to write a complete record.
                </p>
              )}
              <div role="status" className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold ${qcPassed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : prod.qc.result === "failed" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
                {qcPassed ? <><Ruler className="h-4 w-4 shrink-0" /> QC marked passed — dispatch fields unlocked in this interface. Verify approval before dispatch.</> : <><FilePenLine className="h-4 w-4 shrink-0" /> Dispatch blocked — QC is {prod.qc.result === "failed" ? "FAILED" : "pending"}. Record a passing QC inspection before dispatch leaves the yard. Saving with dispatch data filled is refused while QC is not passed.</>}
              </div>
              <ul className="space-y-2">
                {PROJECT_PRODUCTION_STAGES.map((stage) => {
                  const row = prod.stages.find((s) => s.stage === stage);
                  const pct = row?.pct ?? 0;
                  const done = pct >= 100;
                  const dispatchLocked = stage === "dispatch" && !qcPassed;
                  return (
                    <li key={stage} className="grid grid-cols-12 items-center gap-2 rounded-xl border border-border bg-card p-2">
                      <span className="col-span-2 text-[11px] font-bold text-foreground">{PROJECT_PRODUCTION_STAGE_LABELS[stage]}</span>
                      <Input aria-label={`${PROJECT_PRODUCTION_STAGE_LABELS[stage]} note`} placeholder="Note — e.g. CNC slot booked" value={row?.note ?? ""} onChange={(e) => setStage(stage, { note: e.target.value })} className={`${inputCls} col-span-5`} />
                      <Input aria-label={`${PROJECT_PRODUCTION_STAGE_LABELS[stage]} percent`} type="number" min={0} max={100} step={5} value={pct} disabled={dispatchLocked} onChange={(e) => setStage(stage, { pct: Number(e.target.value) })} className={`${inputCls} col-span-2 disabled:cursor-not-allowed disabled:opacity-50`} title={dispatchLocked ? "Locked — QC must pass before the dispatch stage can advance" : undefined} />
                      <span className="col-span-3 flex justify-end"><span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${done ? "border-emerald-200 bg-emerald-100 text-emerald-800" : pct > 0 ? "border-sky-200 bg-sky-100 text-sky-800" : "border-slate-200 bg-slate-100 text-slate-700"}`}>{done ? "Done" : pct > 0 ? `In progress · ${pct}%` : "Pending"}</span></span>
                    </li>
                  );
                })}
              </ul>

              {/* QC record — the result comes from recorded inspections, not a typed field */}
              <div className="mt-4 rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">QC gate</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      aria-label="Recorded QC result"
                      className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${qcPassed ? "border-emerald-200 bg-emerald-100 text-emerald-800" : prod.qc.result === "failed" ? "border-rose-200 bg-rose-100 text-rose-800" : "border-amber-300 bg-amber-100 text-amber-900"}`}
                    >
                      {prod.qc.result}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {prod.qc.inspectedBy ? `by ${prod.qc.inspectedBy} · ${prod.qc.inspectedAt}` : "No inspection recorded yet"}
                    </span>
                  </div>
                </div>
                {prod.qc.defectNote && <p className="mt-1 text-[11px] font-medium text-rose-700">Defect note: {prod.qc.defectNote}</p>}
                {selfEdited && (
                  <p role="status" className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-900">
                    You last changed the production stages, so you cannot record the pass yourself. Someone else with project access has to inspect this job
                    {isSupabaseMode ? "." : " — in this demo, sign in with the second demo account."}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Select value={inspectionResult} onValueChange={(v) => setInspectionResult(v as "passed" | "failed")}>
                    <SelectTrigger className="h-8 w-28 border px-2 text-[11px] font-semibold" aria-label="QC inspection result"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passed" className="text-[11px]">Passed</SelectItem>
                      <SelectItem value="failed" className="text-[11px]">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label="QC inspection notes"
                    placeholder="Inspection notes (defects, rework, sign-off reference)"
                    value={inspectionNotes}
                    onChange={(e) => setInspectionNotes(e.target.value)}
                    className={`${inputCls} min-w-[200px] flex-1`}
                  />
                  <Button
                    size="sm"
                    aria-label="Record QC inspection"
                    className="h-8 gap-1.5 bg-hon-green text-xs font-bold text-white hover:bg-hon-green/90"
                    disabled={recording || saving || (selfEdited && inspectionResult === "passed")}
                    title={selfEdited && inspectionResult === "passed" ? "Another person must record the pass" : undefined}
                    onClick={() => void recordInspection()}
                  >
                    {recording ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ruler className="h-3.5 w-3.5" />} {recording ? "Recording…" : "Record inspection"}
                  </Button>
                </div>
                {inspections.length > 0 && (
                  <ul aria-label="QC inspection history" className="mt-2 space-y-1 border-t border-border pt-2">
                    {inspections.slice(0, 3).map((i) => (
                      <li key={i.id} className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span className={`font-bold uppercase tracking-widest ${i.result === "passed" ? "text-emerald-700" : "text-rose-700"}`}>{i.result}</span>
                        <span>{new Date(i.createdAt).toLocaleDateString()} · {i.inspectedByEmail || "unknown staff"}</span>
                        {i.notes && <span className="truncate">— {i.notes}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  The QC result is derived from recorded inspections{isSupabaseMode ? " on the server" : " in this demo store"}. Dispatch inputs stay locked and saving dispatch data is refused until a pass is recorded. Separation of duties is enforced: the person who last changed the production stages cannot record the pass, though they may record a failure.{isSupabaseMode ? " Only an owner may sign a job off — anyone else recording a pass is refused by the database." : ""}
                </p>
              </div>

              {/* dispatch */}
              <div className="mt-3 rounded-xl border border-border bg-card p-3">
                <p className="pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dispatch</p>
                <fieldset disabled={!qcPassed} className="grid grid-cols-2 gap-2 sm:grid-cols-6 disabled:opacity-60" aria-label="Dispatch details">
                  <Input aria-label="Dispatch date" type="date" value={prod.dispatch.date} onChange={(e) => setDispatch({ date: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-1`} />
                  <Input aria-label="Vehicle" placeholder={qcPassed ? "Vehicle" : "Locked — QC first"} value={prod.dispatch.vehicle} onChange={(e) => setDispatch({ vehicle: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-1`} />
                  <Input aria-label="Driver" placeholder={qcPassed ? "Driver" : "Locked — QC first"} value={prod.dispatch.driver} onChange={(e) => setDispatch({ driver: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-1`} />
                  <Input aria-label="Driver phone" placeholder={qcPassed ? "Driver phone" : "Locked — QC first"} value={prod.dispatch.driverPhone} onChange={(e) => setDispatch({ driverPhone: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-1`} />
                  <Input aria-label="Challan ref" placeholder={qcPassed ? "Challan ref" : "Locked — QC first"} value={prod.dispatch.challanRef} onChange={(e) => setDispatch({ challanRef: e.target.value })} className={`${inputCls} col-span-2 sm:col-span-2`} />
                </fieldset>
                {!qcPassed && dispatchHasData && (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    This job still has dispatch details on the draft. Clear them to save while QC is not passed.
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" aria-label="Clear dispatch details" onClick={clearDispatch}>Clear dispatch details</Button>
                  </p>
                )}
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
                      <Button size="sm" className="h-8 gap-1.5 bg-hon-green text-xs font-bold text-white hover:bg-hon-green/90" disabled={uploading || saving} onClick={() => fileInputRef.current?.click()}>{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />} {uploading ? "Uploading…" : "Upload file"}</Button>
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
                        <span className="flex shrink-0 items-center gap-1">
                          {isSupabaseMode && f.storagePath && (
                            <button type="button" aria-label={`Download ${f.name}`} title="Download (signed URL, 2 min)" onClick={() => void downloadFile(f)} disabled={downloadingId === f.id} className="rounded p-1 text-muted-foreground transition-colors hover:text-hon-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hon-green disabled:opacity-50"><Download className="h-4 w-4" /></button>
                          )}
                          <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeFile(f.id)} className="rounded p-1 text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                        </span>
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
            <Button variant="outline" onClick={requestClose}>Close</Button>
            <Button onClick={save} disabled={saving || uploading || recording || !dirty} className="gap-1.5">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? "Saving…" : "Save workspace"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
