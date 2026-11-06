import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Image as ImageIcon, Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminMediaAsset } from "@/api/types";
import { formatNumber, timeAgo, SectionCard, SectionSkeleton, EmptyState } from "@/admin/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // localStorage budget — server uploads land with the live backend

export default function AdminMedia() {
  const api = useMemo(() => getAdminApi(), []);
  const [assets, setAssets] = useState<AdminMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<AdminMediaAsset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAssets(await api.listMediaAssets());
    } catch (e) {
      console.error(e);
      setAssets([]);
      setError(e instanceof Error ? e.message : "Could not load the media library.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => a.name.toLowerCase().includes(q) || a.mime.toLowerCase().includes(q));
  }, [assets, query]);

  const totalBytes = assets.reduce((sum, a) => sum + a.size, 0);

  const onUploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(files.length);
    let added = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) { toast.error(`“${file.name}” is not an image — skipped.`); continue; }
      if (file.size > MAX_UPLOAD_BYTES) { toast.error(`“${file.name}” is over 2 MB — keep demo uploads small.`); continue; }
      try {
        const url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await api.addMediaAsset({ name: file.name, url, mime: file.type, size: file.size });
        added += 1;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not add “${file.name}”.`);
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
    if (added > 0) toast.success(`${added} asset${added === 1 ? "" : "s"} added to the library.`);
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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const ok = await api.deleteMediaAsset(pendingDelete.id);
      toast[ok ? "success" : "error"](ok ? `“${pendingDelete.name}” removed.` : "Could not delete asset.");
      setPendingDelete(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete asset.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search media…" value={query} onChange={(e) => setQuery(e.target.value)} className="bg-white pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onUploadFiles(e.target.files)} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading > 0} className="bg-accent text-accent-foreground hover:bg-hon-green-dark">
            {uploading > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload images
          </Button>
        </div>
      </div>

      <SectionCard
        title={`${formatNumber(assets.length)} assets · ${formatBytes(totalBytes)} stored locally`}
        action={<ImageIcon className="h-4 w-4 text-muted-foreground" />}
      >
        {loading ? (
          <SectionSkeleton rows={6} />
        ) : error ? (
          <EmptyState icon={ImageIcon} title="Media library unavailable" hint={error} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={ImageIcon} title={query ? "No assets match your search" : "Library is empty"} hint={query ? "Try a different file name." : "Upload product or lifestyle imagery — up to 2 MB per file in the demo."} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((asset) => (
              <figure key={asset.id} className="group overflow-hidden rounded-xl border border-border bg-secondary shadow-sm">
                <div className="aspect-[4/3] overflow-hidden bg-muted">
                  <img
                    src={asset.url}
                    alt={asset.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.25"; }}
                  />
                </div>
                <figcaption className="space-y-2 p-3">
                  <p className="truncate text-xs font-medium text-foreground" title={asset.name}>{asset.name}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{formatBytes(asset.size)} · {timeAgo(asset.createdAt)}</p>
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
            ))}
          </div>
        )}
      </SectionCard>

      <p className="text-[11px] leading-4 text-muted-foreground">
        Demo library persists to localStorage (2 MB per upload). Production uploads go to Supabase Storage buckets —
        bootstrap them with <code className="font-mono">backend/supabase/functions/create-bucket-*-temp</code> — or Bagisto media once wired.
      </p>

      {/* delete confirm */}
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">This removes the asset from the demo media library. Storefront pages using this file will fall back to broken-image icons until re-pointed.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button onClick={confirmDelete} disabled={deleting} className="bg-rose-600 text-white hover:bg-rose-500">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
