/**
 * WOODEX admin — /admin/products
 * "Furniture Catalog" — KPI strip, filter bar, image-card grid.
 *
 * Redesign (2026-11-08) following the woodex-2030 "Catalog" reference layout,
 * mapped onto this repo's adapter (demo DB / Supabase / Bagisto).
 * Retained from the previous table page: CSV import/export, duplicate,
 * bulk-editor entry, admin-side stock toggle via the editor routes.
 *
 * Honest-data notes:
 *  - The grid reads the shared catalog through the admin adapter only.
 *    The storefront is a static build of src/data/products.ts — it does NOT
 *    refresh when admin edits here. No copy on this page may claim otherwise.
 *  - The "live · 30s sync" pill is real: it re-reads the adapter every 30s
 *    (skipped while the tab is hidden). It does not imply a storefront push.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Boxes, Check, Copy, Download, ChevronLeft, ChevronRight, Loader2, Package, PackageSearch,
  Percent, Plus, Star, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminProduct, ProductImportRow, ProductImportResult } from "@/api/types";
import { formatPKR, formatNumber, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const PER_PAGE = 12;
const FETCH_LIMIT = 500; // catalogue is ~150 rows; single page keeps filters instant

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "rating", label: "Top rated" },
  { value: "price:asc", label: "Price · low→high" },
  { value: "price:desc", label: "Price · high→low" },
  { value: "name:asc", label: "Name · A→Z" },
  { value: "stock:asc", label: "Stock · low→high" },
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
      for (const key of keys) {
        const idx = headers.findIndex((h) => h === key);
        if (idx >= 0) return (cells[idx] ?? "").trim();
      }
      return undefined;
    };
    const row: ProductImportRow = { name: "" };
    const id = get("id"); if (id) row.id = id;
    const sku = get("sku"); if (sku) row.sku = sku;
    const name = get("name"); if (name) row.name = name;
    const category = get("category"); if (category) row.category = category;
    const subcategory = get("subcategory"); if (subcategory) row.subcategory = subcategory;
    const price = toNumber(get("price") ?? ""); if (price !== undefined) { if (Number.isNaN(price)) errors.push({ row: i + 1, message: `price “${get("price")}” is not a number` }); else row.price = price; }
    const compareAt = toNumber(getRaw(["compareatprice", "compare_at_price", "compare_at"]) ?? ""); if (compareAt !== undefined) { if (Number.isNaN(compareAt)) errors.push({ row: i + 1, message: "compare-at price is not a number" }); else row.compareAtPrice = compareAt; }
    const stock = toNumber(get("stock") ?? ""); if (stock !== undefined) { if (Number.isNaN(stock)) errors.push({ row: i + 1, message: "stock is not a number" }); else row.stock = stock; }
    const rating = toNumber(get("rating") ?? ""); if (rating !== undefined && !Number.isNaN(rating)) row.rating = rating;
    const reviews = toNumber(get("reviews") ?? ""); if (reviews !== undefined && !Number.isNaN(reviews)) row.reviews = reviews;
    const status = get("stockStatus"); if (status) { const norm = STATUS_MAP[normalizeHeader(status)]; if (norm) row.stockStatus = norm; else errors.push({ row: i + 1, message: `stock_status “${status}” not recognised` }); }
    const best = toBool(getRaw(["is_best_seller", "best_seller", "featured"]) ?? ""); if (best !== undefined) row.isBestSeller = best;
    const bestBoolAlt = toBool(getRaw(["bestseller"]) ?? ""); if (bestBoolAlt !== undefined) row.isBestSeller = bestBoolAlt;
    const dimensions = getRaw(["dimensions"]); if (dimensions) row.dimensions = dimensions;
    const weight = toNumber(getRaw(["weight_kg", "weight"]) ?? ""); if (weight !== undefined && !Number.isNaN(weight)) row.weightKg = weight;
    if (errors.length === rowErrorsBefore) rows.push(row);
  }
  return { rows, errors };
}

const materialOf = (p: AdminProduct) => p.specs?.find((r) => r.label.trim().toLowerCase() === "material")?.value?.trim();
const salePercent = (p: AdminProduct) =>
  p.compareAtPrice !== undefined && p.compareAtPrice > p.price && p.compareAtPrice > 0
    ? Math.round(((p.compareAtPrice - p.price) / p.compareAtPrice) * 100)
    : null;

export default function AdminProducts() {
  const api = useMemo(() => getAdminApi(), []);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [subcategory, setSubcategory] = useState<string>("all");
  const [material, setMaterial] = useState<string>("all");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortValue, setSortValue] = useState<SortValue>("featured");
  const [page, setPage] = useState(1);
  const [all, setAll] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminProduct | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<(ProductImportResult & { parseErrors: { row: number; message: string }[] }) | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  /* debounce the search box */
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim().toLowerCase()), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  /* load the full catalogue once (~150 rows); re-used by filters, KPIs and pagination */
  const load = useCallback(async () => {
    try {
      const res = await api.listProducts({ perPage: FETCH_LIMIT });
      setAll(res.items);
      setLastSynced(new Date());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  /* honest 30s re-sync of the admin view — paused while the tab is hidden */
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => { setPage(1); }, [debounced, subcategory, material, inStockOnly, sortValue]);

  const subcategoryOptions = useMemo(
    () => [...new Set(all.map((p) => p.subcategory).filter((s): s is string => Boolean(s)))].sort(),
    [all],
  );
  const materialOptions = useMemo(
    () => [...new Set(all.map(materialOf).filter((m): m is string => Boolean(m)))].sort(),
    [all],
  );

  const kpis = useMemo(() => {
    const total = all.length;
    const inStock = all.filter((p) => p.inStock).length;
    const subcats = new Set(all.map((p) => p.subcategory).filter(Boolean)).size;
    const avg = total > 0 ? Math.round(all.reduce((sum, p) => sum + p.price, 0) / total) : 0;
    return { total, inStock, inStockPct: total > 0 ? Math.round((inStock / total) * 100) : 0, subcats, avg };
  }, [all]);

  const filtered = useMemo(() => {
    const list = all.filter((p) => {
      if (subcategory !== "all" && p.subcategory !== subcategory) return false;
      if (material !== "all" && materialOf(p) !== material) return false;
      if (inStockOnly && !p.inStock) return false;
      if (debounced) {
        const hay = `${p.name} ${p.sku} ${p.id} ${p.category} ${p.subcategory ?? ""} ${p.shortDescription ?? ""}`.toLowerCase();
        if (!hay.includes(debounced)) return false;
      }
      return true;
    });
    const sorted = [...list];
    switch (sortValue) {
      case "price:asc": sorted.sort((a, b) => a.price - b.price); break;
      case "price:desc": sorted.sort((a, b) => b.price - a.price); break;
      case "name:asc": sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "stock:asc": sorted.sort((a, b) => a.stock - b.stock); break;
      case "rating": sorted.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews); break;
      case "featured": sorted.sort((a, b) => b.reviews - a.reviews || b.rating - a.rating); break;
    }
    return sorted;
  }, [all, debounced, subcategory, material, inStockOnly, sortValue]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);
  const hasActiveFilters = debounced !== "" || subcategory !== "all" || material !== "all" || inStockOnly;

  const duplicateProduct = async (p: AdminProduct) => {
    setDuplicatingId(p.id);
    try {
      const copy = await api.duplicateProduct(p.id);
      toast[copy ? "success" : "error"](copy ? `Duplicated as “${copy.name}” (${copy.sku}) — stock 0.` : "Could not duplicate product.");
      void load();
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
      void load();
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
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  const reportErrors = importReport ? [...importReport.parseErrors, ...importReport.errors] : [];

  const kpiCard = (icon: React.ReactNode, label: string, value: string, hint?: string) => (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-accent-foreground">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-bold leading-tight text-foreground">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );

  const starRating = (p: AdminProduct) => (
    <span className="flex items-center gap-1" role="img" aria-label={`Rated ${p.rating.toFixed(1)} out of 5 from ${p.reviews} reviews`}>
      <span className="flex" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={cn("h-3 w-3", i < Math.round(p.rating) ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
        ))}
      </span>
      <span className="text-[10px] text-muted-foreground">({p.reviews})</span>
    </span>
  );

  const stockLine = (p: AdminProduct) => {
    if (p.stockStatus === "made_to_order") return <span className="flex items-center gap-1 text-[11px] font-medium text-sky-700"><Check className="h-3.5 w-3.5" aria-hidden="true" /> Made to order</span>;
    if (p.stockStatus === "out_of_stock" || !p.inStock) return <span className="flex items-center gap-1 text-[11px] font-medium text-rose-700"><X className="h-3.5 w-3.5" aria-hidden="true" /> Out of stock</span>;
    return <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700"><Check className="h-3.5 w-3.5" aria-hidden="true" /> {p.stock} in stock</span>;
  };

  return (
    <div className="space-y-4">
      {/* page toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {formatNumber(kpis.total)} SKUs · edits update the shared admin catalog — the storefront is a static build and does not refresh at runtime.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={importRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onImportFile(e.target.files?.[0])} />
          <Button variant="outline" onClick={() => importRef.current?.click()} disabled={importing} className="bg-white">
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Import CSV
          </Button>
          <Button variant="outline" onClick={() => exportCsv(filtered)} className="bg-white">
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button asChild variant="outline" className="bg-white">
            <Link to="/admin/quotes">Build quotation</Link>
          </Button>
          <Button asChild className="bg-[#15803d] font-semibold text-white hover:bg-[#166534]">
            <Link to="/admin/products/new"><Plus className="mr-2 h-4 w-4" /> New product</Link>
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpiCard(<Package className="h-5 w-5" aria-hidden="true" />, "Products", formatNumber(kpis.total))}
        {kpiCard(<Check className="h-5 w-5" aria-hidden="true" />, "In stock", `${formatNumber(kpis.inStock)}`, `${kpis.inStockPct}% of catalogue`)}
        {kpiCard(<Boxes className="h-5 w-5" aria-hidden="true" />, "Subcategories", formatNumber(kpis.subcats))}
        {kpiCard(<Percent className="h-5 w-5" aria-hidden="true" />, "Avg. price", formatPKR(kpis.avg))}
      </div>

      {/* filter bar */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
        <Input
          placeholder={`Search ${kpis.total} products…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-white lg:max-w-xs"
          aria-label="Search products"
        />
        <Select value={subcategory} onValueChange={setSubcategory}>
          <SelectTrigger className="bg-white lg:w-48" aria-label="Filter by subcategory"><SelectValue placeholder="All subcategories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subcategories</SelectItem>
            {subcategoryOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={material} onValueChange={setMaterial}>
          <SelectTrigger className="bg-white lg:w-56" aria-label="Filter by material"><SelectValue placeholder="Any material" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any material</SelectItem>
            {materialOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortValue} onValueChange={(v) => setSortValue(v as SortValue)}>
          <SelectTrigger className="bg-white lg:w-40" aria-label="Sort products"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-medium text-foreground">
          <input type="checkbox" className="h-4 w-4 accent-[#16a34a]" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
          In stock only
        </label>
        <div className="ml-auto flex items-center gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setSubcategory("all"); setMaterial("all"); setInStockOnly(false); }}>
              Clear filters
            </Button>
          )}
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800"
            title={`Re-reads the admin catalog every 30s (paused while the tab is hidden)${lastSynced ? `. Last read ${lastSynced.toLocaleTimeString()}.` : ""}`}
          >
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
            </span>
            live · 30s sync
          </span>
        </div>
      </div>

      {/* grid */}
      {loading ? (
        <SectionSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={PackageSearch} title="No products match these filters" hint="Clear the search or choose a different subcategory." />
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground" aria-live="polite">
            Showing {(pageSafe - 1) * PER_PAGE + 1}–{Math.min(pageSafe * PER_PAGE, filtered.length)} of {filtered.length}
            {hasActiveFilters ? " (filtered)" : ""}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pageRows.map((p) => {
              const sale = salePercent(p);
              return (
                <article key={p.id} className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
                  <div className="relative">
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-secondary">
                      {p.image ? (
                        <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                      ) : (
                        <Package className="h-12 w-12 text-muted-foreground/40" aria-hidden="true" />
                      )}
                    </div>
                    <div className="absolute left-2 top-2 flex flex-col gap-1">
                      {sale !== null && <span className="w-fit rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">−{sale}%</span>}
                      {p.isBestSeller && <span className="w-fit rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">Bestseller</span>}
                    </div>
                    <div className="absolute right-2 top-2 flex gap-1">
                      <button
                        type="button"
                        className="rounded-md bg-white/90 p-1.5 text-muted-foreground shadow backdrop-blur transition-colors hover:text-foreground"
                        onClick={() => duplicateProduct(p)}
                        disabled={duplicatingId === p.id}
                        aria-label={`Duplicate ${p.name}`}
                        title="Duplicate product"
                      >
                        {duplicatingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-white/90 p-1.5 text-muted-foreground shadow backdrop-blur transition-colors hover:text-rose-600"
                        onClick={() => setPendingDelete(p)}
                        aria-label={`Delete ${p.name}`}
                        title="Delete product"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {p.subcategory && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">{p.subcategory}</span>
                    )}
                  </div>
                  <div className="space-y-1.5 p-3">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{p.category.replace(/-/g, " ")}</p>
                    <h2 className="truncate text-[13px] font-semibold leading-snug text-foreground" title={p.name}>{p.name}</h2>
                    {starRating(p)}
                    {stockLine(p)}
                    <div className="flex items-baseline gap-1.5 pt-0.5">
                      <span className="text-base font-extrabold tracking-tight text-foreground">{formatPKR(p.price)}</span>
                      {sale !== null && p.compareAtPrice !== undefined && <span className="text-[11px] text-muted-foreground line-through">{formatPKR(p.compareAtPrice)}</span>}
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <Link
                        to={`/shop/${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 rounded-md border border-border bg-white px-2 py-1.5 text-center text-[11px] font-medium text-foreground transition-colors hover:bg-secondary"
                      >
                        Details
                      </Link>
                      <Link
                        to={`/admin/products/${p.id}/edit`}
                        className="flex-1 rounded-md bg-hon-green-dark px-2 py-1.5 text-center text-[11px] font-semibold text-white transition-colors hover:bg-hon-green"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* pagination */}
          <div className="flex items-center justify-between border-t border-muted pt-3">
            <p className="text-xs text-muted-foreground">Page {pageSafe} of {totalPages}</p>
            <div className="flex gap-2">
              <Button size="icon" variant="outline" disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </>
      )}

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

