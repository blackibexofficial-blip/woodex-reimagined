import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminVirtualShowroomFeature, AdminVirtualShowroomFeatureIcon, AdminVirtualShowroomPage } from "@/api/types";
import { SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

let rowCounter = 0;
const rid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(rowCounter++).toString(36)}`;

const MAX_FEATURES = 8;

const ICON_OPTIONS: Array<{ value: AdminVirtualShowroomFeatureIcon; label: string }> = [
  { value: "monitor", label: "Monitor — 3D Preview" },
  { value: "rotate", label: "Rotate — 360° View" },
  { value: "palette", label: "Palette — Colors & Materials" },
  { value: "maximize", label: "Maximize — Space Planning" },
  { value: "users", label: "Users — Collaboration" },
  { value: "box", label: "Box — Save & Export" },
];

export default function AdminVirtualShowroom() {
  const api = useMemo(() => getAdminApi(), []);
  const [doc, setDoc] = useState<AdminVirtualShowroomPage | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const content = await api.getVirtualShowroomPage();
      setDoc(content);
    } catch {
      setLoadFailed(true);
      toast.error("Could not load virtual showroom content.");
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  /* ── scalar setters ─────────────────────────────────────────────── */
  const setHero = (patch: Partial<AdminVirtualShowroomPage["hero"]>) =>
    setDoc((d) => (d ? { ...d, hero: { ...d.hero, ...patch } } : d));
  const setConfigurator = (patch: Partial<AdminVirtualShowroomPage["configurator"]>) =>
    setDoc((d) => (d ? { ...d, configurator: { ...d.configurator, ...patch } } : d));
  const setFeaturesIntro = (patch: Partial<AdminVirtualShowroomPage["featuresIntro"]>) =>
    setDoc((d) => (d ? { ...d, featuresIntro: { ...d.featuresIntro, ...patch } } : d));
  const setFinalCta = (patch: Partial<AdminVirtualShowroomPage["finalCta"]>) =>
    setDoc((d) => (d ? { ...d, finalCta: { ...d.finalCta, ...patch } } : d));

  /* ── features ───────────────────────────────────────────────────── */
  const updateFeature = (id: string, patch: Partial<AdminVirtualShowroomFeature>) =>
    setDoc((d) => {
      if (!d) return d;
      const features = d.features.map((f) => (f.id === id ? { ...f, ...patch } : f));
      return { ...d, features };
    });
  const addFeature = () =>
    setDoc((d) =>
      d && d.features.length < MAX_FEATURES
        ? { ...d, features: [...d.features, { id: rid("vs-feature"), icon: "box", title: "", description: "" }] }
        : d,
    );
  const removeFeature = (id: string) =>
    setDoc((d) => (d && d.features.length > 1 ? { ...d, features: d.features.filter((f) => f.id !== id) } : d));

  /* ── save / reset ───────────────────────────────────────────────── */
  const save = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const clean = await api.updateVirtualShowroomPage(doc);
      setDoc(clean);
      toast.success("Virtual Showroom page saved — live on the storefront.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the virtual showroom page.");
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
      const fresh = await api.resetVirtualShowroomPage();
      setDoc(fresh);
      toast.success("Virtual Showroom content restored to the bundled defaults.");
    } catch {
      toast.error("Could not reset the virtual showroom content.");
    } finally {
      setResetting(false);
    }
  };

  if (loadFailed) {
    return (
      <SectionCard title="Virtual Showroom">
        <EmptyState
          icon={RotateCcw}
          title="Could not load virtual showroom content"
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
      <SectionCard title="Virtual Showroom">
        <SectionSkeleton rows={6} />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <SectionCard title="Virtual Showroom — hero">
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="vs-eyebrow">Eyebrow</Label>
            <Input id="vs-eyebrow" value={doc.hero.eyebrow} maxLength={120}
              onChange={(e) => setHero({ eyebrow: e.target.value })} placeholder="Experience It First" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vs-title">Title</Label>
            <Input id="vs-title" value={doc.hero.title} maxLength={160}
              onChange={(e) => setHero({ title: e.target.value })} placeholder="Virtual Showroom" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vs-subtitle">Subtitle</Label>
            <Textarea id="vs-subtitle" rows={2} value={doc.hero.subtitle} maxLength={600}
              onChange={(e) => setHero({ subtitle: e.target.value })} />
          </div>
        </div>
      </SectionCard>

      {/* Configurator intro */}
      <SectionCard title="Room configurator — intro">
        <p className="mb-3 text-xs text-muted-foreground">Heading above the 3D room tool. The configurator itself is interactive software — not editable here.</p>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="vs-config-heading">Heading</Label>
            <Input id="vs-config-heading" value={doc.configurator.heading} maxLength={160}
              onChange={(e) => setConfigurator({ heading: e.target.value })} placeholder="Interactive Room Configurator" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vs-config-intro">Intro paragraph</Label>
            <Textarea id="vs-config-intro" rows={2} value={doc.configurator.intro} maxLength={400}
              onChange={(e) => setConfigurator({ intro: e.target.value })} />
          </div>
        </div>
      </SectionCard>

      {/* Features */}
      <SectionCard
        title="Features grid"
        action={
          <Button variant="outline" size="sm" onClick={addFeature} disabled={doc.features.length >= MAX_FEATURES}>
            <Plus className="mr-1.5 h-4 w-4" /> Add feature
          </Button>
        }
      >
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="vs-features-heading">Heading</Label>
            <Input id="vs-features-heading" value={doc.featuresIntro.heading} maxLength={160}
              onChange={(e) => setFeaturesIntro({ heading: e.target.value })} placeholder="Virtual Showroom Features" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vs-features-subheading">Subheading</Label>
            <Input id="vs-features-subheading" value={doc.featuresIntro.subheading} maxLength={200}
              onChange={(e) => setFeaturesIntro({ subheading: e.target.value })} placeholder="Experience furniture shopping like never before" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {doc.features.map((feature, i) => (
            <div key={feature.id} className="flex flex-col gap-2 rounded-lg border border-border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Feature {i + 1}
                </span>
                <button type="button" aria-label={`Remove feature ${i + 1}`} title="Remove feature"
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => removeFeature(feature.id)} disabled={doc.features.length <= 1}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-foreground">Icon</span>
                <select aria-label={`Feature ${i + 1} icon`} value={feature.icon}
                  onChange={(e) => updateFeature(feature.id, { icon: e.target.value as AdminVirtualShowroomFeatureIcon })}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-accent">
                  {ICON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <Input aria-label={`Feature ${i + 1} title`} value={feature.title} maxLength={120}
                onChange={(e) => updateFeature(feature.id, { title: e.target.value })} placeholder="Real-Time 3D Preview" />
              <Textarea aria-label={`Feature ${i + 1} description`} rows={3} value={feature.description} maxLength={300}
                onChange={(e) => updateFeature(feature.id, { description: e.target.value })} />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Closing CTA */}
      <SectionCard title="Closing CTA">
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="vs-cta-heading">Heading</Label>
            <Input id="vs-cta-heading" value={doc.finalCta.heading} maxLength={200}
              onChange={(e) => setFinalCta({ heading: e.target.value })} placeholder="Ready to Design Your Dream Office?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vs-cta-paragraph">Paragraph</Label>
            <Textarea id="vs-cta-paragraph" rows={2} value={doc.finalCta.paragraph} maxLength={400}
              onChange={(e) => setFinalCta({ paragraph: e.target.value })} />
          </div>
        </div>
      </SectionCard>

      {/* Save bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
        <p className="text-xs text-muted-foreground">
          Changes are live on <code className="rounded bg-muted px-1">/virtual-showroom</code> as soon as you save — no deploy needed.
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
