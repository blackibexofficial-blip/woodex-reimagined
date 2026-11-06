import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, LayoutGrid, Loader2, Plus, Search, Trash2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import { COLLECTION_RULE_LABELS } from "@/api/types";
import type {
  AdminCollection,
  AdminCollectionKind,
  AdminCollectionRule,
  AdminProduct,
  NewAdminCollectionInput,
} from "@/api/types";
import { SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const KIND_LABEL: Record<AdminCollectionKind, string> = { manual: "Manual", automatic: "Automatic" };

export default function AdminCollections() {
  const api = useMemo(() => getAdminApi(), []);
  const [rows, setRows] = useState<AdminCollection[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | AdminCollectionKind>("all");
  const [moving, setMoving] = useState(false);

  const [dialog, setDialog] = useState<null | { mode: "create" } | { mode: "edit"; collection: AdminCollection }>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminCollection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fKind, setFKind] = useState<AdminCollectionKind>("manual");
  const [fRule, setFRule] = useState<AdminCollectionRule>("best_selling");
  const [fPicked, setFPicked] = useState<string[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productPool, setProductPool] = useState<AdminProduct[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listCollections();
      setRows(list);
      const entries = await Promise.all(
        list.map(async (c) => {
          try {
            const members = await api.listCollectionProducts(c.id);
            return [c.id, members.length] as const;
          } catch {
            return [c.id, 0] as const;
          }
        }),
      );
      setCounts(Object.fromEntries(entries));
    } catch (e) {
      console.error(e);
      toast.error("Could not load collections.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const searching = query.trim().length > 0 || kindFilter !== "all";
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((c) => {
      if (kindFilter !== "all" && c.kind !== kindFilter) return false;
      if (!q) return true;
      return [c.name, c.handle, c.description ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, query, kindFilter]);

  const loadProductPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      const res = await api.listProducts({ page: 1, perPage: 200 });
      setProductPool(res.items);
    } catch (e) {
      console.error(e);
      toast.error("Could not load products for the picker.");
    } finally {
      setPoolLoading(false);
    }
  }, [api]);

  const openCreate = () => {
    setFName(""); setFDesc(""); setFKind("manual"); setFRule("best_selling");
    setFPicked([]); setProductQuery("");
    setDialog({ mode: "create" });
    void loadProductPool();
  };
  const openEdit = (c: AdminCollection) => {
    setFName(c.name); setFDesc(c.description ?? ""); setFKind(c.kind); setFRule(c.rule ?? "best_selling");
    setFPicked([...c.productIds]); setProductQuery("");
    setDialog({ mode: "edit", collection: c });
    void loadProductPool();
  };

  const togglePick = (id: string) => {
    setFPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const submit = async () => {
    const name = fName.trim();
    if (!name) { toast.error("Give the collection a name."); return; }
    setSaving(true);
    try {
      const payload: NewAdminCollectionInput = {
        name,
        description: fDesc.trim() || undefined,
        kind: fKind,
        rule: fKind === "automatic" ? fRule : undefined,
        productIds: fKind === "manual" ? fPicked : undefined,
      };
      if (dialog?.mode === "create") {
        const created = await api.createCollection(payload);
        toast.success(`“${created.name}” created — live at /shop?collection=${created.handle}`);
      } else if (dialog?.mode === "edit") {
        await api.updateCollection(dialog.collection.id, {
          name: payload.name,
          description: payload.description,
          kind: payload.kind,
          rule: payload.rule,
          productIds: payload.productIds,
        });
        toast.success(`“${name}” updated.`);
      }
      setDialog(null);
      await load();
    } catch (e) {
      console.error(e);
      toast.error("Could not save the collection.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const ok = await api.deleteCollection(pendingDelete.id);
      if (ok) { toast.success(`“${pendingDelete.name}” deleted.`); } else { toast.error("Collection not found."); }
      setPendingDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete collection.");
    } finally {
      setDeleting(false);
    }
  };

  const move = async (index: number, direction: "up" | "down") => {
    const a = filtered[index];
    const b = filtered[index + (direction === "up" ? -1 : 1)];
    if (!a || !b || moving) return;
    // capture ORDER VALUES before either write — the demo adapter shares cached object references,
    // so a's sortOrder mutates underneath us during the first call
    const aOrder = a.sortOrder;
    const bOrder = b.sortOrder;
    setMoving(true);
    try {
      await api.updateCollection(a.id, { sortOrder: bOrder });
      await api.updateCollection(b.id, { sortOrder: aOrder });
      await load();
    } finally {
      setMoving(false);
    }
  };

  const visiblePool = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const base = q ? productPool.filter((p) => [p.name, p.sku, p.category].some((v) => v.toLowerCase().includes(q))) : productPool;
    return base.slice(0, 120);
  }, [productPool, productQuery]);

  const pickedNames = useMemo(() => {
    if (fPicked.length === 0) return "";
    return `${fPicked.length} product${fPicked.length === 1 ? "" : "s"} picked`;
  }, [fPicked]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={kindFilter} onValueChange={(v) => setKindFilter(v as "all" | AdminCollectionKind)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="automatic">Automatic</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search collections…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9 sm:w-56 bg-white" aria-label="Search collections" />
          </div>
          <Button onClick={openCreate} className="bg-hon-green text-white hover:bg-hon-green-dark"><Plus className="mr-1.5 h-4 w-4" />New collection</Button>
        </div>
      </div>

      <p className="rounded-md border border-dashed border-hon-green/40 bg-hon-green/5 px-3 py-2 text-xs text-muted-foreground">
        Collections group products for the storefront — automatic collections follow a live rule (membership updates itself), manual lists are hand-picked.
        Storefront link format: <code className="font-mono text-[11px] text-foreground">/shop?collection=&lt;handle&gt;</code>. Reordering here is display order only.
      </p>

      <SectionCard title={`${filtered.length} collection${filtered.length === 1 ? "" : "s"}`}>
        {loading ? (
          <SectionSkeleton rows={4} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={LayoutGrid} title="No collections found" hint="Create one, or clear the search and kind filter." />
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 w-16">Order</th>
                  <th className="px-4 py-2.5">Collection</th>
                  <th className="px-4 py-2.5">Kind</th>
                  <th className="px-4 py-2.5">Sorting</th>
                  <th className="px-4 py-2.5 text-right">Products</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted">
                {filtered.map((c, i) => (
                  <tr key={c.id} className="hover:bg-secondary/60">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1">
                        <button type="button" aria-label={`Move ${c.name} up`} disabled={searching || moving || i === 0} onClick={() => move(i, "up")} className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" aria-label={`Move ${c.name} down`} disabled={searching || moving || i === filtered.length - 1} onClick={() => move(i, "down")} className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[320px]">
                      <span className="block font-medium text-foreground">{c.name}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">/{c.handle}</span>
                      {c.description && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{c.description}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c.kind === "automatic" ? "bg-hon-green/10 text-hon-green-dark" : "bg-secondary text-muted-foreground"}`}>{KIND_LABEL[c.kind]}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {c.kind === "automatic" ? (COLLECTION_RULE_LABELS[c.rule ?? "best_selling"]) : "Hand-picked"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums">{counts[c.id] ?? "…"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => setPendingDelete(c)} className="text-rose-600 hover:text-rose-700"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* create / edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "New collection" : `Edit ${dialog?.mode === "edit" ? `“${dialog.collection.name}”` : "collection"}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1 text-sm">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="col-name">Name</label>
              <Input id="col-name" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Executive Favourites" autoFocus />
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">/shop?collection={fName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "collection"}</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="col-desc">Description <span className="font-normal">(optional)</span></label>
              <Textarea id="col-desc" value={fDesc} onChange={(e) => setFDesc(e.target.value)} rows={2} placeholder="What this collection is for…" />
            </div>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Membership</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["manual", "automatic"] as const).map((kind) => (
                  <label key={kind} className={`flex cursor-pointer flex-col rounded-lg border p-3 transition ${fKind === kind ? "border-hon-green bg-hon-green/5 ring-1 ring-hon-green" : "border-muted hover:border-hon-green/50"}`}>
                    <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <input type="radio" name="col-kind" checked={fKind === kind} onChange={() => setFKind(kind)} className="accent-[#1f5f3f]" />
                      {KIND_LABEL[kind]}
                    </span>
                    <span className="mt-1 text-[11px] leading-snug text-muted-foreground">{kind === "manual" ? "Hand-pick products one by one." : "Rule follows live — membership updates itself."}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {fKind === "automatic" ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="col-rule">Rule</label>
                <select id="col-rule" value={fRule} onChange={(e) => setFRule(e.target.value as AdminCollectionRule)} className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm">
                  {(Object.keys(COLLECTION_RULE_LABELS) as AdminCollectionRule[]).map((rule) => <option key={rule} value={rule}>{COLLECTION_RULE_LABELS[rule]}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="col-pick-search">Products</label>
                  <span className="text-[10px] text-muted-foreground">{pickedNames || "none picked"}</span>
                </div>
                <Input id="col-pick-search" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search by name, SKU or category…" className="mb-1.5 bg-white" />
                <div className="max-h-48 overflow-y-auto rounded-lg border border-muted divide-y divide-muted">
                  {poolLoading ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">Loading catalogue…</p>
                  ) : visiblePool.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">No products match “{productQuery}”.</p>
                  ) : visiblePool.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-secondary">
                      <input type="checkbox" className="h-4 w-4 accent-[#1f5f3f]" checked={fPicked.includes(p.id)} onChange={() => togglePick(p.id)} />
                      {p.image && <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" loading="lazy" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{p.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span>
                      </span>
                      {fPicked.includes(p.id) && <Check className="h-4 w-4 text-hon-green-dark" />}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}><X className="mr-1.5 h-4 w-4" />Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-hon-green text-white hover:bg-hon-green-dark">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{dialog?.mode === "create" ? "Create collection" : "Save changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle></DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">Collections never hold stock or orders — deleting only removes the merchandising group and its storefront link. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={deleting} className="bg-rose-600 text-white hover:bg-rose-500">{deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
