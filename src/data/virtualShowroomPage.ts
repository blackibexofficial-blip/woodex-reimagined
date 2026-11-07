/**
 * /virtual-showroom page — seed content for the admin-managed Virtual Showroom (WDS) entry (B4).
 *
 * Asset-free so both the demo DB seed and the storefront page can import it.
 * Content is identical to the copy that used to be hardcoded in
 * src/pages/VirtualShowroom.tsx. `features[].icon` maps onto a fixed icon set
 * (monitor | rotate | palette | maximize | users | box) resolved by the page.
 */

import type { AdminVirtualShowroomPage } from "@/api/types";

export const virtualShowroomPageSeed: AdminVirtualShowroomPage = {
  hero: {
    eyebrow: "Experience It First",
    title: "Virtual Showroom",
    subtitle:
      "Experience our furniture in immersive 3D. Click on any piece in the room to change its material in real time — wood, metal, fabric, or laminate.",
  },
  configurator: {
    heading: "Interactive Room Configurator",
    intro:
      "Choose a room type, click on furniture hotspots, and swap materials in real time. Filter by wood, metal, fabric, or brightness level.",
  },
  featuresIntro: {
    heading: "Virtual Showroom Features",
    subheading: "Experience furniture shopping like never before",
  },
  features: [
    {
      id: "vs-feature-1",
      icon: "monitor",
      title: "Real-Time 3D Preview",
      description: "Photorealistic rendering of every product from any angle, in your actual room dimensions.",
    },
    {
      id: "vs-feature-2",
      icon: "rotate",
      title: "360° Product View",
      description: "Spin, zoom, and inspect every detail of our furniture before you commit.",
    },
    {
      id: "vs-feature-3",
      icon: "palette",
      title: "Color & Material Configurator",
      description: "Try different fabric options, wood finishes, and color combinations instantly.",
    },
    {
      id: "vs-feature-4",
      icon: "maximize",
      title: "Space Planning Tool",
      description: "Design your office layout with accurate dimensions and real-time space validation.",
    },
    {
      id: "vs-feature-5",
      icon: "users",
      title: "Collaborative Design",
      description: "Share your virtual layout with colleagues and stakeholders for instant feedback.",
    },
    {
      id: "vs-feature-6",
      icon: "box",
      title: "Save & Export",
      description: "Save your configurations and export professional presentation layouts and specs.",
    },
  ],
  finalCta: {
    heading: "Ready to Design Your Dream Office?",
    paragraph: "Start with our virtual showroom and get a tailored quote based on your custom design.",
  },
};
