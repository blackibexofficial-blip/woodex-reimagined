/**
 * UI-only publishing availability. Supabase's page RPCs enforce page.manage
 * independently; the browser result is never an authorization boundary.
 * Demo keeps its existing preview gate, and Bagisto remains unsupported.
 */
import { useEffect, useState } from "react";
import { isDemoMode, isSupabaseConfigured, isSupabaseMode } from "@/config/env";

export function usePagePublishPermission(): { canPublish: boolean; checking: boolean } {
  const [state, setState] = useState({ canPublish: isDemoMode, checking: isSupabaseMode && isSupabaseConfigured });

  useEffect(() => {
    if (!isSupabaseMode || !isSupabaseConfigured) return;
    let active = true;
    let generation = 0;
    let unsubscribe = () => {};
    void (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        if (!active) return;
        const refresh = () => {
          const request = ++generation;
          setState({ canPublish: false, checking: true });
          // Do not await another Supabase call inside onAuthStateChange's callback.
          setTimeout(() => { void (async () => {
            try {
              const { data, error } = await supabase.auth.getSession();
              if (error || !data.session) {
                if (active && request === generation) setState({ canPublish: false, checking: false });
                return;
              }
              const result = await supabase.rpc("has_cap", { need: "page.manage" });
              if (active && request === generation) setState({ canPublish: !result.error && result.data === true, checking: false });
            } catch {
              if (active && request === generation) setState({ canPublish: false, checking: false });
            }
          })(); }, 0);
        };
        const { data: { subscription } } = supabase.auth.onAuthStateChange(refresh);
        unsubscribe = () => subscription.unsubscribe();
        refresh();
      } catch {
        if (active) setState({ canPublish: false, checking: false });
      }
    })();
    return () => { active = false; generation += 1; unsubscribe(); };
  }, []);
  return state;
}
