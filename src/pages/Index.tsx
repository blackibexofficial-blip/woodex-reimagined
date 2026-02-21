import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Pause, Play, ArrowRight, Star, Quote } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import slide1 from "@/assets/hero-slide-1.jpg";
import slide2 from "@/assets/hero-slide-2.jpg";
import slide3 from "@/assets/hero-slide-3.jpg";
import chairsImg from "@/assets/category-chairs.jpg";
import desksImg from "@/assets/category-executive.jpg";
import workstationsImg from "@/assets/category-workstations.jpg";
import tablesImg from "@/assets/category-tables.jpg";
import storageImg from "@/assets/category-storage.jpg";
import proj1 from "@/assets/project-1.jpg";
import proj2 from "@/assets/project-2.jpg";
import proj3 from "@/assets/project-3.jpg";

const slides = [
  {
    image: slide1,
    title: "Make Your Space Work",
    subtitle: "Premium ergonomic workstations for the modern professional",
    cta: "Explore Workstations",
    ctaHref: "/shop?category=workstations",
  },
  {
    image: slide2,
    title: "Tables Designed for Equitable Meetings",
    subtitle: "Conference solutions that enable inclusive participation in hybrid settings",
    cta: "View Tables",
    ctaHref: "/shop?category=meeting-tables",
  },
  {
    image: slide3,
    title: "Home Furniture Collection",
    subtitle: "Extend the WOODEX quality to your bedroom, living room, and dining spaces",
    cta: "Shop Home",
    ctaHref: "/shop?category=bedroom",
  },
];

const markets = [
  { label: "Business", description: "Your Market Leader for an Ideal Workspace", href: "/b2b" },
  { label: "Education", description: "Expanding the Potential for Learning", href: "/b2b" },
  { label: "Healthcare", description: "Reliable, Easy-to-Clean, Flexible Furniture Solutions", href: "/b2b" },
  { label: "Government", description: "Leading The Way One Solution at a Time", href: "/b2b" },
  { label: "Hospitality", description: "Elegant Spaces for Exceptional Experiences", href: "/b2b" },
];

const officeCategories = [
  { label: "Ergonomic Chairs", image: chairsImg, href: "/shop?category=chairs" },
  { label: "Executive Desks", image: desksImg, href: "/shop?category=executive-tables" },
  { label: "Workstations", image: workstationsImg, href: "/shop?category=workstations" },
  { label: "Meeting Tables", image: tablesImg, href: "/shop?category=meeting-tables" },
  { label: "Office Storage", image: storageImg, href: "/shop?category=storage" },
];

const homeCategories = [
  { label: "Bedroom", href: "/shop?category=bedroom", description: "Beds, dressing tables, mirrors & more" },
  { label: "Living Room", href: "/shop?category=living", description: "Sofas, coffee tables, TV units" },
  { label: "Dining", href: "/shop?category=dining", description: "Complete dining sets & chairs" },
];

const testimonials = [
  { name: "Khalid Mahmood", role: "Director, DHA Developers", text: "WOODEX delivered beyond our expectations. The quality is exceptional and the team handled our project with complete professionalism.", rating: 5 },
  { name: "Sara Malik", role: "CEO, TechHub Pakistan", text: "Our team loves the new office. The furniture is exactly what we needed — flexible, modern, and built to last.", rating: 5 },
  { name: "Dr. Amina Raza", role: "Operations, SKMT", text: "The furniture meets all our healthcare standards while creating a welcoming environment for our patients.", rating: 5 },
];

const Index = () => {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    document.title = "WOODEX — Pakistan's Premium Office & Home Furniture Manufacturer";
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, [playing]);

  const prev = () => setCurrent((c) => (c - 1 + slides.length) % slides.length);
  const next = () => setCurrent((c) => (c + 1) % slides.length);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* === HERO SLIDER === */}
        <section className="relative h-[70vh] min-h-[480px] overflow-hidden bg-primary">
          {slides.map((slide, i) => (
            <div
              key={i}
              className={`absolute inset-0 transition-opacity duration-1000 ${i === current ? "opacity-100" : "opacity-0"}`}
            >
              <img src={slide.image} alt={slide.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-primary/75 via-primary/40 to-transparent" />
            </div>
          ))}
          <div className="absolute inset-0 flex items-end pb-20">
            <div className="container mx-auto px-4">
              <div className="max-w-xl text-primary-foreground">
                <h1 className="text-4xl lg:text-5xl xl:text-6xl font-black mb-3 leading-tight">
                  {slides[current].title}
                </h1>
                <p className="text-base lg:text-lg text-primary-foreground/85 mb-6 leading-relaxed">
                  {slides[current].subtitle}
                </p>
                <Button size="lg" className="bg-accent hover:bg-hon-green-dark text-accent-foreground font-semibold px-8" asChild>
                  <Link to={slides[current].ctaHref}>{slides[current].cta}</Link>
                </Button>
              </div>
            </div>
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <button onClick={prev} className="w-8 h-8 rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/40 flex items-center justify-center text-primary-foreground transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setPlaying(!playing)} className="w-8 h-8 rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/40 flex items-center justify-center text-primary-foreground transition-colors">
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
            <button onClick={next} className="w-8 h-8 rounded-full bg-primary-foreground/20 hover:bg-primary-foreground/40 flex items-center justify-center text-primary-foreground transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="flex gap-1.5 ml-2">
              {slides.map((_, i) => (
                <button key={i} onClick={() => setCurrent(i)} className={`h-1.5 rounded-full transition-all ${i === current ? "w-6 bg-accent" : "w-1.5 bg-primary-foreground/40"}`} />
              ))}
            </div>
          </div>
        </section>

        {/* === TAGLINE === */}
        <section className="py-10 bg-background border-b">
          <div className="container mx-auto px-4 text-center">
            <p className="text-xl lg:text-2xl font-bold text-accent">
              Unmatched Capabilities. Fresh Products that Matter. Trusted Partnership.
            </p>
          </div>
        </section>

        {/* === MARKETS === */}
        <section className="py-16 bg-section-light">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-3xl lg:text-4xl font-bold mb-3">Markets We Serve</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Trusted solutions across industries — from corporate offices to education and healthcare.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {markets.map((market) => (
                <Link key={market.label} to={market.href} className="group border border-border rounded-sm p-6 bg-background hover:border-accent hover:shadow-md transition-all">
                  <div className="w-10 h-1 bg-accent mb-4 group-hover:w-16 transition-all duration-300" />
                  <h3 className="font-bold text-base mb-2 group-hover:text-accent transition-colors">{market.label}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{market.description}</p>
                  <div className="flex items-center gap-1 mt-4 text-accent text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    Learn More <ArrowRight className="h-3 w-3" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* === OFFICE CATEGORIES === */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="flex items-end justify-between mb-10">
              <div>
                <h2 className="text-3xl lg:text-4xl font-bold mb-2">Office Furniture</h2>
                <p className="text-muted-foreground max-w-xl">
                  Explore our comprehensive 2025 WOODEX Collection — furniture solutions that optimize your space.
                </p>
              </div>
              <Button variant="outline" className="hidden md:flex border-accent text-accent hover:bg-accent hover:text-accent-foreground" asChild>
                <Link to="/shop">Browse All</Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {officeCategories.map((cat) => (
                <Link key={cat.label} to={cat.href} className="group block">
                  <div className="aspect-square overflow-hidden rounded-sm bg-muted mb-3">
                    <img src={cat.image} alt={cat.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <h3 className="font-semibold text-sm group-hover:text-accent transition-colors flex items-center gap-1">
                    {cat.label} <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* === HOME FURNITURE SECTION === */}
        <section className="py-16 bg-section-light border-t">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <div className="w-12 h-1 bg-accent mx-auto mb-5" />
              <h2 className="text-3xl lg:text-4xl font-bold mb-3">Home Furniture</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Extend the WOODEX quality beyond the office — premium furniture for every room in your home.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {homeCategories.map((cat) => (
                <Link key={cat.label} to={cat.href} className="group p-8 border border-border bg-background rounded-sm hover:border-accent hover:shadow-lg transition-all text-center">
                  <div className="w-12 h-1 bg-accent mx-auto mb-5 group-hover:w-20 transition-all duration-300" />
                  <h3 className="font-bold text-2xl mb-3 group-hover:text-accent transition-colors">{cat.label}</h3>
                  <p className="text-muted-foreground text-sm mb-4">{cat.description}</p>
                  <span className="text-accent text-sm font-semibold flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Shop Now <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* === MAKE YOUR SPACE WORK === */}
        <section className="py-0 bg-section-mid">
          <div className="grid lg:grid-cols-2 min-h-[400px]">
            <div className="relative overflow-hidden">
              <img src={proj1} alt="Office project" className="w-full h-full object-cover min-h-[300px]" />
            </div>
            <div className="flex items-center p-10 lg:p-16">
              <div>
                <div className="w-12 h-1 bg-accent mb-6" />
                <h2 className="text-3xl lg:text-4xl font-bold mb-4 leading-tight">Make Your Space Work</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  It's more than just an attitude. It's a commitment to our customers. At WOODEX, 
                  we know a thoughtfully designed workspace sets the stage for better work. That's why we're here.
                </p>
                <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                  <Link to="/about">Learn More</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* === BEFORE / AFTER === */}
        <section className="py-16 bg-background border-t">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <div className="w-12 h-1 bg-accent mx-auto mb-5" />
              <h2 className="text-3xl font-bold mb-3">Workspace Transformation</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">See how WOODEX transforms ordinary spaces into productive environments</p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="relative aspect-video rounded-sm overflow-hidden group">
                <img src={proj2} alt="Before transformation" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-primary/50 flex items-center justify-center">
                  <span className="bg-primary text-primary-foreground font-bold px-5 py-2 rounded-full text-sm">Before</span>
                </div>
              </div>
              <div className="relative aspect-video rounded-sm overflow-hidden group">
                <img src={proj3} alt="After transformation" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-accent/30 flex items-center justify-center">
                  <span className="bg-accent text-accent-foreground font-bold px-5 py-2 rounded-full text-sm">After WOODEX</span>
                </div>
              </div>
            </div>
            <div className="text-center mt-8">
              <Button variant="outline" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground" asChild>
                <Link to="/projects">View All Projects <ArrowRight className="h-4 w-4 ml-2" /></Link>
              </Button>
            </div>
          </div>
        </section>

        {/* === QUICKSHIP / FEATURED === */}
        <section className="py-16 bg-section-light border-t">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-8">
              <div className="relative overflow-hidden rounded-sm bg-primary text-primary-foreground p-8 lg:p-12">
                <div className="relative z-10">
                  <span className="text-xs font-bold uppercase tracking-widest text-accent mb-3 block">Quick Delivery</span>
                  <h3 className="text-2xl lg:text-3xl font-bold mb-3">Complete Office Solutions at the Speed You Need</h3>
                  <p className="text-primary-foreground/75 mb-6 text-sm leading-relaxed">
                    Fast-track your office setup with our ready-to-ship inventory and express delivery options.
                  </p>
                  <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                    <Link to="/room-packages">View Packages</Link>
                  </Button>
                </div>
                <div className="absolute -right-8 -bottom-8 w-48 h-48 rounded-full bg-accent/10" />
              </div>
              <div className="relative overflow-hidden rounded-sm bg-muted">
                <img src={proj2} alt="Virtual showroom" className="w-full h-full object-cover min-h-[280px]" />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-8">
                  <span className="text-xs font-bold uppercase tracking-widest text-accent mb-2 block">New</span>
                  <h3 className="text-white text-xl font-bold mb-3">Explore Our Virtual Showroom</h3>
                  <Button size="sm" className="bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                    <Link to="/virtual-showroom">Launch Showroom</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* === TESTIMONIALS === */}
        <section className="py-16 bg-background border-t">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <div className="w-12 h-1 bg-accent mx-auto mb-5" />
              <h2 className="text-3xl font-bold mb-3">What Our Clients Say</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">Trusted by 500+ companies across Pakistan</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <div key={t.name} className="p-6 border border-border rounded-sm hover:border-accent transition-colors">
                  <Quote className="h-8 w-8 text-accent/30 mb-4" />
                  <div className="flex gap-0.5 mb-3">
                    {Array(t.rating).fill(0).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-4 italic">"{t.text}"</p>
                  <p className="font-bold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* === STATS === */}
        <section className="py-16 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-2">By the Numbers</p>
              <h2 className="text-3xl font-bold">Pakistan's Trusted Furniture Partner</h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
              {[
                { number: "20+", label: "Years Experience" },
                { number: "500+", label: "Happy Clients" },
                { number: "50+", label: "Cities Served" },
                { number: "98%", label: "Satisfaction Rate" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="text-4xl lg:text-5xl font-black text-accent mb-2">{stat.number}</p>
                  <p className="text-primary-foreground/70 text-sm font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* === CTA === */}
        <section className="py-16 bg-background border-t">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Ready to Transform Your Workspace?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Get in touch with our experts for a free consultation and discover how WOODEX can elevate your office environment.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button size="lg" className="bg-accent hover:bg-hon-green-dark text-accent-foreground px-8" asChild>
                <Link to="/quotation">Request E-Quote</Link>
              </Button>
              <Button size="lg" variant="outline" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground px-8" asChild>
                <Link to="/virtual-showroom">Virtual Showroom</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
