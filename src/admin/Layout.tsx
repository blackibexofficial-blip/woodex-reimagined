import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, NavLink } from "react-router-dom";
import {
  Armchair, LayoutDashboard, BarChart3, Package, Tags, ShoppingCart, Users, ClipboardList, FileText,
  Image, Settings, LogOut, ArrowLeft, Menu, X, Store, Warehouse, LayoutGrid, BadgePercent, Boxes, RadioTower, ListChecks, Palette, Briefcase, Newspaper, Wrench, Undo2, ArrowLeftRight, ShieldCheck, FileEdit, ScrollText, Truck, PackagePlus, SlidersHorizontal,
} from "lucide-react";
import { useAdminAuth } from "@/admin/auth";
import { isDemoMode } from "@/config/env";
import { cn } from "@/lib/utils";

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  {
    label: "Overview",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Commerce",
    items: [
      { to: "/admin/products", label: "Products", icon: Package },
      { to: "/admin/categories", label: "Categories", icon: Tags },
      { to: "/admin/collections", label: "Collections", icon: LayoutGrid },
      { to: "/admin/materials", label: "Materials & Colors", icon: Palette },
      { to: "/admin/options", label: "Options", icon: SlidersHorizontal },
      { to: "/admin/projects", label: "Projects", icon: Briefcase },
      { to: "/admin/price-lists", label: "Price Lists", icon: BadgePercent },
      { to: "/admin/bundles", label: "Bundles", icon: Boxes },
      { to: "/admin/sales-channels", label: "Channels & Markets", icon: RadioTower },
      { to: "/admin/bulk-editor", label: "Bulk Editor", icon: ListChecks },
      { to: "/admin/inventory", label: "Inventory", icon: Warehouse },
      { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
      { to: "/admin/drafts", label: "Drafts", icon: FileEdit },
      { to: "/admin/quotes", label: "Quotes", icon: ScrollText },
      { to: "/admin/returns", label: "Returns", icon: Undo2 },
      { to: "/admin/exchanges", label: "Exchanges", icon: ArrowLeftRight },
      { to: "/admin/claims", label: "Claims", icon: ShieldCheck },
      { to: "/admin/customers", label: "Customers", icon: Users },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { to: "/admin/suppliers", label: "Suppliers", icon: Truck },
      { to: "/admin/purchase-orders", label: "Purchase Orders", icon: PackagePlus },
      { to: "/admin/transfers", label: "Transfers", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Engage",
    items: [
      { to: "/admin/leads", label: "Leads", icon: ClipboardList },
      { to: "/admin/blog", label: "Blog", icon: Newspaper },
      { to: "/admin/services", label: "Services", icon: Wrench },
      { to: "/admin/content", label: "Content", icon: FileText },
      { to: "/admin/media", label: "Media", icon: Image },
    ],
  },
  { label: "System", items: [{ to: "/admin/settings", label: "Settings", icon: Settings }] },
];

function pageTitle(pathname: string) {
  const seg = pathname.split("/")[2] ?? "dashboard";
  const map: Record<string, string> = {
    dashboard: "Dashboard", analytics: "Analytics", products: "Products", categories: "Categories",
    orders: "Orders", customers: "Customers", leads: "Leads", quotes: "Quotes", suppliers: "Suppliers", "purchase-orders": "Purchase Orders", transfers: "Transfers", options: "Product Options", content: "Content",
    media: "Media Library", settings: "Settings", inventory: "Inventory & Delivery Zones",
  };
  return map[seg] ?? "Admin";
}

export default function AdminLayout() {
  const { user, logout } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

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
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon }) => (
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
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden lg:block">{sidebar}</aside>

      {/* mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} aria-label="Close menu" />
          <aside className="absolute inset-y-0 left-0 shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-72">
        {/* topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-2 text-muted-foreground hover:bg-muted" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-semibold text-foreground sm:text-base">{pageTitle(location.pathname)}</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-xs text-muted-foreground md:inline">{today}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                isDemoMode ? "border-border bg-secondary text-muted-foreground" : "border-hon-green-pale bg-hon-green-pale text-hon-green-dark",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", isDemoMode ? "bg-muted-foreground" : "bg-hon-green")} />
              {isDemoMode ? "Demo data" : "Bagisto live"}
            </span>
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}


