/**
 * Home-page seed blocks (2026-11-07).
 *
 * Two blocks used by the seeded "home" document so the builder's Home page mirrors the real
 * storefront home (src/pages/Index.tsx + src/components/home/*) with live data, not copied JSON:
 *
 *  - CategoryCircles — the scrolling row of circular category images (ProductCategoriesRow).
 *    Items are configured inline (label / href / image URL); seeded with the 8 real categories.
 *  - ProductRail — the "Latest Collection" rail, rendered at runtime from the catalog module
 *    (src/data/products.ts). Filter: best sellers (default) / new arrivals / all — the card
 *    links to /product/<id>, so the builder and /lab/home always show the live catalog.
 *
 * Both carry the shared hidden/locked layer fields like every catalogue section.
 */
import type { ComponentConfig } from "@puckeditor/core";
import { ArrowRight } from "lucide-react";
import { commonLayerFields, commonLayerDefaults, SectionShell, resolveLayerPermissions } from "../shell";
import { products } from "@/data/products";

type P = Record<string, unknown>;
const str = (p: P, k: string, fb = "") => String(p[k] ?? fb);
const arr = <T,>(p: P, k: string): T[] => (Array.isArray(p[k]) ? (p[k] as T[]) : []);
const humanize = (v: string) =>
  v.split(/[-_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const sec = (
  label: string,
  extraFields: Record<string, unknown>,
  defaults: Record<string, unknown>,
  render: (p: P) => React.ReactNode,
): ComponentConfig<P> => ({
  label,
  fields: { ...commonLayerFields, ...extraFields },
  defaultProps: { ...commonLayerDefaults, ...defaults },
  resolvePermissions: resolveLayerPermissions,
  render: (props) => (
    <SectionShell hidden={str(props, "hidden")} locked={str(props, "locked")} label={label}>
      <div className="container mx-auto px-4 py-12">{render(props)}</div>
    </SectionShell>
  ),
});

const circleField = {
  type: "array" as const,
  label: "Circles",
  max: 12,
  min: 1,
  arrayFields: {
    label: { type: "text", label: "Label" },
    href: { type: "text", label: "Link" },
    image: { type: "text", label: "Image URL" },
  },
  defaultItemProps: { label: "Category", href: "/shop", image: "" },
  getItemSummary: (item: { label?: string }) => item.label ?? "Circle",
};

const circleDefaults = [
  { label: "Reception Desk", href: "/shop?category=reception-tables", image: "/assets/home/product-reception-counter.webp" },
  { label: "Cubicle Workstation", href: "/shop?category=cubicle-workstations", image: "/assets/home/product-cubicle.webp" },
  { label: "Office Storage", href: "/shop?category=storage", image: "/assets/home/product-storage.webp" },
  { label: "Office Chair", href: "/shop?category=chairs", image: "/assets/home/product-office-chair.webp" },
  { label: "Staff Tables", href: "/shop?category=staff-tables", image: "/assets/home/product-staff-desk.webp" },
  { label: "Office Sofas", href: "/shop?category=office-sofas", image: "/assets/home/product-office-sofa.webp" },
  { label: "Executive Table", href: "/shop?category=executive-tables", image: "/assets/home/product-executive-desk.webp" },
  { label: "Meeting Table", href: "/shop?category=meeting-tables", image: "/assets/home/product-meeting-table.webp" },
];

export const homeBlocks: Record<string, ComponentConfig<P>> = {
  CategoryCircles: sec(
    "Category circles",
    { circles: circleField },
    { circles: circleDefaults },
    (p) => (
      <div className="flex gap-6 overflow-x-auto pb-2">
        {arr<{ label?: string; href?: string; image?: string }>(p, "circles").map((item, i) => (
          <a key={i} href={item.href || "/shop"} className="group w-[120px] flex-shrink-0 text-center">
            <div className="mx-auto mb-3 h-[110px] w-[110px] overflow-hidden rounded-full border-2 border-transparent bg-muted transition-colors group-hover:border-accent">
              {item.image ? (
                <img src={item.image} alt={item.label ?? ""} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
              ) : null}
            </div>
            <p className="text-xs font-semibold text-foreground transition-colors group-hover:text-accent">{item.label}</p>
          </a>
        ))}
      </div>
    ),
  ),

  ProductRail: sec(
    "Latest products (live catalog)",
    {
      title: { type: "text", label: "Heading", placeholder: "Latest Collection" },
      subtitle: { type: "textarea", label: "Sub", placeholder: "Handpicked premium furniture for the modern workspace" },
      filter: { type: "select", label: "Source", options: [
        { label: "Best sellers", value: "isBestSeller" },
        { label: "New arrivals", value: "isNew" },
        { label: "All products", value: "all" },
      ] },
      limit: { type: "select", label: "Tiles", options: [{ label: "4", value: "4" }, { label: "8", value: "8" }] },
    },
    { title: "Latest Collection", subtitle: "Handpicked premium furniture for the modern workspace", filter: "isBestSeller", limit: "4" },
    (p) => {
      const limit = Math.max(1, Math.min(8, Number(str(p, "limit", "4")) || 4));
      const filter = str(p, "filter", "isBestSeller");
      const pool =
        filter === "all" ? products
        : filter === "isNew" ? products.filter((pr) => pr.isNew)
        : products.filter((pr) => pr.isBestSeller);
      const picks = (pool.length > 0 ? pool : products).slice(0, limit);
      return (
        <>
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 className="mb-1 text-2xl font-bold sm:text-3xl">{str(p, "title")}</h2>
              {str(p, "subtitle") ? <p className="text-sm text-muted-foreground">{str(p, "subtitle")}</p> : null}
            </div>
            <a href="/shop" className="hidden items-center gap-1 rounded-md border border-accent px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground sm:inline-flex">
              View All <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {picks.map((product) => (
              <a
                key={product.id}
                href={`/product/${product.id}`}
                className="group overflow-hidden rounded-sm border border-border bg-background transition-all hover:border-accent hover:shadow-lg"
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  <img src={product.images[0]} alt={product.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="p-3 text-center">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{humanize(product.subcategory ?? product.category)}</p>
                  <h3 className="text-xs font-bold leading-snug transition-colors group-hover:text-accent">{product.name}</h3>
                  <p className="mt-1 text-xs font-semibold text-foreground">Rs {product.price.toLocaleString("en-PK")}</p>
                </div>
              </a>
            ))}
          </div>
        </>
      );
    },
  ),
};
