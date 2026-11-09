import {
  PROJECT_PRODUCTION_STAGES,
  type ProjectBoqRow,
  type ProjectDispatch,
  type ProjectFileItem,
  type ProjectMilestone,
  type ProjectMilestoneStatus,
  type ProjectPractice,
  type ProjectProduction,
  type ProjectProductionStage,
  type ProjectProductionStageKey,
  type ProjectQc,
  type ProjectQcResult,
} from "@/api/types";

/**
 * Defensive normalisation for the practice workspace payload.
 *
 * Production data lives inside `projects.payload`, which can contain rows
 * written by older clients, imports or partial API calls. A missing `stages`
 * array or `dispatch` object used to crash the Production tab (`.map` of
 * undefined). This helper never invents business progress: it fills only the
 * structural blanks with zero/empty values and reports whether it had to.
 */

const QC_RESULTS: readonly ProjectQcResult[] = ["pending", "passed", "failed"];
const asText = (v: unknown): string => (typeof v === "string" ? v : "");
const asObject = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const isStageKey = (v: unknown): v is ProjectProductionStageKey =>
  typeof v === "string" && (PROJECT_PRODUCTION_STAGES as readonly string[]).includes(v);

const stageId = (stage: ProjectProductionStageKey) => `prod-${stage}`;

function defaultDispatch(): ProjectDispatch {
  return { date: "", vehicle: "", driver: "", driverPhone: "", challanRef: "" };
}
function defaultQc(): ProjectQc {
  return { result: "pending", defectNote: "", inspectedBy: "", inspectedAt: "" };
}

export interface NormalizedProduction {
  production: ProjectProduction;
  /** True when the stored value was missing/invalid and blanks had to be filled. */
  repaired: boolean;
}

export function normalizeProduction(value: unknown): NormalizedProduction {
  let repaired = false;
  const source = asObject(value);
  if (!source) return { production: { stages: PROJECT_PRODUCTION_STAGES.map((stage) => ({ id: stageId(stage), stage, pct: 0, note: "" })), qc: defaultQc(), dispatch: defaultDispatch() }, repaired: value != null };

  // ── stages ────────────────────────────────────────────────────────────────
  const rawStages = source.stages;
  if (!Array.isArray(rawStages)) repaired = true;
  const seen = new Map<ProjectProductionStageKey, ProjectProductionStage>();
  for (const entry of Array.isArray(rawStages) ? rawStages : []) {
    const row = asObject(entry);
    if (!row || !isStageKey(row.stage)) { repaired = true; continue; }
    const stage = row.stage;
    if (seen.has(stage)) { repaired = true; continue; }
    const pct = typeof row.pct === "number" && Number.isFinite(row.pct) ? Math.round(Math.min(100, Math.max(0, row.pct))) : 0;
    if (typeof row.pct !== "number" || !Number.isFinite(row.pct)) repaired = true;
    if (pct !== row.pct) repaired = true;
    const note = asText(row.note);
    if (note !== row.note) repaired = true;
    seen.set(stage, { id: asText(row.id) || stageId(stage), stage, pct, note });
  }
  if (seen.size !== PROJECT_PRODUCTION_STAGES.length) repaired = true;
  const stages = PROJECT_PRODUCTION_STAGES.map((stage) => seen.get(stage) ?? { id: stageId(stage), stage, pct: 0, note: "" });

  // ── QC ────────────────────────────────────────────────────────────────────
  const rawQc = asObject(source.qc);
  if (!rawQc) repaired = true;
  const qcResult = rawQc && QC_RESULTS.includes(rawQc.result as ProjectQcResult) ? (rawQc.result as ProjectQcResult) : "pending";
  if (qcResult !== (rawQc?.result ?? undefined)) repaired = true;
  const qc: ProjectQc = {
    result: qcResult,
    defectNote: asText(rawQc?.defectNote),
    inspectedBy: asText(rawQc?.inspectedBy),
    inspectedAt: asText(rawQc?.inspectedAt),
  };

  // ── dispatch ──────────────────────────────────────────────────────────────
  const rawDispatch = asObject(source.dispatch);
  if (!rawDispatch) repaired = true;
  const dispatch: ProjectDispatch = {
    date: asText(rawDispatch?.date),
    vehicle: asText(rawDispatch?.vehicle),
    driver: asText(rawDispatch?.driver),
    driverPhone: asText(rawDispatch?.driverPhone),
    challanRef: asText(rawDispatch?.challanRef),
  };

  return { production: { stages, qc, dispatch }, repaired };
}

const MILESTONE_STATUSES: readonly ProjectMilestoneStatus[] = ["not_started", "in_progress", "blocked", "done"];

function normalizeBoq(value: unknown): ProjectBoqRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const row = asObject(entry);
    if (!row) return [];
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return [{
      id: asText(row.id) || `boq-${index}`,
      section: asText(row.section),
      item: asText(row.item),
      qty: num(row.qty),
      unit: asText(row.unit),
      rate: num(row.rate),
    }];
  });
}
function normalizeMilestones(value: unknown): ProjectMilestone[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const row = asObject(entry);
    if (!row) return [];
    const status = MILESTONE_STATUSES.includes(row.status as ProjectMilestoneStatus) ? (row.status as ProjectMilestoneStatus) : "not_started";
    return [{
      id: asText(row.id) || `ms-${index}`,
      phase: asText(row.phase),
      owner: asText(row.owner),
      ...(asText(row.due) ? { due: asText(row.due) } : {}),
      status,
    }];
  });
}
function normalizeFiles(value: unknown): ProjectFileItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const row = asObject(entry);
    if (!row) return [];
    const kind = ["drawing", "image", "document", "model"].includes(String(row.kind)) ? (row.kind as ProjectFileItem["kind"]) : "document";
    return [{
      id: asText(row.id) || `file-${index}`,
      name: asText(row.name),
      size: typeof row.size === "number" && Number.isFinite(row.size) ? row.size : 0,
      kind,
      uploadedBy: asText(row.uploadedBy),
      uploadedAt: asText(row.uploadedAt),
      ...(asText(row.storagePath) ? { storagePath: asText(row.storagePath) } : {}),
    }];
  });
}

export interface NormalizedPractice {
  practice: ProjectPractice;
  repaired: boolean;
}

/** Normalises the whole practice payload; `repaired` covers structural repairs only. */
export function normalizePractice(value: unknown): NormalizedPractice {
  const source = asObject(value);
  const { production, repaired: productionRepaired } = normalizeProduction(source?.production);
  const practice: ProjectPractice = {
    boq: normalizeBoq(source?.boq),
    milestones: normalizeMilestones(source?.milestones),
    files: normalizeFiles(source?.files),
    production,
  };
  return { practice, repaired: productionRepaired };
}

/** Plain deep copy of an already-normalised practice payload. */
export function clonePractice(p: ProjectPractice): ProjectPractice {
  return {
    boq: p.boq.map((r) => ({ ...r })),
    milestones: p.milestones.map((m) => ({ ...m })),
    files: p.files.map((f) => ({ ...f })),
    production: {
      stages: p.production?.stages.map((s) => ({ ...s })) ?? normalizeProduction(undefined).production.stages,
      qc: { ...(p.production?.qc ?? defaultQc()) },
      dispatch: { ...(p.production?.dispatch ?? defaultDispatch()) },
    },
  };
}
