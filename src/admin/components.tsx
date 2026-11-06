import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ClaimStatus, DraftOrderStatus, ExchangeStatus, LeadStatus, OrderStatus, PaymentMethod, PurchaseOrderStatus, QuoteStatus, ReturnStatus, TransferStatus } from "@/api/types";

/* ── formatters ─────────────────────────────────────────────────────────── */
export const formatPKR = (n: number) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(n);

export const formatNumber = (n: number) => new Intl.NumberFormat("en-PK").format(n);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 0)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d ago` : formatDate(iso);
};

/* ── status badges ──────────────────────────────────────────────────────── */
const orderStyles: Record<OrderStatus, string> = {
  pending: "bg-hon-green-pale text-hon-green-dark border-hon-green-pale",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  shipped: "bg-violet-100 text-violet-800 border-violet-200",
  delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
};
const leadStyles: Record<LeadStatus, string> = {
  new: "bg-sky-100 text-sky-800 border-sky-200",
  contacted: "bg-hon-green-pale text-hon-green-dark border-hon-green-pale",
  quoted: "bg-violet-100 text-violet-800 border-violet-200",
  won: "bg-emerald-100 text-emerald-800 border-emerald-200",
  lost: "bg-border text-muted-foreground border-muted-foreground",
};
const returnStyles: Record<ReturnStatus, string> = {
  requested: "bg-amber-100 text-amber-800 border-amber-200",
  received: "bg-sky-100 text-sky-800 border-sky-200",
  inspected: "bg-violet-100 text-violet-800 border-violet-200",
  refunded: "bg-emerald-100 text-emerald-800 border-emerald-200",
  replaced: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-100 text-rose-800 border-rose-200",
};
export const ReturnStatusBadge = ({ status }: { status: ReturnStatus }) => (
  <Badge variant="outline" className={cn("capitalize font-medium", returnStyles[status])}>{status}</Badge>
);
const exchangeStyles: Record<ExchangeStatus, string> = {
  requested: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-violet-100 text-violet-800 border-violet-200",
  shipped: "bg-sky-100 text-sky-800 border-sky-200",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-100 text-rose-800 border-rose-200",
};
export const ExchangeStatusBadge = ({ status }: { status: ExchangeStatus }) => (
  <Badge variant="outline" className={cn("capitalize font-medium", exchangeStyles[status])}>{status}</Badge>
);
const claimStyles: Record<ClaimStatus, string> = {
  reported: "bg-amber-100 text-amber-800 border-amber-200",
  assessing: "bg-sky-100 text-sky-800 border-sky-200",
  approved: "bg-violet-100 text-violet-800 border-violet-200",
  rejected: "bg-rose-100 text-rose-800 border-rose-200",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
};
export const ClaimStatusBadge = ({ status }: { status: ClaimStatus }) => (
  <Badge variant="outline" className={cn("capitalize font-medium", claimStyles[status])}>{status}</Badge>
);
const draftStyles: Record<DraftOrderStatus, string> = {
  draft: "bg-amber-100 text-amber-800 border-amber-200",
  converted: "bg-emerald-100 text-emerald-800 border-emerald-200",
};
export const DraftOrderStatusBadge = ({ status }: { status: DraftOrderStatus }) => (
  <Badge variant="outline" className={cn("capitalize font-medium", draftStyles[status])}>{status}</Badge>
);

const quoteStyles: Record<QuoteStatus, string> = {
  draft: "bg-amber-100 text-amber-800 border-amber-200",
  sent: "bg-sky-100 text-sky-800 border-sky-200",
  accepted: "bg-emerald-100 text-emerald-800 border-emerald-200",
  declined: "bg-rose-100 text-rose-800 border-rose-200",
  converted: "bg-emerald-600 text-white border-emerald-600",
};
export const QuoteStatusBadge = ({ status }: { status: QuoteStatus }) => (
  <Badge variant="outline" className={cn("capitalize font-medium", quoteStyles[status])}>{status}</Badge>
);

const transferStyles: Record<TransferStatus, string> = {
  draft: "bg-amber-100 text-amber-800 border-amber-200",
  in_transit: "bg-sky-100 text-sky-800 border-sky-200",
  received: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-slate-200 text-slate-600 border-slate-300",
};
const transferLabels: Record<TransferStatus, string> = {
  draft: "Draft",
  in_transit: "In transit",
  received: "Received",
  cancelled: "Cancelled",
};
const poStyles: Record<PurchaseOrderStatus, string> = {
  draft: "bg-amber-100 text-amber-800 border-amber-200",
  sent: "bg-sky-100 text-sky-800 border-sky-200",
  partial: "bg-blue-100 text-blue-800 border-blue-200",
  received: "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled: "bg-slate-200 text-slate-600 border-slate-300",
};
export const PurchaseOrderStatusBadge = ({ status }: { status: PurchaseOrderStatus }) => (
  <Badge variant="outline" className={cn("capitalize font-medium", poStyles[status])}>{status}</Badge>
);
export const TransferStatusBadge = ({ status }: { status: TransferStatus }) => (
  <Badge variant="outline" className={cn("font-medium", transferStyles[status])}>{transferLabels[status]}</Badge>
);

const paymentLabels: Record<PaymentMethod, string> = {
  cod: "Cash on Delivery",
  "bank-transfer": "Bank Transfer",
  easypaisa: "Easypaisa",
  jazzcash: "JazzCash",
  card: "Card",
};

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => (
  <Badge variant="outline" className={cn("capitalize font-medium", orderStyles[status])}>{status}</Badge>
);
export const LeadStatusBadge = ({ status }: { status: LeadStatus }) => (
  <Badge variant="outline" className={cn("capitalize font-medium", leadStyles[status])}>{status}</Badge>
);
export const paymentLabel = (m: PaymentMethod) => paymentLabels[m] ?? m;

/* ── stat card ──────────────────────────────────────────────────────────── */
export function StatCard({ label, value, sub, icon: Icon, tone = "amber" }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "amber" | "emerald" | "blue" | "violet" | "rose" | "stone";
}) {
  const tones = {
    amber: "bg-hon-green-pale text-hon-green-dark",
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    rose: "bg-rose-50 text-rose-600",
    stone: "bg-muted text-muted-foreground",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-bold text-foreground">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

/* ── section wrapper ────────────────────────────────────────────────────── */
export function SectionCard({ title, action, children, className }: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card shadow-sm", className)}>
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export const SectionSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
    ))}
  </div>
);

export const EmptyState = ({ icon: Icon, title, hint }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
    <Icon className="h-8 w-8 text-muted-foreground" />
    <p className="font-medium text-foreground">{title}</p>
    {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
  </div>
);
