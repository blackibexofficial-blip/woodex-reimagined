/**
 * Pages (builder) — seed documents for the admin Pages workspace (Wave 1).
 *
 * A page is stored as a Puck document (plain JSON): `{ root: { props }, content: [{ type, props }] }`.
 * The seed ships one PUBLISHED page "home" that MIRRORS THE REAL STOREFRONT HOME
 * (src/pages/Index.tsx + src/components/home/*) as of 2026-11-07:
 *
 *   - hero copy = hero slider slide 1 ("Design For Your Workspace"), CTA → workstations
 *   - tagline strip, services strip (5 real services), 8 circular category entries
 *     (/assets/home/* assets committed in this repo), "Latest Collection" rendered LIVE from
 *     the catalog by the ProductRail block, Our Services checklist (services-office.webp),
 *     project bento (project-1..3.webp), the 5 real Google reviews, 10 real client names,
 *     the 6 real FAQs, and the WhatsApp-first CTA banner.
 *
 * The storefront `/` route itself is untouched by this file. The `/lab/home` preview and the
 * /admin/pages editor render this document. Image URLs under /assets/home/ are stable public
 * paths (copies of src/assets) so they survive bundler hashing and localStorage persistence.
 * ProductRail ignores its image list on purpose — it reads src/data/products.ts at runtime.
 *
 * Existing browsers that persisted the OLD starter document ("Furniture that outlasts the
 * brief") are upgraded automatically by a one-time migration in src/api/demo/db.ts
 * (PAGES_HOME_V2_KEY) — but ONLY when the stored Home is byte-identical in shape to the
 * untouched starter (a pb-seed-* block id is present); any user edits are preserved.
 */
import type { AdminPage, AdminPageDoc, AdminPageFolder } from "@/api/types";

const realHomeDoc = (): AdminPageDoc => ({
  root: { props: {} },
  content: [
    {
      type: "HeroCentered",
      props: {
        id: "pb-real-hero",
        eyebrow: "WOODEX · LAHORE",
        title: "Design For Your Workspace",
        subtitle: "From concept to installation — design, manufacture, and deliver.",
        ctaLabel: "Shop Now",
        ctaHref: "/shop?category=workstations",
      },
    },
    {
      type: "RichText",
      props: {
        id: "pb-real-tagline",
        eyebrow: "",
        title: "Unmatched Capabilities. Fresh Products that Matter. Trusted Partnership.",
        body: "",
      },
    },
    {
      type: "ServiceList",
      props: {
        id: "pb-real-services",
        title: "What WOODEX does",
        items: [
          { title: "Space Planning", text: "Consultation for space management, project management & personalized planning." },
          { title: "Custom Design", text: "Furniture tailored to your exact specifications and workflow needs." },
          { title: "E-Quoting", text: "Transparent pricing with detailed electronic quotations for every project." },
          { title: "Factory Direct", text: "Premium quality furniture at manufacturer prices — no middleman." },
          { title: "Delivery & Installation", text: "Professional setup ensuring your furniture is ready to use." },
        ],
      },
    },
    {
      type: "CategoryCircles",
      props: {
        id: "pb-real-circles",
        circles: [
          { label: "Reception Desk", href: "/shop?category=reception-tables", image: "/assets/home/product-reception-counter.webp" },
          { label: "Cubicle Workstation", href: "/shop?category=cubicle-workstations", image: "/assets/home/product-cubicle.webp" },
          { label: "Office Storage", href: "/shop?category=storage", image: "/assets/home/product-storage.webp" },
          { label: "Office Chair", href: "/shop?category=chairs", image: "/assets/home/product-office-chair.webp" },
          { label: "Staff Tables", href: "/shop?category=staff-tables", image: "/assets/home/product-staff-desk.webp" },
          { label: "Office Sofas", href: "/shop?category=office-sofas", image: "/assets/home/product-office-sofa.webp" },
          { label: "Executive Table", href: "/shop?category=executive-tables", image: "/assets/home/product-executive-desk.webp" },
          { label: "Meeting Table", href: "/shop?category=meeting-tables", image: "/assets/home/product-meeting-table.webp" },
        ],
      },
    },
    {
      type: "ProductRail",
      props: {
        id: "pb-real-products",
        title: "Latest Collection",
        subtitle: "Handpicked premium furniture for the modern workspace",
        filter: "isBestSeller",
        limit: "4",
      },
    },
    {
      type: "FeatureListImage",
      props: {
        id: "pb-real-howhelp",
        title: "How can we help?",
        image: "/assets/home/services-office.webp",
        items: [
          { text: "3D Rendered Floor Plan" },
          { text: "Custom Office Furniture" },
          { text: "2D Spatial Planning" },
          { text: "Project Management" },
          { text: "Interior Designing" },
          { text: "Turnkey Solutions" },
        ],
      },
    },
    {
      type: "BentoGallery",
      props: {
        id: "pb-real-bento",
        title: "Rooms we've outfitted",
        imageA: "/assets/home/project-1.webp",
        imageB: "/assets/home/project-2.webp",
        imageC: "/assets/home/project-3.webp",
      },
    },
    {
      type: "TestimonialWall",
      props: {
        id: "pb-real-reviews",
        title: "What Our Clients Say",
        items: [
          { quote: "Modern designs and durable materials. Highly recommend WOODEX for office furniture.", name: "Kinza Nisar" },
          { quote: "Excellent service, top quality products and cooperative management.", name: "Kamran Munir" },
          { quote: "I am blown away by the exceptional service and quality provided by them. I experienced exceptional craftsmanship.", name: "Mudassar Iqbal" },
          { quote: "Best furniture manufacturer in Lahore. The quality of wood and finishing is outstanding.", name: "Sara Ahmed" },
          { quote: "Delivered on time and exactly as promised. Our new office looks amazing with WOODEX furniture.", name: "Ali Hassan" },
        ],
      },
    },
    {
      type: "LogoStrip",
      props: {
        id: "pb-real-clients",
        title: "Our Prestigious Clients",
        items: [
          { name: "Etihad Town" }, { name: "Haier" }, { name: "MindBridge" }, { name: "PACHEM Global" },
          { name: "PAF" }, { name: "DHA Developers" }, { name: "TechHub PK" }, { name: "NLC" },
          { name: "SKMT" }, { name: "HBL" },
        ],
      },
    },
    {
      type: "FaqAccordion",
      props: {
        id: "pb-real-faq",
        title: "FAQs — WOODEX",
        items: [
          { q: "What types of furniture does WOODEX manufacture?", a: "WOODEX manufactures a comprehensive range of office and home furniture including executive desks, workstations, ergonomic chairs, meeting tables, reception counters, office sofas, storage solutions, and complete home furniture collections for bedrooms, living rooms, and dining rooms." },
          { q: "Do you offer custom furniture design?", a: "Yes! We specialize in custom furniture manufacturing. Our in-house design team works with you to create furniture tailored to your exact specifications, brand identity, and workflow requirements." },
          { q: "What is the typical delivery timeline?", a: "Standard orders are delivered within 2–4 weeks. Custom furniture projects typically take 4–6 weeks depending on complexity. We also offer QuickShip options for select products with delivery within 7 business days." },
          { q: "Do you provide installation services?", a: "Absolutely. All WOODEX furniture comes with complimentary professional installation within Lahore. For other cities, our trained installation teams ensure your furniture is set up correctly and ready to use." },
          { q: "What warranty do you offer?", a: "We offer a comprehensive 5-year structural warranty on all WOODEX furniture, covering manufacturing defects in materials and workmanship. Extended warranty options are also available." },
          { q: "Can I visit your showroom?", a: "Yes, our showroom is located at 123 Gulberg III, Main Boulevard, Lahore, Pakistan. We're open Monday to Saturday, 9am to 7pm. You can also explore our Virtual Showroom online for an immersive experience." },
        ],
      },
    },
    {
      type: "CtaBanner",
      props: {
        id: "pb-real-cta",
        title: "Ready to transform your space?",
        subtitle: "Visit any WOODEX showroom or chat with us on WhatsApp right now.",
        primaryLabel: "Book showroom visit",
        secondaryLabel: "Chat on WhatsApp",
      },
    },
  ],
});

export const blankPageDoc = (): AdminPageDoc => ({ root: { props: {} }, content: [] });

/** Fresh copy — callers may mutate the result. Also the "start from template" for new pages. */
export const starterPageDoc = (): AdminPageDoc =>
  JSON.parse(JSON.stringify(realHomeDoc())) as AdminPageDoc;

export const homePageSeed: AdminPage = {
  id: "page-home-seed",
  slug: "home",
  title: "Home",
  kind: "page",
  folderId: null,
  status: "published",
  doc: realHomeDoc(),
  seo: {
    title: "WOODEX — Pakistan's Premium Office & Home Furniture Manufacturer",
    description:
      "Pakistan's premium office furniture manufacturer delivering exceptional design-to-delivery solutions for modern workspaces. Ergonomic chairs, executive desks, workstations and more.",
    focusKeyphrase: "office furniture Pakistan",
  },
  updatedAt: "2026-11-07T00:00:00.000Z",
  publishedAt: "2026-11-07T00:00:00.000Z",
  version: 2,
  history: [],
};

export function buildSeedPages(): AdminPage[] {
  return [JSON.parse(JSON.stringify(homePageSeed)) as AdminPage];
}

export function buildSeedPageFolders(): AdminPageFolder[] {
  return [];
}
