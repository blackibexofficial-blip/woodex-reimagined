import { useState } from "react";
import { Link } from "react-router-dom";
import { Award, Target, Users, Globe, CheckCircle2, ArrowRight } from "lucide-react";
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
  { name: "Ahmed Khan", role: "CEO & Founder", },
  { name: "Sara Ali", role: "Head of Design", },
  { name: "Usman Mirza", role: "Operations Director", },
  { name: "Fatima Raza", role: "Client Relations", },
];

const About = () => {
  const [activeTab, setActiveTab] = useState("story");

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
                <p className="text-muted-foreground max-w-xl mx-auto">
                  The principles that guide everything we do at WOODEX
                </p>
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
                    {[
                      "ISO 9001:2015 Certified Facility",
                      "Advanced CNC and robotic manufacturing",
                      "Rigorous quality control at every stage",
                      "Eco-friendly paints and materials",
                      "In-house upholstery and foam division",
                      "Capacity: 5,000+ units per month",
                    ].map((item) => (
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

        {/* CTA */}
        <section className="py-12 bg-section-light border-t">
          <div className="container mx-auto px-4 text-center">
            <h3 className="text-2xl font-bold mb-3">Partner with WOODEX</h3>
            <p className="text-muted-foreground mb-6">Let's create your perfect workspace together</p>
            <div className="flex flex-wrap gap-4 justify-center">
              <Button className="bg-accent hover:bg-hon-green-dark text-accent-foreground" asChild>
                <Link to="/quotation">Get a Quote</Link>
              </Button>
              <Button variant="outline" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground" asChild>
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
