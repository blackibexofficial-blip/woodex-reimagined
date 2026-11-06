import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminWarrantyFaq, AdminWarrantyPage, AdminWarrantyStep, AdminWarrantyTier } from "@/api/types";
import { SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

let rowCounter = 0;
const rid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(rowCounter++).toString(36)}`;

const MAX_TIERS = 6;
const MAX_STEPS = 8;
const MAX_FAQS = 12;

export default function AdminWarranty() {
  const api = useMemo(() => getAdminApi(), []);
  const [doc, setDoc] = useState<AdminWarrantyPage | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const content = await api.getWarrantyPage();
      setDoc(content);
    } catch {
      setLoadFailed(true);
      toast.error("Could not load warranty page content.");
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  /* ── hero ─────────────────────────────────────────────────────────── */
  const setHero = (patch: Partial<AdminWarrantyPage["hero"]>) =>
    setDoc((d) => (d ? { ...d, hero: { ...d.hero, ...patch } } : d));

  /* ── tiers ────────────────────────────────────────────────────────── */
  const updateTier = (id: string, patch: Partial<AdminWarrantyTier>) =>
    setDoc((d) => {
      if (!d) return d;
      let tiers = d.tiers.map((t) => (t.id === id ? { ...t, ...patch } : t));
      if (patch.popular) tiers = tiers.map((t) => (t.id === id ? t : { ...t, popular: false }));
      return { ...d, tiers };
    });
  const addTier = () =>
    setDoc((d) =>
      d && d.tiers.length < MAX_TIERS
        ? {
            ...d,
            tiers: [
              ...d.tiers,
              { id: rid("tier"), name: "", duration: "", applies: "", popular: false, coverage: [], excludes: [] },
            ],
          }
        : d,
    );
  const removeTier = (id: string) =>
    setDoc((d) => (d && d.tiers.length > 1 ? { ...d, tiers: d.tiers.filter((t) => t.id !== id) } : d));

  /* ── claim steps ──────────────────────────────────────────────────── */
  const updateStep = (id: string, patch: Partial<AdminWarrantyStep>) =>
    setDoc((d) => (d ? { ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : d));
  const addStep = () =>
    setDoc((d) =>
      d && d.steps.length < MAX_STEPS
        ? { ...d, steps: [...d.steps, { id: rid("step"), title: "", description: "" }] }
        : d,
    );
  const removeStep = (id: string) =>
    setDoc((d) => (d && d.steps.length > 1 ? { ...d, steps: d.steps.filter((s) => s.id !== id) } : d));

  /* ── FAQs ─────────────────────────────────────────────────────────── */
  const updateFaq = (id: string, patch: Partial<AdminWarrantyFaq>) =>
    setDoc((d) => (d ? { ...d, faqs: d.faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)) } : d));
  const addFaq = () =>
    setDoc((d) =>
      d && d.faqs.length < MAX_FAQS
        ? { ...d, faqs: [...d.faqs, { id: rid("faq"), q: "", a: "" }] }
        : d,
    );
  const removeFaq = (id: string) =>
    setDoc((d) => (d ? { ...d, faqs: d.faqs.filter((f) => f.id !== id) } : d));
  const moveFaq = (index: number, dir: -1 | 1) =>
    setDoc((d) => {
      if (!d) return d;
      const next = [...d.faqs];
      const j = index + dir;
      if (j < 0 || j >= next.length) return d;
      [next[index], next[j]] = [next[j], next[index]];
      return { ...d, faqs: next };
    });

  /* ── save / reset ─────────────────────────────────────────────────── */
  const save = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const clean = await api.updateWarrantyPage(doc);
      setDoc(clean);
      toast.success("Warranty page saved — live on the storefront.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the warranty page.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setResetting(true);
    setConfirmReset(false);
    try {
      const fresh = await api.resetWarrantyPage();
      setDoc(fresh);
      toast.success("Warranty content restored to the bundled defaults.");
    } catch {
      toast.error("Could not reset the warranty page.");
    } finally {
      setResetting(false);
    }
  };

  if (loadFailed) {
    return (
      <SectionCard title="Warranty page">
        <EmptyState
          icon={RotateCcw}
          title="Could not load warranty content"
          hint="The demo content store did not respond. If it keeps failing, check VITE_API_MODE."
        />
        <div className="flex justify-center pb-4">
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </div>
      </SectionCard>
    );
  }

  if (!doc) {
    return (
      <SectionCard title="Warranty page">
        <SectionSkeleton rows={6} />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <SectionCard title="Warranty page — hero">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wp-eyebrow">Eyebrow</Label>
            <Input id="wp-eyebrow" value={doc.hero.eyebrow} maxLength={120}
              onChange={(e) => setHero({ eyebrow: e.target.value })} placeholder="Peace of Mind" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wp-title">Title</Label>
            <Input id="wp-title" value={doc.hero.title} maxLength={160}
              onChange={(e) => setHero({ title: e.target.value })} placeholder="Warranty Policy" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="wp-subtitle">Subtitle</Label>
            <Textarea id="wp-subtitle" rows={2} value={doc.hero.subtitle} maxLength={600}
              onChange={(e) => setHero({ subtitle: e.target.value })}
              placeholder="Every WOODEX product is backed by…" />
          </div>
        </div>
      </SectionCard>

      {/* Tiers */}
      <SectionCard
        title="Coverage by series"
        action={
          <Button variant="outline" size="sm" onClick={addTier} disabled={doc.tiers.length >= MAX_TIERS}>
            <Plus className="mr-1.5 h-4 w-4" /> Add tier
          </Button>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">
          One card per coverage tier. Lists are one item per line — empty lines are dropped on save. At most one
          tier can carry the “Most Popular” badge (the first one switched on wins).
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {doc.tiers.map((tier, i) => (
            <div key={tier.id} className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tier {i + 1}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${tier.name || `tier ${i + 1}`}`}
                  title="Remove tier"
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => removeTier(tier.id)}
                  disabled={doc.tiers.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Input aria-label={`Tier ${i + 1} name`} value={tier.name} maxLength={120}
                onChange={(e) => updateTier(tier.id, { name: e.target.value })} placeholder="Standard Warranty" />
              <div className="grid grid-cols-2 gap-2">
                <Input aria-label={`Tier ${i + 1} duration`} value={tier.duration} maxLength={60}
                  onChange={(e) => updateTier(tier.id, { duration: e.target.value })} placeholder="3 Years" />
                <Input aria-label={`Tier ${i + 1} applies to`} value={tier.applies} maxLength={200}
                  onChange={(e) => updateTier(tier.id, { applies: e.target.value })} placeholder="Ek Series — Entry level" />
              </div>
              <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <span className="text-xs font-medium text-foreground">Most Popular badge</span>
                <Switch
                  aria-label={`Tier ${i + 1} most popular`}
                  checked={tier.popular}
                  onCheckedChange={(checked) => updateTier(tier.id, { popular: checked })}
                />
              </label>
              <div className="space-y-1.5">
                <Label htmlFor={`tier-cov-${tier.id}`}>Covered (one per line)</Label>
                <Textarea id={`tier-cov-${tier.id}`} rows={5} className="font-mono text-[11px] leading-5"
                  value={tier.coverage.join("\n")}
                  onChange={(e) => updateTier(tier.id, { coverage: e.target.value.split("\n") })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`tier-exc-${tier.id}`}>Not covered (one per line)</Label>
                <Textarea id={`tier-exc-${tier.id}`} rows={3} className="font-mono text-[11px] leading-5"
                  value={tier.excludes.join("\n")}
                  onChange={(e) => updateTier(tier.id, { excludes: e.target.value.split("\n") })} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Claim steps */}
      <SectionCard
        title="Claim process steps"
        action={
          <Button variant="outline" size="sm" onClick={addStep} disabled={doc.steps.length >= MAX_STEPS}>
            <Plus className="mr-1.5 h-4 w-4" /> Add step
          </Button>
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">The step number is derived from its position — reorder by rewriting, or add/remove steps (1–{MAX_STEPS}).</p>
        <div className="space-y-2">
          {doc.steps.map((step, i) => (
            <div key={step.id} className="flex items-start gap-3 rounded-lg border border-border bg-white p-3">
              <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-black text-accent-foreground">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-5">
                <Input aria-label={`Step ${i + 1} title`} className="sm:col-span-1" value={step.title} maxLength={120}
                  onChange={(e) => updateStep(step.id, { title: e.target.value })} placeholder="Contact Us" />
                <Textarea aria-label={`Step ${i + 1} description`} rows={2} className="sm:col-span-4 text-sm"
                  value={step.description} maxLength={600}
                  onChange={(e) => updateStep(step.id, { description: e.target.value })}
                  placeholder="Call the warranty line…" />
              </div>
              <button
                type="button"
                aria-label={`Remove step ${i + 1}`}
                title="Remove step"
                className="mt-1 rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => removeStep(step.id)}
                disabled={doc.steps.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* FAQs */}
      <SectionCard
        title="Warranty FAQs"
        action={
          <Button variant="outline" size="sm" onClick={addFaq} disabled={doc.faqs.length >= MAX_FAQS}>
            <Plus className="mr-1.5 h-4 w-4" /> Add FAQ
          </Button>
        }
      >
        <div className="space-y-2">
          {doc.faqs.map((faq, i) => (
            <div key={faq.id} className="rounded-lg border border-border bg-white p-3">
              <div className="flex items-center gap-2">
                <Input aria-label={`FAQ ${i + 1} question`} value={faq.q} maxLength={300}
                  onChange={(e) => updateFaq(faq.id, { q: e.target.value })} placeholder="Question…" className="font-semibold" />
                <button type="button" aria-label="Move FAQ up" title="Move up"
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                  onClick={() => moveFaq(i, -1)} disabled={i === 0}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Move FAQ down" title="Move down"
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-30"
                  onClick={() => moveFaq(i, 1)} disabled={i === doc.faqs.length - 1}>
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button type="button" aria-label={`Remove FAQ ${i + 1}`} title="Remove FAQ"
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                  onClick={() => removeFaq(faq.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Textarea aria-label={`FAQ ${i + 1} answer`} rows={2} maxLength={1000} className="mt-2 text-sm"
                value={faq.a} onChange={(e) => updateFaq(faq.id, { a: e.target.value })} placeholder="Answer…" />
            </div>
          ))}
          {doc.faqs.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No FAQs — the page will render without a FAQ section.
            </p>
          )}
        </div>
      </SectionCard>

      {/* Save bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-accent" />
          Changes are live on <code className="rounded bg-muted px-1">/warranty</code> as soon as you save — no deploy needed.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset} disabled={resetting || saving}
            className={confirmReset ? "bg-red-50 text-red-700 hover:bg-red-100" : ""}>
            {resetting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
            {confirmReset ? "Confirm reset?" : "Restore defaults"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving || resetting}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}
