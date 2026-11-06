import { useEffect, useMemo, useState } from "react";
import { Building2, Check, ChevronDown, LogOut, Search, X } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminCompany } from "@/api/types";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Demo trade gate — pick a seeded B2B company to sign in as.
 * No accounts exist; this simulates the authenticated portal view for the preview.
 */
const TradeSignIn = () => {
  const { tradeSession, signInTrade, signOutTrade } = useCart();
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getAdminApi()
      .listCompanies()
      .then(setCompanies)
      .catch((e) => {
        console.error(e);
        toast.error("Could not load the company registry.");
      })
      .finally(() => setLoading(false));
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => [c.name, c.contactName, c.city, c.email].some((v) => v.toLowerCase().includes(q)));
  }, [companies, query]);

  if (tradeSession) {
    return (
      <div className="inline-flex flex-wrap items-center gap-3 rounded-md border border-hon-green/40 bg-hon-green/10 px-4 py-3 text-sm">
        <Building2 className="h-5 w-5 text-hon-green-dark" aria-hidden />
        <div className="text-left">
          <p className="font-semibold text-hon-green-dark">Trade pricing active — {tradeSession.companyName}</p>
          <p className="text-xs text-muted-foreground">Signed in as {tradeSession.contactName}. Prices in cart &amp; checkout reflect your agreements.</p>
        </div>
        <Button size="sm" variant="outline" onClick={signOutTrade} className="ml-auto border-hon-green/50 text-hon-green-dark hover:bg-hon-green/15"><LogOut className="mr-1.5 h-4 w-4" />Sign out</Button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md border border-primary-foreground/40 px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-foreground/10"
        aria-label="Sign in as a trade customer"
      >
        <Building2 className="h-4 w-4" aria-hidden /> Trade customer? Sign in
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in — trade account</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Pick your company to unlock your negotiated pricing. (Demo preview — pick any seeded account.)</p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies…" aria-label="Search companies" className="pl-9" autoFocus />
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-muted rounded-lg border border-muted">
            {loading ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">Loading companies…</p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No companies match “{query}”.</p>
            ) : (
              visible.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    signInTrade({ id: c.id, name: c.name, contactName: c.contactName });
                    setOpen(false);
                    toast.success(`Welcome, ${c.contactName} — trade pricing active for ${c.name}.`);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-secondary"
                  aria-label={`Sign in as ${c.contactName} from ${c.name}`}
                >
                  <Building2 className="h-4 w-4 flex-shrink-0 text-hon-green-dark" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{c.name}</span>
                    <span className="text-[11px] text-muted-foreground">{c.contactName} · {c.city} · {c.email}</span>
                  </span>
                  <Check className="h-4 w-4 text-transparent" aria-hidden />
                </button>
              ))
            )}
          </div>
          <button onClick={() => setOpen(false)} className="mt-1 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><X className="h-3 w-3" />Close</button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TradeSignIn;
