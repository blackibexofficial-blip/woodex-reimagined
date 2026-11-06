/**
 * WOODEX — canonical public-facing site facts.
 *
 * Single source of truth for anything customer-facing that used to be copy-pasted
 * across pages (phone, WhatsApp, email, address, hours, URLs). If WOODEX moves
 * showrooms or changes numbers, this is the ONLY file to edit.
 *
 * NOTE: values marked "confirm" were consolidated from the codebase (majority
 * usage) — the owner must verify them before launch. In particular the legacy
 * Quotation.tsx WhatsApp number (923224000768) was reconciled to the number used
 * everywhere else; see docs/08-master-plan.
 */

export const site = {
  name: "WOODEX",
  legalName: "WOODEX Office & Home Furniture",
  tagline: "Make your space work®",
  description:
    "Pakistan's premium office furniture manufacturer delivering exceptional design-to-delivery solutions for modern workspaces. Ergonomic chairs, executive desks, workstations and more.",

  /** Canonical production origin (no trailing slash). */
  url: "https://woodex.pk",

  /** Human-readable phone (displayed). */
  phone: "+92 300 1234567",
  /** tel: link target (digits only, E.164-ish). */
  phoneHref: "tel:+923001234567",
  /** IVR / landline shown alongside the mobile line. */
  phoneAlt: "+92 42 111 WOODEX",

  /** WhatsApp number — digits only with country code (used in wa.me links). */
  whatsapp: "923001234567",
  whatsappDisplay: "+92 300 1234567",

  email: "info@woodex.pk",
  salesEmail: "sales@woodex.pk",
  warrantyEmail: "warranty@woodex.pk",

  address: {
    line1: "123 Gulberg III, Main Boulevard",
    city: "Lahore",
    region: "Punjab",
    country: "Pakistan",
    /** Full one-line variant for footer/invoices. */
    oneLine: "123 Gulberg III, Main Boulevard, Lahore, Pakistan",
    mapsEmbed:
      "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3401.456!2d74.3507!3d31.5204!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMzHCsDMxJzEzLjQiTiA3NMKwMjEnMDIuNSJF!5e0!3m2!1sen!2spk!4v1234567890",
  },
  geo: { lat: 31.5204, lng: 74.3507 },
  hours: "Mon–Sat: 9am–7pm",

  /** Open Graph fallback image (absolute path from site root). */
  ogImage: "/og-cover.jpg",
} as const;

export type SiteConfig = typeof site;

/** wa.me deep link with a pre-filled message. */
export const waLink = (message: string): string =>
  `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}`;

/** Absolute URL on the canonical origin (path may or may not start with /). */
export const absUrl = (path = "/"): string =>
  new URL(path.startsWith("/") ? path : `/${path}`, `${site.url}/`).toString();
