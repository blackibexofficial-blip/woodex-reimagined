import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check, Copy, Folder as FolderIcon, FolderPlus, Image as ImageIcon, Loader2, Search, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminMediaAsset, AdminProduct } from "@/api/types";
import { formatNumber, timeAgo, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // IndexedDB budget — Bagisto storage lands with the live backend
const UNSORTED = "__unsorted__";

export default function AdminMedia() {
  const api = useMemo(() => getAdminApi(), []);
  const [assets, setAssets] = useState<AdminMediaAsset[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** "all" | UNSORTED | a folder name */
  const [activeFolder, setActiveFolder] = useState<string>("all");
  /** Folders created this session (they exist implicitly once an asset lands in them). */
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // detail dialog
  const [detail, setDetail] = useState<AdminMediaAsset | null>(null);
  const [detailName, setDetailName] = useState("");
  const [detailAlt, setDetailAlt] = useState("");
  const [detailFolder, setDetailFolder] = useState("");
  const [saving, setSaving] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);

  // delete flows
  const [pendingDelete, setPendingDelete] = useState<AdminMediaAsset | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // bulk move
  const [moveTarget, setMoveTarget] = useState("");
  const [moving, setMoving] = useState(false);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, prods] = await Promise.all([
        api.listMediaAssets(),
        api.listProducts({ perPage: 500 }).then((p) => p.items).catch(() => [] as AdminProduct[]),
      ]);
      setAssets(list);
      setProducts(prods);
    } catch (e) {
      console.error(e);
      setAssets([]);
      setError(e instanceof Error ? e.message : "Could not load the media library.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  /** distinct folders + counts, Unsorted first-class */
  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assets) counts.set(a.folder ?? "", (counts.get(a.folder ?? "") ?? 0) + 1);
    for (const f of extraFolders) if (!counts.has(f)) counts.set(f, 0);
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => (a.name === "" ? -1 : b.name === "" ? 1 : a.name.localeCompare(b.name)));
  }, [assets, extraFolders]);

  const unsortedCount = folders.find((f) => f.name === "")?.count ?? 0;

  const folderNames = useMemo(() => folders.map((f) => f.name).filter(Boolean), [folders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (activeFolder === UNSORTED ? !!a.folder : activeFolder !== "all" ? a.folder !== activeFolder : false) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.mime.toLowerCase().includes(q) ||
        (a.alt ?? "").toLowerCase().includes(q) ||
        (a.folder ?? "").toLowerCase().includes(q)
      );
    });
  }, [assets, query, activeFolder]);

  const totalBytes = assets.reduce((sum, a) => sum + a.size, 0);

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectAllFiltered = () => setSelected(new Set(filtered.map((a) => a.id)));

  const onUploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(files.length);
    let added = 0;
    const targetFolder = activeFolder !== "all" && activeFolder !== UNSORTED ? activeFolder : undefined;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) { toast.error(`“${file.name}” is not an image — skipped.`); continue; }
      if (file.size > MAX_UPLOAD_BYTES) { toast.error(`“${file.name}” is over 10 MB — too large even for the demo library.`); continue; }
      try {
        const url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await api.addMediaAsset({ name: file.name, url, mime: file.type, size: file.size, folder: targetFolder });
        added += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not add “${file.name}”.`);
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
    if (added > 0) toast.success(`${added} asset${added === 1 ? "" : "s"} added${targetFolder ? ` to “${targetFolder}”` : ""}.`);
    if (fileRef.current) fileRef.current.value = "";
    load();
  };

  const copyUrl = async (asset: AdminMediaAsset) => {
    try {
      await navigator.clipboard.writeText(asset.url.startsWith("data:") ? asset.name : asset.url);
      setCopiedId(asset.id);
      window.setTimeout(() => setCopiedId(null), 1500);
      toast.success(asset.url.startsWith("data:") ? "File name copied (data URL is too large to copy)." : "URL copied to clipboard.");
    } catch {
      toast.error("Clipboard unavailable in this browser.");
    }
  };

  /* -------- detail dialog -------- */
  const openDetail = (asset: AdminMediaAsset) => {
    setDetail(asset);
    setDetailName(asset.name);
    setDetailAlt(asset.alt ?? "");
    setDetailFolder(asset.folder ?? "");
    setProductQuery("");
    setAssignedTo(null);
  };

  const saveDetail = async () => {
    if (!detail) return;
    const name = detailName.trim();
    if (!name) { toast.error("Name cannot be empty."); return; }
    setSaving(true);
    try {
      const updated = await api.updateMediaAsset(detail.id, {
        name,
        folder: detailFolder.trim() || undefined,
        alt: detailAlt.trim() || undefined,
      });
      if (!updated) { toast.error("Asset no longer exists."); setDetail(null); return; }
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setDetail(updated);
      setDetailFolder(updated.folder ?? "");
      toast.success("Asset saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save asset.");
    } finally {
      setSaving(false);
    }
  };

  const assignTo = async (product: AdminProduct) => {
    if (!detail) return;
    setAssigningId(product.id);
    try {
      const ok = await api.assignMediaToProduct(detail.id, product.id);
      if (ok) {
        setAssignedTo(product.name);
        toast.success(`“${product.name}” image now uses this asset.`);
      } else {
        toast.error("Could not assign — product not found.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not assign asset.");
    } finally {
      setAssigningId(null);
    }
  };

  const productMatches = useMemo(() => {
    const pool = Array.isArray(products) ? products : [];
    const q = productQuery.trim().toLowerCase();
    const source = q
      ? pool.filter((p) => `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q))
      : pool;
    return source.slice(0, 6);
  }, [products, productQuery]);

  /* -------- delete flows -------- */
  const confirmSingleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const ok = await api.deleteMediaAsset(pendingDelete.id);
      if (ok) {
        toast.success(`“${pendingDelete.name}” removed.`);
        setAssets((prev) => prev.filter((a) => a.id !== pendingDelete.id));
        setSelected((prev) => { const n = new Set(prev); n.delete(pendingDelete.id); return n; });
        if (detail?.id === pendingDelete.id) setDetail(null);
      } else {
        toast.error("Could not delete asset.");
      }
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete asset.");
    } finally {
      setDeleting(false);
    }
  };

  const confirmBulkDelete = async () => {
    setDeleting(true);
    try {
      const ids = [...selected];
      const n = await api.bulkDeleteMediaAssets(ids);
      toast.success(`${n} asset${n === 1 ? "" : "s"} removed.`);
      setAssets((prev) => prev.filter((a) => !selected.has(a.id)));
      setSelected(new Set());
      setBulkDeleteOpen(false);
      if (detail && selected.has(detail.id)) setDetail(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete assets.");
    } finally {
      setDeleting(false);
    }
  };

  const applyBulkMove = async () => {
    if (!moveTarget) return;
    setMoving(true);
    try {
      const target = moveTarget === UNSORTED ? undefined : moveTarget;
      const n = await api.moveMediaAssets([...selected], target);
      toast.success(target ? `${n} asset${n === 1 ? "" : "s"} moved to “${target}”.` : `${n} asset${n === 1 ? "" : "s"} moved to Unsorted.`);
      setSelected(new Set());
      setMoveTarget("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move assets.");
    } finally {
      setMoving(false);
    }
  };

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    setExtraFolders((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setActiveFolder(name);
    setNewFolderOpen(false);
    setNewFolderName("");
    toast.success(`Folder “${name}” ready — uploads and moves will use it.`);
  };

  const folderLabel =
    activeFolder === "all" ? "All assets" : activeFolder === UNSORTED ? "Unsorted" : `“${activeFolder}”`;

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, alt, folder…" value={query} onChange={(e) => setQuery(e.target.value)} className="bg-white pl-9" aria-label="Search media" />
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onUploadFiles(e.target.files)} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading > 0} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
            {uploading > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload images
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* folder sidebar */}
        <aside className="h-fit rounded-xl border border-border bg-white p-3 shadow-sm" aria-label="Folders">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Folders</p>
            <button onClick={() => setNewFolderOpen((v) => !v)} title="New folder" aria-label="New folder" className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground">
              {newFolderOpen ? <X className="h-4 w-4" /> : <FolderPlus className="h-4 w-4" />}
            </button>
          </div>
          {newFolderOpen && (
            <form
              className="mb-2 flex items-center gap-1.5 px-1"
              onSubmit={(e) => { e.preventDefault(); createFolder(); }}
            >
              <Input autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name…" className="h-8 text-xs" aria-label="New folder name" />
              <Button type="submit" size="sm" className="h-8 bg-accent px-2 text-accent-foreground">Add</Button>
            </form>
          )}
          <nav className="space-y-0.5">
            <button
              onClick={() => setActiveFolder("all")}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition ${activeFolder === "all" ? "bg-accent/15 font-medium text-accent-foreground hover:bg-accent/15" : "text-foreground hover:bg-secondary"}`}
            >
              <span className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-muted-foreground" />All assets</span>
              <span className="text-xs text-muted-foreground">{assets.length}</span>
            </button>
            <button
              onClick={() => setActiveFolder(UNSORTED)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition ${activeFolder === UNSORTED ? "bg-accent/15 font-medium text-foreground" : "text-foreground hover:bg-secondary"}`}
            >
              <span className="flex items-center gap-2"><FolderIcon className="h-4 w-4 text-muted-foreground" />Unsorted</span>
              <span className="text-xs text-muted-foreground">{unsortedCount}</span>
            </button>
            {folders.filter((f) => f.name !== "").map((f) => (
              <button
                key={f.name}
                onClick={() => setActiveFolder(f.name)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition ${activeFolder === f.name ? "bg-accent/15 font-medium text-foreground" : "text-foreground hover:bg-secondary"}`}
                title={f.name}
              >
                <span className="flex min-w-0 items-center gap-2"><FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{f.name}</span></span>
                <span className="text-xs text-muted-foreground">{f.count}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* library */}
        <SectionCard
          title={`${folderLabel} · ${formatNumber(filtered.length)} shown · ${formatBytes(totalBytes)} stored on-device`}
          action={<ImageIcon className="h-4 w-4 text-muted-foreground" />}
        >
          {/* selection / bulk bar — always available; mutating actions appear with a selection */}
          {filtered.length > 0 && (
            <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${selected.size > 0 ? "border-accent/40 bg-accent/10" : "border-border bg-secondary/40"}`}>
              <button className="text-xs font-semibold text-foreground underline-offset-2 hover:underline" onClick={selectAllFiltered}>Select all shown</button>
              {selected.size > 0 && (
                <>
                  <span className="font-medium">{selected.size} selected</span>
                  <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <label htmlFor="bulk-move" className="sr-only">Move to folder</label>
                    <select
                      id="bulk-move"
                      value={moveTarget}
                      onChange={(e) => setMoveTarget(e.target.value)}
                      className="h-8 rounded-md border border-input bg-white px-2 text-xs"
                    >
                      <option value="">Move to…</option>
                      <option value={UNSORTED}>Unsorted</option>
                      {folderNames.map((name) => <option key={name} value={name}>{name}</option>)}
                      {extraFolders.filter((f) => !folderNames.includes(f)).map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <Button size="sm" variant="outline" className="h-8" disabled={!moveTarget || moving} onClick={applyBulkMove}>
                      {moving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Move
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setBulkDeleteOpen(true)}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {loading ? (
            <SectionSkeleton rows={6} />
          ) : error ? (
            <EmptyState icon={ImageIcon} title="Media library unavailable" hint={error} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title={query || activeFolder !== "all" ? "Nothing matches" : "Library is empty"}
              hint={query || activeFolder !== "all" ? "Try a different search or folder." : "Upload product or lifestyle imagery — up to 10 MB per file, stored in your browser."}
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((asset) => {
                const isSelected = selected.has(asset.id);
                return (
                  <figure
                    key={asset.id}
                    className={`group relative overflow-hidden rounded-xl border bg-secondary shadow-sm transition ${isSelected ? "border-accent ring-2 ring-accent/50" : "border-border"}`}
                  >
                    {/* selection toggle */}
                    <button
                      onClick={() => toggleSelected(asset.id)}
                      aria-pressed={isSelected}
                      aria-label={isSelected ? `Deselect ${asset.name}` : `Select ${asset.name}`}
                      className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border shadow-sm transition ${isSelected ? "border-accent bg-accent text-accent-foreground" : "border-white/70 bg-black/35 text-white hover:bg-black/55"}`}
                    >
                      {isSelected && <Check className="h-4 w-4" />}
                    </button>
                    {asset.alt && (
                      <span className="absolute right-2 top-2 z-10 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white" title={`Alt: ${asset.alt}`}>alt</span>
                    )}
                    <button onClick={() => openDetail(asset)} className="block w-full text-left" aria-label={`Details for ${asset.name}`}>
                      <div className="aspect-[4/3] overflow-hidden bg-muted">
                        <img
                          src={asset.url}
                          alt={asset.alt || asset.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.25"; }}
                        />
                      </div>
                    </button>
                    <figcaption className="space-y-2 p-3">
                      <button onClick={() => openDetail(asset)} className="block w-full text-left">
                        <p className="truncate text-xs font-medium text-foreground" title={asset.name}>{asset.name}</p>
                      </button>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {asset.folder ? `${asset.folder} · ` : ""}{formatBytes(asset.size)} · {timeAgo(asset.createdAt)}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => copyUrl(asset)}
                          title="Copy URL"
                          aria-label={`Copy URL for ${asset.name}`}
                          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-border hover:text-foreground"
                        >
                          {copiedId === asset.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => setPendingDelete(asset)}
                          title="Delete"
                          aria-label={`Delete ${asset.name}`}
                          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <p className="text-[11px] leading-4 text-muted-foreground">
        Demo library persists to IndexedDB on this device (~10 MB per upload). Catalogue imagery shipped with the app stays on static paths.
        Production uploads go to Supabase Storage / Bagisto media once the backend is provisioned — see <code className="font-mono">docs/07-admin-integration</code>.
      </p>

      {/* delete confirm (single) */}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">This removes the asset from the demo media library. Storefront pages using this file will fall back to broken-image icons until re-pointed.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button onClick={confirmSingleDelete} disabled={deleting} className="bg-rose-600 text-white hover:bg-rose-500">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm (bulk) */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} asset{selected.size === 1 ? "" : "s"}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">This removes the selected assets from the demo media library. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button onClick={confirmBulkDelete} disabled={deleting} className="bg-rose-600 text-white hover:bg-rose-500">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete {selected.size} asset{selected.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* detail dialog */}
      <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-6">{detail.name}</DialogTitle>
              </DialogHeader>
              <div className="flex gap-4">
                <img src={detail.url} alt={detail.alt || detail.name} className="h-28 w-36 shrink-0 rounded-lg border border-border object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.25"; }} />
                <dl className="min-w-0 space-y-1 text-xs text-muted-foreground">
                  <div><dt className="inline font-semibold text-foreground">Size: </dt>{formatBytes(detail.size)}</div>
                  <div><dt className="inline font-semibold text-foreground">Type: </dt>{detail.mime}</div>
                  <div><dt className="inline font-semibold text-foreground">Added: </dt>{new Date(detail.createdAt).toLocaleString()}</div>
                  <button onClick={() => copyUrl(detail)} className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition hover:bg-secondary">
                    {copiedId === detail.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {detail.url.startsWith("data:") ? "Copy file name" : "Copy URL"}
                  </button>
                </dl>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="asset-name" className="text-xs font-medium">File name</label>
                  <Input id="asset-name" value={detailName} onChange={(e) => setDetailName(e.target.value)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="asset-folder" className="text-xs font-medium">Folder <span className="font-normal text-muted-foreground">(blank = Unsorted)</span></label>
                    <Input id="asset-folder" list="folder-options" value={detailFolder} onChange={(e) => setDetailFolder(e.target.value)} placeholder="Unsorted" />
                    <datalist id="folder-options">
                      {folderNames.map((name) => <option key={name} value={name} />)}
                      {extraFolders.filter((f) => !folderNames.includes(f)).map((name) => <option key={name} value={name} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="asset-alt" className="text-xs font-medium">Alt text</label>
                    <Textarea id="asset-alt" value={detailAlt} onChange={(e) => setDetailAlt(e.target.value)} rows={2} placeholder="What should a screen reader say?" className="min-h-[38px] text-sm" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">Alt text is used if this asset is ever shown on the storefront.</p>
                  <Button size="sm" onClick={saveDetail} disabled={saving} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
                    {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save
                  </Button>
                </div>
              </div>

              {/* assign to product */}
              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assign as product image</p>
                <Input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search product by name, SKU, category…" className="mb-2 h-8 text-xs" aria-label="Search product" />
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {productMatches.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => assignTo(p)}
                      disabled={assigningId === p.id}
                      className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition hover:border-border hover:bg-secondary"
                    >
                      {p.image ? <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} /> : <ImageIcon className="h-8 w-8 rounded bg-muted p-1.5 text-muted-foreground" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{p.name}</span>
                        <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{p.sku} · stock {p.stock}</span>
                      </span>
                      {assigningId === p.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </button>
                  ))}
                  {productMatches.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No products match “{productQuery}”.</p>}
                </div>
                {assignedTo && <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" />Assigned to {assignedTo}.</p>}
              </div>

              <DialogFooter className="justify-between sm:justify-between">
                <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setPendingDelete(detail)}>
                  <Trash2 className="mr-1.5 h-4 w-4" />Delete
                </Button>
                <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
