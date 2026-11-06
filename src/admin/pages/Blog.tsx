import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Newspaper, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import { formatBlogDate } from "@/data/blogPosts";
import type { AdminBlogContentBlock, AdminBlogPost, NewBlogPostInput } from "@/api/types";
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

type BlockForm = { heading: string; body: string };

type PostForm = {
  title: string;
  category: string;
  author: string;
  date: string; // yyyy-mm-dd while editing (legacy strings converted on open)
  readTime: string;
  excerpt: string;
  image: string;
  featured: boolean;
  active: boolean;
  tags: string;
  blocks: BlockForm[];
};

const emptyForm: PostForm = {
  title: "",
  category: "",
  author: "",
  date: new Date().toISOString().slice(0, 10),
  readTime: "5 min read",
  excerpt: "",
  image: "",
  featured: false,
  active: true,
  tags: "",
  blocks: [{ heading: "", body: "" }],
};

const sectionCls = "text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground pt-1 border-t border-border";

/** Legacy dates ("Feb 15, 2025") → yyyy-mm-dd for <input type="date">; ISO passes through. */
const toIsoDate = (raw: string): string => {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function AdminBlog() {
  const api = useMemo(() => getAdminApi(), []);
  const [items, setItems] = useState<AdminBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const [dialog, setDialog] = useState<null | { mode: "create" } | { mode: "edit"; post: AdminBlogPost }>(null);
  const [form, setForm] = useState<PostForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminBlogPost | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listBlogPosts());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load posts");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryOptions = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return [p.title, p.author, p.category, p.tags.join(" ")].some((f) => f.toLowerCase().includes(q));
    });
  }, [items, category, query]);

  const openCreate = () => {
    setForm({ ...emptyForm, blocks: [{ heading: "", body: "" }] });
    setFormError(null);
    setDialog({ mode: "create" });
  };

  const openEdit = (post: AdminBlogPost) => {
    setForm({
      title: post.title,
      category: post.category,
      author: post.author,
      date: toIsoDate(post.date),
      readTime: post.readTime,
      excerpt: post.excerpt,
      image: post.image,
      featured: post.featured,
      active: post.active,
      tags: post.tags.join(", "),
      blocks: post.content.length
        ? post.content.map((b) => ({ heading: b.heading ?? "", body: b.body }))
        : [{ heading: "", body: "" }],
    });
    setFormError(null);
    setDialog({ mode: "edit", post });
  };

  const updateBlock = (idx: number, patch: Partial<BlockForm>) =>
    setForm((f) => ({ ...f, blocks: f.blocks.map((b, i) => (i === idx ? { ...b, ...patch } : b)) }));

  const moveBlock = (idx: number, dir: -1 | 1) =>
    setForm((f) => {
      const target = idx + dir;
      if (target < 0 || target >= f.blocks.length) return f;
      const blocks = [...f.blocks];
      [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
      return { ...f, blocks };
    });

  const removeBlock = (idx: number) =>
    setForm((f) => ({ ...f, blocks: f.blocks.length === 1 ? f.blocks : f.blocks.filter((_, i) => i !== idx) }));

  const handleSave = async () => {
    const title = form.title.trim();
    const categoryValue = form.category.trim();
    const author = form.author.trim();
    const date = form.date.trim();
    const excerpt = form.excerpt.trim();
    const content: AdminBlogContentBlock[] = form.blocks
      .map((b) => ({ heading: b.heading.trim() || undefined, body: b.body.trim() }))
      .filter((b) => b.body);

    if (!title || !categoryValue || !author) return setFormError("Title, category and author are required.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return setFormError("Pick a valid publish date.");
    }
    if (!excerpt) return setFormError("Write a one-paragraph excerpt — it feeds cards and meta descriptions.");
    if (content.length === 0) return setFormError("Add at least one content section with a body.");

    const payload: NewBlogPostInput = {
      title,
      category: categoryValue,
      author,
      date,
      excerpt,
      image: form.image.trim() || undefined,
      readTime: form.readTime.trim() || undefined,
      featured: form.featured,
      active: form.active,
      content,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    };

    setSaving(true);
    setFormError(null);
    try {
      if (dialog?.mode === "edit") {
        await api.updateBlogPost(dialog.post.id, payload);
        toast.success(`Updated “${title}”`);
      } else {
        await api.createBlogPost(payload);
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

  const handleToggleFeatured = async (post: AdminBlogPost) => {
    try {
      await api.updateBlogPost(post.id, { featured: !post.featured });
      setItems((prev) => prev.map((p) => (p.id === post.id ? { ...p, featured: !p.featured } : p)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not toggle featured");
    }
  };

  const handleToggleActive = async (post: AdminBlogPost) => {
    try {
      await api.setBlogPostActive(post.id, !post.active);
      setItems((prev) => prev.map((p) => (p.id === post.id ? { ...p, active: !p.active } : p)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not toggle visibility");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const okFlag = await api.deleteBlogPost(deleteTarget.id);
      if (okFlag) {
        toast.success(`Deleted “${deleteTarget.title}”`);
        setDeleteTarget(null);
        await load();
      } else {
        toast.error("Post not found — refresh and try again.");
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
          <select aria-label="Filter category" className="h-10 w-auto rounded-md border border-input bg-background px-3 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories ({items.length})</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="relative sm:max-w-xs w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search title, author, tags…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
        </div>
        <Button onClick={openCreate} className="bg-accent hover:bg-accent/90 text-accent-foreground whitespace-nowrap">
          <Plus className="mr-1.5 h-4 w-4" /> Add post
        </Button>
      </div>

      <SectionCard title="Journal / Blog">
        {loading ? (
          <SectionSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Newspaper} title="No posts match" hint="Adjust the filter or write a new article." />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Image</TableHead>
                  <TableHead>Post</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Featured</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} className={p.active ? undefined : "opacity-50"}>
                    <TableCell>
                      {p.image ? (
                        <img src={p.image} alt="" loading="lazy" className="h-12 w-20 rounded-sm border border-border object-cover" />
                      ) : (
                        <div className="flex h-12 w-20 items-center justify-center rounded-sm border border-dashed border-border text-muted-foreground"><Newspaper className="h-5 w-5" /></div>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium leading-snug max-w-[260px] line-clamp-2">{p.title}</p>
                      <p className="text-[11px] text-muted-foreground">{p.readTime}</p>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{p.category}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{p.author}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatBlogDate(p.date)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleToggleFeatured(p)}
                        aria-label={p.featured ? `Unfeature ${p.title}` : `Feature ${p.title}`}
                        aria-pressed={p.featured}
                      >
                        <Star className={`h-4 w-4 ${p.featured ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Switch checked={p.active} onCheckedChange={() => handleToggleActive(p)} aria-label={`Toggle ${p.title}`} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
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
          First featured post drives the “Editor's Pick” slot — later featured posts don't override it. Inactive posts vanish from
          the journal and their URLs redirect to /blog. Build-time sitemap covers the seeded catalogue; admin-created posts need a
          redeploy to enter sitemap.xml.
        </p>
      </SectionCard>

      {/* Create / edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "edit" ? "Edit post" : "Add post"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className={sectionCls + " border-t-0 pt-0"}>Article</p>
            <div className="space-y-1.5">
              <Label htmlFor="post-title">Title *</Label>
              <Input id="post-title" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="The Complete Guide to Ergonomic Office Furniture" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="post-category">Category *</Label>
                <Input id="post-category" list="blog-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ergonomics" />
                <datalist id="blog-categories">
                  {categoryOptions.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="post-date">Publish date *</Label>
                <Input id="post-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="post-readtime">Read time</Label>
                <Input id="post-readtime" value={form.readTime} onChange={(e) => setForm({ ...form, readTime: e.target.value })} placeholder="8 min read" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-author">Author *</Label>
              <Input id="post-author" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Dr. Farah Khan" />
            </div>

            <p className={sectionCls}>Details</p>
            <div className="space-y-1.5">
              <Label htmlFor="post-excerpt">Excerpt *</Label>
              <Textarea id="post-excerpt" rows={2} value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} placeholder="One tight paragraph — shown on cards and used as the meta description." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-image">Hero image URL</Label>
              <Input id="post-image" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="https://… or data:image/webp;base64,…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-tags">Tags (comma-separated)</Label>
              <Input id="post-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="Ergonomics, Office Chairs, Productivity" />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/40 px-3 py-2.5">
              <div>
                <Label htmlFor="post-featured">Featured (Editor's Pick)</Label>
                <p className="text-[11px] text-muted-foreground">First featured post fills the spotlight section on /blog.</p>
              </div>
              <Switch id="post-featured" checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} />
            </div>

            <p className={sectionCls}>Body sections</p>
            <div className="space-y-3">
              {form.blocks.map((block, idx) => (
                <div key={idx} className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`Section ${idx + 1} heading (optional)`}
                      value={block.heading}
                      onChange={(e) => updateBlock(idx, { heading: e.target.value })}
                      placeholder="Section heading (optional)"
                      className="h-9 text-sm font-semibold"
                    />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => moveBlock(idx, -1)} disabled={idx === 0} aria-label="Move section up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => moveBlock(idx, 1)} disabled={idx === form.blocks.length - 1} aria-label="Move section down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:text-destructive" onClick={() => removeBlock(idx)} disabled={form.blocks.length === 1} aria-label="Remove section">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    aria-label={`Section ${idx + 1} body`}
                    rows={4}
                    value={block.body}
                    onChange={(e) => updateBlock(idx, { body: e.target.value })}
                    placeholder="Write the section body… (blank-line separated paragraphs render as written)"
                  />
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, blocks: [...f.blocks, { heading: "", body: "" }] }))}>
              <Plus className="mr-1.5 h-4 w-4" /> Add section
            </Button>

            <p className={sectionCls}>Visibility</p>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/40 px-3 py-2.5">
              <div>
                <Label htmlFor="post-active">Published</Label>
                <p className="text-[11px] text-muted-foreground">Unpublished posts disappear from /blog; their URLs redirect there.</p>
              </div>
              <Switch id="post-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            </div>

            {formError && <p className="text-xs font-medium text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {saving ? "Saving…" : dialog?.mode === "edit" ? "Save changes" : "Add post"}
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
          <p className="text-sm text-muted-foreground">The article is removed from the journal and the demo DB. Seeded content stays in the repo.</p>
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
