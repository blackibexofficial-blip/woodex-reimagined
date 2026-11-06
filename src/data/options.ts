/**
 * WOODEX — product option sets (Finish / Fabric / Size).
 *
 * Static source for the storefront (SEO/catalogue stays fully static), seeded
 * 1:1 into the admin demo DB (src/api/demo/db.ts) where sets are editable.
 * Option values carry a PKR price delta and an optional SKU suffix — PDP live
 * pricing/SKU are derived from these (no generated variant records; stock is
 * tracked at product level).
 */

export interface OptionValue {
  id: string;
  label: string;
  /** +/- PKR added to the base price of the product. */
  priceDelta: number;
  /** Appended to the SKU on variant selection, e.g. WDX-1001-NO. */
  skuSuffix?: string;
}

export interface OptionSet {
  id: string;
  name: string;
  values: OptionValue[];
}

export const OPTION_SETS: OptionSet[] = [
  {
    id: "opt-finish",
    name: "Finish",
    values: [
      { id: "opt-finish-no", label: "Natural Oak", priceDelta: 0, skuSuffix: "NO" },
      { id: "opt-finish-dw", label: "Dark Walnut", priceDelta: 15000, skuSuffix: "DW" },
      { id: "opt-finish-sr", label: "Sheesham Rosewood", priceDelta: 8000, skuSuffix: "SR" },
      { id: "opt-finish-mk", label: "Matte Black", priceDelta: 10000, skuSuffix: "MB" },
    ],
  },
  {
    id: "opt-fabric",
    name: "Fabric",
    values: [
      { id: "opt-fabric-beige", label: "Sand Beige", priceDelta: 0, skuSuffix: "FI-S" },
      { id: "opt-fabric-charcoal", label: "Charcoal Grey", priceDelta: 4000, skuSuffix: "FI-C" },
      { id: "opt-fabric-emerald", label: "Emerald Green", priceDelta: 6500, skuSuffix: "FI-E" },
      { id: "opt-fabric-tan", label: "Cognac Tan Leather", priceDelta: 12000, skuSuffix: "LE-C" },
    ],
  },
  {
    id: "opt-size",
    name: "Size",
    values: [
      { id: "opt-size-s", label: "Compact (1200 mm)", priceDelta: 0, skuSuffix: "SZ-S" },
      { id: "opt-size-std", label: "Standard (1500 mm)", priceDelta: 18000, skuSuffix: "SZ-M" },
      { id: "opt-size-xl", label: "Executive (1800 mm)", priceDelta: 35000, skuSuffix: "SZ-XL" },
    ],
  },
];

export const getOptionSet = (id: string): OptionSet | undefined => OPTION_SETS.find((s) => s.id === id);

/* ── Attachment rules: which sets apply to which product ────────────────────
 * Keyed by subcategory first, then category group. Falls back to Finish. */
const SUBCATEGORY_SETS: Record<string, string[]> = {
  "chairs": ["opt-finish", "opt-fabric"],
  "office-chairs": ["opt-finish", "opt-fabric"],
  "cafe": ["opt-finish", "opt-fabric"],
  "cafe-furniture": ["opt-finish", "opt-fabric"],
  "dining-chairs": ["opt-finish", "opt-fabric"],
  "public": ["opt-finish", "opt-fabric"],
  "public-sitting": ["opt-finish", "opt-fabric"],
  "office-sofas": ["opt-fabric"],
  "home-sofa": ["opt-fabric"],
  "living": ["opt-finish", "opt-fabric"],
  "home-office": ["opt-finish", "opt-size"],
  "executive-tables": ["opt-finish", "opt-size"],
  "manager-tables": ["opt-finish", "opt-size"],
  "staff-tables": ["opt-finish", "opt-size"],
  "meeting-tables": ["opt-finish", "opt-size"],
  "reception-tables": ["opt-finish", "opt-size"],
  "workstations": ["opt-finish", "opt-size"],
  "cubicle-workstations": ["opt-finish", "opt-size"],
  "dining-tables": ["opt-finish", "opt-size"],
  "dining-sets": ["opt-finish", "opt-size"],
};

const CATEGORY_SETS: Record<string, string[]> = {
  office: ["opt-finish"],
  home: ["opt-finish"],
  dining: ["opt-finish"],
};

/** Option set ids attached to a product (used by PDP + admin seed). */
export const optionSetIdsFor = (product: { subcategory?: string; category?: string }): string[] => {
  const sub = product.subcategory ?? "";
  if (SUBCATEGORY_SETS[sub]) return [...SUBCATEGORY_SETS[sub]];
  const cat = product.category ?? "";
  if (CATEGORY_SETS[cat]) return [...CATEGORY_SETS[cat]];
  return ["opt-finish"];
};

/** Resolved option sets for a product, in attachment order. */
export const optionSetsForProduct = (product: { subcategory?: string; category?: string }): OptionSet[] =>
  optionSetIdsFor(product)
    .map(getOptionSet)
    .filter((s): s is OptionSet => Boolean(s));

/** Combined price delta for a selection (value ids), e.g. Natural Oak + Charcoal. */
export const priceDeltaFor = (sets: OptionSet[], selection: Record<string, string>): number =>
  sets.reduce((sum, set) => {
    const value = set.values.find((v) => v.id === selection[set.id]);
    return sum + (value?.priceDelta ?? 0);
  }, 0);

export const skuSuffixFor = (sets: OptionSet[], selection: Record<string, string>): string =>
  sets
    .map((set) => set.values.find((v) => v.id === selection[set.id])?.skuSuffix)
    .filter((s): s is string => Boolean(s))
    .join("-");
