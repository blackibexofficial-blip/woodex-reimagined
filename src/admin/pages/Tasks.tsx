import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search, Plus, Loader2, ListChecks, CalendarDays, LayoutList, Circle, CheckCircle2, AlertTriangle, Clock3, Flag, Check,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminTask } from "@/api/types";
import { formatDate, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const PRIORITIES = ["low", "normal", "high"] as const;
const PRIORITY_PILL: Record<string, string> = {
  low: "border-border bg-secondary text-muted-foreground",
  normal: "border-emerald-300 bg-emerald-50 text-emerald-800",
  high: "border-orange-400 bg-orange-50 text-orange-800",
};
const isOverdue = (t: AdminTask) => !t.done && !!t.due && Date.parse(t.due) < Date.now() && !sameDay(t.due, new Date());
const sameDay = (iso: string | Date, d: Date) => {
  const dt = new Date(iso);
  return dt.getFullYear() === d.getFullYear() && dt.getMonth() === d.getMonth() && dt.getDate() === d.getDate();
};
const dueBadge = (t: AdminTask) => {
  if (!t.due) return <span className="text-[11px] text-muted-foreground">—</span>;
  const over = isOverdue(t);
  const today = sameDay(t.due, new Date()) && !t.done;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
      over ? "border-rose-300 bg-rose-50 text-rose-800" : today ? "border-amber-400 bg-amber-50 text-amber-900" : "border-border bg-secondary text-muted-foreground"
    }`}>
      {over ? "Overdue · " : today ? "Due today · " : ""}{formatDate(t.due)}
    </span>
  );
};

export default function AdminTasks() {
  const api = useMemo(() => getAdminApi(), []);

  const [items, setItems] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [tab, setTab] = useState<"list" | "board" | "calendar">("list");
  const [busyId, setBusyId] = useState<string | null>(null);

  /* new task dialog */
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<string>("normal");
  const [saving, setSaving] = useState(false);

  /* calendar month cursor */
  const [monthOffset, setMonthOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listTasks({ status: "all", perPage: 200 });
      setItems(res.items);
    } catch {
      toast.error("Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const open = items.filter((t) => !t.done);
    const done = items.filter((t) => t.done);
    return {
      open: open.length,
      done: done.length,
      today: open.filter((t) => t.due && sameDay(t.due, new Date())).length,
      overdue: open.filter((t) => isOverdue(t)).length,
    };
  }, [items]);

  const visible = useMemo(() => {
    let list = items;
    if (filter === "open") list = list.filter((t) => !t.done);
    else if (filter === "done") list = list.filter((t) => t.done);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) => [t.title, t.client, t.owner, t.priority, t.id].some((v) => String(v ?? "").toLowerCase().includes(q)));
    return list;
  }, [items, filter, query]);

  const toggle = async (t: AdminTask) => {
    setBusyId(t.id);
    try {
      const updated = await api.setTaskDone(t.id, !t.done);
      if (updated) {
        setItems((prev) => prev.map((x) => (x.id === t.id ? updated : x)));
        toast.success(updated.done ? `${t.id} done.` : `${t.id} reopened.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the task.");
    } finally {
      setBusyId(null);
    }
  };

  const submitNew = async () => {
    if (!title.trim()) return toast.error("Task title is required.");
    setSaving(true);
    try {
      await api.createTask({ title: title.trim(), client: client.trim() || undefined, dueAt: due ? new Date(`${due}T09:00:00+05:00`).toISOString() : undefined, priority });
      toast.success("Task created.");
      setNewOpen(false);
      setTitle(""); setClient(""); setDue(""); setPriority("normal");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Task could not be created.");
    } finally {
      setSaving(false);
    }
  };

  /* month grid for the calendar tab */
  const calendar = useMemo(() => {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + monthOffset);
    const year = base.getFullYear(), month = base.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first grid
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number | null; iso?: string }> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push({ day: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, iso: new Date(Date.UTC(year, month, d)).toISOString() });
    return { year, month, cells, label: base.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) };
  }, [monthOffset]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, AdminTask[]>();
    for (const t of items) {
      if (!t.due) continue;
      const d = new Date(t.due);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    }
    return map;
  }, [items]);

  const taskRow = (t: AdminTask) => (
    <div key={t.id} className="flex items-center gap-3 p-2.5">
      <button
        type="button"
        onClick={() => toggle(t)}
        disabled={busyId === t.id}
        aria-label={t.done ? `Reopen ${t.id}` : `Complete ${t.id}`}
        className="shrink-0 text-muted-foreground transition hover:text-hon-green-dark disabled:opacity-50"
      >
        {busyId === t.id ? <Loader2 className="h-5 w-5 animate-spin" /> : t.done ? <CheckCircle2 className="h-5 w-5 text-hon-green" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-xs font-medium ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.title}</p>
        <p className="text-[10px] text-muted-foreground">{t.client ?? t.quoteId ?? t.orderId ?? "General"} · <span className="font-mono">{t.id}</span></p>
      </div>
      <div className="hidden sm:block">{dueBadge(t)}</div>
      <span className="hidden w-16 text-[10px] font-medium text-muted-foreground md:block">{t.owner}</span>
      <span className={`hidden whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_PILL[t.priority] ?? PRIORITY_PILL.normal}`}>{t.priority}</span>
      <Button variant={t.done ? "outline" : "secondary"} size="sm" className="h-7 shrink-0 px-2 text-[11px]" disabled={busyId === t.id} onClick={() => toggle(t)}>
        {t.done ? "Reopen" : "Complete"}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Client follow-ups shared with the CRM — finish here, keep the pipeline honest.</p>
        <Button onClick={() => setNewOpen(true)} className="bg-accent hover:bg-accent/90 text-accent-foreground">
          <Plus className="mr-1.5 h-4 w-4" /> New task
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Open tasks", value: counts.open, icon: ListChecks, tone: "text-hon-green-dark" },
          { label: "Due today", value: counts.today, icon: Clock3, tone: "text-amber-600" },
          { label: "Overdue", value: counts.overdue, icon: AlertTriangle, tone: "text-rose-600" },
          { label: "Completed", value: counts.done, icon: CheckCircle2, tone: "text-emerald-600" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><Icon className={`h-4 w-4 ${tone}`} /> {label}</p>
            <p className="mt-1.5 text-2xl font-black text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* filter chips + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            ["all", `All tasks · ${items.length}`],
            ["open", `Open · ${counts.open}`],
            ["done", `Done · ${counts.done}`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filter === key ? "border-accent bg-accent text-accent-foreground" : "border-border bg-white text-muted-foreground hover:border-accent"
              }`}
              aria-pressed={filter === key}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks, owner, client…" className="pl-9 bg-white" aria-label="Search tasks" />
        </div>
      </div>

      {/* tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5"><LayoutList className="h-4 w-4" /> List</TabsTrigger>
          <TabsTrigger value="board" className="gap-1.5"><Flag className="h-4 w-4" /> Open / done board</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="h-4 w-4" /> Due-date calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <SectionCard title="Tasks">
            {loading ? (
              <SectionSkeleton />
            ) : visible.length === 0 ? (
              <EmptyState icon={ListChecks} title="No tasks match" hint="Create a follow-up from here — it stays open until you complete it, and it shares the CRM store so the pipeline never lies." />
            ) : (
              <div className="-mx-4 divide-y divide-border sm:mx-0">{visible.map(taskRow)}</div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="board">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {([["Open", items.filter((t) => !t.done), "Open"], ["Done", items.filter((t) => t.done), "Done"]] as const).map(([label, list]) => (
              <SectionCard key={label} title={`${label} · ${list.length}`}>
                {list.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">{label === "Open" ? "Nothing open — inbox zero. Nice." : "Nothing completed yet."}</p>
                ) : (
                  <ul className="-mx-4 divide-y divide-border sm:mx-0">{list.map(taskRow)}</ul>
                )}
              </SectionCard>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <SectionCard title="Due-date calendar">
            <div className="flex items-center justify-between pb-3">
              <Button variant="outline" size="sm" onClick={() => setMonthOffset((m) => m - 1)}>← Prev</Button>
              <p className="text-sm font-bold">{calendar.label}</p>
              <Button variant="outline" size="sm" onClick={() => setMonthOffset((m) => m + 1)}>Next →</Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendar.cells.map((cell, i) => {
                if (cell.day === null) return <div key={`x-${i}`} className="min-h-[4.5rem] rounded-md bg-transparent" />;
                const key = `${calendar.year}-${calendar.month}-${cell.day}`;
                const dayTasks = tasksByDay.get(key) ?? [];
                const isToday = sameDay(new Date(calendar.year, calendar.month, cell.day), new Date());
                return (
                  <div key={key} className={`min-h-[4.5rem] rounded-md border p-1 text-left ${isToday ? "border-hon-green bg-hon-green-pale/30" : "border-border"}`}>
                    <p className={`text-[10px] font-bold ${isToday ? "text-hon-green-dark" : "text-muted-foreground"}`}>{cell.day}</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {dayTasks.slice(0, 2).map((t) => (
                        <li key={t.id} className={`truncate rounded px-1 py-0.5 text-[9px] leading-tight ${t.done ? "text-muted-foreground line-through" : "bg-white font-medium text-foreground"}`} title={t.title}>{t.title}</li>
                      ))}
                      {dayTasks.length > 2 && <li className="px-1 text-[9px] text-muted-foreground">+{dayTasks.length - 2} more</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      {/* ── new task dialog ─────────────────────────────────────────── */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label htmlFor="task-title" className="mb-1.5 block text-xs font-medium text-muted-foreground">Task *</Label>
              <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send installment-2 reminder" className="bg-white" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="task-client" className="mb-1.5 block text-xs font-medium text-muted-foreground">Client / deal</Label>
                <Input id="task-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Clifton Villa 9" className="bg-white" aria-label="Client or deal label" />
              </div>
              <div>
                <Label htmlFor="task-due" className="mb-1.5 block text-xs font-medium text-muted-foreground">Due date</Label>
                <Input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="bg-white" aria-label="Due date" />
              </div>
              <div>
                <Label htmlFor="task-priority" className="mb-1.5 block text-xs font-medium text-muted-foreground">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="task-priority" className="w-full bg-white" aria-label="Priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[10px] leading-4 text-muted-foreground">Shared with the CRM store. Tasks are worked, not deleted — completing is the only way out.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={submitNew} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              {saving ? "Creating…" : "Create task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
