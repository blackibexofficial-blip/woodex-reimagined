import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Megaphone, ArrowRight, TrendingUp, BadgeDollarSign, Users, Percent, Inbox, ShieldCheck, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { getAdminApi } from "@/api";
import type { AdminLead } from "@/api/types";
import { formatPKR, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";

/**
 * Marketing attribution surface — FIRST-PARTY ONLY.
 *
 * Attribution comes entirely from the UTM tags + landing path captured on the
 * storefront lead form (which requires consent). No pixels, no cookies, no
 * third-party trackers are deployed — pushing a marketing pixel live is an
 * owner decision (provider, consent copy, CMP impact), deliberately not taken
 * here. Spend / CPA / ROAS need a decision on where ad spend is stored — not
 * faked in this view either.
 */
const OPEN_STATUSES = new Set(["new", "contacted", "quoted"]);

type CampaignRow = {
  key: string;
  label: string;
  source: string;
  medium: string;
  leads: number;
  consented: number;
  b2b: number;
  won: number;
  lost: number;
  openValue: number;
  wonValue: number;
  latest: string;
};

const rate = (won: number, lost: number) => (won + lost > 0 ? `${Math.round((won / (won + lost)) * 100)}%` : "—");

export default function AdminCampaigns() {
  const api = useMemo(() => getAdminApi(), []);
  const [leads, setLeads] = useState<AdminLead[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // listLeads serves from the store; hosted caps perPage at 100 — page through
      // to a bounded 500-lead window, disclosure note below.
      const first = await api.listLeads({ page: 1, perPage: 100, status: "all", type: "all" });
      let merged = [...first.items];
      for (let page = 2; page * 100 <= first.total && page <= 5; page++) {
        const more = await api.listLeads({ page, perPage: 100, status: "all", type: "all" });
        merged = merged.concat(more.items);
      }
      setLeads(merged);
    } catch (e) {
      console.error(e);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo<CampaignRow[]>(() => {
    if (!leads) return [];
    const map = new Map<string, CampaignRow>();
    for (const l of leads) {
      const tagged = Boolean(l.utmCampaign?.trim());
      const key = tagged ? `${l.utmSource ?? "?"}|${l.utmMedium ?? "?"}|${l.utmCampaign!.trim()}` : "__unattributed__";
      let r = map.get(key);
      if (!r) {
        r = {
          key,
          label: tagged ? l.utmCampaign!.trim() : "Unattributed (no utm_campaign)",
          source: l.utmSource ?? "—",
          medium: l.utmMedium ?? "—",
          leads: 0, consented: 0, b2b: 0, won: 0, lost: 0, openValue: 0, wonValue: 0,
          latest: l.createdAt,
        };
        map.set(key, r);
      }
      r.leads += 1;
      if (l.consent) r.consented += 1;
      if (l.type === "b2b") r.b2b += 1;
      if (l.status === "won") { r.won += 1; r.wonValue += l.value ?? 0; }
      else if (l.status === "lost") r.lost += 1;
      else r.openValue += l.value ?? 0;
      if (l.createdAt > r.latest) r.latest = l.createdAt;
    }
    return [...map.values()].sort((a, b) => b.leads - a.leads || b.wonValue - a.wonValue);
  }, [leads]);

  const groupBy = useCallback((field: "utmSource" | "utmMedium") => {
    if (!leads) return [] as Array<{ label: string; leads: number; won: number; winRate: number | null }>;
    const m = new Map<string, { leads: number; won: number; lost: number }>();
    for (const l of leads) {
      const label = (field === "utmSource" ? l.utmSource : l.utmMedium)?.trim() || "unattributed";
      const e = m.get(label) ?? { leads: 0, won: 0, lost: 0 };
      e.leads += 1;
      if (l.status === "won") e.won += 1;
      if (l.status === "lost") e.lost += 1;
      m.set(label, e);
    }
    return [...m.entries()]
      .map(([label, v]) => ({ label, leads: v.leads, won: v.won, winRate: v.won + v.lost > 0 ? Math.round((v.won / (v.won + v.lost)) * 100) : null }))
      .sort((a, b) => b.leads - a.leads);
  }, [leads]);

  const totals = useMemo(() => {
    const all = leads ?? [];
    const attributed = all.filter((l) => l.utmCampaign?.trim()).length;
    const won = all.filter((l) => l.status === "won").length;
    const lost = all.filter((l) => l.status === "lost").length;
    const wonValue = all.filter((l) => l.status === "won").reduce((s, l) => s + (l.value ?? 0), 0);
    const pipeline = all.filter((l) => OPEN_STATUSES.has(l.status)).reduce((s, l) => s + (l.value ?? 0), 0);
    return { attributed, unattributed: all.length - attributed, won, lost, wonValue, pipeline, total: all.length };
  }, [leads]);

  const chartData = rows.filter((r) => r.key !== "__unattributed__").slice(0, 8).map((r) => ({ name: r.label.length > 22 ? `${r.label.slice(0, 22)}…` : r.label, Leads: r.leads, Won: r.won }));
  const bySource = groupBy("utmSource");
  const byMedium = groupBy("utmMedium");

  return (
    <div className="space-y-4">
      {/* honesty banner */}
      <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-bold">First-party attribution only.</span> Campaign rows come from the UTM tags + landing path your storefront captures on the consented lead form — no pixels, cookies or third-party trackers are deployed. Spend / CPA / ROAS need an owner decision on where ad spend is stored — not faked here. Lead tags reflect the last 500 leads (enough at showroom volume).
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Attributed leads", value: `${totals.attributed} / ${totals.total}`, icon: Users, tone: "text-sky-600" },
          { label: "Open pipeline", value: formatPKR(totals.pipeline), icon: TrendingUp, tone: "text-amber-600" },
          { label: "Won via CRM", value: formatPKR(totals.wonValue), icon: BadgeDollarSign, tone: "text-emerald-600" },
          { label: "Win rate (won+lost)", value: rate(totals.won, totals.lost), icon: Percent, tone: "text-hon-green-dark" },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"><Icon className={`h-4 w-4 ${tone}`} /> {label}</p>
            <p className="mt-1.5 text-xl font-black text-foreground lg:text-2xl">{value}</p>
          </div>
        ))}
      </div>

      {/* chart */}
      <SectionCard title="Leads & wins by campaign">
        {loading ? (
          <SectionSkeleton rows={4} />
        ) : chartData.length === 0 ? (
          <EmptyState icon={Megaphone} title="No attributed campaigns yet" hint="Add UTM tags on the storefront (e.g. linkedin / organic / hq-fit-out-q4 on the quotation page URL) — they land on the lead and appear here." />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E0E0E0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#737373" }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#737373" }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: "#F5F7F1" }} contentStyle={{ borderRadius: 12, border: "1px solid #E0E0E0", fontSize: 12 }} />
                <Bar dataKey="Leads" fill="#A5CB8B" radius={[4, 4, 0, 0]} name="Leads" isAnimationActive={false} />
                <Bar dataKey="Won" fill="#629924" radius={[4, 4, 0, 0]} name="Won" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* campaign table */}
      <SectionCard
        title="Campaign funnel"
        action={<Link to="/admin/leads" className="inline-flex items-center gap-1 text-xs font-medium text-hon-green-dark hover:text-hon-green-dark">Open leads <ArrowRight className="h-3.5 w-3.5" /></Link>}
      >
        {loading ? (
          <SectionSkeleton rows={6} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Inbox} title="No leads captured yet" hint="Leads from the storefront (quote requests & B2B enquiries) will roll up here by campaign." />
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead>
                <tr className="border-b border-muted text-[10px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-2.5 font-bold">Campaign</th>
                  <th className="px-3 py-2.5 font-bold">Src / Med</th>
                  <th className="px-3 py-2.5 text-right font-bold">Leads</th>
                  <th className="px-3 py-2.5 text-right font-bold" title="Leads with marketing consent recorded">OK</th>
                  <th className="px-3 py-2.5 text-right font-bold">B2B</th>
                  <th className="px-3 py-2.5 text-right font-bold">Won</th>
                  <th className="px-3 py-2.5 text-right font-bold">Lost</th>
                  <th className="px-3 py-2.5 text-right font-bold">Win rate</th>
                  <th className="px-3 py-2.5 text-right font-bold">Pipeline</th>
                  <th className="px-5 py-2.5 text-right font-bold">Won value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-muted">
                {rows.map((r) => (
                  <tr key={r.key} className={r.key === "__unattributed__" ? "bg-secondary/60" : "transition hover:bg-secondary"}>
                    <td className="px-5 py-3 font-semibold text-foreground">
                      {r.label}
                      {r.key === "__unattributed__" && <span className="block text-[9px] font-medium uppercase tracking-widest text-muted-foreground">organic / direct / referrer — no UTM tag</span>}
                    </td>
                    <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">{r.source} / {r.medium}</td>
                    <td className="px-3 py-3 text-right font-bold text-foreground">{r.leads}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground">{r.consented === r.leads ? <span className="inline-flex items-center gap-1 text-hon-green-dark"><ShieldCheck className="h-3 w-3" />{r.consented}</span> : `${r.consented}/${r.leads}`}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground">{r.b2b}</td>
                    <td className="px-3 py-3 text-right font-bold text-emerald-700">{r.won}</td>
                    <td className="px-3 py-3 text-right font-bold text-rose-700">{r.lost}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground">{rate(r.won, r.lost)}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground">{r.openValue > 0 ? formatPKR(r.openValue) : "—"}</td>
                    <td className="px-5 py-3 text-right font-bold text-foreground">{r.wonValue > 0 ? formatPKR(r.wonValue) : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-secondary font-bold text-foreground">
                  <td className="px-5 py-3" colSpan={2}>Totals — {totals.total} leads ({totals.attributed} attributed)</td>
                  <td className="px-3 py-3 text-right">{totals.total}</td>
                  <td className="px-3 py-3 text-right">—</td>
                  <td className="px-3 py-3 text-right">—</td>
                  <td className="px-3 py-3 text-right">{totals.won}</td>
                  <td className="px-3 py-3 text-right">{totals.lost}</td>
                  <td className="px-3 py-3 text-right">{rate(totals.won, totals.lost)}</td>
                  <td className="px-3 py-3 text-right">{formatPKR(totals.pipeline)}</td>
                  <td className="px-5 py-3 text-right">{formatPKR(totals.wonValue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* by source / by medium */}
      <div className="grid gap-4 xl:grid-cols-2">
        {[{ title: "By source", data: bySource }, { title: "By medium", data: byMedium }].map(({ title, data }) => (
          <SectionCard key={title} title={title}>
            {data.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing to show yet.</p>
            ) : (
              <ul className="-my-2 divide-y divide-muted">
                {data.map((d) => (
                  <li key={d.label} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="font-mono text-[11px] font-semibold text-foreground">{d.label}</span>
                    <span className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span><span className="font-bold text-foreground">{d.leads}</span> leads</span>
                      <span><span className="font-bold text-emerald-700">{d.won}</span> won</span>
                      <span className="w-10 text-right">{d.winRate === null ? "—" : `${d.winRate}%`}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
