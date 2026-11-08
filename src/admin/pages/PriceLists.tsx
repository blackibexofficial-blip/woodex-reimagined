import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, Check, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, Search, Trash2, X, Archive } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminCategory, AdminCompany, AdminPriceList, NewAdminPriceListInput, PriceListStatus } from "@/api/types";
import { formatDate, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS_TONE: Record<PriceListStatus, string> = {
  active: "bg-hon-green/10 text-hon-green-dark",
  draft: "bg-amber-100 text-amber-800",
  archived: "bg-secondary text-muted-foreground",
};
const SAMPLE_PRICE = 165000;
const STEPS = ["Details", "Audience", "Products", "Pricing", "Review"] as const;

type WizardState = null | { mode: "create" } | { mode: "edit"; list: AdminPriceList };

export default function AdminPriceLists() {
  const api = useMemo(() => getAdminApi(), []);
  const [rows, setRows] = useState<AdminPriceList[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PriceListStatus>("all");

  const [wizard, setWizard] = useState<WizardState>(null);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminPriceList | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fAudience, setFAudience] = useState<"all_b2b" | "companies">("all_b2b");
  const [fCompanyIds, setFCompanyIds] = useState<string[]>([]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [fTarget, setFTarget] = useState<"all_products" | "categories">("all_products");
  const [fCategoryIds, setFCategoryIds] = useState<string[]>([]);
  const [fPct, setFPct] = useState(10);
  const [fStartsAt, setFStartsAt] = useState("");
  const [fEndsAt, setFEndsAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lists, cos, cats] = await Promise.all([api.listPriceLists(), api.listCompanies(), api.listCategories()]);
      setRows(lists);
      setCompanies(cos);
      setCategories(cats);
    } catch (e) {
      console.error(e);
      toast.error("Could not load price lists.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const searching = query.trim().length > 0 || statusFilter !== "all";
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.name, r.description ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter]);

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  /** flat, indented category options (parents first, children after) */
  const flatCategories = useMemo(() => {
    const bySort = (a: AdminCategory, b: AdminCategory) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
    const out: Array<{ id: string; label: string; depth: number }> = [];
    const walk = (parentId: string | undefined, depth: number) => {
      for (const c of categories.filter((x) => x.parentId === parentId).sort(bySort)) {
        out.push({ id: c.id, label: c.name, depth });
        walk(c.id, depth + 1);
      }
    };
    walk(undefined, 0);
    return out;
  }, [categories]);

  const visibleCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => [c.name, c.contactName, c.city, c.email].some((v) => v.toLowerCase().includes(q)));
  }, [companies, companyQuery]);

  const openCreate = () => {
    setFName(""); setFDesc(""); setFAudience("all_b2b"); setFCompanyIds([]); setCompanyQuery("");
    setFTarget("all_products"); setFCategoryIds([]); setFPct(10); setFStartsAt(""); setFEndsAt("");
    setStep(1); setWizard({ mode: "create" });
  };
  const openEdit = (list: AdminPriceList) => {
    setFName(list.name); setFDesc(list.description ?? "");
    setFAudience(list.audience); setFCompanyIds([...list.companyIds]); setCompanyQuery("");
    setFTarget(list.target); setFCategoryIds([...list.categoryIds]);
    setFPct(list.discountPct); setFStartsAt(list.startsAt?.slice(0, 10) ?? ""); setFEndsAt(list.endsAt?.slice(0, 10) ?? "");
    setStep(1); setWizard({ mode: "edit", list });
  };
  const closeWizard = () => setWizard(null);

  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const canContinue = (): boolean => {
    if (step === 1) return fName.trim().length > 0;
    if (step === 2) return fAudience === "all_b2b" || fCompanyIds.length > 0;
    if (step === 3) return fTarget === "all_products" || fCategoryIds.length > 0;
    if (step === 4) return fEndsAt === "" || fStartsAt === "" || fEndsAt >= fStartsAt;
    return true;
  };

  const next = () => {
    if (step === 4 && fStartsAt && fEndsAt && fEndsAt < fStartsAt) { toast.error("End date must be on or after the start date."); return; }
    if (canContinue()) setStep((s) => Math.min(5, s + 1));
    else if (step === 2) toast.error("Pick at least one company, or switch to all trade customers.");
    else if (step === 3) toast.error("Pick at least one category, or switch to the entire catalogue.");
  };

  const submit = async () => {
    const payload: NewAdminPriceListInput = {
      name: fName.trim(),
      description: fDesc.trim() || undefined,
      audience: fAudience,
      companyIds: fAudience === "companies" ? fCompanyIds : [],
      target: fTarget,
      categoryIds: fTarget === "categories" ? fCategoryIds : [],
      discountPct: fPct,
      startsAt: fStartsAt || undefined,
      endsAt: fEndsAt || undefined,
    };
    setSaving(true);
    try {
      if (wizard?.mode === "create") {
        const created = await api.createPriceList(payload);
        toast.success(`“${created.name}” saved as draft — activate it from the list.`);
      } else if (wizard?.mode === "edit") {
        await api.updatePriceList(wizard.list.id, payload);
        toast.success(`“${payload.name}” updated.`);
      }
      setWizard(null);
      await load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not save the price list.");
    } finally {
      setSaving(false);
    }
  };

  const flipStatus = async (list: AdminPriceList, next: PriceListStatus) => {
    try {
      await api.setPriceListStatus(list.id, next);
      toast.success(next === "active" ? `“${list.name}” is live for trade customers.` : `“${list.name}” ${next === "archived" ? "archived — customers see retail again." : "moved back to draft."}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change status.");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const ok = await api.deletePriceList(pendingDelete.id);
      toast.success(ok ? `“${pendingDelete.name}” deleted.` : "Price list not found.");
      setPendingDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete price list.");
    } finally {
      setDeleting(false);
    }
  };

  const audienceLabel = (r: AdminPriceList) =>
    r.audience === "all_b2b" ? "All trade customers"
      : `${r.companyIds.length} ${r.companyIds.length === 1 ? "company" : "companies"}${r.companyIds.length <= 2 ? ` — ${r.companyIds.map((id) => companyById.get(id)?.name ?? id).join(", ")}` : ""}`;
  const targetLabel = (r: AdminPriceList) =>
    r.target === "all_products" ? "Entire catalogue" : `${r.categoryIds.length} ${r.categoryIds.length === 1 ? "category" : "categories"}`;

  const previewPrice = Math.max(0, Math.round((SAMPLE_PRICE * (1 - fPct / 100)) / 10) * 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup type="single" value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as "all" | PriceListStatus)} aria-label="Filter price lists by status" className="h-auto flex-wrap justify-start rounded-md bg-muted p-1">
          <ToggleGroupItem value="all" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">All</ToggleGroupItem>
          <ToggleGroupItem value="active" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Active</ToggleGroupItem>
          <ToggleGroupItem value="draft" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Draft</ToggleGroupItem>
          <ToggleGroupItem value="archived" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Archived</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search price lists…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9 sm:w-52 bg-white" aria-label="Search price lists" />
          </div>
          <Button onClick={openCreate} className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="mr-1.5 h-4 w-4" />New price list</Button>
        </div>
      </div>

      <p className="rounded-md border border-dashed border-hon-green/40 bg-hon-green/5 px-3 py-2 text-xs text-muted-foreground">
        Price lists are the WOODEX trade agreements — percentage off retail for <span className="font-semibold text-foreground">active</span> lists only.
        Trade customers sign in on <code className="font-mono text-[11px] text-foreground">/b2b</code> and see negotiated prices in cart &amp; checkout.
        New lists are created as <span className="font-semibold text-foreground">drafts</span> — nothing changes storefront pricing until you activate.
      </p>

      <SectionCard title={`${filtered.length} price list${filtered.length === 1 ? "" : "s"}`}>
        {loading ? (
          <SectionSkeleton rows={4} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={BadgePercent} title="No price lists yet" hint="Create the Wholesale list, or activate a draft." />
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Audience</th>
                  <th className="px-4 py-2.5">Scope</th>
                  <th className="px-4 py-2.5 text-right">Discount</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Updated</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-secondary/60">
                    <td className="px-4 py-2.5 max-w-[260px]">
                      <span className="block font-medium text-foreground">{r.name}</span>
                      {r.description && <span className="block truncate text-[11px] text-muted-foreground">{r.description}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{audienceLabel(r)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{targetLabel(r)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums">{r.discountPct}%</td>
                    <td className="px-4 py-2.5"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONE[r.status]}`}>{r.status}</span></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(r.updatedAt)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {r.status === "active" ? (
                          <Button size="icon" variant="ghost" aria-label={`Archive ${r.name}`} title="Archive — customers see retail again" onClick={() => flipStatus(r, "archived")}><Archive className="h-4 w-4" /></Button>
                        ) : (
                          <Button size="icon" variant="ghost" aria-label={`Activate ${r.name}`} title="Activate — live trade pricing" onClick={() => flipStatus(r, "active")} className="text-hon-green-dark"><Check className="h-4 w-4" /></Button>
                        )}
                        <Button size="icon" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => setPendingDelete(r)} className="text-rose-600 hover:text-rose-700"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── wizard (Spree-style catalog steps) ── */}
      <Dialog open={wizard !== null} onOpenChange={(open) => { if (!open) closeWizard(); }}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
          <div className="grid grid-cols-[180px_1fr] max-h-[85vh]">
            {/* steps rail */}
            <div className="hidden sm:block border-r border-muted bg-secondary/50 p-4">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{wizard?.mode === "create" ? "New catalog" : "Edit catalog"}</p>
              <ol className="space-y-1">
                {STEPS.map((label, i) => {
                  const n = i + 1;
                  const state = n === step ? "current" : n < step ? "done" : "todo";
                  return (
                    <li key={label}>
                      <button type="button" onClick={() => n <= step && setStep(n)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${state === "current" ? "bg-accent text-accent-foreground font-semibold" : state === "done" ? "text-hon-green-dark hover:bg-hon-green/10" : "text-muted-foreground"}`} aria-current={state === "current" ? "step" : undefined}>
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] ${state === "current" ? "border-white" : state === "done" ? "border-hon-green" : "border-muted-foreground/40"}`}>{state === "done" ? "✓" : n}</span>
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="flex flex-col overflow-y-auto p-5">
              <DialogHeader className="mb-3">
                <DialogTitle className="text-base">{STEPS[step - 1]}</DialogTitle>
              </DialogHeader>

              {step === 1 && (
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="pl-name">Name <span className="text-rose-500">*</span></label>
                    <Input id="pl-name" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Wholesale" autoFocus maxLength={80} />
                    <p className="mt-1 text-[10px] text-muted-foreground">Name this agreement so you recognise it later.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="pl-desc">Description</label>
                    <Textarea id="pl-desc" rows={3} value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="What this agreement is for" />
                    <p className="mt-1 text-[10px] text-muted-foreground">Internal note — never shown to shoppers.</p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">Who should see this pricing in cart &amp; checkout?</p>
                  <div className="grid grid-cols-1 gap-2">
                    {([["all_b2b", "All trade customers", "Every signed-in /b2b company sees it"], ["companies", "Specific companies", "Only the companies you pick below"]] as const).map(([value, title, sub]) => (
                      <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition ${fAudience === value ? "border-hon-green bg-hon-green/5 ring-1 ring-hon-green" : "border-muted hover:border-hon-green/50"}`}>
                        <input type="radio" name="pl-audience" className="mt-0.5 accent-[#1f5f3f]" checked={fAudience === value} onChange={() => setFAudience(value)} />
                        <span><span className="block text-xs font-semibold text-foreground">{title}</span><span className="text-[11px] text-muted-foreground">{sub}</span></span>
                      </label>
                    ))}
                  </div>
                  {fAudience === "companies" && (
                    <div>
                      <Input value={companyQuery} onChange={(e) => setCompanyQuery(e.target.value)} placeholder="Search companies or contacts…" aria-label="Search companies" className="mb-1.5 bg-white" />
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-muted divide-y divide-muted">
                        {visibleCompanies.map((c) => (
                          <label key={c.id} className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 hover:bg-secondary">
                            <input type="checkbox" className="h-4 w-4 accent-[#1f5f3f]" checked={fCompanyIds.includes(c.id)} onChange={() => setFCompanyIds((ids) => toggle(ids, c.id))} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-medium text-foreground">{c.name}</span>
                              <span className="text-[10px] text-muted-foreground">{c.contactName} · {c.city}</span>
                            </span>
                          </label>
                        ))}
                        {visibleCompanies.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">No companies match “{companyQuery}”.</p>}
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{fCompanyIds.length} selected</p>
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">Which part of the catalogue should the discount touch?</p>
                  <div className="grid grid-cols-1 gap-2">
                    {([["all_products", "Entire catalogue", "Every product, current and future"], ["categories", "Selected categories", "Only products in the categories you pick"]] as const).map(([value, title, sub]) => (
                      <label key={value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition ${fTarget === value ? "border-hon-green bg-hon-green/5 ring-1 ring-hon-green" : "border-muted hover:border-hon-green/50"}`}>
                        <input type="radio" name="pl-target" className="mt-0.5 accent-[#1f5f3f]" checked={fTarget === value} onChange={() => setFTarget(value)} />
                        <span><span className="block text-xs font-semibold text-foreground">{title}</span><span className="text-[11px] text-muted-foreground">{sub}</span></span>
                      </label>
                    ))}
                  </div>
                  {fTarget === "categories" && (
                    <div>
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-muted divide-y divide-muted">
                        {flatCategories.map((c) => (
                          <label key={c.id} className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 hover:bg-secondary" style={{ paddingLeft: `${10 + c.depth * 18}px` }}>
                            <input type="checkbox" className="h-4 w-4 accent-[#1f5f3f]" checked={fCategoryIds.includes(c.id)} onChange={() => setFCategoryIds((ids) => toggle(ids, c.id))} />
                            <span className="text-xs text-foreground">{c.label}</span>
                          </label>
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{fCategoryIds.length} selected</p>
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4 text-sm">
                  <div>
                    <label className="mb-1 flex items-center justify-between text-xs font-medium text-muted-foreground" htmlFor="pl-pct"><span>Trade discount</span><span className="font-mono text-sm font-bold text-hon-green-dark">{fPct}%</span></label>
                    <input id="pl-pct" type="range" min={0} max={60} step={1} value={fPct} onChange={(e) => setFPct(Number(e.target.value))} className="w-full accent-[#1f5f3f]" />
                    <div className="mt-2 rounded-lg border border-muted bg-secondary/60 p-3 text-xs">
                      <p className="text-muted-foreground">Sample — SOVEREIGN Executive Desk</p>
                      <p className="mt-0.5"><span className="text-muted-foreground line-through">Rs {SAMPLE_PRICE.toLocaleString("en-PK")}</span>{"  "}<span className="font-bold text-hon-green-dark">Rs {previewPrice.toLocaleString("en-PK")}</span></p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="pl-start">Starts <span className="font-normal">(optional)</span></label>
                      <Input id="pl-start" type="date" value={fStartsAt} onChange={(e) => setFStartsAt(e.target.value)} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="pl-end">Ends <span className="font-normal">(optional)</span></label>
                      <Input id="pl-end" type="date" value={fEndsAt} onChange={(e) => setFEndsAt(e.target.value)} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Outside the window the list does nothing — useful for seasonal campaigns.</p>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">Review the agreement — it is saved as <span className="font-semibold text-foreground">draft</span> until you activate it.</p>
                  <dl className="divide-y divide-muted rounded-lg border border-muted text-xs">
                    {[
                      ["Name", fName.trim() || "—"],
                      ["Description", fDesc.trim() || "—"],
                      ["Audience", fAudience === "all_b2b" ? "All trade customers" : `${fCompanyIds.length} selected ${fCompanyIds.length === 1 ? "company" : "companies"}`],
                      ["Scope", fTarget === "all_products" ? "Entire catalogue" : `${fCategoryIds.length} ${fCategoryIds.length === 1 ? "category" : "categories"}`],
                      ["Discount", `${fPct}% off retail`],
                      ["Validity", fStartsAt || fEndsAt ? `${fStartsAt || "…"} → ${fEndsAt || "…"}` : "No window (always on)"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-4 px-3 py-2">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-right font-medium text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <div className="mt-auto flex items-center justify-between border-t border-muted pt-3">
                <Button variant="ghost" size="sm" onClick={() => (step === 1 ? closeWizard() : setStep((s) => s - 1))}>
                  {step === 1 ? <><X className="mr-1 h-4 w-4" />Cancel</> : <><ChevronLeft className="mr-1 h-4 w-4" />Back</>}
                </Button>
                {step < 5 ? (
                  <Button size="sm" onClick={next} disabled={!canContinue()} className="bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-40">Continue<ChevronRight className="ml-1 h-4 w-4" /></Button>
                ) : (
                  <Button size="sm" onClick={submit} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{wizard?.mode === "create" ? "Create price list" : "Save changes"}</Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle></DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">Deleting removes the agreement — every signed-in trade customer reverts to retail on the affected products. Archiving instead keeps a record.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={deleting} className="bg-rose-600 text-white hover:bg-rose-500">{deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
