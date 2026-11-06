import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck, Check, ChevronDown, ListChecks, Loader2, Minus, Plus, Search, Star, Tag, Trash2, TrendingDown, X,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminProduct, BulkProductPatch, StockStatus } from "@/api/types";
import { formatPKR, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    setBusy(true);
    try {
      const { updated } = await api.bulkUpdateProducts([...selected], patch);
      toast.success(`${successMessage} — ${updated} product${updated === 1 ? "" : "s"} updated.`);
      setAction(null);
      await load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Bulk update failed.");
    } finally {
      setBusy(false);
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
            <Input aria-label="Search products" placeholder="Search name, SKU or category…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All categories ({categories.length})</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Brand" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">All brands ({brands.length})</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | StockStatus)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="in_stock">In stock</TabsTrigger>
              <TabsTrigger value="made_to_order">Made to order</TabsTrigger>
              <TabsTrigger value="out_of_stock">Out of stock</TabsTrigger>
            </TabsList>
          </Tabs>
          <span className="text-xs text-muted-foreground ml-auto">{visible.length} shown</span>
        </div>

        {loading ? (
          <SectionSkeleton rows={8} />
        ) : visible.length === 0 ? (
          <EmptyState icon={Search} title="Nothing matches" hint="Try clearing the search or the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-2 w-10"><input ref={selectAllRef} type="checkbox" aria-label="Select all shown" className="h-4 w-4 accent-[hsl(var(--accent))]" checked={allVisibleSelected} onChange={toggleAll} /></th>
                  <th className="py-2 pr-4">Product</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4 text-right">Price</th>
                  <th className="py-2 pr-4">Stock</th>
                  <th className="py-2 pr-2 text-center" title="Best seller"><Star className="h-3.5 w-3.5 inline" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((p) => (
                  <tr key={p.id} className={selected.has(p.id) ? "bg-accent/5" : undefined}>
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
          <Button size="sm" variant="ghost" aria-label="Clear selection" onClick={() => setSelected(new Set())}><X className="h-4 w-4" /></Button>
        </div>
      )}

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
