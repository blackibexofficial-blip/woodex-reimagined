import chairImage from "@/assets/chair-product.jpg";
import deskImage from "@/assets/desk-product.jpg";
import workstationImage from "@/assets/workstation-product.jpg";

export interface ProductColor {
  name: string;
  hex: string;
  image?: string;
}

export interface ProductSpecification {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  series?: string;
  price: number;
  originalPrice?: number;
  description: string;
  shortDescription: string;
  images: string[];
  colors: ProductColor[];
  specifications: ProductSpecification[];
  features: string[];
  inStock: boolean;
  isNew?: boolean;
  isBestSeller?: boolean;
  rating: number;
  reviews: number;
}

// ─── CATEGORY STRUCTURE ────────────────────────────────────────────────
export const categoryGroups = [
  {
    id: "office",
    name: "Office Furniture",
    subcategories: [
      { id: "executive-tables", name: "Executive Tables", parent: "office-tables" },
      { id: "manager-tables", name: "Manager Tables", parent: "office-tables" },
      { id: "staff-tables", name: "Staff Tables", parent: "office-tables" },
      { id: "meeting-tables", name: "Meeting Tables", parent: "office-tables" },
      { id: "reception-tables", name: "Reception Tables", parent: "office-tables" },
      { id: "chairs", name: "Office Chairs", parent: "chairs" },
      { id: "workstations", name: "Workstations", parent: "workstations" },
      { id: "cubicle-workstations", name: "Cubicle Workstations", parent: "workstations" },
      { id: "office-sofas", name: "Office Sofas", parent: "sofas" },
      { id: "office-storage", name: "Office Storage", parent: "storage" },
      { id: "cafe-furniture", name: "Cafe Furniture", parent: "cafe" },
      { id: "public-sitting", name: "Public Sitting", parent: "public" },
    ],
  },
  {
    id: "home",
    name: "Home Furniture",
    subcategories: [
      { id: "bed-sets", name: "Bed Sets", parent: "bedroom" },
      { id: "bedside-tables", name: "Bedside Tables", parent: "bedroom" },
      { id: "dressing-tables", name: "Dressing Tables", parent: "bedroom" },
      { id: "mirrors", name: "Mirrors", parent: "bedroom" },
      { id: "bench-settee", name: "Bench & Settee", parent: "bedroom" },
      { id: "home-sofa", name: "Home Sofa", parent: "living" },
      { id: "center-side-tables", name: "Center & Side Tables", parent: "living" },
      { id: "coffee-tables", name: "Coffee Tables", parent: "living" },
      { id: "console", name: "Console", parent: "living" },
      { id: "tv-units", name: "TV Units", parent: "living" },
      { id: "dining-sets", name: "Dining Sets", parent: "dining" },
      { id: "dining-chairs", name: "Dining Chairs", parent: "dining" },
      { id: "dining-tables", name: "Dining Tables", parent: "dining" },
    ],
  },
];

export const categories = [
  { id: "all", name: "All Products" },
  // Office
  { id: "office-tables", name: "Office Tables" },
  { id: "executive-tables", name: "↳ Executive Tables" },
  { id: "manager-tables", name: "↳ Manager Tables" },
  { id: "staff-tables", name: "↳ Staff Tables" },
  { id: "meeting-tables", name: "↳ Meeting Tables" },
  { id: "reception-tables", name: "↳ Reception Tables" },
  { id: "chairs", name: "Office Chairs" },
  { id: "workstations", name: "Workstations" },
  { id: "cubicle-workstations", name: "Cubicle Workstations" },
  { id: "office-sofas", name: "Office Sofas" },
  { id: "storage", name: "Office Storage" },
  { id: "cafe", name: "Cafe Furniture" },
  { id: "public", name: "Public Sitting" },
  // Home
  { id: "bedroom", name: "Bedroom Furniture" },
  { id: "living", name: "Living Room" },
  { id: "dining", name: "Dining Furniture" },
];

// ─── SERIES ─────────────────────────────────────────────────────────────
export const seriesList = [
  {
    id: "ek-series",
    name: "Ek Series",
    tagline: "Affordable quality for every workspace",
    badge: "Budget-Friendly",
    description: "The Ek Series delivers reliable quality at an accessible price point. Perfect for startups, schools, and growing businesses that need functional furniture without breaking the budget.",
    features: ["Engineered wood construction", "Powder-coated steel frames", "Standard ergonomics", "3-year warranty"],
    products: 18,
    color: "#5a7a3a",
  },
  {
    id: "infinity-series",
    name: "Infinity Series",
    tagline: "Modular systems that grow with you",
    badge: "Modular",
    description: "The Infinity Series is built for flexibility. Every component connects seamlessly, allowing you to expand, reconfigure, and adapt your workspace as your team evolves.",
    features: ["Fully modular components", "Expandable layouts", "Integrated cable management", "5-year warranty"],
    products: 26,
    color: "#3a5a7a",
  },
  {
    id: "woodex-series",
    name: "Woodex Series",
    tagline: "Premium flagship collection",
    badge: "Premium",
    description: "Our flagship Woodex Series represents the pinnacle of Pakistani craftsmanship. Designed for executives and discerning clients who demand nothing but the best.",
    features: ["Solid hardwood & premium veneer", "Full-grain leather options", "Handcrafted detailing", "10-year warranty"],
    products: 34,
    color: "#7a5a3a",
  },
  {
    id: "cubicle-series",
    name: "Cubicle Series",
    tagline: "Privacy-focused workstation solutions",
    badge: "Privacy",
    description: "The Cubicle Series creates focused, private workspaces within open offices. Acoustic panels and intelligent layouts maximize productivity for individual contributors.",
    features: ["Acoustic privacy panels", "Height-adjustable options", "Personal storage integration", "5-year warranty"],
    products: 22,
    color: "#5a5a7a",
  },
];

// ─── PRODUCTS ────────────────────────────────────────────────────────────
export const products: Product[] = [
  // ── EXECUTIVE TABLES
  {
    id: "exec-table-xl",
    name: "Executive Command Desk",
    category: "office-tables",
    subcategory: "executive-tables",
    series: "woodex-series",
    price: 185000,
    originalPrice: 220000,
    description: "The Executive Command Desk is the throne of every corner office. Crafted from premium solid wood with hand-applied veneer finish, this commanding piece features integrated cable management, a modesty panel, and hidden drawer lock. A statement of authority in any executive suite.",
    shortDescription: "Premium solid wood executive desk with integrated cable management and executive drawer lock.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Dark Walnut", hex: "#3e2723" },
      { name: "Rich Mahogany", hex: "#4a2c2a" },
      { name: "Natural Oak", hex: "#c4a35a" },
      { name: "Espresso", hex: "#3c2415" },
    ],
    specifications: [
      { label: "Width", value: "200 cm" },
      { label: "Depth", value: "90 cm" },
      { label: "Height", value: "75 cm" },
      { label: "Material", value: "Solid hardwood & premium veneer" },
      { label: "Finish", value: "Hand-applied lacquer" },
      { label: "Warranty", value: "10 years" },
      { label: "Assembly", value: "Professional included" },
      { label: "Weight Capacity", value: "200 kg" },
    ],
    features: [
      "Premium solid wood construction",
      "Integrated cable management",
      "Hidden locking drawers",
      "Modesty panel included",
      "Anti-scratch veneer surface",
      "Soft-close drawer system",
      "Adjustable leveling feet",
      "Custom sizing available",
    ],
    inStock: true,
    isBestSeller: true,
    rating: 4.9,
    reviews: 67,
  },
  {
    id: "exec-table-l",
    name: "Executive L-Shape Power Desk",
    category: "office-tables",
    subcategory: "executive-tables",
    series: "woodex-series",
    price: 245000,
    originalPrice: 285000,
    description: "Transform your office with our Executive L-Shaped Power Desk. Featuring integrated USB-C charging, power outlets, and a vast work surface, this desk is engineered for senior executives who demand both beauty and productivity.",
    shortDescription: "L-shaped executive desk with built-in USB-C power, premium veneer finish.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Dark Walnut", hex: "#3e2723" },
      { name: "Espresso", hex: "#3c2415" },
      { name: "White Oak", hex: "#d4c5a9" },
    ],
    specifications: [
      { label: "Overall Width", value: "220 cm" },
      { label: "Return Width", value: "160 cm" },
      { label: "Height", value: "75 cm" },
      { label: "Power Outlets", value: "4 AC + 2 USB-C" },
      { label: "Material", value: "Solid wood & veneer" },
      { label: "Warranty", value: "10 years" },
    ],
    features: [
      "Built-in power outlets & USB-C ports",
      "Integrated cable management tray",
      "Scratch-resistant surface coating",
      "Modesty panel included",
      "Lockable pedestal drawer",
      "Premium wood veneer finish",
    ],
    inStock: true,
    isNew: true,
    rating: 4.8,
    reviews: 42,
  },
  // ── MANAGER TABLES
  {
    id: "manager-table-pro",
    name: "Manager Pro Desk",
    category: "office-tables",
    subcategory: "manager-tables",
    series: "infinity-series",
    price: 95000,
    originalPrice: 115000,
    description: "The Manager Pro Desk strikes the ideal balance between executive presence and everyday functionality. Engineered wood construction with premium veneer delivers an upscale appearance at a sensible price.",
    shortDescription: "Professional manager's desk with premium veneer and generous storage.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Walnut", hex: "#5d4037" },
      { name: "Oak Natural", hex: "#c4a35a" },
      { name: "White", hex: "#f5f5f5" },
    ],
    specifications: [
      { label: "Width", value: "160 cm" },
      { label: "Depth", value: "80 cm" },
      { label: "Height", value: "75 cm" },
      { label: "Material", value: "Engineered wood with veneer" },
      { label: "Warranty", value: "5 years" },
    ],
    features: [
      "Spacious work surface",
      "3-drawer pedestal",
      "Cable management grommet",
      "Modesty panel",
      "Adjustable leveling feet",
      "Soft-close drawers",
    ],
    inStock: true,
    rating: 4.7,
    reviews: 89,
  },
  // ── STAFF TABLES
  {
    id: "staff-table-std",
    name: "Staff Workdesk Standard",
    category: "office-tables",
    subcategory: "staff-tables",
    series: "ek-series",
    price: 32000,
    description: "A reliable, no-frills staff desk for productive workdays. Sturdy steel frame with laminate top provides a durable surface for daily office tasks.",
    shortDescription: "Durable laminate staff desk with steel frame for office use.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Light Gray", hex: "#d1d5db" },
      { name: "White", hex: "#ffffff" },
      { name: "Beige", hex: "#e8d5b0" },
    ],
    specifications: [
      { label: "Width", value: "140 cm" },
      { label: "Depth", value: "70 cm" },
      { label: "Height", value: "75 cm" },
      { label: "Frame", value: "Powder-coated steel" },
      { label: "Warranty", value: "3 years" },
    ],
    features: [
      "Anti-scratch laminate top",
      "Cable management grommet",
      "Adjustable leveling feet",
      "Easy assembly",
      "Stackable legs for storage",
    ],
    inStock: true,
    rating: 4.4,
    reviews: 215,
  },
  // ── MEETING TABLES
  {
    id: "meeting-table-12",
    name: "BoardRoom Conference Table",
    category: "office-tables",
    subcategory: "meeting-tables",
    series: "woodex-series",
    price: 480000,
    description: "Make a lasting impression with the BoardRoom Conference Table. This 12-seater seats executive teams in style, featuring integrated power ports, cable management, and a stunning premium finish.",
    shortDescription: "Premium 12-person conference table with integrated technology.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Dark Mahogany", hex: "#4a2c2a" },
      { name: "Dark Walnut", hex: "#3e2723" },
      { name: "Light Oak", hex: "#c4a35a" },
    ],
    specifications: [
      { label: "Length", value: "360 cm" },
      { label: "Width", value: "140 cm" },
      { label: "Height", value: "75 cm" },
      { label: "Seating", value: "12 persons" },
      { label: "Power Ports", value: "6 integrated" },
      { label: "Warranty", value: "10 years" },
    ],
    features: [
      "Premium solid wood construction",
      "Integrated power & data ports",
      "Built-in cable management",
      "Modular design option",
      "Matching chairs available",
      "Custom sizes available",
    ],
    inStock: true,
    rating: 5.0,
    reviews: 28,
  },
  {
    id: "meeting-table-6",
    name: "Team Meeting Table",
    category: "office-tables",
    subcategory: "meeting-tables",
    series: "infinity-series",
    price: 125000,
    description: "The Team Meeting Table seats 6–8 comfortably and features a clean contemporary design that fits modern office aesthetics. Durable and elegant.",
    shortDescription: "6-8 person meeting table with modern design.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Walnut", hex: "#5d4037" },
      { name: "White", hex: "#ffffff" },
      { name: "Black", hex: "#1a1a1a" },
    ],
    specifications: [
      { label: "Length", value: "240 cm" },
      { label: "Width", value: "110 cm" },
      { label: "Height", value: "75 cm" },
      { label: "Seating", value: "6–8 persons" },
      { label: "Warranty", value: "7 years" },
    ],
    features: [
      "Central cable port",
      "Premium laminate finish",
      "Chrome base option",
      "Easy assembly",
    ],
    inStock: true,
    rating: 4.8,
    reviews: 56,
  },
  // ── RECEPTION TABLES
  {
    id: "reception-desk-l",
    name: "Reception Station Desk",
    category: "office-tables",
    subcategory: "reception-tables",
    series: "woodex-series",
    price: 145000,
    description: "Make a powerful first impression with our Reception Station Desk. The sweeping L-shaped design, raised transaction counter, and premium finish set the tone for your entire office.",
    shortDescription: "Premium reception desk with raised transaction counter.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "White & Walnut", hex: "#5d4037" },
      { name: "All White", hex: "#f5f5f5" },
      { name: "Dark Gray", hex: "#374151" },
    ],
    specifications: [
      { label: "Main Width", value: "180 cm" },
      { label: "Return Width", value: "120 cm" },
      { label: "Counter Height", value: "108 cm" },
      { label: "Work Height", value: "75 cm" },
      { label: "Warranty", value: "7 years" },
    ],
    features: [
      "Raised transaction counter",
      "Built-in storage drawers",
      "Cable management",
      "Professional appearance",
      "LED under-counter lighting option",
    ],
    inStock: true,
    isNew: true,
    rating: 4.9,
    reviews: 33,
  },
  // ── CHAIRS
  {
    id: "ergo-pro-chair",
    name: "ErgoMax Pro Executive Chair",
    category: "chairs",
    series: "woodex-series",
    price: 85000,
    originalPrice: 98000,
    description: "The ErgoMax Pro Executive Chair represents the pinnacle of ergonomic design. Crafted with premium materials and advanced lumbar support technology, this chair is engineered for professionals who demand excellence. The breathable mesh back ensures optimal airflow during long working hours.",
    shortDescription: "Premium executive chair with advanced lumbar support and breathable mesh.",
    images: [chairImage, chairImage, chairImage, chairImage],
    colors: [
      { name: "Charcoal Black", hex: "#1a1a1a" },
      { name: "Slate Gray", hex: "#4a5568" },
      { name: "Navy Blue", hex: "#1e3a5f" },
      { name: "Burgundy", hex: "#722f37" },
    ],
    specifications: [
      { label: "Seat Height", value: "42–52 cm (adjustable)" },
      { label: "Seat Width", value: "52 cm" },
      { label: "Seat Depth", value: "48 cm" },
      { label: "Back Height", value: "75 cm" },
      { label: "Armrest Height", value: "18–28 cm (adjustable)" },
      { label: "Weight Capacity", value: "150 kg" },
      { label: "Material", value: "Premium mesh & aluminum" },
      { label: "Warranty", value: "5 years" },
    ],
    features: [
      "4D adjustable armrests",
      "Synchronized tilt mechanism",
      "Adjustable lumbar support",
      "Breathable mesh backrest",
      "Memory foam seat cushion",
      "Chrome aluminum base",
      "Smooth-rolling casters",
      "360° swivel",
    ],
    inStock: true,
    isNew: true,
    isBestSeller: true,
    rating: 4.8,
    reviews: 124,
  },
  {
    id: "mesh-task-chair",
    name: "AirFlow Task Chair",
    category: "chairs",
    series: "ek-series",
    price: 28000,
    description: "The AirFlow Task Chair delivers exceptional comfort at an accessible price point. Perfect for busy professionals, this chair features adjustable lumbar support and breathable mesh construction.",
    shortDescription: "Affordable task chair with breathable mesh and adjustable lumbar support.",
    images: [chairImage, chairImage, chairImage, chairImage],
    colors: [
      { name: "Black", hex: "#000000" },
      { name: "Gray", hex: "#6b7280" },
      { name: "Blue", hex: "#3b82f6" },
    ],
    specifications: [
      { label: "Seat Height", value: "40–50 cm" },
      { label: "Weight Capacity", value: "120 kg" },
      { label: "Material", value: "Mesh & nylon" },
      { label: "Warranty", value: "3 years" },
    ],
    features: [
      "Breathable mesh back",
      "Adjustable lumbar",
      "Armrest adjustment",
      "Tilt mechanism",
    ],
    inStock: true,
    rating: 4.5,
    reviews: 203,
  },
  {
    id: "guest-chair",
    name: "Visitor Comfort Chair",
    category: "chairs",
    series: "infinity-series",
    price: 18500,
    description: "Welcome guests in style with our Visitor Comfort Chair. The sleek design and premium upholstery make it ideal for reception areas, meeting rooms, and executive offices.",
    shortDescription: "Stylish guest chair with premium upholstery for reception areas.",
    images: [chairImage, chairImage, chairImage, chairImage],
    colors: [
      { name: "Black Leather", hex: "#1a1a1a" },
      { name: "Brown Leather", hex: "#5d4037" },
      { name: "Gray Fabric", hex: "#9ca3af" },
    ],
    specifications: [
      { label: "Seat Height", value: "45 cm" },
      { label: "Seat Width", value: "48 cm" },
      { label: "Weight Capacity", value: "130 kg" },
      { label: "Warranty", value: "3 years" },
    ],
    features: [
      "Chrome frame",
      "Premium upholstery",
      "Stackable design",
      "Non-scratch feet",
    ],
    inStock: true,
    rating: 4.4,
    reviews: 89,
  },
  // ── WORKSTATIONS
  {
    id: "collab-workstation-4",
    name: "CollabSpace 4-Person Workstation",
    category: "workstations",
    series: "infinity-series",
    price: 320000,
    description: "The CollabSpace 4-Person Workstation is designed for modern collaborative teams. Acoustic privacy panels, individual power modules, and ergonomic positioning maximize productivity while fostering teamwork.",
    shortDescription: "Modern 4-person workstation with acoustic panels and individual power modules.",
    images: [workstationImage, workstationImage, workstationImage, workstationImage],
    colors: [
      { name: "White & Teal", hex: "#2dd4bf" },
      { name: "White & Gray", hex: "#6b7280" },
      { name: "White & Navy", hex: "#1e40af" },
    ],
    specifications: [
      { label: "Overall Dimensions", value: "320 × 160 cm" },
      { label: "Desk Height", value: "75 cm" },
      { label: "Panel Height", value: "45 cm" },
      { label: "Workspaces", value: "4 individual" },
      { label: "Power Modules", value: "4 (one per workspace)" },
      { label: "Material", value: "Steel frame & laminate" },
      { label: "Panel Material", value: "Acoustic fabric" },
      { label: "Warranty", value: "7 years" },
    ],
    features: [
      "Acoustic privacy panels",
      "Individual power modules",
      "Cable trays included",
      "Modular & expandable",
      "Steel frame construction",
      "Anti-fingerprint surface",
      "Easy assembly",
      "Customizable configurations",
    ],
    inStock: true,
    isNew: true,
    rating: 4.7,
    reviews: 56,
  },
  {
    id: "workstation-2",
    name: "DuoSpace 2-Person Workstation",
    category: "workstations",
    series: "ek-series",
    price: 145000,
    description: "The DuoSpace 2-Person Workstation is perfect for small teams or partner offices. Features include privacy screens, individual storage, and shared power access.",
    shortDescription: "Efficient 2-person workstation with privacy screens and storage.",
    images: [workstationImage, workstationImage, workstationImage, workstationImage],
    colors: [
      { name: "White & Orange", hex: "#f97316" },
      { name: "White & Green", hex: "#22c55e" },
      { name: "Gray & Blue", hex: "#3b82f6" },
    ],
    specifications: [
      { label: "Overall Dimensions", value: "240 × 120 cm" },
      { label: "Workspaces", value: "2" },
      { label: "Panel Height", value: "40 cm" },
      { label: "Warranty", value: "5 years" },
    ],
    features: [
      "Privacy screens",
      "Individual storage",
      "Shared power module",
      "Cable management",
    ],
    inStock: true,
    rating: 4.6,
    reviews: 67,
  },
  // ── CUBICLE WORKSTATIONS
  {
    id: "cubicle-6",
    name: "Focus Cubicle Pod — 6 Seater",
    category: "cubicle-workstations",
    series: "cubicle-series",
    price: 520000,
    description: "The Focus Cubicle Pod provides a dedicated private workspace for each team member within an open office. High acoustic panels reduce noise by up to 60%, creating a focused environment for deep work.",
    shortDescription: "6-seater cubicle pod with high acoustic panels for focused workspaces.",
    images: [workstationImage, workstationImage, workstationImage, workstationImage],
    colors: [
      { name: "Gray & White", hex: "#6b7280" },
      { name: "Navy & White", hex: "#1e3a5f" },
      { name: "Green & White", hex: "#16a34a" },
    ],
    specifications: [
      { label: "Overall Area", value: "~12 sq meters" },
      { label: "Panel Height", value: "150 cm" },
      { label: "Desk Size per Unit", value: "120 × 60 cm" },
      { label: "Acoustic Rating", value: "Class B" },
      { label: "Warranty", value: "7 years" },
    ],
    features: [
      "High acoustic privacy panels",
      "Per-seat power & USB outlets",
      "Overhead storage bin",
      "Pinboard fabric panel",
      "Anti-glare work surface",
      "Modular — add more units",
    ],
    inStock: true,
    rating: 4.8,
    reviews: 44,
  },
  // ── OFFICE SOFAS
  {
    id: "lounge-sofa-3",
    name: "Executive Lounge Sofa 3-Seater",
    category: "office-sofas",
    series: "woodex-series",
    price: 125000,
    originalPrice: 145000,
    description: "Elevate your reception area or executive lounge with our premium 3-seater sofa. Upholstered in full-grain leather with a solid hardwood frame, this sofa balances luxury comfort with professional aesthetics.",
    shortDescription: "Premium 3-seater lounge sofa in full-grain leather with hardwood frame.",
    images: [chairImage, chairImage, chairImage, chairImage],
    colors: [
      { name: "Black Leather", hex: "#1a1a1a" },
      { name: "Brown Leather", hex: "#5d4037" },
      { name: "Cream", hex: "#f5f0e0" },
    ],
    specifications: [
      { label: "Width", value: "220 cm" },
      { label: "Depth", value: "85 cm" },
      { label: "Height", value: "80 cm" },
      { label: "Upholstery", value: "Full-grain leather" },
      { label: "Frame", value: "Solid hardwood" },
      { label: "Warranty", value: "5 years" },
    ],
    features: [
      "Full-grain leather upholstery",
      "Solid hardwood frame",
      "High-density foam cushions",
      "Chrome leg finish",
      "Stain-resistant treatment",
      "Custom color available",
    ],
    inStock: true,
    rating: 4.9,
    reviews: 38,
  },
  // ── OFFICE STORAGE
  {
    id: "storage-credenza",
    name: "Executive Storage Credenza",
    category: "storage",
    series: "woodex-series",
    price: 98000,
    description: "The Executive Storage Credenza combines elegant design with practical storage solutions. Featuring lockable compartments, adjustable shelving, and a durable surface perfect for any executive office.",
    shortDescription: "Elegant credenza with lockable compartments and premium veneer finish.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Walnut", hex: "#5d4037" },
      { name: "Espresso", hex: "#3c2415" },
      { name: "White", hex: "#f5f5f5" },
    ],
    specifications: [
      { label: "Width", value: "180 cm" },
      { label: "Depth", value: "50 cm" },
      { label: "Height", value: "72 cm" },
      { label: "Compartments", value: "4 + 2 drawers" },
      { label: "Warranty", value: "7 years" },
    ],
    features: [
      "Lockable compartments",
      "Adjustable shelving",
      "Soft-close doors",
      "Cable routing",
      "Premium wood veneer",
    ],
    inStock: true,
    rating: 4.6,
    reviews: 42,
  },
  // ── CAFE FURNITURE
  {
    id: "cafe-stool",
    name: "Cafe Bar Stool Industrial",
    category: "cafe",
    series: "ek-series",
    price: 12500,
    description: "Add a contemporary edge to your office cafe or break room with these industrial-style bar stools. The combination of metal frame and cushioned seat provides both style and comfort.",
    shortDescription: "Industrial-style cushioned bar stool for office cafes and break rooms.",
    images: [chairImage, chairImage, chairImage, chairImage],
    colors: [
      { name: "Black Metal", hex: "#1a1a1a" },
      { name: "Brass & Walnut", hex: "#b87333" },
      { name: "White & Gray", hex: "#9ca3af" },
    ],
    specifications: [
      { label: "Seat Height", value: "75 cm" },
      { label: "Weight Capacity", value: "120 kg" },
      { label: "Frame", value: "Powder-coated steel" },
      { label: "Warranty", value: "2 years" },
    ],
    features: [
      "Footrest rail",
      "Cushioned seat",
      "Non-slip rubber feet",
      "Stackable",
    ],
    inStock: true,
    isNew: true,
    rating: 4.5,
    reviews: 67,
  },
  // ── PUBLIC SITTING
  {
    id: "waiting-bench-3",
    name: "Public Waiting Bench 3-Seater",
    category: "public",
    series: "ek-series",
    price: 35000,
    description: "Designed for lobbies, hospitals, and public spaces. Our durable 3-seater waiting bench features an ergonomic contoured seat and a robust steel frame built to handle heavy daily use.",
    shortDescription: "Durable 3-seater waiting bench for lobbies and public areas.",
    images: [chairImage, chairImage, chairImage, chairImage],
    colors: [
      { name: "Black", hex: "#1a1a1a" },
      { name: "Navy Blue", hex: "#1e3a5f" },
      { name: "Charcoal Gray", hex: "#374151" },
    ],
    specifications: [
      { label: "Width", value: "180 cm" },
      { label: "Depth", value: "60 cm" },
      { label: "Height", value: "80 cm" },
      { label: "Seating", value: "3 persons" },
      { label: "Frame", value: "Heavy-duty steel" },
      { label: "Warranty", value: "5 years" },
    ],
    features: [
      "Heavy-duty steel frame",
      "Ergonomic contoured seat",
      "Floor-mounted option available",
      "Anti-vandal construction",
      "Easy to clean surface",
    ],
    inStock: true,
    rating: 4.3,
    reviews: 52,
  },
  // ── HOME: BEDROOM
  {
    id: "king-bed-set",
    name: "Royal King Bed Set",
    category: "bedroom",
    subcategory: "bed-sets",
    series: "woodex-series",
    price: 285000,
    originalPrice: 320000,
    description: "Transform your bedroom into a sanctuary with our Royal King Bed Set. Includes bed frame, two bedside tables, and a dressing table crafted from premium solid wood with hand-rubbed finishes.",
    shortDescription: "Complete king bedroom set in premium solid wood — bed, 2 bedsides, dressing table.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Walnut", hex: "#5d4037" },
      { name: "White Oak", hex: "#d4c5a9" },
      { name: "Espresso", hex: "#3c2415" },
    ],
    specifications: [
      { label: "Bed Size", value: "King (180 × 200 cm)" },
      { label: "Headboard Height", value: "120 cm" },
      { label: "Includes", value: "Bed frame + 2 bedsides + dressing table" },
      { label: "Material", value: "Solid hardwood" },
      { label: "Warranty", value: "10 years" },
    ],
    features: [
      "Solid hardwood construction",
      "Upholstered headboard option",
      "Under-bed storage drawers",
      "Soft-close drawer hinges",
      "Mirror included with dressing table",
      "Custom upholstery available",
    ],
    inStock: true,
    isBestSeller: true,
    rating: 4.9,
    reviews: 78,
  },
  {
    id: "dressing-table",
    name: "Glamour Dressing Table with Mirror",
    category: "bedroom",
    subcategory: "dressing-tables",
    series: "woodex-series",
    price: 65000,
    description: "A beautifully crafted dressing table featuring a large frameless mirror, multiple drawers, and an elegant design. Perfect for master bedrooms and dressing rooms.",
    shortDescription: "Elegant dressing table with large mirror and multiple storage drawers.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "White", hex: "#f5f5f5" },
      { name: "Walnut", hex: "#5d4037" },
      { name: "Rose Gold", hex: "#b5738e" },
    ],
    specifications: [
      { label: "Width", value: "120 cm" },
      { label: "Depth", value: "45 cm" },
      { label: "Height", value: "75 cm (+ mirror 80 cm)" },
      { label: "Drawers", value: "6" },
      { label: "Warranty", value: "5 years" },
    ],
    features: [
      "Large frameless mirror",
      "6 storage drawers",
      "Soft-close mechanism",
      "Integrated LED lighting option",
      "Jewelry compartment",
    ],
    inStock: true,
    isNew: true,
    rating: 4.8,
    reviews: 54,
  },
  // ── HOME: LIVING
  {
    id: "home-sofa-5",
    name: "Comfort L-Shape Home Sofa",
    category: "living",
    subcategory: "home-sofa",
    series: "woodex-series",
    price: 195000,
    originalPrice: 225000,
    description: "The ultimate living room centrepiece. Our Comfort L-Shape sofa features high-density foam, premium fabric upholstery, and a solid hardwood base designed for years of comfortable lounging.",
    shortDescription: "Large L-shape home sofa in premium fabric with solid wood base.",
    images: [chairImage, chairImage, chairImage, chairImage],
    colors: [
      { name: "Dove Gray", hex: "#9ca3af" },
      { name: "Beige", hex: "#d4b896" },
      { name: "Forest Green", hex: "#15803d" },
      { name: "Navy Blue", hex: "#1e3a5f" },
    ],
    specifications: [
      { label: "Width", value: "290 cm" },
      { label: "Depth", value: "165 cm" },
      { label: "Seat Height", value: "42 cm" },
      { label: "Upholstery", value: "Premium fabric" },
      { label: "Warranty", value: "7 years" },
    ],
    features: [
      "High-density foam cushions",
      "Premium fabric upholstery",
      "Solid hardwood frame",
      "Chaise lounge included",
      "Removable cushion covers",
      "Custom fabric options",
    ],
    inStock: true,
    rating: 4.9,
    reviews: 62,
  },
  {
    id: "tv-unit",
    name: "Modern TV Unit 200cm",
    category: "living",
    subcategory: "tv-units",
    series: "infinity-series",
    price: 72000,
    description: "A sleek, contemporary TV unit that combines ample storage with clean aesthetics. Features open shelving, closed cabinets, and wire management to keep your living room organized.",
    shortDescription: "Modern 200cm TV unit with open shelving and wire management.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "White & Walnut", hex: "#5d4037" },
      { name: "All White", hex: "#f5f5f5" },
      { name: "Charcoal", hex: "#374151" },
    ],
    specifications: [
      { label: "Width", value: "200 cm" },
      { label: "Depth", value: "40 cm" },
      { label: "Height", value: "52 cm" },
      { label: "TV Size Compatible", value: "Up to 85\"" },
      { label: "Warranty", value: "5 years" },
    ],
    features: [
      "Floating wall-mount option",
      "Open display shelves",
      "Closed storage cabinets",
      "Cable management channels",
      "LED strip lighting ready",
      "Soft-close doors",
    ],
    inStock: true,
    isNew: true,
    rating: 4.7,
    reviews: 91,
  },
  // ── HOME: DINING
  {
    id: "dining-set-6",
    name: "Farmhouse Dining Set — 6 Seater",
    category: "dining",
    subcategory: "dining-sets",
    series: "woodex-series",
    price: 185000,
    description: "Gather the family around our Farmhouse Dining Set. Solid sheesham wood table with six upholstered dining chairs creates the perfect dining room centerpiece.",
    shortDescription: "6-seater farmhouse dining set in solid sheesham wood with upholstered chairs.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Natural Sheesham", hex: "#7a4f2d" },
      { name: "Dark Ebony", hex: "#2a1a0e" },
      { name: "Light Oak", hex: "#c4a35a" },
    ],
    specifications: [
      { label: "Table Size", value: "180 × 90 cm" },
      { label: "Chairs", value: "6 included" },
      { label: "Material", value: "Solid sheesham wood" },
      { label: "Chair Upholstery", value: "Premium fabric" },
      { label: "Warranty", value: "10 years" },
    ],
    features: [
      "Solid sheesham construction",
      "6 upholstered dining chairs",
      "Extension leaf option",
      "Moisture-resistant finish",
      "Non-slip leg pads",
    ],
    inStock: true,
    isBestSeller: true,
    rating: 4.9,
    reviews: 47,
  },
];

// ─── UTILITY FUNCTIONS ───────────────────────────────────────────────────
export const getProductById = (id: string): Product | undefined => {
  return products.find((p) => p.id === id);
};

export const getProductsByCategory = (category: string): Product[] => {
  if (category === "all") return products;
  // Handle parent categories that map to multiple subcategories
  const parentMap: Record<string, string[]> = {
    "office-tables": ["executive-tables", "manager-tables", "staff-tables", "meeting-tables", "reception-tables"],
    "bedroom": ["bed-sets", "bedside-tables", "dressing-tables", "mirrors", "bench-settee"],
    "living": ["home-sofa", "center-side-tables", "coffee-tables", "console", "tv-units"],
    "dining": ["dining-sets", "dining-chairs", "dining-tables"],
  };
  if (parentMap[category]) {
    return products.filter(
      (p) => p.category === category || parentMap[category].includes(p.subcategory || "")
    );
  }
  return products.filter((p) => p.category === category || p.subcategory === category);
};

export const getProductsBySeries = (seriesId: string): Product[] => {
  return products.filter((p) => p.series === seriesId);
};

export const sortProducts = (prods: Product[], sortBy: string): Product[] => {
  const sorted = [...prods];
  switch (sortBy) {
    case "price-low":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-high":
      return sorted.sort((a, b) => b.price - a.price);
    case "rating":
      return sorted.sort((a, b) => b.rating - a.rating);
    case "newest":
      return sorted.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    default:
      return sorted;
  }
};

export const formatPKR = (amount: number): string => {
  return `PKR ${amount.toLocaleString("en-PK")}`;
};
