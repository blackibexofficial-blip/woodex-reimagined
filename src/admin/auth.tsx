/**
 * Demo admin authentication.
 *
 * This is a PREVIEW GATE, not a security boundary: it keeps the demo admin behind a
 * login screen with credentials from VITE_ADMIN_EMAIL / VITE_ADMIN_PASSWORD
 * (defaults documented in README). Real RBAC, 2FA and audit logs are provided by the
 * Laravel/Bagisto backend (see docs/07-admin-integration).
 */
import { createContext, useContext, useEffect, useState } from "react";
import { config, isDemoMode, isSupabaseConfigured } from "@/config/env";
import { supabase } from "@/integrations/supabase/client";

export interface AdminUser { email: string; name: string; signedInAt: string }

interface AdminAuthContextValue {
  user: AdminUser | null;
  isDemoMode: boolean;
  /** True when VITE_SUPABASE_URL + publishable key are set — enables real Supabase Auth sign-in. */
  supabaseEnabled: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  /** Signs in against the configured Supabase project. Falls back cleanly when unreachable. */
  loginWithSupabase: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(() => {
    try {
      const raw = localStorage.getItem(config.admin.sessionKey);
      return raw ? (JSON.parse(raw) as AdminUser) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (!user) localStorage.removeItem(config.admin.sessionKey);
  }, [user]);

  const login: AdminAuthContextValue["login"] = async (email, password) => {
    await new Promise((r) => setTimeout(r, 650)); // simulate a backend round-trip
    // Demo gate only: tolerate leading/trailing whitespace on the password —
    // mobile keyboards and paste-ins commonly introduce a stray trailing space.
    const ok =
      email.trim().toLowerCase() === config.admin.email.toLowerCase() &&
      password.trim() === config.admin.password;
    if (!ok) return { ok: false, error: "Invalid credentials. Check the demo credentials hint below." };
    const next: AdminUser = { email: email.trim().toLowerCase(), name: "WOODEX Admin", signedInAt: new Date().toISOString() };
    localStorage.setItem(config.admin.sessionKey, JSON.stringify(next));
    setUser(next);
    return { ok: true };
  };

  const loginWithSupabase: AdminAuthContextValue["loginWithSupabase"] = async (email, password) => {
    const trimmed = email.trim();
    if (!trimmed || !password) return { ok: false, error: "Enter your email and password." };
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
      if (error) {
        const raw = error.message ?? "";
        // Only credential rejections are user-fixable; anything else (network down,
        // project misconfigured, logins disabled, DNS, TLS) maps to the same
        // actionable hint: the demo gate. Never leak raw backend internals.
        const msg = /invalid login|invalid email|invalid credentials/i.test(raw)
          ? "Invalid email or password for this Supabase project."
          : "Supabase is unreachable from this network. Check the project URL / connection — or use the demo gate.";
        return { ok: false, error: msg };
      }
      const next: AdminUser = {
        email: trimmed.toLowerCase(),
        name: (data.user?.user_metadata?.full_name as string | undefined) ?? trimmed.split("@")[0],
        signedInAt: new Date().toISOString(),
      };
      localStorage.setItem(config.admin.sessionKey, JSON.stringify(next));
      setUser(next);
      return { ok: true };
    } catch (e) {
      console.error("[woodex admin] Supabase sign-in failed:", e);
      return { ok: false, error: "Supabase is unreachable from this network. Check the project URL / your connection, or use the demo gate." };
    }
  };

  const logout = () => {
    localStorage.removeItem(config.admin.sessionKey);
    setUser(null);
    // Best effort — clears any live Supabase session too.
    supabase.auth.signOut().catch(() => undefined);
  };

  return (
    <AdminAuthContext.Provider value={{ user, isDemoMode, supabaseEnabled: isSupabaseConfigured, login, loginWithSupabase, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside <AdminAuthProvider>");
  return ctx;
};
