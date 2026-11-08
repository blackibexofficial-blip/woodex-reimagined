import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban, Building2, Check, Globe, Loader2, Lock, MapPin, MessageCircle, Camera, PhoneCall, Store, Users, Pencil, Plus, RadioTower, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminSalesChannel, AdminShowroom, SalesChannelKind } from "@/api/types";
import { formatPKR, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const KIND_META: Record<SalesChannelKind, { label: string; icon: typeof Globe; tone: string }> = {
  web: { label: "Web", icon: Globe, tone: "bg-emerald-100 text-emerald-800" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, tone: "bg-green-100 text-green-800" },
  instagram: { label: "Instagram", icon: Camera, tone: "bg-pink-100 text-pink-800" },
  phone: { label: "Phone", icon: PhoneCall, tone: "bg-amber-100 text-amber-800" },
  showroom: { label: "Showroom", icon: Store, tone: "bg-sky-100 text-sky-800" },
  b2b: { label: "B2B", icon: Users, tone: "bg-violet-100 text-violet-800" },
};

type ChannelForm = { name: string; kind: SalesChannelKind; description: string; enabled: boolean };
type ShowroomForm = { name: string; city: string; address: string; phone: string; whatsapp: string; hours: string; lat: string; lng: string; isHQ: boolean; active: boolean };
const emptyChannel: ChannelForm = { name: "", kind: "web", description: "", enabled: true };
const emptyShowroom: ShowroomForm = { name: "", city: "", address: "", phone: "", whatsapp: "", hours: "Mon–Sat: 9am–7pm", lat: "", lng: "", isHQ: false, active: true };

export default function AdminSalesChannels() {
  const api = useMemo(() => getAdminApi(), []);
  const [tab, setTab] = useState<"channels" | "showrooms">("channels");
  const [channels, setChannels] = useState<AdminSalesChannel[]>([]);
  const [rooms, setRooms] = useState<AdminShowroom[]>([]);
  const [sales, setSales] = useState<Array<{ channelId: string; orders: number; revenue: number }>>([]);
  const [loading, setLoading] = useState(true);

  const [channelDialog, setChannelDialog] = useState<null | { mode: "create" } | { mode: "edit"; channel: AdminSalesChannel }>(null);
  const [channelForm, setChannelForm] = useState<ChannelForm>(emptyChannel);
  const [savingChannel, setSavingChannel] = useState(false);
  const [pendingDeleteChannel, setPendingDeleteChannel] = useState<AdminSalesChannel | null>(null);

  const [showroomDialog, setShowroomDialog] = useState<null | { mode: "create" } | { mode: "edit"; room: AdminShowroom }>(null);
  const [showroomForm, setShowroomForm] = useState<ShowroomForm>(emptyShowroom);
  const [savingShowroom, setSavingShowroom] = useState(false);
  const [pendingDeleteShowroom, setPendingDeleteShowroom] = useState<AdminShowroom | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [chs, rms, sale] = await Promise.all([api.listSalesChannels(), api.listShowrooms(), api.getChannelSales().catch(() => [])]);
      setChannels(chs); setRooms(rms); setSales(sale);
    } catch (e) {
      console.error(e);
      toast.error("Could not load sales channels.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const salesById = useMemo(() => new Map(sales.map((s) => [s.channelId, s])), [sales]);
  const attributed = useMemo(() => ({
    orders: sales.reduce((sum, s) => sum + s.orders, 0),
    revenue: sales.reduce((sum, s) => sum + s.revenue, 0),
  }), [sales]);
  const enabledChannels = channels.filter((c) => c.enabled).length;
  const activeShowrooms = rooms.filter((r) => r.active).length;

  /* ── channels ── */
  const openCreateChannel = () => { setChannelForm(emptyChannel); setChannelDialog({ mode: "create" }); };
  const openEditChannel = (channel: AdminSalesChannel) => {
    setChannelForm({ name: channel.name, kind: channel.kind, description: channel.description ?? "", enabled: channel.enabled });
    setChannelDialog({ mode: "edit", channel });
  };
  const saveChannel = async () => {
    if (!channelForm.name.trim()) { toast.error("Give the channel a name."); return; }
    setSavingChannel(true);
    try {
      if (channelDialog?.mode === "edit") {
        await api.updateSalesChannel(channelDialog.channel.id, channelForm);
        toast.success("Channel saved.");
      } else {
        await api.createSalesChannel(channelForm);
        toast.success("Channel added.");
      }
      setChannelDialog(null);
      void load();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Could not save the channel.");
    } finally { setSavingChannel(false); }
  };
  const toggleChannel = async (channel: AdminSalesChannel) => {
    try { await api.setSalesChannelEnabled(channel.id, !channel.enabled); toast.success(channel.enabled ? "Channel disabled — storefront stops showing it." : "Channel enabled."); void load(); }
    catch { toast.error("Could not toggle the channel."); }
  };
  const confirmDeleteChannel = async () => {
    if (!pendingDeleteChannel) return;
    setDeleting(true);
    try { await api.deleteSalesChannel(pendingDeleteChannel.id); toast.success("Channel deleted."); setPendingDeleteChannel(null); void load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete the channel."); }
    finally { setDeleting(false); }
  };

  /* ── showrooms ── */
  const openCreateShowroom = () => { setShowroomForm(emptyShowroom); setShowroomDialog({ mode: "create" }); };
  const openEditShowroom = (room: AdminShowroom) => {
    setShowroomForm({
      name: room.name, city: room.city, address: room.address, phone: room.phone,
      whatsapp: room.whatsapp ?? "", hours: room.hours,
      lat: room.lat !== undefined ? String(room.lat) : "", lng: room.lng !== undefined ? String(room.lng) : "",
      isHQ: room.isHQ, active: room.active,
    });
    setShowroomDialog({ mode: "edit", room });
  };
  const parseNum = (v: string): number | undefined => { const n = Number(v); return v.trim() && Number.isFinite(n) ? n : undefined; };
  const saveShowroom = async () => {
    const f = showroomForm;
    if (![f.name, f.city, f.address, f.phone, f.hours].every((v) => v.trim())) { toast.error("Name, city, address, phone and hours are required."); return; }
    setSavingShowroom(true);
    const payload = { name: f.name, city: f.city, address: f.address, phone: f.phone, whatsapp: f.whatsapp || undefined, hours: f.hours, lat: parseNum(f.lat), lng: parseNum(f.lng), isHQ: f.isHQ, active: f.active };
    try {
      if (showroomDialog?.mode === "edit") { await api.updateShowroom(showroomDialog.room.id, payload); toast.success("Showroom saved."); }
      else { await api.createShowroom(payload); toast.success("Showroom added."); }
      setShowroomDialog(null); void load();
    } catch (e) { console.error(e); toast.error(e instanceof Error ? e.message : "Could not save the showroom."); }
    finally { setSavingShowroom(false); }
  };
  const toggleShowroom = async (room: AdminShowroom) => {
    try { await api.setShowroomActive(room.id, !room.active); toast.success(room.active ? "Showroom hidden from the storefront." : "Showroom live on /showrooms."); void load(); }
    catch { toast.error("Could not toggle the showroom."); }
  };
  const confirmDeleteShowroom = async () => {
    if (!pendingDeleteShowroom) return;
    setDeleting(true);
    try { await api.deleteShowroom(pendingDeleteShowroom.id); toast.success("Showroom deleted."); setPendingDeleteShowroom(null); void load(); }
    catch { toast.error("Could not delete the showroom."); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2"><RadioTower className="h-6 w-6 text-accent" /> Channels &amp; Markets</h1>
          <p className="text-sm text-muted-foreground mt-1">Where every rupee comes from — attributed orders per channel, and the showroom footprint powering /showrooms.</p>
          <p className="text-xs text-muted-foreground mt-1">Channels enabled <span className="font-semibold text-foreground">{enabledChannels}/{channels.length}</span> · Showrooms live <span className="font-semibold text-foreground">{activeShowrooms}/{rooms.length}</span> · Attributed <span className="font-semibold text-foreground">{attributed.orders} orders / {formatPKR(attributed.revenue)}</span></p>
        </div>
        <div className="flex gap-2">
          {tab === "channels"
            ? <Button onClick={openCreateChannel} className="bg-accent text-accent-foreground hover:bg-hon-green-dark"><Plus className="h-4 w-4 mr-1.5" /> Add channel</Button>
            : <Button onClick={openCreateShowroom} className="bg-accent text-accent-foreground hover:bg-hon-green-dark"><Plus className="h-4 w-4 mr-1.5" /> Add showroom</Button>}
        </div>
      </div>

      <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v as "channels" | "showrooms")} aria-label="Sales channels section" className="h-10 rounded-md bg-muted p-1">
        <ToggleGroupItem value="channels" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Sales Channels ({channels.length})</ToggleGroupItem>
        <ToggleGroupItem value="showrooms" className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">Showrooms &amp; Markets ({rooms.length})</ToggleGroupItem>
      </ToggleGroup>

      {loading ? (
        <SectionCard title="Loading…"><SectionSkeleton rows={6} /></SectionCard>
      ) : tab === "channels" ? (
        <SectionCard title="Attribution registry">
          {channels.length === 0 ? (
            <EmptyState icon={RadioTower} title="No channels yet" hint="Add your first sales channel — storefront orders attribute to ch-web by default." />
          ) : (
            <ul className="divide-y divide-border">
              {channels.map((ch) => {
                const meta = KIND_META[ch.kind] ?? KIND_META.web;
                const Icon = meta.icon;
                const stat = salesById.get(ch.id);
                const locked = ch.id === "ch-web";
                const attributedOrders = stat?.orders ?? 0;
                return (
                  <li key={ch.id} className="flex flex-wrap items-center gap-4 py-4">
                    <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md ${meta.tone}`}><Icon className="h-5 w-5" /></span>
                    <div className="min-w-[220px] flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-foreground">{ch.name}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.tone}`}>{meta.label}</span>
                        {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Storefront default — locked" />}
                        {!ch.enabled && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Disabled</span>}
                      </div>
                      {ch.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{ch.description}</p>}
                    </div>
                    <div className="min-w-[150px] text-right">
                      <p className="text-sm font-bold text-foreground">{stat ? `${stat.orders} orders` : "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{stat ? formatPKR(stat.revenue) : "no attributed revenue"}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={ch.enabled}
                        aria-label={`${ch.enabled ? "Disable" : "Enable"} ${ch.name}`}
                        onClick={() => void toggleChannel(ch)}
                        className={`relative h-6 w-11 rounded-full transition ${ch.enabled ? "bg-hon-green" : "bg-secondary"}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${ch.enabled ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                      <Button size="icon" variant="ghost" aria-label={`Edit ${ch.name}`} onClick={() => openEditChannel(ch)}><Pencil className="h-4 w-4" /></Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${ch.name}`}
                        disabled={locked || attributedOrders > 0}
                        title={locked ? "Storefront default — disable instead" : attributedOrders > 0 ? `${attributedOrders} attributed order(s) — disable instead` : "Delete channel"}
                        onClick={() => setPendingDeleteChannel(ch)}
                      >
                        {locked || attributedOrders > 0 ? <Ban className="h-4 w-4 text-muted-foreground/50" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Attribution: every non-cancelled order is weighted once by its channel (storefront orders = ch-web). Disabled channels keep their history; the storefront simply stops featuring them. Prototype registry — real attribution arrives with the Bagisto channel mapping.</p>
        </SectionCard>
      ) : (
        <SectionCard title="Showroom footprint">
          {rooms.length === 0 ? (
            <EmptyState icon={Building2} title="No showrooms yet" hint="Add your first showroom — the storefront /showrooms page renders them instantly." />
          ) : (
            <ul className="divide-y divide-border">
              {rooms.map((room) => (
                <li key={room.id} className="flex flex-wrap items-center gap-4 py-4">
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-secondary text-foreground"><Building2 className="h-5 w-5" /></span>
                  <div className="min-w-[220px] flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-foreground">{room.city}</p>
                      {room.isHQ && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-foreground">HQ</span>}
                      {!room.active && <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Hidden</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{room.name} — {room.address}</p>
                    <p className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{room.hours}</span><span>{room.phone}</span></p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={room.active}
                      aria-label={`${room.active ? "Hide" : "Show"} ${room.city} on the storefront`}
                      onClick={() => void toggleShowroom(room)}
                      className={`relative h-6 w-11 rounded-full transition ${room.active ? "bg-hon-green" : "bg-secondary"}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${room.active ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                    <Button size="icon" variant="ghost" aria-label={`Edit ${room.city}`} onClick={() => openEditShowroom(room)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${room.city}`} onClick={() => setPendingDeleteShowroom(room)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">HQ is exclusive (setting one unsets the others). Hidden showrooms stay in the admin but disappear from the storefront immediately.</p>
        </SectionCard>
      )}

      {/* Channel dialog */}
      <Dialog open={channelDialog !== null} onOpenChange={(open) => { if (!open) setChannelDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{channelDialog?.mode === "edit" ? "Edit channel" : "Add channel"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ch-name">Name</Label>
              <Input id="ch-name" autoFocus value={channelForm.name} onChange={(e) => setChannelForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Daraz Storefront" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-kind">Type</Label>
              <select id="ch-kind" value={channelForm.kind} onChange={(e) => setChannelForm((f) => ({ ...f, kind: e.target.value as SalesChannelKind }))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                {Object.entries(KIND_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-desc">Description</Label>
              <Textarea id="ch-desc" rows={2} value={channelForm.description} onChange={(e) => setChannelForm((f) => ({ ...f, description: e.target.value }))} placeholder="Who keys in orders here?" />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
              <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--accent))]" checked={channelForm.enabled} onChange={(e) => setChannelForm((f) => ({ ...f, enabled: e.target.checked }))} /> Enabled
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChannelDialog(null)} disabled={savingChannel}>Cancel</Button>
            <Button onClick={() => void saveChannel()} disabled={savingChannel} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
              {savingChannel ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Showroom dialog */}
      <Dialog open={showroomDialog !== null} onOpenChange={(open) => { if (!open) setShowroomDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{showroomDialog?.mode === "edit" ? "Edit showroom" : "Add showroom"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="sr-name">Name</Label>
              <Input id="sr-name" autoFocus value={showroomForm.name} onChange={(e) => setShowroomForm((f) => ({ ...f, name: e.target.value }))} placeholder="WOODEX Karachi — Experience Centre" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-city">City / label</Label>
              <Input id="sr-city" value={showroomForm.city} onChange={(e) => setShowroomForm((f) => ({ ...f, city: e.target.value }))} placeholder="Karachi" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-hours">Hours</Label>
              <Input id="sr-hours" value={showroomForm.hours} onChange={(e) => setShowroomForm((f) => ({ ...f, hours: e.target.value }))} placeholder="Mon–Sat: 9am–7pm" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="sr-address">Address</Label>
              <Input id="sr-address" value={showroomForm.address} onChange={(e) => setShowroomForm((f) => ({ ...f, address: e.target.value }))} placeholder="456 Clifton Block 5, Karachi" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-phone">Phone</Label>
              <Input id="sr-phone" value={showroomForm.phone} onChange={(e) => setShowroomForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+92 21 111 WOODEX" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-wa">WhatsApp <span className="text-muted-foreground font-normal">(digits only)</span></Label>
              <Input id="sr-wa" value={showroomForm.whatsapp} onChange={(e) => setShowroomForm((f) => ({ ...f, whatsapp: e.target.value.replace(/[^\d]/g, "") }))} placeholder="923001234567" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-lat">Lat <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="sr-lat" inputMode="decimal" value={showroomForm.lat} onChange={(e) => setShowroomForm((f) => ({ ...f, lat: e.target.value }))} placeholder="24.8607" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sr-lng">Lng <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="sr-lng" inputMode="decimal" value={showroomForm.lng} onChange={(e) => setShowroomForm((f) => ({ ...f, lng: e.target.value }))} placeholder="67.0011" />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
              <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--accent))]" checked={showroomForm.isHQ} onChange={(e) => setShowroomForm((f) => ({ ...f, isHQ: e.target.checked }))} /> Headquarters (replaces any other HQ)
            </label>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
              <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--accent))]" checked={showroomForm.active} onChange={(e) => setShowroomForm((f) => ({ ...f, active: e.target.checked }))} /> Live on storefront
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowroomDialog(null)} disabled={savingShowroom}>Cancel</Button>
            <Button onClick={() => void saveShowroom()} disabled={savingShowroom} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
              {savingShowroom ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirms */}
      <Dialog open={pendingDeleteChannel !== null} onOpenChange={(open) => { if (!open) setPendingDeleteChannel(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delete channel</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <span className="font-semibold text-foreground">“{pendingDeleteChannel?.name}”</span>? Attributed history is kept with the orders, but the registry entry disappears.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteChannel(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteChannel()} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={pendingDeleteShowroom !== null} onOpenChange={(open) => { if (!open) setPendingDeleteShowroom(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delete showroom</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete <span className="font-semibold text-foreground">“{pendingDeleteShowroom?.city}”</span>? It disappears from /showrooms immediately.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteShowroom(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteShowroom()} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
