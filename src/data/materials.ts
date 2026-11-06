// Material texture imports
import naturalOak from "@/assets/materials/natural-oak.webp";
import darkWalnut from "@/assets/materials/dark-walnut.webp";
import cherryWood from "@/assets/materials/cherry-wood.webp";
import maple from "@/assets/materials/maple.webp";
import teak from "@/assets/materials/teak.webp";
import mahogany from "@/assets/materials/mahogany.webp";
import thermoOak from "@/assets/materials/thermo-oak.webp";
import lightConcrete from "@/assets/materials/light-concrete.webp";
import matteBlack from "@/assets/materials/matte-black.webp";
import brushedChrome from "@/assets/materials/brushed-chrome.webp";
import whiteLaminate from "@/assets/materials/white-laminate.webp";
import navyFabric from "@/assets/materials/navy-fabric.webp";
import blackLeather from "@/assets/materials/black-leather.webp";
import greyMesh from "@/assets/materials/grey-mesh.webp";
import tanLeather from "@/assets/materials/tan-leather.webp";
import brushedGold from "@/assets/materials/brushed-gold.webp";

export type MaterialCategory = "wood" | "laminate" | "metal" | "fabric";
export type BrightnessLevel = "light" | "medium" | "dark" | "all";

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  brightness: BrightnessLevel;
  image: string;
  /** Applicable furniture parts */
  applicableTo: ("worktop" | "frame" | "seating" | "panel" | "storage")[];
}

export const materialCategories: { id: MaterialCategory; label: string }[] = [
  { id: "wood", label: "Wood Finishes" },
  { id: "laminate", label: "Solid & Laminate" },
  { id: "metal", label: "Metal Colors" },
  { id: "fabric", label: "Fabric & Leather" },
];

export const materials: Material[] = [
  // Wood Finishes
  { id: "natural-oak", name: "Natural Oak", category: "wood", brightness: "light", image: naturalOak, applicableTo: ["worktop", "panel", "storage"] },
  { id: "maple", name: "Maple", category: "wood", brightness: "light", image: maple, applicableTo: ["worktop", "panel", "storage"] },
  { id: "teak", name: "Teak", category: "wood", brightness: "medium", image: teak, applicableTo: ["worktop", "panel", "storage"] },
  { id: "cherry", name: "Cherry Wood", category: "wood", brightness: "medium", image: cherryWood, applicableTo: ["worktop", "panel", "storage"] },
  { id: "dark-walnut", name: "Dark Walnut", category: "wood", brightness: "dark", image: darkWalnut, applicableTo: ["worktop", "panel", "storage"] },
  { id: "mahogany", name: "Mahogany", category: "wood", brightness: "dark", image: mahogany, applicableTo: ["worktop", "panel", "storage"] },
  { id: "thermo-oak", name: "Thermo Oak", category: "wood", brightness: "dark", image: thermoOak, applicableTo: ["worktop", "panel", "storage"] },

  // Solid Colors & Laminates
  { id: "white-laminate", name: "White Laminate", category: "laminate", brightness: "light", image: whiteLaminate, applicableTo: ["worktop", "panel", "storage"] },
  { id: "light-concrete", name: "Light Concrete", category: "laminate", brightness: "light", image: lightConcrete, applicableTo: ["worktop", "panel"] },

  // Metal Colors
  { id: "matte-black", name: "Matte Black", category: "metal", brightness: "dark", image: matteBlack, applicableTo: ["frame"] },
  { id: "brushed-chrome", name: "Brushed Chrome", category: "metal", brightness: "light", image: brushedChrome, applicableTo: ["frame"] },
  { id: "brushed-gold", name: "Brushed Gold", category: "metal", brightness: "medium", image: brushedGold, applicableTo: ["frame"] },

  // Fabric & Leather
  { id: "black-leather", name: "Black Leather", category: "fabric", brightness: "dark", image: blackLeather, applicableTo: ["seating"] },
  { id: "tan-leather", name: "Tan Leather", category: "fabric", brightness: "medium", image: tanLeather, applicableTo: ["seating"] },
  { id: "navy-fabric", name: "Navy Fabric", category: "fabric", brightness: "dark", image: navyFabric, applicableTo: ["seating"] },
  { id: "grey-mesh", name: "Grey Mesh", category: "fabric", brightness: "medium", image: greyMesh, applicableTo: ["seating"] },
];
