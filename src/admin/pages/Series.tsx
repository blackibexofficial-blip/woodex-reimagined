import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminSeries } from "@/api/types";
import { formatDate, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type FormState = {
  id: string; name: string; tagline: string; badge: string; description: string;
  features: string; color: string; active: boolean; sortOrder: string;
};
const emptyForm: FormState = {
  id: "", name: "", tagline: "", badge: "", description: "", features: "",
  color: "#5a7a3a", active: true, sortOrder: "",
};

const slugify = (name: string) =>
  name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function AdminSeries() {
  const api = useMemo(() => getAdminApi(), []);
  const [items, setItems] = useState<AdminSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminSeries | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminSeries | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, all] = await Promise.all([
        api.listSeries(),
        api.listProducts({ perPage: 5000 }).catch(() => ({ items: [], total: 0, page: 1, perPage: 5000 })),
      ]);
      setItems(rows);
      const map: Record<string, number> = {};
      for (const p of all.items as Array<{ seriesId?: string }>) {
        if (p.seriesId) map[p.seriesId] = (map[p.seriesId] ?? 0) + 1;
      }
      setCounts(map);
    } catch {
      toast.error("Could not load series.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => [s.name, s.id, s.tagline, s.badge].some((f) => f.toLowerCase().includes(q)));
  }, [items, query]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => { setEditTarget(null); setForm(emptyForm); setEditorOpen(true); };
  const openEdit = (s: AdminSeries) => {
    setEditTarget(s);
    setForm({
      id: s.id, name: s.name, tagline: s.tagline, badge: s.badge, description: s.description,
      features: s.features.join("\n"), color: s.color, active: s.active, sortOrder: String(s.sortOrder),
    });
    setEditorOpen(true);
  };

  const idPreview = editTarget ? editTarget.id : (form.id.trim() || slugify(form.name));

  const save = async () => {
    const features = form.features.split("\n").map((f) => f.trim()).filter(Boolean);
    const payload = {
      id: editTarget ? undefined : (idPreview || undefined),
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      badge: form.badge.trim(),
      description: form.description.trim(),
      features,
      color: form.color.trim(),
      active: form.active,
      sortOrder: form.sortOrder.trim() === "" ? undefined : Number(form.sortOrder),
    };
    if (!payload.name) return toast.error("Series name is required.");
    if (payload.sortOrder !== undefined && Number.isNaN(payload.sortOrder)) return toast.error("Sort order must be a number.");
    setSaving(true);
    try {
      if (editTarget) {
        const updated = await api.updateSeries(editTarget.id, payload);
        if (updated) toast.success(`${updated.name} saved.`);
      } else {
        const created = await api.createSeries(payload);
        toast.success(`${created.id} added — /series/${created.id} is the storefront deep-link (live after the Bagisto cutover).`);
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the series.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: AdminSeries) => {
    try {
      const updated = await api.setSeriesActive(s.id, !s.active);
      if (updated) toast.success(`${updated.name} — ${updated.active ? "live" : "hidden"}.`);
      await load();
    } catch {
      toast.error("Could not update series status.");
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const okFlag = await api.deleteSeries(deleteTarget.id);
      if (okFlag) {
        toast.success(`${deleteTarget.name} deleted.`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Series not found — or still referenced by catalogue products.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search series by name, slug or badge…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search series"
          />
        </div>
        <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
          <Plus className="mr-1.5 h-4 w-4" /> New series
        </Button>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Furniture Series — the collection taxonomy behind the storefront <span className="font-semibold">/series/:seriesId</span> pages.
        Products link here via <code className="rounded bg-secondary px-1">seriesId</code> (set it in the product editor’s Furniture Series picker).
        A series that is still referenced by products cannot be deleted — hide it instead. The storefront keeps reading the static master
        until the Bagisto cutover; deletes are also refused while any product still references the series.
      </p>

      <SectionCard title={`Furniture Series (${filtered.length})`}>
        {loading ? (
          <SectionSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No series found"
            hint={query ? "Try a different search — name, slug or badge." : "Add your collection taxonomy — Infinity, Ek, Nova, Cubicle…"}
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Series</TableHead>
                  <TableHead>Tagline</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const count = counts[s.id] ?? 0;
                  return (
                    <TableRow key={s.id} className={cn(!s.active && "opacity-60")}>
                      <TableCell>
                        <p className="flex items-center gap-2 text-sm font-semibold leading-snug">
                          <span
                            aria-hidden="true"
                            className="inline-block h-4 w-4 rounded-full border border-black/10 ring-1 ring-black/5"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                          <Badge variant="outline" className="text-[9px] font-semibold uppercase tracking-wide">{s.badge}</Badge>
                        </p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{s.id}</p>
                      </TableCell>
                      <TableCell className="max-w-[220px] text-xs text-muted-foreground">{s.tagline}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">{count}</TableCell>
                      <TableCell>
                        <button type="button" onClick={() => toggleActive(s)} aria-pressed={s.active} title={s.active ? "Hide series" : "Show series"}>
                          <Badge variant="outline" className={cn("font-medium cursor-pointer", s.active ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600")}>
                            {s.active ? "Live" : "Hidden"}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{s.sortOrder}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} aria-label={`Edit ${s.id}`} title="Edit series">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)} aria-label={`Delete ${s.id}`} title="Delete series" disabled={count > 0}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* ── create / edit dialog ────────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={(open) => !open && setEditorOpen(false)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Layers className="h-5 w-5 text-hon-green-dark" /> {editTarget ? `Edit ${editTarget.name}` : "New furniture series"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ser-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">Series name *</Label>
                <Input id="ser-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ek Series" className="bg-white" autoFocus />
              </div>
              <div>
                <Label htmlFor="ser-id" className="mb-1.5 block text-xs font-medium text-muted-foreground">Slug {editTarget ? "(locked)" : "(auto from name)"}</Label>
                <Input id="ser-id" value={editTarget ? editTarget.id : (form.id.trim() || idPreview)} onChange={(e) => set("id", e.target.value)} placeholder={idPreview || "ek-series"} disabled={!!editTarget} className="bg-white font-mono text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ser-tagline" className="mb-1.5 block text-xs font-medium text-muted-foreground">Tagline</Label>
                <Input id="ser-tagline" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Affordable quality for every workspace" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="ser-badge" className="mb-1.5 block text-xs font-medium text-muted-foreground">Badge</Label>
                <Input id="ser-badge" value={form.badge} onChange={(e) => set("badge", e.target.value)} placeholder="Budget-Friendly" className="bg-white" />
              </div>
            </div>
            <div>
              <Label htmlFor="ser-desc" className="mb-1.5 block text-xs font-medium text-muted-foreground">Description</Label>
              <Textarea id="ser-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What this collection stands for — materials, warranty story, target buyer…" className="bg-white" />
            </div>
            <div>
              <Label htmlFor="ser-features" className="mb-1.5 block text-xs font-medium text-muted-foreground">Features (one per line — shown on the series page)</Label>
              <Textarea id="ser-features" rows={3} value={form.features} onChange={(e) => set("features", e.target.value)} placeholder={"Engineered wood construction\nPowder-coated steel frames\n3-year warranty"} className="bg-white font-mono text-[11px]" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="ser-color" className="mb-1.5 block text-xs font-medium text-muted-foreground">Accent</Label>
                <div className="flex items-center gap-2">
                  <input id="ser-color" type="color" value={form.color} onChange={(e) => set("color", e.target.value)} className="h-9 w-12 cursor-pointer rounded-md border border-border bg-white p-1" aria-label="Series accent colour" />
                  <Input value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="#5a7a3a" className="bg-white font-mono text-xs" aria-label="Series accent hex" />
                </div>
              </div>
              <div>
                <Label htmlFor="ser-sort" className="mb-1.5 block text-xs font-medium text-muted-foreground">Sort order</Label>
                <Input id="ser-sort" inputMode="numeric" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} placeholder="10" className="bg-white" />
              </div>
            </div>
            <label className="flex w-max items-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-sm text-foreground">
              <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} /> Live on the storefront series list
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editTarget ? "Save changes" : "Add series"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── delete confirm ──────────────────────────────────────────── */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /> Delete series?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{deleteTarget?.name}</span> (<code className="text-foreground">{deleteTarget?.id}</code>) will be removed from the series master.
            Products referencing it keep their <code className="text-foreground">seriesId</code> — the /series/{deleteTarget?.id} page would 404 for them.
            {(counts[deleteTarget?.id ?? ""] ?? 0) > 0 && <span className="mt-1 block font-medium text-amber-700">Still referenced by {counts[deleteTarget?.id ?? ""]} product(s) — the delete will be refused.</span>}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep it</Button>
            <Button onClick={doDelete} disabled={deleting} variant="destructive">
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
