/**
 * Starter content for the pages-lab spike — a tiny "home" page built from the
 * four WOODEX blocks. Used when nothing has been saved in this browser yet.
 */
import type { Data } from "@puckeditor/core";

export const LAB_STORAGE_KEY = "woodex.pages.lab.v1";
export const LAB_DEFAULT_SLUG = "home";

export const labHomeStarter: Data = {
  root: { props: {} },
  content: [
    {
      type: "SectionHeading",
      props: {
        id: "pb-heading-1",
        eyebrow: "WOODEX LAHORE",
        title: "Furniture that outlasts the brief",
        subtitle: "Engineered wood, powder-coated steel, and a warranty on every piece — built in our own workshop since day one.",
        align: "center",
      },
    },
    {
      type: "FeatureGrid",
      props: {
        id: "pb-features-1",
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
        id: "pb-cta-1",
        label: "Book a showroom visit",
        href: "/showrooms",
        variant: "accent",
      },
    },
  ],
};

export const readLabPage = (slug: string): Data | null => {
  try {
    const raw = localStorage.getItem(LAB_STORAGE_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw) as Record<string, Data>;
    return all?.[slug] ?? null;
  } catch {
    return null;
  }
};

export const writeLabPage = (slug: string, data: Data): void => {
  let all: Record<string, Data> = {};
  try {
    all = JSON.parse(localStorage.getItem(LAB_STORAGE_KEY) ?? "{}") as Record<string, Data>;
  } catch {
    all = {};
  }
  all[slug] = data;
  localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(all));
};
