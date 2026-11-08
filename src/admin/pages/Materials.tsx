import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import {
  MATERIAL_CATEGORY_LABELS,
  MATERIAL_PART_LABELS,
  type AdminMaterial,
  type AdminMaterialBrightness,
  type AdminMaterialCategory,
  type AdminMaterialPart,
} from "@/api/types";
import { SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type CategoryFilter = AdminMaterialCategory | "all";

type MaterialForm = {
  name: string;
  category: AdminMaterialCategory;
  brightness: AdminMaterialBrightness;
  image: string;
  hex: string;
  description: string;
  applicableTo: AdminMaterialPart[];
  active: boolean;
  sortOrder: string;
};

const emptyForm: MaterialForm = {
  name: "",
  category: "wood",
  brightness: "all",
  image: "",
  hex: "",
  description: "",
  applicableTo: [],
  active: true,
  sortOrder: "",
};

const PARTS: AdminMaterialPart[] = ["worktop", "panel", "storage", "frame", "seating"];
const BRIGHTNESS: AdminMaterialBrightness[] = ["light", "medium", "dark", "all"];
const ALL_PART_HINT = "Applicable to all room-configurator hotspots";

const inputCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function SwatchPreview({ m }: { m: AdminMaterial }) {
  if (m.image) {
    return (
      <img
        src={m.image}
        alt={m.name}
        className="h-9 w-14 rounded-sm border border-border object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <div
      className="h-9 w-14 rounded-sm border border-border"
      style={{ backgroundColor: m.hex ?? "#888888" }}
      role="img"
      aria-label={`Color swatch ${m.hex ?? ""}`.trim()}
    />
  );
}

export default function AdminMaterials() {
  const api = useMemo(() => getAdminApi(), []);
  const [items, setItems] = useState<AdminMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");

  const [dialog, setDialog] = useState<null | { mode: "create" } | { mode: "edit"; material: AdminMaterial }>(null);
  const [form, setForm] = useState<MaterialForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminMaterial | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listMaterials());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load materials");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<CategoryFilter, number> = { all: items.length, wood: 0, laminate: 0, metal: 0, fabric: 0 };
    for (const m of items) c[m.category] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((m) => {
      if (tab !== "all" && m.category !== tab) return false;
      if (!q) return true;
      return [m.name, m.description ?? "", m.hex ?? "", m.image ? "image" : "color hex"].some((f) =>
        f.toLowerCase().includes(q),
      );
    });
  }, [items, tab, query]);

  const openCreate = () => {
    setForm({ ...emptyForm, sortOrder: String(Math.max(0, ...items.map((i) => i.sortOrder)) + 10) });
    setFormError(null);
    setDialog({ mode: "create" });
  };

  const openEdit = (material: AdminMaterial) => {
    setForm({
      name: material.name,
      category: material.category,
      brightness: material.brightness,
      image: material.image ?? "",
      hex: material.hex ?? "",
      description: material.description ?? "",
      applicableTo: [...material.applicableTo],
      active: material.active,
      sortOrder: String(material.sortOrder),
    });
    setFormError(null);
    setDialog({ mode: "edit", material });
  };

  const togglePart = (part: AdminMaterialPart) =>
    setForm((f) => ({
      ...f,
      applicableTo: f.applicableTo.includes(part)
        ? f.applicableTo.filter((p) => p !== part)
        : [...f.applicableTo, part],
    }));

  const handleSave = async () => {
    const name = form.name.trim();
    const image = form.image.trim();
    const hex = form.hex.trim();
    if (!name) {
      setFormError("Give the finish a name.");
      return;
    }
    if (!image && !hex) {
      setFormError("Add an image URL or a hex color — a finish needs at least one.");
      return;
    }
    if (hex && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
      setFormError("Hex must look like #3e2723 or #abc.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      name,
      category: form.category,
      brightness: form.brightness,
      image: image || undefined,
      hex: hex || undefined,
      description: form.description.trim() || undefined,
      applicableTo: form.applicableTo,
      active: form.active,
      sortOrder: form.sortOrder.trim() ? Number(form.sortOrder) : undefined,
    };
    try {
      if (dialog?.mode === "edit") {
        await api.updateMaterial(dialog.material.id, payload);
        toast.success(`Updated “${name}”`);
      } else {
        await api.createMaterial(payload);
        toast.success(`Created “${name}”`);
      }
      setDialog(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (material: AdminMaterial) => {
    try {
      await api.setMaterialActive(material.id, !material.active);
      setItems((prev) => prev.map((m) => (m.id === material.id ? { ...m, active: !m.active } : m)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not toggle visibility");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const ok = await api.deleteMaterial(deleteTarget.id);
      if (ok) {
        toast.success(`Deleted “${deleteTarget.name}”`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Material not found — refresh and try again.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as CategoryFilter)} aria-label="Filter materials by category" className="h-auto flex-wrap justify-start rounded-md bg-muted p-1">
          {(["all", "wood", "laminate", "metal", "fabric"] as CategoryFilter[]).map((c) => (
            <ToggleGroupItem key={c} value={c} className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">
              {c === "all" ? `All (${counts.all})` : `${MATERIAL_CATEGORY_LABELS[c]} (${counts[c]})`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <div className="relative sm:max-w-xs w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, hex, description…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
          <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
            <Plus className="mr-1.5 h-4 w-4" /> Add finish
          </Button>
        </div>
      </div>

      <SectionCard title="Materials & Finishes">
        {loading ? (
          <SectionSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Layers} title="No finishes match" hint="Adjust the filter or add a new finish." />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Finish</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Brightness</TableHead>
                  <TableHead>Parts</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id} className={m.active ? undefined : "opacity-50"}>
                    <TableCell><SwatchPreview m={m} /></TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug">{m.name}</p>
                      {m.description && <p className="text-[11px] text-muted-foreground line-clamp-1 max-w-[220px]">{m.description}</p>}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{MATERIAL_CATEGORY_LABELS[m.category]}</Badge></TableCell>
                    <TableCell>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {m.image ? "Image" : "Color"}
                      </span>
                    </TableCell>
                    <TableCell className="capitalize text-sm text-muted-foreground">{m.brightness}</TableCell>
                    <TableCell>
                      {m.applicableTo.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">Swatch only</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-[180px]" title={ALL_PART_HINT}>
                          {m.applicableTo.slice(0, 3).map((p) => (
                            <span key={p} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {MATERIAL_PART_LABELS[p]}
                            </span>
                          ))}
                          {m.applicableTo.length > 3 && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              +{m.applicableTo.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch checked={m.active} onCheckedChange={() => handleToggleActive(m)} aria-label={`Toggle ${m.name}`} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)} aria-label={`Edit ${m.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(m)} aria-label={`Delete ${m.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Seeded from the storefront catalogue on first load — the same rows feed the room configurator (image finishes)
          and the /materials page (hex swatches). “Swatch only” rows appear on /materials; “Image” rows appear in the configurator.
        </p>
      </SectionCard>

      {/* Create / edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? "Edit finish" : "Add finish"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mat-name">Name *</Label>
              <Input id="mat-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Natural Oak" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mat-category">Category</Label>
                <select id="mat-category" className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as AdminMaterialCategory })}>
                  {(Object.keys(MATERIAL_CATEGORY_LABELS) as AdminMaterialCategory[]).map((c) => (
                    <option key={c} value={c}>{MATERIAL_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mat-brightness">Brightness</Label>
                <select id="mat-brightness" className={inputCls} value={form.brightness} onChange={(e) => setForm({ ...form, brightness: e.target.value as AdminMaterialBrightness })}>
                  {BRIGHTNESS.map((b) => (
                    <option key={b} value={b} className="capitalize">{b}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mat-image">Image URL</Label>
              <Input id="mat-image" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="https://… or data:image/webp;base64,…" />
              <p className="text-[11px] text-muted-foreground">Paste a hosted URL or a data URL (e.g. from the Media library). Required for configurator finishes.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mat-hex">Hex color (swatches)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick color"
                  value={/^#[0-9a-fA-F]{6}$/.test(form.hex) ? form.hex : "#3e2723"}
                  onChange={(e) => setForm({ ...form, hex: e.target.value })}
                  className="h-10 w-12 cursor-pointer rounded border border-input bg-background p-1"
                />
                <Input id="mat-hex" value={form.hex} onChange={(e) => setForm({ ...form, hex: e.target.value })} placeholder="#3e2723" className="font-mono" />
                {form.hex && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setForm({ ...form, hex: "" })} aria-label="Clear hex">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">Required for /materials page swatches. Image OR hex is enough — give both for a complete finish.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mat-desc">Description</Label>
              <Textarea id="mat-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Rich, deep brown with natural grain" />
            </div>

            <div className="space-y-1.5">
              <Label>Room configurator — applicable parts</Label>
              <div className="flex flex-wrap gap-1.5">
                {PARTS.map((p) => {
                  const on = form.applicableTo.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => togglePart(p)}
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        on ? "border-accent bg-accent text-accent-foreground" : "border-border bg-muted text-muted-foreground hover:border-accent/60"
                      }`}
                    >
                      {MATERIAL_PART_LABELS[p]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">Leave all off to keep this as a /materials swatch only.</p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/40 px-3 py-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="mat-active">Active</Label>
                <p className="text-[11px] text-muted-foreground">Inactive finishes disappear from the storefront and configurator.</p>
              </div>
              <Switch id="mat-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mat-sort">Sort order</Label>
                <Input id="mat-sort" type="number" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} placeholder="Auto" />
              </div>
            </div>

            {formError && <p className="text-xs font-medium text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {saving ? "Saving…" : dialog?.mode === "edit" ? "Save changes" : "Add finish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.name}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the finish everywhere it is managed here (demo DB). Bundled fallback data stays code-managed and is untouched.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep it</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
