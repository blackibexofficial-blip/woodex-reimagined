import { useEffect } from "react";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useServices } from "@/lib/useServices";
import { site } from "@/config/site";

const serviceHighlights = [
  {
    title: "Space Planning & Design",
    slug: "space-planning-design",
    summary: "Plan a workplace around your people, floor plan and day-to-day needs.",
    features: ["2D space plans", "3D visualisation", "Ergonomic review"],
  },
  {
    title: "Factory Direct",
    slug: "custom-manufacturing",
    summary: "Source furniture directly from WOODEX manufacturing, with quality control close to production.",
    features: ["Direct manufacturer supply", "Factory quality checks", "Product warranty support"],
  },
  {
    title: "Delivery & Installation",
    slug: "delivery-installation",
    summary: "Get furniture delivered, assembled and checked at your site.",
    features: ["Delivery coordination", "On-site assembly", "Final walk-through"],
  },
  {
    title: "Project-Based Solutions",
    slug: "project-management",
    summary: "Coordinate furniture supply and installation for projects of every scale.",
    features: ["A clear project plan", "Dedicated coordination", "Progress updates"],
  },
  {
    title: "B2B Office Furniture",
    slug: "b2b-office-solutions",
    summary: "Equip offices and multi-site teams with one coordinated furniture partner.",
    features: ["Business-focused proposals", "Bulk order support", "Multi-site coordination"],
  },
];

const serviceReasons = [
  {
    title: "Factory-direct furniture",
    text: "Work directly with a furniture maker, from product selection through production and quality checks.",
  },
  {
    title: "Planned around your project",
    text: "Bring layout, furniture and delivery needs together in one practical plan for your workplace.",
  },
  {
    title: "Support beyond delivery",
    text: "Get help with installation, product care and after-sales support as your workspace takes shape.",
  },
];

const Services = () => {
  // Catalogue is admin-managed (/admin/services since P1.5); static bundle is the offline fallback.
  // Inactive services vanish from the hero and the highlight cards; detail pages redirect to /services.
  const { services } = useServices();
  const activeServices = services.filter((s) => s.active);

  useEffect(() => {
    document.title = "Office Furniture Services in Pakistan | WOODEX";
    const meta = document.querySelector('meta[name="description"]') || (() => {
      const element = document.createElement("meta");
      element.setAttribute("name", "description");
      document.head.appendChild(element);
      return element;
    })();
    meta.setAttribute(
      "content",
      "Explore WOODEX office furniture services in Pakistan: factory-direct supply, space planning, custom design, project coordination, and delivery and installation."
    );
  }, []);

  const whatsappHref = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent("Hi WOODEX, I would like to discuss an office furniture project.")}`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <section className="relative isolate overflow-hidden bg-primary text-primary-foreground">
          <img
            src={activeServices[0]?.hero}
            alt="WOODEX office furniture and workplace design services"
            className="absolute inset-0 -z-20 h-full w-full object-cover opacity-35"
            width={1536}
            height={1024}
          />
          <div className="absolute inset-0 -z-10 bg-primary/75" />
          <div className="container mx-auto px-4 py-20 md:py-28">
            <div className="max-w-3xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-accent">WOODEX Services</p>
              <h1 className="mb-5 text-4xl font-black leading-tight text-primary-foreground md:text-6xl">
                Office furniture solutions, from plan to installation
              </h1>
              <p className="mb-8 max-w-2xl text-base leading-relaxed text-primary-foreground/80 md:text-lg">
                Create a workplace that works for your team. WOODEX brings together space planning, custom furniture,
                factory-direct supply and project support for businesses across Pakistan.
              </p>
              <Button className="bg-accent px-7 text-accent-foreground hover:bg-accent/90" asChild>
                <Link to="/quotation">Get a Project Quote <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-20" aria-labelledby="services-heading">
          <div className="container mx-auto px-4">
            <div className="mb-10 max-w-2xl">
              <div className="mb-5 h-1 w-12 bg-accent" />
              <h2 id="services-heading" className="mb-4 text-3xl font-bold md:text-4xl">Services for every stage of your project</h2>
              <p className="text-muted-foreground leading-relaxed">
                Choose the support you need—from shaping your floor plan to furnishing a complete office. Each service
                connects to a dedicated page with more detail about the work.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {serviceHighlights.map((item, index) => {
                const service = activeServices.find((entry) => entry.slug === item.slug);
                if (!service) return null;

                return (
                  <article key={item.slug} className="group flex h-full flex-col overflow-hidden border border-border bg-background transition-colors hover:border-accent">
                    <Link to={`/services/${item.slug}`} className="block overflow-hidden" aria-label={`Learn more about ${item.title}`}>
                      <div className="aspect-[16/10] overflow-hidden">
                        <img
                          src={service.hero}
                          alt={`${item.title} by WOODEX`}
                          loading="lazy"
                          width={1536}
                          height={1024}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                    </Link>
                    <div className="flex flex-1 flex-col p-6">
                      <p className="mb-2 text-xs font-bold text-accent">0{index + 1}</p>
                      <h3 className="mb-2 text-xl font-bold">{item.title}</h3>
                      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{item.summary}</p>
                      <ul className="mb-6 space-y-2">
                        {item.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-sm">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <Link to={`/services/${item.slug}`} className="mt-auto inline-flex items-center gap-2 text-sm font-bold text-accent">
                        Explore service <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-y bg-section-light py-16 md:py-20" aria-labelledby="why-woodex-heading">
          <div className="container mx-auto px-4">
            <div className="mb-10 max-w-2xl">
              <div className="mb-5 h-1 w-12 bg-accent" />
              <h2 id="why-woodex-heading" className="mb-4 text-3xl font-bold md:text-4xl">A practical partner for your workplace</h2>
              <p className="text-muted-foreground leading-relaxed">
                WOODEX connects furniture manufacturing with the planning and on-site support needed to complete your project.
              </p>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              {serviceReasons.map((reason, index) => (
                <div key={reason.title} className="border-t-2 border-accent pt-5">
                  <p className="mb-3 text-sm font-bold text-accent">0{index + 1}</p>
                  <h3 className="mb-2 text-lg font-bold">{reason.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{reason.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-primary py-16 text-primary-foreground md:py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="mb-3 text-3xl font-bold md:text-4xl">Ready to plan your workplace?</h2>
            <p className="mx-auto mb-7 max-w-2xl text-primary-foreground/75">
              Tell us about your space, team and requirements. Our team can help you choose the right next step.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button className="bg-accent px-7 text-accent-foreground hover:bg-accent/90" asChild>
                <Link to="/quotation">Request a Quote</Link>
              </Button>
              <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" asChild>
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp WOODEX
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Services;