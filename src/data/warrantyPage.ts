/**
 * /warranty page — seed content for the admin-managed warranty policy entry.
 *
 * Asset-free so both the demo DB seed and the storefront page can import it.
 * Content is identical to the copy that used to be hardcoded in
 * src/pages/Warranty.tsx. Contact lines interpolate the live site config so the
 * default render matches the site exactly; the admin editor (/admin/warranty)
 * can override any of it with literal text at any time.
 */

import { site } from "@/config/site";
import type { AdminWarrantyPage } from "@/api/types";

export const warrantyPageSeed: AdminWarrantyPage = {
  hero: {
    eyebrow: "Peace of Mind",
    title: "Warranty Policy",
    subtitle:
      "Every WOODEX product is backed by a comprehensive warranty. We stand behind our craftsmanship — if something's wrong, we'll make it right.",
  },
  tiers: [
    {
      id: "tier-standard",
      name: "Standard Warranty",
      duration: "3 Years",
      applies: "Ek Series — Entry level products",
      popular: false,
      coverage: [
        "Manufacturing defects in materials",
        "Structural frame integrity",
        "Drawer mechanism failures",
        "Surface delamination",
      ],
      excludes: ["Normal wear and tear", "Accidental damage", "Unauthorized modifications"],
    },
    {
      id: "tier-enhanced",
      name: "Enhanced Warranty",
      duration: "5 Years",
      applies: "Infinity Series — Mid-range products",
      popular: true,
      coverage: [
        "All Standard Warranty coverage",
        "Upholstery defects (first 2 years)",
        "Pneumatic mechanism failures (chairs)",
        "Veneer defects & bubbling",
        "Hardware including hinges, rails",
      ],
      excludes: ["Normal wear and tear", "Sun fade on upholstery", "Water damage"],
    },
    {
      id: "tier-premium",
      name: "Premium Warranty",
      duration: "10 Years",
      applies: "Woodex Series — Premium products",
      popular: false,
      coverage: [
        "All Enhanced Warranty coverage",
        "Complete structural warranty",
        "Free annual maintenance check",
        "Priority repair service (48hr response)",
        "Free part replacement for life",
      ],
      excludes: ["Accidental damage", "Improper use damage"],
    },
  ],
  steps: [
    {
      id: "step-contact",
      title: "Contact Us",
      description: `Call ${site.phone} or email ${site.warrantyEmail} with your order number and issue description.`,
    },
    {
      id: "step-assessment",
      title: "Assessment",
      description: "Our team will assess your claim within 24 hours and may request photos or a site visit.",
    },
    {
      id: "step-resolution",
      title: "Resolution",
      description: "Approved claims are resolved within 7 business days — repair, replacement, or part dispatch.",
    },
    {
      id: "step-followup",
      title: "Follow Up",
      description: "We follow up after resolution to ensure you're completely satisfied with the outcome.",
    },
  ],
  faqs: [
    {
      id: "faq-register",
      q: "How do I register my WOODEX warranty?",
      a: `Your warranty is automatically registered upon delivery. Keep your invoice as proof of purchase. You can also email invoice details to ${site.warrantyEmail} for confirmation.`,
    },
    {
      id: "faq-transfer",
      q: "Is the warranty transferable?",
      a: "Woodex Series (10-year) warranties are transferable to new occupants of the same premises. Ek and Infinity Series warranties are non-transferable.",
    },
    {
      id: "faq-proof",
      q: "What proof do I need for a warranty claim?",
      a: "Original invoice, photos of the defect, and product serial number (found on a label under or behind the furniture).",
    },
    {
      id: "faq-onsite",
      q: "Do you offer on-site repair?",
      a: "Yes. For Woodex Series customers, on-site repair is the primary resolution method. For other series, we may require items to be returned to our facility.",
    },
    {
      id: "faq-excluded",
      q: "What is not covered?",
      a: "Normal wear and tear, damage from misuse, water damage beyond minor spills, unauthorized modifications, and commercial use of residential products.",
    },
  ],
};
