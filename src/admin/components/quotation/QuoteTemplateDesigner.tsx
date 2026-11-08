/**
 * WOODEX — quotation template designer (print document).
 * Clones built-ins into editable customs; required payment-note wording is locked.
 * Saving a built-in selection creates a custom copy (Woodex classic is code-owned).
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Lock, Loader2, Plus, Printer, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminQuoteTemplate, QuoteTemplateBlock } from "@/api/types";
import { PAYMENT_TERMS_NOTE, DEFAULT_QUOTE_TEMPLATE, WOODEX_A4_TEMPLATE, BUILTIN_TEMPLATES, isBuiltinTemplateId } from "@/api/quote-templates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentId?: string;
  onPick: (templateId: string) => void;
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export default function QuoteTemplateDesigner({ open, onOpenChange, currentId, onPick }: Props) {
  const api = useMemo(() => getAdminApi(), []);
  const [templates, setTemplates] = useState<AdminQuoteTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_QUOTE_TEMPLATE.id);
  const [draft, setDraft] = useState<AdminQuoteTemplate>(() => clone(DEFAULT_QUOTE_TEMPLATE));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.listQuoteTemplates()
      .then((list) => {
        setTemplates(list);
        const startId = currentId && list.some((t) => t.id === currentId) ? currentId : list[0]?.id ?? DEFAULT_QUOTE_TEMPLATE.id;
        setSelectedId(startId);
        setDraft(clone(list.find((t) => t.id === startId) ?? DEFAULT_QUOTE_TEMPLATE));
        setIsNew(false);
      })
      .catch(() => {
        setTemplates(BUILTIN_TEMPLATES);
        setSelectedId(DEFAULT_QUOTE_TEMPLATE.id);
        setDraft(clone(DEFAULT_QUOTE_TEMPLATE));
        toast.error("Could not load templates — showing the built-in.");
      })
      .finally(() => setLoading(false));
  }, [open, api, currentId]);

  const isBuiltin = isNew ? false : (draft.builtIn === true || isBuiltinTemplateId(draft.id));
  const showInList = isNew ? null : selectedId;

  const selectTemplate = (id: string) => {
    const hit = templates.find((t) => t.id === id);
    if (!hit) return;
    setSelectedId(id);
    setDraft(clone(hit));
    setIsNew(false);
  };

  const startNew = () => {
    const d = { ...clone(WOODEX_A4_TEMPLATE), id: "", name: "My quotation template", builtIn: false };
    setDraft(d);
    setSelectedId("");
    setIsNew(true);
  };

  const patchBlock = (region: "header" | "footer", blockId: string, patch: Partial<QuoteTemplateBlock>) =>
    setDraft((d) => ({ ...d, [region]: d[region].map((b) => (b.id === blockId ? { ...b, ...patch } : b)) }));

  const onLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      toast.error("Logo must be 200 KB or smaller — it travels inside the template record.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setDraft((d) => ({ ...d, logo: reader.result as string }));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const save = async () => {
    if (!draft.name.trim()) return toast.error("Template name is required.");
    setSaving(true);
    try {
      const payload = isBuiltin || isNew ? { ...draft, id: "", builtIn: false } : draft;
      const saved = await api.saveQuoteTemplate(payload);
      toast.success(isBuiltin ? "Built-in templates are code-owned — saved your changes as a custom copy." : "Template saved.");
      const list = await api.listQuoteTemplates();
      setTemplates(list);
      const hit = list.find((t) => t.id === saved.id) ?? saved;
      setSelectedId(hit.id);
      setDraft(clone(hit));
      setIsNew(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const removeCurrent = async () => {
    if (isBuiltin || isNew || !draft.id) return;
    setDeleting(true);
    try {
      const okFlag = await api.deleteQuoteTemplate(draft.id);
      if (!okFlag) return toast.error("Could not delete the template.");
      toast.success("Template deleted.");
      const list = await api.listQuoteTemplates();
      setTemplates(list);
      const startId = list[0]?.id ?? DEFAULT_QUOTE_TEMPLATE.id;
      setSelectedId(startId);
      setDraft(clone(list.find((t) => t.id === startId) ?? DEFAULT_QUOTE_TEMPLATE));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const renderBlock = (region: "header" | "footer", b: QuoteTemplateBlock) => {
    const locked = b.type === "payment-note";
    return (
      <div key={b.id} className="rounded-md border border-border bg-white p-2.5">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`blk-${b.id}`}
            checked={b.visible}
            disabled={locked}
            onCheckedChange={(v) => patchBlock(region, b.id, { visible: v === true })}
            aria-label={`${b.label} visibility`}
          />
          <Label htmlFor={`blk-${b.id}`} className="cursor-pointer text-xs font-semibold text-foreground">{b.label}</Label>
          {locked && (
            <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              <Lock className="h-3 w-3" /> Required
            </span>
          )}
        </div>
        <Textarea
          rows={2}
          value={b.content}
          disabled={locked || !b.visible}
          onChange={(e) => patchBlock(region, b.id, { content: e.target.value })}
          className="mt-1.5 bg-white text-xs disabled:opacity-70"
          aria-label={b.label}
        />
        {locked && <p className="mt-1 text-[10px] leading-snug text-muted-foreground">Required wording — locked to: “{PAYMENT_TERMS_NOTE}”</p>}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quotation template designer</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading templates…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[230px_1fr]">
            {/* template list */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Templates</p>
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t.id)}
                  aria-pressed={t.id === showInList}
                  className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs font-medium transition ${
                    t.id === showInList ? "border-hon-green bg-hon-green-pale/40" : "border-border hover:border-hon-green/60"
                  }`}
                >
                  <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10" style={{ background: t.brandColor }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {t.builtIn && <span className="shrink-0 text-[9px] font-bold uppercase text-muted-foreground">Builtin</span>}
                </button>
              ))}
              <button
                type="button"
                onClick={startNew}
                className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-xs font-semibold text-muted-foreground transition hover:border-hon-green hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> New template
              </button>
            </div>

            {/* editor */}
            <div className="space-y-3">
              {isBuiltin && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
                  {draft.name || "This template"} is built in — saving clones it as your own template.
                </p>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label htmlFor="tpl-name" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Template name</Label>
                  <Input id="tpl-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="bg-white" placeholder="e.g. Acme interiors – formal" />
                </div>
                <div>
                  <Label htmlFor="tpl-brand" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Brand colour</Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="tpl-brand"
                      type="color"
                      value={/^#[0-9a-fA-F]{6}$/.test(draft.brandColor) ? draft.brandColor : "#318b45"}
                      onChange={(e) => setDraft((d) => ({ ...d, brandColor: e.target.value }))}
                      className="h-9 w-11 cursor-pointer rounded border border-border bg-white p-0.5"
                      aria-label="Brand colour"
                    />
                    <Input
                      value={draft.brandColor}
                      onChange={(e) => setDraft((d) => ({ ...d, brandColor: e.target.value }))}
                      className="h-9 w-24 bg-white font-mono text-xs"
                      aria-label="Brand colour hex value"
                    />
                  </div>
                </div>
              </div>

              {/* layout picker */}
              <div>
                <p className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Print layout</p>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Print layout">
                  {([
                    { key: "classic" as const, name: "Woodex classic", hint: "Original formal sheet" },
                    { key: "a4" as const, name: "Woodex A4", hint: "Redesigned letterhead page — advance callout, terms grid, icon footer" },
                  ]).map((opt) => {
                    const active = (draft.layout ?? "classic") === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setDraft((d) => ({ ...d, layout: opt.key }))}
                        aria-pressed={active}
                        className={`rounded-md border px-3 py-2 text-left transition ${active ? "border-hon-green bg-hon-green-pale/40 ring-1 ring-hon-green" : "border-border hover:border-hon-green/60"}`}
                      >
                        <span className="block text-xs font-bold text-foreground">{opt.name}</span>
                        <span className="mt-0.5 block text-[9px] leading-snug text-muted-foreground">{opt.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* logo upload — A4 masthead */}
              <div>
                <p className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Logo — A4 masthead <span className="normal-case text-muted-foreground/70">(optional)</span></p>
                <div className="flex items-center gap-3">
                  {draft.logo ? (
                    <>
                      <img src={draft.logo} alt="Template logo preview" className="h-12 w-12 rounded-md border border-border object-contain p-0.5" />
                      <Button type="button" variant="outline" size="sm" onClick={() => setDraft((d) => ({ ...d, logo: undefined }))}>
                        <X className="mr-1 h-3.5 w-3.5" /> Remove logo
                      </Button>
                    </>
                  ) : (
                    <label htmlFor="tpl-logo" className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-xs font-semibold text-muted-foreground transition hover:border-hon-green hover:text-foreground">
                      <Upload className="h-4 w-4" /> Upload logo…
                      <input id="tpl-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={onLogoFile} />
                    </label>
                  )}
                </div>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">PNG, JPG, WebP or SVG, ≤ 200 KB. Shown on the A4 sheet masthead (the classic sheet stays typographic). Stored with the template record.</p>
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Header blocks</p>
              <div className="space-y-2">{draft.header.map((b) => renderBlock("header", b))}</div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Footer blocks</p>
              <div className="space-y-2">{draft.footer.map((b) => renderBlock("footer", b))}</div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {!isBuiltin && !isNew && (
              <Button variant="ghost" onClick={removeCurrent} disabled={deleting || saving} className="text-destructive hover:text-destructive">
                {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1.5 h-4 w-4" />}Delete
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button variant="outline" onClick={save} disabled={saving || loading || isNew && !draft.name.trim()}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Save
            </Button>
            <Button
              onClick={() => { onPick(isNew || !draft.id ? DEFAULT_QUOTE_TEMPLATE.id : (templates.some((t) => t.id === draft.id) ? draft.id : DEFAULT_QUOTE_TEMPLATE.id)); onOpenChange(false); }}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Printer className="mr-1.5 h-4 w-4" /> Use this template
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
