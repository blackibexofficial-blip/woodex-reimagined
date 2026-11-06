import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X, Check,
  Copy, Download, ChevronLeft, ChevronRight, Loader2, Package, PackageSearch, Pencil, Plus, Star, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminCollection, AdminProduct, AdminOptionSet, NewAdminProductInput, ProductImportRow, ProductImportResult } from "@/api/types";
import { categories, seriesList } from "@/data/products";
import { formatPKR, formatNumber, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const PER_PAGE = 10;

const SORT_OPTIONS = [
  { value: "reviews:desc", label: "Reviews · high→low" },
  { value: "name:asc", label: "Name · A→Z" },
  { value: "name:desc", label: "Name · Z→A" },
  { value: "price:asc", label: "Price · low→high" },
  { value: "price:desc", label: "Price · high→low" },
  { value: "stock:asc", label: "Stock · low→high" },
  { value: "stock:desc", label: "Stock · high→low" },
  { value: "rating:desc", label: "Rating · high→low" },
] as const;
type SortValue = (typeof SORT_OPTIONS)[number]["value"];

function exportCsv(rows: AdminProduct[]) {
  const escape = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["id", "sku", "name", "category", "price", "compare_at_price", "stock", "in_stock", "rating", "reviews", "stock_status", "is_best_seller", "dimensions", "weight_kg"].join(",");
  const body = rows.map((p) => [
    escape(p.id), escape(p.sku), escape(p.name), escape(p.category),
    p.price, p.compareAtPrice ?? "", p.stock, p.inStock ? "yes" : "no",
    p.rating, p.reviews, escape(p.stockStatus), p.isBestSeller ? "yes" : "no",
    escape(p.dimensions ?? ""), p.weightKg ?? "",
  ].join(","));
  const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `woodex-products-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Minimal RFC-4180 parser — handles quoted fields, embedded commas/quotes/newlines. */
function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(cur); cur = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cur += ch;
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

const HEADER_MAP: Record<string, keyof ProductImportRow> = {
  id: "id", product_id: "id", sku: "sku",
  name: "name", title: "name", product_name: "name",
  category: "category", category_slug: "category",
  subcategory: "subcategory",
  price: "price", price_pkr: "price", compareatprice: "compareAtPrice", compare_at_price: "compareAtPrice", compare_at: "compareAtPrice", sale_price: "price",
  stock: "stock", qty: "stock", quantity: "stock", units: "stock", units_in_stock: "stock", inventory: "stock",
  rating: "rating", reviews: "reviews", review_count: "reviews",
  stock_status: "stockStatus", status: "stockStatus",
  is_best_seller: "isBestSeller", best_seller: "isBestSeller", featured: "isBestSeller",
  dimensions: "dimensions", weight_kg: "weightKg", weight: "weightKg",
};
const BOOL_TRUE = new Set(["yes", "true", "1", "y", "in stock", "in_stock"]);
const BOOL_FALSE = new Set(["no", "false", "0", "n", "out of stock", "out_of_stock"]);
const STATUS_MAP: Record<string, ProductImportRow["stockStatus"]> = {
  in_stock: "in_stock", in_stock_status: "in_stock", instock: "in_stock", "in stock": "in_stock", available: "in_stock",
  out_of_stock: "out_of_stock", outofstock: "out_of_stock", "out of stock": "out_of_stock", oos: "out_of_stock",
  made_to_order: "made_to_order", madetoorder: "made_to_order", "made to order": "made_to_order", mto: "made_to_order", backorder: "made_to_order",
};
const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
const toNumber = (raw: string): number | undefined => {
  const t = raw.replace(/[%,PKR₨ ]/gi, "").trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
};
const toBool = (raw: string): boolean | undefined => {
  const t = raw.trim().toLowerCase();
  if (BOOL_TRUE.has(t)) return true;
  if (BOOL_FALSE.has(t)) return false;
  return undefined;
};

/** Parses Woodex CSV exports / admin-maintained sheets into typed rows. Collects row-level errors; never throws. */
function rowsFromCsv(text: string): { rows: ProductImportRow[]; errors: { row: number; message: string }[] } {
  const table = parseCsvText(text);
  const errors: { row: number; message: string }[] = [];
  if (table.length === 0) return { rows: [], errors: [{ row: 0, message: "file is empty" }] };
  const headers = table[0].map(normalizeHeader);
  const rows: ProductImportRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const rowErrorsBefore = errors.length;
    const get = (key: keyof ProductImportRow) => {
      const idx = headers.findIndex((h) => HEADER_MAP[h] === key);
      return idx >= 0 ? (cells[idx] ?? "").trim() : undefined;
    };
    const getRaw = (keys: string[]) => {
      for (const k of keys) {
        const idx = headers.indexOf(k);
        if (idx >= 0) return (cells[idx] ?? "").trim();
      }
      return undefined;
    };
    const name = get("name") ?? getRaw(["name", "title"]);
    const price = toNumber(get("price") ?? "");
    if (price !== undefined && Number.isNaN(price)) errors.push({ row: i + 1, message: `“${name || "row"}”: price “${get("price")}” is not a number` });
    const compareAtPrice = toNumber(get("compareAtPrice") ?? "");
    if (compareAtPrice !== undefined && Number.isNaN(compareAtPrice)) errors.push({ row: i + 1, message: `“${name || "row"}”: compare_at_price is not a number` });
    const stock = toNumber(get("stock") ?? "");
    if (stock !== undefined && Number.isNaN(stock)) errors.push({ row: i + 1, message: `“${name || "row"}”: stock is not a number` });
    const rating = toNumber(get("rating") ?? "");
    const reviews = toNumber(get("reviews") ?? "");
    const weightKg = toNumber(get("weightKg") ?? "");
    const inStockRaw = getRaw(["in_stock", "instock"]);
    const inStock = inStockRaw !== undefined && inStockRaw !== "" ? toBool(inStockRaw) : undefined;
    const isBestSellerRaw = getRaw(["is_best_seller", "best_seller", "featured"]);
    const isBestSeller = isBestSellerRaw !== undefined && isBestSellerRaw !== "" ? toBool(isBestSellerRaw) : undefined;
    const statusRaw = (getRaw(["stock_status", "status"]) ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const stockStatus = statusRaw ? STATUS_MAP[statusRaw] : undefined;
    if (statusRaw && !stockStatus) errors.push({ row: i + 1, message: `“${name || "row"}”: unknown stock_status “${statusRaw}”` });
    if (errors.length > rowErrorsBefore) continue; // row-level parse error → skip the row entirely
    rows.push({
      id: get("id") || undefined,
      sku: get("sku") || undefined,
      name: name ?? "",
      category: (get("category") || undefined)?.toLowerCase(),
      subcategory: get("subcategory") || undefined,
      price: price === undefined || Number.isNaN(price) ? undefined : price,
      compareAtPrice: compareAtPrice === undefined || Number.isNaN(compareAtPrice) ? undefined : compareAtPrice,
      stock: stock === undefined || Number.isNaN(stock) ? undefined : Math.max(0, Math.trunc(stock)),
      inStock,
      rating: rating === undefined || Number.isNaN(rating) ? undefined : rating,
      reviews: reviews === undefined || Number.isNaN(reviews) ? undefined : Math.max(0, Math.trunc(reviews)),
      stockStatus,
      isBestSeller,
      dimensions: get("dimensions") || undefined,
      weightKg: weightKg === undefined || Number.isNaN(weightKg) ? undefined : weightKg,
    });
  }
  return { rows, errors };
}

const emptyDraft: NewAdminProductInput = { name: "", category: "", price: 0, stock: 0, isBestSeller: false };

export default function AdminProducts() {
  const api = useMemo(() => getAdminApi(), []);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [sortValue, setSortValue] = useState<SortValue>("reviews:desc");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<NewAdminProductInput>({ ...emptyDraft });
  const [creating, setCreating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<(ProductImportResult & { parseErrors: { row: number; message: string }[] }) | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sort, direction] = sortValue.split(":") as [
        "name" | "price" | "stock" | "rating" | "reviews",
        "asc" | "desc",
      ];
      const res = await api.listProducts({
        query: debounced || undefined,
        category: category === "all" ? undefined : category,
        brandId: brandFilter === "all" ? undefined : brandFilter,
        inStock: stockFilter === "all" ? undefined : stockFilter === "in",
        page,
        perPage: PER_PAGE,
        sort,
        direction,
      });
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
      toast.error("Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [api, debounced, category, brandFilter, stockFilter, page, sortValue]);

  const [optionSets, setOptionSets] = useState<AdminOptionSet[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<Array<{ id: string; name: string; active: boolean }>>(seriesList.map(({ id, name }) => ({ id, name, active: true })));
  const [brandOptions, setBrandOptions] = useState<Array<{ id: string; name: string; active: boolean }>>([{ id: "woodex", name: "Woodex", active: true }]);
  const [collections, setCollections] = useState<AdminCollection[]>([]);
  /* Manual-collection membership — null = derive from collections each render; set once the user toggles a chip. */
  const [membership, setMembership] = useState<Set<string> | null>(null);
  useEffect(() => {
    api.listOptionSets().then(setOptionSets).catch(() => setOptionSets([]));
    api.listCollections().then(setCollections).catch(() => setCollections([]));
    api.listSeries().then((rows) => setSeriesOptions(rows.map(({ id, name, active }) => ({ id, name, active })))).catch(() => { /* static seriesList fallback already in place */ });
    api.listBrands().then((rows) => setBrandOptions(rows.map(({ id, name, active }) => ({ id, name, active })))).catch(() => { /* woodex fallback already in place */ });
  }, [api]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debounced, category, brandFilter, stockFilter, sortValue]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const categoryOptions = useMemo(() => categories.filter((c: { id: string; name: string }) => c.id !== "all").map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })), []);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.updateProduct(editing.id, {
        name: editing.name,
        price: editing.price,
        compareAtPrice: editing.compareAtPrice,
        stock: Number(editing.stock) || 0,
        inStock: editing.inStock,
        isBestSeller: editing.isBestSeller,
        stockStatus: editing.stockStatus,
        dimensions: editing.dimensions?.trim() || undefined,
        weightKg: editing.weightKg === undefined || Number.isNaN(editing.weightKg) ? undefined : editing.weightKg,
        optionSetIds: editing.optionSetIds ?? [],
        specs: (editing.specs ?? []).map((r) => ({ label: r.label.trim(), value: r.value.trim() })).filter((r) => r.label && r.value),
        shortDescription: editing.shortDescription?.trim() || undefined,
        description: editing.description?.trim() || undefined,
        images: (editing.images ?? []).map((u) => u.trim()).filter(Boolean).slice(0, 12),
        image: (editing.images ?? []).map((u) => u.trim()).filter(Boolean)[0] ?? editing.image,
        seriesId: editing.seriesId,
        brandId: editing.brandId,
      });
      /* sync manual-collection membership diffs */
      const manualCols = collections.filter((c) => c.kind === "manual");
      const finalSet = membership ?? new Set(manualCols.filter((c) => c.productIds.includes(editing.id)).map((c) => c.id));
      const membershipUpdates = manualCols
        .filter((c) => c.productIds.includes(editing.id) !== finalSet.has(c.id))
        .map((c) => {
          const nextIds = finalSet.has(c.id)
            ? [...c.productIds.filter((id) => id !== editing.id), editing.id]
            : c.productIds.filter((id) => id !== editing.id);
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
      setEditing(null);
      toast.success("Product updated.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save product.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStock = async (p: AdminProduct, value: boolean) => {
    setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, inStock: value, stock: value && r.stock === 0 ? 12 : r.stock } : r)));
    await api.updateProduct(p.id, { inStock: value, stock: value && p.stock === 0 ? 12 : p.stock });
    toast.success(value ? "Marked in stock." : "Marked out of stock.");
  };

  const createProduct = async () => {
    const name = draft.name.trim();
    if (!name) { toast.error("Name is required."); return; }
    if (!draft.category) { toast.error("Pick a category."); return; }
    if (!Number.isFinite(draft.price) || draft.price < 0) { toast.error("Price must be a number ≥ 0."); return; }
    setCreating(true);
    try {
      const created = await api.createProduct({
        ...draft,
        name,
        price: Number(draft.price) || 0,
        stock: Math.max(0, Math.trunc(Number(draft.stock) || 0)),
        dimensions: draft.dimensions?.trim() || undefined,
        weightKg: draft.weightKg === undefined || Number.isNaN(draft.weightKg) ? undefined : draft.weightKg,
      });
      setCreateOpen(false);
      setDraft({ ...emptyDraft });
      toast.success(`Created “${created.name}” (${created.sku}). It appears in the catalogue now.`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create product.");
    } finally {
      setCreating(false);
    }
  };

  const duplicateProduct = async (p: AdminProduct) => {
    setDuplicatingId(p.id);
    try {
      const copy = await api.duplicateProduct(p.id);
      toast[copy ? "success" : "error"](copy ? `Duplicated as “${copy.name}” (${copy.sku}) — stock 0.` : "Could not duplicate product.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate product.");
    } finally {
      setDuplicatingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const ok = await api.deleteProduct(pendingDelete.id);
      toast[ok ? "success" : "error"](ok ? `“${pendingDelete.name}” deleted.` : "Could not delete product.");
      setPendingDelete(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete product.");
    } finally {
      setDeleting(false);
    }
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const { rows, errors } = rowsFromCsv(text);
      if (rows.length === 0 && errors.length === 0) { toast.error("No data rows found in the CSV."); return; }
      const result = await api.importProductsCsv(rows);
      setImportReport({ ...result, parseErrors: errors });
      const errCount = result.errors.length + errors.length;
      toast.success(`Import: ${result.created} created · ${result.updated} updated · ${result.skipped} skipped${errCount ? ` · ${errCount} rows had issues` : ""}.`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  const reportErrors = importReport ? [...importReport.parseErrors, ...importReport.errors] : [];

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Input placeholder="Search products, categories, IDs, SKUs…" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-xs bg-white" aria-label="Search products" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-48 bg-white"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOptions.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-full sm:w-40 bg-white" aria-label="Filter by brand"><SelectValue placeholder="All brands" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brandOptions.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger className="w-full sm:w-40 bg-white"><SelectValue placeholder="Stock" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stock</SelectItem>
              <SelectItem value="in">In stock</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortValue} onValueChange={(v) => setSortValue(v as SortValue)}>
            <SelectTrigger className="w-full sm:w-44 bg-white" aria-label="Sort products"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={importRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onImportFile(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => importRef.current?.click()} disabled={importing} className="bg-white">
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Import CSV
          </Button>
          <Button variant="outline" onClick={() => exportCsv(rows)} className="bg-white">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
            <Plus className="mr-2 h-4 w-4" /> Add product
          </Button>
        </div>
      </div>

      <SectionCard title={`${formatNumber(total)} product${total === 1 ? "" : "s"}`}>
        {loading ? (
          <SectionSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={PackageSearch} title="No products match your filters" hint="Clear the search or choose a different category." />
        ) : (
          <>
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2.5">Product</th>
                    <th className="px-5 py-2.5">Category</th>
                    <th className="px-5 py-2.5 text-right">Price</th>
                    <th className="px-5 py-2.5 text-right">Stock</th>
                    <th className="px-5 py-2.5">Rating</th>
                    <th className="px-5 py-2.5">In stock</th>
                    <th className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted">
                  {rows.map((p) => (
                    <tr key={p.id} className="hover:bg-secondary">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-3">
                          {p.image && <img src={p.image} alt="" loading="lazy" className="h-12 w-12 rounded-md object-cover" />}
                          <div className="min-w-0">
                            <p className="flex max-w-[240px] items-center gap-1.5 truncate font-medium text-foreground">
                              {p.isBestSeller && <Star className="h-3.5 w-3.5 shrink-0 fill-hon-green-light text-accent" />}
                              <span className="truncate">{p.name}</span>
                            </p>
                            <p className="font-mono text-[10px] uppercase text-muted-foreground" title={p.id}>{p.sku}{p.dimensions ? ` · ${p.dimensions}` : ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-xs capitalize text-muted-foreground">{p.category.replace(/-/g, " ")}</td>
                      <td className="px-5 py-2.5 text-right">
                        <span className="font-semibold">{formatPKR(p.price)}</span>
                        {p.compareAtPrice && p.compareAtPrice > p.price && (
                          <span className="block text-[11px] text-muted-foreground"><span className="line-through">{formatPKR(p.compareAtPrice)}</span><span className="ml-1 rounded bg-rose-600 px-1 align-middle text-[9px] font-bold text-white">SALE</span></span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={p.stock < 10 ? "font-semibold text-rose-600" : "text-foreground"}>{p.stock}</span>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">{p.rating.toFixed(1)} <span className="text-muted-foreground">({p.reviews})</span></td>
                      <td className="px-5 py-2.5"><Switch checked={p.inStock} onCheckedChange={(v) => toggleStock(p, v)} aria-label="Toggle in stock" /></td>
                      <td className="px-5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setMembership(null); setEditing({ ...p }); }} aria-label="Edit product" title="Edit product">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => duplicateProduct(p)} disabled={duplicatingId === p.id} aria-label={`Duplicate ${p.name}`} title="Duplicate product">
                            {duplicatingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setPendingDelete(p)} aria-label={`Delete ${p.name}`} title="Delete product">
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* pagination */}
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

      {/* create dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="create-name">Name</label>
              <Input id="create-name" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ballmer Executive Desk — Oak" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="create-category">Category</label>
              <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                <SelectTrigger id="create-category" className="bg-white"><SelectValue placeholder="Pick a category" /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="create-price">Price (PKR)</label>
                <Input id="create-price" type="number" min={0} value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="create-compare">Compare-at</label>
                <Input id="create-compare" type="number" min={0} value={draft.compareAtPrice ?? ""} onChange={(e) => setDraft({ ...draft, compareAtPrice: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="create-stock">Units in stock</label>
                <Input id="create-stock" type="number" min={0} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: Number(e.target.value) })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="create-status">Fulfilment</label>
                <Select value={draft.stockStatus ?? ""} onValueChange={(v) => setDraft({ ...draft, stockStatus: v as NewAdminProductInput["stockStatus"] })}>
                  <SelectTrigger id="create-status" className="bg-white"><SelectValue placeholder="Derived from stock" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_stock">In stock</SelectItem>
                    <SelectItem value="out_of_stock">Out of stock</SelectItem>
                    <SelectItem value="made_to_order">Made to order</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="create-dimensions">Dimensions</label>
                <Input id="create-dimensions" value={draft.dimensions ?? ""} onChange={(e) => setDraft({ ...draft, dimensions: e.target.value })} placeholder="180 × 90 × 75 cm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="create-weight">Weight (kg)</label>
                <Input id="create-weight" type="number" min={0} step="0.1" value={draft.weightKg ?? ""} onChange={(e) => setDraft({ ...draft, weightKg: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="42" />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground"><Switch checked={draft.isBestSeller ?? false} onCheckedChange={(v) => setDraft({ ...draft, isBestSeller: v })} /> Featured</label>
            </div>
            <p className="text-[11px] leading-4 text-muted-foreground">SKU and product ID are generated automatically. Fulfilment derives from units in stock unless you pick one explicitly.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={createProduct} disabled={creating} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* edit dialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 rounded-lg bg-secondary p-3">
                {editing.image && <img src={editing.image} alt="" className="h-14 w-14 rounded-md object-cover" />}
                <p className="text-xs text-muted-foreground">SKU: <span className="font-mono">{editing.sku}</span> · ID: <span className="font-mono">{editing.id}</span></p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-name">Name</label>
                <Input id="edit-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-price">Price (PKR)</label>
                  <Input id="edit-price" type="number" min={0} value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-compare">Compare-at</label>
                  <Input id="edit-compare" type="number" min={0} value={editing.compareAtPrice ?? ""} onChange={(e) => setEditing({ ...editing, compareAtPrice: e.target.value === "" ? undefined : Number(e.target.value) })} />
                </div>
              </div>
              {editing.compareAtPrice !== undefined && editing.compareAtPrice > editing.price ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-800">
                  Old {formatPKR(editing.compareAtPrice)} → Current {formatPKR(editing.price)} — storefront shows the strike-through and a Save {Math.round(((editing.compareAtPrice - editing.price) / editing.compareAtPrice) * 100)}% badge.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">Set “Compare-at” above the current price to get the Old vs Current price display on the PDP.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-sku">SKU</label>
                  <Input id="edit-sku" value={editing.sku} readOnly disabled className="bg-muted font-mono text-xs" aria-label="SKU (read-only)" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-status">Fulfilment</label>
                  <Select value={editing.stockStatus} onValueChange={(v) => setEditing({ ...editing, stockStatus: v as AdminProduct["stockStatus"] })}>
                    <SelectTrigger id="edit-status" className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_stock">In stock</SelectItem>
                      <SelectItem value="out_of_stock">Out of stock</SelectItem>
                      <SelectItem value="made_to_order">Made to order</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-stock">Units in stock</label>
                  <Input id="edit-stock" type="number" min={0} value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} />
                </div>
                <div className="flex flex-wrap items-end gap-3 pb-2">
                  <label className="flex items-center gap-2 text-sm text-foreground"><Switch checked={editing.inStock} onCheckedChange={(v) => setEditing({ ...editing, inStock: v })} /> In stock</label>
                  <label className="flex items-center gap-2 text-sm text-foreground"><Switch checked={editing.isBestSeller} onCheckedChange={(v) => setEditing({ ...editing, isBestSeller: v })} /> Best Seller</label>
                  <label className="flex items-center gap-2 text-sm text-foreground" title="Sale Item — backed by Compare-at > Current price (single source of truth)"><Switch checked={editing.compareAtPrice !== undefined && editing.compareAtPrice > editing.price} onCheckedChange={(v) => {
                    if (v) setEditing({ ...editing, compareAtPrice: Math.round((editing.price * 1.15) / 10) * 10 });
                    else setEditing({ ...editing, compareAtPrice: undefined });
                  }} /> Sale Item</label>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-short">Short Description</label>
                <Input id="edit-short" value={editing.shortDescription ?? ""} onChange={(e) => setEditing({ ...editing, shortDescription: e.target.value })} placeholder="One-liner shown under the title on the PDP" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-desc">Product Details</label>
                <Textarea id="edit-desc" rows={3} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Long-form description — materials, build, care, warranty notes…" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-images">Image URLs (one per line) — first is the primary thumbnail</label>
                <Textarea id="edit-images" rows={2} value={(editing.images ?? (editing.image ? [editing.image] : [])).join("\n")} onChange={(e) => setEditing({ ...editing, images: e.target.value.split("\n").map((u) => u.trim()).filter(Boolean) })} placeholder="chair-product.webp" className="font-mono text-[10px]" />
                {(editing.images ?? []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(editing.images ?? []).slice(0, 6).map((src, i) => (
                      <img key={i} src={src} alt="" loading="lazy" className="h-11 w-11 rounded border border-border object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                    ))}
                    {(editing.images ?? []).length > 6 && <span className="self-center text-[10px] text-muted-foreground">+{(editing.images ?? []).length - 6} more</span>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-dimensions">Dimensions</label>
                  <Input id="edit-dimensions" value={editing.dimensions ?? ""} onChange={(e) => setEditing({ ...editing, dimensions: e.target.value })} placeholder="180 × 90 × 75 cm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-weight">Weight (kg)</label>
                  <Input id="edit-weight" type="number" min={0} step="0.1" value={editing.weightKg ?? ""} onChange={(e) => setEditing({ ...editing, weightKg: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="42" />
                </div>
              </div>
              {optionSets.length > 0 && (
                <div>
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">Option sets</span>
                  <div className="flex flex-wrap gap-1.5">
                    {optionSets.map((set) => {
                      const attached = (editing.optionSetIds ?? []).includes(set.id);
                      return (
                        <button
                          key={set.id}
                          type="button"
                          aria-pressed={attached}
                          onClick={() => setEditing({
                            ...editing,
                            optionSetIds: attached
                              ? (editing.optionSetIds ?? []).filter((id) => id !== set.id)
                              : [...(editing.optionSetIds ?? []), set.id],
                          })}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                            attached
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-border bg-white text-muted-foreground hover:border-accent hover:text-foreground",
                          )}
                        >
                          {attached && <Check className="h-3 w-3" />}
                          {set.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">Attached sets render as selectors on the PDP (see <Link to="/admin/options" className="underline underline-offset-2 hover:text-foreground">Options</Link> for deltas & suffixes).</p>
                </div>
              )}
              {(() => {
                const manualCols = collections.filter((c) => c.kind === "manual");
                const memberSet = membership ?? new Set(manualCols.filter((c) => editing.id && c.productIds.includes(editing.id)).map((c) => c.id));
                if (manualCols.length === 0) return null;
                return (
                  <div>
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">Collections (manual picks — automatic collections derive from rules)</span>
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
                    <p className="mt-1 text-[10px] text-muted-foreground">Toggles sync on save — automatic (rule-based) collections are not shown.</p>
                  </div>
                );
              })()}
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-series">Furniture Series</label>
                <Select value={editing.seriesId ?? "__none__"} onValueChange={(v) => setEditing({ ...editing, seriesId: v === "__none__" ? undefined : v })}>
                  <SelectTrigger id="edit-series" className="bg-white"><SelectValue placeholder="No series" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— no series —</SelectItem>
                    {seriesOptions.filter((s) => s.active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[10px] text-muted-foreground">Matches the storefront /series/:seriesId page.</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-brand">Brand</label>
                <Select value={editing.brandId ?? "__none__"} onValueChange={(v) => setEditing({ ...editing, brandId: v === "__none__" ? undefined : v })}>
                  <SelectTrigger id="edit-brand" className="bg-white"><SelectValue placeholder="No brand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— no brand —</SelectItem>
                    {brandOptions.filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[10px] text-muted-foreground">Seeded “Woodex” — assign partner brands when they ship.</p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Spec table (dimensions · weight · materials · warranty)</span>
                  <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setEditing({ ...editing, specs: [...(editing.specs ?? []), { label: "", value: "" }] })}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add row
                  </Button>
                </div>
                {(editing.specs ?? []).length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">No spec rows — the static storefront carries the factory table; rows you add here persist in the admin demo DB.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(editing.specs ?? []).map((row, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <Input
                          value={row.label}
                          onChange={(e) => setEditing({ ...editing, specs: (editing.specs ?? []).map((r, j) => (j === i ? { ...r, label: e.target.value } : r)) })}
                          placeholder="Label (Dimensions)"
                          className="w-36"
                          aria-label={`Spec ${i + 1} label`}
                        />
                        <Input
                          value={row.value}
                          onChange={(e) => setEditing({ ...editing, specs: (editing.specs ?? []).map((r, j) => (j === i ? { ...r, value: e.target.value } : r)) })}
                          placeholder="Value (e.g. 180 x 90 x 75 cm)"
                          className="flex-1"
                          aria-label={`Spec ${i + 1} value`}
                        />
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-rose-500"
                          aria-label={`Remove spec ${i + 1}`}
                          onClick={() => setEditing({ ...editing, specs: (editing.specs ?? []).filter((_, j) => j !== i) })}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="justify-between sm:justify-between">
            <Link to="/admin/inventory" className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-foreground underline-offset-4 hover:underline">
              <Package className="h-4 w-4" /> View in Inventory
            </Link>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={saving} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
              </Button>
            </div>
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
            This removes the product from the catalogue everywhere in the admin (media assignments, inventory stock row).
            Existing orders keep their snapshot lines. The movement ledger history is kept for audit.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={deleting} className="bg-rose-600 text-white hover:bg-rose-500">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* import report */}
      <Dialog open={importReport !== null} onOpenChange={(open) => !open && setImportReport(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import report</DialogTitle>
          </DialogHeader>
          {importReport && (
            <div className="space-y-3 py-1 text-sm">
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">{importReport.created} created</span>
                <span className="rounded-md bg-sky-50 px-2 py-1 text-sky-700">{importReport.updated} updated</span>
                <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">{importReport.skipped} skipped</span>
                <span className={`rounded-md px-2 py-1 ${reportErrors.length ? "bg-rose-50 text-rose-700" : "bg-muted text-muted-foreground"}`}>{reportErrors.length} errors</span>
              </div>
              {reportErrors.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-secondary p-2 font-mono text-[11px] leading-5">
                  {reportErrors.slice(0, 30).map((e, i) => <p key={i}><span className="text-muted-foreground">row {e.row}:</span> {e.message}</p>)}
                  {reportErrors.length > 30 && <p className="mt-1 text-muted-foreground">…and {reportErrors.length - 30} more</p>}
                </div>
              )}
              <p className="text-[11px] leading-4 text-muted-foreground">Upsert key is <code className="font-mono">id</code>, then <code className="font-mono">sku</code>; rows without either create new products (name + category + price required). Storefront inventory is untouched — this is an administrative edit.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportReport(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
