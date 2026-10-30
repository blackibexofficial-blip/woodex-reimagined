import type { ApiMaterialGroup } from "@/lib/api/types";

/**
 * The finishes and materials the bundled catalogue offers, for when the API is unreachable.
 *
 * This mirrors `platform/database/seeders/data/catalog.json` → `attributes`, and a PHP test
 * (`MaterialVocabularyTest`) compares the two so the mirror cannot drift.
 *
 * It is deliberately *not* `src/data/materials.ts`. That file is the configurator's texture
 * palette — sixteen woods, metals and fabrics chosen to preview a room in three dimensions —
 * and it is not, and never was, a claim about what the shop can deliver. The Materials page
 * used to render that palette as if it were inventory, and offered six wood finishes of which
 * the catalogue has one.
 *
 * Counts are `null`: offline there is no catalogue to count against, and "0 products" would be
 * a worse lie than "unknown".
 */
export const materialSnapshot: ApiMaterialGroup[] = [
  {
    code: "finish",
    name: "Finish",
    type: "swatch",
    swatch_type: "colour",
    options: [
      { code: "natural-oak", label: "Natural Oak", hex: "#C8A97E", image: null, products: null, variants: null },
      { code: "dark-walnut", label: "Dark Walnut", hex: "#5B3A29", image: null, products: null, variants: null },
      { code: "matte-black", label: "Matte Black", hex: "#1C1C1C", image: null, products: null, variants: null },
    ],
  },
  {
    code: "material",
    name: "Material",
    type: "select",
    swatch_type: null,
    options: [
      { code: "38mm-mdf-melamine", label: "38mm MDF Melamine", hex: null, image: null, products: null, variants: null },
      { code: "mdf-melamine", label: "MDF Melamine", hex: null, image: null, products: null, variants: null },
      { code: "mdf-melamine-dark-walnut", label: "MDF Melamine (Dark Walnut)", hex: null, image: null, products: null, variants: null },
      { code: "mdf-melamine-natural-oak", label: "MDF Melamine (Natural Oak)", hex: null, image: null, products: null, variants: null },
      { code: "dark-oak-veneer", label: "Dark Oak Veneer", hex: null, image: null, products: null, variants: null },
      { code: "natural-walnut-veneer-glass", label: "Natural Walnut Veneer + Glass", hex: null, image: null, products: null, variants: null },
      { code: "premium-walnut-veneer-tempered-glass", label: "Premium Walnut Veneer + Tempered Glass", hex: null, image: null, products: null, variants: null },
      { code: "solid-hardwood", label: "Solid hardwood", hex: null, image: null, products: null, variants: null },
      { code: "walnut-veneer", label: "Walnut Veneer", hex: null, image: null, products: null, variants: null },
      { code: "full-mesh", label: "Full Mesh", hex: null, image: null, products: null, variants: null },
      { code: "mesh-back-moltyfoam", label: "Mesh Back + MoltyFoam", hex: null, image: null, products: null, variants: null },
      { code: "mesh-back-premium-moltyfoam", label: "Mesh Back + Premium MoltyFoam", hex: null, image: null, products: null, variants: null },
      { code: "mesh-moltyfoam-seat", label: "Mesh + MoltyFoam Seat", hex: null, image: null, products: null, variants: null },
      { code: "mesh-split-pad", label: "Mesh + Split-Pad", hex: null, image: null, products: null, variants: null },
    ],
  },
];
