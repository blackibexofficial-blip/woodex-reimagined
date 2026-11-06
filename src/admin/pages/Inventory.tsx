import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes, CircleAlert, Hammer, Loader2, Package, PackageX, Plus, Search, History,
  Warehouse, Pencil, Trash2, MapPin, Truck, PackageSearch,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminDeliveryZone, AdminInventoryItem, AdminStockMovement, StockMovementType, StockStatus } from "@/api/types";
import {
  EmptyState, SectionCard, SectionSkeleton, StatCard, formatNumber, formatPKR, timeAgo,
} from "@/admin/components";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_STYLE: Record<StockStatus, string> = {
  in_stock: "bg-emerald-100 text-emerald-800 border-emerald-200",
  out_of_stock: "bg-rose-100 text-rose-800 border-rose-200",
  made_to_order: "bg-violet-100 text-violet-800 border-violet-200",
};
const STATUS_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  out_of_stock: "Out of stock",
  made_to_order: "Made to order",
};
const MOVEMENT_STYLE: Record<StockMovementType, string> = {
  inbound: "bg-emerald-100 text-emerald-800 border-emerald-200",
  outbound: "bg-rose-100 text-rose-800 border-rose-200",
  return: "bg-sky-100 text-sky-800 border-sky-200",
  damage: "bg-amber-100 text-amber-800 border-amber-200",
  adjustment: "bg-muted text-muted-foreground border-border",
  transfer: "bg-violet-100 text-violet-800 border-violet-200",
};
const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  inbound: "Inbound",
  outbound: "Outbound",
  return: "Return",
  damage: "Damage",
  adjustment: "Adjustment",
  transfer: "Transfer",
};

type Tab = "stock" | "movements" | "zones";
type Filter = "all" | "in" | "low" | "out" | "made_to_order";

const emptyZoneDraft = (): Omit<AdminDeliveryZone, "id" | "createdAt" | "updatedAt"> & { id?: string } => ({
  zoneName: "",
  city: "",
  postalCodes: [],
  standardCost: 2000,
  expressCost: 5000,
  sameDayCost: 8000,
  standardDays: 3,
  expressDays: 1,
  codAvailable: true,
  isActive: true,
});

export default function AdminInventory() {
  const api = useMemo(() => getAdminApi(), []);

  const [tab, setTab] = useState<Tab>("stock");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AdminInventoryItem[]>([]);
  const [movements, setMovements] = useState<AdminStockMovement[]>([]);
  const [movementProduct, setMovementProduct] = useState<string>("all");
  const [zones, setZones] = useState<AdminDeliveryZone[]>([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [loadingZones, setLoadingZones] = useState(true);

  // adjust-stock dialog
  const [adjustTarget, setAdjustTarget] = useState<AdminInventoryItem | null>(null);
  const [movementType, setMovementType] = useState<StockMovementType>("inbound");
  const [movementQty, setMovementQty] = useState("1");
  const [movementNotes, setMovementNotes] = useState("");
  const [savingAdjust, setSavingAdjust] = useState(false);

  // zone editor dialog
  const [zoneEditor, setZoneEditor] = useState<ReturnType<typeof emptyZoneDraft> | null>(null);
  const [zonePostal, setZonePostal] = useState("");
  const [savingZone, setSavingZone] = useState(false);
  const [armDelete, setArmDelete] = useState<string | null>(null);

  const loadStock = useCallback(async (q = query, f = filter) => {
    setLoadingStock(true);
    try {
      setItems(await api.listInventory({ query: q || undefined, filter: f }));
    } catch (e) {
      console.error(e);
      toast.error("Could not load inventory.");
    } finally {
      setLoadingStock(false);
    }
  }, [api, query, filter]);

  const loadMovements = useCallback(async (productId = movementProduct) => {
    try {
      setMovements(await api.listStockMovements({ productId: productId === "all" ? undefined : productId, limit: 60 }));
    } catch (e) {
      console.error(e);
      toast.error("Could not load movement history.");
    }
  }, [api, movementProduct]);

  const loadZones = useCallback(async () => {
    setLoadingZones(true);
    try {
      setZones(await api.listDeliveryZones());
    } catch (e) {
      console.error(e);
      toast.error("Could not load delivery zones.");
    } finally {
      setLoadingZones(false);
    }
  }, [api]);

  useEffect(() => { loadStock(); }, [loadStock]);
  useEffect(() => { loadMovements(); }, [loadMovements]);
  useEffect(() => { loadZones(); }, [loadZones]);

  const stats = useMemo(() => {
    const inShelf = items.filter((i) => i.stockStatus !== "made_to_order");
    return {
      totalUnits: inShelf.reduce((s, i) => s + i.quantity, 0),
      out: items.filter((i) => i.stockStatus !== "made_to_order" && i.quantity === 0).length,
      low: items.filter((i) => i.stockStatus !== "made_to_order" && i.quantity > 0 && i.quantity <= i.lowStockThreshold).length,
      madeToOrder: items.filter((i) => i.stockStatus === "made_to_order").length,
    };
  }, [items]);

  /* ── adjust stock ─────────────────────────────────────────────────────── */
  const openAdjust = (item: AdminInventoryItem) => {
    setAdjustTarget(item);
    setMovementType("inbound");
    setMovementQty("1");
    setMovementNotes("");
  };

  const saveAdjust = async () => {
    if (!adjustTarget) return;
    const raw = Number(movementQty);
    if (!Number.isFinite(raw) || (movementType === "adjustment" ? raw === 0 : Math.trunc(Math.abs(raw)) === 0)) {
      toast.error(movementType === "adjustment" ? "Enter a non-zero signed change." : "Enter at least one unit.");
      return;
    }
    setSavingAdjust(true);
    try {
      const result = await api.adjustStock({
        productId: adjustTarget.productId,
        type: movementType,
        quantity: movementType === "adjustment" ? Math.trunc(raw) : Math.trunc(Math.abs(raw)),
        notes: movementNotes || undefined,
      });
      if (result) {
        toast.success(`Stock ${result.movement.quantity >= 0 ? "+" : ""}${result.movement.quantity} applied — ${adjustTarget.name} now at ${result.item.quantity}.`);
      }
      setAdjustTarget(null);
      await Promise.all([loadStock(), loadMovements()]);
    } catch (e) {
      console.error(e);
      toast.error("Could not adjust stock.");
    } finally {
      setSavingAdjust(false);
    }
  };

  /* ── delivery zones ───────────────────────────────────────────────────── */
  const openZoneEditor = (zone?: AdminDeliveryZone) => {
    setArmDelete(null);
    if (zone) {
      setZoneEditor({ ...zone });
      setZonePostal(zone.postalCodes.join(", "));
    } else {
      setZoneEditor(emptyZoneDraft());
      setZonePostal("");
    }
  };

  const saveZone = async () => {
    if (!zoneEditor) return;
    if (!zoneEditor.zoneName.trim() || !zoneEditor.city.trim()) {
      toast.error("Zone name and city are required.");
      return;
    }
    setSavingZone(true);
    try {
      await api.saveDeliveryZone({
        ...zoneEditor,
        postalCodes: zonePostal ? zonePostal.split(",") : [],
      });
      toast.success(zoneEditor.id ? "Zone updated." : "Zone added.");
      setZoneEditor(null);
      loadZones();
    } catch (e) {
      console.error(e);
      toast.error("Could not save the zone.");
    } finally {
      setSavingZone(false);
    }
  };

  const deleteZone = async (id: string) => {
    if (armDelete !== id) {
      setArmDelete(id);
      window.setTimeout(() => setArmDelete((cur) => (cur === id ? null : cur)), 3500);
      return;
    }
    try {
      await api.deleteDeliveryZone(id);
      toast.success("Zone removed.");
      setArmDelete(null);
      loadZones();
    } catch (e) {
      console.error(e);
      toast.error("Could not remove the zone.");
    }
  };

  const signedQty = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const movementSign = movementType === "outbound" || movementType === "damage" ? "Units will be subtracted" : movementType === "adjustment" ? "Signed change, e.g. -3 removes 3" : "Units will be added";

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Units in warehouse" value={formatNumber(stats.totalUnits)} sub="excludes made-to-order" icon={Boxes} tone="stone" />
        <StatCard label="Low stock" value={formatNumber(stats.low)} sub="at or below threshold" icon={CircleAlert} tone="amber" />
        <StatCard label="Out of stock" value={formatNumber(stats.out)} sub="needs replenishment" icon={PackageX} tone="rose" />
        <StatCard label="Made to order" value={formatNumber(stats.madeToOrder)} sub="built on demand" icon={Hammer} tone="violet" />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="stock"><Warehouse className="mr-2 h-4 w-4" />Stock</TabsTrigger>
          <TabsTrigger value="movements"><History className="mr-2 h-4 w-4" />Movements</TabsTrigger>
          <TabsTrigger value="zones"><Truck className="mr-2 h-4 w-4" />Delivery zones</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── STOCK TAB ─────────────────────────────────────────────────── */}
      {tab === "stock" && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by product, SKU or category…"
                aria-label="Search inventory"
                className="bg-white pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stock filter">
              {([
                ["all", "All"],
                ["in", "In stock"],
                ["low", "Low stock"],
                ["out", "Out of stock"],
                ["made_to_order", "Made to order"],
              ] as Array<[Filter, string]>).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={filter === value ? "default" : "outline"}
                  className={cn("h-8 rounded-full text-xs", filter === value && "bg-accent text-accent-foreground hover:bg-hon-green-dark")}
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <SectionCard title={`${formatNumber(items.length)} SKU${items.length === 1 ? "" : "s"}`}>
            {loadingStock ? (
              <SectionSkeleton rows={8} />
            ) : items.length === 0 ? (
              <EmptyState icon={PackageSearch} title="No products match your filters" hint="Clear the search or widen the filter." />
            ) : (
              <div className="-mx-5 -mb-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-2.5">Product</th>
                      <th className="px-5 py-2.5">Location</th>
                      <th className="px-5 py-2.5 text-right">Qty</th>
                      <th className="px-5 py-2.5 text-right">Min</th>
                      <th className="px-5 py-2.5">Status</th>
                      <th className="px-5 py-2.5">Updated</th>
                      <th className="px-5 py-2.5 text-right">Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-muted">
                    {items.map((item) => {
                      const isLow = item.stockStatus !== "made_to_order" && item.quantity > 0 && item.quantity <= item.lowStockThreshold;
                      return (
                        <tr key={item.productId} className="hover:bg-secondary">
                          <td className="px-5 py-2.5">
                            <div className="flex items-center gap-3">
                              {item.image && <img src={item.image} alt="" loading="lazy" className="h-12 w-12 rounded-md object-cover" />}
                              <div className="min-w-0">
                                <p className="max-w-[220px] truncate font-medium text-foreground">{item.name}</p>
                                <p className="font-mono text-[10px] uppercase text-muted-foreground">{item.sku}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-2.5 text-xs text-muted-foreground">{item.location}</td>
                          <td className="px-5 py-2.5 text-right">
                            <span className={cn("font-semibold", item.quantity === 0 ? "text-rose-600" : isLow ? "text-amber-600" : "text-foreground")}>
                              {formatNumber(item.quantity)}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-right text-xs text-muted-foreground">{item.lowStockThreshold}</td>
                          <td className="px-5 py-2.5">
                            {item.stockStatus === "made_to_order" ? (
                              <Badge variant="outline" className={cn("font-medium", STATUS_STYLE.made_to_order)}>{STATUS_LABEL.made_to_order}</Badge>
                            ) : item.quantity === 0 ? (
                              <Badge variant="outline" className={cn("font-medium", STATUS_STYLE.out_of_stock)}>Out of stock</Badge>
                            ) : isLow ? (
                              <Badge variant="outline" className="border-amber-200 bg-amber-100 font-medium text-amber-800">Low stock</Badge>
                            ) : (
                              <Badge variant="outline" className={cn("font-medium", STATUS_STYLE.in_stock)}>{STATUS_LABEL.in_stock}</Badge>
                            )}
                          </td>
                          <td className="px-5 py-2.5 text-xs text-muted-foreground">{timeAgo(item.lastUpdated)}</td>
                          <td className="px-5 py-2.5 text-right">
                            <Button size="sm" variant="outline" className="h-8 bg-white text-xs" onClick={() => openAdjust(item)} aria-label={`Adjust stock for ${item.name}`}>
                              Adjust
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {/* ── MOVEMENTS TAB ─────────────────────────────────────────────── */}
      {tab === "movements" && (
        <SectionCard
          title="Stock movement ledger"
          action={
            <Select value={movementProduct} onValueChange={setMovementProduct}>
              <SelectTrigger className="h-8 w-44 bg-white text-xs" aria-label="Filter movements by product">
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                {items.map((i) => (
                  <SelectItem key={i.productId} value={i.productId}>{i.sku} — {i.name.slice(0, 40)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        >
          {movements.length === 0 ? (
            <EmptyState icon={History} title="No movements yet" hint="Inbound receipts, order dispatches and adjustments will appear here — every quantity change is logged." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2.5 pr-4">When</th>
                    <th className="py-2.5 pr-4">Product</th>
                    <th className="py-2.5 pr-4">Type</th>
                    <th className="py-2.5 pr-4 text-right">Qty</th>
                    <th className="py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-secondary">
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">{timeAgo(m.createdAt)}</td>
                      <td className="py-2.5 pr-4">
                        <p className="max-w-[240px] truncate font-medium text-foreground">{m.productName}</p>
                        <p className="font-mono text-[10px] uppercase text-muted-foreground">{m.productSku}</p>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="outline" className={cn("font-medium", MOVEMENT_STYLE[m.type])}>{MOVEMENT_LABEL[m.type]}</Badge>
                      </td>
                      <td className={cn("py-2.5 pr-4 text-right font-mono text-sm font-semibold", m.quantity >= 0 ? "text-emerald-700" : "text-rose-600")}>
                        {signedQty(m.quantity)}
                      </td>
                      <td className="max-w-[260px] truncate py-2.5 text-xs text-muted-foreground" title={m.notes}>{m.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── ZONES TAB ─────────────────────────────────────────────────── */}
      {tab === "zones" && (
        <SectionCard
          title="Delivery zones — base / express / same-day + COD"
          action={
            <Button size="sm" onClick={() => openZoneEditor()} className="h-8 bg-accent text-xs text-accent-foreground hover:bg-hon-green-dark">
              <Plus className="mr-1.5 h-4 w-4" /> Add zone
            </Button>
          }
        >
          {loadingZones ? (
            <SectionSkeleton rows={4} />
          ) : zones.length === 0 ? (
            <EmptyState icon={Truck} title="No delivery zones yet" hint="Add your first zone — city, postal codes, costs and ETA for each speed." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {zones.map((z) => (
                <div key={z.id} className={cn("flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm", !z.isActive && "opacity-70")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold text-foreground">
                        <Truck className="h-4 w-4 shrink-0 text-accent" />
                        <span className="truncate">{z.zoneName}</span>
                        {!z.isActive && <Badge variant="outline" className="border-border text-muted-foreground">Inactive</Badge>}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{z.city}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openZoneEditor(z)} aria-label={`Edit ${z.zoneName}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant={armDelete === z.id ? "destructive" : "ghost"}
                        className={cn("h-8 w-8", armDelete === z.id ? "w-auto px-2 text-xs" : "")}
                        onClick={() => deleteZone(z.id)}
                        aria-label={armDelete === z.id ? `Confirm delete ${z.zoneName}` : `Delete ${z.zoneName}`}
                      >
                        {armDelete === z.id ? "Delete?" : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {([
                      ["Standard", formatPKR(z.standardCost), `${z.standardDays} day${z.standardDays === 1 ? "" : "s"}`],
                      ["Express", formatPKR(z.expressCost), z.expressDays === 1 ? "next day" : `${z.expressDays} days`],
                      ["Same day", formatPKR(z.sameDayCost), "same day"],
                    ] as Array<[string, string, string]>).map(([label, cost, eta]) => (
                      <div key={label} className="rounded-lg bg-secondary px-2 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                        <p className="mt-0.5 font-bold text-foreground">{cost}</p>
                        <p className="text-[10px] text-muted-foreground">{eta}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[10px] leading-4 text-muted-foreground" title="Covered postal codes">
                      {z.postalCodes.length ? `PK · ${z.postalCodes.join(" · ")}` : "No postal codes set"}
                    </p>
                    {z.codAvailable && <Badge className="border-emerald-200 bg-emerald-100 font-medium text-emerald-800 hover:bg-emerald-100" variant="outline">COD available</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── ADJUST STOCK DIALOG ───────────────────────────────────────── */}
      <Dialog open={Boolean(adjustTarget)} onOpenChange={(open) => !open && setAdjustTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-secondary p-3">
                <p className="text-sm font-semibold text-foreground">{adjustTarget.name}</p>
                <p className="font-mono text-[11px] uppercase text-muted-foreground">{adjustTarget.sku} · currently <span className="font-bold text-foreground">{adjustTarget.quantity}</span> units · min {adjustTarget.lowStockThreshold}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="mov-type">Movement</label>
                  <Select value={movementType} onValueChange={(v) => setMovementType(v as StockMovementType)}>
                    <SelectTrigger id="mov-type" className="bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">Inbound (+)</SelectItem>
                      <SelectItem value="outbound">Outbound (−)</SelectItem>
                      <SelectItem value="return">Customer return (+)</SelectItem>
                      <SelectItem value="damage">Damage write-off (−)</SelectItem>
                      <SelectItem value="adjustment">Adjustment (±)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="mov-qty">Quantity</label>
                  <Input id="mov-qty" type="number" value={movementQty} onChange={(e) => setMovementQty(e.target.value)} min={movementType === "adjustment" ? undefined : 0} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">{movementSign}</p>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="mov-notes">Reference / notes <span className="font-normal">(optional)</span></label>
                <Input id="mov-notes" value={movementNotes} onChange={(e) => setMovementNotes(e.target.value)} placeholder="e.g. PO-2026-014, dispatch to WDX-1065, showroom count…" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button onClick={saveAdjust} disabled={savingAdjust} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
              {savingAdjust && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Apply movement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ZONE EDITOR DIALOG ────────────────────────────────────────── */}
      <Dialog open={Boolean(zoneEditor)} onOpenChange={(open) => !open && setZoneEditor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{zoneEditor?.id ? "Edit delivery zone" : "Add delivery zone"}</DialogTitle>
          </DialogHeader>
          {zoneEditor && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="zone-name">Zone name</label>
                  <Input id="zone-name" value={zoneEditor.zoneName} onChange={(e) => setZoneEditor({ ...zoneEditor, zoneName: e.target.value })} placeholder="e.g. Lahore City" />
                </div>
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="zone-city">City</label>
                  <Input id="zone-city" value={zoneEditor.city} onChange={(e) => setZoneEditor({ ...zoneEditor, city: e.target.value })} placeholder="e.g. Lahore" />
                </div>
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="zone-postal">Postal codes <span className="font-normal">(comma-separated)</span></label>
                  <Input id="zone-postal" value={zonePostal} onChange={(e) => setZonePostal(e.target.value)} placeholder="54000, 54590, 54660" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  ["standardCost", "Std cost (Rs)"],
                  ["expressCost", "Express cost (Rs)"],
                  ["sameDayCost", "Same-day cost (Rs)"],
                ] as Array<["standardCost" | "expressCost" | "sameDayCost", string]>).map(([field, label]) => (
                  <div key={field}>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor={`zone-${field}`}>{label}</label>
                    <Input id={`zone-${field}`} type="number" min={0} value={zoneEditor[field]} onChange={(e) => setZoneEditor({ ...zoneEditor, [field]: Number(e.target.value) })} />
                  </div>
                ))}
                {([
                  ["standardDays", "Std ETA (days)"],
                  ["expressDays", "Express ETA (days)"],
                ] as Array<["standardDays" | "expressDays", string]>).map(([field, label]) => (
                  <div key={field}>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor={`zone-${field}`}>{label}</label>
                    <Input id={`zone-${field}`} type="number" min={0} max={30} value={zoneEditor[field]} onChange={(e) => setZoneEditor({ ...zoneEditor, [field]: Number(e.target.value) })} />
                  </div>
                ))}
                <div className="flex flex-col justify-end gap-2 pb-1">
                  <label className="flex items-center gap-2 text-sm text-foreground"><Switch checked={zoneEditor.codAvailable} onCheckedChange={(v) => setZoneEditor({ ...zoneEditor, codAvailable: v })} aria-label="Cash on delivery" /> COD</label>
                  <label className="flex items-center gap-2 text-sm text-foreground"><Switch checked={zoneEditor.isActive} onCheckedChange={(v) => setZoneEditor({ ...zoneEditor, isActive: v })} aria-label="Zone active" /> Active</label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoneEditor(null)}>Cancel</Button>
            <Button onClick={saveZone} disabled={savingZone} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
              {savingZone && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
