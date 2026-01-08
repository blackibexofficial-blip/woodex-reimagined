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

export const categories = [
  { id: "all", name: "All Products", count: 12 },
  { id: "chairs", name: "Ergonomic Chairs", count: 4 },
  { id: "desks", name: "Executive Desks", count: 3 },
  { id: "workstations", name: "Workstations", count: 2 },
  { id: "tables", name: "Meeting Tables", count: 2 },
  { id: "storage", name: "Office Storage", count: 1 },
];

export const products: Product[] = [
  {
    id: "ergo-pro-chair",
    name: "ErgoMax Pro Executive Chair",
    category: "chairs",
    price: 2499,
    originalPrice: 2999,
    description: "The ErgoMax Pro Executive Chair represents the pinnacle of ergonomic design and executive comfort. Crafted with premium materials and advanced lumbar support technology, this chair is engineered for professionals who demand excellence in their workspace. The breathable mesh back ensures optimal airflow during long working hours, while the adjustable headrest provides neck support for those intense meetings.",
    shortDescription: "Premium executive chair with advanced lumbar support and breathable mesh design.",
    images: [chairImage, chairImage, chairImage, chairImage],
    colors: [
      { name: "Charcoal Black", hex: "#1a1a1a" },
      { name: "Slate Gray", hex: "#4a5568" },
      { name: "Navy Blue", hex: "#1e3a5f" },
      { name: "Burgundy", hex: "#722f37" },
    ],
    specifications: [
      { label: "Seat Height", value: "42-52 cm (adjustable)" },
      { label: "Seat Width", value: "52 cm" },
      { label: "Seat Depth", value: "48 cm" },
      { label: "Back Height", value: "75 cm" },
      { label: "Armrest Height", value: "18-28 cm (adjustable)" },
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
    rating: 4.8,
    reviews: 124,
  },
  {
    id: "exec-desk-l-shaped",
    name: "Executive L-Shaped Power Desk",
    category: "desks",
    price: 4999,
    originalPrice: 5499,
    description: "Transform your office with our Executive L-Shaped Power Desk. This commanding piece combines functionality with sophisticated design, featuring integrated cable management, USB charging ports, and a spacious work surface. The premium wood veneer finish exudes professionalism while the modular design adapts to your workflow.",
    shortDescription: "Spacious L-shaped desk with integrated power management and premium finish.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Walnut", hex: "#5d4037" },
      { name: "Oak Natural", hex: "#c4a35a" },
      { name: "Espresso", hex: "#3c2415" },
      { name: "White Oak", hex: "#d4c5a9" },
    ],
    specifications: [
      { label: "Overall Width", value: "200 cm" },
      { label: "Overall Depth", value: "180 cm" },
      { label: "Height", value: "75 cm" },
      { label: "Desktop Thickness", value: "3.5 cm" },
      { label: "Material", value: "Solid wood & veneer" },
      { label: "Power Outlets", value: "4 AC + 2 USB-C" },
      { label: "Cable Management", value: "Integrated channels" },
      { label: "Warranty", value: "10 years" },
    ],
    features: [
      "Built-in power outlets & USB ports",
      "Integrated cable management",
      "Scratch-resistant surface",
      "Modesty panel included",
      "Adjustable leveling feet",
      "Lockable drawer unit",
      "Premium wood veneer",
      "Soft-close drawers",
    ],
    inStock: true,
    isBestSeller: true,
    rating: 4.9,
    reviews: 89,
  },
  {
    id: "collab-workstation-4",
    name: "CollabSpace 4-Person Workstation",
    category: "workstations",
    price: 8999,
    description: "The CollabSpace 4-Person Workstation is designed for modern collaborative teams. Featuring acoustic privacy panels, individual power modules, and ergonomic positioning, this workstation maximizes productivity while fostering teamwork. The modular design allows for easy reconfiguration as your team grows.",
    shortDescription: "Modern 4-person workstation with acoustic panels and individual power modules.",
    images: [workstationImage, workstationImage, workstationImage, workstationImage],
    colors: [
      { name: "White & Teal", hex: "#2dd4bf" },
      { name: "White & Gray", hex: "#6b7280" },
      { name: "White & Navy", hex: "#1e40af" },
    ],
    specifications: [
      { label: "Overall Dimensions", value: "320 x 160 cm" },
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
    id: "mesh-task-chair",
    name: "AirFlow Task Chair",
    category: "chairs",
    price: 1299,
    description: "The AirFlow Task Chair delivers exceptional comfort at an accessible price point. Perfect for busy professionals, this chair features a fully adjustable design with lumbar support and breathable mesh construction.",
    shortDescription: "Affordable task chair with breathable mesh and adjustable lumbar support.",
    images: [chairImage, chairImage, chairImage, chairImage],
    colors: [
      { name: "Black", hex: "#000000" },
      { name: "Gray", hex: "#6b7280" },
      { name: "Blue", hex: "#3b82f6" },
    ],
    specifications: [
      { label: "Seat Height", value: "40-50 cm" },
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
    id: "standing-desk-pro",
    name: "RiseUp Electric Standing Desk",
    category: "desks",
    price: 3499,
    description: "Elevate your work experience with the RiseUp Electric Standing Desk. Featuring whisper-quiet dual motors, programmable height memory, and a spacious desktop, this desk seamlessly transitions between sitting and standing positions.",
    shortDescription: "Electric height-adjustable desk with memory presets and dual motors.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "White", hex: "#ffffff" },
      { name: "Black", hex: "#1a1a1a" },
      { name: "Walnut", hex: "#5d4037" },
    ],
    specifications: [
      { label: "Desktop Size", value: "160 x 80 cm" },
      { label: "Height Range", value: "65-130 cm" },
      { label: "Motor Type", value: "Dual electric" },
      { label: "Lift Speed", value: "38mm/sec" },
      { label: "Weight Capacity", value: "120 kg" },
      { label: "Warranty", value: "5 years" },
    ],
    features: [
      "4 programmable heights",
      "Anti-collision technology",
      "Cable management tray",
      "LED controller display",
      "Whisper-quiet operation",
      "Sturdy steel frame",
    ],
    inStock: true,
    isBestSeller: true,
    rating: 4.9,
    reviews: 167,
  },
  {
    id: "conference-table-12",
    name: "BoardRoom Conference Table",
    category: "tables",
    price: 12999,
    description: "Make a statement with the BoardRoom Conference Table. Designed for executive meetings and presentations, this impressive table seats up to 12 and features integrated power, data ports, and premium finishes.",
    shortDescription: "Premium 12-person conference table with integrated technology.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Mahogany", hex: "#4a2c2a" },
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
      "Premium wood construction",
      "Integrated power & data",
      "Cable management",
      "Modular design",
      "Matching chairs available",
      "Custom sizes available",
    ],
    inStock: true,
    rating: 5.0,
    reviews: 28,
  },
  {
    id: "storage-credenza",
    name: "Executive Storage Credenza",
    category: "storage",
    price: 2999,
    description: "The Executive Storage Credenza combines elegant design with practical storage solutions. Featuring lockable compartments, adjustable shelving, and a durable surface, it's the perfect complement to any executive office.",
    shortDescription: "Elegant storage solution with lockable compartments and premium finish.",
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
      "Matching desk available",
    ],
    inStock: false,
    rating: 4.6,
    reviews: 42,
  },
  {
    id: "guest-chair",
    name: "Visitor Comfort Chair",
    category: "chairs",
    price: 799,
    description: "Welcome guests in style with our Visitor Comfort Chair. The sleek design and comfortable padding make it ideal for reception areas, meeting rooms, and executive offices.",
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
  {
    id: "compact-desk",
    name: "Compact Home Office Desk",
    category: "desks",
    price: 1499,
    description: "Perfect for home offices and small spaces, the Compact Home Office Desk delivers full functionality in a space-efficient design. Features include a keyboard tray, cable management, and durable construction.",
    shortDescription: "Space-efficient desk ideal for home offices with full functionality.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "White", hex: "#ffffff" },
      { name: "Oak", hex: "#c4a35a" },
      { name: "Gray", hex: "#6b7280" },
    ],
    specifications: [
      { label: "Width", value: "120 cm" },
      { label: "Depth", value: "60 cm" },
      { label: "Height", value: "75 cm" },
      { label: "Warranty", value: "5 years" },
    ],
    features: [
      "Keyboard tray",
      "Cable management",
      "Compact footprint",
      "Sturdy construction",
    ],
    inStock: true,
    isNew: true,
    rating: 4.7,
    reviews: 134,
  },
  {
    id: "workstation-2",
    name: "DuoSpace 2-Person Workstation",
    category: "workstations",
    price: 4999,
    description: "The DuoSpace 2-Person Workstation is perfect for small teams or partner offices. Features include privacy screens, individual storage, and shared power access.",
    shortDescription: "Efficient 2-person workstation with privacy screens and storage.",
    images: [workstationImage, workstationImage, workstationImage, workstationImage],
    colors: [
      { name: "White & Orange", hex: "#f97316" },
      { name: "White & Green", hex: "#22c55e" },
      { name: "Gray & Blue", hex: "#3b82f6" },
    ],
    specifications: [
      { label: "Overall Dimensions", value: "240 x 120 cm" },
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
  {
    id: "round-meeting-table",
    name: "Circle Meeting Table",
    category: "tables",
    price: 3999,
    description: "Foster collaboration with the Circle Meeting Table. The round design promotes equal participation and the premium finish adds sophistication to any meeting room.",
    shortDescription: "Round meeting table for collaborative discussions, seats 6.",
    images: [deskImage, deskImage, deskImage, deskImage],
    colors: [
      { name: "Walnut", hex: "#5d4037" },
      { name: "White", hex: "#ffffff" },
      { name: "Black", hex: "#1a1a1a" },
    ],
    specifications: [
      { label: "Diameter", value: "150 cm" },
      { label: "Height", value: "75 cm" },
      { label: "Seating", value: "6 persons" },
      { label: "Warranty", value: "7 years" },
    ],
    features: [
      "Central cable port",
      "Premium finish",
      "Sturdy base",
      "Easy assembly",
    ],
    inStock: true,
    rating: 4.8,
    reviews: 45,
  },
  {
    id: "gaming-exec-chair",
    name: "ProGamer Executive Chair",
    category: "chairs",
    price: 1899,
    description: "The ProGamer Executive Chair combines gaming aesthetics with professional functionality. Features racing-inspired design, 4D armrests, and premium comfort for extended sessions.",
    shortDescription: "Gaming-style executive chair with premium comfort features.",
    images: [chairImage, chairImage, chairImage, chairImage],
    colors: [
      { name: "Black & Red", hex: "#dc2626" },
      { name: "Black & Blue", hex: "#2563eb" },
      { name: "All Black", hex: "#1a1a1a" },
    ],
    specifications: [
      { label: "Seat Height", value: "43-53 cm" },
      { label: "Weight Capacity", value: "150 kg" },
      { label: "Recline", value: "90-180°" },
      { label: "Warranty", value: "3 years" },
    ],
    features: [
      "Racing-inspired design",
      "4D armrests",
      "Full recline",
      "Lumbar pillow",
      "Headrest pillow",
      "Rocking function",
    ],
    inStock: true,
    rating: 4.5,
    reviews: 98,
  },
];

export const getProductById = (id: string): Product | undefined => {
  return products.find((p) => p.id === id);
};

export const getProductsByCategory = (category: string): Product[] => {
  if (category === "all") return products;
  return products.filter((p) => p.category === category);
};

export const sortProducts = (
  products: Product[],
  sortBy: string
): Product[] => {
  const sorted = [...products];
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
