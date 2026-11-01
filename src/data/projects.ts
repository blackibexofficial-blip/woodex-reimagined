/**
 * The projects the site shipped with.
 *
 * These are the rows the WOODEX OS admin now edits through `/api/site/v1/content/project`; this module is
 * what a visitor sees before the API answers, and what fills the fields the API does not carry yet
 * (the case-study narrative, the testimonial, the before/after pair). Columns win over the snapshot,
 * payload fills the rest — the same rule the services and blog hooks follow.
 */

import proj1 from "@/assets/project-1.jpg";
import proj2 from "@/assets/project-2.jpg";
import proj3 from "@/assets/project-3.jpg";
import proj4 from "@/assets/project-4.jpg";
import proj5 from "@/assets/project-5.jpg";
import proj6 from "@/assets/project-6.jpg";
import projSalon from "@/assets/project-hair-salon.jpg";

export interface ProjectTestimonial {
  text: string;
  author: string;
  role: string;
}

export interface Project {
  id: string;
  slug?: string;
  title: string;
  client: string;
  category: string;
  image: string;
  beforeImage?: string;
  location: string;
  sqft: string;
  year?: string;
  employees?: string;
  duration?: string;
  description: string;
  challenge?: string;
  solution?: string;
  furnitureUsed?: string[];
  testimonial?: ProjectTestimonial;
  rating?: number;
}

/** The bundled photographs, by project. The API carries none yet (Phase E owns media). */
export const projectImages: Record<string, string> = {
  "1": proj1,
  "2": proj2,
  "3": proj3,
  "4": proj4,
  "5": proj5,
  "6": proj6,
  "7": projSalon,
};

export const projectSnapshot: Project[] = [
  {
    id: "1",
    title: "DHA Corporate Tower",
    client: "DHA Developers",
    category: "Corporate",
    image: proj1,
    beforeImage: proj2,
    location: "Lahore",
    sqft: "12,000 sq ft",
    year: "2024",
    employees: "250+",
    duration: "8 weeks",
    description: "Complete C-suite office fit-out with custom executive furniture, meeting rooms, and collaborative spaces for one of Lahore's most prestigious corporate towers.",
    challenge: "The client needed a complete furniture solution for all 6 floors within a tight 8-week timeline without disrupting ongoing business operations.",
    solution: "WOODEX deployed a phased delivery approach, furnishing one floor at a time while production continued for subsequent floors. Custom executive furniture was crafted to match the building's architectural language.",
    furnitureUsed: ["Executive desks — 15 units", "ErgoMax chairs — 250 units", "Board conference tables — 3", "Workstations — 120 units", "Sofas & lounge furniture — 8 sets"],
    testimonial: { text: "WOODEX delivered beyond our expectations. The quality is exceptional and the team handled our project with complete professionalism.", author: "Mr. Khalid Mahmood", role: "Director Operations, DHA Developers" },
    rating: 5,
  },
  {
    id: "2",
    title: "TechHub Karachi",
    client: "TechHub Pakistan",
    category: "Tech",
    image: proj2,
    beforeImage: proj1,
    location: "Karachi",
    sqft: "8,500 sq ft",
    year: "2024",
    employees: "150+",
    duration: "6 weeks",
    description: "Modern open-plan tech office with agile workstations, standing desks, and vibrant breakout areas designed to foster innovation and collaboration.",
    challenge: "Creating a dynamic, modern office that would attract and retain top tech talent while maximizing space utilization in a busy Karachi commercial district.",
    solution: "WOODEX designed a flexible layout using the Infinity Series workstations combined with height-adjustable desks, creating adaptable spaces that teams can reconfigure as projects evolve.",
    furnitureUsed: ["Infinity workstations — 80 units", "Height-adjustable desks — 40", "Meeting pods — 8", "Lounge furniture — 6 sets", "Cafe tables & stools — 20 units"],
    testimonial: { text: "Our team loves the new office. The furniture is exactly what we needed — flexible, modern, and built to last.", author: "Sara Malik", role: "CEO, TechHub Pakistan" },
    rating: 5,
  },
  {
    id: "3",
    title: "Shaukat Khanum Clinic",
    client: "SKMT Foundation",
    category: "Healthcare",
    image: proj3,
    beforeImage: proj4,
    location: "Islamabad",
    sqft: "4,200 sq ft",
    year: "2023",
    employees: "80+",
    duration: "4 weeks",
    description: "Healthcare-grade furniture for waiting areas, consultation rooms, and staff offices, meeting strict hygiene and durability requirements.",
    challenge: "Healthcare environments demand furniture that is durable, easy to sanitize, and comfortable for long waiting periods.",
    solution: "WOODEX specified antimicrobial upholstery fabrics, stainless steel accents, and seamless surfaces across all patient-facing areas while maintaining a calming, professional aesthetic.",
    furnitureUsed: ["Waiting benches — 20 units", "Consultation chairs — 40", "Doctor desks — 15", "Nurse stations — 4", "Staff seating — 60 units"],
    testimonial: { text: "The furniture meets all our healthcare standards while creating a welcoming environment for our patients.", author: "Dr. Amina Raza", role: "Operations Manager, SKMT" },
    rating: 5,
  },
  {
    id: "4",
    title: "LUMS Library Expansion",
    client: "LUMS University",
    category: "Education",
    image: proj4,
    beforeImage: proj3,
    location: "Lahore",
    sqft: "6,800 sq ft",
    year: "2023",
    employees: "3,000 students",
    duration: "5 weeks",
    description: "Academic furniture including collaborative study tables, individual reading pods, and faculty offices designed for focused learning.",
    challenge: "Balancing collaborative study spaces with individual focus areas while accommodating thousands of daily student users.",
    solution: "A hybrid layout combining group study tables with individual acoustic pods, all ergonomically designed for extended study sessions.",
    furnitureUsed: ["Study tables — 60 units", "Library chairs — 200", "Individual pods — 30", "Faculty desks — 20", "Bookshelves — 40 units"],
    testimonial: { text: "Students love the new library. The furniture perfectly balances aesthetics with functionality.", author: "Prof. Ali Hassan", role: "Dean of Libraries, LUMS" },
    rating: 5,
  },
  {
    id: "5",
    title: "FBR Regional Office",
    client: "Federal Board of Revenue",
    category: "Government",
    image: proj5,
    beforeImage: proj6,
    location: "Islamabad",
    sqft: "15,000 sq ft",
    year: "2023",
    employees: "400+",
    duration: "10 weeks",
    description: "Government-standard office furniture for multiple floors of the regional headquarters, compliant with federal procurement standards.",
    challenge: "Meeting strict government procurement standards while delivering a modern, functional workspace within budget constraints.",
    solution: "WOODEX provided detailed technical specifications compliant with government standards, sourcing certified materials and providing full documentation for compliance audits.",
    furnitureUsed: ["Staff desks — 300 units", "Executive furniture — 30 sets", "Conference tables — 6", "File storage units — 150", "Visitor chairs — 200"],
    testimonial: { text: "WOODEX met all government specifications and delivered on time. Excellent quality and professional service.", author: "Mr. Farrukh Ahmed", role: "Director Administration, FBR" },
    rating: 4,
  },
  {
    id: "6",
    title: "PC Hotel Business Center",
    client: "Pearl Continental",
    category: "Hospitality",
    image: proj6,
    beforeImage: proj5,
    location: "Lahore",
    sqft: "3,500 sq ft",
    year: "2024",
    employees: "N/A",
    duration: "3 weeks",
    description: "Luxury lounge and business center furniture for a 5-star hospitality environment requiring premium aesthetics and durability.",
    challenge: "5-star hospitality demands the highest level of aesthetic refinement combined with commercial durability for constant guest use.",
    solution: "Custom Woodex Series furniture in bespoke finishes matching the hotel's interior design language, with commercial-grade upholstery rated for 100,000 rubs.",
    furnitureUsed: ["Lounge sofas — 8 sets", "Business center desks — 12", "Premium chairs — 40", "Coffee tables — 10", "Reception furniture — 2 sets"],
    testimonial: { text: "The furniture perfectly complements our 5-star brand. Guests frequently compliment the business center setup.", author: "Mr. Hassan Nawaz", role: "General Manager, PC Hotel Lahore" },
    rating: 5,
  },
  {
    id: "7",
    title: "Gents Grooming Lounge — DHA Lahore",
    client: "Private Boutique Salon",
    category: "Hospitality",
    image: projSalon,
    beforeImage: proj6,
    location: "DHA Phase 5, Lahore",
    sqft: "3,500 sq ft",
    year: "2025",
    employees: "12 stylists",
    duration: "7 weeks",
    description:
      "End-to-end concept-to-execution interior and furniture solution for a premium men's hair salon and grooming lounge in DHA Phase 5, Lahore. WOODEX delivered architectural design, custom joinery, lighting and furnishings across a 3,500 sq ft open-plan space — including a 6-station barber row, two private grooming alcoves, a beard-bar, retail display and a guest waiting lounge.",
    challenge:
      "The client wanted a luxury London-meets-Lahore barbershop experience inside a raw 3,500 sq ft commercial unit — no existing interior, no joinery, no MEP. The brief: a moody, masculine, Instagram-worthy space that would also pass commercial water, drainage and ventilation standards for shampoo stations and could open to paying customers within 8 weeks.",
    solution:
      "WOODEX took the project from concept to keys. Our designers produced 2D layouts and photoreal 3D renders within 10 days, then ran a turnkey fit-out: walnut wall panelling, polished concrete flooring, brass-framed wall mirrors, Carrara marble grooming counters, deep forest-green feature wall, vintage Edison pendants, and custom-built walnut barber consoles with integrated tool storage. Bespoke leather-and-brass barber chairs were sourced and installed alongside three private grooming alcoves wrapped in walnut veneer.",
    furnitureUsed: [
      "Custom walnut barber consoles — 6 units",
      "Brass-framed wall mirrors — 6 units",
      "Premium leather barber chairs — 6 units",
      "Private grooming alcoves — 3 (walnut-clad)",
      "Carrara marble grooming counters — 18 lm",
      "Retail display joinery — 1 wall",
      "Guest lounge sofa & coffee tables — 1 set",
      "Beard-bar with integrated lighting — 1",
    ],
    testimonial: {
      text: "WOODEX delivered exactly the moody, premium grooming lounge we'd been chasing on Pinterest for two years — and they did it in seven weeks. Every joint, every brass fitting, every light is exactly where it should be.",
      author: "Mr. Hamza Sheikh",
      role: "Founder, Gents Grooming Lounge DHA",
    },
    rating: 5,
  },
];

/** The list page shows newest first; the case study that opened the page sits at the top by hand. */
export const projectOrder = ["7", "1", "2", "3", "4", "5", "6"];

export function orderedProjects(projects: Project[]): Project[] {
    return [...projects].sort((a, b) => {
        const ai = projectOrder.indexOf(a.id);
        const bi = projectOrder.indexOf(b.id);

        return (ai === -1 ? projectOrder.length : ai) - (bi === -1 ? projectOrder.length : bi);
    });
}

/** The CMS slug for a project, keyed by the id the page has always used. */
export const projectSlugs: Record<string, string> = {
  "7": "gents-grooming-lounge-dha-lahore",
  "1": "dha-corporate-tower",
  "2": "techhub-karachi",
  "3": "shaukat-khanum-clinic",
  "4": "lums-library-expansion",
  "5": "fbr-regional-office",
  "6": "pc-hotel-business-center",
};
