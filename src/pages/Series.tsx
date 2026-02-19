import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import execImg from "@/assets/series-executive.jpg";
import modernImg from "@/assets/series-modern.jpg";
import ecoImg from "@/assets/series-eco.jpg";
import chairsImg from "@/assets/category-chairs.jpg";
import desksImg from "@/assets/category-executive.jpg";
import workstationsImg from "@/assets/category-workstations.jpg";

const series = [
  {
    id: "executive",
    name: "Executive Series",
    tagline: "Authority meets comfort",
    badge: "Premium",
    image: execImg,
    description: "The Executive Series combines traditional craftsmanship with modern ergonomics, delivering furniture that commands respect and provides all-day comfort for senior leadership.",
    features: ["Premium solid wood veneers", "Full-grain leather upholstery", "Handcrafted detailing", "10-year warranty"],
    href: "/shop?category=desks",
    products: 24,
  },
  {
    id: "modern",
    name: "Modern Series",
    tagline: "Clean lines, contemporary spaces",
    badge: "Popular",
    image: modernImg,
    description: "Scandinavian-inspired design philosophy meets Pakistani craftsmanship in our Modern Series. Perfect for companies that value minimalism and functional elegance.",
    features: ["Engineered hardwood", "Powder-coated steel frames", "Modular configurations", "5-year warranty"],
    href: "/shop?category=workstations",
    products: 38,
  },
  {
    id: "eco",
    name: "Eco Series",
    tagline: "Sustainable by design",
    badge: "New",
    image: ecoImg,
    description: "Our commitment to the environment comes to life in the Eco Series — furniture crafted from certified sustainable materials without compromising on quality or aesthetics.",
    features: ["FSC-certified wood", "Water-based finishes", "Recycled steel components", "Carbon-neutral shipping"],
    href: "/shop",
    products: 16,
  },
  {
    id: "task",
    name: "Task Chair Series",
    tagline: "Engineered for all-day performance",
    badge: "Bestseller",
    image: chairsImg,
    description: "Pakistan's most comprehensive ergonomic chair collection. From basic task chairs to fully-adjustable executive models, we have seating for every need and budget.",
    features: ["4D armrests", "Lumbar support system", "Breathable mesh backs", "5-year warranty"],
    href: "/shop?category=chairs",
    products: 42,
  },
  {
    id: "conference",
    name: "Conference Series",
    tagline: "Where decisions are made",
    badge: null,
    image: desksImg,
    description: "Impress clients and inspire teams with our Conference Series. From intimate boardrooms to large training facilities, our tables set the stage for productive meetings.",
    features: ["Cable management built-in", "Modular table systems", "Power & data integration", "Custom sizing available"],
    href: "/shop?category=tables",
    products: 18,
  },
  {
    id: "open-plan",
    name: "Open Plan Series",
    tagline: "Collaboration at scale",
    badge: null,
    image: workstationsImg,
    description: "Designed for modern open offices, the Open Plan Series maximizes space efficiency while promoting collaboration, flexibility, and employee wellbeing.",
    features: ["Acoustic privacy screens", "Sit-stand capability", "Shared storage integration", "Quick reconfiguration"],
    href: "/shop?category=workstations",
    products: 29,
  },
];

const Series = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-primary text-primary-foreground py-14">
          <div className="container mx-auto px-4">
            <p className="text-accent text-xs font-bold uppercase tracking-widest mb-2">Collections</p>
            <h1 className="text-4xl lg:text-5xl font-black mb-3">Furniture Series</h1>
            <p className="text-primary-foreground/75 max-w-xl">
              Explore our curated collections designed for different workspace needs, budgets, and aesthetics.
            </p>
          </div>
        </section>

        {/* Series List */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="space-y-12">
              {series.map((s, i) => (
                <div
                  key={s.id}
                  className={`grid lg:grid-cols-2 gap-0 border border-border rounded-sm overflow-hidden group hover:border-accent hover:shadow-xl transition-all ${
                    i % 2 === 1 ? "lg:flex-row-reverse" : ""
                  }`}
                >
                  {/* Image side */}
                  <div className={`relative overflow-hidden ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                    <img
                      src={s.image}
                      alt={s.name}
                      className="w-full h-64 lg:h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    {s.badge && (
                      <div className="absolute top-4 left-4">
                        <Badge className="bg-accent text-accent-foreground">{s.badge}</Badge>
                      </div>
                    )}
                    <div className="absolute bottom-4 left-4">
                      <span className="text-xs text-white/70 bg-primary/60 px-2 py-1 rounded">{s.products} products</span>
                    </div>
                  </div>

                  {/* Content side */}
                  <div className={`p-8 lg:p-10 flex flex-col justify-center ${i % 2 === 1 ? "lg:order-1" : ""}`}>
                    <div className="w-10 h-1 bg-accent mb-5" />
                    <h2 className="text-2xl lg:text-3xl font-bold mb-1">{s.name}</h2>
                    <p className="text-accent font-medium text-sm mb-4">{s.tagline}</p>
                    <p className="text-muted-foreground leading-relaxed mb-6 text-sm">{s.description}</p>
                    <ul className="grid grid-cols-2 gap-2 mb-7">
                      {s.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground self-start" asChild>
                      <Link to={s.href}>
                        Explore {s.name} <ArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Custom Series CTA */}
        <section className="py-14 bg-accent text-accent-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Can't Find Your Perfect Series?</h2>
            <p className="mb-7 opacity-85 max-w-md mx-auto">
              We create completely custom series for enterprise clients. Tell us your vision and we'll bring it to life.
            </p>
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8" asChild>
              <Link to="/quotation">Request Custom Series</Link>
            </Button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Series;
