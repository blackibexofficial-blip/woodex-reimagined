/**
 * WOODEX 2030 Phase 1 — canonical navigation registry.
 *
 * Single source of truth for the admin sidebar IA: stable route ids, the five
 * current groups, per-item keywords for search/command-palette use, and the
 * icons. `src/admin/Layout.tsx` renders from this file; `npm run test:nav`
 * (scripts/nav-registry-check.mjs) validates the registry against the route
 * table in `src/admin/AdminApp.tsx`.
 *
 * Scope guard (docs/2030/ADAPTATION-FIT-GAP.md): the IA is UNCHANGED from the
 * pre-2030 sidebar (5 groups / 36 destinations). Restructuring to the 2030
 * canonical IA (doc 05) is a Phase-2 decision that needs the owner's approval —
 * do not edit group membership here without it.
 *
 * Keywords power the 2030 §3 interaction rules ("Search across page title,
 * keywords and route aliases") — they are not rendered today.
 */
import type { ComponentType } from "react";
import {
  ContactRound, Receipt, ClipboardCheck, GitMerge, LayoutDashboard, BarChart3, Package, Tags, ShoppingCart, Users, ClipboardList, MessagesSquare, FileText,
  Image, Settings, Megaphone, Store, Warehouse, ListChecks, Briefcase, Newspaper, Wrench, Undo2, ArrowLeftRight, ShieldCheck, FileEdit, ScrollText, Truck, PackagePlus, LayoutTemplate, PenTool, Monitor, FileUp,
} from "lucide-react";

export interface NavEntry {
  /** Stable machine id — kebab-case, unique, never reused even if the route changes. */
  id: string;
  /** Route path (must exist in AdminApp.tsx route table). */
  to: string;
  /** Sidebar label. */
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** ≥2 search keywords/aliases (2030 §3). */
  keywords: string[];
}

export interface NavGroup {
  /** Stable machine id — kebab-case, unique. */
  id: string;
  label: string;
  items: NavEntry[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { id: "dashboard", to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: ["home", "overview", "kpis", "business snapshot"] },
      { id: "analytics", to: "/admin/analytics", label: "Analytics", icon: BarChart3, keywords: ["reports", "metrics", "charts", "sales reports"] },
    ],
  },
  {
    id: "commerce",
    label: "Commerce",
    items: [
      { id: "products", to: "/admin/products", label: "Products", icon: Package, keywords: ["catalogue", "catalog", "sku", "inventory items", "pricing"] },
      { id: "taxonomy", to: "/admin/taxonomy", label: "Taxonomy", icon: Tags, keywords: ["categories", "subcategories", "tags", "product taxonomy"] },
      { id: "homepage", to: "/admin/homepage", label: "Homepage", icon: LayoutTemplate, keywords: ["home page", "storefront homepage", "sections"] },
      { id: "showrooms", to: "/admin/showrooms", label: "Showrooms", icon: Store, keywords: ["locations", "store locations", "retail"] },
      { id: "projects", to: "/admin/projects", label: "Projects", icon: Briefcase, keywords: ["jobs", "fit out", "turnkey", "site projects"] },
      { id: "bulk-editor", to: "/admin/bulk-editor", label: "Bulk Editor", icon: ListChecks, keywords: ["bulk", "mass edit", "spreadsheet", "csv"] },
      { id: "inventory", to: "/admin/inventory", label: "Inventory", icon: Warehouse, keywords: ["stock", "warehouse", "zones", "delivery zones", "stock levels"] },
      { id: "orders", to: "/admin/orders", label: "Orders", icon: ShoppingCart, keywords: ["purchases", "order book", "fulfilment", "o2o"] },
      { id: "drafts", to: "/admin/drafts", label: "Drafts", icon: FileEdit, keywords: ["draft orders", "quotes to order", "pending"] },
      { id: "quotes", to: "/admin/quotes", label: "Quotes", icon: ScrollText, keywords: ["quotations", "estimates", "proposals", "quote pipeline"] },
      { id: "invoices", to: "/admin/invoices", label: "Invoices", icon: Receipt, keywords: ["billing", "payments", "accounts", "receivables"] },
      { id: "returns", to: "/admin/returns", label: "Returns", icon: Undo2, keywords: ["rma", "refund", "returns", "send back"] },
      { id: "exchanges", to: "/admin/exchanges", label: "Exchanges", icon: ArrowLeftRight, keywords: ["swap", "replacement", "exchange"] },
      { id: "claims", to: "/admin/claims", label: "Claims", icon: ShieldCheck, keywords: ["warranty", "complaints", "disputes", "claims"] },
      { id: "customers", to: "/admin/customers", label: "Customers", icon: Users, keywords: ["buyers", "customer list", "consumers"] },
      { id: "clients", to: "/admin/clients", label: "Clients", icon: ContactRound, keywords: ["crm", "accounts", "b2b", "client book"] },
      { id: "client-merge", to: "/admin/client-merge", label: "Merge review", icon: GitMerge, keywords: ["duplicates", "merge", "dedupe", "merge clients"] },
    ],
  },
  {
    id: "purchasing",
    label: "Purchasing",
    items: [
      { id: "suppliers", to: "/admin/suppliers", label: "Suppliers", icon: Truck, keywords: ["vendors", "supplier list", "sourcing"] },
      { id: "purchase-orders", to: "/admin/purchase-orders", label: "Purchase Orders", icon: PackagePlus, keywords: ["po", "purchasing", "procurement", "orders to suppliers"] },
      { id: "transfers", to: "/admin/transfers", label: "Transfers", icon: ArrowLeftRight, keywords: ["stock transfers", "warehouse moves", "branch transfer"] },
    ],
  },
  {
    id: "engage",
    label: "Engage",
    items: [
      { id: "leads", to: "/admin/leads", label: "Leads", icon: ClipboardList, keywords: ["enquiries", "inquiries", "prospects", "lead capture"] },
      { id: "chat", to: "/admin/chat", label: "Live Chat", icon: MessagesSquare, keywords: ["inbox", "conversations", "chat", "visitor messages"] },
      { id: "tasks", to: "/admin/tasks", label: "Tasks", icon: ClipboardCheck, keywords: ["todo", "follow ups", "reminders", "to-do"] },
      { id: "campaigns", to: "/admin/campaigns", label: "Campaigns", icon: Megaphone, keywords: ["marketing", "broadcast", "newsletter", "promotions"] },
      { id: "blog", to: "/admin/blog", label: "Blog", icon: Newspaper, keywords: ["posts", "articles", "journal", "content blog"] },
      { id: "services", to: "/admin/services", label: "Services", icon: Wrench, keywords: ["service pages", "offerings", "services"] },
      { id: "content", to: "/admin/content", label: "Content", icon: FileText, keywords: ["cms", "static content", "pages content"] },
      { id: "warranty", to: "/admin/warranty", label: "Warranty", icon: ShieldCheck, keywords: ["warranty page", "guarantee", "after sales"] },
      { id: "custom-design", to: "/admin/custom-design", label: "Custom Design", icon: PenTool, keywords: ["custom furniture", "design service", "bespoke"] },
      { id: "virtual-showroom", to: "/admin/virtual-showroom", label: "Virtual Showroom", icon: Monitor, keywords: ["ar", "virtual tour", "showroom tour", "3d"] },
      { id: "pages", to: "/admin/pages", label: "Pages", icon: FileText, keywords: ["page builder", "puck", "static pages", "landing pages"] },
      { id: "media", to: "/admin/media", label: "Media", icon: Image, keywords: ["images", "library", "assets", "gallery"] },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "import", to: "/admin/import", label: "Import data", icon: FileUp, keywords: ["import", "upload", "csv import", "lead import"] },
      { id: "settings", to: "/admin/settings", label: "Settings", icon: Settings, keywords: ["configuration", "preferences", "store settings", "admin settings"] },
    ],
  },
];

/** All 36 destinations, flattened, in sidebar order. */
export const NAV_FLAT = NAV_GROUPS.flatMap((g) => g.items);

/** Group (if any) owning the given pathname, for sidebar auto-open behaviour. */
export function findActiveGroup(pathname: string): NavGroup | undefined {
  return NAV_GROUPS.find((g) => g.items.some((i) => pathname === i.to || pathname.startsWith(i.to + "/")));
}

/** Label lookup for top-level paths (used by the topbar page title). */
export function findNavLabel(to: string): string | undefined {
  return NAV_FLAT.find((i) => i.to === to)?.label;
}
