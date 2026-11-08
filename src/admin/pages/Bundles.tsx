import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Boxes, Check, Loader2, Minus, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminBundle, AdminBundleLine, BundleStatus } from "@/api/types";
import { bundleMath, bundleUnitCount } from "@/lib/bundles";
import { BUNDLE_IMAGES, bundleImage } from "@/lib/bundleImages";
import { products as catalogue } from "@/data/products";
import { formatDate, formatPKR, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS_TONE: Record<BundleStatus, string> = {
  active: "bg-hon-green/10 text-hon-green-dark",
  draft: "bg-amber-100 text-amber-800",
  archived: "bg-secondary text-muted-foreground",
};

const productById = new Map(catalogue.map((p) => [p.id, p]));

type EditorState = null | { mode: "create" } | { mode: "edit"; bundle: AdminBundle };

export default function AdminBundles() {
  const api = useMemo(() => getAdminApi(), []);
  const [rows, setRows] = useState<AdminBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BundleStatus>("all");

  const [editor, setEditor] = useState<EditorState>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminBundle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fImage, setFImage] = useState("desk");
  const [fPct, setFPct] = useState(10);
  const [fPopular, setFPopular] = useState(false);
  const [fLines, setFLines] = useState<AdminBundleLine[]>([]);
  const [pQuery, setPQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listBundles());
    } catch (e) {
      console.error(e);
      toast.error("Could not load bundles.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    active: rows.filter((r) => r.status === "active").length,
    draft: rows.filter((r) => r.status === "draft").length,
    archived: rows.filter((r) => r.status === "archived").length,
  }), [rows]);

  const visible = useMemo(() => rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [r.name, r.description ?? "", String(r.discountPct)].join(" ").toLowerCase().includes(q);
  }), [rows, query, statusFilter]);

  const searchResults = useMemo(() => {
    const q = pQuery.trim().toLowerCase();
    if (!q) return [];
    return catalogue.filter((p) =>
      p.name.toLowerCase().includes(q) || p.id.includes(q) || p.category.toLowerCase().includes(q),
    ).slice(0, 7);
  }, [pQuery]);

  const math = useMemo(
    () => bundleMath({ lines: fLines, discountPct: fPct }, (id) => productById.get(id)),
    [fLines, fPct],
  );

  const resetForm = () => {
    setFName(""); setFDesc(""); setFImage("desk"); setFPct(10); setFPopular(false); setFLines([]); setPQuery("");
  };

  const openCreate = () => { resetForm(); setEditor({ mode: "create" }); };
  const openEdit = (bundle: AdminBundle) => {
    setFName(bundle.name); setFDesc(bundle.description ?? ""); setFImage(bundle.image);
    setFPct(bundle.discountPct); setFPopular(bundle.popular);
    setFLines(bundle.lines.map((l) => ({ ...l }))); setPQuery("");
    setEditor({ mode: "edit", bundle });
  };

  const addLine = (productId: string) => {
    setFLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) return prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l));
      return [...prev, { productId, quantity: 1 }];
    });
    setPQuery("");
  };
  const updateQty = (productId: string, delta: number) =>
    setFLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(1, Math.min(99, l.quantity + delta)) } : l)));
  const setQty = (productId: string, qty: number) =>
    setFLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, quantity: Math.max(1, Math.min(99, Math.floor(qty) || 1)) } : l)));
  const removeLine = (productId: string) => setFLines((prev) => prev.filter((l) => l.productId !== productId));

  const persist = async (activate: boolean) => {
    const name = fName.trim();
    if (!name) { toast.error("Give the bundle a name."); return; }
    if (fLines.length === 0) { toast.error("Add at least one product to the bundle."); return; }
    setSaving(true);
    try {
      const payload = { name, description: fDesc.trim() || undefined, image: fImage, lines: fLines, discountPct: fPct, popular: fPopular, sortOrder: editor?.mode === "edit" ? editor.bundle.sortOrder : undefined };
      if (editor?.mode === "edit") {
        const saved = await api.updateBundle(editor.bundle.id, payload);
        if (!saved) throw new Error("Bundle vanished mid-edit — reload and retry.");
        if (activate && saved.status !== "active") await api.setBundleStatus(saved.id, "active");
        toast.success(activate ? "Saved & activated — live on /room-packages." : "Bundle saved.");
      } else {
        const created = await api.createBundle(payload);
        if (activate) await api.setBundleStatus(created.id, "active");
        toast.success(activate ? "Bundle created & activated." : "Bundle created as draft.");
      }
      setEditor(null);
      void load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not save the bundle.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (bundle: AdminBundle, next: BundleStatus) => {
    try {
      await api.setBundleStatus(bundle.id, next);
      toast.success(next === "active" ? "Activated — live on /room-packages." : next === "archived" ? "Archived." : "Moved to draft.");
      void load();
    } catch (e) {
      console.error(e);
      toast.error("Could not change the status.");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteBundle(pendingDelete.id);
      toast.success("Bundle deleted.");
      setPendingDelete(null);
      void load();
    } catch (e) {
      console.error(e);
      toast.error("Could not delete the bundle.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2"><Boxes className="h-6 w-6 text-accent" /> Bundles</h1>
          <p className="text-sm text-muted-foreground mt-1">Curated room packages — catalogue-driven pricing, one "get quote" flow on the storefront.</p>
          <p className="text-xs text-muted-foreground mt-1">Activated <span className="font-semibold text-hon-green-dark">{counts.active}</span> · Draft {counts.draft} · Archived {counts.archived}</p>
        </div>
        <Button onClick={openCreate} className="bg-accent text-accent-foreground hover:bg-hon-green-dark"><Plus className="h-4 w-4 mr-1.5" /> New bundle</Button>
      </div>

      <SectionCard title="Room packages">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Search bundles" placeholder="Search bundles…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
          <ToggleGroup type="single" value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as "all" | BundleStatus)} aria-label="Filter bundles by status" className="h-10 rounded-md bg-muted p-1">
            <ToggleGroupItem value="all" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">All ({rows.length})</ToggleGroupItem>
            <ToggleGroupItem value="active" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Activated ({counts.active})</ToggleGroupItem>
            <ToggleGroupItem value="draft" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Draft ({counts.draft})</ToggleGroupItem>
            <ToggleGroupItem value="archived" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Archived ({counts.archived})</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {loading ? (
          <SectionSkeleton rows={6} />
        ) : visible.length === 0 ? (
          <EmptyState icon={Boxes} title={rows.length === 0 ? "No bundles yet" : "Nothing matches"} hint={rows.length === 0 ? "Create your first room package — it starts as a draft for review." : "Try a different search or tab."} />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((bundle) => {
              const m = bundleMath(bundle, (id) => productById.get(id));
              const units = bundleUnitCount(bundle);
              return (
                <li key={bundle.id} className="flex flex-wrap items-center gap-4 py-4">
                  <img src={bundleImage(bundle.image)} alt={bundle.name} className="h-[72px] w-24 flex-shrink-0 rounded-md object-cover border border-border" />
                  <div className="min-w-[220px] flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-foreground">{bundle.name}</p>
                      {bundle.popular && <Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-label="Most popular" />}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONE[bundle.status]}`}>{bundle.status}</span>
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-hon-green-dark">Save {bundle.discountPct}%</span>
                    </div>
                    {bundle.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{bundle.description}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{bundle.lines.length} products · {units} units · updated {formatDate(bundle.updatedAt)}</p>
                  </div>
                  <div className="text-right min-w-[150px]">
                    <p className="text-base font-black text-foreground">{formatPKR(m.price)}</p>
                    <p className="text-[11px] text-muted-foreground line-through">{formatPKR(m.retail)}</p>
                    <p className="text-[11px] font-semibold text-hon-green-dark">save {formatPKR(m.save)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" aria-label={`Edit ${bundle.name}`} onClick={() => openEdit(bundle)}><Pencil className="h-4 w-4" /></Button>
                    {bundle.status !== "active" && (
                      <Button size="icon" variant="ghost" title="Activate" aria-label={`Activate ${bundle.name}`} onClick={() => void toggleStatus(bundle, "active")}><Check className="h-4 w-4 text-hon-green-dark" /></Button>
                    )}
                    {bundle.status === "active" && (
                      <Button size="icon" variant="ghost" title="Archive" aria-label={`Archive ${bundle.name}`} onClick={() => void toggleStatus(bundle, "archived")}><Archive className="h-4 w-4 text-muted-foreground" /></Button>
                    )}
                    {bundle.status === "archived" && (
                      <Button size="icon" variant="ghost" title="Unarchive to draft" aria-label={`Unarchive ${bundle.name}`} onClick={() => void toggleStatus(bundle, "draft")}><Boxes className="h-4 w-4 text-muted-foreground" /></Button>
                    )}
                    <Button size="icon" variant="ghost" aria-label={`Delete ${bundle.name}`} onClick={() => setPendingDelete(bundle)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* Create / edit dialog */}
      <Dialog open={editor !== null} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editor?.mode === "edit" ? "Edit bundle" : "New bundle"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="bun-name" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</label>
              <Input id="bun-name" autoFocus placeholder="e.g. Boardroom Refresh Kit" value={fName} onChange={(e) => setFName(e.target.value)} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="bun-desc" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</label>
              <Textarea id="bun-desc" rows={2} placeholder="One line the storefront shows under the title." value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Image</span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {BUNDLE_IMAGES.map((img) => (
                  <button
                    key={img.key}
                    type="button"
                    onClick={() => setFImage(img.key)}
                    aria-pressed={fImage === img.key}
                    title={img.label}
                    className={`rounded-md border-2 overflow-hidden transition ${fImage === img.key ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/60"}`}
                  >
                    <img src={img.src} alt={img.label} className="h-16 w-full object-cover" />
                    <span className="block text-[9px] px-1 py-0.5 text-muted-foreground truncate">{img.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="bun-pct" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bundle discount — {fPct}%</label>
              <input id="bun-pct" type="range" min={0} max={40} step={1} value={fPct} onChange={(e) => setFPct(Number(e.target.value))} className="w-full accent-[hsl(var(--accent))]" aria-valuemin={0} aria-valuemax={40} aria-valuenow={fPct} aria-label="Bundle discount percent" />
              <div className="rounded-md bg-secondary px-3 py-2 text-[11px] leading-5 space-y-0.5">
                <div className="flex justify-between"><span className="text-muted-foreground">Retail value</span><span>{formatPKR(math.retail)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Discount ({fPct}%)</span><span>−{formatPKR(math.retail - math.price)}</span></div>
                <div className="flex justify-between font-bold text-foreground"><span>Customer pays</span><span>{formatPKR(math.price)}</span></div>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Popular ribbon</span>
              <button
                type="button"
                onClick={() => setFPopular((v) => !v)}
                aria-pressed={fPopular}
                className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${fPopular ? "border-amber-400 bg-amber-50 text-amber-800" : "border-border text-muted-foreground hover:border-amber-300"}`}
              >
                <Star className={`h-4 w-4 ${fPopular ? "fill-amber-400 text-amber-500" : ""}`} /> {fPopular ? "Marked “Most Popular Choice”" : "Mark as most popular"}
              </button>
            </div>

            {/* Lines builder */}
            <div className="sm:col-span-2 space-y-2">
              <label htmlFor="bun-picker" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Products ({fLines.length})</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="bun-picker" placeholder="Find a product by name or category…" value={pQuery} onChange={(e) => setPQuery(e.target.value)} className="pl-9" autoComplete="off" />
                {searchResults.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                    {searchResults.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => addLine(p.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary transition">
                          <img src={p.images[0]} alt="" className="h-9 w-9 rounded object-cover bg-section-light flex-shrink-0" />
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{p.name}</span><span className="block text-[11px] text-muted-foreground">{p.category} · {formatPKR(p.price)}</span></span>
                          <Plus className="h-4 w-4 text-accent flex-shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {fLines.length > 0 && (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {fLines.map((line) => {
                    const p = productById.get(line.productId);
                    if (!p) return null;
                    return (
                      <li key={line.productId} className="flex items-center gap-3 px-3 py-2">
                        <img src={p.images[0]} alt="" className="h-10 w-10 rounded object-cover bg-section-light flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">{formatPKR(p.price)} each</p>
                        </div>
                        <div className="flex items-center rounded-md border border-border">
                          <button type="button" aria-label="Decrease quantity" onClick={() => updateQty(line.productId, -1)} className="p-1.5 hover:bg-secondary rounded-l-md"><Minus className="h-3.5 w-3.5" /></button>
                          <input aria-label="Quantity" type="number" min={1} max={99} value={line.quantity} onChange={(e) => setQty(line.productId, Number(e.target.value))} className="h-7 w-12 border-0 bg-transparent text-center text-sm focus:outline-none" />
                          <button type="button" aria-label="Increase quantity" onClick={() => updateQty(line.productId, +1)} className="p-1.5 hover:bg-secondary rounded-r-md"><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                        <span className="w-24 text-right text-sm font-semibold">{formatPKR(p.price * line.quantity)}</span>
                        <button type="button" aria-label={`Remove ${p.name}`} onClick={() => removeLine(line.productId)} className="p-1.5 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {fLines.length === 0 && <p className="text-[11px] text-muted-foreground">No products yet — search above and click to add. Price, stock and discount are resolved live from the catalogue.</p>}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setEditor(null)} disabled={saving}>Cancel</Button>
            <Button variant="secondary" onClick={() => void persist(false)} disabled={saving || fLines.length === 0 || !fName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {editor?.mode === "edit" ? "Save changes" : "Save draft"}
            </Button>
            <Button className="bg-accent text-accent-foreground hover:bg-hon-green-dark" onClick={() => void persist(true)} disabled={saving || fLines.length === 0 || !fName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
              Save & activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delete bundle</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <span className="font-semibold text-foreground">“{pendingDelete?.name}”</span>? The storefront stops showing it immediately. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
