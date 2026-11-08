import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, Pencil, Plus, Ruler, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import { projectCategories } from "@/data/projects";
import type { AdminProject, NewProjectInput } from "@/api/types";
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
import ProjectPracticeDialog from "@/admin/pages/ProjectPracticeDialog";

type ProjectForm = {
  title: string;
  client: string;
  category: string;
  image: string;
  beforeImage: string;
  location: string;
  sqft: string;
  year: string;
  employees: string;
  duration: string;
  description: string;
  challenge: string;
  solution: string;
  furnitureUsed: string;
  testimonialText: string;
  testimonialAuthor: string;
  testimonialRole: string;
  rating: string;
  active: boolean;
  sortOrder: string;
};

const emptyForm: ProjectForm = {
  title: "",
  client: "",
  category: "Corporate",
  image: "",
  beforeImage: "",
  location: "",
  sqft: "",
  year: "",
  employees: "",
  duration: "",
  description: "",
  challenge: "",
  solution: "",
  furnitureUsed: "",
  testimonialText: "",
  testimonialAuthor: "",
  testimonialRole: "",
  rating: "",
  active: true,
  sortOrder: "",
};

const inputCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const sectionCls = "text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground pt-1 border-t border-border";

export default function AdminProjects() {
  const api = useMemo(() => getAdminApi(), []);
  const [items, setItems] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const [dialog, setDialog] = useState<null | { mode: "create" } | { mode: "edit"; project: AdminProject }>(null);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminProject | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [practiceProject, setPracticeProject] = useState<AdminProject | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listProjects());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryOptions = useMemo(
    () => [...new Set([...projectCategories, ...items.map((i) => i.category)])].filter(Boolean).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return [p.title, p.client, p.location, p.category].some((f) => f.toLowerCase().includes(q));
    });
  }, [items, category, query]);

  const openCreate = () => {
    setForm({ ...emptyForm, sortOrder: String(Math.max(0, ...items.map((i) => i.sortOrder)) + 10) });
    setFormError(null);
    setDialog({ mode: "create" });
  };

  const openEdit = (project: AdminProject) => {
    setForm({
      title: project.title,
      client: project.client,
      category: project.category,
      image: project.image,
      beforeImage: project.beforeImage ?? "",
      location: project.location,
      sqft: project.sqft,
      year: project.year,
      employees: project.employees,
      duration: project.duration,
      description: project.description,
      challenge: project.challenge ?? "",
      solution: project.solution ?? "",
      furnitureUsed: project.furnitureUsed.join("\n"),
      testimonialText: project.testimonial?.text ?? "",
      testimonialAuthor: project.testimonial?.author ?? "",
      testimonialRole: project.testimonial?.role ?? "",
      rating: project.rating !== undefined ? String(project.rating) : "",
      active: project.active,
      sortOrder: String(project.sortOrder),
    });
    setFormError(null);
    setDialog({ mode: "edit", project });
  };

  const handleSave = async () => {
    const title = form.title.trim();
    const client = form.client.trim();
    const categoryValue = form.category.trim();
    const image = form.image.trim();
    if (!title || !client || !categoryValue) {
      setFormError("Title, client and category are required.");
      return;
    }
    if (!image) {
      setFormError("A portfolio piece needs an image URL — paste a hosted URL or a Media-library data URL.");
      return;
    }
    const rating = form.rating.trim() ? Math.max(0, Math.min(5, Math.round(Number(form.rating) || 0))) : undefined;
    const testimonialText = form.testimonialText.trim();
    const payload: NewProjectInput = {
      title,
      client,
      category: categoryValue,
      image,
      beforeImage: form.beforeImage.trim() || undefined,
      location: form.location.trim(),
      sqft: form.sqft.trim(),
      year: form.year.trim(),
      employees: form.employees.trim(),
      duration: form.duration.trim(),
      description: form.description.trim(),
      challenge: form.challenge.trim() || undefined,
      solution: form.solution.trim() || undefined,
      furnitureUsed: form.furnitureUsed.split("\n").map((l) => l.trim()).filter(Boolean),
      testimonial: testimonialText
        ? { text: testimonialText, author: form.testimonialAuthor.trim() || "WOODEX Client", role: form.testimonialRole.trim() || "" }
        : undefined,
      rating,
      active: form.active,
      sortOrder: form.sortOrder.trim() ? Number(form.sortOrder) : undefined,
    };
    setSaving(true);
    setFormError(null);
    try {
      if (dialog?.mode === "edit") {
        await api.updateProject(dialog.project.id, payload);
        toast.success(`Updated “${title}”`);
      } else {
        await api.createProject(payload);
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

  const handleToggleActive = async (project: AdminProject) => {
    try {
      await api.setProjectActive(project.id, !project.active);
      setItems((prev) => prev.map((p) => (p.id === project.id ? { ...p, active: !p.active } : p)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not toggle visibility");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const okFlag = await api.deleteProject(deleteTarget.id);
      if (okFlag) {
        toast.success(`Deleted “${deleteTarget.title}”`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Project not found — refresh and try again.");
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
        <div className="flex items-center gap-2">
          <select aria-label="Filter category" className={inputCls + " w-auto"} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories ({items.length})</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="relative sm:max-w-xs w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search title, client, location…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
        </div>
        <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
          <Plus className="mr-1.5 h-4 w-4" /> Add project
        </Button>
      </div>

      <SectionCard title="Projects & Case Studies">
        {loading ? (
          <SectionSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Briefcase} title="No projects match" hint="Adjust the filter or add a new case study." />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Image</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} className={p.active ? undefined : "opacity-50"}>
                    <TableCell>
                      <img src={p.image} alt={p.title} loading="lazy" className="h-12 w-20 rounded-sm border border-border object-cover" />
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug max-w-[240px]">{p.title}</p>
                      <p className="text-[11px] text-muted-foreground">{p.client}</p>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{p.category}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{p.location || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.year || "—"}</TableCell>
                    <TableCell>
                      {p.rating ? (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{p.rating}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch checked={p.active} onCheckedChange={() => handleToggleActive(p)} aria-label={`Toggle ${p.title}`} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Practice workspace — BOQ · milestones · files" onClick={() => setPracticeProject(p)} aria-label={`Practice workspace for ${p.title}`}>
                          <Ruler className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} aria-label={`Edit ${p.title}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(p)} aria-label={`Delete ${p.title}`}>
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
          Seeded from the storefront portfolio on first load. Inactive projects disappear from /projects and /projects/:id —
          direct URLs return “Project Not Found”, which is the intended hide behaviour.
        </p>
      </SectionCard>

      {/* Create / edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? "Edit project" : "Add project"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className={sectionCls + " border-t-0 pt-0"}>Core</p>
            <div className="space-y-1.5">
              <Label htmlFor="proj-title">Title *</Label>
              <Input id="proj-title" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="DHA Corporate Tower" />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proj-client">Client *</Label>
                <Input id="proj-client" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="DHA Developers" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-category">Category *</Label>
                <select id="proj-category" className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="proj-location">Location</Label>
                <Input id="proj-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Lahore" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-sqft">Size</Label>
                <Input id="proj-sqft" value={form.sqft} onChange={(e) => setForm({ ...form, sqft: e.target.value })} placeholder="12,000 sq ft" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-year">Year</Label>
                <Input id="proj-year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} placeholder="2024" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proj-employees">Staff / users</Label>
                <Input id="proj-employees" value={form.employees} onChange={(e) => setForm({ ...form, employees: e.target.value })} placeholder="250+" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-duration">Duration</Label>
                <Input id="proj-duration" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="8 weeks" />
              </div>
            </div>

            <p className={sectionCls}>Images</p>
            <div className="space-y-1.5">
              <Label htmlFor="proj-image">Hero image *</Label>
              <Input id="proj-image" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="https://… or data:image/webp;base64,…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-before">Before image (optional)</Label>
              <Input id="proj-before" value={form.beforeImage} onChange={(e) => setForm({ ...form, beforeImage: e.target.value })} placeholder="Enables the Before / After slider on the case-study page" />
            </div>

            <p className={sectionCls}>Content</p>
            <div className="space-y-1.5">
              <Label htmlFor="proj-description">Overview</Label>
              <Textarea id="proj-description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proj-challenge">The challenge</Label>
                <Textarea id="proj-challenge" rows={3} value={form.challenge} onChange={(e) => setForm({ ...form, challenge: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-solution">Our solution</Label>
                <Textarea id="proj-solution" rows={3} value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} />
              </div>
            </div>

            <p className={sectionCls}>Furniture used (one per line)</p>
            <Textarea id="proj-furniture" rows={3} value={form.furnitureUsed} onChange={(e) => setForm({ ...form, furnitureUsed: e.target.value })} placeholder={"Executive desks — 15 units\nErgoMax chairs — 250 units"} />

            <p className={sectionCls}>Testimonial &amp; rating</p>
            <div className="space-y-1.5">
              <Label htmlFor="proj-testimonial">Quote</Label>
              <Textarea id="proj-testimonial" rows={2} value={form.testimonialText} onChange={(e) => setForm({ ...form, testimonialText: e.target.value })} placeholder="Leave empty to hide the testimonial block" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proj-author">Author</Label>
                <Input id="proj-author" value={form.testimonialAuthor} onChange={(e) => setForm({ ...form, testimonialAuthor: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-role">Role</Label>
                <Input id="proj-role" value={form.testimonialRole} onChange={(e) => setForm({ ...form, testimonialRole: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-rating">Rating (0–5)</Label>
                <Input id="proj-rating" type="number" min={0} max={5} step={1} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} placeholder="5" />
              </div>
            </div>

            <p className={sectionCls}>Visibility</p>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/40 px-3 py-2.5">
              <div>
                <Label htmlFor="proj-active">Active</Label>
                <p className="text-[11px] text-muted-foreground">Inactive projects disappear from the storefront portfolio.</p>
              </div>
              <Switch id="proj-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proj-sort">Sort order</Label>
                <Input id="proj-sort" type="number" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} placeholder="Auto" />
              </div>
            </div>

            {formError && <p className="text-xs font-medium text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {saving ? "Saving…" : dialog?.mode === "edit" ? "Save changes" : "Add project"}
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
          <p className="text-sm text-muted-foreground">This removes the case study from the admin and storefront (demo DB).</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep it</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Practice workspace (BOQ · milestones · files) */}
      {practiceProject && (
        <ProjectPracticeDialog
          project={practiceProject}
          onClose={() => setPracticeProject(null)}
          onSaved={(updated) => { setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x))); setPracticeProject(updated); }}
        />
      )}
    </div>
  );
}
