import { Link } from "react-router-dom";
import { Lightbulb, Package, Truck, ClipboardCheck, Headphones, Ruler, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import slide1 from "@/assets/hero-slide-1.jpg";

const services = [
  {
    icon: Ruler,
    title: "Space Planning & Design",
    description: "Transform your office with expert space planning. Our design consultants analyze your workflow, team size, and growth plans to create optimal workspace layouts.",
    features: ["On-site consultation", "CAD floor plans", "Ergonomic assessments", "3D visualization", "Space optimization"],
  },
  {
    icon: Package,
    title: "Custom Manufacturing",
    description: "Bring your vision to life with our bespoke furniture service. We create custom pieces tailored to your exact specifications, brand identity, and space requirements.",
    features: ["Custom dimensions", "Material selection", "Color matching", "Logo integration", "Brand consistency"],
  },
  {
    icon: Truck,
    title: "Delivery & Installation",
    description: "Professional delivery and installation services ensure your furniture is set up correctly and ready to use. Our expert team handles everything from transportation to assembly.",
    features: ["Nationwide delivery", "Professional assembly", "Debris removal", "Quality inspection", "Warranty activation"],
  },
  {
    icon: ClipboardCheck,
    title: "Project Management",
    description: "Dedicated project managers oversee every aspect of your furniture project, from initial planning to final delivery, ensuring on-time and on-budget completion.",
    features: ["Single point of contact", "Timeline management", "Budget tracking", "Phased delivery", "Progress reporting"],
  },
  {
    icon: Headphones,
    title: "After-Sales Support",
    description: "Our commitment doesn't end at delivery. We provide comprehensive after-sales support including warranty service, repairs, and ongoing maintenance.",
    features: ["5-year warranty options", "Fast repair service", "Spare parts availability", "Annual maintenance plans", "Dedicated support line"],
  },
  {
    icon: Lightbulb,
    title: "Ergonomic Consulting",
    description: "Improve employee health and productivity with our certified ergonomic consulting service. We assess workstations and recommend evidence-based solutions.",
    features: ["Certified ergonomists", "Workstation assessments", "Product recommendations", "Employee training", "Health impact reports"],
  },
];

const steps = [
  { step: "01", title: "Consultation", description: "Discuss your needs and workspace vision with our experts" },
  { step: "02", title: "Design", description: "Create custom layouts and select furniture solutions" },
  { step: "03", title: "Production", description: "Precision manufacturing with rigorous quality control" },
  { step: "04", title: "Installation", description: "Professional delivery, assembly, and activation" },
];

const Services = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-72 overflow-hidden bg-primary">
          <img src={slide1} alt="Services" className="w-full h-full object-cover opacity-30" />
          <div className="absolute inset-0 flex items-center">
            <div className="container mx-auto px-4">
              <p className="text-accent text-xs font-bold uppercase tracking-widest mb-2">What We Offer</p>
              <h1 className="text-4xl lg:text-6xl font-black text-primary-foreground mb-3">Our Services</h1>
              <p className="text-primary-foreground/75 max-w-lg">
                Comprehensive office furniture solutions from design to delivery — end-to-end services 
                ensuring your workspace meets your exact needs.
              </p>
            </div>
          </div>
        </section>

        {/* Services Grid */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {services.map((service) => (
                <div key={service.title} className="group border border-border rounded-sm p-7 hover:border-accent hover:shadow-lg transition-all">
                  <div className="w-12 h-12 rounded-sm bg-hon-green-pale flex items-center justify-center mb-5 group-hover:bg-accent transition-colors">
                    <service.icon className="h-6 w-6 text-accent group-hover:text-accent-foreground transition-colors" />
                  </div>
                  <h3 className="font-bold text-xl mb-3 group-hover:text-accent transition-colors">{service.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-5">{service.description}</p>
                  <ul className="space-y-2">
                    {service.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Process Section */}
        <section className="py-16 bg-section-light border-t border-b">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <div className="w-12 h-1 bg-accent mx-auto mb-5" />
              <h2 className="text-3xl lg:text-4xl font-bold mb-3">How We Work</h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Our streamlined process ensures a smooth experience from initial consultation to final installation
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {steps.map((item, idx) => (
                <div key={item.step} className="text-center">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-accent text-accent-foreground font-black text-xl flex items-center justify-center mx-auto mb-4">
                      {item.step}
                    </div>
                    {idx < steps.length - 1 && (
                      <div className="hidden lg:block absolute top-8 left-[calc(50%+32px)] right-0 h-px bg-border" />
                    )}
                  </div>
                  <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-3">Ready to Get Started?</h2>
            <p className="text-primary-foreground/75 mb-7 max-w-md mx-auto">
              Contact our team today for a free consultation and discover how WOODEX can transform your workspace.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground px-8" asChild>
                <Link to="/quotation">Get Free Quote</Link>
              </Button>
              <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" asChild>
                <Link to="/contact">Contact Us</Link>
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
