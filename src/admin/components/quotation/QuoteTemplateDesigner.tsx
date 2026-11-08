/**
 * WOODEX — quotation template designer (print document).
 * Clones built-ins into editable customs; required payment-note wording is locked.
 * Saving a built-in selection creates a custom copy (Woodex classic is code-owned).
 */
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, Lock, Loader2, Minus, Plus, Printer, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { getAdminApi } from "@/api";
import type { AdminQuote, AdminQuoteTemplate, QuoteTemplateBlock } from "@/api/types";
import { PAYMENT_TERMS_NOTE, DEFAULT_QUOTE_TEMPLATE, WOODEX_A4_TEMPLATE, BUILTIN_TEMPLATES, isBuiltinTemplateId, DEFAULT_TERMS_EN, DEFAULT_TERMS_UR, ADVANCE_CHIPS, clampAdvancePct } from "@/api/quote-templates";
import QuoteA4Sheet from "@/admin/components/documents/QuoteA4Sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Synthetic sample quote for the live preview — generic lines, ≈PKR 1.4 M, clearly labelled as a preview sample. */
const sampleQuote = (validityDays: number): AdminQuote => {
  const now = new Date();
  return {
    id: "WI-10204",
    customerName: "Demo Residence Client",
    customerPhone: "+92 300 0001001",
    customerEmail: "residence@example.com",
    company: undefined,
    city: "Lahore",
    address: "Bahria Orchard, Lahore",
    items: [
      { id: "sample-1", name: "Classic executive desk — made to order", quantity: 1, price: 420000 },
      { id: "sample-2", name: "Managers conference table — made to order", quantity: 1, price: 485000 },
      { id: "sample-3", name: "Ergonomic chair set — house pick", quantity: 1, price: 495000 },
    ],
    subtotal: 1400000,
    discountPct: 0,
    discountAmount: 0,
    shipping: 0,
    total: 1400000,
    validityDays,
    validUntil: new Date(now.getTime() + validityDays * 86400000).toISOString(),
    status: "sent",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    version: 1,
  };
};

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

  const previewDraft = useDeferredValue(draft);
  const previewQuote = useMemo(() => sampleQuote(previewDraft.validityDays ?? 30), [previewDraft.validityDays]);
  const previewValidUntil = useMemo(
    () => new Date(Date.now() + (previewDraft.validityDays ?? 30) * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    [previewDraft.validityDays],
  );
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
      <DialogContent className="max-h-[94vh] max-w-7xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quotation template designer</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading templates…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_minmax(0,400px)]">
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

              {/* advance & policy — A4 documents only */}
              {(draft.layout ?? "classic") === "a4" && (
                <section className="space-y-2 rounded-md border border-border bg-white p-3" aria-label="Advance payment and policy">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Advance &amp; policy — WI-10204</p>
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, termsEn: DEFAULT_TERMS_EN, termsUr: DEFAULT_TERMS_UR }))}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-hon-green-dark hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden /> Reset to WOODEX policy wording
                    </button>
                  </div>

                  {/* advance % stepper + quick chips */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="tpl-advance" className="text-xs font-medium text-foreground">Advance due</Label>
                    <div className="flex items-center rounded-md border border-border">
                      <button type="button" aria-label="Decrease advance" className="p-1.5 text-muted-foreground hover:text-foreground" onClick={() => setDraft((d) => ({ ...d, advancePct: clampAdvancePct((d.advancePct ?? 75) - 5) }))}><Minus className="h-3.5 w-3.5" aria-hidden /></button>
                      <Input
                        id="tpl-advance"
                        type="number" min={0} max={100} step={1}
                        value={clampAdvancePct(draft.advancePct ?? 75)}
                        onChange={(e) => setDraft((d) => ({ ...d, advancePct: clampAdvancePct(e.target.value) }))}
                        className="h-8 w-16 border-0 text-center font-semibold focus-visible:ring-0"
                        aria-label="Advance percentage"
                      />
                      <button type="button" aria-label="Increase advance" className="p-1.5 text-muted-foreground hover:text-foreground" onClick={() => setDraft((d) => ({ ...d, advancePct: clampAdvancePct((d.advancePct ?? 75) + 5) }))}><Plus className="h-3.5 w-3.5" aria-hidden /></button>
                    </div>
                    <span className="text-xs text-muted-foreground">% · balance {100 - clampAdvancePct(draft.advancePct ?? 75)}%</span>
                    <div className="flex flex-wrap gap-1" role="group" aria-label="Advance quick picks">
                      {ADVANCE_CHIPS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, advancePct: c }))}
                          aria-pressed={clampAdvancePct(draft.advancePct ?? 75) === c}
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition ${clampAdvancePct(draft.advancePct ?? 75) === c ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:border-accent hover:text-foreground"}`}
                        >
                          {c}%
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* validity */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="tpl-validity" className="text-xs font-medium text-foreground">Validity (days)</Label>
                    <Input
                      id="tpl-validity"
                      type="number" min={1} max={365} step={1}
                      value={draft.validityDays ?? 30}
                      onChange={(e) => setDraft((d) => ({ ...d, validityDays: Math.max(1, Math.min(365, Math.round(Number(e.target.value) || 30))) }))}
                      className="h-8 w-20 bg-white text-center font-semibold"
                    />
                    <span className="text-xs text-muted-foreground">→ Valid until <span className="font-semibold text-foreground">{previewValidUntil}</span></span>
                  </div>

                  {/* EN wording */}
                  <div>
                    <Label htmlFor="tpl-terms-en" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Policy wording — English</Label>
                    <Textarea id="tpl-terms-en" rows={4} value={draft.termsEn ?? ""} onChange={(e) => setDraft((d) => ({ ...d, termsEn: e.target.value }))} className="bg-white font-mono text-[11px] leading-relaxed" />
                    <p className="mt-0.5 text-[9px] text-muted-foreground">Placeholders: {"{advance}"} · {"{balance}"} · {"{advancePct}"} · {"{balancePct}"} · {"{validUntil}"}</p>
                  </div>

                  {/* UR wording */}
                  <div>
                    <Label htmlFor="tpl-terms-ur" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Policy wording — اردو (RTL)</Label>
                    <Textarea id="tpl-terms-ur" dir="rtl" lang="ur" rows={4} value={draft.termsUr ?? ""} onChange={(e) => setDraft((d) => ({ ...d, termsUr: e.target.value }))} className="bg-white text-[11px] leading-relaxed" />
                  </div>

                  {/* acceptance block */}
                  <label htmlFor="tpl-acceptance" className="flex cursor-pointer items-start gap-2">
                    <Checkbox id="tpl-acceptance" checked={draft.acceptanceBlock ?? true} onCheckedChange={(v) => setDraft((d) => ({ ...d, acceptanceBlock: v === true }))} />
                    <span className="text-xs leading-snug text-foreground"><span className="font-semibold">Client acceptance block</span><br /><span className="text-[10px] text-muted-foreground">Signature &amp; date lines both sides — “CLIENT ACCEPTANCE” left, “WOODEX — Authorized Signatory &amp; Stamp” right (WI-10204).</span></span>
                  </label>

                  {/* signatory footer variant */}
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Signatory footer</p>
                    <div role="group" aria-label="Signatory footer variant" className="flex flex-wrap gap-1.5">
                      {([
                        { id: "zainab" as const, label: "Zainab Tower (default)" },
                        { id: "store" as const, label: "Store address" },
                        { id: "custom" as const, label: "Custom lines" },
                      ]).map((opt) => {
                        const active = (draft.footerVariant ?? "zainab") === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setDraft((d) => ({ ...d, footerVariant: opt.id }))}
                            className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition ${active ? "border-hon-green bg-hon-green-pale/40 ring-1 ring-hon-green text-foreground" : "border-border text-muted-foreground hover:border-hon-green/60 hover:text-foreground"}`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {(draft.footerVariant ?? "zainab") === "custom" && (
                      <Textarea id="tpl-footer-custom" rows={3} value={draft.footerCustomLines ?? ""} onChange={(e) => setDraft((d) => ({ ...d, footerCustomLines: e.target.value }))} placeholder={"Line 1 — wordmark\nLine 2 — address\nLine 3 — phone · email"} className="mt-1.5 bg-white text-xs" aria-label="Custom signatory footer lines" />
                    )}
                    <p className="mt-1 text-[9px] leading-snug text-muted-foreground">Zainab Tower carries the WI-10204 house block (+92 322 4000768 · info@woodex.com.pk). Store address uses the canonical storefront lines from src/config/site.ts.</p>
                  </div>
                </section>
              )}

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

            {/* live A4 preview — re-renders on every edit (deferred ≤150ms) */}
            <aside aria-live="polite" aria-label="Live A4 preview" className="hidden xl:block">
              <p className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Live A4 preview</p>
              {(draft.layout ?? "classic") === "a4" ? (
                <div className="max-h-[72vh] overflow-auto rounded-md border border-border bg-[#eceae4] p-2">
                  <div style={{ zoom: 0.46 }}>
                    <QuoteA4Sheet quote={previewQuote} tDoc={previewDraft} vars={{ ref: previewQuote.id, version: 1, validUntil: previewValidUntil, customer: previewQuote.customerName }} />
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/40 p-6 text-center text-[11px] leading-relaxed text-muted-foreground">
                  The classic sheet has no live preview.<br />Switch <span className="font-semibold text-foreground">Print layout → Woodex A4</span> to edit the advance %, wording, acceptance block and footer against the printed page.
                </div>
              )}
              <p className="mt-1 px-0.5 text-[9px] leading-snug text-muted-foreground">Sample quote — generic preview lines totalling ≈ PKR 1.4 M. Your printed sheet uses the real quotation.</p>
            </aside>
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
