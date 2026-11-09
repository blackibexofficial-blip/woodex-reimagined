import { safeBuilderHref } from "./safe-url";
/**
 * WOODEX builder — BASIC elements library (plan §5.1, legacy parity).
 * Elements are placeable anywhere in the page flow (v1 of nesting — section slots
 * land with the Wave 4 inspector). Each element is fully token-styled, WAI-labelled,
 * and honors the hidden/locked common layer fields.
 */
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import TailgridsDivider from "@/components/tailgrids/divider";
import { commonLayerFields, commonLayerDefaults, ElementShell, resolveLayerPermissions } from "./shell";
import { richTextField, RichHtml } from "./richtext";
import * as icons from "lucide-react";

const text = (label?: string, fallback = "") => ({ type: "text" as const, label, placeholder: fallback });
const area = (label?: string, fallback = "") => ({ type: "textarea" as const, label, placeholder: fallback });
const radio = <T extends string>(label: string, options: Array<{ label: string; value: T }>) =>
  ({ type: "radio" as const, label, options });

export const ELEMENT_DEFAULTS = commonLayerDefaults;
export const ELEMENT_FIELDS = { ...commonLayerFields };

/** The fixed icon set — self-hosted lucide, no icon-font (plan §5.1). */
export const ELEMENT_ICONS = [
  "shield-check", "truck", "hammer", "phone", "ruler", "sofa", "armchair", "lightbulb",
  "star", "check", "leaf", "warehouse", "sparkles", "heart-handshake", "map-pin",
] as const;

const ICON_MAP: Record<string, icons.LucideIcon> = {
  "shield-check": icons.ShieldCheck, truck: icons.Truck, hammer: icons.Hammer, phone: icons.PhoneCall,
  ruler: icons.Ruler, sofa: icons.Sofa, armchair: icons.Armchair, lightbulb: icons.Lightbulb,
  star: icons.Star, check: icons.Check, leaf: icons.Leaf, warehouse: icons.Warehouse,
  sparkles: icons.Sparkles, "heart-handshake": icons.HeartHandshake, "map-pin": icons.MapPin,
};

type ELProps = Record<string, unknown>;
const str = (props: ELProps, key: string, fallback = "") => String(props[key] ?? fallback);

const wrap = (el: string | null, props: ELProps, children: React.ReactNode) => (
  <ElementShell hidden={str(props, "hidden")} locked={str(props, "locked")} label={el ? String(el) : "Element"} inspector={props._inspector}>
    {children}
  </ElementShell>
);

export const elementComponents = {
  Heading: {
    label: "Heading",
    fields: { ...ELEMENT_FIELDS, eyebrow: text("Eyebrow", "WOODEX"), title: richTextField("Heading", "A heading worth reading"), level: radio("Level", [{ label: "H1", value: "h1" }, { label: "H2", value: "h2" }, { label: "H3", value: "h3" }, { label: "H4", value: "h4" }]), align: radio("Align", [{ label: "Left", value: "left" }, { label: "Center", value: "center" }]) },
    defaultProps: { ...ELEMENT_DEFAULTS, eyebrow: "", title: "Heading", level: "h2", align: "left" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => {
      const Tag = str(props, "level", "h2") as "h1" | "h2" | "h3" | "h4";
      const centered = str(props, "align") === "center";
      return wrap("Heading", props, (
        <div className={cn("mx-auto w-full max-w-4xl px-4 py-6", centered && "text-center")}>
          {str(props, "eyebrow") ? <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-accent">{str(props, "eyebrow")}</p> : null}
          <RichHtml as={Tag} className="text-2xl font-bold leading-snug sm:text-3xl" html={props.title} />
        </div>
      ));
    },
  },
  SubHeading: {
    label: "Sub-heading",
    fields: { ...ELEMENT_FIELDS, text: richTextField("Sub-heading", "One or two supporting sentences."), align: radio("Align", [{ label: "Left", value: "left" }, { label: "Center", value: "center" }]) },
    defaultProps: { ...ELEMENT_DEFAULTS, text: "A supporting sub-heading that sets the scene.", align: "left" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Sub-heading", props, (
      <div className={cn("mx-auto w-full max-w-3xl px-4 pb-4", str(props, "align") === "center" && "text-center")}>
        <RichHtml as="p" className="text-lg leading-relaxed text-muted-foreground" html={props.text} />
      </div>
    )),
  },
  Paragraph: {
    label: "Paragraph",
    fields: { ...ELEMENT_FIELDS, text: richTextField("Copy", "Write the paragraph…") },
    defaultProps: { ...ELEMENT_DEFAULTS, text: "Paragraph copy. Keep it short, concrete and useful." },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Paragraph", props, (
      <div className="mx-auto w-full max-w-3xl px-4 pb-4"><RichHtml as="p" className="leading-relaxed" html={props.text} /></div>
    )),
  },
  SmallLabel: {
    label: "Small label",
    fields: { ...ELEMENT_FIELDS, text: richTextField("Label", "SINCE 1987"), tone: radio("Tone", [{ label: "Accent", value: "accent" }, { label: "Muted", value: "muted" }]) },
    defaultProps: { ...ELEMENT_DEFAULTS, text: "SINCE 1987", tone: "accent" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Small label", props, (
      <div className="mx-auto w-full max-w-3xl px-4 pb-3">
        <RichHtml as="span" className={cn("text-[10px] font-bold uppercase tracking-[0.22em]", str(props, "tone") === "accent" ? "text-accent" : "text-muted-foreground")} html={props.text} />
      </div>
    )),
  },
  Button: {
    label: "Button",
    fields: { ...ELEMENT_FIELDS, label: text("Label", "Book a showroom visit"), href: text("Link", "/showrooms"), variant: radio("Variant", [{ label: "Accent", value: "accent" }, { label: "Outline", value: "outline" }, { label: "Ghost", value: "ghost" }]) },
    defaultProps: { ...ELEMENT_DEFAULTS, label: "Book a showroom visit", href: "/showrooms", variant: "accent" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Button", props, (
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <Button
          asChild
          variant={str(props, "variant") === "outline" ? "outline" : "default"}
          className={cn(str(props, "variant") === "accent" && "bg-accent text-accent-foreground hover:bg-hon-green-dark", str(props, "variant") === "ghost" && "bg-transparent text-foreground shadow-none hover:bg-muted")}
        >
          <a href={safeBuilderHref(str(props, "href", "#"))}>{str(props, "label")}</a>
        </Button>
      </div>
    )),
  },
  TwoButtons: {
    label: "Two buttons",
    fields: { ...ELEMENT_FIELDS, primaryLabel: text("Primary label", "Book a showroom visit"), primaryHref: text("Primary link", "/showrooms"), secondaryLabel: text("Secondary label", "Browse the catalogue"), secondaryHref: text("Secondary link", "/shop") },
    defaultProps: { ...ELEMENT_DEFAULTS, primaryLabel: "Book a showroom visit", primaryHref: "/showrooms", secondaryLabel: "Browse the catalogue", secondaryHref: "/shop" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Two buttons", props, (
      <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-3 px-4 pb-4">
        <Button asChild className="bg-accent text-accent-foreground hover:bg-hon-green-dark"><a href={safeBuilderHref(str(props, "primaryHref", "#"))}>{str(props, "primaryLabel")}</a></Button>
        <Button asChild variant="outline"><a href={safeBuilderHref(str(props, "secondaryHref", "#"))}>{str(props, "secondaryLabel")}</a></Button>
      </div>
    )),
  },
  Image: {
    label: "Image",
    fields: { ...ELEMENT_FIELDS, src: text("Image URL", "/assets/showroom-hero.webp"), alt: text("Alt text (required)", "WOODEX showroom"), caption: text("Caption", ""), rounded: radio("Corners", [{ label: "Rounded", value: "rounded" }, { label: "Sharp", value: "sharp" }]) },
    defaultProps: { ...ELEMENT_DEFAULTS, src: "", alt: "WOODEX showroom", caption: "", rounded: "rounded" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Image", props, (
      <div className="mx-auto w-full max-w-4xl px-4 pb-4">
        {str(props, "src") ? (
          <figure className={cn("overflow-hidden border border-border", str(props, "rounded") === "rounded" && "rounded-xl")}>
            <img src={str(props, "src")} alt={str(props, "alt") || "Image"} loading="lazy" className="h-64 w-full object-cover" />
            {str(props, "caption") ? <figcaption className="border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground">{str(props, "caption")}</figcaption> : null}
          </figure>
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">Set an image URL (alt text required)</div>
        )}
      </div>
    )),
  },
  VideoEmbed: {
    label: "Video (YouTube)",
    fields: { ...ELEMENT_FIELDS, youtubeId: text("YouTube video id", "dQw4w9WgXcQ"), title: text("Title", "WOODEX — inside the workshop") },
    defaultProps: { ...ELEMENT_DEFAULTS, youtubeId: "", title: "WOODEX video" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Video", props, (
      <div className="mx-auto w-full max-w-4xl px-4 pb-4">
        {str(props, "youtubeId") ? (
          <div className="aspect-video overflow-hidden rounded-xl border border-border">
            <iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(str(props, "youtubeId"))}`} title={str(props, "title", "Video")} allowFullScreen loading="lazy" />
          </div>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">Paste a YouTube video id</div>
        )}
      </div>
    )),
  },
  CheckList: {
    label: "Check list",
    fields: {
      ...ELEMENT_FIELDS,
      items: {
        type: "array" as const, label: "Items", max: 8, min: 1,
        arrayFields: { text: { type: "text" as const, label: "Item" } },
        defaultItemProps: () => ({ text: "Checklist item" }),
        getItemSummary: (item: { text?: string }) => item.text ?? "Item",
      },
    },
    defaultProps: { ...ELEMENT_DEFAULTS, items: [{ text: "Solid engineered-wood frames" }, { text: "5-year warranty, in-house service" }, { text: "Nationwide delivery and installation" }] },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Check list", props, (
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <ul className="space-y-2">
          {((props.items as Array<{ text?: string }>) ?? []).map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm leading-6"><icons.CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{item.text}</li>
          ))}
        </ul>
      </div>
    )),
  },
  Quote: {
    label: "Quote",
    fields: { ...ELEMENT_FIELDS, quote: richTextField("Quote", "The sofa survived twins, a relocation and five years of nightly use."), cite: text("Attribution", "— DHA Phase 6 couple") },
    defaultProps: { ...ELEMENT_DEFAULTS, quote: "The sofa survived twins, a relocation and five years of nightly use.", cite: "— DHA Phase 6 couple" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Quote", props, (
      <figure className="mx-auto w-full max-w-3xl border-l-4 border-accent bg-hon-green-pale/40 px-6 py-5">
        <blockquote className="text-lg italic leading-relaxed">“<RichHtml as="span" html={props.quote} />”</blockquote>
        {str(props, "cite") ? <figcaption className="mt-2 text-xs font-medium text-muted-foreground">{str(props, "cite")}</figcaption> : null}
      </figure>
    )),
  },
  Columns2: {
    label: "2 columns",
    fields: { ...ELEMENT_FIELDS, left: richTextField("Left column", "Left column copy."), right: richTextField("Right column", "Right column copy.") },
    defaultProps: { ...ELEMENT_DEFAULTS, left: "Left column copy.", right: "Right column copy." },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("2 columns", props, (
      <div className="mx-auto grid w-full max-w-4xl gap-6 px-4 pb-4 sm:grid-cols-2">
        <RichHtml as="p" className="leading-relaxed" html={props.left} />
        <RichHtml as="p" className="leading-relaxed" html={props.right} />
      </div>
    )),
  },
  Columns3: {
    label: "3 columns",
    fields: { ...ELEMENT_FIELDS, a: area("Column 1", "First column."), b: area("Column 2", "Second column."), c: area("Column 3", "Third column.") },
    defaultProps: { ...ELEMENT_DEFAULTS, a: "First column.", b: "Second column.", c: "Third column." },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("3 columns", props, (
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 pb-4 sm:grid-cols-3">
        {[str(props, "a"), str(props, "b"), str(props, "c")].map((t, i) => <p key={i} className="leading-relaxed">{t}</p>)}
      </div>
    )),
  },
  CardBox: {
    label: "Card box",
    fields: { ...ELEMENT_FIELDS, title: text("Title", "Showroom visit"), text: area("Copy", "Visit any WOODEX showroom — bring measurements, leave with a plan."), ctaLabel: text("CTA label", "Find your showroom"), ctaHref: text("CTA link", "/showrooms") },
    defaultProps: { ...ELEMENT_DEFAULTS, title: "Showroom visit", text: "Visit any WOODEX showroom — bring measurements, leave with a plan.", ctaLabel: "Find your showroom", ctaHref: "/showrooms" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Card box", props, (
      <div className="mx-auto w-full max-w-md px-4 pb-4">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-2 font-bold">{str(props, "title")}</h3>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{str(props, "text")}</p>
          <Button asChild variant="outline" size="sm"><a href={safeBuilderHref(str(props, "ctaHref", "#"))}>{str(props, "ctaLabel")}</a></Button>
        </div>
      </div>
    )),
  },
  Spacer: {
    label: "Spacer",
    fields: { ...ELEMENT_FIELDS, size: radio("Size", [{ label: "Small", value: "sm" }, { label: "Medium", value: "md" }, { label: "Large", value: "lg" }]) },
    defaultProps: { ...ELEMENT_DEFAULTS, size: "md" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Spacer", props, <div className={cn("mx-auto max-w-4xl", str(props, "size") === "sm" && "h-4", str(props, "size") === "md" && "h-10", str(props, "size") === "lg" && "h-20")} />),
  },
  DividerLine: {
    label: "Divider line",
    fields: { ...ELEMENT_FIELDS, label: text("Label (optional)", ""), tone: radio("Tone", [{ label: "Subtle", value: "subtle" }, { label: "Accent", value: "accent" }]) },
    defaultProps: { ...ELEMENT_DEFAULTS, label: "", tone: "subtle" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Divider line", props, (
      <div className="mx-auto w-full max-w-5xl px-4 pb-4">
        {str(props, "label") ? <TailgridsDivider label={str(props, "label")} /> : <div className={cn("h-px w-full", str(props, "tone") === "accent" ? "bg-accent" : "bg-border")} />}
      </div>
    )),
  },
  MapEmbed: {
    label: "Google map",
    fields: { ...ELEMENT_FIELDS, query: text("Place or address", "WOODEX Furniture Lahore"), height: radio("Height", [{ label: "Small", value: "sm" }, { label: "Medium", value: "md" }, { label: "Tall", value: "lg" }]) },
    defaultProps: { ...ELEMENT_DEFAULTS, query: "WOODEX Furniture Lahore", height: "md" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => wrap("Google map", props, (
      <div className="mx-auto w-full max-w-5xl px-4 pb-4">
        <iframe
          className={cn("w-full rounded-xl border border-border", str(props, "height") === "sm" && "h-40", str(props, "height") === "md" && "h-64", str(props, "height") === "lg" && "h-96")}
          src={`https://maps.google.com/maps?q=${encodeURIComponent(str(props, "query") || "Lahore")}&output=embed`}
          title={str(props, "query") || "Map"} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    )),
  },
  Icon: {
    label: "Icon",
    fields: { ...ELEMENT_FIELDS, name: radio("Icon", ELEMENT_ICONS.map((n) => ({ label: n, value: n }))), size: radio("Size", [{ label: "Small", value: "sm" }, { label: "Medium", value: "md" }, { label: "Large", value: "lg" }]), align: radio("Align", [{ label: "Left", value: "left" }, { label: "Center", value: "center" }]) },
    defaultProps: { ...ELEMENT_DEFAULTS, name: "sofa", size: "md", align: "center" },
    resolvePermissions: resolveLayerPermissions,
    render: (props) => {
      const Ico = ICON_MAP[str(props, "name", "sofa")] ?? icons.Sofa;
      const sz = str(props, "size") === "sm" ? "h-5 w-5" : str(props, "size") === "lg" ? "h-12 w-12" : "h-8 w-8";
      return wrap("Icon", props, (
        <div className={cn("mx-auto w-full max-w-3xl px-4 pb-3", str(props, "align") === "center" && "text-center")}>
          <Ico className={cn("inline-block text-accent", sz)} aria-hidden />
        </div>
      ));
    },
  },
};
