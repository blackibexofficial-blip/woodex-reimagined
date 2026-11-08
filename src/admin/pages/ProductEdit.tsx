/**
 * WOODEX admin — full-page product editor.
 * Routes: /admin/products/new (create) · /admin/products/:id/edit (edit).
 *
 * Redesign (2026-11-08) replacing the old edit dialog: identity + pricing
 * sections on the left, live summary rail on the right — matching the
 * "ProductEditor" reference layout (woodex-2030, apps/dashboard).
 *
 * Honest-data note: saving writes the shared catalog record through the
 * existing admin adapter (demo = this browser's localStorage; live backends
 * patch the shared catalog). It never rewrites the static storefront bundle —
 * the storefront catalogue is built from src/data/products.ts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Check, Eye, Loader2, Package, Plus, Save, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminCollection, AdminOptionSet, AdminProduct } from "@/api/types";
import { categories, categoryGroups, seriesList } from "@/data/products";
import { cn } from "@/lib/utils";
import { SectionCard, formatPKR } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const subcategoryOptions = categoryGroups
  .flatMap((g) => g.subcategories.map((s) => s.id))
  .sort();

interface FormState {
  name: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  stockStatus: AdminProduct["stockStatus"];
  inStock: boolean;
  isBestSeller: boolean;
  category: string;
  subcategory: string;
  seriesId: string;
  brandId: string;
  dimensions: string;
  weightKg: string;
  shortDescription: string;
  description: string;
  images: string; // one URL per line — first becomes the primary thumbnail
  optionSetIds: string[];
  specs: Array<{ label: string; value: string }>;
}

const EMPTY_FORM: FormState = {
  name: "",
  price: "",
  compareAtPrice: "",
  stock: "0",
  stockStatus: "in_stock",
  inStock: true,
  isBestSeller: false,
  category: "",
  subcategory: "",
  seriesId: "",
  brandId: "",
  dimensions: "",
  weightKg: "",
  shortDescription: "",
  description: "",
  images: "",
  optionSetIds: [],
  specs: [],
};

const toForm = (p: AdminProduct): FormState => ({
  name: p.name,
  price: String(p.price),
  compareAtPrice: p.compareAtPrice !== undefined ? String(p.compareAtPrice) : "",
  stock: String(p.stock),
  stockStatus: p.stockStatus,
  inStock: p.inStock,
  isBestSeller: p.isBestSeller,
  category: p.category,
  subcategory: p.subcategory ?? "",
  seriesId: p.seriesId ?? "",
  brandId: p.brandId ?? "",
  dimensions: p.dimensions ?? "",
  weightKg: p.weightKg !== undefined ? String(p.weightKg) : "",
  shortDescription: p.shortDescription ?? "",
  description: p.description ?? "",
  images: (p.images ?? (p.image ? [p.image] : [])).join("\n"),
  optionSetIds: p.optionSetIds ?? [],
  specs: p.specs ?? [],
});

const imageUrls = (s: string) => s.split("\n").map((u) => u.trim()).filter(Boolean).slice(0, 12);
const parseIntSafe = (s: string) => { const n = Math.floor(Number(s)); return Number.isFinite(n) && n >= 0 ? n : 0; };
const parseNum = (s: string) => { const n = Number(s); return Number.isFinite(n) && s.trim() !== "" ? n : NaN; };

function statusChip(status: AdminProduct["stockStatus"]) {
  if (status === "made_to_order") return { label: "Made to order", cls: "bg-sky-100 text-sky-800" };
  if (status === "out_of_stock") return { label: "Out of stock", cls: "bg-amber-100 text-amber-800" };
  return { label: "In stock", cls: "bg-emerald-100 text-emerald-800" };
}

export default function AdminProductEdit() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const api = useMemo(() => getAdminApi(), []);

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [original, setOriginal] = useState<AdminProduct | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [optionSets, setOptionSets] = useState<AdminOptionSet[]>([]);
  const [collections, setCollections] = useState<AdminCollection[]>([]);
  const [membership, setMembership] = useState<Set<string> | null>(null);
  const [seriesOptions, setSeriesOptions] = useState<Array<{ id: string; name: string; active: boolean }>>(seriesList.map(({ id, name }) => ({ id, name, active: true })));
  const [brandOptions, setBrandOptions] = useState<Array<{ id: string; name: string; active: boolean }>>([{ id: "woodex", name: "Woodex", active: true }]);

  /* reference data — same sources the old dialog used */
  useEffect(() => {
    api.listOptionSets().then(setOptionSets).catch(() => setOptionSets([]));
    api.listCollections().then(setCollections).catch(() => setCollections([]));
    api.listSeries().then((rows) => setSeriesOptions(rows.map(({ id, name, active }) => ({ id, name, active })))).catch(() => { /* static seriesList fallback */ });
    api.listBrands().then((rows) => setBrandOptions(rows.map(({ id, name, active }) => ({ id, name, active })))).catch(() => { /* woodex fallback */ });
  }, [api]);

  /* product under edit — via the adapter (demo DB), same surface as the rest of the admin */
  useEffect(() => {
    if (isNew) return;
    let alive = true;
    setLoading(true);
    setLoadError(null);
    api.listProducts({ perPage: 500 })
      .then((res) => {
        if (!alive) return;
        const found = res.items.find((p) => p.id === id) ?? null;
        if (!found) { setLoadError("That product could not be found — it may have been deleted."); return; }
        setOriginal(found);
        setForm(toForm(found));
      })
      .catch(() => { if (alive) setLoadError("Could not load this product. Try again, or go back to the catalogue."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [api, id, isNew]);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const previewUrls = imageUrls(form.images);
  const price = parseNum(form.price);
  const compareAt = form.compareAtPrice.trim() === "" ? undefined : parseNum(form.compareAtPrice);
  const salePercent = compareAt !== undefined && Number.isFinite(compareAt) && price > 0 && compareAt > price
    ? Math.round(((compareAt - price) / compareAt) * 100) : null;
  const chip = statusChip(form.stockStatus);

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required.";
    if (!form.category) return "Pick a category.";
    if (!Number.isFinite(price) || price < 0) return "Enter a valid price (PKR).";
    return null;
  };

  const buildUpdatePayload = () => ({
    name: form.name.trim(),
    price: parseNum(form.price),
    compareAtPrice: compareAt !== undefined && Number.isFinite(compareAt) ? compareAt : undefined,
    stock: parseIntSafe(form.stock),
    inStock: form.inStock,
    isBestSeller: form.isBestSeller,
    stockStatus: form.stockStatus,
    dimensions: form.dimensions.trim() || undefined,
    weightKg: form.weightKg.trim() === "" || Number.isNaN(Number(form.weightKg)) ? undefined : Number(form.weightKg),
    optionSetIds: form.optionSetIds,
    specs: form.specs.map((r) => ({ label: r.label.trim(), value: r.value.trim() })).filter((r) => r.label && r.value),
    shortDescription: form.shortDescription.trim() || undefined,
    description: form.description.trim() || undefined,
    images: previewUrls,
    image: previewUrls[0] ?? original?.image,
    subcategory: form.subcategory.trim() || undefined,
    seriesId: form.seriesId || undefined,
    brandId: form.brandId || undefined,
  });

  const save = async () => {
    const problem = validate();
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      if (isNew) {
        const created = await api.createProduct({
          name: form.name.trim(),
          category: form.category,
          subcategory: form.subcategory.trim() || undefined,
          price: parseNum(form.price),
          compareAtPrice: compareAt !== undefined && Number.isFinite(compareAt) ? compareAt : undefined,
          stock: parseIntSafe(form.stock),
          stockStatus: form.stockStatus,
          isBestSeller: form.isBestSeller,
          dimensions: form.dimensions.trim() || undefined,
          weightKg: form.weightKg.trim() === "" || Number.isNaN(Number(form.weightKg)) ? undefined : Number(form.weightKg),
        });
        toast.success(`Product created (${created.sku}). Fill in the rest, then save.`);
        navigate(`/admin/products/${created.id}/edit`, { replace: true });
        return;
      }
      if (!id) return;
      await api.updateProduct(id, buildUpdatePayload());
      /* sync manual-collection membership diffs (same semantics as the old dialog) */
      const manualCols = collections.filter((c) => c.kind === "manual");
      const finalSet = membership ?? new Set(manualCols.filter((c) => c.productIds.includes(id)).map((c) => c.id));
      const membershipUpdates = manualCols
        .filter((c) => c.productIds.includes(id) !== finalSet.has(c.id))
        .map((c) => {
          const nextIds = finalSet.has(c.id)
            ? [...c.productIds.filter((pid) => pid !== id), id]
            : c.productIds.filter((pid) => pid !== id);
          return api.updateCollection(c.id, { productIds: nextIds });
        });
      if (membershipUpdates.length > 0) {
        try {
          await Promise.all(membershipUpdates);
          setCollections(await api.listCollections());
        } catch {
          toast.error("Product saved, but updating collection membership failed.");
        }
      }
      setMembership(null);
      toast.success("Product updated.");
      navigate("/admin/products");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      const ok = await api.deleteProduct(id);
      toast[ok ? "success" : "error"](ok ? `“${form.name || id}” deleted.` : "Could not delete product.");
      if (ok) navigate("/admin/products");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete product.");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const specRow = (row: { label: string; value: string }, i: number) => (
    <div key={i} className="flex items-center gap-1.5">
      <Input
        value={row.label}
        onChange={(e) => set("specs", form.specs.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
        placeholder="Label (Dimensions)"
        className="w-36"
        aria-label={`Spec ${i + 1} label`}
      />
      <Input
        value={row.value}
        onChange={(e) => set("specs", form.specs.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
        placeholder="Value (e.g. 180 x 90 x 75 cm)"
        className="flex-1"
        aria-label={`Spec ${i + 1} value`}
      />
      <button
        type="button"
        className="shrink-0 text-muted-foreground hover:text-rose-500"
        aria-label={`Remove spec ${i + 1}`}
        onClick={() => set("specs", form.specs.filter((_, j) => j !== i))}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const sku = original?.sku ?? "(generated on create)";
  const productId = original?.id ?? "(generated on create)";
  const manualCols = collections.filter((c) => c.kind === "manual");
  const memberSet = membership ?? (id ? new Set<string>(manualCols.filter((c) => c.productIds.includes(id)).map((c) => c.id)) : new Set<string>());
  const fieldLabel = "mb-1 block text-xs font-medium text-muted-foreground";

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6" aria-busy="true">
        <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="h-96 animate-pulse rounded-xl bg-muted lg:col-span-3" />
          <div className="h-96 animate-pulse rounded-xl bg-muted lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Link to="/admin/products" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-foreground underline underline-offset-4">
          <ArrowLeft className="h-4 w-4" /> Back to catalogue
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      {/* breadcrumb + Cancel (reference: commerce › products) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Commerce</span>
          <span aria-hidden="true">›</span>
          <span>Products</span>
          <span aria-hidden="true">›</span>
          <span className="font-medium text-foreground">{isNew ? "New product" : "Edit product"}</span>
        </div>
        <Link
          to="/admin/products"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-secondary"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Cancel
        </Link>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-5">
        {/* ── left column ─────────────────────────────────────────── */}
        <div className="space-y-5 lg:col-span-3">
          <SectionCard title="Product identity">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={fieldLabel} htmlFor="pe-name">Name *</label>
                <Input id="pe-name" value={form.name} autoFocus={isNew} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acoustic Desk Panel 48" />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="pe-sku">SKU</label>
                <Input id="pe-sku" value={sku} readOnly disabled className="bg-muted font-mono text-xs" aria-label="SKU (read-only)" />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="pe-id">Product ID</label>
                <Input id="pe-id" value={productId} readOnly disabled className="bg-muted font-mono text-xs" aria-label="Product ID (read-only)" />
                <p className="mt-1 text-[10px] text-muted-foreground">Product IDs stay fixed after creation.</p>
              </div>
              <div>
                <label className={fieldLabel} htmlFor="pe-category">Category *</label>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger id="pe-category" className="bg-white"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={fieldLabel} htmlFor="pe-subcategory">Subcategory</label>
                <Input id="pe-subcategory" className="font-mono text-xs" value={form.subcategory} onChange={(e) => set("subcategory", e.target.value)} placeholder="executive-tables" list="pe-subcats" />
                <datalist id="pe-subcats">{subcategoryOptions.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div>
                <label className={fieldLabel} htmlFor="pe-series">Series</label>
                <Select value={form.seriesId || "__none__"} onValueChange={(v) => set("seriesId", v === "__none__" ? "" : v)}>
                  <SelectTrigger id="pe-series" className="bg-white"><SelectValue placeholder="No series" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— no series —</SelectItem>
                    {seriesOptions.filter((s) => s.active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={fieldLabel} htmlFor="pe-brand">Brand</label>
                <Select value={form.brandId || "__none__"} onValueChange={(v) => set("brandId", v === "__none__" ? "" : v)}>
                  <SelectTrigger id="pe-brand" className="bg-white"><SelectValue placeholder="No brand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— no brand —</SelectItem>
                    {brandOptions.filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className={fieldLabel} htmlFor="pe-short">Short description</label>
                <Input id="pe-short" value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} placeholder="One-liner shown under the title on the PDP" />
              </div>
              <div className="sm:col-span-2">
                <label className={fieldLabel} htmlFor="pe-desc">Product details</label>
                <Textarea id="pe-desc" rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Long-form description — materials, build, care, warranty notes…" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Pricing & stock">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel} htmlFor="pe-price">Current price (PKR) *</label>
                <Input id="pe-price" type="number" min={0} value={form.price} onChange={(e) => set("price", e.target.value)} />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="pe-compare">Compare-at (list) price</label>
                <Input id="pe-compare" type="number" min={0} value={form.compareAtPrice} onChange={(e) => set("compareAtPrice", e.target.value)} placeholder="Optional" />
              </div>
            </div>
            {salePercent !== null && compareAt !== undefined ? (
              <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-800">
                Old {formatPKR(compareAt)} → current {formatPKR(price)} — storefront shows the strike-through and a Save {salePercent}% badge.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">Set “Compare-at” above the current price to get the Old vs Current display on the PDP.</p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel} htmlFor="pe-stock">Stock quantity *</label>
                <Input id="pe-stock" type="number" min={0} value={form.stock} onChange={(e) => set("stock", e.target.value)} />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="pe-status">Fulfilment</label>
                <Select value={form.stockStatus} onValueChange={(v) => set("stockStatus", v as AdminProduct["stockStatus"])}>
                  <SelectTrigger id="pe-status" className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_stock">In stock</SelectItem>
                    <SelectItem value="out_of_stock">Out of stock</SelectItem>
                    <SelectItem value="made_to_order">Made to order</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-5">
              <label className="flex items-center gap-2 text-sm text-foreground"><Switch checked={form.inStock} onCheckedChange={(v) => set("inStock", v)} /> In stock</label>
              <label className="flex items-center gap-2 text-sm text-foreground"><Switch checked={form.isBestSeller} onCheckedChange={(v) => set("isBestSeller", v)} /> Best Seller</label>
              <label className="flex items-center gap-2 text-sm text-foreground" title="Sale Item — backed by Compare-at > Current price (single source of truth)">
                <Switch
                  checked={salePercent !== null}
                  onCheckedChange={(v) => set("compareAtPrice", v ? String(Math.round((parseNum(form.price) * 1.15) / 10) * 10) : "")}
                />
                Sale Item
              </label>
              <div className="pb-1 text-[11px] text-muted-foreground">
                Storefront rating {typeof original?.rating === "number" ? `${original.rating.toFixed(1)} / 5 (${original.reviews} reviews)` : "—"}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={fieldLabel} htmlFor="pe-dims">Dimensions</label>
                <Input id="pe-dims" value={form.dimensions} onChange={(e) => set("dimensions", e.target.value)} placeholder="180 × 90 × 75 cm" />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="pe-weight">Weight (kg)</label>
                <Input id="pe-weight" type="number" min={0} step="0.1" value={form.weightKg} onChange={(e) => set("weightKg", e.target.value)} placeholder="42" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Images & merchandising">
            <label className={fieldLabel} htmlFor="pe-images">Image URLs (one per line) — first is the primary thumbnail</label>
            <Textarea id="pe-images" rows={3} value={form.images} onChange={(e) => set("images", e.target.value)} placeholder="chair-product.webp" className="font-mono text-[10px]" />
            {previewUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {previewUrls.slice(0, 6).map((src, i) => (
                  <img key={i} src={src} alt="" loading="lazy" className="h-12 w-12 rounded-md border border-border object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                ))}
                {previewUrls.length > 6 && <span className="self-center text-[10px] text-muted-foreground">+{previewUrls.length - 6} more</span>}
              </div>
            )}

            {optionSets.length > 0 && (
              <div className="mt-4">
                <span className={fieldLabel}>Option sets</span>
                <div className="flex flex-wrap gap-1.5">
                  {optionSets.map((optSet) => {
                    const attached = form.optionSetIds.includes(optSet.id);
                    return (
                      <button
                        key={optSet.id}
                        type="button"
                        aria-pressed={attached}
                        onClick={() => set("optionSetIds", attached ? form.optionSetIds.filter((s) => s !== optSet.id) : [...form.optionSetIds, optSet.id])}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          attached
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border bg-white text-muted-foreground hover:border-accent hover:text-foreground",
                        )}
                      >
                        {attached && <Check className="h-3 w-3" />}
                        {optSet.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Attached sets render as selectors on the PDP (see <Link to="/admin/options" className="underline underline-offset-2 hover:text-foreground">Options</Link>).</p>
              </div>
            )}

            {!isNew && manualCols.length > 0 && (
              <div className="mt-4">
                <span className={fieldLabel}>Collections (manual picks)</span>
                <div className="flex flex-wrap gap-1.5">
                  {manualCols.map((c) => {
                    const on = memberSet.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setMembership(new Set((() => { const n = new Set(memberSet); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })()))}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          on ? "border-accent bg-accent text-accent-foreground" : "border-border bg-white text-muted-foreground hover:border-accent hover:text-foreground",
                        )}
                      >
                        {on && <Check className="h-3 w-3" />}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Toggles sync on save. Automatic (rule-based) collections are not shown.</p>
              </div>
            )}

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className={cn(fieldLabel, "mb-0")}>Spec table</span>
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => set("specs", [...form.specs, { label: "", value: "" }])}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add row
                </Button>
              </div>
              {form.specs.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">No spec rows yet.</p>
              ) : (
                <div className="space-y-1.5">{form.specs.map(specRow)}</div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── right summary rail ──────────────────────────────────── */}
        <aside className="lg:col-span-2 lg:sticky lg:top-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-secondary">
              {previewUrls[0] ? (
                <img
                  src={previewUrls[0]}
                  alt={form.name || "Product image"}
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                />
              ) : null}
              {!previewUrls[0] && <Package className="h-16 w-16 text-muted-foreground/40" aria-hidden="true" />}
              <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", chip.cls)}>{chip.label}</span>
                {form.isBestSeller && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-semibold text-amber-950">Best Seller</span>}
                {salePercent !== null && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold text-white">Save {salePercent}%</span>}
              </div>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {form.category ? categories.find((c) => c.id === form.category)?.name ?? form.category : "No category"}{form.subcategory ? ` · ${form.subcategory}` : ""}
              </p>
              <h2 className="text-lg font-bold leading-snug text-foreground">{form.name || "Untitled product"}</h2>
              {form.shortDescription && <p className="text-xs leading-5 text-muted-foreground">{form.shortDescription}</p>}
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold tracking-tight text-foreground">{Number.isFinite(price) ? formatPKR(price) : "PKR —"}</span>
                {salePercent !== null && compareAt !== undefined && <span className="text-sm text-muted-foreground line-through">{formatPKR(compareAt)}</span>}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {previewUrls.length} image{previewUrls.length === 1 ? "" : "s"}
                <span aria-hidden="true">·</span>
                <span className="font-mono">{productId}</span>
              </div>
              <Button onClick={save} disabled={saving} className="w-full bg-[#15803d] font-semibold text-white hover:bg-[#166534]">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isNew ? "Create product" : "Save product"}
              </Button>
              {!isNew && (
                <Button onClick={() => setDeleteOpen(true)} variant="outline" className="w-full border-rose-200 font-semibold text-rose-700 hover:bg-rose-50">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete product
                </Button>
              )}
              <p className="text-[10px] leading-4 text-muted-foreground">
                Saves to the shared catalog record (demo: this browser's localStorage). The storefront is a static build of <code className="font-mono">src/data/products.ts</code> — it does not refresh at runtime.
              </p>
              {original?.createdAt && (
                <p className="border-t border-border pt-2 text-[10px] text-muted-foreground">
                  Created {new Date(original.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{form.name || "this product"}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            This removes the product from the catalogue everywhere in the admin (media assignments, inventory stock row).
            Existing orders keep their snapshot lines. The movement ledger history is kept for audit.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={deleting} className="bg-rose-600 text-white hover:bg-rose-500">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
