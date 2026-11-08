import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, X } from "lucide-react";
import { getAdminApi } from "@/api";
import type { ChatMode } from "@/api/types";
import ChatPanel from "@/components/chat/ChatPanel";
import { cn } from "@/lib/utils";

/**
 * Storefront live-chat bubble — the single public entry point to the WOODEX
 * inbox (V4 P0). Self-hosted: no third-party scripts. Rendered once in App.tsx,
 * never on /admin or /lab routes. Mode comes from the demo-backed settings
 * store (Settings → Storefront live chat): "off" hides the bubble entirely;
 * "offline" (default) opens the capture card; "live" opens the composer.
 */
export default function ChatBubble() {
  const location = useLocation();
  const [mode, setMode] = useState<ChatMode | null>(null);
  const [open, setOpen] = useState(false);
  const [unseen, setUnseen] = useState(0);

  const hiddenForRoute = location.pathname.startsWith("/admin") || location.pathname.startsWith("/lab");

  useEffect(() => {
    let alive = true;
    getAdminApi().getChatMode()
      .then((m) => { if (alive) setMode(m); })
      .catch(() => { if (alive) setMode("offline"); });
    return () => { alive = false; };
  }, [location.pathname]);

  // close the panel on route change (it would float over unrelated screens)
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const handleUnseen = useCallback((n: number) => setUnseen(n), []);

  if (hiddenForRoute || mode === "off" || mode === null) return null;

  return (
    <div className="fixed bottom-5 right-4 z-40 sm:bottom-6 sm:right-6">
      <ChatPanel open={open} onClose={() => setOpen(false)} onUnseen={handleUnseen} mode={mode} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="woodex-chat-panel"
        aria-label={open ? "Close live chat" : unseen > 0 ? `Open live chat — ${unseen} new message${unseen === 1 ? "" : "s"}` : "Open live chat"}
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "motion-reduce:transition-none",
        )}
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <MessageCircle className="h-6 w-6" aria-hidden />}
        {unseen > 0 && !open && (
          <span aria-hidden className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white ring-2 ring-background">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>
    </div>
  );
}
