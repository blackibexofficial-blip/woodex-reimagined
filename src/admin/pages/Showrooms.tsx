import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Loader2, MapPin, Pencil, Phone, Plus, Search, Store, Trash2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminShowroom } from "@/api/types";
import { formatDate, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type FormState = {
  name: string; city: string; address: string; phone: string; whatsapp: string;
  hours: string; lat: string; lng: string; isHQ: boolean; active: boolean; sortOrder: string;
};
const emptyForm: FormState = {
  name: "", city: "", address: "", phone: "", whatsapp: "",
  hours: "Mon–Sat: 9am–7pm", lat: "", lng: "", isHQ: false, active: true, sortOrder: "",
};

export default function AdminShowrooms() {
  const api = useMemo(() => getAdminApi(), []);
  const [items, setItems] = useState<AdminShowroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminShowroom | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminShowroom | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listShowrooms());
    } catch {
      toast.error("Could not load showrooms.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => [s.name, s.city, s.address, s.phone].some((f) => f?.toLowerCase().includes(q)));
  }, [items, query]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => { setEditTarget(null); setForm(emptyForm); setEditorOpen(true); };
  const openEdit = (s: AdminShowroom) => {
    setEditTarget(s);
    setForm({
      name: s.name, city: s.city, address: s.address, phone: s.phone, whatsapp: s.whatsapp ?? "",
      hours: s.hours, lat: s.lat !== undefined ? String(s.lat) : "", lng: s.lng !== undefined ? String(s.lng) : "",
      isHQ: s.isHQ, active: s.active, sortOrder: String(s.sortOrder),
    });
    setEditorOpen(true);
  };

  const save = async () => {
    const lat = form.lat.trim() === "" ? undefined : Number(form.lat);
    const lng = form.lng.trim() === "" ? undefined : Number(form.lng);
    if (lat !== undefined && Number.isNaN(lat)) return toast.error("Latitude must be a number.");
    if (lng !== undefined && Number.isNaN(lng)) return toast.error("Longitude must be a number.");
    const payload = {
      name: form.name.trim(),
      city: form.city.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim() || undefined,
      hours: form.hours.trim(),
      lat, lng,
      isHQ: form.isHQ,
      active: form.active,
      sortOrder: form.sortOrder.trim() === "" ? undefined : Number(form.sortOrder),
    };
    if (!payload.name) return toast.error("Showroom name is required.");
    if (!payload.city) return toast.error("City is required.");
    if (!payload.address) return toast.error("Address is required.");
    if (!payload.phone) return toast.error("Phone is required.");
    if (!payload.hours) return toast.error("Opening hours are required.");
    if (payload.sortOrder !== undefined && Number.isNaN(payload.sortOrder)) return toast.error("Sort order must be a number.");
    setSaving(true);
    try {
      if (editTarget) {
        const updated = await api.updateShowroom(editTarget.id, payload);
        if (updated) toast.success(`${updated.name} saved.`);
      } else {
        const created = await api.createShowroom(payload);
        toast.success(`${created.id} added — the storefront showrooms page can list it once wired.`);
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the showroom.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: AdminShowroom) => {
    try {
      const updated = await api.setShowroomActive(s.id, !s.active);
      if (updated) toast.success(`${updated.name} — ${updated.active ? "now live" : "hidden"} on the storefront list.`);
      await load();
    } catch {
      toast.error("Could not update showroom status.");
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const okFlag = await api.deleteShowroom(deleteTarget.id);
      if (okFlag) {
        toast.success(`${deleteTarget.name} deleted.`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Showroom not found — already removed?");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const hq = items.find((s) => s.isHQ);

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, city, address, phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search showrooms"
          />
        </div>
        <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
          <Plus className="mr-1.5 h-4 w-4" /> New showroom
        </Button>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Retail master — these records feed the storefront <span className="font-semibold">/showrooms</span> page and the
        footer / left-rail “Visit our showrooms” entry, and they appear in the transfer location picker for stock moves.
        Exactly one showroom can be HQ; marking another as HQ automatically unsets it. Admin edits persist to the demo database.
      </p>

      <SectionCard title={`Showrooms (${filtered.length})`}>
        {loading ? (
          <SectionSkeleton rows={4} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No showrooms found"
            hint={query ? "Try a different search — name, city or address." : "Add the Experience Centres and retail showrooms — they feed the storefront and the transfer picker."}
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Showroom</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className={cn(!s.active && "opacity-60")}>
                    <TableCell>
                      <p className="flex items-center gap-1.5 text-sm font-semibold leading-snug">
                        {s.isHQ && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Headquarters" />}
                        {s.name}
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{s.address ? `${s.address}, ` : ""}{s.city}</p>
                    </TableCell>
                    <TableCell>
                      <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-xs font-medium hover:text-foreground"><Phone className="h-3 w-3" />{s.phone}</a>
                      {s.whatsapp && <a href={`https://wa.me/${s.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-800"><MessageCircle className="h-3 w-3" />+{s.whatsapp}</a>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.hours}</TableCell>
                    <TableCell>
                      <button type="button" onClick={() => toggleActive(s)} aria-pressed={s.active} title={s.active ? "Hide from storefront list" : "Show on storefront list"}>
                        <Badge variant="outline" className={cn("font-medium cursor-pointer", s.active ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600")}>
                          {s.active ? "Live" : "Hidden"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{s.sortOrder}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} aria-label={`Edit ${s.id}`} title="Edit showroom">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)} aria-label={`Delete ${s.id}`} title="Delete showroom" disabled={s.isHQ}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* ── create / edit dialog ────────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={(open) => !open && setEditorOpen(false)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Store className="h-5 w-5 text-hon-green-dark" /> {editTarget ? `Edit ${editTarget.name}` : "New showroom"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label htmlFor="sr-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">Showroom name *</Label>
              <Input id="sr-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="WOODEX Lahore — Experience Centre" className="bg-white" autoFocus />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sr-city" className="mb-1.5 block text-xs font-medium text-muted-foreground">City *</Label>
                <Input id="sr-city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Lahore" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="sr-phone" className="mb-1.5 block text-xs font-medium text-muted-foreground">Phone *</Label>
                <Input id="sr-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+92 42 111 WOODEX" className="bg-white" />
              </div>
            </div>
            <div>
              <Label htmlFor="sr-address" className="mb-1.5 block text-xs font-medium text-muted-foreground">Address</Label>
              <Input id="sr-address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Gulberg III, Main Boulevard, Lahore" className="bg-white" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sr-hours" className="mb-1.5 block text-xs font-medium text-muted-foreground">Opening hours</Label>
                <Input id="sr-hours" value={form.hours} onChange={(e) => set("hours", e.target.value)} placeholder="Mon–Sat: 9am–7pm" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="sr-whatsapp" className="mb-1.5 block text-xs font-medium text-muted-foreground">WhatsApp (digits only)</Label>
                <Input id="sr-whatsapp" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="923001234567" className="bg-white" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="sr-lat" className="mb-1.5 block text-xs font-medium text-muted-foreground">Latitude</Label>
                <Input id="sr-lat" inputMode="decimal" value={form.lat} onChange={(e) => set("lat", e.target.value)} placeholder="31.5204" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="sr-lng" className="mb-1.5 block text-xs font-medium text-muted-foreground">Longitude</Label>
                <Input id="sr-lng" inputMode="decimal" value={form.lng} onChange={(e) => set("lng", e.target.value)} placeholder="74.3587" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="sr-sort" className="mb-1.5 block text-xs font-medium text-muted-foreground">Sort order</Label>
                <Input id="sr-sort" inputMode="numeric" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} placeholder="10" className="bg-white" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-secondary/40 px-4 py-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Switch checked={form.isHQ} onCheckedChange={(v) => set("isHQ", v)} /> HQ (unsets others)
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} /> Live on storefront list
              </label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editTarget ? "Save changes" : "Add showroom"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── delete confirm ──────────────────────────────────────────── */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /> Delete showroom?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{deleteTarget?.name}</span> will be removed from the showrooms master and the transfer location picker.
            {deleteTarget?.isHQ && <span className="mt-1 block font-medium text-amber-700">This is the HQ showroom — mark another showroom as HQ first.</span>}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep it</Button>
            <Button onClick={doDelete} disabled={deleting || deleteTarget?.isHQ} variant="destructive">
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
