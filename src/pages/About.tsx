import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Award, Target, Users, Globe, CheckCircle2, ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import factoryImg from "@/assets/about-factory.jpg";
import slide1 from "@/assets/hero-slide-1.jpg";

const stats = [
  { icon: Award, number: "20+", label: "Years Experience" },
  { icon: Users, number: "500+", label: "Happy Clients" },
  { icon: Globe, number: "50+", label: "Cities Served" },
  { icon: Target, number: "98%", label: "Satisfaction Rate" },
];

const values = [
  { title: "Quality First", description: "Every piece is crafted with premium materials and rigorous quality control processes." },
  { title: "Innovation Driven", description: "Continuously investing in design research and manufacturing technology." },
  { title: "Customer Focused", description: "Building long-term partnerships through exceptional service and support." },
  { title: "Sustainable Practices", description: "Committed to eco-friendly manufacturing and responsible sourcing." },
];

const team = [
  { name: "Ahmed Khan", role: "CEO & Founder" },
  { name: "Sara Ali", role: "Head of Design" },
  { name: "Usman Mirza", role: "Operations Director" },
  { name: "Fatima Raza", role: "Client Relations" },
];

const timeline = [
  { year: "2004", title: "Founded in Lahore", description: "WOODEX started as a small workshop crafting bespoke office desks for local businesses." },
  { year: "2010", title: "First Factory", description: "Opened our 20,000 sq ft manufacturing facility with CNC machinery and dedicated quality team." },
  { year: "2015", title: "Nationwide Expansion", description: "Expanded to Karachi and Islamabad showrooms, serving clients in 30+ cities across Pakistan." },
  { year: "2020", title: "500+ Clients Milestone", description: "Crossed 500 corporate clients including banks, hospitals, universities, and government offices." },
  { year: "2024", title: "Digital Platform Launch", description: "Launched the WOODEX digital platform with virtual showroom, E-Quotation, and online catalog." },
];

const certifications = [
  "ISO 9001:2015 Quality Management",
  "ISO 14001 Environmental Management",
  "BIFMA Certified Products",
  "FSC Certified Wood Sourcing",
  "Green Guard Indoor Air Quality",
  "Pakistan Standards (PSQCA) Certified",
];

const faqs = [
  { q: "Where is WOODEX based?", a: "WOODEX is headquartered in Lahore with showrooms in Karachi and Islamabad. Our 50,000 sq ft manufacturing facility is located in Lahore's industrial zone." },
  { q: "How long has WOODEX been in business?", a: "WOODEX was founded in 2004 and has over 20 years of experience in the office and home furniture industry in Pakistan." },
  { q: "Does WOODEX do custom manufacturing?", a: "Yes, custom manufacturing is one of our core services. We can create furniture to your exact specifications including dimensions, materials, colors, and finishes." },
  { q: "What warranty does WOODEX offer?", a: "We offer 3–10 year warranties depending on the product series. Our premium Woodex Series comes with a 10-year comprehensive warranty." },
  { q: "Can WOODEX handle large corporate orders?", a: "Absolutely. We regularly furnish entire office buildings, banks, hospitals, and government institutions. Our factory can produce 5,000+ units per month." },
];

const About = () => {
  const [activeTab, setActiveTab] = useState("story");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    document.title = "About WOODEX — Pakistan's Leading Office Furniture Manufacturer";
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative h-64 lg:h-80 overflow-hidden bg-primary">
          <img src={slide1} alt="About WOODEX" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 flex items-center">
            <div className="container mx-auto px-4">
              <p className="text-accent text-sm font-bold uppercase tracking-widest mb-2">Our Story</p>
              <h1 className="text-4xl lg:text-6xl font-black text-primary-foreground">About WOODEX</h1>
            </div>
          </div>
        </section>

        {/* Stats Bar */}
        <section className="bg-accent py-8">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center text-accent-foreground">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <p className="text-4xl font-black mb-1">{stat.number}</p>
                  <p className="text-sm font-medium opacity-85">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tab Navigation */}
        <section className="border-b bg-background sticky top-16 z-30">
          <div className="container mx-auto px-4">
            <div className="flex gap-6 overflow-x-auto">
              {["story", "values", "team", "manufacturing"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-4 text-sm font-semibold capitalize whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-accent text-accent"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "manufacturing" ? "Manufacturing" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Story */}
        {activeTab === "story" && (
          <section className="py-16">
            <div className="container mx-auto px-4">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div>
                  <div className="w-12 h-1 bg-accent mb-6" />
                  <h2 className="text-3xl lg:text-4xl font-bold mb-6">Pakistan's Leading Office Furniture Manufacturer</h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    For over two decades, WOODEX has been at the forefront of Pakistan's office furniture industry.
                    Founded with a vision to transform how Pakistani businesses approach workspace design, we have
                    grown from a small workshop in Lahore to a nationwide manufacturer serving hundreds of satisfied clients.
                  </p>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Our journey began with a simple belief: that well-designed workspaces drive better work.
                    This philosophy has guided every piece of furniture we've crafted, every client we've served,
                    and every innovation we've brought to the market.
                  </p>
                  <p className="text-muted-foreground leading-relaxed mb-8">
                    Today, WOODEX is proud to be the trusted furniture partner for corporations, government institutions,
                    educational facilities, and healthcare organizations across Pakistan.
                  </p>
                  <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                    <Link to="/contact">Get in Touch <ArrowRight className="h-4 w-4 ml-2" /></Link>
                  </Button>
                </div>
                <div className="rounded-sm overflow-hidden">
                  <img src={factoryImg} alt="WOODEX factory" className="w-full h-80 object-cover" />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Values */}
        {activeTab === "values" && (
          <section className="py-16">
            <div className="container mx-auto px-4">
              <div className="text-center mb-12">
                <div className="w-12 h-1 bg-accent mx-auto mb-6" />
                <h2 className="text-3xl font-bold mb-4">Our Core Values</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">The principles that guide everything we do at WOODEX</p>
              </div>
              <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                {values.map((v) => (
                  <div key={v.title} className="flex gap-4 p-6 border rounded-sm hover:border-accent transition-colors">
                    <CheckCircle2 className="h-6 w-6 text-accent flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-bold mb-2">{v.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{v.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Team */}
        {activeTab === "team" && (
          <section className="py-16">
            <div className="container mx-auto px-4">
              <div className="text-center mb-12">
                <div className="w-12 h-1 bg-accent mx-auto mb-6" />
                <h2 className="text-3xl font-bold mb-4">Leadership Team</h2>
                <p className="text-muted-foreground">Meet the people driving WOODEX's vision forward</p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
                {team.map((member) => (
                  <div key={member.name} className="text-center group">
                    <div className="w-24 h-24 rounded-full bg-section-mid mx-auto mb-4 flex items-center justify-center text-2xl font-bold text-accent border-2 border-border group-hover:border-accent transition-colors">
                      {member.name.charAt(0)}
                    </div>
                    <h3 className="font-bold mb-1">{member.name}</h3>
                    <p className="text-sm text-muted-foreground">{member.role}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Manufacturing */}
        {activeTab === "manufacturing" && (
          <section className="py-16">
            <div className="container mx-auto px-4">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div className="rounded-sm overflow-hidden">
                  <img src={factoryImg} alt="Manufacturing" className="w-full h-96 object-cover" />
                </div>
                <div>
                  <div className="w-12 h-1 bg-accent mb-6" />
                  <h2 className="text-3xl font-bold mb-6">State-of-the-Art Manufacturing</h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Our 50,000 sq ft manufacturing facility in Lahore is equipped with the latest CNC machinery,
                    precision cutting tools, and automated finishing lines to deliver consistent quality at scale.
                  </p>
                  <div className="space-y-3">
                    {["ISO 9001:2015 Certified Facility", "Advanced CNC and robotic manufacturing", "Rigorous quality control at every stage", "Eco-friendly paints and materials", "In-house upholstery and foam division", "Capacity: 5,000+ units per month"].map((item) => (
                      <div key={item} className="flex items-center gap-3 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                        <span className="text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Timeline */}
        <section className="py-16 bg-section-light border-t">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <div className="w-12 h-1 bg-accent mx-auto mb-6" />
              <h2 className="text-3xl font-bold mb-3">Our Journey</h2>
              <p className="text-muted-foreground">Two decades of furniture excellence in Pakistan</p>
            </div>
            <div className="max-w-3xl mx-auto relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
              <div className="space-y-10">
                {timeline.map((item) => (
                  <div key={item.year} className="relative flex gap-6 items-start">
                    <div className="relative z-10 w-12 h-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-black flex-shrink-0">
                      {item.year.slice(2)}
                    </div>
                    <div className="pt-1">
                      <span className="text-xs font-bold text-accent uppercase tracking-widest">{item.year}</span>
                      <h3 className="font-bold text-lg mb-1">{item.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Certifications */}
        <section className="py-14 bg-background border-t">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <div className="w-12 h-1 bg-accent mx-auto mb-5" />
              <h2 className="text-2xl font-bold mb-2">Certifications & Standards</h2>
              <p className="text-muted-foreground text-sm">Quality assurance you can trust</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-5xl mx-auto">
              {certifications.map((cert) => (
                <div key={cert} className="flex flex-col items-center text-center p-4 border rounded-sm hover:border-accent transition-colors">
                  <Award className="h-8 w-8 text-accent mb-3" />
                  <p className="text-xs font-medium text-muted-foreground leading-tight">{cert}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-14 bg-section-light border-t">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="text-center mb-10">
              <div className="w-12 h-1 bg-accent mx-auto mb-5" />
              <h2 className="text-2xl font-bold mb-2">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div key={i} className="border border-border rounded-sm overflow-hidden bg-background">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-section-light transition-colors"
                  >
                    <span className="font-semibold text-sm">{faq.q}</span>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 ml-4 ${openFaq === i ? "rotate-180" : ""}`} />
                  </button>
                  {openFaq === i && (
                    <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border bg-section-light">
                      <div className="pt-3">{faq.a}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-12 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center">
            <h3 className="text-2xl font-bold mb-3">Partner with WOODEX</h3>
            <p className="text-primary-foreground/75 mb-6">Let's create your perfect workspace together</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                <Link to="/quotation">Get a Quote</Link>
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

export default About;
