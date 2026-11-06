import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Briefcase, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type {
  AdminService,
  AdminServiceBenefit,
  AdminServiceFaq,
  AdminServiceProcessStep,
  NewServiceInput,
} from "@/api/types";
import { SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type StepForm = AdminServiceProcessStep;
type BenefitForm = AdminServiceBenefit;
type FaqForm = AdminServiceFaq;

type ServiceForm = {
  slug: string;
  number: string;
  title: string;
  shortTitle: string;
  tagline: string;
  hero: string;
  intro: string;
  metaTitle: string;
  metaDescription: string;
  overviewHeading: string;
  overviewBody: string;
  steps: StepForm[];
  benefits: BenefitForm[];
  inclusions: string;
  faqs: FaqForm[];
  caseClient: string;
  caseSector: string;
  caseResult: string;
  related: string[];
  active: boolean;
  sortOrder: string;
};

const emptyForm: ServiceForm = {
  slug: "",
  number: "",
  title: "",
  shortTitle: "",
  tagline: "",
  hero: "",
  intro: "",
  metaTitle: "",
  metaDescription: "",
  overviewHeading: "",
  overviewBody: "",
  steps: [],
  benefits: [],
  inclusions: "",
  faqs: [],
  caseClient: "",
  caseSector: "",
  caseResult: "",
  related: [],
  active: true,
  sortOrder: "",
};

const sectionCls = "text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground pt-1 border-t border-border";

export default function AdminServices() {
  const api = useMemo(() => getAdminApi(), []);
  const [items, setItems] = useState<AdminService[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [dialog, setDialog] = useState<null | { mode: "create" } | { mode: "edit"; service: AdminService }>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminService | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listServices());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load services");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) =>
      [s.title, s.shortTitle, s.tagline, s.slug, s.number].some((f) => f.toLowerCase().includes(q)),
    );
  }, [items, query]);

  const openCreate = () => {
    const maxOrder = Math.max(0, ...items.map((i) => i.sortOrder));
    const maxNumber = items.reduce((m, s) => Math.max(m, parseInt(s.number, 10) || 0), 0);
    setForm({ ...emptyForm, number: String(maxNumber + 1).padStart(2, "0"), sortOrder: String(maxOrder + 10) });
    setFormError(null);
    setDialog({ mode: "create" });
  };

  const openEdit = (service: AdminService) => {
    setForm({
      slug: service.slug,
      number: service.number,
      title: service.title,
      shortTitle: service.shortTitle,
      tagline: service.tagline,
      hero: service.hero,
      intro: service.intro,
      metaTitle: service.metaTitle,
      metaDescription: service.metaDescription,
      overviewHeading: service.overview.heading,
      overviewBody: service.overview.body,
      steps: service.process.map((s) => ({ ...s })),
      benefits: service.benefits.map((b) => ({ ...b })),
      inclusions: service.inclusions.join("\n"),
      faqs: service.faqs.map((f) => ({ ...f })),
      caseClient: service.caseStudy.client,
      caseSector: service.caseStudy.sector,
      caseResult: service.caseStudy.result,
      related: [...service.related],
      active: service.active,
      sortOrder: String(service.sortOrder),
    });
    setFormError(null);
    setDialog({ mode: "edit", service });
  };

  /* generic list helpers */
  const moveRow = <K extends "steps" | "benefits" | "faqs">(key: K, idx: number, dir: -1 | 1) =>
    setForm((f) => {
      const target = idx + dir;
      if (target < 0 || target >= f[key].length) return f;
      const rows = [...f[key]];
      [rows[idx], rows[target]] = [rows[target], rows[idx]];
      return { ...f, [key]: rows };
    });
  const removeRow = <K extends "steps" | "benefits" | "faqs">(key: K, idx: number) =>
    setForm((f) => ({ ...f, [key]: f[key].filter((_, i) => i !== idx) }));
  const updateRow = <K extends "steps" | "benefits" | "faqs">(key: K, idx: number, patch: Partial<ServiceForm[K][number]>) =>
    setForm((f) => ({ ...f, [key]: f[key].map((row, i) => (i === idx ? { ...row, ...patch } : row)) }));

  const handleSave = async () => {
    const title = form.title.trim();
    const hero = form.hero.trim();
    if (!title) return setFormError("Give the service a title.");
    if (!hero) return setFormError("Add a hero image URL — the /services grid depends on it.");

    const payload: NewServiceInput = {
      title,
      slug: dialog?.mode === "create" ? form.slug.trim() || undefined : undefined,
      number: form.number.trim() || undefined,
      shortTitle: form.shortTitle.trim() || undefined,
      tagline: form.tagline.trim() || undefined,
      hero,
      intro: form.intro.trim() || undefined,
      metaTitle: form.metaTitle.trim() || undefined,
      metaDescription: form.metaDescription.trim() || undefined,
      overview: { heading: form.overviewHeading.trim(), body: form.overviewBody.trim() },
      process: form.steps.filter((s) => s.title.trim() || s.description.trim()).map((s) => ({ ...s, step: s.step.trim(), title: s.title.trim(), description: s.description.trim() })),
      benefits: form.benefits.filter((b) => b.title.trim() || b.description.trim()).map((b) => ({ title: b.title.trim(), description: b.description.trim() })),
      inclusions: form.inclusions.split("\n").map((l) => l.trim()).filter(Boolean),
      faqs: form.faqs.filter((f) => f.q.trim() || f.a.trim()).map((f) => ({ q: f.q.trim(), a: f.a.trim() })),
      caseStudy: { client: form.caseClient.trim(), sector: form.caseSector.trim(), result: form.caseResult.trim() },
      related: form.related,
      active: form.active,
      sortOrder: form.sortOrder.trim() ? Number(form.sortOrder) : undefined,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (dialog?.mode === "edit") {
        await api.updateService(dialog.service.slug, payload);
        toast.success(`Updated “${title}”`);
      } else {
        await api.createService(payload);
        toast.success(`Created “${title}”`);
      }
      setDialog(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (service: AdminService) => {
    try {
      await api.setServiceActive(service.slug, !service.active);
      setItems((prev) => prev.map((s) => (s.slug === service.slug ? { ...s, active: !s.active } : s)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not toggle visibility");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const okFlag = await api.deleteService(deleteTarget.slug);
      if (okFlag) {
        toast.success(`Deleted “${deleteTarget.title}”`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Service not found — refresh and try again.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, slug, number…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
          <Plus className="mr-1.5 h-4 w-4" /> Add service
        </Button>
      </div>

      <SectionCard title="Services Catalogue">
        {loading ? (
          <SectionSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Briefcase} title="No services match" hint="Adjust the search or add a new service line." />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Tagline</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>FAQs</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.slug} className={s.active ? undefined : "opacity-50"}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.number}</TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug max-w-[200px]">{s.title}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">/services/{s.slug}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[240px] line-clamp-2">{s.tagline}</TableCell>
                    <TableCell className="text-sm">{s.process.length}</TableCell>
                    <TableCell className="text-sm">{s.faqs.length}</TableCell>
                    <TableCell>
                      <Switch checked={s.active} onCheckedChange={() => handleToggleActive(s)} aria-label={`Toggle ${s.title}`} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} aria-label={`Edit ${s.title}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)} aria-label={`Delete ${s.title}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Seeded from the bundled catalogue on first load — the /services grid, /services/:slug pages, related-services
          rail and the left-rail showcase all read this slice. Inactive services vanish from the storefront; direct URLs
          redirect to /services. Sitemap is build-time static — new services enter it on the next deploy.
        </p>
      </SectionCard>

      {/* Create / edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? `Edit — ${dialog.service.title}` : "Add service"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className={sectionCls + " border-t-0 pt-0"}>Core</p>
            <div className="grid grid-cols-[64px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="svc-number">#</Label>
                <Input id="svc-number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-title">Title *</Label>
                <Input id="svc-title" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Custom Office Furniture Design" />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="svc-short">Short title</Label>
                <Input id="svc-short" value={form.shortTitle} onChange={(e) => setForm({ ...form, shortTitle: e.target.value })} placeholder="Custom Design" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-slug">URL slug{dialog?.mode === "edit" ? " (locked)" : " (auto)"}</Label>
                <Input id="svc-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} disabled={dialog?.mode === "edit"} placeholder="custom-design" className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-tagline">Tagline</Label>
              <Input id="svc-tagline" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-hero">Hero image *</Label>
              <Input id="svc-hero" value={form.hero} onChange={(e) => setForm({ ...form, hero: e.target.value })} placeholder="https://… or data:image/webp;base64,…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-intro">Intro</Label>
              <Textarea id="svc-intro" rows={2} value={form.intro} onChange={(e) => setForm({ ...form, intro: e.target.value })} />
            </div>

            <p className={sectionCls}>SEO</p>
            <div className="space-y-1.5">
              <Label htmlFor="svc-metatitle">Meta title</Label>
              <Input id="svc-metatitle" value={form.metaTitle} onChange={(e) => setForm({ ...form, metaTitle: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-metadesc">Meta description</Label>
              <Textarea id="svc-metadesc" rows={2} value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} />
            </div>

            <p className={sectionCls}>Overview</p>
            <div className="space-y-1.5">
              <Label htmlFor="svc-overview-heading">Heading</Label>
              <Input id="svc-overview-heading" value={form.overviewHeading} onChange={(e) => setForm({ ...form, overviewHeading: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-overview-body">Body</Label>
              <Textarea id="svc-overview-body" rows={3} value={form.overviewBody} onChange={(e) => setForm({ ...form, overviewBody: e.target.value })} />
            </div>

            <p className={sectionCls}>Process steps</p>
            <div className="space-y-2">
              {form.steps.map((step, idx) => (
                <div key={idx} className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input aria-label={`Step ${idx + 1} number`} value={step.step} onChange={(e) => updateRow("steps", idx, { step: e.target.value })} className="w-16 h-9 font-mono" />
                    <Input aria-label={`Step ${idx + 1} title`} value={step.title} onChange={(e) => updateRow("steps", idx, { title: e.target.value })} placeholder="Brief & Site Visit" className="h-9" />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => moveRow("steps", idx, -1)} disabled={idx === 0} aria-label="Move step up"><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => moveRow("steps", idx, 1)} disabled={idx === form.steps.length - 1} aria-label="Move step down"><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={() => removeRow("steps", idx)} aria-label="Remove step"><X className="h-4 w-4" /></Button>
                  </div>
                  <Textarea aria-label={`Step ${idx + 1} description`} rows={2} value={step.description} onChange={(e) => updateRow("steps", idx, { description: e.target.value })} placeholder="What happens in this step…" />
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, { step: String(f.steps.length + 1).padStart(2, "0"), title: "", description: "" }] }))}>
              <Plus className="mr-1.5 h-4 w-4" /> Add step
            </Button>

            <p className={sectionCls}>Benefits</p>
            <div className="space-y-2">
              {form.benefits.map((benefit, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex-1 space-y-2">
                    <Input aria-label={`Benefit ${idx + 1} title`} value={benefit.title} onChange={(e) => updateRow("benefits", idx, { title: e.target.value })} placeholder="Brand-Aligned" className="h-9" />
                    <Input aria-label={`Benefit ${idx + 1} description`} value={benefit.description} onChange={(e) => updateRow("benefits", idx, { description: e.target.value })} placeholder="One line on why it matters…" className="h-9" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveRow("benefits", idx, -1)} disabled={idx === 0} aria-label="Move benefit up"><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => moveRow("benefits", idx, 1)} disabled={idx === form.benefits.length - 1} aria-label="Move benefit down"><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeRow("benefits", idx)} aria-label="Remove benefit"><X className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, benefits: [...f.benefits, { title: "", description: "" }] }))}>
              <Plus className="mr-1.5 h-4 w-4" /> Add benefit
            </Button>

            <p className={sectionCls}>Inclusions (one per line)</p>
            <Textarea id="svc-inclusions" rows={3} value={form.inclusions} onChange={(e) => setForm({ ...form, inclusions: e.target.value })} placeholder={"Free on-site design consultation\nUnlimited revisions before production sign-off"} />

            <p className={sectionCls}>FAQs</p>
            <div className="space-y-2">
              {form.faqs.map((faq, idx) => (
                <div key={idx} className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input aria-label={`FAQ ${idx + 1} question`} value={faq.q} onChange={(e) => updateRow("faqs", idx, { q: e.target.value })} placeholder="Question…" className="h-9 font-medium" />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => moveRow("faqs", idx, -1)} disabled={idx === 0} aria-label="Move FAQ up"><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => moveRow("faqs", idx, 1)} disabled={idx === form.faqs.length - 1} aria-label="Move FAQ down"><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={() => removeRow("faqs", idx)} aria-label="Remove FAQ"><X className="h-4 w-4" /></Button>
                  </div>
                  <Textarea aria-label={`FAQ ${idx + 1} answer`} rows={2} value={faq.a} onChange={(e) => updateRow("faqs", idx, { a: e.target.value })} placeholder="Answer…" />
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, faqs: [...f.faqs, { q: "", a: "" }] }))}>
              <Plus className="mr-1.5 h-4 w-4" /> Add FAQ
            </Button>

            <p className={sectionCls}>Case study</p>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="svc-case-client">Client</Label>
                <Input id="svc-case-client" value={form.caseClient} onChange={(e) => setForm({ ...form, caseClient: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-case-sector">Sector</Label>
                <Input id="svc-case-sector" value={form.caseSector} onChange={(e) => setForm({ ...form, caseSector: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-case-result">Result</Label>
                <Input id="svc-case-result" value={form.caseResult} onChange={(e) => setForm({ ...form, caseResult: e.target.value })} />
              </div>
            </div>

            <p className={sectionCls}>Related services</p>
            <div className="flex flex-wrap gap-1.5">
              {items.filter((s) => s.slug !== form.slug).map((s) => {
                const on = form.related.includes(s.slug);
                return (
                  <button
                    key={s.slug}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setForm((f) => ({ ...f, related: on ? f.related.filter((r) => r !== s.slug) : [...f.related, s.slug] }))
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      on ? "border-accent bg-accent text-accent-foreground" : "border-border bg-muted text-muted-foreground hover:border-accent/60"
                    }`}
                  >
                    {s.shortTitle || s.title}
                  </button>
                );
              })}
              {items.filter((s) => s.slug !== form.slug).length === 0 && (
                <p className="text-xs text-muted-foreground">No other services yet — create them first, then link.</p>
              )}
            </div>

            <p className={sectionCls}>Visibility</p>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/40 px-3 py-2.5">
              <div>
                <Label htmlFor="svc-active">Published</Label>
                <p className="text-[11px] text-muted-foreground">Unpublished services disappear from /services; URLs redirect there.</p>
              </div>
              <Switch id="svc-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="svc-sort">Sort order</Label>
                <Input id="svc-sort" type="number" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              </div>
            </div>

            {formError && <p className="text-xs font-medium text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {saving ? "Saving…" : dialog?.mode === "edit" ? "Save changes" : "Add service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.title}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The service is removed from the catalogue and the demo DB. Any services linking to it will silently drop the link from their
            “Related services” rail on next save.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep it</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
