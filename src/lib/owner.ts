/** UI-only permissions. Supabase RPCs/RLS independently enforce authorization;
 * browser state is never a security boundary. */
import { useEffect, useState } from "react";
import { isDemoMode, isSupabaseConfigured, isSupabaseMode } from "@/config/env";

function useServerPermission(kind: "publish" | "settings"): { allowed: boolean; checking: boolean } {
  const fallback = kind === "publish" ? isDemoMode : !isSupabaseMode;
  const [state, setState] = useState({ allowed: fallback, checking: isSupabaseMode && isSupabaseConfigured });

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
          setState({ allowed: false, checking: true });
          // Do not await another Supabase call inside onAuthStateChange's callback.
          setTimeout(() => { void (async () => {
            try {
              const { data, error } = await supabase.auth.getSession();
              if (error || !data.session) {
                if (active && request === generation) setState({ allowed: false, checking: false });
                return;
              }
              const result = kind === "publish"
                ? await supabase.rpc("has_cap", { need: "page.manage" })
                : await supabase.rpc("has_role", { need: "owner" });
              if (active && request === generation) setState({ allowed: !result.error && result.data === true, checking: false });
            } catch {
              if (active && request === generation) setState({ allowed: false, checking: false });
            }
          })(); }, 0);
        };
        const { data: { subscription } } = supabase.auth.onAuthStateChange(refresh);
        unsubscribe = () => subscription.unsubscribe();
        refresh();
      } catch {
        if (active) setState({ allowed: false, checking: false });
      }
    })();
    return () => { active = false; generation += 1; unsubscribe(); };
  }, [kind]);
  return state;
}

/** Demo publishing keeps its preview gate; Bagisto remains unsupported. */
export function usePagePublishPermission(): { canPublish: boolean; checking: boolean } {
  const { allowed, checking } = useServerPermission("publish");
  return { canPublish: allowed, checking };
}

/** Owner-only in Supabase; the database remains authoritative on writes. */
export function useSettingsManagePermission(): { canManage: boolean; checking: boolean } {
  const { allowed, checking } = useServerPermission("settings");
  return { canManage: allowed, checking };
}
