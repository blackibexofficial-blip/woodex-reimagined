import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { CheckCircle2, ChevronDown, MessageCircle, SendHorizontal, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { ChatMessage, ChatMode } from "@/api/types";
import { buildConsent } from "@/lib/consent";
import { waLink } from "@/config/site";
import {
  CHAT_POLL_MS,
  CHAT_QUICK_PROMPTS,
  CHAT_SEEN_KEY,
  CHAT_THREAD_KEY,
  isPkPhone,
  relativeTime,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { LeadConsent } from "@/components/LeadConsent";
import { LeadSubmissionWarning } from "@/components/LeadSubmissionWarning";
import { unconfirmedLeadDetail, useLeadSubmissionGuard } from "@/lib/lead-submission";
import { getTurnstileToken } from "@/lib/turnstile";
import { CHAT_MESSAGE_LIMIT } from "@/lib/lead-content";

const WA_FALLBACK = waLink("Salam! I was on the WOODEX site and I'd like to talk to your team.");

type Props = {
  open: boolean;
  onClose: () => void;
  onUnseen: (count: number) => void;
  mode: ChatMode;
};

/**
 * Storefront chat panel — two honest modes, no fake presence:
 *  · live    → visitor ↔ agent thread over a 3 s visibility-gated poll (demo store).
 *  · offline → capture form (name · PK phone · message · consent) ⇒ creates a lead.
 * Default mode is "offline" (see Settings → Storefront live chat) — agents go "live"
 * only when the team is staffing the inbox.
 */
export default function ChatPanel({ open, onClose, onUnseen, mode }: Props) {
  const location = useLocation();
  const [conversationId, setConversationId] = useState<string | null>(() => {
    try { return sessionStorage.getItem(CHAT_THREAD_KEY); } catch { return null; }
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);

  // offline capture form
  const [capName, setCapName] = useState("");
  const [capPhone, setCapPhone] = useState("");
  const [capMessage, setCapMessage] = useState("");
  const [capConsent, setCapConsent] = useState(false);
  const [capErrors, setCapErrors] = useState<Record<string, string>>({});
  const capture = useLeadSubmissionGuard();
  const [capturedLead, setCapturedLead] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  const applyThread = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
    if (!open) {
      let seenAt = 0;
      try { seenAt = Date.parse(sessionStorage.getItem(CHAT_SEEN_KEY) ?? "") || 0; } catch { /* ignore */ }
      onUnseen(msgs.filter((m) => m.role === "agent" && Date.parse(m.createdAt) > seenAt).length);
    }
  }, [open, onUnseen]);

  const refresh = useCallback(async (): Promise<ChatMessage[] | null> => {
    if (!conversationId) return null;
    try {
      const res = await getAdminApi().getChatConversation(conversationId);
      if (!res) return null;
      applyThread(res.messages);
      return res.messages;
    } catch {
      return null; // never wedge the storefront on a transient read error
    }
  }, [conversationId, applyThread]);

  // initial load + poll (bounded: only while tab is visible)
  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, CHAT_POLL_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  // opening the panel marks agent messages as seen
  useEffect(() => {
    if (open) {
      try { sessionStorage.setItem(CHAT_SEEN_KEY, new Date().toISOString()); } catch { /* ignore */ }
      onUnseen(0);
    }
  }, [open, messages.length, onUnseen]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, open]);

  const rememberThread = (id: string) => {
    setConversationId(id);
    try { sessionStorage.setItem(CHAT_THREAD_KEY, id); } catch { /* ignore */ }
  };

  const sendLive = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (!consent) { toast.error("Please tick the consent box first — we store your message securely."); return; }
    setSending(true);
    try {
      const { conversation, message } = await getAdminApi().postChatVisitorMessage(conversationId ?? undefined, {
        body,
        page: location.pathname,
      });
      rememberThread(conversation.id);
      setMessages((m) => [...m, message]);
      setDraft("");
    } catch (err) {
      console.error("chat send failed:", err);
      toast.error("Could not send your message — please try WhatsApp instead.");
    } finally {
      setSending(false);
    }
  };

  const submitCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (capName.trim().length < 2) errs.name = "Please tell us your name.";
    if (!isPkPhone(capPhone)) errs.phone = "Enter a valid PK mobile/landline, e.g. 0300 1234567.";
    if (capMessage.trim().length < 4) errs.message = "A few words about what you need, please.";
    else if (capMessage.length > CHAT_MESSAGE_LIMIT) errs.message = `Please keep your request to ${CHAT_MESSAGE_LIMIT} characters or fewer.`;
    if (!capConsent) errs.consent = "Tick the consent box so we can call you back.";
    setCapErrors(errs);
    if (Object.keys(errs).length > 0 || !capture.begin()) return;
    const name = capName.trim();
    const phone = capPhone.trim();
    const message = capMessage.trim();
    let cfTurnstileToken: string | undefined;
    try {
      cfTurnstileToken = (await getTurnstileToken("lead")) ?? undefined;
    } catch (err) {
      console.error("Turnstile challenge failed:", err);
      toast.error("Verification didn't load — check your connection and try again.");
      capture.verificationFailed();
      return;
    }
    try {
      const { conversation, leadId, submissionOutcome } = await getAdminApi().captureChatOffline({
        name,
        phone,
        message,
        consent: true,
        consentVersion: buildConsent().consentVersion,
        page: location.pathname,
        cfTurnstileToken,
      });
      const detail = unconfirmedLeadDetail(submissionOutcome);
      if (detail) {
        capture.unconfirmed(detail);
        toast.error("We couldn't confirm your enquiry. Please check with us before sending it again.");
        return;
      }
      capture.success();
      rememberThread(conversation.id);
      setMessages((m) => [
        // mirror the stored visitor message locally so the thread is complete
        ...m,
        { id: `local-${Date.now()}`, conversationId: conversation.id, role: "visitor", body: message, createdAt: new Date().toISOString() },
      ]);
      setCapturedLead(leadId);
    } catch (err) {
      console.error("chat capture outcome could not be confirmed:", err);
      capture.unconfirmed(null);
      toast.error("We couldn't confirm your enquiry. Please check with us before sending it again.");
    }
  };

  if (!open) return null;

  return (
    <div
      id="woodex-chat-panel"
      role="dialog"
      aria-modal="false"
      aria-label="WOODEX live chat"
      className="absolute bottom-[4.5rem] right-0 flex h-[min(78vh,30rem)] w-[min(94vw,23.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
    >
      {/* header */}
      <div className="flex items-center gap-3 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground" aria-hidden>
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-bold">WOODEX — Live chat</p>
          <p className="text-[11px] text-primary-foreground/80">
            {mode === "live" ? "Online — we typically reply in minutes" : "Away — leave your number, we'll call back"}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close chat" className="rounded-md p-1.5 text-primary-foreground/80 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground">
          <ChevronDown className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* thread log */}
      <div ref={listRef} role="log" aria-live="polite" aria-label="Conversation" className="flex-1 space-y-3 overflow-y-auto bg-secondary/40 px-3 py-3">
        {messages.length === 0 && (
          <div className="rounded-xl border border-border bg-background p-3 text-[13px] leading-snug text-foreground shadow-sm">
            <p className="font-semibold">Salam! 👋</p>
            <p className="mt-1 text-muted-foreground">Ask about stock, a quotation, or visiting our showroom.</p>
            {mode !== "live" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CHAT_QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCapMessage((m) => (m ? m : q.message))}
                    className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.role === "visitor" ? "items-end" : "items-start")}>
            <div className={cn(
              "max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm",
              m.role === "visitor" ? "rounded-br-md bg-accent text-accent-foreground" : "rounded-bl-md border border-border bg-background text-foreground",
            )}>
              {m.body}
            </div>
            <span className="mt-0.5 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {m.role === "visitor" ? "You" : "WOODEX team"} · {relativeTime(m.createdAt)}
            </span>
          </div>
        ))}
      </div>

      {/* composer / capture */}
      {capturedLead ? (
        <div className="border-t border-border bg-background p-4 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" aria-hidden />
          <p className="mt-2 text-sm font-bold text-foreground">Team WOODEX will call you back.</p>
          <p className="mt-0.5 text-xs text-muted-foreground">We usually respond within the working hour (Mon–Sat, 10am–8pm).</p>
          <a href={WA_FALLBACK} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#0b3b1e] transition-colors hover:bg-[#1fb857]">
            WhatsApp us instead
          </a>
          <div className="mt-2">
            <button type="button" onClick={onClose} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline">Back to browsing</button>
          </div>
        </div>
      ) : mode === "live" ? (
        <div className="border-t border-border bg-background p-3">
          <LeadConsent checked={consent} onChange={setConsent} className="mb-1.5" />
          <div className="flex items-end gap-2">
            <label htmlFor="chat-draft" className="sr-only">Type your message</label>
            <textarea
              id="chat-draft"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendLive(); } }}
              placeholder="Type your message…"
              className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="button" onClick={() => void sendLive()} disabled={sending || !draft.trim()} aria-label="Send message" className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40">
              <SendHorizontal className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submitCapture} className="max-h-[16rem] overflow-y-auto border-t border-border bg-background p-3" noValidate>
          <fieldset disabled={capture.busy} className="min-w-0">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-foreground"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> Leave your details — we call back within the hour</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="chat-cap-name" className="sr-only">Your name</label>
              <input id="chat-cap-name" value={capName} onChange={(e) => setCapName(e.target.value)} maxLength={160} placeholder="Name" autoComplete="name" aria-invalid={!!capErrors.name} className={cn("h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", capErrors.name ? "border-destructive" : "border-input")} />
              {capErrors.name && <p className="mt-0.5 text-[10px] text-destructive">{capErrors.name}</p>}
            </div>
            <div>
              <label htmlFor="chat-cap-phone" className="sr-only">Phone number</label>
              <input id="chat-cap-phone" type="tel" inputMode="tel" value={capPhone} onChange={(e) => setCapPhone(e.target.value)} maxLength={40} placeholder="0300 1234567" autoComplete="tel" aria-invalid={!!capErrors.phone} className={cn("h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", capErrors.phone ? "border-destructive" : "border-input")} />
              {capErrors.phone && <p className="mt-0.5 text-[10px] text-destructive">{capErrors.phone}</p>}
            </div>
          </div>
          <label htmlFor="chat-cap-message" className="sr-only">What do you need?</label>
          <textarea id="chat-cap-message" value={capMessage} onChange={(e) => setCapMessage(e.target.value)} maxLength={CHAT_MESSAGE_LIMIT} placeholder="What do you need? e.g. 12 Z-Lift chairs for Gulberg office" rows={2} aria-invalid={!!capErrors.message} className={cn("mt-2 w-full resize-none rounded-md border bg-background px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring", capErrors.message ? "border-destructive" : "border-input")} />
          {capErrors.message && <p className="-mt-1 text-[10px] text-destructive">{capErrors.message}</p>}
          <p className="text-[10px] text-muted-foreground">Up to {CHAT_MESSAGE_LIMIT} characters. Please don't include sensitive information.</p>
          <LeadConsent checked={capConsent} onChange={setCapConsent} className="mt-1.5" />
          {capErrors.consent && <p className="mt-0.5 text-[10px] text-destructive">{capErrors.consent}</p>}
          {capture.unknown && <div className="mt-2"><LeadSubmissionWarning detail={capture.detail} acknowledged={capture.acknowledged} onAcknowledge={capture.acknowledge} /></div>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <a href={WA_FALLBACK} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">Or WhatsApp →</a>
            <button type="submit" disabled={capture.busy || capture.blocked} className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-50">
              {capture.busy ? "Sending…" : "Request callback"}
            </button>
          </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
