import desk from "@/assets/desk-product.webp";
import workstation from "@/assets/workstation-product.webp";
import chair from "@/assets/chair-product.webp";
import sofa from "@/assets/product-office-sofa.webp";
import meeting from "@/assets/project-1.webp";
import office from "@/assets/hero-office.webp";

/** Stable image keys stored on AdminBundle.image — resolve here, everywhere. */
export const BUNDLE_IMAGES: ReadonlyArray<{ key: string; label: string; src: string }> = [
  { key: "desk", label: "Executive desk", src: desk },
  { key: "workstation", label: "Benching workstations", src: workstation },
  { key: "meeting", label: "Meeting room", src: meeting },
  { key: "chair", label: "High-back chairs", src: chair },
  { key: "sofa", label: "Breakout lounge", src: sofa },
  { key: "office", label: "Open plan office", src: office },
];

const FALLBACK = BUNDLE_IMAGES[0];
export const bundleImage = (key: string): string =>
  (BUNDLE_IMAGES.find((i) => i.key === key) ?? FALLBACK).src;
