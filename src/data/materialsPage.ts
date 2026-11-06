/**
 * /materials page — color swatch seed catalogue.
 *
 * These are the pure-color swatches shown on the public Materials & Colors page
 * (hex-based). They are seeded into the demo DB's `materials` slice on first load
 * and become admin-managed from /admin/materials (P1.2). The 16 image finishes in
 * `src/data/materials.ts` seed the same slice for the room configurator.
 *
 * Keep this file asset-free so both the DB seed and the storefront page can import it.
 */

export type PageSwatchCategory = "wood" | "fabric" | "metal";

export interface PageSwatch {
  name: string;
  hex: string;
  category: PageSwatchCategory;
  description?: string;
}

export const pageSwatchSeed: PageSwatch[] = [
  // Wood finishes
  { name: "Dark Walnut", hex: "#3e2723", description: "Rich, deep brown with natural grain", category: "wood" },
  { name: "Natural Oak", hex: "#c4a35a", description: "Warm golden tone, light wood feel", category: "wood" },
  { name: "Espresso", hex: "#3c2415", description: "Very dark brown, near-black elegance", category: "wood" },
  { name: "White Oak", hex: "#d4c5a9", description: "Light, Scandinavian-inspired finish", category: "wood" },
  { name: "Sheesham", hex: "#7a4f2d", description: "Pakistani teak, warm reddish brown", category: "wood" },
  { name: "Beech", hex: "#c9a87c", description: "Light honey tone, smooth grain", category: "wood" },
  // Fabric & upholstery colors
  { name: "Charcoal Black", hex: "#1a1a1a", category: "fabric" },
  { name: "Slate Gray", hex: "#4a5568", category: "fabric" },
  { name: "Navy Blue", hex: "#1e3a5f", category: "fabric" },
  { name: "Burgundy", hex: "#722f37", category: "fabric" },
  { name: "Dove Gray", hex: "#9ca3af", category: "fabric" },
  { name: "Forest Green", hex: "#15803d", category: "fabric" },
  { name: "Cream", hex: "#f5f0e0", category: "fabric" },
  { name: "Royal Blue", hex: "#2563eb", category: "fabric" },
  { name: "Beige", hex: "#d4b896", category: "fabric" },
  { name: "Teal", hex: "#0d9488", category: "fabric" },
  { name: "Cognac Brown", hex: "#8b4513", category: "fabric" },
  { name: "Off-White", hex: "#f8f6f0", category: "fabric" },
  // Metal frame finishes
  { name: "Chrome Silver", hex: "#c0c0c0", description: "Bright, reflective, modern", category: "metal" },
  { name: "Matte Black", hex: "#1a1a1a", description: "Contemporary, sleek, industrial", category: "metal" },
  { name: "Brushed Nickel", hex: "#8a8a8a", description: "Subtle sheen, durable", category: "metal" },
  { name: "Antique Brass", hex: "#b5a642", description: "Warm, vintage, sophisticated", category: "metal" },
  { name: "Powder White", hex: "#f0f0f0", description: "Clean, minimalist, bright", category: "metal" },
];
