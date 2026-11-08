import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, Download, GitMerge, Sparkles, UserRound, UsersRound, Wallet } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminClient, ClientCategory, ClientCrossRefs } from "@/api/types";
import { isDemoMode } from "@/config/env";
import { CLIENT_CATEGORIES } from "@/api/types";
import { CLIENT_CATEGORY_LABELS, deriveClientCategory } from "@/lib/clientCategory";
import { toCsv, downloadCsv } from "@/lib/csv";
import { formatDate, timeAgo, SectionCard, SectionSkeleton, EmptyState, ClientCategoryBadge } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | ClientCategory;
type SortKey = "newest" | "name" | "updated";
const CHIP =
  "h-auto whitespace-nowrap rounded-sm px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm";

const startOfThisMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

/**
 * Admin clients — the CRM client database by line-of-business category (V4 PR-C).
 * Demo-authoritative: category is derived from kind/tags until explicitly retagged
 * (explicit wins; delivery auto-tags from the order's line items, never overriding
 * an explicit tag). Hosted is read-only until the owners' category migration ships.
 */
export default function AdminClients() {
  const api = useMemo(() => getAdminApi(), []);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [showMerged, setShowMerged] = useState(false);
  const [rows, setRows] = useState<AdminClient[]>([]);
  const [crossRefs, setCrossRefs] = useState<Record<string, ClientCrossRefs>>({});
  const [loading, setLoading] = useState(true);
  const [retagging, setRetagging] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [clients, refs] = await Promise.all([
        api.listClients({ includeMerged: true }).catch(() => api.listClients()),
        api.listClientCrossRefs().catch((e) => { console.warn("cross-refs unavailable", e); return {} as Record<string, ClientCrossRefs>; }),
      ]);
      setRows(clients.map((c) => ({ ...c, category: deriveClientCategory(c) })));
      setCrossRefs(refs);
    } catch (e) {
      console.error(e);
      toast.error(isDemoMode ? "Could not load clients." : "Clients need the demo workspace — this backend is read-only for the CRM client list.");
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const active = useMemo(() => rows.filter((c) => !c.mergedInto), [rows]);
  const mergedRows = useMemo(() => rows.filter((c) => c.mergedInto), [rows]);
  const counts = useMemo(() => {
    const m = new Map<ClientCategory, number>();
    for (const c of active) { const k = deriveClientCategory(c); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [active]);
  const kpis = useMemo(() => {
    const monthStart = startOfThisMonth();
    return {
      total: active.length,
      newThisMonth: active.filter((c) => new Date(c.createdAt).getTime() >= monthStart).length,
      updatedThisMonth: active.filter((c) => new Date(c.updatedAt).getTime() >= monthStart).length,
      merged: mergedRows.length,
    };
  }, [active, mergedRows]);

  const visible = useMemo(() => {
    const base = showMerged ? rows : active;
    const q = debounced.trim().toLowerCase();
    let out = base.filter((c) => {
      if (category !== "all" && deriveClientCategory(c) !== category) return false;
      if (!q) return true;
      return [c.name, c.company, c.city, c.email, c.phone, c.source, ...(c.tags ?? [])]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
    if (sort === "name") out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "updated") out = [...out].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    else out = [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  }, [rows, active, showMerged, category, debounced, sort]);

  const exportCsv = () => {
    const label = category === "all" ? "all" : category;
    downloadCsv(`woodex-clients-${label}.csv`, toCsv(
      ["ID", "Name", "Company", "Email", "Phone", "City", "Kind", "Category", "Source", "Tags", "Leads", "Quotes", "Invoices", "Orders", "Projects", "Created", "Updated"],
      visible.map((c) => {
        const r = crossRefs[c.id] ?? {};
        return [c.id, c.name, c.company ?? "", c.email ?? "", c.phone ?? "", c.city ?? "", c.kind, deriveClientCategory(c), c.source ?? "", (c.tags ?? []).join("; "), r.lead ?? 0, r.quote ?? 0, r.invoice ?? 0, r.order ?? 0, r.project ?? 0, c.createdAt, c.updatedAt];
      }),
    ));
    toast.success(`${visible.length} client(s) exported — opens in Sheets or Excel.`);
  };

  const retag = async (id: string, next: ClientCategory) => {
    setRetagging(id);
    try {
      const updated = await api.updateClientCategory(id, next);
      if (!updated) throw new Error("Client not found.");
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, category: updated.category ?? next, updatedAt: updated.updatedAt } : r)));
      toast.success(`Category → ${CLIENT_CATEGORY_LABELS[next]}.`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not save the category.");
    } finally {
      setRetagging(null);
    }
  };

  const kpiCards = [
    { icon: UsersRound, label: "Active clients", value: kpis.total },
    { icon: Sparkles, label: "New this month", value: kpis.newThisMonth },
    { icon: Wallet, label: "Updated this month", value: kpis.updatedThisMonth },
    { icon: GitMerge, label: "Merged away (audit)", value: kpis.merged },
  ];

  return (
    <div className="space-y-4">
      {!isDemoMode && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This backend is read-only for the CRM client list. Categories are derived from kind/tags; retagging needs the owner-gated clients.category migration.
        </div>
      )}

      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent" aria-hidden><UsersRound className="h-5 w-5" /></div>
        <div>
          <h1 className="text-lg font-bold leading-tight text-foreground">Clients</h1>
          <p className="text-xs text-muted-foreground">The CRM client database by line of business — furniture, interior, project, retail, business.</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} disabled={visible.length === 0}>
          <Download className="mr-1.5 h-4 w-4" /> Export {category === "all" ? "all" : CLIENT_CATEGORY_LABELS[category]} CSV ({visible.length})
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {kpiCards.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-border bg-white px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden />{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* category chips + search + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" value={category} onValueChange={(v) => v && setCategory(v as CategoryFilter)} aria-label="Filter by category" className="flex-wrap rounded-md bg-muted p-1">
          <ToggleGroupItem value="all" className={CHIP}>All ({active.length})</ToggleGroupItem>
          {CLIENT_CATEGORIES.map((c) => <ToggleGroupItem key={c} value={c} className={CHIP}>{CLIENT_CATEGORY_LABELS[c]} ({counts.get(c) ?? 0})</ToggleGroupItem>)}
        </ToggleGroup>
        <Input placeholder="Search name, company, city, phone…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 sm:max-w-[240px] bg-white" aria-label="Search clients" />
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-9 w-[170px] bg-white" aria-label="Sort clients"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
            <SelectItem value="updated">Recently updated</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Switch checked={showMerged} onCheckedChange={setShowMerged} aria-label="Show merged records" /> Show merged
        </label>
      </div>

      {/* table */}
      <SectionCard title={`${visible.length} client${visible.length === 1 ? "" : "s"}${category === "all" ? "" : ` · ${CLIENT_CATEGORY_LABELS[category]}`}`}>
        {loading ? (
          <SectionSkeleton rows={6} />
        ) : visible.length === 0 ? (
          <EmptyState icon={UsersRound} title="No clients in this view" hint="Clear the search or pick a different category." />
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5">Client</th>
                  <th className="px-5 py-2.5">Category</th>
                  <th className="px-5 py-2.5">Kind</th>
                  <th className="px-5 py-2.5">City</th>
                  <th className="px-5 py-2.5">Tags</th>
                  <th className="px-5 py-2.5">Source</th>
                  <th className="px-5 py-2.5 text-right" title="Leads · Quotes · Invoices · Orders · Projects">Refs</th>
                  <th className="px-5 py-2.5 text-right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const cat = deriveClientCategory(c);
                  const r = crossRefs[c.id] ?? {};
                  const refBits = [r.lead, r.quote, r.invoice, r.order, r.project];
                  const hasRefs = refBits.some((n) => (n ?? 0) > 0);
                  const retired = !!c.mergedInto;
                  return (
                    <tr key={c.id} className={cn("border-b border-muted/60 transition-colors hover:bg-secondary/40", retired && "opacity-55")}>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold uppercase text-foreground" aria-hidden>
                            {c.name.split(" ").slice(0, 2).map((w) => w[0] ?? "").join("")}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-semibold text-foreground leading-tight">{c.name}{retired && <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground"><GitMerge className="h-3 w-3" aria-hidden />merged → {c.mergedInto}</span>}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">{c.company ?? c.email ?? "—"}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <ClientCategoryBadge category={cat} />
                          <Select value={cat} onValueChange={(v) => void retag(c.id, v as ClientCategory)} disabled={retired || retagging === c.id}>
                            <SelectTrigger className="h-6 w-6 border-none bg-transparent p-0 shadow-none focus:ring-1" aria-label={`Retag ${c.name}`}>
                              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                            </SelectTrigger>
                            <SelectContent>
                              {CLIENT_CATEGORIES.map((v) => <SelectItem key={v} value={v}>{CLIENT_CATEGORY_LABELS[v]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">{c.kind === "business" ? <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" aria-hidden />Business</span> : <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" aria-hidden />Retail</span>}</td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">{c.city ?? "—"}</td>
                      <td className="px-5 py-2.5"><span className="flex flex-wrap gap-1">{(c.tags ?? []).slice(0, 3).map((t) => <Badge key={t} variant="outline" className="text-[10px] font-normal">{t}</Badge>)}{(c.tags?.length ?? 0) > 3 && <span className="text-[10px] text-muted-foreground">+{(c.tags?.length ?? 0) - 3}</span>}</span></td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">{c.source ?? "—"}</td>
                      <td className="px-5 py-2.5 text-right font-mono text-[11px] tabular-nums text-muted-foreground" title="Leads · Quotes · Invoices · Orders · Projects">{hasRefs ? `${r.lead ?? 0} · ${r.quote ?? 0} · ${r.invoice ?? 0} · ${r.order ?? 0} · ${r.project ?? 0}` : "—"}</td>
                      <td className="px-5 py-2.5 text-right text-xs text-muted-foreground" title={formatDate(c.updatedAt)}>{timeAgo(c.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      <p className="px-1 text-[10px] text-muted-foreground">Category is derived from kind/tags until you retag — an explicit tag always wins. Delivering an order auto-tags the matching client (furniture vs interior/BOQ lines) when no explicit tag exists. Hosted is read-only until the owners' clients.category migration ships.</p>
    </div>
  );
}
