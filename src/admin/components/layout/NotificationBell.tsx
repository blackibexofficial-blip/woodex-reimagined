import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, MessagesSquare, Hourglass, CircleAlert, ClipboardList, ChevronRight, Loader2 } from "lucide-react";
import { getAdminApi } from "@/api";
import { cn } from "@/lib/utils";

const STALE_DAYS = 7;
const POLL_MS = 60_000;

interface BellCounts {
  unreadChats: number;
  staleLeads: number;
  lowStock: number;
  overdueTasks: number;
  /** Human-readable lines for the top item under each heading (best-effort). */
  overdueTitles: string[];
}

const EMPTY: BellCounts = { unreadChats: 0, staleLeads: 0, lowStock: 0, overdueTasks: 0, overdueTitles: [] };

/**
 * Admin notification bell (V5 Step 6) — one glanceable queue across the four
 * "needs a human" signals that already have deterministic demo sources:
 *   unread chats · leads stale > 7 days · low-stock SKUs · overdue open tasks.
 * Click-through lands on the matching workbench. Hosted backends that can't
 * answer these queries degrade to a zero badge, never to a fake number.
 * Refresh: on mount + every 60s while the tab is visible; popover is
 * keyboard-escapable and outside-click dismissible.
 */
export default function NotificationBell() {
  const [counts, setCounts] = useState<BellCounts>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    const api = getAdminApi();
    const results = await Promise.allSettled([
      api.listChatConversations(),
      api.listLeads({ staleDays: STALE_DAYS, page: 1, perPage: 1 }),
      api.listInventory({ filter: "low" }),
      api.listTasks({ status: "open", page: 1, perPage: 50 }),
    ]);
    const [chats, stale, lowStock, tasks] = results;
    // A rejected source means this backend can't answer it — degrade, don't invent.
    const allFailed = results.every((r) => r.status === "rejected");
    setUnavailable(allFailed);
    const today = new Date().toISOString().slice(0, 10);
    const taskItems = tasks.status === "fulfilled" ? tasks.value.items : [];
    const overdue = taskItems.filter((t) => (t.due ?? "9999-12-31").slice(0, 10) < today && !t.done);
    setCounts({
      unreadChats: chats.status === "fulfilled" ? chats.value.reduce((n, c) => n + (c.unread ?? 0), 0) : 0,
      staleLeads: stale.status === "fulfilled" ? (stale.value.total ?? stale.value.items.length) : 0,
      lowStock: lowStock.status === "fulfilled" ? lowStock.value.length : 0,
      overdueTasks: overdue.length,
      overdueTitles: overdue.slice(0, 2).map((t) => t.title),
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  /* outside-click dismiss */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const total = counts.unreadChats + counts.staleLeads + counts.lowStock + counts.overdueTasks;
  const rows = [
    { icon: MessagesSquare, label: "Unread chats", detail: "Visitor conversations waiting for a reply", count: counts.unreadChats, to: "/admin/chat" },
    { icon: Hourglass, label: `Leads stale > ${STALE_DAYS} days`, detail: "No contact logged — review the pipeline", count: counts.staleLeads, to: "/admin/leads" },
    { icon: CircleAlert, label: "Low stock", detail: "At or below threshold (not made-to-order)", count: counts.lowStock, to: "/admin/inventory" },
    { icon: ClipboardList, label: "Overdue tasks", detail: counts.overdueTitles[0] ? `e.g. ${counts.overdueTitles[0]}` : "Open tasks past their due date", count: counts.overdueTasks, to: "/admin/tasks" },
  ];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={total > 0 ? `Notifications — ${total} need attention` : "Notifications — nothing pending"}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground shadow-sm transition hover:border-accent hover:text-hon-green-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
        {total > 0 && (
          <span aria-hidden className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-background shadow-xl"
        >
          <p className="border-b border-border bg-secondary/60 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Needs a human</p>
          {unavailable ? (
            <p className="px-4 py-5 text-center text-[11px] leading-relaxed text-muted-foreground">Notifications aren&rsquo;t available on this backend yet — the demo queues still populate in demo mode.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => {
                const Icon = row.icon;
                return (
                  <li key={row.label}>
                    <button
                      type="button"
                      onClick={() => { setOpen(false); navigate(row.to); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", row.count > 0 ? "text-amber-600" : "text-muted-foreground")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold text-foreground">{row.label}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{row.detail}</span>
                      </span>
                      <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold", row.count > 0 ? "bg-rose-100 text-rose-700" : "bg-secondary text-muted-foreground")}>{row.count}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-border px-3 py-1.5 text-[9px] leading-snug text-muted-foreground">
            Live (demo) signals · refreshes every minute · <Link to="/admin/tasks" onClick={() => setOpen(false)} className="font-semibold underline underline-offset-2 hover:text-foreground">manage tasks</Link>
          </p>
        </div>
      )}
    </div>
  );
}
