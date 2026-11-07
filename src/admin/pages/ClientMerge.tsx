import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GitMerge, Loader2, Info, User, Building2, CheckCircle2, Mail, Phone, MapPin, Tag, Inbox, History, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminClient, MergeCandidate } from "@/api/types";
import { formatDate, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const filled = (c: AdminClient) =>
  [c.company, c.email, c.phone, c.city, c.source, c.tags.length ? "t" : ""].filter(Boolean).length;
const defaultCanonical = (members: AdminClient[]): string =>
  [...members].sort((a, b) => (b.kind === "business" ? 1 : 0) - (a.kind === "business" ? 1 : 0) || filled(b) - filled(a) || a.createdAt.localeCompare(b.createdAt))[0]?.id;

export default function AdminClientMerge() {
  const api = useMemo(() => getAdminApi(), []);

  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [merged, setMerged] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);          // candidate id being merged
  const [choice, setChoice] = useState<Record<string, string>>({}); // candidateId -> canonical clientId
  const [confirm, setConfirm] = useState<MergeCandidate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, all] = await Promise.all([api.listMergeCandidates(), api.listClients({ includeMerged: true })]);
      setCandidates(cs);
      setMerged(all.filter((c) => c.mergedInto).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      setChoice((prev) => {
        const next = { ...prev };
        for (const c of cs) if (!next[c.id]) next[c.id] = defaultCanonical(c.clients);
        return next;
      });
    } catch {
      toast.error("Could not load the merge queue.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const doMerge = async () => {
    if (!confirm) return;
    const canonical = choice[confirm.id];
    const losers = confirm.clients.filter((c) => c.id !== canonical);
    if (!canonical || losers.length === 0) return;
    setBusy(confirm.id);
    try {
      // one merge per losing record — pairs collapse one hop at a time, each fully rehearsed server-side
      for (const loser of losers) await api.mergeClients(canonical, loser.id);
      toast.success(`${confirm.clients.length} records consolidated into ${canonical}.`);
      setConfirm(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Merge failed.");
    } finally {
      setBusy(null);
    }
  };

  const clientCard = (c: AdminClient, candidateId?: string) => (
    <div key={c.id} className="min-w-0 flex-1 rounded-xl border border-border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-muted-foreground">
          {c.kind === "business" ? <Building2 className="h-3.5 w-3.5 text-violet-600" /> : <User className="h-3.5 w-3.5 text-sky-600" />}
          {c.id}
        </p>
        <span className="rounded-full border border-border bg-secondary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">{c.kind}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-semibold text-foreground">{c.name}</p>
      {c.company && <p className="truncate text-[11px] text-muted-foreground">{c.company}</p>}
      <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
        {c.email && <li className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{c.email}</span></li>}
        {c.phone && <li className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" /> {c.phone}</li>}
        {c.city && <li className="flex items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0" /> {c.city}</li>}
        {c.source && <li className="flex items-center gap-1.5"><Tag className="h-3 w-3 shrink-0" /> <span className="capitalize">{c.source}</span></li>}
      </ul>
      <p className="mt-2 border-t border-muted pt-1.5 text-[9px] text-muted-foreground">on file since {formatDate(c.createdAt)}</p>
      {candidateId && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary px-2 py-1.5 text-[11px] font-semibold text-foreground has-[:checked]:border-hon-green has-[:checked]:bg-hon-green-pale/40">
          <input
            type="radio"
            name={`canonical-${candidateId}`}
            checked={choice[candidateId] === c.id}
            onChange={() => setChoice((p) => ({ ...p, [candidateId]: c.id }))}
            className="accent-hon-green"
          />
          Keep as canonical
        </label>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p><span className="font-bold">Ambiguity goes to a human.</span> Nothing auto-merges. Merging re-points links (leads · quotes · orders · site visits) to the canonical record via the capability-checked <span className="font-mono">client_merge</span> RPC; the loser is tombstoned with <span className="font-mono">merged_into</span> — never deleted, always auditable.</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-xl border border-border bg-white px-3 py-2 text-center"><span className="block text-lg font-black leading-none">{candidates.length}</span><span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Pending</span></span>
          <span className="rounded-xl border border-border bg-white px-3 py-2 text-center"><span className="block text-lg font-black leading-none">{merged.length}</span><span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Retired</span></span>
        </div>
      </div>

      <SectionCard title="Identity review queue">
        {loading ? (
          <SectionSkeleton rows={4} />
        ) : candidates.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No duplicates awaiting review" hint="The client book is clean — every record resolves uniquely today. New collisions will surface here automatically." />
        ) : (
          <ul className="space-y-3">
            {candidates.map((cand) => (
              <li key={cand.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                  <p className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <span className="rounded-full border border-orange-300 bg-orange-50 px-2 py-0.5 text-orange-800">same {cand.reason}</span>
                    <span className="font-mono normal-case tracking-normal text-foreground">{cand.reason === "email" ? cand.key : `+${cand.key}`}</span>
                    <span>· {cand.clients.length} records</span>
                  </p>
                  <Button size="sm" className="h-7 gap-1.5 bg-accent px-2.5 text-[11px] text-accent-foreground hover:bg-accent/90" disabled={busy === cand.id} onClick={() => setConfirm(cand)}>
                    {busy === cand.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                    Merge records
                  </Button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">{cand.clients.map((c) => clientCard(c, cand.id))}</div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Merge history (audit)">
        {merged.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Inbox className="h-4 w-4" /> No merges recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {merged.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                <span className="font-mono text-[11px] text-muted-foreground">{m.id}</span>
                <span className="font-medium text-foreground">{m.name}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono text-[11px] text-hon-green-dark">{m.mergedInto}</span>
                {m.notes && <span className="w-full text-[10px] leading-4 text-muted-foreground sm:w-auto sm:flex-1 sm:text-right">{m.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* confirm dialog */}
      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Merge identity records?</DialogTitle>
          </DialogHeader>
          {confirm && (
            <div className="space-y-2 py-1 text-xs">
              <p className="text-muted-foreground">The canonical record gets everything (links, notes, quote context). Retired records stay tombstoned for audit — nothing is deleted.</p>
              <ul className="space-y-1 rounded-lg bg-secondary p-2 font-mono text-[11px]">
                {confirm.clients.map((c) => (
                  <li key={c.id} className={c.id === choice[confirm.id] ? "font-bold text-hon-green-dark" : "text-muted-foreground line-through"}>
                    {c.id === choice[confirm.id] ? "● KEEP  " : "○ retire"} {c.id} — {c.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button onClick={doMerge} disabled={busy === confirm?.id}>
              {busy === confirm?.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <GitMerge className="mr-1.5 h-4 w-4" />}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground"><History className="h-3.5 w-3.5" /> Merge decisions are permanent for the audit trail — review before confirming.</p>
    </div>
  );
}
