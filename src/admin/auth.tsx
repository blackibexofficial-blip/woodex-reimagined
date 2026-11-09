/** Admin UI session state. Server-side Auth, capabilities and RLS remain the
 * security boundary; the local demo gate must never be used as production auth. */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { config, isDemoMode, isSupabaseConfigured, isSupabaseMode } from "@/config/env";
import { supabase } from "@/integrations/supabase/client";

export interface AdminUser { email: string; name: string; signedInAt: string }

interface AdminAuthContextValue {
  user: AdminUser | null;
  checking: boolean;
  isDemoMode: boolean;
  supabaseEnabled: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  loginWithSupabase: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(() => {
    // A demo/localStorage identity is never accepted in Supabase mode.
    if (isSupabaseMode) return null;
    try {
      const raw = localStorage.getItem(config.admin.sessionKey);
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch { return null; }
  });
  const [checking, setChecking] = useState(isSupabaseMode && isSupabaseConfigured);
  const generation = useRef(0);
  const verifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isSupabaseMode && !user) localStorage.removeItem(config.admin.sessionKey);
  }, [user]);

  useEffect(() => {
    if (!isSupabaseMode) return;
    // Do not consume the legacy demo identity in Supabase mode.
    localStorage.removeItem(config.admin.sessionKey);
    if (!isSupabaseConfigured) { setUser(null); setChecking(false); return; }
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const request = ++generation.current;
      if (!session?.access_token) { verifiedUserId.current = null; setUser(null); setChecking(false); return; }
      // Same-user reauthentication/refresh should not tear down an editor with
      // unsaved work. The DB remains authoritative while the token is checked;
      // failure closes the UI. Initial sessions and account changes must wait.
      const keepUi = (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && verifiedUserId.current !== null && verifiedUserId.current === session.user?.id;
      if (!keepUi) { verifiedUserId.current = null; setUser(null); setChecking(true); }
      // Supabase auth callbacks hold a lock. Do not await another auth call inside
      // the callback; verify the token with Auth after the callback has returned.
      setTimeout(() => { void (async () => {
        try {
          const { data, error } = await supabase.auth.getUser(session.access_token);
          if (!active || request !== generation.current) return;
          if (error || !data.user || data.user.id !== session.user?.id) { verifiedUserId.current = null; setUser(null); setChecking(false); return; }
          const email = data.user.email ?? "";
          const fullName = data.user.user_metadata?.full_name;
          verifiedUserId.current = data.user.id;
          setUser({ email, name: typeof fullName === "string" && fullName.trim() ? fullName : (email.split("@")[0] || "Staff"), signedInAt: new Date().toISOString() });
          setChecking(false);
        } catch {
          if (active && request === generation.current) { verifiedUserId.current = null; setUser(null); setChecking(false); }
        }
      })(); }, 0);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const login: AdminAuthContextValue["login"] = async (email, password) => {
    if (isSupabaseMode) return { ok: false, error: "Demo sign-in is disabled in Supabase mode." };
    await new Promise((r) => setTimeout(r, 650));
    const typed = email.trim().toLowerCase();
    const entered = password.trim();
    // Two demo seats: production/edit and QC. Separation of duties means the person
    // who last moved the stages cannot sign off, so the demo has to offer someone else.
    const account =
      typed === config.admin.email.toLowerCase() && entered === config.admin.password
        ? { email: typed, name: "WOODEX Admin" }
        : typed === config.admin.qcEmail.toLowerCase() && entered === config.admin.qcPassword
          ? { email: typed, name: "WOODEX QC" }
          : null;
    if (!account) return { ok: false, error: "Invalid credentials. Check the demo credentials hint below." };
    const next: AdminUser = { ...account, signedInAt: new Date().toISOString() };
    localStorage.setItem(config.admin.sessionKey, JSON.stringify(next));
    setUser(next);
    return { ok: true };
  };

  const loginWithSupabase: AdminAuthContextValue["loginWithSupabase"] = async (email, password) => {
    if (!isSupabaseConfigured) return { ok: false, error: "Supabase is not configured in this build." };
    const trimmed = email.trim();
    if (!trimmed || !password) return { ok: false, error: "Enter your email and password." };
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
      if (error) {
        const raw = error.message ?? "";
        const msg = /invalid login|invalid email|invalid credentials/i.test(raw)
          ? "Invalid email or password for this Supabase project."
          : `Supabase is unreachable from this network. Check the project URL / connection${isSupabaseMode ? "." : " — or use the demo gate."}`;
        return { ok: false, error: msg };
      }
      // Preserve the existing demo/static/Bagisto preview behavior. Supabase mode
      // waits for onAuthStateChange + getUser instead of trusting this UI identity.
      if (!isSupabaseMode && data.user) {
        const next: AdminUser = { email: trimmed.toLowerCase(), name: data.user.user_metadata?.full_name ?? trimmed.split("@")[0], signedInAt: new Date().toISOString() };
        localStorage.setItem(config.admin.sessionKey, JSON.stringify(next));
        setUser(next);
      }
      return { ok: true };
    } catch {
      return { ok: false, error: `Supabase is unreachable from this network. Check the project URL / connection${isSupabaseMode ? "." : " — or use the demo gate."}` };
    }
  };

  const logout = () => {
    generation.current++;
    verifiedUserId.current = null;
    localStorage.removeItem(config.admin.sessionKey);
    setUser(null);
    setChecking(false);
    // Local sign-out clears this browser's session even if the revocation request
    // fails. Server-side refresh-token revocation is best effort, not guaranteed.
    supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  };

  return (
    <AdminAuthContext.Provider value={{ user, checking, isDemoMode, supabaseEnabled: isSupabaseConfigured, login, loginWithSupabase, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside <AdminAuthProvider>");
  return ctx;
};
