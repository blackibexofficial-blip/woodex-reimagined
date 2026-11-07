/**
 * WOODEX Puck block registry (Wave 2).
 *
 * Catalogue: 40 sections across 10 categories (plan §5.2) + 17 BASIC/WIDGETS elements
 * (plan §5.1) + three legacy starter blocks (SectionHeading / ImageBanner / ButtonLink)
 * kept for the seeded home document. Every catalogued block carries the shared
 * hidden/locked layer fields and a dynamic resolvePermissions (locked = inert).
 */
import type { Config } from "@puckeditor/core";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Truck, Hammer, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";
import { commonLayerFields, commonLayerDefaults, SectionShell, resolveLayerPermissions } from "./shell";
import { elementComponents } from "./elements";
import { catalogueA } from "./sections/catalogue-a";
import { catalogueB } from "./sections/catalogue-b";
import { homeBlocks } from "./sections/home-blocks";
import { InspectorSectionField, InspectorElementField, LinkedStylesField } from "./InspectorField";
import { richTextField, RichHtml } from "./richtext";

const ICONS = {
  shield: ShieldCheck,
  truck: Truck,
  hammer: Hammer,
  phone: PhoneCall,
} as const;

/** Legacy starter blocks — kept so the seeded `home` page renders unchanged. */
const legacyBlocks: Config["components"] = {
  SectionHeading: {
    label: "Section heading",
    fields: {
      ...commonLayerFields,
      eyebrow: { type: "text", placeholder: "PEACE OF MIND" },
      title: richTextField("Title", "Furniture that outlasts the brief"),
      subtitle: richTextField("Subtitle", "Supporting copy…"),
      align: {
        type: "radio",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
        ],
      },
    },
    defaultProps: {
      ...commonLayerDefaults,
      eyebrow: "WOODEX LAHORE",
      title: "Furniture that outlasts the brief",
      subtitle: "Engineered wood, powder-coated steel, and a warranty on every piece.",
      align: "center",
    },
    resolvePermissions: resolveLayerPermissions,
    render: ({ hidden, locked, eyebrow, title, subtitle, align, _inspector }: Record<string, unknown>) => {
      const centered = align === "center";
      return (
        <SectionShell hidden={hidden as string} locked={locked as string} label="Section heading" inspector={_inspector}>
          <div className="container mx-auto px-4 py-14">
            <div className={cn(centered && "text-center")}>
              <div className={cn("mb-5 h-1 w-12 bg-accent", centered && "mx-auto")} />
              {eyebrow ? <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">{String(eyebrow)}</p> : null}
              <RichHtml as="h2" className="mb-3 text-3xl font-bold" html={title} />
              {subtitle ? (
                <RichHtml as="p" className={cn("max-w-2xl text-muted-foreground", centered && "mx-auto")} html={subtitle} />
              ) : null}
            </div>
          </div>
        </SectionShell>
      );
    },
  },
  ImageBanner: {
    label: "Image banner",
    fields: {
      ...commonLayerFields,
      src: { type: "text", placeholder: "/assets/showroom-hero.webp or https://…" },
      alt: { type: "text", placeholder: "Alt text (required for a11y)" },
      caption: { type: "text", placeholder: "Optional caption" },
    },
    defaultProps: { ...commonLayerDefaults, src: "", alt: "WOODEX showroom", caption: "" },
    resolvePermissions: resolveLayerPermissions,
    render: ({ hidden, locked, src, alt, caption, _inspector }: Record<string, unknown>) => (
      <SectionShell hidden={hidden as string} locked={locked as string} label="Image banner" inspector={_inspector}>
        <div className="container mx-auto px-4 py-6">
          {src ? (
            <figure className="overflow-hidden rounded-xl border border-border">
              <img src={String(src)} alt={String(alt ?? "")} className="h-72 w-full object-cover" loading="lazy" />
              {caption ? (
                <figcaption className="border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground">{String(caption)}</figcaption>
              ) : null}
            </figure>
          ) : (
            <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              Set an image URL in the panel
            </div>
          )}
        </div>
      </SectionShell>
    ),
  },
  ButtonLink: {
    label: "Button link (section)",
    fields: {
      ...commonLayerFields,
      label: { type: "text", placeholder: "Book a showroom visit" },
      href: { type: "text", placeholder: "/showrooms" },
      variant: {
        type: "radio",
        options: [
          { label: "Accent", value: "accent" },
          { label: "Outline", value: "outline" },
        ],
      },
    },
    defaultProps: { ...commonLayerDefaults, label: "Book a showroom visit", href: "/showrooms", variant: "accent" },
    resolvePermissions: resolveLayerPermissions,
    render: ({ hidden, locked, label, href, variant, _inspector }: Record<string, unknown>) => (
      <SectionShell hidden={hidden as string} locked={locked as string} label="Button link" inspector={_inspector}>
        <div className="container mx-auto px-4 pb-14 text-center">
          {variant === "outline" ? (
            <Button variant="outline" className="px-8" asChild>
              <a href={String(href || "#")}>{String(label)}</a>
            </Button>
          ) : (
            <Button className="bg-accent px-8 text-accent-foreground hover:bg-hon-green-dark" asChild>
              <a href={String(href || "#")}>{String(label)}</a>
            </Button>
          )}
        </div>
      </SectionShell>
    ),
  },
};

const elementNames = new Set(Object.keys(elementComponents));

const baseComponents: Config["components"] = {
  ...legacyBlocks,
  ...elementComponents,
  ...catalogueA,
  ...catalogueB,
  ...homeBlocks,
};

/** Post-inject the Wave 4 inspector ("Style & Advanced") field into every block. */
const components: Config["components"] = Object.fromEntries(
  Object.entries(baseComponents).map(([name, cfg]) => [
    name,
    {
      ...cfg,
      fields: {
        ...(cfg.fields ?? {}),
        _inspector: {
          type: "custom" as const,
          label: "Style & Advanced",
          render: elementNames.has(name) ? InspectorElementField : InspectorSectionField,
        },
      },
    },
  ]),
);

export const woodexConfig: Config = {
  root: {
    fields: {
      _linkedStyles: {
        type: "custom",
        label: "Linked styles (page)",
        render: LinkedStylesField,
      },
    },
    render: ({ children }) => <div className="min-h-screen bg-background">{children}</div>,
  },
  components,
  categories: {
    basics: { title: "WOODEX basics", components: ["SectionHeading", "ImageBanner", "ButtonLink"] },
    hero: { title: "Hero", components: ["HeroCentered", "HeroCenteredTrust", "HeroForm", "HeroSplitForm", "HeroSplitStats", "HeroDark"] },
    features: { title: "Features", components: ["FeatureGrid", "FeatureIconList", "FeatureIconGrid2", "FeatureListImage", "BentoGallery", "StepsRow"] },
    pricing: { title: "Pricing", components: ["PricingTable", "PricingCards", "PricingToggled"] },
    stats: { title: "Stats & charts", components: ["StatsRow", "StatsBand", "ChartBlock"] },
    testimonials: { title: "Testimonials", components: ["TestimonialRow", "TestimonialWall", "TestimonialSingle"] },
    team: { title: "Team", components: ["TeamGrid", "TeamRoles"] },
    cta: { title: "Call to action", components: ["CtaStrip", "CtaSplit", "CtaBanner"] },
    content: { title: "Content", components: ["RichText", "TwoColumnText", "FaqAccordion", "ServiceList"] },
    forms: { title: "Forms", components: ["EnquiryForm", "NewsletterSignup", "CallbackForm", "NewsletterCard"] },
    components: { title: "Components", components: ["LogoStrip", "AwardsRow", "MapSection", "ContactCard", "HoursCard", "ShowroomTeaser", "CategoryCircles", "ProductRail"] },
    elements: { title: "Elements (BASIC + WIDGETS)", components: ["Heading", "SubHeading", "Paragraph", "SmallLabel", "Button", "TwoButtons", "Image", "VideoEmbed", "CheckList", "Quote", "Columns2", "Columns3", "CardBox", "Spacer", "DividerLine", "MapEmbed", "Icon"] },
  },
};
