/**
 * Pages (builder) — seed documents for the admin Pages workspace (Wave 1).
 *
 * A page is stored as a Puck document (plain JSON): `{ root: { props }, content: [{ type, props }] }`.
 * The seed ships one PUBLISHED page "home" built from the same starter blocks as the pages builder spike,
 * so /lab/home renders immediately after a fresh demo-DB seed and the Pages workspace is never empty.
 */
import type { AdminPage, AdminPageDoc, AdminPageFolder } from "@/api/types";

const starterDoc = (): AdminPageDoc => ({
  root: { props: {} },
  content: [
    {
      type: "SectionHeading",
      props: {
        id: "pb-seed-heading-1",
        eyebrow: "WOODEX LAHORE",
        title: "Furniture that outlasts the brief",
        subtitle:
          "Engineered wood, powder-coated steel, and a warranty on every piece — built in our own workshop since day one.",
        align: "center",
      },
    },
    {
      type: "FeatureGrid",
      props: {
        id: "pb-seed-features-1",
        items: [
          { icon: "shield", title: "5-Year Warranty", text: "Frames and joints covered across the WOODEX range." },
          { icon: "truck", title: "Nationwide Delivery", text: "Lahore, Karachi, Islamabad, Rawalpindi and beyond." },
          { icon: "hammer", title: "In-House Craft", text: "Built in our Lahore workshop, fitted by our own team." },
        ],
      },
    },
    {
      type: "ButtonLink",
      props: {
        id: "pb-seed-cta-1",
        label: "Book a showroom visit",
        href: "/showrooms",
        variant: "accent",
      },
    },
  ],
});

export const blankPageDoc = (): AdminPageDoc => ({ root: { props: {} }, content: [] });

/** Fresh copy — callers may mutate the result. */
export const starterPageDoc = (): AdminPageDoc =>
  JSON.parse(JSON.stringify(starterDoc())) as AdminPageDoc;

export const homePageSeed: AdminPage = {
  id: "page-home-seed",
  slug: "home",
  title: "Home",
  kind: "page",
  folderId: null,
  status: "published",
  doc: starterDoc(),
  seo: {
    title: "WOODEX — Furniture that outlasts the brief",
    description:
      "Engineered wood furniture built in Lahore. 5-year warranty, nationwide delivery, in-house craftsmanship.",
    focusKeyphrase: "furniture Lahore",
  },
  updatedAt: "2026-11-06T00:00:00.000Z",
  publishedAt: "2026-11-06T00:00:00.000Z",
  version: 1,
  history: [],
};

export function buildSeedPages(): AdminPage[] {
  return [JSON.parse(JSON.stringify(homePageSeed)) as AdminPage];
}

export function buildSeedPageFolders(): AdminPageFolder[] {
  return [];
}
