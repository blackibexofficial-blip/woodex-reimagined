/**
 * Wave 4 — Inspector fields (custom Puck fields).
 *
 * InspectorSectionField / InspectorElementField render the per-block inspector as
 * one dense panel: **Style** and **Advanced** tabs (content lives in Puck's own
 * fields panel above), with a Desktop/Tablet/Mobile device switch for the responsive
 * controls and a Normal/Hover toggle for the interactive colour slots.
 *
 * LinkedStylesField renders the page-root manager — rule name (hm-* convention),
 * colour / heading-colour / padding / radius declarations, and a live count of how
 * many blocks carry the token on this page. Element-level styles always win over the
 * linked rule (merge happens in the wrappers, not here).
 */
import { useState } from "react";
import type { ReactElement } from "react";
import { Monitor, Smartphone, Tablet, Trash2, Plus, CircleDot } from "lucide-react";
import {
  DEVICES,
  type Device,
  type HoverState,
  type InspectorValue,
  type LinkedStyleRule,
  normalizeInspector,
  normalizeLinkedStyles,
} from "./inspector";
import { useBuilderDocContext } from "./BuilderDocContext";
import { cn } from "@/lib/utils";

interface FieldRenderProps {
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const SEG_DEVICES: Array<{ value: Device; title: string; Icon: typeof Monitor }> = [
  { value: "desktop", title: "Desktop (≥1024px)", Icon: Monitor },
  { value: "tablet", title: "Tablet (640–1023px)", Icon: Tablet },
  { value: "mobile", title: "Mobile (<640px)", Icon: Smartphone },
];

const PADDING_OPTIONS = ["", "none", "sm", "md", "lg", "xl"] as const;
const RADIUS_OPTIONS = ["", "none", "sm", "md", "xl", "full"] as const;
const BORDER_OPTIONS = ["", "none", "thin", "thick"] as const;
const ALIGN_OPTIONS = ["", "left", "center", "right"] as const;
const ANIMATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "No animation" },
  { value: "fade-up", label: "Fade up" },
  { value: "fade-in", label: "Fade in" },
  { value: "slide-left", label: "Slide in (left)" },
  { value: "zoom-in", label: "Zoom in" },
];

const optionLabel = (v: string) => (v === "" ? "inherit (desktop → tablet → mobile)" : v);

const SelectRow = ({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: ReadonlyArray<string> | Array<{ value: string; label?: string }>; onChange: (v: string) => void }) => (
  <label className="block space-y-1">
    <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-accent">
      {options.map((o) => {
        const val = typeof o === "string" ? o : o.value;
        const labelText = typeof o === "string" ? optionLabel(o) : o.label ?? optionLabel(o.value);
        return <option key={val} value={val}>{labelText}</option>;
      })}
    </select>
  </label>
);

const HexRow = ({ id, label, value, onChange }: { id: string; label: string; value: string | undefined; onChange: (v: string) => void }) => (
  <div className="space-y-1">
    <span className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground"><label htmlFor={id}>{label}</label>
      {value && <button type="button" className="text-[10px] text-muted-foreground underline hover:text-foreground" onClick={() => onChange("")}>clear</button>}
    </span>
    <div className="flex items-center gap-2">
      <input id={id} type="color" aria-label={label} value={/^#[0-9a-fA-F]{6}$/.test(value ?? "") ? (value as string) : "#ffffff"}
        onChange={(e) => onChange(e.target.value)} className="h-8 w-10 shrink-0 rounded-md border border-border bg-background p-0.5" />
      <input type="text" aria-label={`${label} hex`} value={value ?? ""} placeholder="#ffffff or css color"
        onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:ring-2 focus:ring-accent" />
    </div>
  </div>
);

function useDevice(device: Device) {
  const key = (prefix: string) => (device === "desktop" ? `${prefix}Desktop` : device === "tablet" ? `${prefix}Tablet` : `${prefix}Mobile`) as keyof InspectorValue;
  return key;
}

const InspectorPanel = ({ value, onChange, isSection }: FieldRenderProps & { isSection?: boolean }): ReactElement => {
  const v = normalizeInspector(value);
  const set = (patch: Partial<InspectorValue>) => onChange({ ...v, ...patch });
  const [tab, setTab] = useState<"style" | "advanced">("style");
  const [device, setDevice] = useState<Device>("desktop");
  const [hover, setHover] = useState<HoverState>("normal");
  const key = useDevice(device);

  const padValue = (v[key("padding")] as string | undefined) ?? "";
  const radiusValue = (v[key("radius")] as string | undefined) ?? "";
  const borderValue = (v[key("border")] as string | undefined) ?? "";
  const alignValue = (v[key("align")] as string | undefined) ?? "";
  const animateValue = v.animate ?? "none";

  return (
    <div className="rounded-lg border border-border">
      {/* Tab bar */}
      <div role="tablist" aria-label="Inspector" className="flex items-center gap-1 border-b border-border p-1.5">
        {(["style", "advanced"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition",
              tab === t ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}>
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-3 p-3">
        {tab === "style" && (
          <>
            {/* Device + state switches */}
            <div className="flex items-center justify-between gap-2">
              <div role="group" aria-label="Device" className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                {SEG_DEVICES.map(({ value: d, title, Icon }) => (
                  <button key={d} type="button" aria-pressed={device === d} title={title} onClick={() => setDevice(d)}
                    className={cn("rounded p-1.5 transition", device === d ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}>
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
              <div role="group" aria-label="State" className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
                {(["normal", "hover"] as HoverState[]).map((s) => (
                  <button key={s} type="button" aria-pressed={hover === s} title={s === "hover" ? "Hover state colours" : "Rest state colours"} onClick={() => setHover(s)}
                    className={cn("rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition", hover === s ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}>
                    {s === "hover" ? ":hover" : "Normal"}
                  </button>
                ))}
              </div>
            </div>

            {/* Responsive controls */}
            <fieldset className="grid grid-cols-2 gap-2">
              <SelectRow id="bx-pad" label="Padding Y" value={padValue} options={PADDING_OPTIONS} onChange={(x) => set({ [key("padding")]: x } as Partial<InspectorValue>)} />
              <SelectRow id="bx-radius" label="Radius" value={radiusValue} options={RADIUS_OPTIONS} onChange={(x) => set({ [key("radius")]: x } as Partial<InspectorValue>)} />
              <SelectRow id="bx-border" label="Border" value={borderValue} options={BORDER_OPTIONS} onChange={(x) => set({ [key("border")]: x } as Partial<InspectorValue>)} />
              <SelectRow id="bx-align" label="Text align" value={alignValue} options={ALIGN_OPTIONS} onChange={(x) => set({ [key("align")]: x } as Partial<InspectorValue>)} />
            </fieldset>

            {/* Colours */}
            <div className="space-y-2 border-t border-border pt-3">
              <HexRow id="bx-bg" label={hover === "hover" ? "Background (:hover)" : "Background"}
                value={hover === "hover" ? v.bgHover : v.bg}
                onChange={(x) => set(hover === "hover" ? { bgHover: x } : { bg: x })} />
              <HexRow id="bx-color" label={hover === "hover" ? "Text colour (:hover)" : "Text colour"}
                value={hover === "hover" ? v.textColorHover : v.textColor}
                onChange={(x) => set(hover === "hover" ? { textColorHover: x } : { textColor: x })} />
              <HexRow id="bx-heading" label={hover === "hover" ? "Headings (:hover)" : "Heading colour"}
                value={hover === "hover" ? v.headingColorHover : v.headingColor}
                onChange={(x) => set(hover === "hover" ? { headingColorHover: x } : { headingColor: x })} />
            </div>
          </>
        )}

        {tab === "advanced" && (
          <>
            {isSection && (
              <SelectRow id="bx-tag" label="General — Tag" value={v.tag ?? ""}
                options={[{ value: "", label: "section (default)" }, { value: "div", label: "div" }, { value: "article", label: "article" }, { value: "aside", label: "aside" }, { value: "header", label: "header" }]}
                onChange={(x) => set({ tag: x })} />
            )}
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">General — ID</span>
              <input id="bx-id" value={v.anchorId ?? ""} placeholder="anchor-id" onChange={(e) => set({ anchorId: e.target.value })}
                className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">General — Title</span>
              <input id="bx-title" value={v.title ?? ""} placeholder="Tooltip / accessible title" onChange={(e) => set({ title: e.target.value })}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">General — Aria label</span>
              <input id="bx-aria" value={v.aria ?? ""} placeholder="Announce this block to screen readers" onChange={(e) => set({ aria: e.target.value })}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-accent" />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">General — Classes</span>
              <input id="bx-classes" value={v.classes ?? ""} placeholder="hm-card custom-class …" onChange={(e) => set({ classes: e.target.value })}
                className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:ring-2 focus:ring-accent" />
              <span className="block text-[10px] text-muted-foreground">Free classes. <code>hm-*</code> tokens opt into linked rules defined at the page root.</span>
            </label>
            <fieldset className="space-y-1.5">
              <legend className="text-[11px] font-medium text-muted-foreground">Responsive visibility</legend>
              <div className="flex items-center gap-2">
                {([["hideDesktop", "Hide on desktop"], ["hideTablet", "Hide on tablet"], ["hideMobile", "Hide on mobile"]] as Array<[keyof InspectorValue, string]>).map(([k, label]) => (
                  <label key={k} className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[11px] text-foreground hover:bg-muted">
                    <input type="checkbox" checked={Boolean(v[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<InspectorValue>)} className="h-3.5 w-3.5 accent-emerald-700" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <SelectRow id="bx-animate" label="Animation on scroll" value={animateValue} options={ANIMATE_OPTIONS} onChange={(x) => set({ animate: x })} />
            <p className="rounded-md border border-dashed border-border px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
              Element styles override linked (<code>hm-*</code>) rules. Linked rules are managed at the page root — click <strong>Page</strong> in the layers, not a block.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export const InspectorSectionField = (props: FieldRenderProps): ReactElement => (
  <InspectorPanel {...props} isSection />
);

export const InspectorElementField = (props: FieldRenderProps): ReactElement => (
  <InspectorPanel {...props} isSection={false} />
);

/* ───────────────────────── Linked styles — page-root manager ───────────────────────── */

const DECL_SLOT = (label: string, value: string | undefined, onChange: (v: string) => void, placeholder: string, mono = false) => (
  <label className="block space-y-1">
    <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    <input value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
      className={cn("h-8 w-full rounded-md border border-border bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-accent", mono && "font-mono")} />
  </label>
);

export const LinkedStylesField = ({ value, onChange }: FieldRenderProps): ReactElement => {
  const rules = normalizeLinkedStyles(value);
  const counts = useBuilderDocContext()?.counts;
  const [open, setOpen] = useState<string | null>(rules[0]?.id ?? null);

  const update = (id: string, patch: Partial<LinkedStyleRule> | { declarations: Partial<LinkedStyleRule["declarations"]> }) => {
    const next = rules.map((r) => {
      if (r.id !== id) return r;
      if ("declarations" in patch) return { ...r, declarations: { ...r.declarations, ...patch.declarations } };
      return { ...r, ...patch };
    });
    onChange(next);
  };
  const add = () => {
    const n = rules.length + 1;
    const id = `ls-${Date.now().toString(36)}`;
    onChange([...rules, { id, name: `hm-rule-${n}`, declarations: {} }]);
    setOpen(id);
  };
  const remove = (id: string) => onChange(rules.filter((r) => r.id !== id));

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Linked styles <span className="normal-case text-muted-foreground">(page-scoped)</span></span>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted">
          <Plus className="h-3 w-3" /> Add rule
        </button>
      </div>
      <div className="p-2">
        {rules.length === 0 && (
          <p className="px-2 py-3 text-[11px] leading-snug text-muted-foreground">
            No linked rules yet. A rule shares declarations with every block whose Advanced → Classes contain the same
            <code className="rounded bg-muted px-1">hm-*</code> token — element-level styles still win.
          </p>
        )}
        <ul className="space-y-2">
          {rules.map((rule) => {
            const count = counts?.get(rule.name) ?? 0;
            const expanded = open === rule.id;
            return (
              <li key={rule.id} className="rounded-lg border border-border bg-background">
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : rule.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <CircleDot className="h-3 w-3 shrink-0 text-accent" />
                      <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{rule.name}</code>
                    </span>
                    <span className="mt-0.5 block pl-5 text-[10px] text-muted-foreground">{count} block{count === 1 ? "" : "s"} on this page</span>
                  </button>
                  <button type="button" aria-label={`Remove ${rule.name}`} title="Delete rule" onClick={() => remove(rule.id)}
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {expanded && (
                  <div className="grid gap-2 border-t border-border px-2.5 py-2 sm:grid-cols-2">
                    {DECL_SLOT("Background", rule.declarations.background, (x) => update(rule.id, { declarations: { background: x } }), "#0C1628, section-light…")}
                    {DECL_SLOT("Text colour", rule.declarations.color, (x) => update(rule.id, { declarations: { color: x } }), "#1f2937", true)}
                    {DECL_SLOT("Heading colour", rule.declarations.headingColor, (x) => update(rule.id, { declarations: { headingColor: x } }), "#0C1628", true)}
                    {DECL_SLOT("Padding", rule.declarations.padding, (x) => update(rule.id, { declarations: { padding: x } }), "48px 0", true)}
                    {DECL_SLOT("Radius", rule.declarations.radius, (x) => update(rule.id, { declarations: { radius: x } }), "0.75rem", true)}
                    <label className="block space-y-1 sm:col-span-2">
                      <span className="text-[11px] font-medium text-muted-foreground">Rule name (hm-*)</span>
                      <input value={rule.name} onChange={(e) => update(rule.id, { name: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40) })}
                        className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-[11px] outline-none focus:ring-2 focus:ring-accent" />
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
