import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircle, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import heroImg from "@/assets/custom-design-hero.webp";
import shopImg from "@/assets/custom-design-shop.webp";
import floorplanImg from "@/assets/custom-design-floorplan.webp";
import tabletImg from "@/assets/custom-design-tablet.webp";
import { site } from "@/config/site";
import { useCustomDesignPage } from "@/lib/useCustomDesignPage";


const CustomDesign = () => {
  const { content } = useCustomDesignPage();

  useEffect(() => {
    document.title =
      "Custom Design Services — Bespoke Office Furniture Design Pakistan | WOODEX";
    const meta =
      document.querySelector('meta[name="description"]') ||
      (() => {
        const m = document.createElement("meta");
        m.setAttribute("name", "description");
        document.head.appendChild(m);
        return m;
      })();
    meta.setAttribute(
      "content",
      "Bespoke furniture design service in Lahore, Karachi & Islamabad. From 3D renders and 2D floor plans to custom office furniture and turnkey interior fit-outs — WOODEX brings your vision to life.",
    );

    // JSON-LD Service schema
    const id = "custom-design-jsonld";
    document.getElementById(id)?.remove();
    const ld = document.createElement("script");
    ld.id = id;
    ld.type = "application/ld+json";
    ld.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Service",
      name: "Custom Furniture Design Services",
      provider: { "@type": "Organization", name: "WOODEX", areaServed: "Pakistan" },
      serviceType: "Bespoke Furniture & Interior Design",
      description:
        "Concept-to-execution bespoke furniture design, 3D rendering, spatial planning and turnkey interior fit-outs across Pakistan.",
      areaServed: ["Lahore", "Karachi", "Islamabad", "Rawalpindi", "Faisalabad", "Multan"],
    });
    document.head.appendChild(ld);
  }, []);

  const waLink = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(
    "Hi WOODEX, I'd like to book a custom design consultation.",
  )}`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* HERO — dark, single chair, headline left */}
        <section className="relative bg-primary text-primary-foreground overflow-hidden">
          <img
            src={heroImg}
            alt="Bespoke green velvet armchair in WOODEX custom furniture design studio"
            className="absolute inset-0 w-full h-full object-cover opacity-70"
            width={1536}
            height={1024}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/85 to-transparent" />
          <div className="container mx-auto px-4 relative py-24 lg:py-32 max-w-6xl">
            <p className="text-accent text-[11px] font-bold uppercase tracking-[0.25em] mb-4">
              {content.hero.eyebrow}
            </p>
            <h1 className="text-4xl lg:text-6xl font-black leading-[1.05] mb-5 max-w-2xl">
              {content.hero.title.split("\n").map((line, i) => (
                <span key={i} className="block">{line}</span>
              ))}
            </h1>
            <p className="text-primary-foreground/80 max-w-lg leading-relaxed mb-7">
              {content.hero.subtitle}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground px-7" asChild>
                <Link to="/quotation">Get a Custom Quote <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button
                variant="outline"
                className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                asChild
              >
                <a href={waLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp Designer
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* VISUALIZE / DESIGN / SHOP */}
        <section className="py-20 bg-section-light border-b">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center max-w-6xl mx-auto">
              <div>
                <h2 className="text-3xl lg:text-5xl font-black mb-6 leading-[1.05]">
                  {content.wds.heading.split("\n").map((line, i) => (
                    <span key={i} className="block">{line}</span>
                  ))}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-5">
                  {content.wds.paragraph}
                </p>

                <h3 className="font-bold text-lg mt-8 mb-2">{content.wds.subheading}</h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  {content.wds.varietyOne}
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  {content.wds.varietyTwo}
                </p>
              </div>

              <div className="bg-background border border-border rounded-sm p-8 flex flex-col items-center">
                <img
                  src={shopImg}
                  alt="WDS interactive 3D office design tool on desktop"
                  className="w-full max-w-md h-auto"
                  width={1024}
                  height={1024}
                  loading="lazy"
                />
                <Button className="mt-2 bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                  <Link to="/virtual-showroom">
                    <ArrowRight className="mr-2 h-4 w-4 rotate-[-45deg]" /> Access WDS
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* MAKE YOUR SPACE WORK — 6 cards */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-14">
              <h2 className="text-3xl lg:text-5xl font-black mb-3">{content.spaces.heading}</h2>
              <div className="w-16 h-1 bg-accent mx-auto mb-5" />
              <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                {content.spaces.subheading}
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
              {content.spaces.items.map((s, i) => (
                <Link
                  key={s.id}
                  to={`/services/${s.slug}`}
                  className="group p-7 border border-border rounded-sm hover:border-accent hover:shadow-md transition-all bg-background"
                >
                  <span className="text-3xl font-black text-accent/80">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="font-bold text-lg mt-3 mb-2 group-hover:text-accent transition-colors">
                    {s.label}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.blurb}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-accent uppercase tracking-widest mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    Learn more <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CUSTOM OFFICE FURNITURE — split row with tablet */}
        <section className="py-20 bg-section-light border-y">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
              <div>
                <div className="w-12 h-1 bg-accent mb-5" />
                <h2 className="text-3xl lg:text-4xl font-bold mb-5 leading-tight">
                  {content.furniture.heading}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-5">
                  {content.furniture.paragraph}
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground mb-7">
                  {content.furniture.bullets.map((bullet, i) => (
                    <li key={i} className="flex gap-3"><span className="text-accent font-bold">→</span> {bullet}</li>
                  ))}
                </ul>
                <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                  <Link to="/contact">Book Meeting <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </div>
              <div>
                <img
                  src={tabletImg}
                  alt="WOODEX designer previewing custom office cabinet on tablet"
                  className="w-full h-auto rounded-sm shadow-xl"
                  width={1280}
                  height={1024}
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* DESIGN FIRST, BUILD ONCE — split row with floorplan */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
              <div>
                <div className="w-12 h-1 bg-accent mb-5" />
                <h2 className="text-3xl lg:text-4xl font-bold mb-5 leading-tight">
                  {content.designFirst.heading}
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  {content.designFirst.bodyOne}
                </p>
                <p className="text-muted-foreground leading-relaxed mb-7">
                  {content.designFirst.bodyTwo}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                    <Link to="/quotation">Request a Quote <ArrowRight className="ml-2 h-4 w-4" /></Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={waLink} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp Inquiry
                    </a>
                  </Button>
                </div>
              </div>
              <div>
                <img
                  src={floorplanImg}
                  alt="Isometric 3D rendered office floor plan by WOODEX"
                  className="w-full h-auto"
                  width={1280}
                  height={1024}
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="py-20 bg-section-light border-t">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-2">{content.testimonialsIntro.heading}</h2>
              <div className="w-12 h-1 bg-accent mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">
                {content.testimonialsIntro.subheading}
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {content.testimonials.map((t) => (
                <div
                  key={t.id}
                  className="p-6 bg-background border border-border rounded-sm hover:border-accent transition-colors"
                >
                  <div className="flex gap-0.5 mb-4">
                    {Array(5).fill(0).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground italic mb-5 leading-relaxed">"{t.text}"</p>
                  <p className="font-bold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* READY-TO-DESIGN CTA */}
        <section className="py-16 bg-background">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto bg-section-light border border-border rounded-sm p-10 lg:p-14 text-center">
              <h2 className="text-3xl lg:text-4xl font-bold mb-3">{content.finalCta.heading}</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {content.finalCta.paragraph}
              </p>
              <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground px-8" asChild>
                <Link to="/quotation">Get Custom Quote</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default CustomDesign;
