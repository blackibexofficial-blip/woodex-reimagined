import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { WarrantyRegisterRow } from "@/api/types";
import { EmptyState, SectionCard, SectionSkeleton, timeAgo } from "@/admin/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Filter = "all" | "active" | "expiring" | "expired" | "cancelled" | "claims";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expiring", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
  { value: "claims", label: "Open claims" },
];

const stateClass = (state: WarrantyRegisterRow["warrantyState"]) =>
  state === "active" ? "border-emerald-200 bg-emerald-100 text-emerald-800"
    : state === "expired" ? "border-rose-200 bg-rose-100 text-rose-800"
      : state === "cancelled" ? "border-slate-300 bg-slate-100 text-slate-700"
        : "border-amber-300 bg-amber-100 text-amber-900";

const fmtDay = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

function matches(row: WarrantyRegisterRow, filter: Filter) {
  switch (filter) {
    case "active": return row.warrantyState === "active";
    case "expiring": return row.expiringSoon;
    case "expired": return row.warrantyState === "expired";
    case "cancelled": return row.warrantyState === "cancelled";
    case "claims": return row.openClaims > 0;
    default: return true;
  }
}

export default function AdminWarrantyRegister() {
  const api = useMemo(() => getAdminApi(), []);
  const [rows, setRows] = useState<WarrantyRegisterRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listWarrantyRegister(60));
    } catch (e) {
      console.error(e);
      toast.error("Could not load the warranty register.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = rows.filter((r) => matches(r, filter));
  const counts = {
    active: rows.filter((r) => r.warrantyState === "active").length,
    expiring: rows.filter((r) => r.expiringSoon).length,
    openClaims: rows.reduce((sum, r) => sum + r.openClaims, 0),
    breached: rows.reduce((sum, r) => sum + (r.slaBreached ?? 0), 0),
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-black tracking-tight text-foreground">Warranty register</h1>
          <p className="text-xs text-muted-foreground">
            Every job with a warranty or a claim, with the state derived from its dates. Work the list from the top: soonest expiry first.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-semibold" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh register">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {[
          { label: "Active warranties", value: counts.active, tone: "text-emerald-700" },
          { label: "Expiring in 60 days", value: counts.expiring, tone: "text-amber-700" },
          { label: "Open claims", value: counts.openClaims, tone: counts.openClaims > 0 ? "text-rose-700" : "text-foreground" },
          { label: "Past the claim SLA", value: counts.breached, tone: counts.breached > 0 ? "text-rose-700" : "text-foreground" },
        ].map(({ label, value, tone }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className={`mt-1 text-lg font-black ${tone}`} aria-label={label}>{value}</p>
          </div>
        ))}
      </div>

      <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as Filter)} aria-label="Filter the warranty register" className="h-auto flex-wrap justify-start rounded-md bg-muted p-1">
        {FILTERS.map((f) => (
          <ToggleGroupItem key={f.value} value={f.value} className="h-auto whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-muted-foreground transition-all hover:bg-transparent hover:text-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm">
            {f.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <SectionCard title={`${filtered.length} job${filtered.length === 1 ? "" : "s"}`}>
        {loading ? (
          <SectionSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={rows.length === 0 ? "No warranties recorded yet" : "Nothing matches this filter"}
            hint={rows.length === 0
              ? "Open a job's practice workspace → Handover to record delivery, installation and a warranty."
              : "Try another filter — the register lists jobs with a warranty or a claim."}
          />
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Warranty</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead>Claims</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Handover</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.projectId} data-testid={`warranty-row-${row.projectId}`}>
                    <TableCell>
                      <p className="max-w-[240px] truncate text-sm font-medium leading-snug">{row.title || row.projectId}</p>
                      <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="font-mono">{row.projectId}</span>
                        {row.orderId && <Badge variant="outline" className="font-mono text-[10px]">Order {row.orderId}</Badge>}
                        {row.dispatchVehicle && <span>· {row.dispatchVehicle}</span>}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${stateClass(row.warrantyState)}`} aria-label={`Warranty state ${row.warrantyState}`}>
                        {row.warrantyState}
                      </span>
                      {row.daysLeft !== undefined && row.warrantyState === "active" && (
                        <p className={`mt-1 text-[11px] font-semibold ${row.expiringSoon ? "text-amber-700" : "text-muted-foreground"}`}>
                          {row.daysLeft === 0 ? "ends today" : `${row.daysLeft} day${row.daysLeft === 1 ? "" : "s"} left`}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {row.warrantyState === "none" ? "—" : fmtDay(row.endsOn)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.totalClaims === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={row.openClaims > 0 ? "font-semibold text-rose-700" : "text-muted-foreground"}>
                          {row.openClaims} open · {row.totalClaims} total
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {(row.slaBreached ?? 0) > 0 ? (
                        <span className="inline-flex rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-800" aria-label="Claims past their SLA">
                          {row.slaBreached} past due
                        </span>
                      ) : row.nextClaimDue ? (
                        <span className="text-muted-foreground">due {fmtDay(row.nextClaimDue)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {row.assignedTo && <p className="mt-1 text-[11px] text-muted-foreground">owner {row.assignedTo}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {row.installationOn ? <>installed {fmtDay(row.installationOn)}</> : row.deliveryOn ? <>delivered {fmtDay(row.deliveryOn)}</> : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                      <span title={row.updatedAt}>{timeAgo(row.updatedAt)}</span>
                      <div className="mt-1">
                        <Link to="/admin/projects" className="inline-flex items-center gap-1 text-[11px] font-semibold text-hon-green-dark hover:underline">
                          <CalendarClock className="h-3 w-3" /> Open workspace
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          States are derived from the recorded dates, not typed. “Expiring soon” uses a 60-day window; claims are counted while they are open or scheduled, and a claim counts as past due once its promised date (the warranty\'s claim SLA) has gone by.
        </p>
      </SectionCard>
    </div>
  );
}
