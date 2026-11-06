/**
 * WOODEX Puck block registry (spike for the page-builder master plan).
 *
 * Every block renders with the real WOODEX UI kit (house classes, Button,
 * lucide icons) so what editors drop in is what the storefront ships.
 * Wave 1 replaces the localStorage persistence with the demo-DB pages bundle
 * and adds theme blocks (header/footer/announcement) — see
 * docs/08-master-plan/PAGE-BUILDER-MASTER-PLAN.md.
 */
import type { Config } from "@puckeditor/core";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Truck, Hammer, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  shield: ShieldCheck,
  truck: Truck,
  hammer: Hammer,
  phone: PhoneCall,
} as const;

export const woodexConfig: Config = {
  root: {
    render: ({ children }) => <div className="min-h-screen bg-background">{children}</div>,
  },
  components: {
    SectionHeading: {
      label: "Section heading",
      fields: {
        eyebrow: { type: "text", placeholder: "PEACE OF MIND" },
        title: { type: "text", placeholder: "Furniture that outlasts the brief" },
        subtitle: { type: "textarea", placeholder: "Supporting copy…" },
        align: {
          type: "radio",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
          ],
        },
      },
      defaultProps: {
        eyebrow: "WOODEX LAHORE",
        title: "Furniture that outlasts the brief",
        subtitle: "Engineered wood, powder-coated steel, and a warranty on every piece.",
        align: "center",
      },
      render: ({ eyebrow, title, subtitle, align }) => {
        const centered = align === "center";
        return (
          <section className="py-14">
            <div className={cn("container mx-auto px-4", centered && "text-center")}>
              <div className={cn("mb-5 h-1 w-12 bg-accent", centered && "mx-auto")} />
              {eyebrow ? <p className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">{eyebrow}</p> : null}
              <h2 className="mb-3 text-3xl font-bold">{title}</h2>
              {subtitle ? (
                <p className={cn("max-w-2xl text-muted-foreground", centered && "mx-auto")}>{subtitle}</p>
              ) : null}
            </div>
          </section>
        );
      },
    },
    FeatureGrid: {
      label: "Feature grid",
      fields: {
        items: {
          type: "array",
          max: 6,
          min: 1,
          arrayFields: {
            icon: {
              type: "select",
              options: [
                { label: "Shield", value: "shield" },
                { label: "Truck", value: "truck" },
                { label: "Hammer", value: "hammer" },
                { label: "Phone", value: "phone" },
              ],
            },
            title: { type: "text" },
            text: { type: "textarea" },
          },
          defaultItemProps: {
            icon: "shield",
            title: "Feature title",
            text: "Short supporting copy.",
          },
          getItemSummary: (item: { title?: string }) => item.title || "Feature",
        },
      },
      defaultProps: {
        items: [
          { icon: "shield", title: "5-Year Warranty", text: "Frames and joints covered across the WOODEX range." },
          { icon: "truck", title: "Nationwide Delivery", text: "Lahore, Karachi, Islamabad, Rawalpindi and beyond." },
          { icon: "hammer", title: "In-House Craft", text: "Built in our Lahore workshop, fitted by our own team." },
        ],
      },
      render: ({ items }) => (
        <section className="py-10">
          <div className="container mx-auto grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3">
            {((items ?? []) as Array<{ icon?: keyof typeof ICONS; title?: string; text?: string }>).map((item, i) => {
              const Icon = ICONS[item.icon ?? "shield"] ?? ShieldCheck;
              return (
                <div key={i} className="rounded-xl border border-border bg-card p-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-hon-green-pale">
                    <Icon className="h-6 w-6 text-accent" />
                  </div>
                  <h3 className="mb-1 font-bold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.text}</p>
                </div>
              );
            })}
          </div>
        </section>
      ),
    },
    ImageBanner: {
      label: "Image banner",
      fields: {
        src: { type: "text", placeholder: "/assets/showroom-hero.webp or https://…" },
        alt: { type: "text", placeholder: "Alt text (required for a11y)" },
        caption: { type: "text", placeholder: "Optional caption" },
      },
      defaultProps: {
        src: "",
        alt: "WOODEX showroom",
        caption: "",
      },
      render: ({ src, alt, caption }) => (
        <section className="py-6">
          <div className="container mx-auto px-4">
            {src ? (
              <figure className="overflow-hidden rounded-xl border border-border">
                <img src={src} alt={alt ?? ""} className="h-72 w-full object-cover" loading="lazy" />
                {caption ? (
                  <figcaption className="border-t border-border bg-card px-4 py-2 text-xs text-muted-foreground">
                    {caption}
                  </figcaption>
                ) : null}
              </figure>
            ) : (
              <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                Set an image URL in the panel (media picker lands in Wave 1)
              </div>
            )}
          </div>
        </section>
      ),
    },
    ButtonLink: {
      label: "Button",
      fields: {
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
      defaultProps: {
        label: "Book a showroom visit",
        href: "/showrooms",
        variant: "accent",
      },
      render: ({ label, href, variant }) => (
        <section className="pb-14">
          <div className="container mx-auto px-4 text-center">
            {variant === "outline" ? (
              <Button variant="outline" className="px-8" asChild>
                <a href={href || "#"}>{label}</a>
              </Button>
            ) : (
              <Button className="bg-accent px-8 text-accent-foreground hover:bg-hon-green-dark" asChild>
                <a href={href || "#"}>{label}</a>
              </Button>
            )}
          </div>
        </section>
      ),
    },
  },
  categories: {
    woodex: {
      title: "WOODEX blocks",
      components: ["SectionHeading", "FeatureGrid", "ImageBanner", "ButtonLink"],
    },
  },
};
