import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ShieldCheck, Plus, Search, Loader2, Send, ClipboardCheck, BadgeCheck, Ban, Wrench,
} from "lucide-react";
import { getAdminApi } from "@/api";
import type { AdminClaim, AdminOrder, ClaimStatus, ClaimType } from "@/api/types";
import {
  formatPKR, timeAgo, ClaimStatusBadge, SectionCard, SectionSkeleton, EmptyState,
} from "@/admin/components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const TYPE_LABELS: Record<ClaimType, string> = {
  warranty: "Warranty (5-year)",
  damage: "Damage on delivery",
  defect: "Manufacturing defect",
};
const TYPES = Object.keys(TYPE_LABELS) as ClaimType[];
const STATUSES: Array<ClaimStatus | "all"> = ["all", "reported", "assessing", "approved", "rejected", "resolved"];
const TERMINAL: ClaimStatus[] = ["rejected", "resolved"];

export default function AdminClaims() {
  const api = useMemo(() => getAdminApi(), []);
  const [searchParams, setSearchParams] = useSearchParams();

  /* list state */
  const [items, setItems] = useState<AdminClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ClaimType | "all">("all");

  /* detail dialog state */
  const [selected, setSelected] = useState<AdminClaim | null>(null);
  const [assessmentDraft, setAssessmentDraft] = useState("");
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [costDraft, setCostDraft] = useState("");
  const [busy, setBusy] = useState(false);

  /* create dialog state */
  const [createOpen, setCreateOpen] = useState(false);
  const [deliveredOrders, setDeliveredOrders] = useState<AdminOrder[] | null>(null);
  const [orderId, setOrderId] = useState("");
  const [productName, setProductName] = useState("");
  const [productId, setProductId] = useState<string | undefined>(undefined);
  const [type, setType] = useState<ClaimType>("warranty");
  const [issue, setIssue] = useState("");
  const [walkinName, setWalkinName] = useState("");
  const [walkinPhone, setWalkinPhone] = useState("");
  const [walkinCity, setWalkinCity] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listClaims({ status: statusFilter, type: typeFilter, query, perPage: 60 });
      setItems(res.items);
    } catch {
      toast.error("Could not load claims.");
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter, typeFilter, query]);

  useEffect(() => {
    load();
  }, [load]);

  /* consumed ?new=1&order=WDX-… deep link from the delivered-order dialog */
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const oid = searchParams.get("order") ?? "";
    setCreateOpen(true);
    if (oid) setOrderId(oid);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* load delivered orders when the create dialog opens */
  useEffect(() => {
    if (!createOpen || deliveredOrders !== null) return;
    api.listOrders({ status: "delivered", perPage: 50 })
      .then((res) => setDeliveredOrders(res.items))
      .catch(() => { setDeliveredOrders([]); toast.error("Could not load delivered orders."); });
  }, [api, createOpen, deliveredOrders]);

  /* prefill product from the linked order's first line */
  const pickedOrder = deliveredOrders?.find((o) => o.id === orderId);
  useEffect(() => {
    if (!pickedOrder) return;
    const line = pickedOrder.items[0];
    if (line && !productName) {
      setProductName(line.name);
      setProductId(line.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  /* sync drafts when a different claim opens */
  useEffect(() => {
    setAssessmentDraft(selected?.assessmentNote ?? "");
    setResolutionDraft(selected?.resolutionNote ?? "");
    setCostDraft(selected?.resolutionCost !== undefined ? String(selected.resolutionCost) : "");
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPatch = async (patch: Parameters<typeof api.updateClaim>[1], success: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const updated = await api.updateClaim(selected.id, patch);
      if (updated) {
        setSelected(updated);
        toast.success(success);
        await load();
      } else {
        toast.error("Claim not found — refresh and try again.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    const name = productName.trim();
    const issueText = issue.trim();
    if (!name) return toast.error("Which product is the claim about?");
    if (!issueText) return toast.error("Describe the issue the customer reported.");
    if (!pickedOrder && !walkinName.trim()) return toast.error("Link a delivered order, or enter the customer's name.");
    setCreating(true);
    try {
      const created = await api.createClaim({
        orderId: orderId || undefined,
        productName: name,
        productId,
        type,
        issue: issueText,
        customerName: pickedOrder ? undefined : walkinName.trim(),
        customerPhone: pickedOrder ? undefined : walkinPhone.trim() || undefined,
        city: pickedOrder ? undefined : walkinCity.trim() || undefined,
      });
      if (created) {
        toast.success(`${created.id} filed${created.orderId ? ` for ${created.orderId}` : ""}.`);
        setCreateOpen(false);
        setOrderId(""); setProductName(""); setProductId(undefined); setType("warranty"); setIssue("");
        setWalkinName(""); setWalkinPhone(""); setWalkinCity("");
        await load();
      } else {
        toast.error("Order not found.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not file the claim.");
    } finally {
      setCreating(false);
    }
  };

  const isTerminal = selected ? TERMINAL.includes(selected.status) : false;

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search CLM, order, customer, product…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
            aria-label="Search claims"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ClaimType | "all")}>
            <SelectTrigger className="w-40 bg-white" aria-label="Filter by type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ClaimStatus | "all")}>
            <SelectTrigger className="w-36 bg-white" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setCreateOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
            <Plus className="mr-1.5 h-4 w-4" /> File claim
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[11px] leading-5 text-emerald-900">
        <span className="font-semibold">WOODEX 5-year warranty covers manufacturing defects</span> in frames &amp; joints on
        wooden furniture. Warranty repairs and replacements are handled here — they are not returns, and they don't go
        through the RMA flow. Damage on delivery is routed via the courier; defects outside warranty are assessed case by case.
      </p>

      <SectionCard title="Claims (warranty / damage / defect)">
        {loading ? (
          <SectionSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No claims match"
            hint="File a claim from a delivered order (File claim button) or here."
          />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Reported</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-secondary" onClick={() => setSelected(c)}>
                    <TableCell className="font-mono text-xs font-semibold">{c.id}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.orderId ?? "walk-in"}</TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug max-w-[160px]">{c.customerName}</p>
                      <p className="text-[11px] text-muted-foreground">{c.city}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px]"><span className="line-clamp-2">{c.productName}</span></TableCell>
                    <TableCell className="text-xs">{TYPE_LABELS[c.type]}</TableCell>
                    <TableCell><ClaimStatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{timeAgo(c.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {/* ── create dialog ─────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-hon-green-dark" /> File a claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label htmlFor="claim-order" className="mb-1.5 block text-xs font-medium text-muted-foreground">Link a delivered order <span className="font-normal">(optional)</span></Label>
              <Select value={orderId || "none"} onValueChange={(v) => { setOrderId(v === "none" ? "" : v); if (v === "none") { setProductName(""); setProductId(undefined); } }}>
                <SelectTrigger id="claim-order" className="bg-white" aria-label="Linked order">
                  <SelectValue placeholder={deliveredOrders === null ? "Loading…" : "No linked order (walk-in claim)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked order (walk-in)</SelectItem>
                  {(deliveredOrders ?? []).slice(0, 30).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.id} — {o.customerName} · {formatPKR(o.total)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!pickedOrder && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <Label htmlFor="claim-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">Customer name</Label>
                  <Input id="claim-name" value={walkinName} onChange={(e) => setWalkinName(e.target.value)} placeholder="Ahmed Khan" className="bg-white" />
                </div>
                <div>
                  <Label htmlFor="claim-phone" className="mb-1.5 block text-xs font-medium text-muted-foreground">Phone</Label>
                  <Input id="claim-phone" value={walkinPhone} onChange={(e) => setWalkinPhone(e.target.value)} placeholder="+92 3xx …" className="bg-white" />
                </div>
                <div className="sm:col-span-3">
                  <Label htmlFor="claim-city" className="mb-1.5 block text-xs font-medium text-muted-foreground">City</Label>
                  <Input id="claim-city" value={walkinCity} onChange={(e) => setWalkinCity(e.target.value)} placeholder="Lahore" className="bg-white" />
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="claim-product" className="mb-1.5 block text-xs font-medium text-muted-foreground">Product</Label>
              {pickedOrder ? (
                <Select value={productId ?? ""} onValueChange={(v) => {
                  const line = pickedOrder.items.find((l) => l.id === v);
                  setProductId(v);
                  setProductName(line?.name ?? "");
                }}>
                  <SelectTrigger id="claim-product" className="bg-white" aria-label="Product"><SelectValue placeholder="Pick the product…" /></SelectTrigger>
                  <SelectContent>
                    {pickedOrder.items.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="claim-product" value={productName} onChange={(e) => { setProductName(e.target.value); setProductId(undefined); }} placeholder="e.g. Farmhouse Dining Set — 6 Seater" className="bg-white" />
              )}
            </div>

            <div>
              <Label htmlFor="claim-type" className="mb-1.5 block text-xs font-medium text-muted-foreground">Claim type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ClaimType)}>
                <SelectTrigger id="claim-type" className="bg-white" aria-label="Claim type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="claim-issue" className="mb-1.5 block text-xs font-medium text-muted-foreground">Issue reported</Label>
              <Textarea id="claim-issue" rows={3} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="What failed, when, and what the customer reports…" className="bg-white text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={creating}>
              {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
              {creating ? "Filing…" : "File claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── detail dialog ─────────────────────────────────────────── */}
      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">{selected.id} <span className="text-muted-foreground font-sans font-normal">· {selected.orderId ?? "walk-in"}</span></span>
                  <ClaimStatusBadge status={selected.status} />
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-1 text-sm">
                {/* customer + product */}
                <div className="rounded-lg bg-secondary p-3">
                  <p className="font-semibold">{selected.customerName}</p>
                  <p className="text-xs text-muted-foreground">{selected.customerEmail}{selected.customerEmail ? " · " : ""}{selected.city}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{selected.customerPhone}</p>
                  <p className="mt-2 border-t border-border pt-2 text-xs"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Product — </span>{selected.productName}</p>
                  <p className="mt-1 text-xs"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Type — </span>{TYPE_LABELS[selected.type]}</p>
                </div>

                {/* issue */}
                <div className="rounded-lg border border-muted p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Issue reported</p>
                  <p className="mt-1 text-xs leading-5">{selected.issue}</p>
                </div>

                {/* stage actions */}
                {selected.status === "reported" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Reported — start assessment</p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">Assess the claim (photos, inspection, warranty check) before approving or rejecting.</p>
                    <Button className="mt-2 w-full" onClick={() => applyPatch({ status: "assessing" }, `${selected.id} — assessment started.`)} disabled={busy}>
                      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-1.5 h-4 w-4" />} Start assessment
                    </Button>
                  </div>
                )}

                {(selected.status === "assessing" || selected.status === "rejected" || selected.status === "approved" || selected.status === "resolved") && (
                  <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">Inspection &amp; assessment</p>
                    <Textarea
                      rows={2}
                      value={assessmentDraft}
                      onChange={(e) => setAssessmentDraft(e.target.value)}
                      placeholder="Assessment note (warranty valid? defect confirmed? courier claim filed?)"
                      aria-label="Assessment note"
                      className="bg-white text-xs"
                      disabled={isTerminal}
                    />
                    {selected.status === "assessing" && (
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" className="text-rose-800 border-rose-300 hover:bg-rose-50" onClick={() => applyPatch({ status: "rejected", assessmentNote: assessmentDraft }, `${selected.id} rejected.`)} disabled={busy}>
                          <Ban className="mr-1.5 h-4 w-4" /> Reject
                        </Button>
                        <Button onClick={() => applyPatch({ status: "approved", assessmentNote: assessmentDraft }, `${selected.id} approved.`)} disabled={busy}>
                          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-1.5 h-4 w-4" />} Approve
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {selected.status === "approved" && (
                  <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800">Approved — record the resolution</p>
                    <Textarea
                      rows={2}
                      value={resolutionDraft}
                      onChange={(e) => setResolutionDraft(e.target.value)}
                      placeholder="Resolution (repair at site, part replaced, unit swapped, courier reimbursed…)"
                      aria-label="Resolution note"
                      className="bg-white text-xs"
                    />
                    <div className="flex items-center gap-3">
                      <Label htmlFor="claim-cost" className="whitespace-nowrap text-[11px] font-medium text-violet-900">WOODEX cost (PKR, optional)</Label>
                      <Input id="claim-cost" type="number" inputMode="numeric" min={0} value={costDraft} onChange={(e) => setCostDraft(e.target.value)} placeholder="0" className="h-9 bg-white" />
                    </div>
                    <Button className="w-full" onClick={() => applyPatch({ status: "resolved", resolutionNote: resolutionDraft, resolutionCost: costDraft.trim() ? Number(costDraft) : undefined }, `${selected.id} resolved.`)} disabled={busy}>
                      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wrench className="mr-1.5 h-4 w-4" />} Mark resolved
                    </Button>
                  </div>
                )}

                {isTerminal && (
                  <div className={`rounded-lg border px-4 py-3 text-xs leading-5 ${selected.status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                    This claim is closed ({selected.status}).
                    {selected.resolutionNote && <p className="mt-1">Resolution: {selected.resolutionNote}</p>}
                    {selected.resolutionCost !== undefined && <p className="mt-0.5">WOODEX absorbed {formatPKR(selected.resolutionCost)}.</p>}
                    {selected.orderId && <p className="mt-1 text-[11px] opacity-80">The outcome was noted on the {selected.orderId} timeline.</p>}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">Filed {timeAgo(selected.createdAt)} · last updated {timeAgo(selected.updatedAt)}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
