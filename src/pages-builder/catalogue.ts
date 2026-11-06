/**
 * WOODEX builder — section & element catalogue manifest (Wave 2, plan §5.1/§5.2).
 * Single source of truth for the Library panel: tabs, chips, counts, search.
 * 40 sections across 10 categories + 17 elements — asserted at import time.
 */
import { catalogueA } from "./sections/catalogue-a";
import { catalogueB } from "./sections/catalogue-b";
import { elementComponents } from "./elements";

export type CatalogueCategory =
  | "hero" | "features" | "pricing" | "stats" | "testimonials" | "team"
  | "cta" | "content" | "forms" | "components";

export const CATEGORY_LABELS: Record<CatalogueCategory, string> = {
  hero: "Hero", features: "Features", pricing: "Pricing", stats: "Stats & charts",
  testimonials: "Testimonials", team: "Team", cta: "Call to action",
  content: "Content", forms: "Forms", components: "Components",
};

const CATEGORY_OF: Record<string, CatalogueCategory> = {
  HeroCentered: "hero", HeroCenteredTrust: "hero", HeroForm: "hero", HeroSplitForm: "hero", HeroSplitStats: "hero", HeroDark: "hero",
  FeatureGrid: "features", FeatureIconList: "features", FeatureIconGrid2: "features", FeatureListImage: "features", BentoGallery: "features", StepsRow: "features",
  PricingTable: "pricing", PricingCards: "pricing", PricingToggled: "pricing",
  StatsRow: "stats", StatsBand: "stats", ChartBlock: "stats",
  TestimonialRow: "testimonials", TestimonialWall: "testimonials", TestimonialSingle: "testimonials",
  TeamGrid: "team", TeamRoles: "team",
  CtaStrip: "cta", CtaSplit: "cta", CtaBanner: "cta",
  RichText: "content", TwoColumnText: "content", FaqAccordion: "content", ServiceList: "content",
  EnquiryForm: "forms", NewsletterSignup: "forms", CallbackForm: "forms", NewsletterCard: "forms",
  LogoStrip: "components", AwardsRow: "components", MapSection: "components", ContactCard: "components", HoursCard: "components", ShowroomTeaser: "components",
};

export interface CatalogueEntry {
  type: string;
  label: string;
  category: CatalogueCategory;
}

const sectionConfigs = { ...catalogueA, ...catalogueB };

export const SECTION_CATALOGUE: CatalogueEntry[] = Object.entries(sectionConfigs).map(([type, cfg]) => {
  const category = CATEGORY_OF[type];
  if (!category) throw new Error(`catalogue.ts: section "${type}" has no category mapping`);
  return { type, label: (cfg as { label?: string }).label ?? type, category };
});

export const ELEMENT_CATALOGUE: CatalogueEntry[] = Object.entries(elementComponents).map(([type, cfg]) => ({
  type,
  label: (cfg as { label?: string }).label ?? type,
  category: "content" as CatalogueCategory,
}));

export const SECTION_COUNT = SECTION_CATALOGUE.length;
if (SECTION_COUNT !== 40) {
  throw new Error(`catalogue.ts: expected exactly 40 catalogue sections, got ${SECTION_COUNT} — update the chips/e2e assertions`);
}

export const CATEGORY_CHIPS: Array<{ id: CatalogueCategory | "all"; label: string; count: number }> = [
  { id: "all", label: `All ${SECTION_COUNT}`, count: SECTION_COUNT },
  ...(Object.keys(CATEGORY_LABELS) as CatalogueCategory[]).map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    count: SECTION_CATALOGUE.filter((s) => s.category === id).length,
  })),
];
