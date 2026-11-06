import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, MapPin, Pencil, Phone, Plus, Search, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminSupplier, SupplierTerms } from "@/api/types";
import { formatDate, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const TERMS: Array<{ value: SupplierTerms; label: string }> = [
  { value: "advance", label: "Advance payment" },
  { value: "cod", label: "Cash on Delivery" },
  { value: "net15", label: "Net 15" },
  { value: "net30", label: "Net 30" },
  { value: "net45", label: "Net 45" },
];
const termsLabel = (t: SupplierTerms) => TERMS.find((x) => x.value === t)?.label ?? t;

type FormState = {
  name: string; contactName: string; email: string; phone: string;
  city: string; address: string; taxId: string; paymentTerms: SupplierTerms; notes: string; active: boolean;
};
const emptyForm: FormState = {
  name: "", contactName: "", email: "", phone: "", city: "", address: "", taxId: "", paymentTerms: "net30", notes: "", active: true,
};

export default function AdminSuppliers() {
  const api = useMemo(() => getAdminApi(), []);
  const [items, setItems] = useState<AdminSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminSupplier | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminSupplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listSuppliers({ query: query || undefined }));
    } catch {
      toast.error("Could not load suppliers.");
    } finally {
      setLoading(false);
    }
  }, [api, query]);

  useEffect(() => {
    const t = setTimeout(() => { load(); }, 200);
    return () => clearTimeout(t);
  }, [load]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => { setEditTarget(null); setForm(emptyForm); setEditorOpen(true); };
  const openEdit = (s: AdminSupplier) => {
    setEditTarget(s);
    setForm({
      name: s.name, contactName: s.contactName ?? "", email: s.email ?? "", phone: s.phone ?? "",
      city: s.city ?? "", address: s.address ?? "", taxId: s.taxId ?? "", paymentTerms: s.paymentTerms,
      notes: s.notes ?? "", active: s.active,
    });
    setEditorOpen(true);
  };

  const save = async () => {
    const payload = {
      name: form.name.trim(),
      contactName: form.contactName.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      city: form.city.trim() || undefined,
      address: form.address.trim() || undefined,
      taxId: form.taxId.trim() || undefined,
      paymentTerms: form.paymentTerms,
      notes: form.notes.trim() || undefined,
      active: form.active,
    };
    if (!payload.name) return toast.error("Supplier name is required.");
    setSaving(true);
    try {
      if (editTarget) {
        const updated = await api.updateSupplier(editTarget.id, payload);
        if (updated) toast.success(`${updated.id} saved.`);
      } else {
        const created = await api.createSupplier(payload);
        toast.success(`${created.id} added — purchase orders can now reference it.`);
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the supplier.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const okFlag = await api.deleteSupplier(deleteTarget.id);
      if (okFlag) {
        toast.success(`${deleteTarget.id} deleted.`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Supplier not found — already removed?");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search supplier, contact, city, NTN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search suppliers"
          />
        </div>
        <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
          <Plus className="mr-1.5 h-4 w-4" /> New supplier
        </Button>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Purchasing master — suppliers feed purchase orders (P2.7) and their receipts write inbound stock movements.
        Deleting a supplier referenced by an open PO is blocked; deactivate it instead.
      </p>

      <SectionCard title="Suppliers">
        {loading ? (
          <SectionSkeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No suppliers yet"
            hint="Add the mills, sawmills and hardware houses you buy from — purchase orders reference them."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Terms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Added</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s.id} className={cn(!s.active && "opacity-60")}>
                    <TableCell>
                      <p className="text-sm font-semibold leading-snug">{s.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{s.id}{s.taxId ? ` · NTN ${s.taxId}` : ""}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-medium">{s.contactName ?? "—"}</p>
                      <div className="mt-0.5 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                        {s.phone && <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:text-foreground"><Phone className="h-3 w-3" />{s.phone}</a>}
                        {s.email && <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 hover:text-foreground"><Mail className="h-3 w-3" />{s.email}</a>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.city ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{s.city}</span> : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{termsLabel(s.paymentTerms)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", s.active ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600")}>
                        {s.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} aria-label={`Edit ${s.id}`} title="Edit supplier">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)} aria-label={`Delete ${s.id}`} title="Delete supplier">
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

      {/* ── create / edit dialog ──────────────────────────────────── */}
      <Dialog open={editorOpen} onOpenChange={(open) => !open && setEditorOpen(false)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-hon-green-dark" /> {editTarget ? `Edit ${editTarget.id}` : "New supplier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label htmlFor="sup-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">Company name *</Label>
              <Input id="sup-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Pak Wood & Timber Co" className="bg-white" autoFocus />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sup-contact" className="mb-1.5 block text-xs font-medium text-muted-foreground">Contact person</Label>
                <Input id="sup-contact" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Rana Imran" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="sup-phone" className="mb-1.5 block text-xs font-medium text-muted-foreground">Phone</Label>
                <Input id="sup-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+92 3xx …" className="bg-white" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sup-email" className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</Label>
                <Input id="sup-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="optional" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="sup-city" className="mb-1.5 block text-xs font-medium text-muted-foreground">City</Label>
                <Input id="sup-city" value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Lahore" className="bg-white" />
              </div>
            </div>
            <div>
              <Label htmlFor="sup-address" className="mb-1.5 block text-xs font-medium text-muted-foreground">Address</Label>
              <Input id="sup-address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Factory / warehouse address" className="bg-white" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="sup-tax" className="mb-1.5 block text-xs font-medium text-muted-foreground">NTN / sales-tax ID</Label>
                <Input id="sup-tax" value={form.taxId} onChange={(e) => set("taxId", e.target.value)} placeholder="52751-8" className="bg-white" />
              </div>
              <div>
                <Label htmlFor="sup-terms" className="mb-1.5 block text-xs font-medium text-muted-foreground">Payment terms</Label>
                <Select value={form.paymentTerms} onValueChange={(v) => set("paymentTerms", v as SupplierTerms)}>
                  <SelectTrigger id="sup-terms" className="bg-white" aria-label="Payment terms"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TERMS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="sup-notes" className="mb-1.5 block text-xs font-medium text-muted-foreground">Notes</Label>
              <Textarea id="sup-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Materials they supply, lead times, MOQ…" className="bg-white text-xs" />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-[#2f5d3e]" />
              Active — available to purchase orders
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Truck className="mr-1.5 h-4 w-4" />}
              {saving ? "Saving…" : editTarget ? "Save changes" : "Add supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── delete confirm ───────────────────────────────────────────── */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
          </DialogHeader>
          <p className="py-1 text-xs leading-5 text-muted-foreground">
            Suppliers referenced by purchase orders cannot be deleted — deactivate them instead so order history stays intact.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep supplier</Button>
            <Button variant="destructive" onClick={doDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}
              {deleting ? "Deleting…" : "Delete supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
