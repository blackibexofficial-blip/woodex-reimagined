import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ClipboardList, ChevronLeft, ChevronRight, Mail, Phone, FileText, Handshake, ScrollText, Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminLead, LeadStatus, LeadType } from "@/api/types";
import { formatPKR, timeAgo, LeadStatusBadge, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PER_PAGE = 10;
type TypeFilter = LeadType | "all";
type StatusFilter = LeadStatus | "all";
const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "quoted", "won", "lost"];

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

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listLeads({ type, status, query: debounced || undefined, page, perPage: PER_PAGE });
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
      toast.error("Could not load leads.");
    } finally {
      setLoading(false);
    }
  }, [api, type, status, debounced, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [type, status, debounced]);

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

  const changeStatus = async (lead: AdminLead, next: LeadStatus) => {
    const updated = await api.updateLeadStatus(lead.id, next);
    if (updated) {
      setRows((rs) => rs.map((r) => (r.id === updated.id ? { ...r, status: updated.status } : r)));
      toast.success(`Lead ${lead.name} → ${next}`);
    } else {
      toast.error("Status update failed — live Bagisto has no leads table yet (see docs).");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={type} onValueChange={(v) => setType(v as TypeFilter)}>
            <TabsList>
              <TabsTrigger value="all">All leads</TabsTrigger>
              <TabsTrigger value="quote"><FileText className="mr-1.5 h-3.5 w-3.5" />Quotes</TabsTrigger>
              <TabsTrigger value="b2b"><Handshake className="mr-1.5 h-3.5 w-3.5" />B2B</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-40 bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Input placeholder="Search name, company, summary…" value={query} onChange={(e) => setQuery(e.target.value)} className="lg:max-w-xs bg-white" />
      </div>

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
                      <div className="mt-1.5 flex gap-1.5">
                        <a href={`tel:${lead.phone.replace(/\s/g, "")}`} title={lead.phone} aria-label="Call" className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"><Phone className="h-3.5 w-3.5" /></a>
                        <a href={`mailto:${lead.email}`} title={lead.email} aria-label="Email" className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"><Mail className="h-3.5 w-3.5" /></a>
                        <button onClick={() => createQuote(lead)} disabled={quotingId === lead.id} title="Draft priced quotation from this lead" aria-label={`Create quote from ${lead.name}`} className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground disabled:opacity-50">
                          {quotingId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScrollText className="h-3.5 w-3.5" />}
                        </button>
                      </div>
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
                    <Select value={lead.status} onValueChange={(v) => changeStatus(lead, v as LeadStatus)}>
                      <SelectTrigger className="w-36 border-0 bg-transparent p-0 shadow-none focus:ring-0" aria-label="Lead status">
                        <LeadStatusBadge status={lead.status} />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
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
    </div>
  );
}
