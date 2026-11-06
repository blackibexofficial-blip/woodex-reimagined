import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ChevronLeft, ChevronRight, Loader2, PackageSearch, Pencil, Star } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminProduct } from "@/api/types";
import { categories } from "@/data/products";
import { formatPKR, formatNumber, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PER_PAGE = 10;

function exportCsv(rows: AdminProduct[]) {
  const escape = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["id", "name", "category", "price", "compare_at_price", "stock", "in_stock", "rating", "reviews"].join(",");
  const body = rows.map((p) => [escape(p.id), escape(p.name), escape(p.category), p.price, p.compareAtPrice ?? "", p.stock, p.inStock ? "yes" : "no", p.rating, p.reviews].join(","));
  const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `woodex-products-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminProducts() {
  const api = useMemo(() => getAdminApi(), []);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listProducts({
        query: debounced || undefined,
        category: category === "all" ? undefined : category,
        inStock: stockFilter === "all" ? undefined : stockFilter === "in",
        page,
        perPage: PER_PAGE,
      });
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
      toast.error("Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [api, debounced, category, stockFilter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [debounced, category, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const categoryOptions = useMemo(() => categories.filter((c: { id: string; name: string }) => c.id !== "all").map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })), []);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    await api.updateProduct(editing.id, {
      name: editing.name,
      price: editing.price,
      compareAtPrice: editing.compareAtPrice,
      stock: Number(editing.stock) || 0,
      inStock: editing.inStock,
      isBestSeller: editing.isBestSeller,
    });
    setSaving(false);
    setEditing(null);
    toast.success("Product updated.");
    load();
  };

  const toggleStock = async (p: AdminProduct, value: boolean) => {
    setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, inStock: value, stock: value && r.stock === 0 ? 12 : r.stock } : r)));
    await api.updateProduct(p.id, { inStock: value, stock: value && p.stock === 0 ? 12 : p.stock });
    toast.success(value ? "Marked in stock." : "Marked out of stock.");
  };

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Input placeholder="Search products, categories, IDs…" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-xs bg-white" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-52 bg-white"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOptions.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
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
        </div>
        <Button variant="outline" onClick={() => exportCsv(rows)} className="bg-white">
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
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
                    <th className="px-5 py-2.5 text-right">Edit</th>
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
                            <p className="font-mono text-[10px] uppercase text-muted-foreground">{p.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-xs capitalize text-muted-foreground">{p.category.replace(/-/g, " ")}</td>
                      <td className="px-5 py-2.5 text-right">
                        <span className="font-semibold">{formatPKR(p.price)}</span>
                        {p.compareAtPrice && p.compareAtPrice > p.price && (
                          <span className="block text-[11px] text-muted-foreground line-through">{formatPKR(p.compareAtPrice)}</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={p.stock < 10 ? "font-semibold text-rose-600" : "text-foreground"}>{p.stock}</span>
                      </td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">{p.rating.toFixed(1)} <span className="text-muted-foreground">({p.reviews})</span></td>
                      <td className="px-5 py-2.5"><Switch checked={p.inStock} onCheckedChange={(v) => toggleStock(p, v)} aria-label="Toggle in stock" /></td>
                      <td className="px-5 py-2.5 text-right">
                        <Button size="icon" variant="ghost" onClick={() => setEditing({ ...p })} aria-label="Edit product">
                          <Pencil className="h-4 w-4" />
                        </Button>
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
                <p className="text-xs text-muted-foreground">ID: <span className="font-mono">{editing.id}</span></p>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="edit-stock">Units in stock</label>
                  <Input id="edit-stock" type="number" min={0} value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} />
                </div>
                <div className="flex items-end gap-4 pb-2">
                  <label className="flex items-center gap-2 text-sm text-foreground"><Switch checked={editing.inStock} onCheckedChange={(v) => setEditing({ ...editing, inStock: v })} /> In stock</label>
                  <label className="flex items-center gap-2 text-sm text-foreground"><Switch checked={editing.isBestSeller} onCheckedChange={(v) => setEditing({ ...editing, isBestSeller: v })} /> Featured</label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
