import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ListOrdered, Loader2, Plus, Trash2, LayoutTemplate, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminHomepageRail, AdminHomepageSections, AdminProduct, HomepageRailMode } from "@/api/types";
import { formatPKR, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const RAIL_MAX = 12;

type RailName = keyof AdminHomepageSections;

const RAILS: Array<{ key: RailName; title: string; hint: string; autoRule: string }> = [
  {
    key: "bestSellers",
    title: "Best Sellers rail",
    hint: "The homepage Best Sellers section.",
    autoRule: "Auto = products flagged Best Seller, sorted by reviews (top 8). Shown here exactly as the storefront would derive it.",
  },
  {
    key: "carousel",
    title: "Home Carousel",
    hint: "The rotating hero carousel above the fold.",
    autoRule: "Auto = in-stock products sorted by reviews (top 6). Shown here exactly as the storefront would derive it.",
  },
];

export default function AdminHomepage() {
  const api = useMemo(() => getAdminApi(), []);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [bestSellers, setBestSellers] = useState<AdminHomepageRail>({ mode: "auto", productIds: [] });
  const [carousel, setCarousel] = useState<AdminHomepageRail>({ mode: "auto", productIds: [] });
  const [addTarget, setAddTarget] = useState<Record<RailName, string>>({ bestSellers: "", carousel: "" });
  const [saving, setSaving] = useState<RailName | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sections, res] = await Promise.all([
        api.getHomepageSections(),
        api.listProducts({ perPage: 5000 }).catch(() => ({ items: [] as AdminProduct[], total: 0, page: 1, perPage: 5000 })),
      ]);
      setBestSellers(sections.bestSellers);
      setCarousel(sections.carousel);
      setProducts(res.items);
    } catch {
      toast.error("Could not load homepage sections.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const railState = (name: RailName): AdminHomepageRail => (name === "bestSellers" ? bestSellers : carousel);
  const setRail = (name: RailName) => (name === "bestSellers" ? setBestSellers : setCarousel);

  const autoPreview = useCallback((name: RailName): AdminProduct[] => {
    if (name === "bestSellers") return products.filter((p) => p.isBestSeller).sort((a, b) => b.reviews - a.reviews).slice(0, 8);
    return products.filter((p) => p.inStock).sort((a, b) => b.reviews - a.reviews).slice(0, 6);
  }, [products]);

  const move = (name: RailName, idx: number, dir: -1 | 1) => {
    const rail = railState(name);
    const next = [...rail.productIds];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setRail(name)({ ...rail, productIds: next });
  };
  const removeAt = (name: RailName, id: string) => {
    const rail = railState(name);
    setRail(name)({ ...rail, productIds: rail.productIds.filter((x) => x !== id) });
  };
  const add = (name: RailName) => {
    const rail = railState(name);
    const id = addTarget[name];
    if (!id) return;
    if (rail.productIds.length >= RAIL_MAX) { toast.error(`A rail holds at most ${RAIL_MAX} products.`); return; }
    if (rail.productIds.includes(id)) { toast.error("Already in this rail."); return; }
    setRail(name)({ ...rail, productIds: [...rail.productIds, id] });
    setAddTarget((t) => ({ ...t, [name]: "" }));
  };
  const switchMode = (name: RailName, mode: HomepageRailMode) => {
    const rail = railState(name);
    setRail(name)({ mode, productIds: mode === "auto" ? [] : rail.productIds });
  };

  const saveRail = async (name: RailName) => {
    setSaving(name);
    try {
      const rail = railState(name);
      const merged = await api.updateHomepageSections({ [name]: { mode: rail.mode, productIds: [...rail.productIds] } });
      setBestSellers(merged.bestSellers);
      setCarousel(merged.carousel);
      toast.success(`${name === "bestSellers" ? "Best Sellers rail" : "Home Carousel"} saved — ${merged[name].mode === "auto" ? "auto (flags)" : `manual, ${merged[name].productIds.length} product(s)`}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save homepage sections.");
    } finally {
      setSaving(null);
    }
  };

  const remainingFor = (name: RailName) => {
    const inRail = new Set(railState(name).productIds);
    return products.filter((p) => !inRail.has(p.id)).slice().sort((a, b) => a.name.localeCompare(b.name));
  };

  if (loading) {
    return <SectionCard title="Homepage rails"><SectionSkeleton rows={8} /></SectionCard>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-foreground"><LayoutTemplate className="h-6 w-6 text-accent" /> Homepage Sections</h1>
        <p className="mt-1 text-sm text-muted-foreground">Control the two homepage rails — which products they show, and whether they’re derived automatically from product flags or hand-picked and ordered.</p>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        <span className="font-semibold text-foreground">Demo master.</span> The storefront homepage is static until the Bagisto cutover — these settings persist here and become the live rails then.
        Category-level homepage switches live on the <span className="font-semibold">Categories</span> page (A5); this page controls the global rails and their order.
        Stale manual picks (products that no longer exist) are pruned automatically on save.
      </p>

      {RAILS.map(({ key, title, hint, autoRule }) => {
        const rail = railState(key);
        const stale = rail.productIds.filter((id) => !byId.has(id)).length;
        const auto = autoPreview(key);
        const manualRows = rail.productIds.map((id) => byId.get(id)).filter((p): p is AdminProduct => Boolean(p));
        const addable = remainingFor(key);
        return (
          <SectionCard key={key} title={`${title} — ${rail.mode === "auto" ? "Auto" : `Manual · ${rail.productIds.length}/${RAIL_MAX}`}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <p className="text-sm font-medium text-foreground">{hint}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{autoRule}</p>
              </div>
              <Select value={rail.mode} onValueChange={(v) => switchMode(key, v as HomepageRailMode)}>
                <SelectTrigger className="w-56 bg-white" aria-label={`${title} source mode`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto — derive from flags</SelectItem>
                  <SelectItem value="manual">Manual — hand-pick &amp; order</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {stale > 0 && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
                <TriangleAlert className="h-3.5 w-3.5" /> {stale} stored pick(s) no longer exist — they’ll be pruned on save.
              </p>
            )}

            {rail.mode === "auto" ? (
              <div className="pt-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Preview — what auto would serve</p>
                <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
                  {auto.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 bg-white px-3 py-2">
                      <span className="w-6 shrink-0 text-right font-mono text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                      <img src={p.image} alt="" loading="lazy" className="h-9 w-9 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p.name}</span>
                      <span className="hidden text-[11px] text-muted-foreground sm:inline">{p.reviews} reviews</span>
                      <span className="text-[11px] font-semibold text-foreground">{formatPKR(p.price)}</span>
                    </li>
                  ))}
                  {auto.length === 0 && <li className="bg-white px-3 py-6 text-center text-sm text-muted-foreground">No flagged products — everything would ship as manual.</li>}
                </ol>
              </div>
            ) : (
              <div className="pt-3">
                <ol className="divide-y divide-border overflow-hidden rounded-md border border-border">
                  {manualRows.map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 bg-white px-3 py-2">
                      <span className="w-6 shrink-0 text-right font-mono text-[11px] font-bold text-muted-foreground">{i + 1}</span>
                      <img src={p.image} alt="" loading="lazy" className="h-9 w-9 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                        <span className="block text-[10px] text-muted-foreground">{p.sku} · {formatPKR(p.price)}</span>
                      </span>
                      <button type="button" onClick={() => move(key, i, -1)} disabled={i === 0} aria-label={`Move ${p.name} up`} title="Move up" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => move(key, i, 1)} disabled={i === manualRows.length - 1} aria-label={`Move ${p.name} down`} title="Move down" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" onClick={() => removeAt(key, p.id)} aria-label={`Remove ${p.name}`} title="Remove from rail" className="rounded-md p-1.5 text-destructive/80 transition hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                  {manualRows.length === 0 && <li className="bg-white px-3 py-6 text-center text-sm text-muted-foreground">Empty rail — add products below. Nothing renders on the homepage until you do.</li>}
                </ol>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Add product to ${title}`}
                    value={addTarget[key]}
                    onChange={(e) => setAddTarget((t) => ({ ...t, [key]: e.target.value }))}
                    className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Pick a product to add…</option>
                    {addable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <Button type="button" variant="outline" size="sm" onClick={() => add(key)} disabled={!addTarget[key] || rail.productIds.length >= RAIL_MAX}><Plus className="mr-1 h-4 w-4" /> Add</Button>
                  <span className="text-[11px] text-muted-foreground">{rail.productIds.length}/{RAIL_MAX}</span>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end border-t border-border pt-3">
              <Button onClick={() => void saveRail(key)} disabled={saving === key} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
                {saving === key ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ListOrdered className="mr-1.5 h-4 w-4" />}
                Save {key === "bestSellers" ? "Best Sellers rail" : "Home Carousel"}
              </Button>
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}
