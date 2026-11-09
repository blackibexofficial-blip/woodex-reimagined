import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { CheckCircle2, XCircle, Loader2, Save, AlertTriangle, RotateCcw, Plug, Database, Server, Upload, X, MessagesSquare, Inbox, UsersRound, Bot, Wallet } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { StoreSettings, ChatMode } from "@/api/types";
import { config, isDemoMode, isSupabaseMode, isSupabaseConfigured, isBagistoShopConfigured, isBagistoAdminConfigured } from "@/config/env";
import { useSettingsManagePermission } from "@/lib/owner";
import { SectionCard } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";

const FIELD = "mb-1 block text-xs font-medium text-muted-foreground";

export default function AdminSettings() {
  const api = useMemo(() => getAdminApi(), []);
  const { canManage, checking } = useSettingsManagePermission();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode | null>(null);
  const [chatModeBusy, setChatModeBusy] = useState(false);
  const [newMember, setNewMember] = useState("");

  useEffect(() => {
    let alive = true;
    // Clear any prior owner's settings while session/capability checks change.
    setSettings(null);
    setLoadError(null);
    if (!checking) {
      api.getSettings().then((value) => { if (alive) setSettings(value); })
        .catch((error) => { if (alive) setLoadError(error instanceof Error ? error.message : "Could not load store settings."); });
    }
    return () => { alive = false; };
  }, [api, checking, canManage]);

  useEffect(() => {
    let alive = true;
    api.getChatMode().then((value) => { if (alive) setChatMode(value); }).catch(() => { if (alive) setChatMode("offline"); });
    return () => { alive = false; };
  }, [api]);

  const chooseChatMode = (mode: ChatMode) => {
    if (!isDemoMode || chatModeBusy) return;
    setChatModeBusy(true);
    api.setChatMode(mode)
      .then((saved) => { setChatMode(saved); toast.success(`Storefront live chat set to “${saved === "off" ? "Hidden" : saved === "live" ? "Live — agents answer" : "Offline — capture callbacks"}”.`); })
      .catch((err) => { console.error(err); toast.error("Could not save the chat mode — please try again."); })
      .finally(() => setChatModeBusy(false));
  };

  const set = <K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  const team = settings?.team ?? [];
  const aiEnabled = settings?.aiOfflineDraftsEnabled !== false;
  const addMember = (e: { preventDefault(): void }) => {
    e.preventDefault();
    const name = newMember.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (name.length > 40) { toast.error("Keep team names under 40 characters."); return; }
    if (team.some((t) => t.toLowerCase() === name.toLowerCase())) { toast.error(`${name} is already on the roster.`); return; }
    set("team", [...team, name]);
    setNewMember("");
    toast.success(`${name} added — save changes to persist.`);
  };
  const removeMember = (name: string) => set("team", team.filter((t) => t !== name));

  const onLogoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      toast.error("Logo must be 200 KB or smaller — it travels inside the settings record.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") set("storeLogo", reader.result); };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const save = async () => {
    if (!settings || !canManage || checking) return;
    setSaving(true);
    try {
      const saved = await api.saveSettings(settings);
      setSettings(saved);
      toast.success("Store settings saved.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? `Could not save settings: ${e.message}` : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const resetDemo = async () => {
    setResetting(true);
    try {
      await api.resetDemoData();
      toast.success("Demo data reset to seed. Reloading…");
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      console.error(e);
      setResetting(false);
      toast.error(e instanceof Error ? `Reset failed: ${e.message}` : "Reset failed.");
    }
  };

  const integrations = [
    { label: "Storefront data (static catalogue)", ok: true, detail: "Products/services read from src/data/*" },
    { label: "Supabase project", ok: isSupabaseConfigured, detail: isSupabaseConfigured ? `Project ${config.supabase.projectId || "configured"}` : "VITE_SUPABASE_* missing — running without it" },
    { label: "Bagisto storefront API key", ok: isBagistoShopConfigured, detail: isBagistoShopConfigured ? config.bagisto.baseUrl : "Set VITE_API_MODE=bagisto + VITE_BAGISTO_API_URL + VITE_BAGISTO_STOREFRONT_KEY" },
    { label: "Bagisto admin integration token", ok: isBagistoAdminConfigured, detail: isBagistoAdminConfigured ? "Bearer token present (keep it server-side in production!)" : "Not configured — admin uses demo dataset" },
  ];

  if (loadError) return <p role="alert" className="p-4 text-sm text-destructive">{loadError}</p>;
  if (!settings) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-5xl space-y-4">
      {isSupabaseMode && (!canManage || checking) && (
        <p className="text-sm text-muted-foreground">{checking ? "Checking settings permissions…" : "Read-only: only the owner can change settings. Some fields are restricted."}</p>
      )}
      <fieldset aria-label="Store settings" disabled={isSupabaseMode && (!canManage || checking)} className="grid w-full gap-6 lg:grid-cols-5">
      {/* ── store profile form ─────────────────────────────────────────── */}
      <SectionCard className="lg:col-span-3" title="Store profile" action={
        <Button size="sm" onClick={save} disabled={saving} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save
        </Button>
      }>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="s-name" className={FIELD}>Store name</label>
            <Input id="s-name" value={settings.storeName} onChange={(e) => set("storeName", e.target.value)} />
          </div>
          <div>
            <label htmlFor="s-tagline" className={FIELD}>Tagline</label>
            <Input id="s-tagline" value={settings.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </div>
          <div>
            <label htmlFor="s-phone" className={FIELD}>Phone</label>
            <Input id="s-phone" value={settings.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <label htmlFor="s-whatsapp" className={FIELD}>WhatsApp</label>
            <Input id="s-whatsapp" value={settings.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          </div>
          <div>
            <label htmlFor="s-email" className={FIELD}>Email</label>
            <Input id="s-email" type="email" value={settings.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label htmlFor="s-city" className={FIELD}>City</label>
            <Input id="s-city" value={settings.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="s-address" className={FIELD}>Address</label>
            <Input id="s-address" value={settings.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div>
            <label htmlFor="s-currency" className={FIELD}>Currency</label>
            <Select value={settings.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger id="s-currency"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["PKR", "AED", "SAR", "BHD", "USD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="s-tax" className={FIELD}>Sales tax rate (%)</label>
            <Input id="s-tax" type="number" min={0} step={0.5} value={settings.taxRate} onChange={(e) => set("taxRate", Number(e.target.value))} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="s-delivery" className={FIELD}>Delivery note (shown at checkout)</label>
            <Textarea id="s-delivery" rows={2} value={settings.deliveryNote} onChange={(e) => set("deliveryNote", e.target.value)} />
          </div>
          {/* store logo — one image, every printable document */}
          <div className="sm:col-span-2 rounded-lg border border-dashed border-border p-4">
            <span className={FIELD}>Company logo — every printable document</span>
            <div className="mt-2 flex items-center gap-4">
              {settings.storeLogo ? (
                <>
                  <img src={settings.storeLogo} alt="Company logo preview" className="h-14 w-14 shrink-0 rounded-md border border-border object-contain p-1" />
                  <Button type="button" variant="outline" size="sm" onClick={() => set("storeLogo", null)}>
                    <X className="mr-1 h-3.5 w-3.5" /> Remove logo
                  </Button>
                </>
              ) : (
                <label htmlFor="s-logo" className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-xs font-semibold text-muted-foreground transition hover:border-hon-green hover:text-foreground">
                  <Upload className="h-4 w-4" /> Upload logo…
                  <input id="s-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={onLogoFile} />
                </label>
              )}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">PNG, JPG, WebP or SVG, ≤ 200 KB. Shown on the quotation, invoice, order, purchase order, return and exchange sheets (A4 masthead and the classic WOODEX masthead). When set, it takes precedence over a template&apos;s own logo.</p>
          </div>
        </div>
      </SectionCard>

      {/* ── integrations + danger zone ─────────────────────────────────── */}
      <div className="space-y-6 lg:col-span-2">
        <SectionCard title="Storefront live chat" action={<MessagesSquare className="h-4 w-4 text-muted-foreground" />}>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Controls the bubble on the storefront. Visitors either chat with the team (you answer in{" "}
            <Link to="/admin/chat" className="font-semibold text-accent underline-offset-2 hover:underline">/admin/chat</Link>) or leave a name + number and we call back.
            Consent is captured with every message; nothing is sent to third parties.
          </p>
          <div role="group" aria-label="Storefront live chat mode" className="mt-3 grid grid-cols-3 gap-1.5">
            {([
              { value: "off", label: "Off", hint: "No bubble anywhere" },
              { value: "offline", label: "Offline capture", hint: "Default — callbacks as leads" },
              { value: "live", label: "Live", hint: "Agents answer in the inbox" },
            ] as Array<{ value: ChatMode; label: string; hint: string }>).map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={!isDemoMode || chatModeBusy || chatMode === null}
                aria-pressed={chatMode === opt.value}
                onClick={() => chooseChatMode(opt.value)}
                title={opt.hint}
                className={`rounded-lg border px-2 py-2 text-[11px] font-semibold leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${chatMode === opt.value ? "border-accent bg-accent text-accent-foreground shadow-sm" : "border-border bg-background text-muted-foreground hover:border-accent hover:text-foreground"}`}
              >
                {opt.label}
                <span className="mt-0.5 block text-[9px] font-semibold">{opt.hint}</span>
              </button>
            ))}
          </div>
          {!isDemoMode && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
              Read-only on this backend — the switch persists in the demo build. Hosted chat rollout is an owner-gated migration; visitor callbacks still arrive as leads either way.
            </p>
          )}
          <Link to="/admin/chat" className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent hover:underline">
            <Inbox className="h-3.5 w-3.5" aria-hidden /> Open the inbox →
          </Link>
        </SectionCard>

        <SectionCard title="Team — lead assignees" action={<UsersRound className="h-4 w-4 text-muted-foreground" />}>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Who can own a lead. Powers the assignee column on every lead, the <span className="font-mono">Mine</span> flag and the merge/attribution review. Demo roster: Abdullah · Nabeel · Imtiaz — add yours, then hit <span className="font-semibold text-foreground">Save changes</span>.
          </p>
          <ul className="mt-3 divide-y divide-muted overflow-hidden rounded-lg border border-border">
            {team.length === 0 && <li className="px-3 py-2.5 text-xs text-muted-foreground">No teammates yet — add the sales roster below.</li>}
            {team.map((name) => (
              <li key={name} className="flex items-center gap-2.5 bg-white px-3 py-2">
                <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[9px] font-bold uppercase text-foreground">{name.trim().split(/\s+/).slice(0, 2).map((w) => (w[0] ?? "").toUpperCase()).join("")}</span>
                <span className="flex-1 text-xs font-medium text-foreground">{name}</span>
                <button type="button" onClick={() => removeMember(name)} aria-label={`Remove ${name} from the team`} className="rounded p-1 text-muted-foreground hover:bg-border hover:text-foreground"><X className="h-3.5 w-3.5" aria-hidden /></button>
              </li>
            ))}
          </ul>
          <form onSubmit={addMember} className="mt-2 flex gap-2">
            <Input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="Add teammate — e.g. Abdullah" aria-label="New team member" className="h-8 text-xs bg-white" />
            <Button type="submit" size="sm" variant="outline" className="h-8">Add</Button>
          </form>
        </SectionCard>

        <SectionCard title="AI sales agent" action={<Bot className="h-4 w-4 text-muted-foreground" />}>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Drafts replies from a built-in knowledge corpus (hours, address, warranty tiers, payment policy) and only ever quotes prices from real catalogue records.
            A draft lands in the composer for staff review — nothing is sent automatically, and no network call leaves this device.
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2">
            <span className="min-w-0">
              <label htmlFor="ai-offline-toggle" className="block text-xs font-semibold text-foreground">Offline AI drafts in the inbox</label>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">Enables “Suggest reply (AI)” in the chat composer. Retrieval-grounded on WOODEX business facts.</span>
            </span>
            <button
              id="ai-offline-toggle"
              type="button"
              role="switch"
              aria-checked={aiEnabled}
              onClick={() => set("aiOfflineDraftsEnabled", !aiEnabled)}
              aria-label="Toggle offline AI drafts"
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${aiEnabled ? "bg-accent" : "bg-muted"}`}
            >
              <span aria-hidden className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${aiEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Hosted copilot — Not verified</p>
            <p className="mt-1 text-[11px] leading-4 text-amber-900">
              The <code className="rounded bg-amber-100 px-1">ai-agent</code> edge function exists in this repository; its hosted deployment status is unknown. Do not enable it yet: its grounding is client-supplied, attempt limits are not hosted-verified, and provider spending and privacy controls are incomplete.
              This toggle affects only the offline draft in the inbox; it does not enable or call a hosted model.
            </p>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            Honest status (2026-11-08): the offline draft engine is verified offline — <span className="font-mono">npm run test:ai-eval</span> (19/19, retrieval + price-grounding + handoff checks). The hosted path remains UNVERIFIED and should stay disabled pending safety controls and staging tests. See <span className="font-mono">docs/08-master-plan/CREDENTIAL-BLOCKED.md</span>.
          </p>
        </SectionCard>

        <SectionCard title="Payment gateway" action={<Wallet className="h-4 w-4 text-muted-foreground" />}>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Not configured</p>
            <p className="mt-1 text-[11px] leading-4 text-amber-900">
              No gateway (JazzCash / Easypaisa / bank link) is connected and no real payment can be taken on this build. Demo checkout stays demo — it never charges anyone.
            </p>
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-5 text-muted-foreground">
            <li><strong className="text-foreground">Exists today:</strong> <code className="rounded bg-muted px-1">src/lib/payments/signature.ts</code> — constant-time HMAC-SHA256 verification for the future webhook (<code className="rounded bg-muted px-1">x-woodex-signature</code> over the raw body), verified offline (<span className="font-mono">npm run test:payments</span> · 15/15).</li>
            <li><strong className="text-foreground">Owner action:</strong> merchant account + live API keys (server-side only), webhook endpoint calling the verifier, sandbox rehearsal with test cards/wallets, then hosted keys — in that order.</li>
            <li><strong className="text-foreground">Never:</strong> paste keys into this page, the bundle, git, or chat. This card is deliberately read-only.</li>
          </ul>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Full checklist incl. what stays blocked after this: <span className="font-mono">docs/08-master-plan/CREDENTIAL-BLOCKED.md</span>. Hosted path remains UNVERIFIED until staging sign-off.</p>
        </SectionCard>

        <SectionCard title="Integration status" action={<Plug className="h-4 w-4 text-muted-foreground" />}>
          <ul className="space-y-3">
            {integrations.map((item) => (
              <li key={item.label} className="flex items-start gap-2.5">
                {item.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0">
                  <span className={`block text-xs font-semibold ${item.ok ? "text-foreground" : "text-muted-foreground"}`}>{item.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            Mode: <span className="font-mono font-semibold">{config.apiMode}</span>. This admin is running on the seeded demo dataset,
            standing in for Bagisto tables. Going live is NOT a one-line env flip yet — the <code className="rounded bg-muted px-1">/api/admin/*</code> endpoints
            return 501 until the Laravel/Bagisto proxy ships; see <span className="font-mono">docs/07-admin-integration/README.md</span>.
            The page builder (<span className="font-mono">Pages</span>) is fully usable in demo mode; published pages render at
            <span className="font-mono"> /lab/:slug</span> and persist to the on-device demo database.
          </p>
        </SectionCard>

        <SectionCard title="How this maps to Bagisto" action={<Server className="h-4 w-4 text-muted-foreground" />}>
          <ul className="space-y-1.5 text-[11px] leading-5 text-muted-foreground">
            <li className="flex gap-1.5"><span className="font-mono text-muted-foreground">01</span> Demo dataset stands in for Bagisto tables (products, orders, customers).</li>
            <li className="flex gap-1.5"><span className="font-mono text-muted-foreground">02</span> <code className="rounded bg-muted px-1">src/api/bagisto/admin.ts</code> implements the same contract over <code className="rounded bg-muted px-1">/api/admin/*</code>.</li>
            <li className="flex gap-1.5"><span className="font-mono text-muted-foreground">03</span> Admin tokens stay server-side in production (Laravel proxy) — never ship them publicly.</li>
            <li className="flex gap-1.5"><span className="font-mono text-muted-foreground">04</span> Quote/B2B leads need a small custom Laravel package — see the runbook.</li>
          </ul>
        </SectionCard>

        {isDemoMode && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-rose-800"><AlertTriangle className="h-4 w-4" /> Danger zone</p>
            <p className="mt-1.5 text-xs leading-5 text-rose-700">Wipes the local demo database (products, orders, customers, leads, settings) and reseeds it from the catalogue.</p>
            <Button variant="outline" onClick={resetDemo} disabled={resetting} className="mt-3 border-rose-300 bg-white text-rose-700 hover:bg-rose-100">
              {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />} Reset demo data
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Database className="h-3.5 w-3.5" /> Demo persistence key: <code className="font-mono">woodex.admin.db.v1</code>
        </div>
      </div>
      </fieldset>
    </div>
  );
}
