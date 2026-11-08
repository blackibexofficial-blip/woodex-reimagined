import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  BadgeCheck, Check, ChevronDown, Download, ListChecks, Loader2, Minus, Plus, Search, Star, Tag, Trash2, TrendingDown, Undo2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminProduct, BulkProductPatch, StockStatus } from "@/api/types";
import { formatPKR, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS_TONE: Record<StockStatus, string> = {
  in_stock: "bg-emerald-100 text-emerald-800",
  made_to_order: "bg-sky-100 text-sky-800",
  out_of_stock: "bg-rose-100 text-rose-800",
};
const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  made_to_order: "Made to order",
  out_of_stock: "Out of stock",
};

/* ── csv round-trip helpers (spreadsheet interchange) ───────────────────── */
function csvEsc(v: string): string { return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [""];
  let inQ = false;
  const t = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) {
      if (ch === '"') { if (t[i + 1] === '"') { row[row.length - 1] += '"'; i++; } else inQ = false; }
      else row[row.length - 1] += ch;
      continue;
    }
    if (ch === '"') { inQ = true; continue; }
    if (ch === ",") { row.push(""); continue; }
    if (ch === "\n") { out.push(row); row = [""]; continue; }
    row[row.length - 1] += ch;
  }
  if (row.length > 1 || row[0].trim() !== "") out.push(row);
  return out;
}

const EXPORT_HEADERS = ["id", "sku", "name", "category", "brand", "price", "compare_at_price", "stock", "stock_status", "is_best_seller"] as const;
const BOOL_TRUE = new Set(["yes", "y", "true", "1", "in stock", "in_stock"]);
const BOOL_FALSE = new Set(["no", "n", "false", "0", "out of stock", "out_of_stock"]);
const normHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
const csvBool = (raw: string): boolean | undefined => {
  const v = raw.trim().toLowerCase();
  if (BOOL_TRUE.has(v)) return true;
  if (BOOL_FALSE.has(v)) return false;
  return undefined;
};
const csvNum = (raw: string): number | undefined => {
  const v = raw.trim().replace(/[,]/g, "");
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

type ResolvedProduct = Pick<AdminProduct, "id" | "sku" | "name" | "category" | "price" | "compareAtPrice" | "stock" | "stockStatus" | "isBestSeller" | "brandId">;
type ImportChange = { field: "price" | "compareAtPrice" | "stock" | "stockStatus" | "isBestSeller"; from: string; to: string };
type ImportRowResult =
  | { ok: true; id: string; sku: string; name: string; changes: ImportChange[] }
  | { ok: false; ref: string; message: string };

function buildImportPreview(text: string, rowsByIndex: Map<string, ResolvedProduct>): { results: ImportRowResult[]; unchanged: number } {
  const grid = splitCsv(text);
  const results: ImportRowResult[] = [];
  let unchanged = 0;
  if (grid.length === 0) return { results, unchanged };
  const headers = grid[0].map(normHeader);
  const col = (row: string[], ...names: string[]): string => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return row[i] ?? "";
    }
    return "";
  };
  for (let r = 1; r < grid.length; r++) {
    const rec = grid[r];
    if (rec.every((c) => !c.trim())) continue;
    const idOrSku = (col(rec, "id") || col(rec, "sku") || "").trim();
    if (!idOrSku) { results.push({ ok: false, ref: `row ${r + 1}`, message: "Missing id and sku — cannot match" }); continue; }
    const hit = rowsByIndex.get(idOrSku.toLowerCase());
    if (!hit) { results.push({ ok: false, ref: idOrSku, message: "No catalogue match" }); continue; }
    const changes: ImportChange[] = [];
    const priceRaw = col(rec, "price");
    const price = csvNum(priceRaw);
    if (priceRaw.trim()) {
      if (price === undefined || price < 1) { results.push({ ok: false, ref: hit.sku, message: `price "${priceRaw.trim()}" is not a positive number` }); continue; }
      if (Math.round(price) !== Math.round(hit.price)) changes.push({ field: "price", from: String(hit.price), to: String(Math.round(price)) });
    }
    const cmpRaw = col(rec, "compare_at_price", "compareatprice", "compare_at");
    if (cmpRaw.trim()) {
      const cmp = csvNum(cmpRaw);
      if (cmp === undefined || cmp < 0) { results.push({ ok: false, ref: hit.sku, message: `compare_at_price "${cmpRaw.trim()}" is not a non-negative number` }); continue; }
      if ((hit.compareAtPrice ?? -1) !== cmp) changes.push({ field: "compareAtPrice", from: hit.compareAtPrice != null ? String(hit.compareAtPrice) : "—", to: String(Math.round(cmp)) });
    }
    const stockRaw = col(rec, "stock", "qty", "stock_qty");
    if (stockRaw.trim()) {
      const stk = csvNum(stockRaw);
      if (stk === undefined || stk < 0 || !Number.isInteger(stk)) { results.push({ ok: false, ref: hit.sku, message: `stock "${stockRaw.trim()}" is not a non-negative integer` }); continue; }
      if (stk !== hit.stock) changes.push({ field: "stock", from: String(hit.stock), to: String(stk) });
    }
    const statusRaw = col(rec, "stock_status", "stockstatus", "fulfilment", "fulfillment");
    if (statusRaw.trim()) {
      const status = statusRaw.trim().toLowerCase().replace(/[\s-]+/g, "_");
      if (!["in_stock", "made_to_order", "out_of_stock"].includes(status)) { results.push({ ok: false, ref: hit.sku, message: `stock_status "${statusRaw.trim()}" is not in_stock / made_to_order / out_of_stock` }); continue; }
      if (status !== hit.stockStatus) changes.push({ field: "stockStatus", from: hit.stockStatus, to: status });
    }
    const bestRaw = col(rec, "is_best_seller", "best_seller", "bestseller", "best_seller_flag");
    if (bestRaw.trim()) {
      const flag = csvBool(bestRaw);
      if (flag === undefined) { results.push({ ok: false, ref: hit.sku, message: `is_best_seller "${bestRaw.trim()}" is not yes/no` }); continue; }
      if (flag !== hit.isBestSeller) changes.push({ field: "isBestSeller", from: hit.isBestSeller ? "yes" : "no", to: flag ? "yes" : "no" });
    }
    if (changes.length === 0) { unchanged++; continue; }
    results.push({ ok: true, id: hit.id, sku: hit.sku, name: hit.name, changes });
  }
  return { results, unchanged };
}

type UndoEntry = { label: string; snaps: ResolvedProduct[] };

type ActionKind = "pricePct" | "stockStatus" | "markOnSale" | "clearSale" | "bestSeller" | "stockDelta" | "brand" | null;

export default function AdminBulkEditor() {
  const api = useMemo(() => getAdminApi(), []);
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | StockStatus>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [action, setAction] = useState<ActionKind>(null);
  const [pricePct, setPricePct] = useState(-10);
  const [includeCompareAt, setIncludeCompareAt] = useState(true);
  const [statusValue, setStatusValue] = useState<StockStatus>("made_to_order");
  const [salePct, setSalePct] = useState(10);
  const [stockDelta, setStockDelta] = useState(10);
  const [brandId, setBrandId] = useState("woodex");
  const [busy, setBusy] = useState(false);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [importRows, setImportRows] = useState<ImportRowResult[] | null>(null);
  const [importUnchanged, setImportUnchanged] = useState(0);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listProducts({ perPage: 1000, page: 1 });
      setRows(res.items);
      // keep the operator's selection across applies — bulk edits usually stack
      setSelected((prev) => {
        const ids = new Set(res.items.map((i) => i.id));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
    } catch (e) {
      console.error(e);
      toast.error("Could not load the catalogue.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.listBrands().then((rows) => {
      const active = rows.filter((b) => b.active).map(({ id, name }) => ({ id, name }));
      setBrands(active);
      if (active.length > 0 && !active.some((b) => b.id === brandId)) setBrandId(active[0].id);
    }).catch(() => setBrands([{ id: "woodex", name: "Woodex" }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);

  const visible = useMemo(() => rows.filter((r) => {
    if (category !== "all" && r.category !== category) return false;
    if (brandFilter !== "all" && r.brandId !== brandFilter) return false;
    if (statusFilter !== "all" && r.stockStatus !== statusFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [r.name, r.sku, r.category].join(" ").toLowerCase().includes(q);
  }), [rows, query, category, brandFilter, statusFilter]);

  const visibleIds = useMemo(() => visible.map((r) => r.id), [visible]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = !allVisibleSelected && someVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    setFocusIdx((i) => (i === null ? null : visible.length === 0 ? null : Math.min(i, visible.length - 1)));
  }, [visible.length]);

  const toggleOne = (id: string) =>
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  const selectedCount = selected.size;
  const applyPatch = async (patch: BulkProductPatch, successMessage: string) => {
    if (selectedCount === 0) return;
    // snapshot pre-apply state so the operator can revert the whole batch
    const before = rows
      .filter((r) => selected.has(r.id))
      .map((r): ResolvedProduct => ({ id: r.id, sku: r.sku, name: r.name, category: r.category, price: r.price, compareAtPrice: r.compareAtPrice, stock: r.stock, stockStatus: r.stockStatus, isBestSeller: r.isBestSeller, brandId: r.brandId }));
    setBusy(true);
    try {
      const { updated } = await api.bulkUpdateProducts([...selected], patch);
      toast.success(`${successMessage} — ${updated} product${updated === 1 ? "" : "s"} updated. Press Undo to revert.`, { duration: 8000 });
      if (before.length > 0) setUndoStack((prev) => [...prev.slice(-4), { label: successMessage, snaps: before }]);
      setAction(null);
      await load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Bulk update failed.");
    } finally {
      setBusy(false);
    }
  };

  const undoLast = async () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setBusy(true);
    let okCount = 0;
    const failures: string[] = [];
    for (const s of entry.snaps) {
      const patch = {
        price: s.price,
        stock: s.stock,
        stockStatus: s.stockStatus,
        isBestSeller: s.isBestSeller,
        brandId: s.brandId,
        category: s.category,
        // pre-apply strikethrough restored — or explicitly cleared when the batch ADDED one
        compareAtPrice: s.compareAtPrice ?? (null as unknown as number),
      };
      try {
        await api.updateProduct(s.id, patch);
        okCount += 1;
      } catch (e) {
        failures.push(s.sku + (e instanceof Error ? ` (${e.message})` : ""));
      }
    }
    setUndoStack((prev) => prev.slice(0, -1));
    setBusy(false);
    if (failures.length > 0) {
      toast.error(`Undo "${entry.label}" restored ${okCount}/${entry.snaps.length} — failed: ${failures.slice(0, 4).join(", ")}`);
    } else {
      toast.success(`Undone "${entry.label}" — restored ${okCount} products.`);
    }
    await load();
  };

  const exportCsv = () => {
    const scope = selectedCount > 0 ? rows.filter((r) => selected.has(r.id)) : visible;
    const brandName = (id?: string) => (id ? brands.find((b) => b.id === id)?.name ?? id : "");
    const body = scope.map((p) => [
      p.id, p.sku, p.name, p.category, brandName(p.brandId),
      String(p.price), p.compareAtPrice != null ? String(p.compareAtPrice) : "",
      String(p.stock), p.stockStatus, p.isBestSeller ? "yes" : "no",
    ]);
    const text = [Array.from(EXPORT_HEADERS), ...body].map((r) => r.map(csvEsc).join(",")).join("\n");
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `woodex-bulk-export-${body.length}-products.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${body.length} products to CSV. Edit then re-import — empty cells are left unchanged.`);
  };

  const onImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    file.text().then((text) => {
      const rowsByIndex = new Map<string, ResolvedProduct>();
      for (const r of rows) {
        rowsByIndex.set(r.id.toLowerCase(), r);
        rowsByIndex.set(r.sku.toLowerCase(), r);
      }
      const { results, unchanged } = buildImportPreview(text, rowsByIndex);
      setImportRows(results);
      setImportUnchanged(unchanged);
    }).catch(() => toast.error("Could not read that file."));
  };

  const applyImport = async () => {
    if (!importRows) return;
    const applyable = importRows.filter((r): r is Extract<ImportRowResult, { ok: true }> => r.ok && r.changes.length > 0);
    if (applyable.length === 0) return;
    setBusy(true);
    let okCount = 0;
    const failures: string[] = [];
    for (const row of applyable) {
      const patch: Record<string, unknown> = {};
      for (const c of row.changes) {
        if (c.field === "price" || c.field === "stock") patch[c.field] = Number(c.to);
        else if (c.field === "compareAtPrice") patch.compareAtPrice = Number(c.to);
        else if (c.field === "stockStatus") patch.stockStatus = c.to;
        else if (c.field === "isBestSeller") patch.isBestSeller = c.to === "yes";
      }
      try {
        await api.updateProduct(row.id, patch as Parameters<typeof api.updateProduct>[1]);
        okCount += 1;
      } catch (e) {
        failures.push(row.sku + (e instanceof Error ? ` (${e.message})` : ""));
      }
    }
    setImportRows(null);
    setBusy(false);
    if (failures.length > 0) toast.error(`Import applied to ${okCount}/${applyable.length} products — failed: ${failures.slice(0, 4).join(", ")}`);
    else toast.success(`Import applied to ${okCount} products.`);
    await load();
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const count = visible.length;
    if (count === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setFocusIdx((i) => {
        const next = Math.min(count - 1, Math.max(0, (i ?? (dir > 0 ? -1 : count)) + dir));
        rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
    } else if (e.key === "Home") { e.preventDefault(); setFocusIdx(0); rowRefs.current[0]?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "End") { e.preventDefault(); setFocusIdx(count - 1); rowRefs.current[count - 1]?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === " ") {
      if (focusIdx === null) return;
      e.preventDefault();
      toggleOne(visible[focusIdx].id);
    } else if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      setSelected((prev) => new Set([...prev, ...visibleIds]));
    } else if (e.key === "/") {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
  };

  const selectedPriceDelta = pricePct === 0 ? 0 : Math.round((165000 * (1 + pricePct / 100)) / 10) * 10 - 165000;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2"><ListChecks className="h-6 w-6 text-accent" /> Bulk Assortment Editor</h1>
          <p className="text-sm text-muted-foreground mt-1">Multi-select products, apply one operation — pricing, fulfilment, sale badges and best-seller flags — in a single pass.</p>
          <p className="text-xs text-muted-foreground mt-1">{rows.length} products in catalogue{selectedCount > 0 && <> · <span className="font-semibold text-accent">{selectedCount} selected</span></>}</p>
        </div>
      </div>

      <SectionCard title="Catalogue queue">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input ref={searchRef} aria-label="Search products" placeholder="Search name, SKU or category…  ( / )" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All categories ({categories.length})</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Brand" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All brands ({brands.length})</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <ToggleGroup type="single" value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as "all" | StockStatus)} aria-label="Filter by stock status" className="h-10 rounded-md bg-muted p-1">
            <ToggleGroupItem value="all" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">All</ToggleGroupItem>
            <ToggleGroupItem value="in_stock" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">In stock</ToggleGroupItem>
            <ToggleGroupItem value="made_to_order" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Made to order</ToggleGroupItem>
            <ToggleGroupItem value="out_of_stock" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Out of stock</ToggleGroupItem>
          </ToggleGroup>
          <span className="text-xs text-muted-foreground ml-auto">{visible.length} shown</span>
          <Button size="sm" variant="outline" onClick={exportCsv} title="Download selected products (or everything shown, if none selected) as CSV"><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} title="Re-import an edited bulk-export CSV — every row is diffed before anything is written"><Upload className="h-4 w-4 mr-1.5" />Import CSV</Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" aria-hidden="true" tabIndex={-1} onChange={onImportFile} />
        </div>

        <p className="mb-2 text-[11px] text-muted-foreground">Keyboard: ↑/↓ move · Space select · Ctrl/⌘+A all shown · / jump to search · Esc clears focus</p>
        {loading ? (
          <SectionSkeleton rows={8} />
        ) : visible.length === 0 ? (
          <EmptyState icon={Search} title="Nothing matches" hint="Try clearing the search or the filters." />
        ) : (
          <div className="overflow-x-auto outline-none rounded-md focus-visible:ring-2 focus-visible:ring-accent/50" tabIndex={0} aria-label="Catalogue grid. Arrow keys move the active row; Space toggles its selection." onKeyDown={onGridKey} onBlur={() => setFocusIdx(null)}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2 w-10"><input ref={selectAllRef} type="checkbox" aria-label="Select all shown" className="h-4 w-4 accent-[hsl(var(--accent))]" checked={allVisibleSelected} onChange={toggleAll} /></th>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4 text-right">Price</th>
                  <th className="py-2 pr-4">Stock</th>
                  <th className="py-2 pr-2 text-center" title="Best seller"><span className="sr-only">Best seller</span><Star className="h-3.5 w-3.5 inline" aria-hidden /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((p, idx) => (
                  <tr
                    key={p.id}
                    ref={(el) => { rowRefs.current[idx] = el; }}
                    aria-selected={selected.has(p.id)}
                    onClick={(e) => { const t = e.target as HTMLElement; if (t.closest("input,button,a,select")) return; toggleOne(p.id); }}
                    className={`cursor-pointer transition ${idx === focusIdx ? "bg-accent/15 ring-1 ring-inset ring-accent/60" : selected.has(p.id) ? "bg-accent/5" : ""}`}
                  >
                    <td className="py-2 pr-2"><input type="checkbox" aria-label={`Select ${p.name}`} className="h-4 w-4 accent-[hsl(var(--accent))]" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} /></td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-3">
                        <img src={p.image} alt="" className="h-10 w-10 rounded object-cover bg-section-light flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground leading-tight line-clamp-1 max-w-[280px]">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{p.category}</td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      <span className="font-semibold text-foreground">{formatPKR(p.price)}</span>
                      {p.compareAtPrice !== undefined && p.compareAtPrice > p.price && <span className="block text-[11px] text-muted-foreground line-through">{formatPKR(p.compareAtPrice)}</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONE[p.stockStatus]}`}>{STATUS_LABEL[p.stockStatus]}</span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">qty {p.stock}</span>
                    </td>
                    <td className="py-2 pr-2 text-center">{p.isBestSeller ? <Star className="h-4 w-4 inline fill-amber-400 text-amber-500" /> : <span className="text-muted-foreground/40">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Floating bulk bar */}
      {selectedCount > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-background/95 backdrop-blur px-4 py-3 shadow-2xl" role="status">
          <span className="text-sm font-bold text-foreground whitespace-nowrap mr-1">{selectedCount} selected</span>
          <Button size="sm" variant="secondary" onClick={() => setAction("pricePct")}><TrendingDown className="h-4 w-4 mr-1.5" /> Price ±%</Button>
          <Button size="sm" variant="secondary" onClick={() => setAction("markOnSale")}><Tag className="h-4 w-4 mr-1.5" /> Mark on sale</Button>
          <Button size="sm" variant="secondary" onClick={() => setAction("clearSale")}><X className="h-4 w-4 mr-1.5" /> Clear sale</Button>
          <Button size="sm" variant="secondary" onClick={() => setAction("stockStatus")}><ChevronDown className="h-4 w-4 mr-1.5" /> Fulfilment</Button>
          <Button size="sm" variant="secondary" onClick={() => setAction("stockDelta")}><Plus className="h-4 w-4 mr-1.5" /> Stock ±N</Button>
          <Button size="sm" variant="secondary" onClick={() => setAction("bestSeller")}><Star className="h-4 w-4 mr-1.5" /> Best seller</Button>
          <Button size="sm" variant="secondary" onClick={() => setAction("brand")}><BadgeCheck className="h-4 w-4 mr-1.5" /> Brand</Button>
          <Button size="sm" variant="outline" disabled={busy || undoStack.length === 0} onClick={() => void undoLast()} title={undoStack.length > 0 ? `Revert "${undoStack[undoStack.length - 1].label}" (${undoStack[undoStack.length - 1].snaps.length} products)` : "Nothing to undo"}><Undo2 className="h-4 w-4 mr-1.5" />Undo</Button>
          <Button size="sm" variant="ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></Button>
        </div>
      )}

      {/* CSV import preview — dry run, apply only what differs */}
      <Dialog open={importRows !== null} onOpenChange={(open) => { if (!open) setImportRows(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import CSV — {importRows?.filter((r) => r.ok && r.changes.length > 0).length ?? 0} product(s) with changes</DialogTitle>
          </DialogHeader>
          {importRows && (
            <>
              {importUnchanged > 0 && <p className="text-xs text-muted-foreground">{importUnchanged} identical row(s) skipped — nothing re-written.</p>}
              <div className="max-h-[46vh] overflow-y-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Changes</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {importRows.map((r, i) => {
                      if (r.ok) {
                        const okRow = r as Extract<ImportRowResult, { ok: true }>;
                        return (
                          <tr key={`${okRow.id}-${i}`}>
                            <td className="px-3 py-2 max-w-[180px]"><span className="font-medium">{okRow.name}</span><span className="block text-[10px] text-muted-foreground">{okRow.sku}</span></td>
                            <td className="px-3 py-2"><ul className="space-y-0.5">{okRow.changes.map((c, j) => <li key={j}><span className="font-semibold">{c.field}</span>: <span className="text-muted-foreground">{c.from}</span> → <span className="font-semibold">{c.to}</span></li>)}</ul></td>
                          </tr>
                        );
                      }
                      const errRow = r as Extract<ImportRowResult, { ok: false }>;
                      return (
                        <tr key={`err-${i}`} className="bg-amber-50"><td className="px-3 py-2 font-mono">{errRow.ref}</td><td className="px-3 py-2 text-amber-900">skipped — {errRow.message}</td></tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground">Empty cells were ignored. The <code>id</code> column (or <code>sku</code>) is required to match rows. compare_at_price updates set a number; to remove a strikethrough use Clear sale above.</p>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportRows(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void applyImport()} disabled={busy || !importRows || !importRows.some((r) => r.ok && r.changes.length > 0)} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}Apply {importRows?.filter((r) => r.ok && r.changes.length > 0).length ?? 0} product(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action dialogs */}
      <Dialog open={action !== null} onOpenChange={(open) => { if (!open) setAction(null); }}>
        <DialogContent className="max-w-md">
          {action === "pricePct" && (
            <>
              <DialogHeader><DialogTitle>Price change — {selectedCount} product{selectedCount === 1 ? "" : "s"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <label htmlFor="be-pct" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adjust price — {pricePct > 0 ? "+" : ""}{pricePct}%</label>
                <input id="be-pct" type="range" min={-50} max={40} step={1} value={pricePct} onChange={(e) => setPricePct(Number(e.target.value))} className="w-full accent-[hsl(var(--accent))]" aria-valuemin={-50} aria-valuemax={40} aria-valuenow={pricePct} aria-label="Price adjustment percent" />
                <p className="text-[11px] text-muted-foreground">A Rs 165,000 product becomes Rs {Math.max(1, Math.round((165000 * (1 + pricePct / 100)) / 10) * 10).toLocaleString("en-PK")}{pricePct < 0 ? ` (−${Math.abs(selectedPriceDelta).toLocaleString("en-PK")})` : ""}. Prices round to the nearest Rs 10 and clamp at Rs 1. Compare-at prices invalidate themselves if they drop below the new price.</p>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                  <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--accent))]" checked={includeCompareAt} onChange={(e) => setIncludeCompareAt(e.target.checked)} /> Apply the same % to compare-at (strikethrough) prices
                </label>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
                <Button onClick={() => void applyPatch({ kind: "pricePct", pct: pricePct, includeCompareAt }, `Price ${pricePct >= 0 ? "raised" : "cut"} ${Math.abs(pricePct)}%`)} disabled={busy || pricePct === 0} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}Apply</Button>
              </DialogFooter>
            </>
          )}
          {action === "stockStatus" && (
            <>
              <DialogHeader><DialogTitle>Fulfilment mode — {selectedCount} product{selectedCount === 1 ? "" : "s"}</DialogTitle></DialogHeader>
              <div className="grid gap-2">
                {(Object.keys(STATUS_LABEL) as StockStatus[]).map((s) => (
                  <button key={s} type="button" onClick={() => setStatusValue(s)} aria-pressed={statusValue === s}
                    className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition ${statusValue === s ? "border-accent bg-accent/5 text-foreground" : "border-border text-muted-foreground hover:border-accent/60"}`}>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_TONE[s]}`}>{STATUS_LABEL[s]}</span>
                    {s === "out_of_stock" && <span className="text-[11px]">Also zeroes shelf qty</span>}
                    {s === "made_to_order" && <span className="text-[11px]">Sellable, built on order — qty untouched</span>}
                    {s === "in_stock" && <span className="text-[11px]">Sellable; bumps 0 → 1 when empty</span>}
                  </button>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
                <Button onClick={() => void applyPatch({ kind: "stockStatus", status: statusValue }, "Fulfilment updated")} disabled={busy} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}Apply</Button>
              </DialogFooter>
            </>
          )}
          {action === "markOnSale" && (
            <>
              <DialogHeader><DialogTitle>Mark on sale — {selectedCount} product{selectedCount === 1 ? "" : "s"}</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <label htmlFor="be-sale" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discount — {salePct}%</label>
                <Input id="be-sale" type="number" min={1} max={60} value={salePct} onChange={(e) => setSalePct(Math.max(1, Math.min(60, Math.floor(Number(e.target.value) || 1))))} />
                <p className="text-[11px] text-muted-foreground">Sets compare-at = current price, then discounts the price by {salePct}% (nearest Rs 10). Customer sees a strikethrough with "Save {salePct}%" on cards and detail pages.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
                <Button onClick={() => void applyPatch({ kind: "markOnSale", pct: salePct }, `Marked ${salePct}% on sale`)} disabled={busy} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Tag className="h-4 w-4 mr-1.5" />}Apply</Button>
              </DialogFooter>
            </>
          )}
          {action === "clearSale" && (
            <>
              <DialogHeader><DialogTitle>Clear sale pricing — {selectedCount} product{selectedCount === 1 ? "" : "s"}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Removes the strikethrough (compare-at) price from every selected product that has one. Current prices are untouched.</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
                <Button variant="destructive" onClick={() => void applyPatch({ kind: "clearSale" }, "Sale pricing cleared")} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}Clear sale</Button>
              </DialogFooter>
            </>
          )}
          {action === "bestSeller" && (
            <>
              <DialogHeader><DialogTitle>Best seller flag — {selectedCount} product{selectedCount === 1 ? "" : "s"}</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Best-seller products power the "Best Sellers" merchandising rules (automatic collections) and badges on the storefront.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button onClick={() => void applyPatch({ kind: "bestSeller", value: true }, "Marked best seller")} disabled={busy} variant="secondary">{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Star className="h-4 w-4 mr-1.5" />}Mark best seller</Button>
                <Button onClick={() => void applyPatch({ kind: "bestSeller", value: false }, "Unmarked best seller")} disabled={busy} variant="outline">{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <X className="h-4 w-4 mr-1.5" />}Unmark</Button>
              </div>
            </>
          )}
          {action === "brand" && (
            <>
              <DialogHeader><DialogTitle>Assign brand — {selectedCount} product{selectedCount === 1 ? "" : "s"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <label htmlFor="be-brand" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand for all selected products</label>
                <select id="be-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground">Sets <code>brandId</code> on every selected product — undo by assigning another brand. The catalogue is Woodex today; partner brands appear here once added in <span className="font-semibold">Brands</span>.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
                <Button onClick={() => void applyPatch({ kind: "brand", brandId }, `Brand → ${brands.find((b) => b.id === brandId)?.name ?? brandId}`)} disabled={busy || !brandId} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <BadgeCheck className="h-4 w-4 mr-1.5" />}Apply</Button>
              </DialogFooter>
            </>
          )}
          {action === "stockDelta" && (
            <>
              <DialogHeader><DialogTitle>Adjust stock — {selectedCount} product{selectedCount === 1 ? "" : "s"}</DialogTitle></DialogHeader>
              <div className="space-y-2">
                <label htmlFor="be-delta" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change by (units; negative to remove)</label>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" aria-label="Decrease" onClick={() => setStockDelta((v) => v - 1)}><Minus className="h-4 w-4" /></Button>
                  <Input id="be-delta" type="number" value={stockDelta} onChange={(e) => setStockDelta(Math.trunc(Number(e.target.value) || 0))} className="text-center font-bold" />
                  <Button size="icon" variant="outline" aria-label="Increase" onClick={() => setStockDelta((v) => v + 1)}><Plus className="h-4 w-4" /></Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Floor is zero — removals clamp. Fulfilment mode is re-derived from the resulting quantity (made-to-order stays made-to-order).</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
                <Button onClick={() => void applyPatch({ kind: "stockDelta", delta: stockDelta }, `Stock ${stockDelta >= 0 ? "added" : "removed"} ${Math.abs(stockDelta)}`)} disabled={busy || stockDelta === 0} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">{busy ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}Apply</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
