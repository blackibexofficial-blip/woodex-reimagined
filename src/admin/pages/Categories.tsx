import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderTree, Info, Loader2, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
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

export default function AdminCategories() {
  const api = useMemo(() => getAdminApi(), []);
  const [rows, setRows] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // create / edit dialog
  const [dialog, setDialog] = useState<null | { mode: "create" } | { mode: "edit"; category: AdminCategory }>(null);
  const [draftName, setDraftName] = useState("");
  const [draftGroup, setDraftGroup] = useState<Group>("office");
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

  const grouped = useMemo(() => {
    const office = filtered.filter((c) => c.group === "office");
    const home = filtered.filter((c) => c.group === "home");
    const other = filtered.filter((c) => c.group === "ungrouped");
    return [
      { label: "Office Furniture", rows: office },
      { label: "Home Furniture", rows: home },
      { label: "Ungrouped", rows: other },
    ].filter((g) => g.rows.length > 0);
  }, [filtered]);

  const openCreate = () => { setDraftName(""); setDraftGroup("office"); setDialog({ mode: "create" }); };
  const openEdit = (category: AdminCategory) => { setDraftName(category.name); setDraftGroup(category.group); setDialog({ mode: "edit", category }); };

  const saveDialog = async () => {
    const name = draftName.trim();
    if (!name) { toast.error("Give the category a name."); return; }
    setSaving(true);
    try {
      if (dialog?.mode === "create") {
        const created = await api.createCategory({ name, group: draftGroup });
        toast.success(`Category “${created.name}” added.`);
      } else if (dialog?.mode === "edit") {
        await api.updateCategory(dialog.category.id, { name, group: draftGroup });
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

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search categories…" value={query} onChange={(e) => setQuery(e.target.value)} className="bg-white pl-9" />
        </div>
        <Button onClick={openCreate} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
          <Plus className="mr-2 h-4 w-4" /> New category
        </Button>
      </div>

      {/* honesty banner */}
      <div className="flex items-start gap-2.5 rounded-xl border border-hon-green-pale bg-hon-green-pale px-4 py-3 text-xs leading-5 text-hon-green-dark">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-hon-green-dark" />
        <p>
          Renaming keeps the existing slug (product references are never rewritten). Visibility is stored in the demo
          database and will be honoured once the catalogue is served from the live backend
          (<code className="font-mono">backend/supabase</code> or Bagisto) — the storefront preview still reads its static seed data.
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
            {grouped.map((group) => (
              <div key={group.label}>
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
                      {group.rows.map((c) => (
                        <tr key={c.id} className="hover:bg-secondary">
                          <td className="py-2.5 pr-4">
                            <p className="font-medium text-foreground">{c.name}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{c.id}</p>
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
                              <button onClick={() => openEdit(c)} title="Rename / move group" aria-label={`Edit ${c.name}`} className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={() => setPendingDelete(c)} title="Delete" aria-label={`Delete ${c.name}`} className="rounded-md p-2 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* create / edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="category-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</label>
              <Input id="category-name" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="e.g. Acoustic Pods" autoFocus />
            </div>
            <div>
              <label htmlFor="category-group" className="mb-1.5 block text-xs font-medium text-muted-foreground">Group</label>
              <Select value={draftGroup} onValueChange={(v) => setDraftGroup(v as Group)}>
                <SelectTrigger id="category-group"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Office Furniture</SelectItem>
                  <SelectItem value="home">Home Furniture</SelectItem>
                  <SelectItem value="ungrouped">Ungrouped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dialog?.mode === "edit" && (
              <p className="font-mono text-[10px] text-muted-foreground">slug: {dialog.category.id} (unchanged)</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={saveDialog} disabled={saving} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialog?.mode === "edit" ? "Save changes" : "Create category"}
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
          <p className="text-sm leading-6 text-muted-foreground">
            Categories in use by products can’t be deleted — move its products first. This only removes the category entry.
          </p>
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
