/**
 * /custom-design page — seed content for the admin-managed Custom Design entry (B4).
 *
 * Asset-free so both the demo DB seed and the storefront page can import it.
 * Content is identical to the copy that used to be hardcoded in
 * src/pages/CustomDesign.tsx. Newlines (\n) inside hero.title / wds.heading render
 * as line breaks on the storefront. Contact lines stay computed from the live site
 * config by the page; the admin editor can override any of this with literal text.
 */

import type { AdminCustomDesignPage } from "@/api/types";

export const customDesignPageSeed: AdminCustomDesignPage = {
  hero: {
    eyebrow: "Bespoke Furniture Design",
    title: "Custom Design\nServices",
    subtitle:
      "Bring your vision to life with our bespoke furniture design service. From initial concept to final creation, we craft unique pieces tailored precisely to your specifications, brand identity and workflow.",
  },
  wds: {
    heading: "Visualize, Design\nand Shop with WDS",
    paragraph:
      "WDS is WOODEX's interactive design studio — built to help Pakistani businesses, interior designers and corporate buyers choose the best material, colour and layout combinations before they commit. Walk through ready-made office scenarios, swap finishes in real time, and see exactly how your floor will look once it is built.",
    subheading: "Unlimited variety in design",
    varietyOne:
      "Choose from hundreds of options for every furniture element — desks, chairs, storage, partitions and accessories — long before you buy.",
    varietyTwo:
      "Mix décors and textures inside your own virtual environment and visualise the finished space in the most intuitive way possible.",
  },
  spaces: {
    heading: "Make Your Space Work",
    subheading:
      "From smart interiors to full-scale fit-outs, our services cover everything you need to build a standout commercial space across Pakistan.",
    items: [
      {
        id: "sw-1",
        label: "3D Rendered Floor Plan",
        blurb: "Photoreal 3D renders of your office before a single board is cut — see the layout, light and finishes.",
        slug: "space-planning-design",
      },
      {
        id: "sw-2",
        label: "Custom Office Furniture",
        blurb: "Bespoke executive desks, workstations and reception counters built around your brand and floor plate.",
        slug: "custom-design",
      },
      {
        id: "sw-3",
        label: "2D Spatial Planning",
        blurb: "Scaled CAD layouts with BIFMA-compliant clearances, circulation paths and fire-egress checks.",
        slug: "space-planning-design",
      },
      {
        id: "sw-4",
        label: "Project Management",
        blurb: "A dedicated certified PM owns budget, timeline and stakeholder communication from day one.",
        slug: "project-management",
      },
      {
        id: "sw-5",
        label: "Interior Designing",
        blurb: "Materials, finishes, lighting and brand storytelling that turn empty floors into a finished workplace.",
        slug: "custom-design",
      },
      {
        id: "sw-6",
        label: "Turnkey Solutions",
        blurb: "Single contract from concept to handover — design, manufacture, deliver, install and warranty.",
        slug: "b2b-office-solutions",
      },
    ],
  },
  furniture: {
    heading: "Custom Office Furniture",
    paragraph:
      "Every workspace is unique. WOODEX's in-house design studio translates your brand, dimensions and workflow into precision-engineered office furniture — from a single sculptural executive desk to a 500-seat floor of brand-aligned workstations, built right here in Lahore.",
    bullets: [
      "Pantone & RAL brand colour matching on every finish.",
      "CNC-precision manufacturing in our Lahore facility.",
      "5-year structural warranty on all custom pieces.",
    ],
  },
  designFirst: {
    heading: "Design first, build once",
    bodyOne:
      "Our space planners study your team density, collaboration patterns and growth plans, then deliver scaled CAD layouts and photoreal 3D renders so you can see — and adjust — your office before it is built.",
    bodyTwo:
      "Most office fit-outs in Pakistan fail not in installation but in planning. WOODEX uses real data — headcount projections, BIFMA clearances, fire-egress rules — to produce layouts that flex with your business for the next five years.",
  },
  testimonialsIntro: {
    heading: "What Our Clients Say",
    subheading: "Trusted by leading organisations across Pakistan",
  },
  testimonials: [
    {
      id: "cd-test-1",
      text: "WOODEX furnished our 8 new branches across Punjab. Their project management was exceptional — on time, on budget.",
      name: "Bilal Ahmed",
      role: "Allied Bank Limited",
    },
    {
      id: "cd-test-2",
      text: "From patient waiting areas to executive offices, WOODEX delivered quality furniture that meets healthcare standards.",
      name: "Dr. Ayesha Siddiqui",
      role: "Shifa International Hospital",
    },
    {
      id: "cd-test-3",
      text: "Our 200-seat tech office was designed and furnished in just 6 weeks. The ergonomic chairs are a game-changer.",
      name: "Hassan Raza",
      role: "TechVentures Islamabad",
    },
  ],
  finalCta: {
    heading: "Ready to Design Your Office?",
    paragraph: "Start with our virtual showroom and get a tailored quote based on your custom design brief.",
  },
};
