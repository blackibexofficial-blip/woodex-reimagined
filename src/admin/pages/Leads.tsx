import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2, ClipboardList, ChevronLeft, ChevronRight, Mail, Phone, FileText, Handshake, ScrollText, Loader2, ShieldCheck, ShieldAlert,
  Columns3, LayoutList, CalendarRange, GripVertical, MapPin, Inbox, UserRound, SlidersHorizontal, Download, Save,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminLead, AdminLeadPatch, AdminSiteVisit, LeadSource, LeadStatus, LeadType, SiteVisitStatus } from "@/api/types";
import { DEFAULT_TEAM, teamInitials } from "@/lib/team";
import { toCsv, downloadCsv } from "@/lib/csv";
import { Textarea } from "@/components/ui/textarea";
import { formatPKR, timeAgo, LeadStatusBadge, SectionCard, SectionSkeleton, EmptyState, leadStatusLabel } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const LEAD_SOURCES: Array<{ value: LeadSource; label: string }> = [
  { value: "furniture", label: "Furniture" },
  { value: "interior", label: "Interior" },
  { value: "project", label: "Project" },
  { value: "website", label: "Website" },
  { value: "storefront_chat", label: "Storefront chat" },
  { value: "referral", label: "Referral" },
];
const leadSourceLabel = (v?: LeadSource) => LEAD_SOURCES.find((s) => s.value === v)?.label ?? v;
const STALE_MS = 7 * 86400000;
const isStale = (l: AdminLead) => l.status !== "won" && l.status !== "lost" && Date.now() - new Date(l.lastContact ?? l.createdAt).getTime() > STALE_MS;
const toLocalInput = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const PER_PAGE = 10;
type TypeFilter = LeadType | "all";
type StatusFilter = LeadStatus | "all";
const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "meeting", "not_responding", "quoted", "won", "lost"];
const VISIT_STATUSES: SiteVisitStatus[] = ["Scheduled", "Completed", "No-show", "Cancelled"];
const COLUMN_TONE: Record<LeadStatus, string> = {
  new: "border-sky-200 bg-sky-50",
  contacted: "border-amber-200 bg-amber-50",
  meeting: "border-cyan-200 bg-cyan-50",
  not_responding: "border-stone-200 bg-stone-50",
  quoted: "border-violet-200 bg-violet-50",
  won: "border-emerald-200 bg-emerald-50",
  lost: "border-rose-200 bg-rose-50",
};
const COLUMN_DOT: Record<LeadStatus, string> = {
  new: "bg-sky-500",
  contacted: "bg-amber-500",
  meeting: "bg-cyan-500",
  not_responding: "bg-stone-400",
  quoted: "bg-violet-500",
  won: "bg-emerald-500",
  lost: "bg-rose-500",
};

export default function AdminLeads() {
  const api = useMemo(() => getAdminApi(), []);
  const navigate = useNavigate();
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"table" | "board">("table");
  const [lens, setLens] = useState<"all" | "mine" | "unassigned" | "stale">("all");
  const [mineName, setMineName] = useState<string>(() => (typeof window !== "undefined" && window.localStorage.getItem("woodex.admin.me")) || DEFAULT_TEAM[0]);
  const [team, setTeam] = useState<string[]>(DEFAULT_TEAM);
  const [exporting, setExporting] = useState(false);
  /* lead details dialog */
  const [detailsLead, setDetailsLead] = useState<AdminLead | null>(null);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [form, setForm] = useState({ assignedTo: "", leadSource: "" as LeadSource | "", quotationRef: "", lastContact: "", meetingAt: "", nextAction: "", note: "" });
  const dragId = useRef<string | null>(null);

  /* site visits state */
  const [visitLead, setVisitLead] = useState<AdminLead | null>(null);
  const [visits, setVisits] = useState<AdminSiteVisit[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitSaving, setVisitSaving] = useState(false);
  const [visitAt, setVisitAt] = useState("");
  const [visitAddress, setVisitAddress] = useState("");
  const [visitNotes, setVisitNotes] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const isBoard = view === "board";
  useEffect(() => {
    api.getSettings().then((s) => { if (Array.isArray(s.team) && s.team.length) setTeam(s.team); }).catch(() => {});
  }, [api]);

  const lensParams = useMemo(
    () => (lens === "mine" ? { assignee: mineName } : lens === "unassigned" ? { unassigned: true as const } : lens === "stale" ? { staleDays: 7 } : {}),
    [lens, mineName],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listLeads(
        isBoard
          ? { type, status: "all", query: debounced || undefined, page: 1, perPage: 100, ...lensParams }
          : { type, status, query: debounced || undefined, page, perPage: PER_PAGE, ...lensParams },
      );
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
      toast.error("Could not load leads.");
    } finally {
      setLoading(false);
    }
  }, [api, type, status, debounced, page, isBoard, lensParams]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [type, status, debounced, view, lens, mineName]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const createQuote = async (lead: AdminLead) => {
    setQuotingId(lead.id);
    try {
      const quote = await api.createQuoteFromLead(lead.id);
      if (quote) {
        toast.success(`${quote.id} drafted from ${lead.name} — add lines, discount and validity in Quotes.`);
        navigate("/admin/quotes");
      } else {
        toast.error("Could not create the quote — lead not found?");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the quote.");
    } finally {
      setQuotingId(null);
    }
  };

  /** Optimistic status move with rollback — powers both the row selector and board drag-and-drop. */
  const moveLead = async (lead: AdminLead, next: LeadStatus) => {
    if (lead.status === next) return;
    setRows((rs) => rs.map((r) => (r.id === lead.id ? { ...r, status: next } : r)));
    try {
      const updated = await api.updateLeadStatus(lead.id, next);
      if (updated) {
        setRows((rs) => rs.map((r) => (r.id === updated.id ? { ...r, status: updated.status } : r)));
        toast.success(`Lead ${lead.name} → ${next}`);
      } else {
        setRows((rs) => rs.map((r) => (r.id === lead.id ? { ...r, status: lead.status } : r)));
        toast.error("Status update failed — live Bagisto has no leads table yet (see docs).");
      }
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === lead.id ? { ...r, status: lead.status } : r)));
      toast.error(e instanceof Error ? e.message : "Status update failed.");
    }
  };

  const openVisits = async (lead: AdminLead) => {
    setVisitLead(lead);
    setVisits([]);
    setVisitAt("");
    setVisitAddress(lead.city ? `${lead.city} — paste the full site address` : "");
    setVisitNotes("");
    setVisitsLoading(true);
    try {
      setVisits(await api.listSiteVisits(lead.id));
    } catch {
      toast.error("Could not load site visits.");
    } finally {
      setVisitsLoading(false);
    }
  };

  const submitVisit = async () => {
    if (!visitLead) return;
    if (!visitAt) return toast.error("Pick a date and time.");
    if (!visitAddress.trim()) return toast.error("Address is required.");
    setVisitSaving(true);
    try {
      const v = await api.createSiteVisit({ leadId: visitLead.id, scheduledAt: new Date(visitAt).toISOString(), address: visitAddress.trim(), notes: visitNotes.trim() || undefined });
      setVisits((prev) => [...prev, v].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
      setVisitAt(""); setVisitNotes("");
      toast.success("Site visit scheduled.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule the visit.");
    } finally {
      setVisitSaving(false);
    }
  };

  const patchVisit = async (visit: AdminSiteVisit, patch: { status?: SiteVisitStatus; outcome?: string }) => {
    try {
      const updated = await api.updateSiteVisitStatus(visit.id, patch);
      if (updated) {
        setVisits((prev) => prev.map((v) => (v.id === visit.id ? updated : v)));
      } else {
        toast.error("Visit not found.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the visit.");
    }
  };

  const board = useMemo(() => {
    const cols = new Map<LeadStatus, AdminLead[]>(LEAD_STATUSES.map((s) => [s, [] as AdminLead[]]));
    for (const r of rows) {
      const col = cols.get(r.status);
      if (col) col.push(r);
    }
    return cols;
  }, [rows]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await api.listLeads({ type, status, query: debounced || undefined, page: 1, perPage: 500, ...lensParams });
      const isoDay = (v?: string) => (v ? new Date(v).toLocaleDateString("en-GB") : "");
      const isoDT = (v?: string) => (v ? new Date(v).toLocaleString("en-GB") : "");
      const rows = res.items.map((l) => [
        l.id, isoDay(l.createdAt), l.type, l.company ?? "", l.name, l.email, l.phone, l.city ?? "",
        l.value ? String(l.value) : "", leadSourceLabel(l.leadSource) ?? "", l.status, l.assignedTo ?? "",
        l.quotationRef ?? "", isoDay(l.lastContact), l.nextAction ?? "", isoDT(l.meetingAt), l.note ?? "",
      ]);
      downloadCsv(`woodex-leads-${lens}.csv`, toCsv(
        ["ID", "Date", "Type", "Company", "Name", "Email", "Phone", "City", "Value (PKR)", "Source", "Status", "Assigned to", "Quotation", "Last contact", "Next action", "Meeting", "Note"],
        rows,
      ));
      toast.success(`${rows.length} lead(s) exported — opens in Sheets or Excel.`);
    } catch (e) {
      console.error(e);
      toast.error("Export failed — please try again.");
    } finally {
      setExporting(false);
    }
  };

  const openDetails = (lead: AdminLead) => {
    setDetailsLead(lead);
    setForm({
      assignedTo: lead.assignedTo ?? "",
      leadSource: lead.leadSource ?? "",
      quotationRef: lead.quotationRef ?? "",
      lastContact: toLocalInput(lead.lastContact),
      meetingAt: toLocalInput(lead.meetingAt),
      nextAction: lead.nextAction ?? "",
      note: lead.note ?? "",
    });
  };
  const saveDetails = async () => {
    if (!detailsLead) return;
    setDetailsSaving(true);
    try {
      const patch: AdminLeadPatch = {
        assignedTo: form.assignedTo,
        leadSource: form.leadSource,
        quotationRef: form.quotationRef,
        lastContact: form.lastContact ? new Date(form.lastContact).toISOString() : "",
        meetingAt: form.meetingAt ? new Date(form.meetingAt).toISOString() : "",
        nextAction: form.nextAction,
        note: form.note,
      };
      const updated = await api.updateLead(detailsLead.id, patch);
      if (!updated) { toast.error("Lead not found."); return; }
      setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(`Details saved for ${updated.name}.`);
      setDetailsLead(null);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not save the lead.");
    } finally {
      setDetailsSaving(false);
    }
  };
  const stampContacted = async () => {
    if (!detailsLead) return;
    const now = new Date().toISOString();
    try {
      const updated = await api.updateLead(detailsLead.id, { lastContact: now });
      if (updated) {
        setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
        setDetailsLead(updated);
        setForm((f) => ({ ...f, lastContact: toLocalInput(now) }));
        toast.success("Last contact stamped — now.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not stamp the contact.");
    }
  };

  const contactButtons = (lead: AdminLead) => (
    <div className="mt-1.5 flex gap-1.5">
      <button onClick={() => openDetails(lead)} title="Lead details — assignee, source, follow-ups" aria-label={`Details for ${lead.name}`} className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground">
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </button>
      <a href={`tel:${lead.phone.replace(/\s/g, "")}`} title={lead.phone} aria-label="Call" className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"><Phone className="h-3.5 w-3.5" /></a>
      <a href={`mailto:${lead.email}`} title={lead.email} aria-label="Email" className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"><Mail className="h-3.5 w-3.5" /></a>
      <button onClick={() => createQuote(lead)} disabled={quotingId === lead.id} title="Draft priced quotation from this lead" aria-label={`Create quote from ${lead.name}`} className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground disabled:opacity-50">
        {quotingId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScrollText className="h-3.5 w-3.5" />}
      </button>
      <button onClick={() => openVisits(lead)} title="Site visits" aria-label={`Site visits for ${lead.name}`} className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground">
        <CalendarRange className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" value={type} onValueChange={(v) => v && setType(v as TypeFilter)} aria-label="Filter lead types" className="h-10 rounded-md bg-muted p-1">
              <ToggleGroupItem value="all" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">All leads</ToggleGroupItem>
              <ToggleGroupItem value="quote" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"><FileText className="mr-1.5 h-3.5 w-3.5" />Quotes</ToggleGroupItem>
              <ToggleGroupItem value="b2b" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"><Handshake className="mr-1.5 h-3.5 w-3.5" />B2B</ToggleGroupItem>
            </ToggleGroup>
          {!isBoard && (
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger className="w-40 bg-white" aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{leadStatusLabel(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {/* view toggle */}
          <div className="inline-flex rounded-lg border border-border bg-white p-0.5" role="group" aria-label="Leads view">
            <button type="button" onClick={() => setView("table")} aria-pressed={view === "table"} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${view === "table" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}><LayoutList className="h-3.5 w-3.5" /> Table</button>
            <button type="button" onClick={() => setView("board")} aria-pressed={view === "board"} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${view === "board" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}><Columns3 className="h-3.5 w-3.5" /> Board</button>
          </div>
          {/* lens chips — Mine / Unassigned / Stale > 7d */}
          <ToggleGroup type="single" value={lens} onValueChange={(v) => v && setLens(v as typeof lens)} aria-label="Lead lens" className="h-10 rounded-md bg-muted p-1">
            <ToggleGroupItem value="all" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">All</ToggleGroupItem>
            <ToggleGroupItem value="mine" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Mine</ToggleGroupItem>
            <ToggleGroupItem value="unassigned" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Unassigned</ToggleGroupItem>
            <ToggleGroupItem value="stale" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm" title="Last touch more than 7 days ago (won/lost excluded)">Stale &gt; 7d</ToggleGroupItem>
          </ToggleGroup>
          {lens === "mine" && (
            <Select value={mineName} onValueChange={(v) => { setMineName(v); window.localStorage.setItem("woodex.admin.me", v); }}>
              <SelectTrigger className="w-36 bg-white" aria-label="Which assignee am I?"><SelectValue placeholder="Who am I?" /></SelectTrigger>
              <SelectContent>{team.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting} className="whitespace-nowrap">
            {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />} Export CSV
          </Button>
          <Input placeholder="Search name, company, summary…" value={query} onChange={(e) => setQuery(e.target.value)} className="lg:max-w-xs bg-white" />
        </div>
      </div>

      {isBoard ? (
        /* ── kanban board ─────────────────────────────────────────────── */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
          {LEAD_STATUSES.map((colStatus) => {
            const members = board.get(colStatus) ?? [];
            return (
              <div
                key={colStatus}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const lead = rows.find((r) => r.id === dragId.current);
                  if (lead) moveLead(lead, colStatus);
                  dragId.current = null;
                }}
                className={`rounded-xl border ${COLUMN_TONE[colStatus]} p-2 transition`}
                aria-label={`Column ${colStatus}`}
              >
                <p className="flex items-center justify-between gap-2 px-1.5 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${COLUMN_DOT[colStatus]}`} />{leadStatusLabel(colStatus)}</span>
                  <span className="rounded-full border border-border bg-white px-1.5 py-0.5 font-mono">{members.length}</span>
                </p>
                <ul className="space-y-2">
                  {loading ? <li className="h-20 animate-pulse rounded-lg bg-white/60" /> : members.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-border/80 py-6 text-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground">drop leads here</li>
                  ) : members.map((lead) => (
                    <li
                      key={lead.id}
                      draggable
                      onDragStart={() => { dragId.current = lead.id; }}
                      onDragEnd={() => { dragId.current = null; }}
                      className="cursor-grab rounded-lg border border-border bg-white p-2.5 shadow-sm transition hover:border-hon-green active:cursor-grabbing"
                      aria-label={`${lead.name} — drag to move stage, or use actions`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-foreground">{lead.name}</p>
                          {lead.company && <p className="truncate text-[10px] text-violet-700">{lead.company}</p>}
                        </div>
                        <GripVertical className="h-4 w-4 shrink-0 text-border" aria-hidden="true" />
                      </div>
                      <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-[10px] leading-4 text-muted-foreground" title={lead.summary}>{lead.summary}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-foreground">{lead.value ? formatPKR(lead.value) : "—"}</span>
                        <span className="text-[9px] text-muted-foreground">{timeAgo(lead.createdAt)}</span>
                      </div>
                      {contactButtons(lead)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── table list (existing) ─────────────────────────────────────── */
        <SectionCard title={`${total} lead${total === 1 ? "" : "s"}`}>
          {loading ? (
            <SectionSkeleton rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No leads found" hint="Quote requests and B2B enquiries from the storefront will appear here." />
          ) : (
            <>
              <ul className="-mx-5 -mb-5 divide-y divide-muted">
                {rows.map((lead) => (
                  <li key={lead.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-secondary lg:flex-row lg:items-center lg:gap-6">
                    {/* identity */}
                    <div className="flex w-64 shrink-0 items-start gap-2.5">
                      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${lead.type === "b2b" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"}`}>
                        {lead.type === "b2b" ? <Building2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{lead.name}</p>
                        {lead.company && <p className="truncate text-[11px] font-medium text-violet-700">{lead.company}</p>}
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {lead.assignedTo ? (
                            <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-[8px] font-bold text-foreground">{teamInitials(lead.assignedTo)}</span>{lead.assignedTo}</span>
                          ) : (
                            <span className="italic text-muted-foreground">Unassigned</span>
                          )}
                          {lead.leadSource && <span className="text-muted-foreground">· {leadSourceLabel(lead.leadSource)}</span>}
                          {isStale(lead) && <span aria-hidden className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" title="No contact in 7+ days" />}
                        </p>
                        {contactButtons(lead)}
                      </div>
                    </div>

                    {/* requirement */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-5 text-muted-foreground line-clamp-2" title={lead.summary}>{lead.summary}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                        {lead.consent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-hon-green-pale px-2 py-0.5 font-semibold text-hon-green-dark" title={lead.consentAt ? `Consent recorded ${new Date(lead.consentAt).toLocaleString("en-GB")}` : "Consent recorded"}>
                            <ShieldCheck className="h-3 w-3" aria-hidden="true" /> consented{lead.consentVersion ? ` · ${lead.consentVersion}` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900" title="Lead predates consent capture, or was captured outside the storefront form">
                            <ShieldAlert className="h-3 w-3" aria-hidden="true" /> no consent record
                          </span>
                        )}
                        {(lead.utmSource || lead.utmMedium || lead.utmCampaign) && (
                          <span className="font-mono text-muted-foreground" title="UTM attribution at capture time">
                            {[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" / ")}
                          </span>
                        )}
                        {lead.landingPath && <span className="font-mono text-muted-foreground" title="Landing path">{lead.landingPath}</span>}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">{lead.city ? `${lead.city} · ` : ""}{timeAgo(lead.createdAt)}</p>
                    </div>

                    {/* value + status */}
                    <div className="flex shrink-0 items-center gap-4 lg:w-64 lg:justify-end">
                      <div className="text-right">
                        <p className="text-sm font-bold text-foreground">{lead.value ? formatPKR(lead.value) : "—"}</p>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">est. value</p>
                      </div>
                      <Select value={lead.status} onValueChange={(v) => moveLead(lead, v as LeadStatus)}>
                        <SelectTrigger className="w-36 border-0 bg-transparent p-0 shadow-none focus:ring-0" aria-label="Lead status">
                          <LeadStatusBadge status={lead.status} />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{leadStatusLabel(s)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-muted px-1 pt-4">
                <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
                  <Button size="icon" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {/* ── lead details dialog (V4 PR-D) ──────────────────────────────── */}
      <Dialog open={Boolean(detailsLead)} onOpenChange={(open) => !open && setDetailsLead(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-hon-green-dark" />
              Lead details — {detailsLead?.name}
              {detailsLead?.company && <span className="text-[11px] font-medium uppercase tracking-wide text-violet-700">· {detailsLead.company}</span>}
            </DialogTitle>
          </DialogHeader>
          {detailsLead && (
            <div className="grid grid-cols-2 gap-3 py-1">
              <div className="col-span-2 min-w-0">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Enquiry details</p>
                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-sm" data-testid="lead-enquiry-details">{detailsLead.summary || "No enquiry details recorded."}</p>
              </div>
              <div>
                <Label htmlFor="lead-assignee" className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Assignee</Label>
                <Select value={form.assignedTo || "__unassigned"} onValueChange={(v) => setForm((f) => ({ ...f, assignedTo: v === "__unassigned" ? "" : v }))}>
                  <SelectTrigger id="lead-assignee" className="bg-white" aria-label="Assignee"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned">Unassigned</SelectItem>
                    {team.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="lead-source" className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Lead source</Label>
                <Select value={form.leadSource || "__none"} onValueChange={(v) => setForm((f) => ({ ...f, leadSource: (v === "__none" ? "" : v) as LeadSource | "" }))}>
                  <SelectTrigger id="lead-source" className="bg-white" aria-label="Lead source"><SelectValue placeholder="Not set" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Not set</SelectItem>
                    {LEAD_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="lead-quote" className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Quotation ref</Label>
                <div className="flex gap-2">
                  <Input id="lead-quote" value={form.quotationRef} onChange={(e) => setForm((f) => ({ ...f, quotationRef: e.target.value }))} placeholder="QOT-1001" className="bg-white" />
                  {form.quotationRef.trim() && <Button asChild variant="outline" size="sm" className="h-9 whitespace-nowrap"><Link to="/admin/quotes">Open quotes</Link></Button>}
                </div>
              </div>
              <div>
                <Label htmlFor="lead-last-contact" className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Last contact</Label>
                <div className="flex gap-1.5">
                  <Input id="lead-last-contact" type="datetime-local" value={form.lastContact} onChange={(e) => setForm((f) => ({ ...f, lastContact: e.target.value }))} className="bg-white" />
                  <Button type="button" variant="outline" size="sm" className="h-9 whitespace-nowrap" onClick={stampContacted} title="Stamp right now">Contacted now</Button>
                </div>
                <p className="mt-0.5 text-[9px] text-muted-foreground">Blank clears the field.</p>
              </div>
              <div>
                <Label htmlFor="lead-meeting" className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Meeting scheduled</Label>
                <Input id="lead-meeting" type="datetime-local" value={form.meetingAt} onChange={(e) => setForm((f) => ({ ...f, meetingAt: e.target.value }))} className="bg-white" />
                <p className="mt-0.5 text-[9px] text-muted-foreground">Blank clears the field.</p>
              </div>
              <div className="col-span-2">
                <Label htmlFor="lead-next-action" className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Next action</Label>
                <Input id="lead-next-action" value={form.nextAction} onChange={(e) => setForm((f) => ({ ...f, nextAction: e.target.value }))} placeholder="Monday visit · Expecting call…" className="bg-white" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="lead-note" className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Note</Label>
                <Textarea id="lead-note" rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Internal note…" className="bg-white" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsLead(null)}>Close</Button>
            <Button onClick={saveDetails} disabled={detailsSaving} className="gap-1.5">
              {detailsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── site visits dialog ─────────────────────────────────────────── */}
      <Dialog open={Boolean(visitLead)} onOpenChange={(open) => !open && setVisitLead(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-hon-green-dark" />
              Site visits — {visitLead?.name}
              {visitLead?.company && <span className="text-[11px] font-medium uppercase tracking-wide text-violet-700">· {visitLead.company}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {visitsLoading ? (
              <SectionSkeleton rows={2} />
            ) : visits.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2.5 text-xs text-muted-foreground"><Inbox className="h-4 w-4" /> No site visits yet for this lead.</p>
            ) : (
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-0.5">
                {visits.map((v) => (
                  <li key={v.id} className="rounded-xl border border-border bg-white p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{new Date(v.scheduledAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                        <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin className="h-3 w-3" /> {v.address}</p>
                      </div>
                      <Select value={v.status} onValueChange={(s) => patchVisit(v, { status: s as SiteVisitStatus })}>
                        <SelectTrigger className="h-7 w-32 text-[11px]" aria-label="Visit status"><SelectValue /></SelectTrigger>
                        <SelectContent>{VISIT_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-[11px]">{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Input
                      defaultValue={v.outcome ?? ""}
                      placeholder="Outcome — what happened?"
                      aria-label="Visit outcome"
                      className="mt-2 h-7 bg-secondary text-[11px]"
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next !== (v.outcome ?? "")) patchVisit(v, { outcome: next });
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                    {v.notes && <p className="mt-1 text-[10px] italic text-muted-foreground">{v.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
            <div className="rounded-xl border border-dashed border-border p-3">
              <p className="pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Schedule a visit</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label htmlFor="visit-at" className="mb-1 block text-[10px] text-muted-foreground">When</Label>
                  <Input id="visit-at" type="datetime-local" value={visitAt} onChange={(e) => setVisitAt(e.target.value)} className="bg-white" aria-label="Visit date and time" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="visit-address" className="mb-1 block text-[10px] text-muted-foreground">Address *</Label>
                  <Input id="visit-address" value={visitAddress} onChange={(e) => setVisitAddress(e.target.value)} placeholder="House 22, Street 5, F-7/2, Islamabad" className="bg-white" />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="visit-notes" className="mb-1 block text-[10px] text-muted-foreground">Notes for the site</Label>
                  <Input id="visit-notes" value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} placeholder="Bring the dims template…" className="bg-white" />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button size="sm" onClick={submitVisit} disabled={visitSaving} className="gap-1.5">
                  {visitSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarRange className="h-4 w-4" />}
                  {visitSaving ? "Scheduling…" : "Schedule visit"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setVisitLead(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
