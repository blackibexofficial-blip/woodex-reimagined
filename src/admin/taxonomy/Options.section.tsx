import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Loader2, Pencil, Trash2, SlidersHorizontal, X, Check,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminOptionSet, AdminOptionValueInput, AdminProduct } from "@/api/types";
import { formatPKR, timeAgo, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ValueRow = { id?: string; label: string; priceDelta: string; skuSuffix: string };

const emptyRow = (): ValueRow => ({ label: "", priceDelta: "0", skuSuffix: "" });

export function OptionsSection() {
  const api = useMemo(() => getAdminApi(), []);

  const [sets, setSets] = useState<AdminOptionSet[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  /* editor dialog */
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminOptionSet | null>(null);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<ValueRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);

  /* delete confirm */
  const [deleteTarget, setDeleteTarget] = useState<AdminOptionSet | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, products] = await Promise.all([
        api.listOptionSets(),
        api.listProducts({ perPage: 500 }) as Promise<{ items: AdminProduct[] }>,
      ]);
      setSets(list);
      const counts: Record<string, number> = {};
      for (const p of products.items ?? []) {
        for (const id of p.optionSetIds ?? []) counts[id] = (counts[id] ?? 0) + 1;
      }
      setUsage(counts);
    } catch {
      toast.error("Could not load option sets.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sets;
    return sets.filter((s) =>
      s.name.toLowerCase().includes(q) || s.values.some((v) => v.label.toLowerCase().includes(q) || (v.skuSuffix ?? "").toLowerCase().includes(q)));
  }, [sets, query]);

  const openCreate = () => {
    setEditTarget(null);
    setName("");
    setRows([emptyRow(), emptyRow()]);
    setEditorOpen(true);
  };

  const openEdit = (set: AdminOptionSet) => {
    setEditTarget(set);
    setName(set.name);
    setRows(set.values.map((v) => ({ id: v.id, label: v.label, priceDelta: String(v.priceDelta), skuSuffix: v.skuSuffix ?? "" })));
    setEditorOpen(true);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name the option set — e.g. Finish or Size.");
    const values: AdminOptionValueInput[] = rows
      .map((r) => ({ id: r.id, label: r.label.trim(), priceDelta: Math.trunc(Number(r.priceDelta) || 0), skuSuffix: r.skuSuffix.trim() || undefined }))
      .filter((v) => v.label.length > 0);
    if (values.length === 0) return toast.error("Add at least one value.");
    setSaving(true);
    try {
      if (editTarget) {
        const updated = await api.updateOptionSet(editTarget.id, { name: trimmed, values });
        if (updated) toast.success(`${updated.name} saved.`);
      } else {
        const created = await api.createOptionSet({ name: trimmed, values });
        toast.success(`${created.name} created.`);
      }
      setEditorOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the option set.");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const ok = await api.deleteOptionSet(deleteTarget.id);
      if (ok) {
        toast.success(`${deleteTarget.name} deleted.`);
        setDeleteTarget(null);
        await load();
      } else {
        const used = usage[deleteTarget.id] ?? 0;
        toast.error(used > 0
          ? `${deleteTarget.name} is attached to ${used} product(s) — detach them before deleting.`
          : "Could not delete this option set.");
        setDeleteTarget(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const fmtDelta = (n: number) => (n > 0 ? `+${formatPKR(n)}` : n < 0 ? `−${formatPKR(Math.abs(n))}` : "±0");

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search options, values, SKU suffix…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search option sets"
          />
        </div>
        <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
          <Plus className="mr-1.5 h-4 w-4" /> New option set
        </Button>
      </div>

      <p className="rounded-lg border border-border bg-secondary/50 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
        Option sets are <span className="font-semibold text-foreground">master data</span> — attach them to products (edit product → Option sets) and they
        render as selectors on the PDP. A value's <span className="font-semibold text-foreground">price delta</span> (PKR) is added to the product's base price; its
        <span className="font-semibold text-foreground"> SKU suffix</span> is appended on variant selection (e.g. WDX-1001-NO). Stock stays product-level in this demo.
      </p>

      <SectionCard title="Product Option Sets">
        {loading ? (
          <SectionSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="No option sets match"
            hint="Create Finish / Fabric / Size (or any master list) — values carry a PKR delta and a SKU suffix."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Set</TableHead>
                  <TableHead>Values</TableHead>
                  <TableHead className="text-right">Used by</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((set) => (
                  <TableRow key={set.id} className="hover:bg-secondary align-top">
                    <TableCell>
                      <p className="text-sm font-semibold">{set.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{set.id}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5 max-w-[520px]">
                        {set.values.map((v) => (
                          <Badge key={v.id} variant="outline" className="gap-1 font-normal">
                            <span>{v.label}</span>
                            <span className={cn("tabular-nums", v.priceDelta > 0 ? "text-rose-600" : v.priceDelta < 0 ? "text-emerald-600" : "text-muted-foreground")}>{fmtDelta(v.priceDelta)}</span>
                            {v.skuSuffix && <span className="rounded bg-secondary px-1 font-mono text-[9px] text-muted-foreground">{v.skuSuffix}</span>}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{usage[set.id] ?? 0}<span className="block text-[10px] text-muted-foreground">product(s)</span></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(set.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(set)} aria-label={`Edit ${set.name}`} title="Edit option set">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 hover:text-rose-600" onClick={() => setDeleteTarget(set)} aria-label={`Delete ${set.name}`} title="Delete option set">
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

      {/* editor dialog */}
      <Dialog open={editorOpen} onOpenChange={(open) => !saving && setEditorOpen(open)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-accent" /> {editTarget ? `Edit ${editTarget.name}` : "New option set"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="os-name">Name</Label>
              <Input id="os-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finish, Fabric, Size" autoFocus />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Values</Label>
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setRows((d) => [...d, emptyRow()])}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add value
                </Button>
              </div>
              <div className="space-y-1.5">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={row.label}
                      onChange={(e) => setRows((d) => d.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                      placeholder="Label (Natural Oak)"
                      className="flex-1"
                      aria-label={`Value ${i + 1} label`}
                    />
                    <Input
                      type="number"
                      value={row.priceDelta}
                      onChange={(e) => setRows((d) => d.map((r, j) => j === i ? { ...r, priceDelta: e.target.value } : r))}
                      className="w-24 text-right tabular-nums"
                      placeholder="+PKR"
                      aria-label={`Value ${i + 1} price delta`}
                      title="Price delta (PKR), can be negative"
                    />
                    <Input
                      value={row.skuSuffix}
                      onChange={(e) => setRows((d) => d.map((r, j) => j === i ? { ...r, skuSuffix: e.target.value.toUpperCase() } : r))}
                      className="w-20 font-mono uppercase"
                      placeholder="NO"
                      maxLength={6}
                      aria-label={`Value ${i + 1} SKU suffix`}
                      title="SKU suffix"
                    />
                    <button type="button" className="shrink-0 text-muted-foreground hover:text-rose-500" aria-label={`Remove value ${i + 1}`}
                      onClick={() => setRows((d) => (d.length > 1 ? d.filter((_, j) => j !== i) : d))}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">Price delta accepts negatives (e.g. −5000 for a downgrade option). Suffix is appended to the SKU.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} {editTarget ? "Save changes" : "Create set"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="h-4 w-4 text-rose-500" /> Delete {deleteTarget?.name}?</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                {(usage[deleteTarget.id] ?? 0) > 0
                  ? `Attached to ${usage[deleteTarget.id]} product(s) — detach it there first.`
                  : "Not attached to any product — safe to delete."}
              </p>
              {(usage[deleteTarget.id] ?? 0) === 0 && (
                <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
                  <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-600" /> No references found.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button onClick={doDelete} disabled={deleting || (usage[deleteTarget?.id ?? ""] ?? 0) > 0} className="bg-rose-600 hover:bg-rose-700 text-white">
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
