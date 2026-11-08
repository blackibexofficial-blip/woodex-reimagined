import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MessagesSquare, Phone, MapPin, ShieldCheck, ShieldEllipsis, SendHorizontal, CircleCheck, RotateCcw, XCircle, Settings } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { ChatConversation, ChatMessage, ChatMode } from "@/api/types";
import { isDemoMode } from "@/config/env";
import { CHAT_AGENT_TEMPLATES, CHAT_POLL_MS, relativeTime } from "@/lib/chat";
import { cn } from "@/lib/utils";

type Filter = "all" | "open" | "unread" | "closed";

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Admin inbox for storefront live chat (V4 P0).
 *
 * Demo-authoritative: in demo mode conversations persist in the demo store and
 * replies render on the visitor's bubble within the poll window. On hosted
 * backends the inbox renders read-only/empty with a banner — chat tables are
 * an owner-gated migration, deliberately not created by this release.
 */
export default function ChatInbox() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ChatMode | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);

  const loadList = useCallback(async () => {
    try {
      const list = await getAdminApi().listChatConversations();
      setConversations(list);
    } catch {
      setConversations([]);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await getAdminApi().getChatConversation(id);
      if (!res) return;
      setMessages(res.messages);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0, ...res.conversation } : c)));
    } catch {
      /* transient read error — keep what we have */
    }
  }, []);

  useEffect(() => {
    void loadList();
    getAdminApi().getChatMode().then(setMode).catch(() => setMode("offline"));
    const t = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadList();
      if (selectedId) void loadDetail(selectedId);
    }, CHAT_POLL_MS);
    return () => window.clearInterval(t);
  }, [loadList, loadDetail, selectedId]);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [messages.length]);

  const selectConversation = async (id: string) => {
    setSelectedId(id);
    setMessages([]);
    try { await getAdminApi().markChatRead(id); } catch { /* badge self-corrects on next poll */ }
    void loadDetail(id);
  };

  const counts = useMemo(() => ({
    all: conversations.length,
    open: conversations.filter((c) => c.status === "open").length,
    unread: conversations.filter((c) => c.unread > 0).length,
    closed: conversations.filter((c) => c.status === "closed").length,
  }), [conversations]);

  const visible = useMemo(() => {
    let items = conversations;
    if (filter === "open") items = items.filter((c) => c.status === "open");
    else if (filter === "closed") items = items.filter((c) => c.status === "closed");
    else if (filter === "unread") items = items.filter((c) => c.unread > 0);
    const q = query.trim().toLowerCase();
    if (q) items = items.filter((c) => [c.visitorName, c.visitorPhone, c.page, c.id].some((h) => h?.toLowerCase().includes(q)));
    return items;
  }, [conversations, filter, query]);

  const sendReply = async (close = false) => {
    const body = reply.trim();
    if (!body || !selectedId || busy) return;
    setBusy(true);
    try {
      const message = await getAdminApi().postChatAgentMessage(selectedId, body, { close });
      if (!message) throw new Error("Conversation not found — it may have been removed.");
      setMessages((m) => [...m, message]);
      setReply("");
      await loadList();
      toast.success(close ? "Reply sent — conversation closed." : "Reply sent.");
    } catch (err) {
      console.error("chat reply failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to send — please try again.");
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!selectedId) return;
    try {
      const updated = await getAdminApi().setChatStatus(selectedId, "open");
      if (updated) setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...updated } : c)));
      toast.success("Conversation reopened.");
    } catch (err) {
      console.error("reopen failed:", err);
      toast.error("Could not reopen — please try again.");
    }
  };

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[560px] flex-col gap-3 p-4 sm:p-5">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent" aria-hidden>
          <MessagesSquare className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight text-foreground">Live Chat</h1>
          <p className="text-xs text-muted-foreground">Storefront conversations — answered by the team, stored with consent</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-foreground">
            <span className={cn("h-2 w-2 rounded-full", mode === "live" ? "bg-emerald-500" : mode === "off" ? "bg-muted-foreground" : "bg-amber-500")} aria-hidden />
            Storefront: {mode === "live" ? "Live (agents answer)" : mode === "off" ? "Hidden" : "Offline capture"}
          </span>
          <Link to="/admin/settings" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent hover:text-accent">
            <Settings className="h-3.5 w-3.5" aria-hidden /> Settings
          </Link>
        </div>
      </div>

      {!isDemoMode && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Live chat is demo-only in this release — hosted chat tables need the owner's explicit migration decision. Conversations below are empty on this backend; visitor callback requests still arrive as leads.
        </div>
      )}

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search conversations</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, page…" className={inputCls} />
        </label>
        {(["all", "open", "unread", "closed"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold capitalize transition-colors",
              filter === f ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {f} <span className="tabular-nums opacity-80">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* split view */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(260px,360px)_1fr]">
        {/* list */}
        <div className="overflow-y-auto rounded-xl border border-border bg-background" aria-label="Conversations">
          {visible.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {conversations.length === 0 ? "No conversations yet — the storefront bubble will create them." : "Nothing matches this filter."}
            </div>
          ) : visible.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid="chat-conversation-row"
              onClick={() => void selectConversation(c.id)}
              aria-pressed={selectedId === c.id}
              className={cn(
                "flex w-full items-start gap-2.5 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0",
                selectedId === c.id ? "bg-accent/5" : "hover:bg-secondary/50",
              )}
            >
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground" aria-hidden>
                {(c.visitorName ?? "?").split(/\s+/).slice(-1)[0]?.slice(0, 2).toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13px] font-semibold text-foreground">{c.visitorName ?? "Anonymous visitor"}</p>
                  {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white" aria-label={`${c.unread} unread`}>{c.unread}</span>}
                </div>
                <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" aria-hidden />{c.page ?? "/"} · {relativeTime(c.lastMessageAt)}</p>
                {c.leadId && <p className="mt-0.5 text-[10px] font-medium text-emerald-700">Linked to a lead</p>}
              </div>
              {c.status === "closed" && <CircleCheck className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Closed" />}
            </button>
          ))}
        </div>

        {/* conversation */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border bg-background">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <MessagesSquare className="h-10 w-10 text-muted-foreground/50" aria-hidden />
              <p className="text-sm font-semibold text-foreground">Pick a conversation</p>
              <p className="max-w-xs text-xs text-muted-foreground">Reply as Wwoodex — visitors see your answer inside the bubble on the storefront, usually within seconds.</p>
            </div>
          ) : (
            <>
              {/* meta bar */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 text-[11px] text-muted-foreground">
                <span className="text-sm font-bold text-foreground">{selected.visitorName ?? "Anonymous visitor"}</span>
                {selected.visitorPhone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" aria-hidden />{selected.visitorPhone}</span>}
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />arrived at {selected.page ?? "/"}</span>
                {selected.visitorConsent
                  ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />consent recorded{selected.visitorConsentAt ? ` · ${new Date(selected.visitorConsentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
                  : <span className="inline-flex items-center gap-1"><ShieldEllipsis className="h-3.5 w-3.5" aria-hidden />no consent captured</span>}
                <span className="font-mono">#{selected.id.slice(0, 10)}</span>
                {selected.leadId && <Link to="/admin/leads" className="font-semibold text-accent underline-offset-2 hover:underline">View linked lead →</Link>}
                <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold uppercase tracking-wide", selected.status === "open" ? "bg-emerald-50 text-emerald-800" : "bg-secondary text-muted-foreground")}>{selected.status}</span>
              </div>

              {/* thread */}
              <div ref={threadRef} role="log" aria-live="polite" aria-label="Conversation transcript" className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-secondary/30 px-4 py-3">
                {messages.map((m) => (
                  <div key={m.id} className={cn("flex flex-col", m.role === "agent" ? "items-end" : "items-start")}>
                    <div className={cn(
                      "max-w-[75%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm",
                      m.role === "agent" ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md border border-border bg-background text-foreground",
                    )}>
                      {m.body}
                    </div>
                    <span className="mt-0.5 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {m.role === "agent" ? "Wwoodex team" : "Visitor"} · {relativeTime(m.createdAt)}
                    </span>
                  </div>
                ))}
              </div>

              {/* quick templates */}
              <div className="flex flex-wrap gap-1.5 border-t border-border px-3 pt-2.5">
                {CHAT_AGENT_TEMPLATES.map((t) => (
                  <button key={t.slice(0, 24)} type="button" onClick={() => setReply((r) => (r ? `${r} ${t}` : t))} className="max-w-[280px] truncate rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-accent hover:text-accent" title={t}>
                    {t}
                  </button>
                ))}
              </div>

              {/* composer */}
              <div className="flex items-end gap-2 px-3 pb-3 pt-2">
                <label htmlFor="chat-reply" className="sr-only">Your reply</label>
                <textarea
                  id="chat-reply"
                  rows={2}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendReply(false); } }}
                  placeholder="Type a reply as Wwoodex… (Enter to send, Shift+Enter for a new line)"
                  className="max-h-40 min-h-[3rem] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex flex-col gap-1.5">
                  <button type="button" onClick={() => void sendReply(false)} disabled={busy || !reply.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40">
                    <SendHorizontal className="h-4 w-4" aria-hidden /> Send
                  </button>
                  {selected.status === "open"
                    ? <button type="button" onClick={() => void sendReply(true)} disabled={busy || !reply.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"><XCircle className="h-4 w-4" aria-hidden /> Send & close</button>
                    : <button type="button" onClick={reopen} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:border-accent hover:text-accent" title="Visitors reopen the thread by writing again"><RotateCcw className="h-4 w-4" aria-hidden /> Reopen</button>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
