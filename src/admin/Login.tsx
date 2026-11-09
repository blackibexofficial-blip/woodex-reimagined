import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Armchair, ArrowLeft, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAdminAuth } from "@/admin/auth";
import { config, isSupabaseMode } from "@/config/env";

export default function AdminLogin() {
  const { login, loginWithSupabase, supabaseEnabled } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/admin/dashboard";

  const [mode, setMode] = useState<"demo" | "supabase">(isSupabaseMode ? "supabase" : "demo");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = mode === "supabase" ? await loginWithSupabase(email, password) : await login(email, password);
    setLoading(false);
    if (result.ok) {
      toast.success(mode === "supabase" ? "Signed in with Supabase — welcome back." : "Welcome back — signed in to WOODEX admin.");
      navigate(from, { replace: true });
    } else {
      setError(result.error ?? "Sign-in failed");
    }
  };

  const inputClass =
    "w-full rounded-lg border border-input bg-background py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent";

  return (
    <main className="flex min-h-screen bg-secondary">
      {/* brand panel — dark, on-brand (mirrors the storefront's dark hero language) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(98,153,36,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(75,121,21,0.4),transparent_55%)]" />
        <Link to="/" className="relative inline-flex items-center gap-2 text-sm text-utility-text transition hover:text-hon-green-light">
          <ArrowLeft className="h-4 w-4" /> Back to storefront
        </Link>
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Armchair className="h-6 w-6" />
            </div>
            <div>
              <p className="text-3xl font-black tracking-tight">WOODEX</p>
              <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-hon-green-light">Admin Panel</p>
            </div>
          </div>
          <h1 className="mt-10 text-4xl font-bold leading-tight">
            Run the entire<br />furniture business<br /><span className="text-hon-green-light">from one place.</span>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-6 text-utility-text">
            Catalogue, orders, customers, quote requests, B2B pipeline and store settings —
            synced with Bagisto on your server, or the built-in demo dataset in previews.
          </p>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-utility-text">
          <ShieldCheck className="h-4 w-4 text-hon-green-light" />
          {isSupabaseMode ? "Supabase sign-in; server-side permissions remain authoritative." : "Demo gate or Supabase Auth — the demo gate is not a security boundary."}
        </div>
      </div>

      {/* form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Armchair className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-black text-foreground">WOODEX <span className="text-accent">ADMIN</span></p>
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-foreground">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "supabase" ? "Authenticate against your Supabase project (VITE_SUPABASE_*)." : "Use your admin credentials to continue."}
          </p>

          {supabaseEnabled && !isSupabaseMode && (
            <div className="mt-4 grid grid-cols-2 rounded-lg border border-border bg-muted p-1 text-xs font-semibold" role="tablist" aria-label="Sign-in method">
              <button
                role="tab"
                aria-selected={mode === "demo"}
                onClick={() => { setMode("demo"); setError(null); }}
                className={`rounded-md px-3 py-2 transition ${mode === "demo" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Demo gate
              </button>
              <button
                role="tab"
                aria-selected={mode === "supabase"}
                onClick={() => { setMode("supabase"); setError(null); }}
                className={`rounded-md px-3 py-2 transition ${mode === "supabase" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Supabase Auth
              </button>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="admin-email" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inputClass} pl-10 pr-4`}
                  placeholder="admin@woodex.pk"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pl-10 pr-12`}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-hon-green-dark disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in…" : mode === "supabase" ? "Sign in with Supabase" : "Sign in to admin"}
            </button>
          </form>

          {mode === "demo" ? (
            config.admin.showDemoHint ? (
            <div className="mt-6 rounded-lg border border-border bg-muted p-4 text-xs text-muted-foreground">
              <p className="font-semibold uppercase tracking-wide text-hon-green-dark">Demo credentials</p>
              <p className="mt-1.5">Email: <span className="font-mono text-foreground">{config.admin.email}</span></p>
              <p>Password: <span className="font-mono text-foreground">{config.admin.password}</span></p>
              <p className="mt-2">QC seat: <span className="font-mono text-foreground">{config.admin.qcEmail}</span> / <span className="font-mono text-foreground">{config.admin.qcPassword}</span></p>
              <p className="mt-1">QC must be recorded by someone other than the person who last changed the production stages, so the demo ships two logins.</p>
            </div>
            ) : (
              <div className="mt-6 rounded-lg border border-border bg-muted p-4 text-xs leading-5 text-muted-foreground">
                <p className="font-semibold uppercase tracking-wide text-hon-green-dark">Demo sign-in</p>
                <p className="mt-1.5">Credentials come from the build's <code className="font-mono text-foreground">VITE_ADMIN_EMAIL</code> / <code className="font-mono text-foreground">VITE_ADMIN_PASSWORD</code> environment variables (see README). They are not printed on this screen — set <code className="font-mono text-foreground">VITE_ADMIN_DEMO_HINT=1</code> locally to show them.</p>
              </div>
            )
          ) : (
            <div className="mt-6 rounded-lg border border-border bg-muted p-4 text-xs leading-5 text-muted-foreground">
              <p className="font-semibold uppercase tracking-wide text-hon-green-dark">Supabase Auth</p>
              <p className="mt-1.5">Use the admin account created for your project (see <code className="font-mono text-foreground">backend/supabase/README.md</code> → create-admin-user).</p>
              {!supabaseEnabled && <p className="mt-1.5 text-rose-600">Supabase keys are not set in this build.</p>}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
