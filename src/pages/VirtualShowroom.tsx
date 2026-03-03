import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Play, Armchair, Users, BarChart3, Box, Sofa, Monitor, RotateCcw, Palette, Maximize, Download, Save, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import showroomImg from "@/assets/virtual-showroom-hero.jpg";
import slide1 from "@/assets/hero-slide-1.jpg";
import slide2 from "@/assets/hero-slide-2.jpg";
import slide3 from "@/assets/hero-slide-3.jpg";
import chairImg from "@/assets/category-chairs.jpg";
import deskImg from "@/assets/category-executive.jpg";
import storageImg from "@/assets/category-storage.jpg";

const roomTypes = [
  { label: "Private Office", image: slide2 },
  { label: "Open Plan", image: slide1 },
  { label: "Conference Room", image: slide3 },
];

const configuratorCategories = [
  { id: "desks", label: "Desks & Tables", icon: BarChart3, image: deskImg, count: 45 },
  { id: "chairs", label: "Chairs", icon: Armchair, image: chairImg, count: 32 },
  { id: "storage", label: "Storage", icon: Box, image: storageImg, count: 18 },
  { id: "sofa", label: "Lounge", icon: Sofa, image: slide3, count: 12 },
];

const materials = [
  { name: "Dark Walnut", color: "hsl(20, 30%, 18%)" },
  { name: "Natural Oak", color: "hsl(40, 55%, 55%)" },
  { name: "White", color: "hsl(0, 0%, 96%)" },
  { name: "Gray", color: "hsl(0, 0%, 50%)" },
  { name: "Cherry", color: "hsl(10, 45%, 35%)" },
  { name: "Espresso", color: "hsl(20, 40%, 15%)" },
];

const features = [
  { icon: Monitor, title: "Real-Time 3D Preview", description: "Photorealistic rendering of every product from any angle, in your actual room dimensions." },
  { icon: RotateCcw, title: "360° Product View", description: "Spin, zoom, and inspect every detail of our furniture before you commit." },
  { icon: Palette, title: "Color & Material Configurator", description: "Try different fabric options, wood finishes, and color combinations instantly." },
  { icon: Maximize, title: "Space Planning Tool", description: "Design your office layout with accurate dimensions and real-time space validation." },
  { icon: Users, title: "Collaborative Design", description: "Share your virtual layout with colleagues and stakeholders for instant feedback." },
  { icon: Box, title: "Save & Export", description: "Save your configurations and export professional presentation layouts and specs." },
];

const VirtualShowroom = () => {
  const [activeCategory, setActiveCategory] = useState("desks");
  const [selectedMaterial, setSelectedMaterial] = useState(0);

  useEffect(() => {
    document.title = "Virtual Showroom — WOODEX Pakistan | 3D Room Configurator";
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="bg-primary text-primary-foreground py-16">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <p className="text-accent text-xs font-bold uppercase tracking-widest mb-3">Experience It First</p>
                <h1 className="text-4xl lg:text-6xl font-black mb-4 leading-tight">
                  Virtual Showroom
                </h1>
                <p className="text-primary-foreground/75 mb-7 text-lg leading-relaxed">
                  Experience our furniture in immersive 3D. Design your perfect office space with real-time
                  visualization before making any commitment.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground px-8">
                    Launch 3D Configurator
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10"
                  >
                    <Play className="mr-2 h-5 w-5" />
                    Watch Demo
                  </Button>
                </div>
              </div>
              <div className="rounded-sm overflow-hidden shadow-2xl">
                <img src={showroomImg} alt="Virtual Showroom" className="w-full h-72 lg:h-80 object-cover" />
              </div>
            </div>
          </div>
        </section>

        {/* Room Type Selector */}
        <section className="py-14 bg-background border-b">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Choose a Room Type</h2>
              <p className="text-muted-foreground text-sm">Start with a template and customize to your liking</p>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {roomTypes.map((room) => (
                <button
                  key={room.label}
                  className="group relative aspect-video rounded-sm overflow-hidden border-2 border-border hover:border-accent transition-all"
                >
                  <img src={room.image} alt={room.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/70 to-transparent" />
                  <div className="absolute inset-0 flex items-end p-4">
                    <div>
                      <p className="text-primary-foreground font-bold">{room.label}</p>
                      <p className="text-primary-foreground/60 text-xs">Click to explore</p>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-accent text-accent-foreground text-xs font-bold px-3 py-1.5 rounded-full">Launch Room</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Product Category Quick Filters */}
        <section className="py-8 bg-section-light border-b">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap gap-3 justify-center">
              {[
                { icon: Armchair, label: "Executive Chairs", href: "/shop?category=chairs" },
                { icon: Users, label: "Workstations", href: "/shop?category=workstations" },
                { icon: BarChart3, label: "Standing Desks", href: "/shop?category=executive-tables" },
                { icon: Box, label: "Storage", href: "/shop?category=storage" },
                { icon: Sofa, label: "Lounge", href: "/shop" },
              ].map((cat) => (
                <Link key={cat.label} to={cat.href}>
                  <Button variant="outline" className="border-border hover:border-accent hover:text-accent gap-2">
                    <cat.icon className="h-4 w-4" />
                    {cat.label}
                  </Button>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Enhanced 3D Configurator */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <div className="w-12 h-1 bg-accent mx-auto mb-5" />
              <h2 className="text-3xl font-bold mb-2">3D Room Configurator</h2>
              <p className="text-muted-foreground">Select furniture, choose materials, and design your perfect workspace</p>
            </div>

            <div className="grid lg:grid-cols-4 gap-6">
              {/* Left: Category & Material Panel */}
              <div className="lg:col-span-1 space-y-6">
                {/* Furniture Categories */}
                <div className="border border-border rounded-sm p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-accent mb-3 flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5" /> Furniture
                  </h3>
                  <div className="space-y-2">
                    {configuratorCategories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-sm transition-colors text-left ${
                          activeCategory === cat.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-sm overflow-hidden flex-shrink-0">
                          <img src={cat.image} alt={cat.label} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{cat.label}</p>
                          <p className={`text-xs ${activeCategory === cat.id ? "text-accent-foreground/70" : "text-muted-foreground"}`}>{cat.count} items</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Material Picker */}
                <div className="border border-border rounded-sm p-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-accent mb-3 flex items-center gap-2">
                    <Palette className="h-3.5 w-3.5" /> Material & Finish
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {materials.map((mat, i) => (
                      <button
                        key={mat.name}
                        onClick={() => setSelectedMaterial(i)}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-sm transition-all ${
                          selectedMaterial === i ? "ring-2 ring-accent bg-accent/10" : "hover:bg-muted"
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-full border border-border"
                          style={{ backgroundColor: mat.color }}
                        />
                        <span className="text-[10px] text-muted-foreground text-center leading-tight">{mat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Center: Viewport */}
              <div className="lg:col-span-3">
                <div className="bg-section-light rounded-sm h-[480px] flex items-center justify-center border border-border relative overflow-hidden">
                  <img src={slide1} alt="Showroom preview" className="absolute inset-0 w-full h-full object-cover opacity-20" />
                  <div className="relative z-10 text-center">
                    <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mx-auto mb-5 shadow-xl border border-border">
                      <Box className="h-10 w-10 text-accent" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3">Interactive 3D Viewport</h3>
                    <p className="text-muted-foreground mb-6 max-w-md">
                      Select furniture from the panel, choose your materials, and visualize your dream workspace.
                    </p>
                    <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground px-8">
                      Launch 3D Configurator
                    </Button>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex flex-wrap gap-3 mt-4 justify-end">
                  <Button variant="outline" size="sm" className="gap-2 border-border hover:border-accent">
                    <Save className="h-3.5 w-3.5" /> Save Layout
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2 border-border hover:border-accent">
                    <Download className="h-3.5 w-3.5" /> Download Layout
                  </Button>
                  <Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2" asChild>
                    <Link to="/quotation">Get Quote for This Layout</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 bg-section-light border-t">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <div className="w-12 h-1 bg-accent mx-auto mb-5" />
              <h2 className="text-3xl font-bold mb-3">Virtual Showroom Features</h2>
              <p className="text-muted-foreground">Experience furniture shopping like never before</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f) => (
                <div key={f.title} className="flex gap-4 p-5 bg-background rounded-sm border border-border hover:border-accent transition-colors">
                  <div className="w-10 h-10 rounded-sm bg-muted flex items-center justify-center flex-shrink-0">
                    <f.icon className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-14 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Design Your Dream Office?</h2>
            <p className="text-primary-foreground/75 mb-7 max-w-md mx-auto">
              Start with our virtual showroom and get a tailored quote based on your custom design.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button className="bg-accent hover:bg-accent/90 text-accent-foreground px-8" asChild>
                <Link to="/quotation">Get Custom Quote</Link>
              </Button>
              <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" asChild>
                <Link to="/shop">Browse Products</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default VirtualShowroom;
