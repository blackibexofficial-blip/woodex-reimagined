import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Copy, FileText, Folder, FolderPlus, Loader2, Pencil, Plus, Search, Trash2, Layers, Check, X, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminPage, AdminPageFolder } from "@/api/types";
import { formatDate, EmptyState, SectionSkeleton } from "@/admin/components";
import { isOwnerSession } from "@/lib/owner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const kebab = (raw: string) =>
  raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");

type FolderFilter = "all" | "top" | string;

/**
 * Pages workspace (Wave 1) — list, create, duplicate, publish and organize builder pages.
 * Documents themselves are edited in /admin/pages/:pageSlug (Puck). Storefront preview = /lab/:slug.
 * Publish controls render only for the owner session (§11-Q5 interim rule — demo gate is the owner today).
 */
export default function AdminPages() {
  const api = useMemo(() => getAdminApi(), []);
  const navigate = useNavigate();
  const owner = isOwnerSession();

  const [pages, setPages] = useState<AdminPage[]>([]);
  const [folders, setFolders] = useState<AdminPageFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");

  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [folderId, setFolderId] = useState<string>("none");
  const [starter, setStarter] = useState<"starter" | "blank">("starter");
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdminPage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<AdminPageFolder | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderNameDraft, setFolderNameDraft] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pgs, flds] = await Promise.all([api.listPages("page"), api.listPageFolders()]);
      setPages(pgs);
      setFolders(flds);
    } catch {
      toast.error("Could not load pages (demo API unavailable).");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const folderName = useCallback((id: string | null) => (id ? folders.find((f) => f.id === id)?.name ?? "—" : "Top level"), [folders]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    let top = 0;
    for (const p of pages) {
      if (p.folderId) map.set(p.folderId, (map.get(p.folderId) ?? 0) + 1);
      else top += 1;
    }
    return { byFolder: map, top };
  }, [pages]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pages.filter((p) => {
      if (folderFilter === "top" && p.folderId) return false;
      if (folderFilter !== "all" && folderFilter !== "top" && p.folderId !== folderFilter) return false;
      if (!q) return true;
      return [p.title, p.slug, folderName(p.folderId)].some((f) => f?.toLowerCase().includes(q));
    });
  }, [pages, query, folderFilter, folderName]);

  const effectiveSlug = slugTouched ? kebab(slug) : kebab(title);

  const createPage = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const created = await api.createPage({
        title: title.trim(),
        slug: effectiveSlug || undefined,
        folderId: folderId === "none" ? null : folderId,
        starter,
      });
      toast.success(`Page "${created.title}" created as draft.`);
      setNewOpen(false);
      setTitle(""); setSlug(""); setSlugTouched(false); setFolderId("none"); setStarter("starter");
      await load();
      navigate(`/admin/pages/${created.slug}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create page.");
    } finally {
      setCreating(false);
    }
  };

  const duplicatePage = async (p: AdminPage) => {
    const copy = await api.duplicatePage(p.id);
    if (copy) { await load(); toast.success(`Duplicated as "${copy.title}".`); }
    else toast.error("Could not duplicate page.");
  };

  const togglePublish = async (p: AdminPage) => {
    const updated = p.status === "published" ? await api.unpublishPage(p.id) : await api.publishPage(p.id);
    if (updated) {
      await load();
      toast.success(updated.status === "published" ? `"${updated.title}" published (v${updated.version}).` : `"${updated.title}" unpublished — back to draft.`);
    } else {
      toast.error("Publish failed.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const ok = await api.deletePage(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (ok) { await load(); toast.success("Page deleted."); }
    else toast.error("Could not delete page.");
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folder = await api.createPageFolder({ name });
    setNewFolderName(""); setNewFolderOpen(false);
    await load();
    setFolderFilter(folder.id);
    toast.success(`Folder "${folder.name}" created.`);
  };

  const commitRename = async () => {
    if (!renamingFolderId) return;
    const name = folderNameDraft.trim();
    if (name) await api.updatePageFolder(renamingFolderId, { name });
    setRenamingFolderId(null);
    await load();
  };

  const confirmFolderDelete = async () => {
    if (!folderDeleteTarget) return;
    await api.deletePageFolder(folderDeleteTarget.id);
    setFolderDeleteTarget(null);
    if (folderFilter === folderDeleteTarget.id) setFolderFilter("all");
    await load();
    toast.success("Folder deleted — its pages moved to top level.");
  };

  const folderRow = (f: AdminPageFolder) => {
    const active = folderFilter === f.id;
    const renaming = renamingFolderId === f.id;
    return (
      <div key={f.id} className={cn("group flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm", active ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-muted")}>
        {renaming ? (
          <>
            <Input
              autoFocus
              value={folderNameDraft}
              onChange={(e) => setFolderNameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingFolderId(null); }}
              className="h-7 flex-1 px-2 text-sm"
            />
            <button onClick={commitRename} aria-label="Save folder name" className="p-1 text-emerald-600 hover:bg-muted rounded"><Check className="h-4 w-4" /></button>
            <button onClick={() => setRenamingFolderId(null)} aria-label="Cancel rename" className="p-1 text-muted-foreground hover:bg-muted rounded"><X className="h-4 w-4" /></button>
          </>
        ) : (
          <>
            <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => setFolderFilter(f.id)}>
              <Folder className="h-4 w-4 shrink-0" />
              <span className="truncate">{f.name}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{counts.byFolder.get(f.id) ?? 0}</span>
            </button>
            <button onClick={() => { setRenamingFolderId(f.id); setFolderNameDraft(f.name); }} aria-label="Rename folder" className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={() => setFolderDeleteTarget(f)} aria-label="Delete folder" className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-muted"><Trash2 className="h-3.5 w-3.5" /></button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-hon-green-pale">
            <Layers className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Pages</h1>
            <p className="text-xs text-muted-foreground">Builder pages — draft, publish and organize. Editing happens in the page editor.</p>
          </div>
        </div>
        <Button onClick={() => setNewOpen(true)} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
          <Plus className="mr-1.5 h-4 w-4" /> New page
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Folder rail */}
        <aside className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Folders</span>
            <button onClick={() => setNewFolderOpen((v) => !v)} aria-label="New folder" className="rounded p-1 text-muted-foreground hover:bg-muted">
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
          {newFolderOpen && (
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <Input
                autoFocus
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setNewFolderOpen(false); }}
                className="h-8 text-sm"
              />
              <Button size="sm" variant="outline" onClick={createFolder} className="h-8">Add</Button>
            </div>
          )}
          <div className="space-y-0.5">
            <button onClick={() => setFolderFilter("all")} className={cn("flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm", folderFilter === "all" ? "bg-accent/10" : "text-muted-foreground hover:bg-muted")}>
              <FileText className="h-4 w-4" /> All pages
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{pages.length}</span>
            </button>
            <button onClick={() => setFolderFilter("top")} className={cn("flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm", folderFilter === "top" ? "bg-accent/10" : "text-muted-foreground hover:bg-muted")}>
              <Folder className="h-4 w-4" /> (top level)
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">{counts.top}</span>
            </button>
            <div className="my-1 border-t border-border" />
            {folders.map(folderRow)}
            {folders.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No folders yet.</p>}
          </div>
        </aside>

        {/* List */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search pages…" className="h-9 pl-9" />
            </div>
            <span className="text-xs text-muted-foreground">{filtered.length} of {pages.length}</span>
          </div>
          {loading ? (
            <div className="p-4"><SectionSkeleton rows={4} /></div>
          ) : filtered.length === 0 ? (
            <div className="p-6"><EmptyState icon={FileText} title="No pages found" hint="Create your first page with the New page button, or clear the search/folder filter." /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  {owner && <TableHead className="text-right">Publish</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link to={`/admin/pages/${p.slug}`} className="hover:underline">{p.title}</Link>
                    </TableCell>
                    <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">/{p.slug}</code></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{folderName(p.folderId)}</TableCell>
                    <TableCell>
                      {p.status === "published" ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">published · v{p.version}</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">draft</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(p.updatedAt)}</TableCell>
                    {owner && (
                      <TableCell className="text-right">
                        <Switch
                          checked={p.status === "published"}
                          onCheckedChange={() => togglePublish(p)}
                          aria-label={p.status === "published" ? "Unpublish page" : "Publish page"}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link to={`/admin/pages/${p.slug}`} title="Edit" aria-label="Edit page" className="rounded p-1.5 text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></Link>
                        <a href={`/lab/${p.slug}`} target="_blank" rel="noreferrer" title="Preview on storefront" aria-label="Preview page" className="rounded p-1.5 text-muted-foreground hover:bg-muted"><ExternalLink className="h-4 w-4" /></a>
                        <button onClick={() => duplicatePage(p)} title="Duplicate" aria-label="Duplicate page" className="rounded p-1.5 text-muted-foreground hover:bg-muted"><Copy className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteTarget(p)} title="Delete" aria-label="Delete page" className="rounded p-1.5 text-muted-foreground hover:bg-muted"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* New page dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New page</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="page-title">Title</Label>
              <Input id="page-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Warranty Program" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="page-slug">Slug</Label>
              <Input id="page-slug" value={slugTouched ? slug : effectiveSlug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} placeholder="warranty-program" />
              <p className="text-[11px] text-muted-foreground">URL: /{effectiveSlug || "…"} — editable; duplicates get a numeric suffix automatically.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Folder</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">(top level)</SelectItem>
                  {folders.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Starting content</Label>
              <Select value={starter} onValueChange={(v) => setStarter(v as "starter" | "blank")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter page (heading + features + CTA)</SelectItem>
                  <SelectItem value="blank">Blank canvas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={createPage} disabled={!title.trim() || creating} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
              {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete page confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The page and all its revisions will be removed. This cannot be undone. The storefront route /{deleteTarget?.slug} will disappear.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Delete page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete folder confirm */}
      <AlertDialog open={!!folderDeleteTarget} onOpenChange={(o) => !o && setFolderDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder "{folderDeleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Pages inside move to top level. No pages are deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFolderDelete}>Delete folder</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
