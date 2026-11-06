import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FolderTree, Info, Loader2, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminCategory } from "@/api/types";
import { formatNumber, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Group = AdminCategory["group"];
const GROUP_LABEL: Record<Group, string> = { office: "Office", home: "Home", ungrouped: "Ungrouped" };
const GROUP_STYLE: Record<Group, string> = {
  office: "bg-hon-green-pale text-hon-green-dark border-hon-green-pale",
  home: "bg-emerald-50 text-emerald-800 border-emerald-200",
  ungrouped: "bg-muted text-muted-foreground border-border",
};
const ROOT = "__root__";
const GROUP_ORDER: { key: Group; label: string }[] = [
  { key: "office", label: "Office Furniture" },
  { key: "home", label: "Home Furniture" },
  { key: "ungrouped", label: "Ungrouped" },
];

export default function AdminCategories() {
  const api = useMemo(() => getAdminApi(), []);
  const [rows, setRows] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // create / edit dialog
  const [dialog, setDialog] = useState<null | { mode: "create" } | { mode: "edit"; category: AdminCategory }>(null);
  const [draftName, setDraftName] = useState("");
  const [draftGroup, setDraftGroup] = useState<Group>("office");
  const [draftParent, setDraftParent] = useState<string>(ROOT);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<AdminCategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.listCategories());
    } catch (e) {
      console.error(e);
      setRows([]);
      setError(e instanceof Error ? e.message : "Could not load categories.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => [c.name, c.id, GROUP_LABEL[c.group]].some((h) => h.toLowerCase().includes(q)));
  }, [rows, query]);

  /** scope key: the parent that EXISTS inside the visible slice, else re-root */
  const scopeOf = useCallback((c: AdminCategory, visible: AdminCategory[]) => {
    return c.parentId && visible.some((x) => x.id === c.parentId) ? c.parentId : undefined;
  }, []);

  const byParent = useMemo(() => {
    const map = new Map<string | undefined, AdminCategory[]>();
    for (const c of filtered) {
      const key = scopeOf(c, filtered);
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    for (const v of map.values()) v.sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.name.localeCompare(b.name));
    return map;
  }, [filtered, scopeOf]);

  const searching = query.trim().length > 0;

  /** Pre-order over the FULL list (unfiltered) excluding self + own descendants — for the parent picker. */
  const parentOptions = useMemo(() => {
    const full = [...rows];
    const childrenOf = new Map<string | undefined, AdminCategory[]>();
    const selFor = (c: AdminCategory) => (c.parentId && full.some((x) => x.id === c.parentId) ? c.parentId : undefined);
    for (const c of full) {
      const key = selFor(c);
      childrenOf.set(key, [...(childrenOf.get(key) ?? []), c]);
    }
    for (const v of childrenOf.values()) v.sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || a.name.localeCompare(b.name));
    const exclude = new Set<string>();
    if (dialog?.mode === "edit") {
      const mark = (id: string) => {
        exclude.add(id);
        for (const c of full) if (c.parentId === id) mark(c.id);
      };
      mark(dialog.category.id);
    }
    const out: { id: string; label: string; depth: number }[] = [];
    const walk = (parentId: string | undefined, depth: number) => {
      for (const c of childrenOf.get(parentId) ?? []) {
        if (exclude.has(c.id)) continue;
        out.push({ id: c.id, label: `${"— ".repeat(depth)}${c.name}`, depth });
        walk(c.id, depth + 1);
      }
    };
    walk(undefined, 0);
    return out;
  }, [rows, dialog]);

  const openCreate = () => { setDraftName(""); setDraftGroup("office"); setDraftParent(ROOT); setDialog({ mode: "create" }); };
  const openEdit = (category: AdminCategory) => {
    setDraftName(category.name);
    setDraftGroup(category.group);
    setDraftParent(category.parentId ?? ROOT);
    setDialog({ mode: "edit", category });
  };

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const moveSibling = async (c: AdminCategory, dir: -1 | 1) => {
    const sibs = byParent.get(scopeOf(c, filtered)) ?? [];
    const idx = sibs.findIndex((x) => x.id === c.id);
    const j = idx + dir;
    if (idx === -1 || j < 0 || j >= sibs.length) return;
    const a = sibs[idx], b = sibs[j];
    setRows((rs) => rs.map((r) =>
      r.id === a.id ? { ...r, sortOrder: b.sortOrder ?? j } : r.id === b.id ? { ...r, sortOrder: a.sortOrder ?? idx } : r,
    ));
    try {
      await Promise.all([
        api.updateCategory(a.id, { sortOrder: b.sortOrder ?? j }),
        api.updateCategory(b.id, { sortOrder: a.sortOrder ?? idx }),
      ]);
    } catch {
      toast.error("Could not reorder — refreshing.");
    } finally {
      load();
    }
  };

  const saveDialog = async () => {
    const name = draftName.trim();
    if (!name) { toast.error("Give the category a name."); return; }
    setSaving(true);
    try {
      if (dialog?.mode === "create") {
        const created = await api.createCategory({ name, group: draftGroup, parentId: draftParent === ROOT ? undefined : draftParent });
        toast.success(`Category “${created.name}” added.`);
      } else if (dialog?.mode === "edit") {
        const patch: Parameters<typeof api.updateCategory>[1] = { name, group: draftGroup };
        const cur = dialog.category.parentId ?? ROOT;
        if (draftParent !== cur) patch.parentId = draftParent === ROOT ? "" : draftParent; // "" re-roots
        await api.updateCategory(dialog.category.id, patch);
        toast.success("Category updated.");
      }
      setDialog(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save category.");
    } finally {
      setSaving(false);
    }
  };

  const toggleVisible = async (category: AdminCategory, value: boolean) => {
    setRows((rs) => rs.map((r) => (r.id === category.id ? { ...r, visible: value } : r)));
    try {
      await api.updateCategory(category.id, { visible: value });
      toast.success(value ? `“${category.name}” is visible.` : `“${category.name}” hidden from future catalogue syncs.`);
    } catch {
      setRows((rs) => rs.map((r) => (r.id === category.id ? { ...r, visible: !value } : r)));
      toast.error("Could not update visibility.");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const result = await api.deleteCategory(pendingDelete.id);
      if (result.ok) {
        toast.success(`“${pendingDelete.name}” deleted.`);
        setPendingDelete(null);
        load();
      } else {
        toast.error(result.error ?? "Category is in use.");
        setPendingDelete(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete category.");
    } finally {
      setDeleting(false);
    }
  };

  const totalProducts = rows.reduce((sum, c) => sum + (c.productCount ?? 0), 0);
  const childCount = useCallback((c: AdminCategory) => byParent.get(c.id)?.length ?? 0, [byParent]);

  const renderNode = (c: AdminCategory, depth: number): ReactNode => {
    const kids = byParent.get(c.id) ?? [];
    const hasKids = kids.length > 0;
    const expanded = !collapsed.has(c.id);
    const siblings = byParent.get(scopeOf(c, filtered)) ?? [];
    const idx = siblings.findIndex((x) => x.id === c.id);
    const canUp = idx > 0 && !searching;
    const canDown = idx >= 0 && idx < siblings.length - 1 && !searching;
    return (
      <Fragment key={c.id}>
        <tr className="hover:bg-secondary">
          <td className="py-2.5 pr-4">
            <div className="flex items-start gap-2" style={{ paddingLeft: depth * 22 }}>
              {hasKids ? (
                <button
                  onClick={() => toggleCollapsed(c.id)}
                  aria-label={expanded ? `Collapse ${c.name}` : `Expand ${c.name}`}
                  aria-expanded={expanded}
                  className="mt-0.5 rounded-md p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="mt-0.5 w-5" aria-hidden />
              )}
              <span className="min-w-0">
                <p className="font-medium text-foreground">
                  {c.name}
                  {hasKids && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold text-muted-foreground">{kids.length}</span>}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">{c.id}</p>
                {searching && c.parentId && (
                  <p className="text-[10px] italic text-muted-foreground">sub of {rows.find((r) => r.id === c.parentId)?.name ?? c.parentId}</p>
                )}
              </span>
            </div>
          </td>
          <td className="py-2.5 pr-4">
            <Badge variant="outline" className={cn("font-medium", GROUP_STYLE[c.group])}>{GROUP_LABEL[c.group]}</Badge>
          </td>
          <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
            {c.productCount === undefined ? "—" : formatNumber(c.productCount)}
          </td>
          <td className="py-2.5 pr-4">
            <Switch checked={c.visible} onCheckedChange={(v) => toggleVisible(c, v)} aria-label={`Toggle ${c.name}`} />
          </td>
          <td className="py-2.5 text-right">
            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => moveSibling(c, -1)}
                disabled={!canUp}
                title={searching ? "Clear the search to reorder" : "Move up among siblings"}
                aria-label={`Move ${c.name} up`}
                className="rounded-md p-2 text-muted-foreground transition enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => moveSibling(c, 1)}
                disabled={!canDown}
                title={searching ? "Clear the search to reorder" : "Move down among siblings"}
                aria-label={`Move ${c.name} down`}
                className="rounded-md p-2 text-muted-foreground transition enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-30"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button onClick={() => openEdit(c)} title="Rename / move / re-parent" aria-label={`Edit ${c.name}`} className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => setPendingDelete(c)} title="Delete" aria-label={`Delete ${c.name}`} className="rounded-md p-2 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </td>
        </tr>
        {expanded && kids.map((k) => renderNode(k, depth + 1))}
      </Fragment>
    );
  };

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search categories…" value={query} onChange={(e) => setQuery(e.target.value)} className="bg-white pl-9" aria-label="Search categories" />
        </div>
        <Button onClick={openCreate} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
          <Plus className="mr-2 h-4 w-4" /> New category
        </Button>
      </div>

      {/* honesty banner */}
      <div className="flex items-start gap-2.5 rounded-xl border border-hon-green-pale bg-hon-green-pale px-4 py-3 text-xs leading-5 text-hon-green-dark">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-hon-green-dark" />
        <p>
          Renaming keeps the existing slug (product references are never rewritten). Categories can nest under a parent — seeded categories
          ship flat, so create a parent first and drag the leaves under it via Edit → Parent. Visibility and hierarchy are demo-local;
          the storefront preview still reads its static seed data (tracked in docs/07-admin-integration §8).
        </p>
      </div>

      <SectionCard
        title={`${formatNumber(rows.length)} categories · ${formatNumber(totalProducts)} catalogued products`}
        action={<FolderTree className="h-4 w-4 text-muted-foreground" />}
      >
        {loading ? (
          <SectionSkeleton rows={8} />
        ) : error ? (
          <EmptyState icon={Tags} title="Categories unavailable" hint={error} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Tags} title="No categories found" hint="Clear the search or add a new category." />
        ) : (
          <div className="space-y-6">
            {GROUP_ORDER.map((group) => {
              const roots = (byParent.get(undefined) ?? []).filter((c) => c.group === group.key);
              if (roots.length === 0) return null;
              return (
                <div key={group.key}>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{group.label}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-4">Category</th>
                          <th className="py-2 pr-4">Group</th>
                          <th className="py-2 pr-4 text-right">Products</th>
                          <th className="py-2 pr-4">Visible</th>
                          <th className="py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-muted">
                        {roots.map((c) => renderNode(c, 0))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* create / edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "New category" : `Edit “${dialog?.category.name}”`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="category-name">Name</label>
              <Input id="category-name" autoFocus={dialog?.mode === "create"} value={draftName} onChange={(e) => setDraftName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveDialog(); }} placeholder="Executive tables" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="category-group">Group</label>
              <Select value={draftGroup} onValueChange={(v) => setDraftGroup(v as Group)}>
                <SelectTrigger id="category-group" className="bg-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Office Furniture</SelectItem>
                  <SelectItem value="home">Home Furniture</SelectItem>
                  <SelectItem value="ungrouped">Ungrouped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="category-parent">Parent <span className="font-normal">(optional)</span></label>
              <Select value={draftParent} onValueChange={setDraftParent}>
                <SelectTrigger id="category-parent" className="bg-white"><SelectValue placeholder="Top level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT}>None — top level</SelectItem>
                  {parentOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">Re-parenting a category moves it (and its children) into the new scope.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={saveDialog} disabled={saving} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialog?.mode === "create" ? "Create category" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">This removes the category from the taxonomy. Products using it must be reassigned first, and a category that still contains children cannot be deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={deleting} className="bg-rose-600 text-white hover:bg-rose-500">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
