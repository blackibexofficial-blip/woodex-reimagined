import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Mail, Phone, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminCustomer } from "@/api/types";
import { formatPKR, formatDate, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const PER_PAGE = 10;
type TypeFilter = "all" | "retail" | "business";

export default function AdminCustomers() {
  const api = useMemo(() => getAdminApi(), []);
  const [type, setType] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminCustomer | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listCustomers({ type, query: debounced || undefined, page, perPage: PER_PAGE });
      setRows(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
      toast.error("Could not load customers.");
    } finally {
      setLoading(false);
    }
  }, [api, type, debounced, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [type, debounced]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={type} onValueChange={(v) => setType(v as TypeFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="retail">Retail</TabsTrigger>
            <TabsTrigger value="business">Business / B2B</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input placeholder="Search name, company, city, phone…" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-xs bg-white" />
      </div>

      <SectionCard title={`${total} customer${total === 1 ? "" : "s"}`}>
        {loading ? (
          <SectionSkeleton rows={8} />
        ) : rows.length === 0 ? (
          <EmptyState icon={UsersRound} title="No customers found" hint="Try clearing the search or switching the tab." />
        ) : (
          <>
            <div className="overflow-x-auto -mx-5 -mb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2.5">Customer</th>
                    <th className="px-5 py-2.5">Type</th>
                    <th className="px-5 py-2.5">City</th>
                    <th className="px-5 py-2.5 text-right">Orders</th>
                    <th className="px-5 py-2.5 text-right">Spent</th>
                    <th className="px-5 py-2.5">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-muted">
                  {rows.map((c) => (
                    <tr key={c.id} className="cursor-pointer hover:bg-secondary" onClick={() => setSelected(c)}>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                            {c.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-[170px] truncate font-medium text-foreground">{c.name}</p>
                            {c.company && <p className="max-w-[170px] truncate text-[11px] text-muted-foreground">{c.company}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        {c.type === "business"
                          ? <Badge variant="outline" className="gap-1 border-violet-200 bg-violet-50 text-violet-800"><Building2 className="h-3 w-3" />Business</Badge>
                          : <Badge variant="outline" className="gap-1 border-border bg-secondary text-muted-foreground"><UserRound className="h-3 w-3" />Retail</Badge>}
                      </td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">{c.city}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{c.ordersCount}</td>
                      <td className="px-5 py-2.5 text-right font-medium tabular-nums">{formatPKR(c.totalSpent)}</td>
                      <td className="px-5 py-2.5 text-xs text-muted-foreground">{formatDate(c.joinedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {/* customer detail */}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-1 text-sm">
              {selected.company && <p className="text-xs font-medium uppercase tracking-wide text-violet-700">{selected.company}</p>}
              <div className="flex flex-wrap gap-2">
                <a href={`tel:${selected.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-hon-green-light hover:text-hon-green-dark"><Phone className="h-3.5 w-3.5" />{selected.phone}</a>
                <a href={`mailto:${selected.email}`} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-hon-green-light hover:text-hon-green-dark"><Mail className="h-3.5 w-3.5" />{selected.email}</a>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-secondary p-3"><dt className="text-[11px] uppercase text-muted-foreground">Orders</dt><dd className="mt-0.5 text-lg font-bold">{selected.ordersCount}</dd></div>
                <div className="rounded-lg bg-secondary p-3"><dt className="text-[11px] uppercase text-muted-foreground">Total spent</dt><dd className="mt-0.5 text-lg font-bold">{formatPKR(selected.totalSpent)}</dd></div>
                <div className="rounded-lg bg-secondary p-3"><dt className="text-[11px] uppercase text-muted-foreground">City</dt><dd className="mt-0.5 font-medium">{selected.city}</dd></div>
                <div className="rounded-lg bg-secondary p-3"><dt className="text-[11px] uppercase text-muted-foreground">Customer since</dt><dd className="mt-0.5 font-medium">{formatDate(selected.joinedAt)}</dd></div>
              </dl>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
