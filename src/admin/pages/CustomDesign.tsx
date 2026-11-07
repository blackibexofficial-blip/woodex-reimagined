import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminCustomDesignPage, AdminCustomDesignSpaceItem, AdminCustomDesignTestimonial } from "@/api/types";
import { SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

let rowCounter = 0;
const rid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(rowCounter++).toString(36)}`;

const MAX_ITEMS = 9;
const MAX_BULLETS = 6;
const MAX_TESTIMONIALS = 6;

export default function AdminCustomDesign() {
  const api = useMemo(() => getAdminApi(), []);
  const [doc, setDoc] = useState<AdminCustomDesignPage | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const content = await api.getCustomDesignPage();
      setDoc(content);
    } catch {
      setLoadFailed(true);
      toast.error("Could not load custom design page content.");
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  /* ── scalar setters ─────────────────────────────────────────────── */
  const setHero = (patch: Partial<AdminCustomDesignPage["hero"]>) =>
    setDoc((d) => (d ? { ...d, hero: { ...d.hero, ...patch } } : d));
  const setWds = (patch: Partial<AdminCustomDesignPage["wds"]>) =>
    setDoc((d) => (d ? { ...d, wds: { ...d.wds, ...patch } } : d));
  const setSpaces = (patch: Partial<AdminCustomDesignPage["spaces"]>) =>
    setDoc((d) => (d ? { ...d, spaces: { ...d.spaces, ...patch } } : d));
  const setFurniture = (patch: Partial<AdminCustomDesignPage["furniture"]>) =>
    setDoc((d) => (d ? { ...d, furniture: { ...d.furniture, ...patch } } : d));
  const setDesignFirst = (patch: Partial<AdminCustomDesignPage["designFirst"]>) =>
    setDoc((d) => (d ? { ...d, designFirst: { ...d.designFirst, ...patch } } : d));
  const setTestimonialsIntro = (patch: Partial<AdminCustomDesignPage["testimonialsIntro"]>) =>
    setDoc((d) => (d ? { ...d, testimonialsIntro: { ...d.testimonialsIntro, ...patch } } : d));
  const setFinalCta = (patch: Partial<AdminCustomDesignPage["finalCta"]>) =>
    setDoc((d) => (d ? { ...d, finalCta: { ...d.finalCta, ...patch } } : d));

  /* ── space-work cards ───────────────────────────────────────────── */
  const updateItem = (id: string, patch: Partial<AdminCustomDesignSpaceItem>) =>
    setDoc((d) => (d ? { ...d, spaces: { ...d.spaces, items: d.spaces.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } } : d));
  const addItem = () =>
    setDoc((d) =>
      d && d.spaces.items.length < MAX_ITEMS
        ? { ...d, spaces: { ...d.spaces, items: [...d.spaces.items, { id: rid("sw"), label: "", blurb: "", slug: "custom-design" }] } }
        : d,
    );
  const removeItem = (id: string) =>
    setDoc((d) =>
      d && d.spaces.items.length > 1
        ? { ...d, spaces: { ...d.spaces, items: d.spaces.items.filter((it) => it.id !== id) } }
        : d,
    );
  const moveItem = (index: number, dir: -1 | 1) =>
    setDoc((d) => {
      if (!d) return d;
      const next = [...d.spaces.items];
      const j = index + dir;
      if (j < 0 || j >= next.length) return d;
      [next[index], next[j]] = [next[j], next[index]];
      return { ...d, spaces: { ...d.spaces, items: next } };
    });

  /* ── furniture bullets ──────────────────────────────────────────── */
  const setBullet = (index: number, value: string) =>
    setDoc((d) => {
      if (!d) return d;
      const bullets = [...d.furniture.bullets];
      bullets[index] = value;
      return { ...d, furniture: { ...d.furniture, bullets } };
    });
  const addBullet = () =>
    setDoc((d) => (d && d.furniture.bullets.length < MAX_BULLETS ? { ...d, furniture: { ...d.furniture, bullets: [...d.furniture.bullets, ""] } } : d));
  const removeBullet = (index: number) =>
    setDoc((d) => (d ? { ...d, furniture: { ...d.furniture, bullets: d.furniture.bullets.filter((_, i) => i !== index) } } : d));

  /* ── testimonials ───────────────────────────────────────────────── */
  const updateTestimonial = (id: string, patch: Partial<AdminCustomDesignTestimonial>) =>
    setDoc((d) => (d ? { ...d, testimonials: d.testimonials.map((t) => (t.id === id ? { ...t, ...patch } : t)) } : d));
  const addTestimonial = () =>
    setDoc((d) =>
      d && d.testimonials.length < MAX_TESTIMONIALS
        ? { ...d, testimonials: [...d.testimonials, { id: rid("cd-test"), text: "", name: "", role: "" }] }
        : d,
    );
  const removeTestimonial = (id: string) =>
    setDoc((d) => (d ? { ...d, testimonials: d.testimonials.filter((t) => t.id !== id) } : d));

  /* ── save / reset ───────────────────────────────────────────────── */
  const save = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const clean = await api.updateCustomDesignPage(doc);
      setDoc(clean);
      toast.success("Custom Design page saved — live on the storefront.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the custom design page.");
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
      const fresh = await api.resetCustomDesignPage();
      setDoc(fresh);
      toast.success("Custom Design content restored to the bundled defaults.");
    } catch {
      toast.error("Could not reset the custom design page.");
    } finally {
      setResetting(false);
    }
  };

  if (loadFailed) {
    return (
      <SectionCard title="Custom Design page">
        <EmptyState
          icon={RotateCcw}
          title="Could not load custom design content"
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
      <SectionCard title="Custom Design page">
        <SectionSkeleton rows={8} />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <SectionCard title="Custom Design — hero">
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cd-eyebrow">Eyebrow</Label>
            <Input id="cd-eyebrow" value={doc.hero.eyebrow} maxLength={120}
              onChange={(e) => setHero({ eyebrow: e.target.value })} placeholder="Bespoke Furniture Design" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-title">Title — one line per line (renders as stacked lines)</Label>
            <Textarea id="cd-title" rows={2} value={doc.hero.title} maxLength={160}
              onChange={(e) => setHero({ title: e.target.value })} placeholder={"Custom Design\nServices"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-subtitle">Subtitle</Label>
            <Textarea id="cd-subtitle" rows={3} value={doc.hero.subtitle} maxLength={800}
              onChange={(e) => setHero({ subtitle: e.target.value })}
              placeholder="Bring your vision to life…" />
          </div>
        </div>
      </SectionCard>

      {/* WDS studio */}
      <SectionCard title="WDS — visualize / design / shop block">
        <p className="mb-3 text-xs text-muted-foreground">Left column of the second section. Images and the Access WDS button are fixed by design. Heading renders one line per line.</p>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cd-wds-heading">Heading</Label>
            <Textarea id="cd-wds-heading" rows={2} value={doc.wds.heading} maxLength={200}
              onChange={(e) => setWds({ heading: e.target.value })} placeholder={"Visualize, Design\nand Shop with WDS"} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-wds-paragraph">Paragraph</Label>
            <Textarea id="cd-wds-paragraph" rows={4} value={doc.wds.paragraph} maxLength={1000}
              onChange={(e) => setWds({ paragraph: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-wds-subheading">Subheading</Label>
            <Input id="cd-wds-subheading" value={doc.wds.subheading} maxLength={160}
              onChange={(e) => setWds({ subheading: e.target.value })} placeholder="Unlimited variety in design" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-wds-v1">Variety paragraph (1)</Label>
            <Textarea id="cd-wds-v1" rows={2} value={doc.wds.varietyOne} maxLength={600}
              onChange={(e) => setWds({ varietyOne: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-wds-v2">Variety paragraph (2)</Label>
            <Textarea id="cd-wds-v2" rows={2} value={doc.wds.varietyTwo} maxLength={600}
              onChange={(e) => setWds({ varietyTwo: e.target.value })} />
          </div>
        </div>
      </SectionCard>

      {/* Space-work cards */}
      <SectionCard
        title="Make Your Space Work — service cards"
        action={
          <Button variant="outline" size="sm" onClick={addItem} disabled={doc.spaces.items.length >= MAX_ITEMS}>
            <Plus className="mr-1.5 h-4 w-4" /> Add card
          </Button>
        }
      >
        <div className="mb-4 grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cd-spaces-heading">Heading</Label>
            <Input id="cd-spaces-heading" value={doc.spaces.heading} maxLength={160}
              onChange={(e) => setSpaces({ heading: e.target.value })} placeholder="Make Your Space Work" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-spaces-subheading">Subheading</Label>
            <Textarea id="cd-spaces-subheading" rows={2} value={doc.spaces.subheading} maxLength={400}
              onChange={(e) => setSpaces({ subheading: e.target.value })} />
          </div>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">The 01/02/… number is derived from position. The slug links to <code className="rounded bg-muted px-1">/services/&lt;slug&gt;</code>.</p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {doc.spaces.items.map((item, i) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Card {i + 1}
                </span>
                <div className="flex items-center">
                  <button type="button" aria-label={`Move card ${i + 1} left`} title="Move left"
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted disabled:opacity-30"
                    onClick={() => moveItem(i, -1)} disabled={i === 0}>
                    <ArrowUp className="h-4 w-4 rotate-[-90deg]" />
                  </button>
                  <button type="button" aria-label={`Move card ${i + 1} right`} title="Move right"
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted disabled:opacity-30"
                    onClick={() => moveItem(i, 1)} disabled={i === doc.spaces.items.length - 1}>
                    <ArrowDown className="h-4 w-4 rotate-[-90deg]" />
                  </button>
                  <button type="button" aria-label={`Remove card ${i + 1}`} title="Remove card"
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => removeItem(item.id)} disabled={doc.spaces.items.length <= 1}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <Input aria-label={`Card ${i + 1} label`} value={item.label} maxLength={100}
                onChange={(e) => updateItem(item.id, { label: e.target.value })} placeholder="3D Rendered Floor Plan" />
              <Textarea aria-label={`Card ${i + 1} blurb`} rows={2} value={item.blurb} maxLength={320}
                onChange={(e) => updateItem(item.id, { blurb: e.target.value })} />
              <Input aria-label={`Card ${i + 1} services slug`} value={item.slug} maxLength={80}
                onChange={(e) => updateItem(item.id, { slug: e.target.value })} placeholder="space-planning-design" />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Custom office furniture */}
      <SectionCard
        title="Custom Office Furniture — split row"
        action={
          <Button variant="outline" size="sm" onClick={addBullet} disabled={doc.furniture.bullets.length >= MAX_BULLETS}>
            <Plus className="mr-1.5 h-4 w-4" /> Add bullet
          </Button>
        }
      >
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cd-furniture-heading">Heading</Label>
            <Input id="cd-furniture-heading" value={doc.furniture.heading} maxLength={200}
              onChange={(e) => setFurniture({ heading: e.target.value })} placeholder="Custom Office Furniture" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-furniture-paragraph">Paragraph</Label>
            <Textarea id="cd-furniture-paragraph" rows={3} value={doc.furniture.paragraph} maxLength={1000}
              onChange={(e) => setFurniture({ paragraph: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Bullet list (1–{MAX_BULLETS})</Label>
            {doc.furniture.bullets.map((bullet, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label={`Bullet ${i + 1}`} value={bullet} maxLength={200}
                  onChange={(e) => setBullet(i, e.target.value)} />
                <button type="button" aria-label={`Remove bullet ${i + 1}`} title="Remove bullet"
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                  onClick={() => removeBullet(i)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {doc.furniture.bullets.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-4 py-3 text-center text-xs text-muted-foreground">
                No bullets — the checklist will render empty.
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Design first */}
      <SectionCard title="Design first, build once — split row">
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cd-df-heading">Heading</Label>
            <Input id="cd-df-heading" value={doc.designFirst.heading} maxLength={200}
              onChange={(e) => setDesignFirst({ heading: e.target.value })} placeholder="Design first, build once" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-df-body1">Paragraph (1)</Label>
            <Textarea id="cd-df-body1" rows={3} value={doc.designFirst.bodyOne} maxLength={1200}
              onChange={(e) => setDesignFirst({ bodyOne: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-df-body2">Paragraph (2)</Label>
            <Textarea id="cd-df-body2" rows={3} value={doc.designFirst.bodyTwo} maxLength={1200}
              onChange={(e) => setDesignFirst({ bodyTwo: e.target.value })} />
          </div>
        </div>
      </SectionCard>

      {/* Testimonials */}
      <SectionCard
        title="Client testimonials"
        action={
          <Button variant="outline" size="sm" onClick={addTestimonial} disabled={doc.testimonials.length >= MAX_TESTIMONIALS}>
            <Plus className="mr-1.5 h-4 w-4" /> Add testimonial
          </Button>
        }
      >
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cd-testi-heading">Heading</Label>
            <Input id="cd-testi-heading" value={doc.testimonialsIntro.heading} maxLength={160}
              onChange={(e) => setTestimonialsIntro({ heading: e.target.value })} placeholder="What Our Clients Say" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-testi-subheading">Subheading</Label>
            <Input id="cd-testi-subheading" value={doc.testimonialsIntro.subheading} maxLength={200}
              onChange={(e) => setTestimonialsIntro({ subheading: e.target.value })} placeholder="Trusted by leading organisations across Pakistan" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {doc.testimonials.map((t, i) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-lg border border-border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Testimonial {i + 1}
                </span>
                <button type="button" aria-label={`Remove testimonial ${i + 1}`} title="Remove testimonial"
                  className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
                  onClick={() => removeTestimonial(t.id)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Textarea aria-label={`Testimonial ${i + 1} text`} rows={3} value={t.text} maxLength={700}
                onChange={(e) => updateTestimonial(t.id, { text: e.target.value })} />
              <Input aria-label={`Testimonial ${i + 1} name`} value={t.name} maxLength={120}
                onChange={(e) => updateTestimonial(t.id, { name: e.target.value })} placeholder="Bilal Ahmed" />
              <Input aria-label={`Testimonial ${i + 1} role`} value={t.role} maxLength={160}
                onChange={(e) => updateTestimonial(t.id, { role: e.target.value })} placeholder="Allied Bank Limited" />
            </div>
          ))}
          {doc.testimonials.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground md:col-span-2 lg:col-span-3">
              No testimonials — the section will render without the grid.
            </p>
          )}
        </div>
      </SectionCard>

      {/* Closing CTA */}
      <SectionCard title="Closing CTA">
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cd-cta-heading">Heading</Label>
            <Input id="cd-cta-heading" value={doc.finalCta.heading} maxLength={200}
              onChange={(e) => setFinalCta({ heading: e.target.value })} placeholder="Ready to Design Your Office?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cd-cta-paragraph">Paragraph</Label>
            <Textarea id="cd-cta-paragraph" rows={2} value={doc.finalCta.paragraph} maxLength={400}
              onChange={(e) => setFinalCta({ paragraph: e.target.value })} />
          </div>
        </div>
      </SectionCard>

      {/* Save bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
        <p className="text-xs text-muted-foreground">
          Changes are live on <code className="rounded bg-muted px-1">/custom-design</code> as soon as you save — no deploy needed.
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
