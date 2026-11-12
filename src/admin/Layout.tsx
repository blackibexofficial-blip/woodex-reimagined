import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, NavLink } from "react-router-dom";
import { Armchair, ChevronDown, Menu, X, LogOut, ArrowLeft, Store } from "lucide-react";
import { useAdminAuth } from "@/admin/auth";
import { isDemoMode, isSupabaseConfigured } from "@/config/env";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAdminApi } from "@/api";
import NotificationBell from "@/admin/components/layout/NotificationBell";
import { NAV_GROUPS, findActiveGroup } from "@/admin/nav-registry";
import CommandPalette from "@/admin/components/layout/CommandPalette";

function pageTitle(pathname: string) {
  const seg = pathname.split("/")[2] ?? "dashboard";
  const map: Record<string, string> = {
    taxonomy: "Taxonomy", dashboard: "Dashboard", analytics: "Analytics", chat: "Live Chat — Storefront Inbox", products: "Products", categories: "Categories",
    invoices: "Invoices & Payments",
    tasks: "Tasks & Follow-ups",
    campaigns: "Campaigns",
    "client-merge": "CRM merge review", clients: "Clients",
    orders: "Orders", customers: "Customers", leads: "Leads", quotes: "Quotes", suppliers: "Suppliers", "purchase-orders": "Purchase Orders", transfers: "Transfers", options: "Product Options", content: "Content", warranty: "Warranty Content", pages: "Pages", showrooms: "Showrooms", "custom-design": "Custom Design Content", "virtual-showroom": "Virtual Showroom Content",
    media: "Media Library", settings: "Settings", import: "Import data", inventory: "Inventory & Delivery Zones", series: "Furniture Series", brands: "Product Brands", homepage: "Homepage Sections",
  };
  return map[seg] ?? "Admin";
}

export default function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatBadge, setChatBadge] = useState(0);
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem("woodex.admin.navOpen");
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
      }
    } catch { /* default */ }
    return ["Overview"];
  });

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  /* Auto-open the group owning the active route (never force-closes what the user opened). */
  useEffect(() => {
    const active = findActiveGroup(location.pathname);
    if (!active) return;
    setOpenGroups((prev) => (prev.includes(active.label) ? prev : [...prev, active.label]));
  }, [location.pathname]);

  const toggleGroup = (label: string) => setOpenGroups((prev) => {
    const next = prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label];
    try { window.localStorage.setItem("woodex.admin.navOpen", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  useEffect(() => {
    let alive = true;
    const load = () => {
      getAdminApi().countOpenChats().then((n) => { if (alive) setChatBadge(n); }).catch(() => { if (alive) setChatBadge(0); });
    };
    load();
    const t = window.setInterval(load, 15000);
    return () => { alive = false; window.clearInterval(t); };
  }, [location.pathname]);

  if (!user) return <Navigate to="/admin/login" state={{ from: location }} replace />;

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const sidebar = (
    <div className="flex h-full w-72 flex-col border-r border-border bg-background text-foreground">
      {/* brand */}
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <Link to="/admin/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Armchair className="h-5 w-5" />
          </div>
          <span className="leading-tight">
            <span className="block text-lg font-black tracking-tight text-foreground">WOODEX</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.28em] text-accent">Admin Panel</span>
          </span>
        </Link>
        <button className="lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* nav */}
      <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const open = openGroups.includes(group.label);
          const panelId = `nav-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          return (
          <div key={group.label} className="mb-2">
            <button
              type="button"
              onClick={() => toggleGroup(group.label)}
              aria-expanded={open}
              aria-controls={panelId}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <span>{group.label}</span>
              <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform duration-200", open ? "rotate-0" : "-rotate-90")} />
            </button>
            <ul id={panelId} hidden={!open} className="mt-1 space-y-0.5">
              {group.items.map((item) => {
                const { to, label, icon: Icon } = item;
                const badge = to === "/admin/chat" && chatBadge > 0 ? chatBadge : undefined;
                return (
                  <li key={to}>
                    <NavLink
                      to={to}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                          isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                      {badge !== undefined && (
                        <span aria-hidden className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                      {badge !== undefined && <span className="sr-only">{` ${badge > 9 ? "9+" : badge} unread messages`}</span>}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </nav>

      {/* footer */}
      <div className="border-t border-border p-3">
        <Link to="/" className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-accent">
          <ArrowLeft className="h-3.5 w-3.5" /> View live storefront
        </Link>
        <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-hon-green-pale text-xs font-bold text-hon-green-dark">
            {user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
          <button
            onClick={() => { logout(); navigate("/admin/login", { replace: true }); }}
            title="Sign out" aria-label="Sign out"
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-background hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary text-foreground">
      {/* desktop sidebar */}
      <aside aria-label="Admin sidebar" className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</aside>

      {/* mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />
          <aside aria-label="Admin sidebar (mobile)" className="absolute inset-y-0 left-0 shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-72">
        {/* topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-2 text-muted-foreground hover:bg-muted" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            {/* 2030 §4 topbar: breadcrumb (workspace context) + page title */}
            {(() => {
              const group = findActiveGroup(location.pathname);
              return (
                <nav aria-label="Breadcrumb">
                  <ol className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
                    <li><Link to="/admin/dashboard" className="hover:text-foreground">Admin</Link></li>
                    {group && (<><li aria-hidden="true" className="select-none">›</li><li>{group.label}</li></>)}
                    <li aria-hidden="true" className="select-none">›</li>
                    <li><h1 aria-current="page" className="text-sm font-semibold text-foreground sm:text-base">{pageTitle(location.pathname)}</h1></li>
                  </ol>
                </nav>
              );
            })()}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <CommandPalette />
            <span className="hidden text-xs text-muted-foreground md:inline">{today}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                isSupabaseConfigured
                  ? "border-hon-green-pale bg-hon-green-pale text-hon-green-dark"
                  : "border-border bg-secondary text-muted-foreground",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", isSupabaseConfigured ? "bg-hon-green" : "bg-muted-foreground")} />
              {isSupabaseConfigured ? "Supabase" : isDemoMode ? "Demo data" : "Bagisto live"}
            </span>
            <NotificationBell />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:border-accent hover:text-hon-green-dark"
            >
              <Store className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">View store</span>
            </Link>
          </div>
        </header>

        <main className="p-4 sm:p-6">
          {!isSupabaseConfigured && (
            <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs leading-relaxed text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>Demo mode — not connected to Supabase.</strong> Everything below runs on bundled sample
                data; changes stay in this browser session and are <em>not</em> the live WOODEX store. Staging
                Supabase + capability-checked RPCs land next; until then nothing here is production.
              </span>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}


