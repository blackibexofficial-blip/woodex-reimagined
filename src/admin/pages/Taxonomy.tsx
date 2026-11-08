import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Tags, LayoutGrid, Layers, BadgeCheck, Palette, SlidersHorizontal, BadgePercent, Boxes, RadioTower, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoriesSection } from "@/admin/taxonomy/Categories.section";
import { CollectionsSection } from "@/admin/taxonomy/Collections.section";
import { SeriesSection } from "@/admin/taxonomy/Series.section";
import { BrandsSection } from "@/admin/taxonomy/Brands.section";
import { MaterialsSection } from "@/admin/taxonomy/Materials.section";
import { OptionsSection } from "@/admin/taxonomy/Options.section";
import { PriceListsSection } from "@/admin/taxonomy/PriceLists.section";
import { BundlesSection } from "@/admin/taxonomy/Bundles.section";
import { SalesChannelsSection } from "@/admin/taxonomy/SalesChannels.section";

/**
 * Commerce → Taxonomy (V4 P4 consolidation).
 *
 * One home for the nine catalogue taxonomies that used to be separate sidebar pages.
 * The sidebar collapses 43 → 35 entries; every legacy `/admin/<kind>` URL redirects
 * here with `?section=<kind>` so bookmarks, e2e hooks and a11y gates keep working.
 */
const SECTIONS = [
  { id: "categories", label: "Categories", icon: Tags, blurb: "Office & home tree", component: CategoriesSection },
  { id: "collections", label: "Collections", icon: LayoutGrid, blurb: "Curated edits", component: CollectionsSection },
  { id: "series", label: "Series", icon: Layers, blurb: "Ek · Modo · …", component: SeriesSection },
  { id: "brands", label: "Brands", icon: BadgeCheck, blurb: "Product brands", component: BrandsSection },
  { id: "materials", label: "Materials & Colors", icon: Palette, blurb: "Finishes + swatches", component: MaterialsSection },
  { id: "options", label: "Options", icon: SlidersHorizontal, blurb: "Variant attributes", component: OptionsSection },
  { id: "price-lists", label: "Price Lists", icon: BadgePercent, blurb: "Channel pricing", component: PriceListsSection },
  { id: "bundles", label: "Bundles", icon: Boxes, blurb: "Kit pricing", component: BundlesSection },
  { id: "sales-channels", label: "Channels & Markets", icon: RadioTower, blurb: "Stores & markets", component: SalesChannelsSection },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export default function AdminTaxonomy() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("section") ?? "categories";
  const active = SECTIONS.find((s) => s.id === raw) ?? SECTIONS[0];

  useEffect(() => {
    if (!SECTIONS.some((s) => s.id === raw)) setParams({ section: "categories" }, { replace: true });
  }, [raw, setParams]);

  const Active = active.component;

  return (
    <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* section rail — horizontal chips on mobile, sidebar on desktop */}
      <aside aria-label="Taxonomy sections" className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 hidden lg:block px-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Commerce</p>
          <h1 className="text-lg font-black tracking-tight text-foreground">Taxonomy</h1>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Nine catalogue taxonomies, one home.</p>
        </div>
        <nav aria-label="Taxonomy kinds" className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const on = s.id === active.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setParams({ section: s.id as SectionId })}
                aria-current={on ? "true" : undefined}
                title={s.blurb}
                className={cn(
                  "group flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm font-medium transition",
                  on
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-white text-muted-foreground hover:bg-muted hover:text-foreground lg:border-transparent lg:bg-transparent",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap lg:whitespace-normal">{s.label}</span>
                <ChevronRight className={cn("ml-auto hidden h-4 w-4 lg:block", on ? "text-accent opacity-100" : "opacity-0 group-hover:opacity-40")} aria-hidden />
              </button>
            );
          })}
        </nav>
      </aside>

      {/* active section */}
      <div className="min-w-0">
        <Active key={active.id} />
      </div>
    </div>
  );
}
