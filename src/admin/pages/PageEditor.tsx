import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, History, Loader2, Save, Undo2, FileWarning } from "lucide-react";
import { Puck, blocksPlugin, outlinePlugin, fieldsPlugin } from "@puckeditor/core";
import "@/pages-builder/puck-editor.css";
import type { Data } from "@puckeditor/core";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminPage, AdminPageDoc } from "@/api/types";
import { formatDateTime } from "@/admin/components";
import { isOwnerSession } from "@/lib/owner";
import { woodexConfig } from "@/pages-builder/blocks";
import { libraryPlugin } from "@/pages-builder/library";
import { BuilderModeContext, LibraryActionsContext } from "@/pages-builder/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const toPuckData = (doc: AdminPageDoc): Data => doc as unknown as Data;
const fromPuckData = (data: Data): AdminPageDoc =>
  ({ root: { props: (data.root?.props ?? {}) as Record<string, unknown> }, content: data.content as unknown as AdminPageDoc["content"] });

/**
 * Page editor (Wave 1) — Puck bound to the demo-DB page document.
 * Owner-only publish (§11-Q5 interim: demo gate = owner); everyone else saves drafts.
 * Publish bumps the version and snapshots history (cap 20) — restore from the history rail.
 */
export default function AdminPageEditor() {
  const api = useMemo(() => getAdminApi(), []);
  const { pageSlug } = useParams<{ pageSlug: string }>();
  const navigate = useNavigate();
  const owner = isOwnerSession();

  const [page, setPage] = useState<AdminPage | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [doc, setDoc] = useState<AdminPageDoc | null>(null);
  const [puckKey, setPuckKey] = useState(0); // remount Puck after Library inserts so canvas + Layers reflect the new block
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMissing(false);
    try {
      const found = pageSlug ? await api.getPage(pageSlug) : undefined;
      if (!found) { setMissing(true); setPage(null); return; }
      setPage(found);
      setTitle(found.title);
      setDoc(found.doc);
      setDirty(false);
    } catch {
      toast.error("Could not load this page (demo API unavailable).");
    } finally {
      setLoading(false);
    }
  }, [api, pageSlug]);

  useEffect(() => { load(); }, [load]);

  const saveDraft = useCallback(async (): Promise<AdminPage | undefined> => {
    if (!page || !doc) return undefined;
    setSaving(true);
    const updated = await api.updatePage(page.id, { title, doc });
    setSaving(false);
    if (updated) {
      setPage(updated);
      setDirty(false);
      toast.success("Draft saved.");
      return updated;
    }
    toast.error("Could not save the draft.");
    return undefined;
  }, [api, page, doc, title]);

  const doPublish = useCallback(async (publish: boolean) => {
    if (!page) return;
    if (!owner) {
      toast.error("Only the owner can publish (demo gate = owner today; Bagisto RBAC in Wave 7).");
      return;
    }
    // Save pending edits first so Publish never ships a stale document.
    if (dirty && !(await saveDraft())) return;
    setPublishing(true);
    const updated = publish ? await api.publishPage(page.id) : await api.unpublishPage(page.id);
    setPublishing(false);
    if (!updated) { toast.error("Publish failed."); return; }
    setPage(updated);
    setDirty(false);
    toast.success(publish ? `Published "${updated.title}" (v${updated.version}).` : `"${updated.title}" unpublished — draft again.`);
    if (publish && pageSlug !== updated.slug) navigate(`/admin/pages/${updated.slug}`, { replace: true });
  }, [api, page, dirty, owner, pageSlug, navigate, saveDraft]);

  const insertBlock = useCallback((type: string, index?: number) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const cfg = (woodexConfig.components as Record<string, { defaultProps?: Record<string, unknown> } | undefined>)[type];
      if (!cfg) return prev;
      const id = `pb-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
      const block = { type, props: { ...(cfg.defaultProps ?? {}), id } };
      const content = [...prev.content];
      const at = index === undefined || index < 0 || index > content.length ? content.length : index;
      content.splice(at, 0, block as never);
      return { ...prev, content };
    });
    setDirty(true);
    setPuckKey((k) => k + 1); // force Puck to re-read `data`
    toast.success("Block added — drag to reorder, or manage it in the Layers panel.");
  }, []);

  const restoreVersion = useCallback(async (version: number) => {
    if (!page) return;
    const updated = await api.revertPage(page.id, version);
    if (updated) {
      setPage(updated);
      setTitle(updated.title);
      setDoc(updated.doc);
      setDirty(false);
      toast.success(`Restored v${version} as the current draft — publish to ship it.`);
    } else {
      toast.error("Could not restore that version.");
    }
  }, [api, page]);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (missing || !page || !doc) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <FileWarning className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-lg font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">No builder page with slug <code className="rounded bg-muted px-1.5 py-0.5">{pageSlug}</code>.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/admin/pages">Back to Pages</Link></Button>
      </div>
    );
  }

  const statusBadge = page.status === "published"
    ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">published · v{page.version}</Badge>
    : <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">draft</Badge>;

  return (
    <div className="flex h-[calc(100vh-6rem)] min-h-[620px] flex-col gap-2">
      {/* Meta bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Link to="/admin/pages" className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Back to Pages">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          aria-label="Page title"
          className="h-9 w-48 flex-1 border-transparent bg-transparent px-2 font-semibold shadow-none focus-visible:border-border sm:w-64"
        />
        {statusBadge}
        {dirty && <span className="text-[11px] font-medium uppercase tracking-wide text-amber-700">unsaved changes</span>}
        <code className="hidden rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground md:inline">/{page.slug}</code>
        <div className="ml-auto flex items-center gap-1.5">
          <a href={`/lab/${page.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </a>
          <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving || !dirty}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save draft
          </Button>
          <Button
            size="sm"
            onClick={() => doPublish(page.status !== "published")}
            disabled={publishing || !owner}
            title={owner ? (page.status === "published" ? "Unpublish (back to draft)" : "Publish this page") : "Only the owner can publish"}
            className={cn(page.status === "published" ? "bg-muted text-foreground hover:bg-muted/80" : "bg-accent text-accent-foreground hover:bg-hon-green-dark")}
          >
            {publishing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {page.status === "published" ? "Unpublish" : "Publish"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)} aria-pressed={showHistory} title="Version history">
            <History className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* History rail */}
      {showHistory && (
        <div className="max-h-40 overflow-auto rounded-xl border border-border bg-card p-2">
          {page.history.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No published revisions yet. Publish creates the first snapshot (history keeps the 20 most recent).</p>
          ) : (
            <ul className="divide-y divide-border">
              {page.history.map((h) => (
                <li key={h.version} className="flex items-center gap-3 px-2 py-1.5 text-xs">
                  <span className="font-mono font-semibold">v{h.version}</span>
                  <span className="text-muted-foreground">{formatDateTime(h.publishedAt)}</span>
                  <span className="min-w-0 flex-1 truncate">{h.title}</span>
                  <button onClick={() => restoreVersion(h.version)} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted">
                    <Undo2 className="h-3 w-3" /> Restore as draft
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border shadow-sm">
        <LibraryActionsContext.Provider value={{ insert: (type: string) => insertBlock(type) }}>
          <BuilderModeContext.Provider value="editor">
            <Puck
              key={puckKey}
              config={woodexConfig}
              data={toPuckData(doc)}
              plugins={[blocksPlugin(), libraryPlugin(), outlinePlugin({ label: "Layers" }), fieldsPlugin()]}
              onChange={(data) => { setDoc(fromPuckData(data)); setDirty(true); }}
              onPublish={() => doPublish(page.status !== "published")}
            />
          </BuilderModeContext.Provider>
        </LibraryActionsContext.Provider>
      </div>
    </div>
  );
}
