import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Home, History, Loader2, Save, Undo2, FileWarning, SearchCheck } from "lucide-react";
import { Puck, blocksPlugin, outlinePlugin, fieldsPlugin } from "@puckeditor/core";
import "@/pages-builder/puck-editor.css";
import "@/pages-builder/builder.css";
import { BuilderDocProvider } from "@/pages-builder/BuilderDocContext";
import { normalizeLinkedStyles, scanHmTokens } from "@/pages-builder/inspector";
import type { Data } from "@puckeditor/core";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import { useUnsavedChanges } from "@/admin/unsavedChanges";
import type { AdminPage, AdminPageDoc, AdminPageSeo } from "@/api/types";
import { analysePageSeo, seoPublishViolations, summarizeSeoViolations } from "@/lib/seo/publish-gate";
import SeoPanel from "./SeoPanel";
import { formatDateTime } from "@/admin/components";
import { usePagePublishPermission } from "@/lib/owner";
import { woodexConfig } from "@/pages-builder/blocks";
import { preparePublicDocument, type PublicDocumentIssueCode } from "@/pages-builder/public-document";
import { libraryPlugin } from "@/pages-builder/library";
import { BuilderModeContext, LibraryActionsContext } from "@/pages-builder/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const preflightMessages: Record<PublicDocumentIssueCode, string> = {
  invalid_document: "The document structure is invalid.",
  too_many_blocks: "This profile allows at most 50 blocks.",
  unsupported_root: "Page-level settings or linked styles are not supported yet.",
  invalid_block: "The block structure is invalid.",
  unsupported_block: "This block type is not supported by the limited storefront profile yet.",
  duplicate_id: "This block ID is duplicated.",
  unsupported_style: "Custom block styles are not supported by this profile yet.",
  invalid_property: "A block field is invalid or not supported.",
  unsafe_link: "The link is empty or uses an unsafe URL format.",
  rich_text_unsupported: "Formatted HTML is not supported by this profile yet; use plain text.",
  size_limit: "The document exceeds the profile's text size limit.",
};

const toPuckData = (doc: AdminPageDoc): Data => doc as unknown as Data;
const fromPuckData = (data: Data): AdminPageDoc =>
  ({ root: { props: (data.root?.props ?? {}) as Record<string, unknown> }, content: data.content as unknown as AdminPageDoc["content"] });

/**
 * Page editor (Wave 1) — Puck bound to the demo-DB page document.
 * Publishing in Supabase follows the server-enforced page.manage capability.
 * Publish bumps the version and snapshots history (cap 20) — restore from the history rail.
 */
export default function AdminPageEditor() {
  const api = useMemo(() => getAdminApi(), []);
  const { pageSlug } = useParams<{ pageSlug: string }>();
  const navigate = useNavigate();
  const { canPublish, checking: checkingPublish } = usePagePublishPermission();

  const [page, setPage] = useState<AdminPage | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [doc, setDoc] = useState<AdminPageDoc | null>(null);
  const [puckKey, setPuckKey] = useState(0); // remount Puck after Library inserts so canvas + Layers reflect the new block
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const editRevision = useRef(0);
  const operationInFlight = useRef(false);
  const markDirty = useCallback(() => { editRevision.current += 1; setDirty(true); }, []);
  const [showHistory, setShowHistory] = useState(false);
  const [seo, setSeo] = useState<AdminPageSeo>({});
  const [showSeo, setShowSeo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMissing(false);
    try {
      const found = pageSlug ? await api.getPage(pageSlug) : undefined;
      if (!found) { setMissing(true); setPage(null); return; }
      setPage(found);
      setTitle(found.title);
      setDoc(found.doc);
      setSeo(found.seo ?? {});
      setDirty(false);
    } catch {
      toast.error("Could not load this page (demo API unavailable).");
    } finally {
      setLoading(false);
    }
  }, [api, pageSlug]);

  useEffect(() => { load(); }, [load]);

  // A response acknowledges only the snapshot that was sent, not later edits.
  const saveSnapshot = useCallback(async (): Promise<boolean> => {
    if (!page || !doc) return false;
    const revision = editRevision.current;
    setSaving(true);
    try {
      // Send the revision this editor loaded (00035): a colleague's newer save is
      // refused with a conflict instead of being overwritten.
      const updated = await api.updatePage(page.id, { title, doc, seo }, page.revision);
      if (!updated) { toast.error("Could not save the draft."); return false; }
      setPage(updated);
      if (editRevision.current !== revision) {
        toast.warning("An earlier draft was saved. Newer changes are still unsaved; save again.");
        return false;
      }
      setDirty(false);
      toast.success("Draft saved.");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the draft.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [api, page, doc, title, seo]);

  const saveDraft = useCallback(async () => {
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    try { await saveSnapshot(); } finally { operationInFlight.current = false; }
  }, [saveSnapshot]);

  // Sidebar links and reloads warn too, not just the editor's own back button.
  useUnsavedChanges(dirty || saving || publishing || restoring);

  // Puck owns canvas state between saves. Feeding it a fresh `data` identity on every
  // keystroke makes its fields panel remount (resetting our Style/Advanced tab state and
  // swallowing in-flight edits), so its `data` is a frozen snapshot per puckKey — the same
  // remount-after-external-change pattern insertBlock already relies on. Inline edits flow
  // back via onChange without ever re-feeding `data`.
  //
  // The snapshot must never cache the loading render's null: hooks evaluate before the
  // loading gate below returns, so would-be `useMemo(() => doc ?? null, [puckKey])` freezes
  // null forever and mounts Puck with an empty document — a permanently blank canvas and an
  // empty outline. Materialize the snapshot only once the doc is ready (first non-null doc,
  // or an explicit puckKey remount after Library inserts / version restore) and never while
  // loading, preserving the frozen-per-key contract.
  const snapshotRef = useRef<Data | null>(null);
  const snapshotKeyRef = useRef(puckKey);
  if (doc && (snapshotRef.current === null || snapshotKeyRef.current !== puckKey)) {
    snapshotRef.current = toPuckData(doc);
    snapshotKeyRef.current = puckKey;
  }
  const puckData = snapshotRef.current;

  const storefrontCheck = useMemo(() => doc ? preparePublicDocument(doc) : null, [doc]);

  const seoReport = useMemo(() => doc ? analysePageSeo(doc, seo) : null, [doc, seo]);

  const doPublish = useCallback(async (publish: boolean) => {
    if (!page || operationInFlight.current) return;
    if (!canPublish) {
      toast.error("Your session does not have permission to publish this page.");
      return;
    }
    if (publish) {
      if (!seoReport) return;
      const violations = seoPublishViolations(seoReport, seo);
      if (violations.length > 0) {
        const summary = summarizeSeoViolations(violations);
        if (seo.strictGate === false) {
          if (!window.confirm(`SEO is not ready: ${summary}\n\nPublish anyway?`)) return;
        } else {
          toast.error(`SEO gate blocks publish: ${summary} Open the SEO panel to fix.`);
          setShowSeo(true);
          return;
        }
      }
    }
    // Serialize this editor's operations; never publish if the save was overtaken by edits.
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setPublishing(true);
    try {
      if (dirty && !(await saveSnapshot())) return;
      const revision = editRevision.current;
      const updated = publish
        ? await api.publishPage(page.id, page.revision)
        : await api.unpublishPage(page.id, page.revision);
      if (!updated) { toast.error("Publish failed."); return; }
      setPage(updated);
      if (editRevision.current === revision) {
        setDirty(false);
        toast.success(publish ? `Published "${updated.title}" (v${updated.version}).` : `"${updated.title}" unpublished — draft again.`);
      } else {
        toast.warning("The page status changed, but newer editor changes remain unsaved.");
      }
      // Do not navigate away from edits made while the request was in flight.
      if (publish && pageSlug !== updated.slug && editRevision.current === revision) navigate(`/admin/pages/${updated.slug}`, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed.");
    } finally {
      operationInFlight.current = false;
      setPublishing(false);
    }
  }, [api, page, dirty, canPublish, pageSlug, navigate, saveSnapshot, seo, seoReport]);

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
    markDirty();
    setPuckKey((k) => k + 1); // force Puck to re-read `data`
    toast.success("Block added — drag to reorder, or manage it in the Layers panel.");
  }, [markDirty]);

  // Plugin identity must stay stable — a new array (or new plugin objects) per render tears
  // down Puck's rail/panels/canvas and swallows focus + panel state on every keystroke.
  const puckPlugins = useMemo(
    () => [blocksPlugin(), libraryPlugin(), outlinePlugin({ label: "Layers" }), fieldsPlugin()],
    [],
  );
  const libraryActions = useMemo(() => ({ insert: insertBlock }), [insertBlock]);

  const restoreVersion = useCallback(async (version: number) => {
    if (!page || operationInFlight.current) return;
    const message = dirty
      ? "Restoring replaces the saved draft and your unsaved editor changes. Continue?"
      : "Restoring replaces the current saved draft with this version. Continue?";
    if (!window.confirm(message)) return;
    operationInFlight.current = true;
    setRestoring(true);
    const revision = editRevision.current;
    try {
      const updated = await api.revertPage(page.id, version);
      if (updated) {
        setPage(updated);
        if (editRevision.current !== revision) {
          toast.warning("The saved draft was restored, but newer editor changes are still unsaved. Review before saving.");
          return;
        }
        setTitle(updated.title);
        setDoc(updated.doc);
        setSeo(updated.seo ?? {});
        setDirty(false);
        setPuckKey((k) => k + 1);
        toast.success(`Restored v${version} as the current draft — publish to ship it.`);
      } else {
        toast.error("Could not restore that version.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore that version.");
    } finally {
      operationInFlight.current = false;
      setRestoring(false);
    }
  }, [api, page, dirty]);

  const linkedStyles = normalizeLinkedStyles(doc?.root?.props?._linkedStyles);
  const hmCounts = scanHmTokens(doc?.content as unknown[] | undefined);

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
        <Link to="/admin/pages" onClick={(event) => {
          // The shared unsaved-changes guard handles the "leave anyway?" prompt.
          if (operationInFlight.current) { event.preventDefault(); toast.error("Wait for the current page operation to finish."); }
        }} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="Back to Pages">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Input
          value={title}
          onChange={(e) => { setTitle(e.target.value); markDirty(); }}
          aria-label="Page title"
          className="h-9 w-48 flex-1 border-transparent bg-transparent px-2 font-semibold shadow-none focus-visible:border-border sm:w-64"
        />
        {statusBadge}
        {dirty && <span className="text-[11px] font-medium uppercase tracking-wide text-amber-700">unsaved changes</span>}
        <code className="hidden rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground md:inline">/{page.slug}</code>
        <div className="ml-auto flex items-center gap-1.5">
          <a href={`/lab/${page.slug}`} target="_blank" rel="noreferrer" title="/lab preview of the draft document" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
            <ExternalLink className="h-3.5 w-3.5" /> Preview
          </a>
          <a href="/" target="_blank" rel="noreferrer" title="Open the live production home page" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
            <Home className="h-3.5 w-3.5" /> Live home ↗
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSeo((v) => !v)}
            aria-pressed={showSeo}
            title="SEO title, description, keyphrase, analysis and publish gate"
            className="gap-1.5"
          >
            <SearchCheck className="h-4 w-4" /> SEO
            {seoReport && (
              <span
                aria-hidden
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none",
                  seoReport.seoRating === "good"
                    ? "bg-emerald-100 text-emerald-800"
                    : seoReport.seoRating === "ok"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800",
                )}
              >
                {seoReport.seoScore}
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving || publishing || restoring || !dirty}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save draft
          </Button>
          <Button
            size="sm"
            onClick={() => doPublish(page.status !== "published")}
            disabled={saving || publishing || restoring || checkingPublish || !canPublish}
            title={checkingPublish ? "Checking publishing permission" : canPublish ? (page.status === "published" ? "Unpublish (back to draft)" : "Publish this page") : "Publishing permission required"}
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

      {storefrontCheck && (
        <details className="rounded-xl border border-border bg-card px-3 py-2 text-xs" data-testid="storefront-preflight">
          <summary className="cursor-pointer font-semibold">
            Future storefront check (current editor content): {storefrontCheck.ok ? "limited checks passed" : `${storefrontCheck.issues.length} issue${storefrontCheck.issues.length === 1 ? "" : "s"}`}
          </summary>
          <p className="mt-2 text-muted-foreground">The public builder route is not enabled. This limited check is advisory, is not a security or accessibility certification, and does not block publishing. Editor content may be unsaved.</p>
          {!storefrontCheck.ok && (
            <ul className="mt-2 list-inside list-disc space-y-1">
              {storefrontCheck.issues.map((issue, index) => (
                <li key={`${index}-${issue.code}`}>
                  {issue.block ? `Block ${issue.block}: ` : ""}{preflightMessages[issue.code]}{issue.field ? ` (${issue.field})` : ""}
                </li>
              ))}
              {storefrontCheck.issues.length === 20 && <li>Only the first 20 issues are shown.</li>}
            </ul>
          )}
        </details>
      )}

      {seoReport && (
        <SeoPanel
          open={showSeo}
          onOpenChange={setShowSeo}
          slug={page.slug}
          host={typeof window !== "undefined" ? window.location.host : "woodex.pk"}
          seo={seo}
          onSeoChange={(patch) => { setSeo((prev) => ({ ...prev, ...patch })); markDirty(); }}
          report={seoReport}
          pageTitle={title}
        />
      )}

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
                  <button onClick={() => restoreVersion(h.version)} disabled={saving || publishing || restoring} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-muted">
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
        <BuilderDocProvider linkedStyles={linkedStyles} counts={hmCounts}>
        <LibraryActionsContext.Provider value={libraryActions}>
          <BuilderModeContext.Provider value="editor">
            <Puck
              key={puckKey}
              config={woodexConfig}
              data={puckData ?? { root: { props: {} }, content: [] }}
              plugins={puckPlugins}
              onChange={(data) => { setDoc(fromPuckData(data)); markDirty(); }}
              onPublish={() => doPublish(page.status !== "published")}
            />
          </BuilderModeContext.Provider>
        </LibraryActionsContext.Provider>
        </BuilderDocProvider>
      </div>
    </div>
  );
}
