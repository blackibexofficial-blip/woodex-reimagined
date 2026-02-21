import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Play, Armchair, Users, BarChart3, Box, Sofa, Monitor, RotateCcw, Palette, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import showroomImg from "@/assets/virtual-showroom-hero.jpg";
import slide1 from "@/assets/hero-slide-1.jpg";
import slide2 from "@/assets/hero-slide-2.jpg";
import slide3 from "@/assets/hero-slide-3.jpg";

const roomTypes = [
  { label: "Private Office", image: slide2 },
  { label: "Open Plan", image: slide1 },
  { label: "Conference Room", image: slide3 },
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
                  <Button size="lg" className="bg-accent hover:bg-hon-green-dark text-accent-foreground px-8">
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
                      <p className="text-white font-bold">{room.label}</p>
                      <p className="text-white/60 text-xs">Click to explore</p>
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
                { icon: BarChart3, label: "Standing Desks", href: "/shop?category=desks" },
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

        {/* 3D Configurator Placeholder */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="bg-section-mid rounded-sm h-[480px] flex items-center justify-center border border-border relative overflow-hidden">
              <img src={slide1} alt="Showroom preview" className="absolute inset-0 w-full h-full object-cover opacity-20" />
              <div className="relative z-10 text-center">
                <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center mx-auto mb-5 shadow-xl border border-border">
                  <Box className="h-10 w-10 text-accent" />
                </div>
                <h3 className="text-2xl font-bold mb-3">3D Room Configurator</h3>
                <p className="text-muted-foreground mb-6 max-w-md">
                  Our interactive 3D visualization tool lets you design your perfect office space in real-time.
                </p>
                <Button size="lg" className="bg-accent hover:bg-hon-green-dark text-accent-foreground px-8">
                  Launch 3D Configurator
                </Button>
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
                  <div className="w-10 h-10 rounded-sm bg-hon-green-pale flex items-center justify-center flex-shrink-0">
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
              <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground px-8" asChild>
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
